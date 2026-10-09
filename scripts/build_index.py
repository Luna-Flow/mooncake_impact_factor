#!/usr/bin/env python3
"""Build the SQLite database of the web application from the registry index.

This script only moves data. The MoonBit command `cli build-index`
(`src/cli`, `src/metrics`, `src/score`) decides everything that affects a
score: which release is the latest, which dependencies are current, who
counts as a dependent, the 30-days-ago snapshot, the scores, ranks and
momentum labels. The script reads the local registry index, fetches the
download counts from mooncakes.io, keeps a short download history, runs the
command once for the whole registry and writes its report to SQLite.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Iterable


DEFAULT_INDEX_ROOT = Path.home() / ".moon" / "registry" / "index" / "user"
DEFAULT_DB_PATH = Path("data/mooncake.db")
DEFAULT_DOWNLOAD_CACHE_PATH = Path("data/download_cache.json")
DEFAULT_DOWNLOAD_HISTORY_PATH = Path("data/download_history.json")
MOONCAKES_MANIFEST_BASE = "https://mooncakes.io/api/v0/manifest/"
MOONBIT_CLI_JS_PATH = Path("_build/js/release/build/cli/cli.js")
# Download snapshots older than this are dropped from the history. The
# momentum compares with the snapshot closest to 30 days ago.
DOWNLOAD_HISTORY_KEEP_DAYS = 45


SCHEMA_SQL = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS index_meta;
DROP TABLE IF EXISTS search_index;
DROP TABLE IF EXISTS package_scores;
DROP TABLE IF EXISTS package_edges;
DROP TABLE IF EXISTS dependencies;
DROP TABLE IF EXISTS versions;
DROP TABLE IF EXISTS packages;

CREATE TABLE index_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE packages (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL UNIQUE,
  owner TEXT NOT NULL,
  package_name TEXT NOT NULL,
  description TEXT,
  repository TEXT,
  license TEXT,
  keywords_json TEXT NOT NULL DEFAULT '[]',
  latest_version TEXT,
  latest_created_at TEXT,
  version_count INTEGER NOT NULL DEFAULT 0,
  dependent_count INTEGER NOT NULL DEFAULT 0,
  external_dependent_count INTEGER NOT NULL DEFAULT 0,
  self_dependent_count INTEGER NOT NULL DEFAULT 0,
  dependent_owner_count INTEGER NOT NULL DEFAULT 0,
  recent_dependent_count INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0,
  download_count_30d_ago INTEGER,
  days_since_release INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE versions (
  id INTEGER PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  created_at TEXT,
  yanked INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 0,
  deps_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(package_id, version)
);

CREATE TABLE dependencies (
  version_id INTEGER NOT NULL REFERENCES versions(id) ON DELETE CASCADE,
  dependency_name TEXT NOT NULL,
  dependency_version_req TEXT,
  PRIMARY KEY (version_id, dependency_name)
);

CREATE TABLE package_edges (
  source_package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  target_package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  first_seen_at TEXT,
  same_owner INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (source_package_id, target_package_id)
);

CREATE TABLE package_scores (
  package_id INTEGER PRIMARY KEY REFERENCES packages(id) ON DELETE CASCADE,
  score REAL NOT NULL,
  score_30d_ago REAL NOT NULL,
  score_growth_30d REAL NOT NULL,
  score_growth_ratio_30d REAL NOT NULL,
  rank_label TEXT NOT NULL,
  rank_position INTEGER NOT NULL,
  momentum_label TEXT NOT NULL,
  activity_multiplier REAL NOT NULL,
  part_dependents REAL NOT NULL,
  part_recent_dependents REAL NOT NULL,
  part_downloads REAL NOT NULL,
  computed_at TEXT NOT NULL
);

CREATE VIRTUAL TABLE search_index USING fts5(
  full_name,
  owner,
  package_name,
  description,
  keywords,
  content=''
);
"""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--index-root", type=Path, default=DEFAULT_INDEX_ROOT)
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--downloads-json", type=Path, help="override download counts per package")
    parser.add_argument("--download-cache", type=Path, default=DEFAULT_DOWNLOAD_CACHE_PATH)
    parser.add_argument("--download-history", type=Path, default=DEFAULT_DOWNLOAD_HISTORY_PATH)
    parser.add_argument(
        "--refresh-downloads",
        action="store_true",
        help="fetch every download count again instead of reusing the cache",
    )
    parser.add_argument("--skip-mooncakes-downloads", action="store_true")
    parser.add_argument("--now", help="RFC 3339 timestamp to score at (default: current time)")
    return parser.parse_args()


def iter_index_records(index_root: Path) -> Iterable[dict]:
    for file_path in sorted(index_root.rglob("*.index")):
        with file_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if line:
                    yield json.loads(line)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def read_json(path: Path, default: object) -> object:
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: object) -> None:
    ensure_parent(path)
    path.write_text(json.dumps(payload, ensure_ascii=True, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def load_counts(path: Path | None) -> dict[str, int]:
    if path is None or not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {name: max(0, int(value)) for name, value in data.items()}


def to_release(record: dict) -> dict:
    """The fields of an index record that the MoonBit computation reads."""
    release = {
        "name": record["name"],
        "version": record["version"],
        "deps": sorted((record.get("deps") or {}).keys()),
        "yanked": bool(record.get("yanked")),
    }
    # An absent key is how the MoonBit JSON decoder reads `None`.
    if isinstance(record.get("created_at"), str):
        release["created_at"] = record["created_at"]
    return release


def fetch_single_download_count(full_name: str, timeout_seconds: float = 20.0) -> int | None:
    encoded_name = urllib.parse.quote(full_name, safe="/")
    request = urllib.request.Request(
        MOONCAKES_MANIFEST_BASE + encoded_name,
        headers={
            "User-Agent": "mooncake-impact-factor/0.2 (+https://mooncakes.io/)",
            "Accept": "application/json,*/*",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        body = response.read().decode(charset, errors="replace")
    downloads = json.loads(body).get("downloads")
    return None if downloads is None else max(0, int(downloads))


def render_progress(current: int, total: int, success_count: int, width: int = 32) -> None:
    if total <= 0:
        return
    filled = min(width, int(current / total * width))
    bar = "#" * filled + "-" * (width - filled)
    sys.stdout.write(f"\r[downloads] [{bar}] {current}/{total} success={success_count}")
    if current >= total:
        sys.stdout.write("\n")
    sys.stdout.flush()


def fetch_mooncakes_downloads(
    package_names: list[str],
    cache_path: Path,
    refresh: bool,
    max_workers: int = 8,
) -> dict[str, int]:
    """Download counts from mooncakes.io. Without `refresh`, cached counts
    are reused and only missing packages are fetched; a failed fetch falls
    back to the cached count."""
    cached = load_counts(cache_path)
    missing = package_names if refresh else [name for name in package_names if name not in cached]
    if cached and not refresh:
        print(f"[downloads] cache hit {len(package_names) - len(missing)} packages")
    fetched: dict[str, int] = {}
    if missing:
        print(f"[downloads] fetching {len(missing)} package manifests from mooncakes.io")
        executor = ThreadPoolExecutor(max_workers=max_workers)
        completed = 0
        try:
            future_map = {executor.submit(fetch_single_download_count, name): name for name in missing}
            for future in as_completed(future_map):
                try:
                    value = future.result()
                except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError):
                    value = None
                if value is not None:
                    fetched[future_map[future]] = value
                completed += 1
                render_progress(completed, len(missing), len(fetched))
                time.sleep(0.02)
        except KeyboardInterrupt:
            executor.shutdown(wait=False, cancel_futures=True)
            write_json(cache_path, {**cached, **fetched})
            print(f"\n[downloads] interrupted, saved partial cache")
            raise
        finally:
            executor.shutdown(wait=True, cancel_futures=True)
    merged = {**cached, **fetched}
    write_json(cache_path, merged)
    print(f"[downloads] fetched {len(fetched)}/{len(missing)}, have counts for {sum(1 for n in package_names if n in merged)}/{len(package_names)}")
    return merged


def update_download_history(path: Path, now: dt.datetime, downloads: dict[str, int], fresh: bool) -> list[dict]:
    """Append today's counts (when they were fetched now) and drop snapshots
    older than DOWNLOAD_HISTORY_KEEP_DAYS. One snapshot per day is kept."""
    history = read_json(path, [])
    if not isinstance(history, list):
        history = []
    cutoff = now - dt.timedelta(days=DOWNLOAD_HISTORY_KEEP_DAYS)
    kept = []
    for snapshot in history:
        try:
            taken_at = dt.datetime.fromisoformat(str(snapshot["taken_at"]).replace("Z", "+00:00"))
        except (KeyError, ValueError):
            continue
        if taken_at >= cutoff and taken_at.date() != now.date():
            kept.append({"taken_at": snapshot["taken_at"], "counts": snapshot.get("counts", {})})
    if fresh and downloads:
        kept.append({"taken_at": now.isoformat(), "counts": dict(sorted(downloads.items()))})
    kept.sort(key=lambda snapshot: snapshot["taken_at"])
    write_json(path, kept)
    return kept


def ensure_moonbit_cli() -> Path:
    cli_path = Path.cwd() / MOONBIT_CLI_JS_PATH
    subprocess.run(["moon", "build", "src/cli", "--target", "js", "--release"], check=True)
    if not cli_path.exists():
        raise RuntimeError(f"MoonBit CLI not found at {cli_path}")
    return cli_path


def run_moonbit_build_index(payload: dict) -> dict:
    cli_path = ensure_moonbit_cli()
    with tempfile.TemporaryDirectory() as tmp:
        input_path = Path(tmp) / "input.json"
        output_path = Path(tmp) / "report.json"
        input_path.write_text(json.dumps(payload, ensure_ascii=True), encoding="utf-8")
        completed = subprocess.run(
            ["node", os.fspath(cli_path), "build-index", "--input", os.fspath(input_path), "--output", os.fspath(output_path)],
            capture_output=True,
            text=True,
        )
        if completed.returncode != 0 or not output_path.exists():
            raise RuntimeError(f"cli build-index failed: {completed.stdout}{completed.stderr}")
        return json.loads(output_path.read_text(encoding="utf-8"))


def normalize_version_req(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=True, sort_keys=True)


def choose_metadata_record(records: list[dict], version: str | None) -> dict:
    """The index record of the version that MoonBit chose as latest."""
    for record in records:
        if record.get("version") == version:
            return record
    return records[-1]


def write_database(conn: sqlite3.Connection, package_rows: dict[str, list[dict]], report: dict) -> None:
    conn.executescript(SCHEMA_SQL)
    package_ids: dict[str, int] = {}
    for item in report["packages"]:
        records = package_rows[item["name"]]
        latest = choose_metadata_record(records, item.get("latest_version"))
        keywords = latest.get("keywords") or []
        if not isinstance(keywords, list):
            keywords = []
        cursor = conn.execute(
            """
            INSERT INTO packages (
              full_name, owner, package_name, description, repository, license, keywords_json,
              latest_version, latest_created_at, version_count,
              dependent_count, external_dependent_count, self_dependent_count, dependent_owner_count,
              recent_dependent_count, download_count, download_count_30d_ago, days_since_release
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                item["name"],
                item["owner"],
                item["package_name"],
                latest.get("description"),
                latest.get("repository"),
                latest.get("license"),
                json.dumps(keywords, ensure_ascii=True),
                item.get("latest_version"),
                item.get("latest_created_at"),
                item["version_count"],
                item["dependents"],
                item["external_dependents"],
                item["self_dependents"],
                item["dependent_owners"],
                item["recent_dependents"],
                item["downloads"],
                item.get("downloads_30d_ago"),
                item["days_since_release"],
            ),
        )
        package_id = int(cursor.lastrowid)
        package_ids[item["name"]] = package_id
        conn.execute(
            "INSERT INTO search_index (rowid, full_name, owner, package_name, description, keywords) VALUES (?, ?, ?, ?, ?, ?)",
            (package_id, item["name"], item["owner"], item["package_name"], latest.get("description") or "", " ".join(map(str, keywords))),
        )
        snapshot = item["snapshot"]
        breakdown = snapshot["breakdown"]
        conn.execute(
            """
            INSERT INTO package_scores (
              package_id, score, score_30d_ago, score_growth_30d, score_growth_ratio_30d,
              rank_label, rank_position, momentum_label, activity_multiplier,
              part_dependents, part_recent_dependents, part_downloads, computed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                package_id,
                snapshot["score"],
                snapshot["score_30d_ago"],
                snapshot["score_growth_30d"],
                snapshot["score_growth_ratio_30d"],
                snapshot["rank_label"],
                snapshot["rank_position"],
                snapshot["momentum_label"],
                snapshot["activity_multiplier"],
                breakdown["dependents"],
                breakdown["recent_dependents"],
                breakdown["downloads"],
                report["computed_at"],
            ),
        )
        # MoonBit orders the versions newest first; position 0 is the newest.
        position = {version: index for index, version in enumerate(item["versions"])}
        for record in records:
            version_id = conn.execute(
                "INSERT OR IGNORE INTO versions (package_id, version, created_at, yanked, position, deps_json) VALUES (?, ?, ?, ?, ?, ?)",
                (
                    package_id,
                    record["version"],
                    record.get("created_at"),
                    1 if record.get("yanked") else 0,
                    position.get(record["version"], len(position)),
                    json.dumps(record.get("deps") or {}, ensure_ascii=True, sort_keys=True),
                ),
            ).lastrowid
            for dependency_name, version_req in sorted((record.get("deps") or {}).items()):
                conn.execute(
                    "INSERT OR IGNORE INTO dependencies (version_id, dependency_name, dependency_version_req) VALUES (?, ?, ?)",
                    (version_id, dependency_name, normalize_version_req(version_req)),
                )
    for edge in report["edges"]:
        conn.execute(
            "INSERT INTO package_edges (source_package_id, target_package_id, first_seen_at, same_owner) VALUES (?, ?, ?, ?)",
            (package_ids[edge["source"]], package_ids[edge["target"]], edge.get("first_seen_at"), 1 if edge["same_owner"] else 0),
        )
    meta = {
        "computed_at": report["computed_at"],
        "population": str(report["population"]),
        "download_history_used": "true" if report["download_history_used"] else "false",
        "rank_counts": json.dumps(report["rank_counts"], sort_keys=True),
        "momentum_counts": json.dumps(report["momentum_counts"], sort_keys=True),
    }
    conn.executemany("INSERT INTO index_meta (key, value) VALUES (?, ?)", sorted(meta.items()))


def build_database(args: argparse.Namespace) -> None:
    now = dt.datetime.fromisoformat(args.now.replace("Z", "+00:00")) if args.now else dt.datetime.now(dt.timezone.utc)
    print(f"[build] reading package index from {args.index_root}")
    package_rows: dict[str, list[dict]] = {}
    for record in iter_index_records(args.index_root):
        package_rows.setdefault(record["name"], []).append(record)
    names = sorted(package_rows)
    print(f"[build] loaded {len(names)} packages from local index")

    fresh = not args.skip_mooncakes_downloads
    downloads = (
        fetch_mooncakes_downloads(names, args.download_cache, args.refresh_downloads)
        if fresh
        else load_counts(args.download_cache)
    )
    overrides = load_counts(args.downloads_json)
    if overrides:
        print(f"[downloads] applied {len(overrides)} override entries")
    downloads = {name: count for name, count in {**downloads, **overrides}.items() if name in package_rows}
    history = update_download_history(args.download_history, now, downloads, fresh and args.refresh_downloads)

    payload = {
        "now": now.isoformat(),
        "releases": [to_release(record) for name in names for record in package_rows[name]],
        "downloads": downloads,
        "download_history": history,
    }
    report = run_moonbit_build_index(payload)
    print(f"[build] scored {report['population']} packages, {len(report['edges'])} current dependency edges")

    ensure_parent(args.db)
    conn = sqlite3.connect(args.db)
    try:
        write_database(conn, package_rows, report)
        conn.commit()
    finally:
        conn.close()
    print(f"[build] wrote database to {args.db}")


def main() -> None:
    build_database(parse_args())


if __name__ == "__main__":
    main()
