#!/usr/bin/env python3

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import sqlite3
import sys
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
MOONCAKES_MANIFEST_BASE = "https://mooncakes.io/api/v0/manifest/"


SCHEMA_SQL = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS search_index;
DROP TABLE IF EXISTS package_scores;
DROP TABLE IF EXISTS package_edges;
DROP TABLE IF EXISTS dependencies;
DROP TABLE IF EXISTS versions;
DROP TABLE IF EXISTS packages;

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
  recent_dependent_count INTEGER NOT NULL DEFAULT 0,
  download_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE versions (
  id INTEGER PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  created_at TEXT,
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
  latest_version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL,
  PRIMARY KEY (source_package_id, target_package_id)
);

CREATE TABLE package_scores (
  package_id INTEGER PRIMARY KEY REFERENCES packages(id) ON DELETE CASCADE,
  score REAL NOT NULL,
  score_30d_ago REAL NOT NULL,
  score_growth_30d REAL NOT NULL,
  score_growth_ratio_30d REAL NOT NULL,
  rank_label TEXT NOT NULL,
  momentum_label TEXT NOT NULL,
  activity_multiplier REAL NOT NULL,
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
    parser.add_argument("--downloads-json", type=Path)
    parser.add_argument("--download-cache", type=Path, default=DEFAULT_DOWNLOAD_CACHE_PATH)
    parser.add_argument("--skip-mooncakes-downloads", action="store_true")
    return parser.parse_args()


def iter_index_records(index_root: Path) -> Iterable[dict]:
    for file_path in sorted(index_root.rglob("*.index")):
        with file_path.open("r", encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                yield json.loads(line)


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def split_name(full_name: str) -> tuple[str, str]:
    owner, package_name = full_name.split("/", 1)
    return owner, package_name


def choose_latest(records: list[dict]) -> dict:
    def key(record: dict) -> tuple[str, str]:
        return record.get("created_at") or "", record.get("version") or ""

    return max(records, key=key)


def load_downloads(path: Path | None) -> dict[str, int]:
    if path is None:
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {name: max(0, int(value)) for name, value in data.items()}


def load_download_cache(path: Path) -> dict[str, int]:
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {name: max(0, int(value)) for name, value in data.items()}


def save_download_cache(path: Path, downloads: dict[str, int]) -> None:
    ensure_parent(path)
    path.write_text(
        json.dumps(dict(sorted(downloads.items())), ensure_ascii=True, indent=2) + "\n",
        encoding="utf-8",
    )


def render_progress(current: int, total: int, success_count: int, width: int = 32) -> None:
    if total <= 0:
        return
    ratio = current / total
    filled = min(width, int(ratio * width))
    bar = "#" * filled + "-" * (width - filled)
    message = f"\r[downloads] [{bar}] {current}/{total} success={success_count}"
    sys.stdout.write(message)
    sys.stdout.flush()
    if current >= total:
        sys.stdout.write("\n")
        sys.stdout.flush()


def fetch_single_download_count(full_name: str, timeout_seconds: float = 20.0) -> int | None:
    encoded_name = urllib.parse.quote(full_name, safe="/")
    request = urllib.request.Request(
        MOONCAKES_MANIFEST_BASE + encoded_name,
        headers={
            "User-Agent": "mooncake-impact-factor/0.1 (+https://mooncakes.io/)",
            "Accept": "application/json,*/*",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        body = response.read().decode(charset, errors="replace")
    payload = json.loads(body)
    downloads = payload.get("downloads")
    if downloads is None:
        return None
    return max(0, int(downloads))


def fetch_mooncakes_downloads(
    package_names: list[str],
    cache_path: Path,
    max_workers: int = 8,
) -> dict[str, int]:
    cached = load_download_cache(cache_path)
    results = dict(cached)
    missing = [name for name in package_names if name not in results]
    if cached:
        print(f"[downloads] cache hit {len(cached)} packages")
    if not missing:
        return results

    fetched: dict[str, int] = {}
    print(f"[downloads] fetching {len(missing)} package manifests from mooncakes.io")
    completed = 0
    executor = ThreadPoolExecutor(max_workers=max_workers)
    try:
        future_map = {executor.submit(fetch_single_download_count, name): name for name in missing}
        for future in as_completed(future_map):
            name = future_map[future]
            try:
                value = future.result()
            except (urllib.error.URLError, TimeoutError, ValueError, json.JSONDecodeError):
                value = None
            if value is not None:
                fetched[name] = value
            completed += 1
            render_progress(completed, len(missing), len(fetched))
            time.sleep(0.02)
    except KeyboardInterrupt:
        merged = dict(cached)
        merged.update(fetched)
        save_download_cache(cache_path, merged)
        print(f"\n[downloads] interrupted, saved partial cache for {len(merged)} packages")
        executor.shutdown(wait=False, cancel_futures=True)
        raise
    finally:
        executor.shutdown(wait=True, cancel_futures=True)

    merged = dict(cached)
    merged.update(fetched)
    total = len(package_names)
    success_count = sum(1 for name in package_names if merged.get(name, 0) > 0)
    render_progress(total, total, success_count)
    save_download_cache(cache_path, merged)
    print(f"[downloads] fetched {len(fetched)}/{len(missing)} manifests, matched {success_count}/{total} local packages")
    return merged


def normalize_version_req(value: object) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=True, sort_keys=True)


def activity_multiplier(days_since_release: int) -> float:
    if days_since_release <= 30:
        return 1.12
    if days_since_release <= 90:
        return 1.06
    if days_since_release <= 180:
        return 1.0
    if days_since_release <= 365:
        return 0.94
    return 0.88


def compute_score(
    dependents: int,
    recent_dependents: int,
    downloads: int,
    days_since_release: int,
) -> tuple[float, float, str]:
    dep_signal = math.log1p(max(0, dependents)) * 38.0
    recent_dep_signal = math.log1p(max(0, recent_dependents)) * 27.0
    download_signal = math.log1p(max(0, downloads)) * 22.0
    multiplier = activity_multiplier(max(0, days_since_release))
    score = (dep_signal + recent_dep_signal + download_signal) * multiplier
    if score >= 260.0:
        rank = "S"
    elif score >= 180.0:
        rank = "A"
    elif score >= 110.0:
        rank = "B"
    elif score >= 50.0:
        rank = "C"
    else:
        rank = "D"
    return score, multiplier, rank


def parse_iso_datetime(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    return dt.datetime.fromisoformat(value)


def compute_momentum_label(score: float, score_30d_ago: float, growth_ratio: float, recent_dependents: int) -> str:
    growth_abs = score - score_30d_ago
    if growth_abs >= 35.0 and growth_ratio >= 0.35 and recent_dependents >= 3:
        return "Rising"
    if growth_abs >= 18.0 and growth_ratio >= 0.18 and recent_dependents >= 2:
        return "Hot"
    return "Stable"


def build_database(
    index_root: Path,
    db_path: Path,
    downloads_json: Path | None,
    download_cache_path: Path,
    skip_mooncakes_downloads: bool,
) -> None:
    ensure_parent(db_path)
    print(f"[build] reading package index from {index_root}")
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        conn.executescript(SCHEMA_SQL)

        package_rows: dict[str, list[dict]] = {}
        for record in iter_index_records(index_root):
            package_rows.setdefault(record["name"], []).append(record)
        print(f"[build] loaded {len(package_rows)} packages from local index")

        mooncakes_downloads = {} if skip_mooncakes_downloads else fetch_mooncakes_downloads(
            sorted(package_rows.keys()),
            download_cache_path,
        )
        override_downloads = load_downloads(downloads_json)
        downloads = dict(mooncakes_downloads)
        downloads.update(override_downloads)
        if override_downloads:
            print(f"[downloads] applied {len(override_downloads)} override entries")

        package_ids: dict[str, int] = {}
        version_meta: list[tuple[int, dict]] = []

        for full_name, records in sorted(package_rows.items()):
            latest = choose_latest(records)
            owner, package_name = split_name(full_name)
            conn.execute(
                """
                INSERT INTO packages (
                  full_name, owner, package_name, description, repository, license,
                  keywords_json, latest_version, latest_created_at, version_count, download_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(full_name) DO UPDATE SET
                  owner = excluded.owner,
                  package_name = excluded.package_name,
                  description = excluded.description,
                  repository = excluded.repository,
                  license = excluded.license,
                  keywords_json = excluded.keywords_json,
                  latest_version = excluded.latest_version,
                  latest_created_at = excluded.latest_created_at,
                  version_count = excluded.version_count,
                  download_count = excluded.download_count
                """,
                (
                    full_name,
                    owner,
                    package_name,
                    latest.get("description"),
                    latest.get("repository"),
                    latest.get("license"),
                    json.dumps(latest.get("keywords", []), ensure_ascii=True),
                    latest.get("version"),
                    latest.get("created_at"),
                    len(records),
                    downloads.get(full_name, 0),
                ),
            )
            package_id = conn.execute(
                "SELECT id FROM packages WHERE full_name = ?",
                (full_name,),
            ).fetchone()["id"]
            package_ids[full_name] = package_id

            conn.execute(
                """
                INSERT INTO search_index (rowid, full_name, owner, package_name, description, keywords)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    package_id,
                    full_name,
                    owner,
                    package_name,
                    latest.get("description", "") or "",
                    " ".join(latest.get("keywords", [])),
                ),
            )

            for record in records:
                version_meta.append((package_id, record))
        print(f"[build] inserted {len(package_ids)} packages and queued {len(version_meta)} versions")

        version_ids: dict[tuple[int, str], int] = {}
        for package_id, record in version_meta:
            version_id = conn.execute(
                """
                INSERT INTO versions (package_id, version, created_at, deps_json)
                VALUES (?, ?, ?, ?)
                """,
                (
                    package_id,
                    record["version"],
                    record.get("created_at"),
                    json.dumps(record.get("deps", {}), ensure_ascii=True),
                ),
            ).lastrowid
            version_ids[(package_id, record["version"])] = version_id
            for dependency_name, version_req in sorted(record.get("deps", {}).items()):
                conn.execute(
                    """
                    INSERT INTO dependencies (version_id, dependency_name, dependency_version_req)
                    VALUES (?, ?, ?)
                    """,
                    (version_id, dependency_name, normalize_version_req(version_req)),
                )
        print("[build] inserted version and dependency records")

        for package_id, record in version_meta:
            source_name = record["name"]
            version_id = version_ids[(package_id, record["version"])]
            for dependency_name in record.get("deps", {}):
                target_package_id = package_ids.get(dependency_name)
                if target_package_id is None or target_package_id == package_id:
                    continue
                conn.execute(
                    """
                    INSERT INTO package_edges (
                      source_package_id, target_package_id, first_seen_at, latest_version_id
                    ) VALUES (?, ?, ?, ?)
                    ON CONFLICT(source_package_id, target_package_id) DO UPDATE SET
                      first_seen_at = MIN(first_seen_at, excluded.first_seen_at),
                      latest_version_id = excluded.latest_version_id
                    """,
                    (
                        package_ids[source_name],
                        target_package_id,
                        record.get("created_at"),
                        version_id,
                    ),
                )
        print("[build] computed package-level dependency edges")

        recent_cutoff = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=180)).isoformat()
        now = dt.datetime.now(dt.timezone.utc)
        score_30d_cutoff = now - dt.timedelta(days=30)
        score_180d_cutoff = now - dt.timedelta(days=180)
        dependent_counts = {
            row["target_package_id"]: (row["dependent_count"], row["recent_dependent_count"])
            for row in conn.execute(
                """
                SELECT
                  target_package_id,
                  COUNT(*) AS dependent_count,
                  SUM(CASE WHEN first_seen_at >= ? THEN 1 ELSE 0 END) AS recent_dependent_count
                FROM package_edges
                GROUP BY target_package_id
                """,
                (recent_cutoff,),
            )
        }

        for row in conn.execute("SELECT id, latest_created_at, dependent_count, recent_dependent_count, download_count FROM packages"):
            latest_created_at = row["latest_created_at"]
            released_at = parse_iso_datetime(latest_created_at)
            days_since_release = max(0, (now - released_at).days) if released_at else 3650

            dependent_count, recent_dependent_count = dependent_counts.get(row["id"], (0, 0))
            conn.execute(
                """
                UPDATE packages
                SET dependent_count = ?, recent_dependent_count = ?
                WHERE id = ?
                """,
                (dependent_count, recent_dependent_count, row["id"]),
            )

            score, multiplier, rank = compute_score(
                dependents=dependent_count,
                recent_dependents=recent_dependent_count,
                downloads=row["download_count"],
                days_since_release=days_since_release,
            )
            historical = conn.execute(
                """
                SELECT
                  COUNT(*) AS dependents_30d_ago,
                  SUM(CASE WHEN first_seen_at >= ? AND first_seen_at <= ? THEN 1 ELSE 0 END) AS recent_dependents_30d_ago
                FROM package_edges
                WHERE target_package_id = ?
                  AND first_seen_at <= ?
                """,
                (
                    score_180d_cutoff.isoformat(),
                    score_30d_cutoff.isoformat(),
                    row["id"],
                    score_30d_cutoff.isoformat(),
                ),
            ).fetchone()
            released_30d_ago_days = max(0, (score_30d_cutoff - released_at).days) if released_at and released_at <= score_30d_cutoff else 3650
            score_30d_ago, _, _ = compute_score(
                dependents=historical["dependents_30d_ago"] or 0,
                recent_dependents=historical["recent_dependents_30d_ago"] or 0,
                downloads=row["download_count"],
                days_since_release=released_30d_ago_days,
            )
            score_growth_30d = score - score_30d_ago
            score_growth_ratio_30d = score_growth_30d / score_30d_ago if score_30d_ago > 0 else (1.0 if score_growth_30d > 0 else 0.0)
            momentum_label = compute_momentum_label(score, score_30d_ago, score_growth_ratio_30d, recent_dependent_count)
            conn.execute(
                """
                INSERT INTO package_scores (
                  package_id, score, score_30d_ago, score_growth_30d, score_growth_ratio_30d,
                  rank_label, momentum_label, activity_multiplier, computed_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    row["id"],
                    score,
                    score_30d_ago,
                    score_growth_30d,
                    score_growth_ratio_30d,
                    rank,
                    momentum_label,
                    multiplier,
                    now.isoformat(),
                ),
            )

        conn.commit()
        print(f"[build] wrote database to {db_path}")
    finally:
        conn.close()


def main() -> None:
    args = parse_args()
    build_database(
        args.index_root,
        args.db,
        args.downloads_json,
        args.download_cache,
        args.skip_mooncakes_downloads,
    )


if __name__ == "__main__":
    main()
