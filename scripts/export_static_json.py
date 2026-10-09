#!/usr/bin/env python3
"""Export the SQLite database as the JSON files of the static site.

public/data/
  manifest.json                 schema version, index metadata, feed sizes
  feeds/{top,rising,new}.json   the same lists as /api/feeds/<source>
  search/search-index.json      every package with the fields the static
                                search evaluates
  packages/<owner>--<name>.json the same payload as /api/packages/.../analysis
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import sqlite3
from pathlib import Path


DEFAULT_DB_PATH = Path("data/mooncake.db")
DEFAULT_OUTPUT_PATH = Path("public/data")
SCHEMA_VERSION = "2"

SUMMARY_COLUMNS = """
  p.full_name, p.owner, p.package_name, p.description, p.latest_version, p.latest_created_at,
  p.dependent_count, p.external_dependent_count, p.self_dependent_count, p.dependent_owner_count,
  p.recent_dependent_count, p.download_count, p.days_since_release,
  s.score, s.score_30d_ago, s.score_growth_30d, s.score_growth_ratio_30d,
  s.rank_label, s.rank_position, s.momentum_label
"""

SUMMARY_FIELDS = [
    "full_name", "owner", "package_name", "description", "latest_version", "latest_created_at",
    "dependent_count", "external_dependent_count", "self_dependent_count", "dependent_owner_count",
    "recent_dependent_count", "download_count", "days_since_release",
    "score", "score_30d_ago", "score_growth_30d", "score_growth_ratio_30d",
    "rank_label", "rank_position", "momentum_label",
]

FEEDS = {
    "top": "ORDER BY s.rank_position ASC, p.full_name ASC LIMIT 40",
    "rising": "WHERE s.momentum_label = 'Rising' ORDER BY s.score_growth_30d DESC, s.score DESC, p.full_name ASC LIMIT 40",
    "new": "WHERE s.momentum_label = 'New' ORDER BY s.score DESC, p.full_name ASC LIMIT 40",
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT_PATH)
    return parser.parse_args()


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")


def file_key(full_name: str) -> str:
    """`owner/name` becomes `owner--name`; nested names such as
    `owner/tree-sitter/cli` keep one flat file too."""
    return full_name.replace("/", "--")


def summary(row: sqlite3.Row) -> dict[str, object]:
    return {field: row[field] for field in SUMMARY_FIELDS}


def read_meta(conn: sqlite3.Connection) -> dict[str, object]:
    meta = dict(conn.execute("SELECT key, value FROM index_meta").fetchall())
    return {
        "computed_at": meta.get("computed_at", ""),
        "population": int(meta.get("population", "0")),
        "download_history_used": meta.get("download_history_used") == "true",
        "top_score": float(meta.get("top_score", "0")),
        "rank_counts": json.loads(meta.get("rank_counts", "{}")),
        "momentum_counts": json.loads(meta.get("momentum_counts", "{}")),
    }


def export_feeds(conn: sqlite3.Connection, out_dir: Path) -> dict[str, int]:
    counts: dict[str, int] = {}
    for name, tail in FEEDS.items():
        sql = f"SELECT {SUMMARY_COLUMNS} FROM packages p JOIN package_scores s ON s.package_id = p.id {tail}"
        items = [summary(row) for row in conn.execute(sql)]
        write_json(out_dir / "feeds" / f"{name}.json", {"items": items})
        counts[name] = len(items)
    return counts


def normalized(value: object) -> str:
    return str(value or "").strip().lower()


def export_search_index(conn: sqlite3.Connection, out_dir: Path) -> int:
    rows = conn.execute(
        f"""
        SELECT {SUMMARY_COLUMNS}, p.repository, p.license, p.keywords_json
        FROM packages p JOIN package_scores s ON s.package_id = p.id
        ORDER BY s.rank_position ASC, p.full_name ASC
        """
    ).fetchall()
    items = []
    for row in rows:
        keywords = [normalized(keyword) for keyword in json.loads(row["keywords_json"])]
        description = normalized(row["description"])
        items.append(
            {
                **summary(row),
                "repository_present": bool(normalized(row["repository"])),
                "license_present": bool(normalized(row["license"])),
                "normalized_full_text": " ".join(
                    part
                    for part in [
                        normalized(row["full_name"]),
                        normalized(row["owner"]),
                        normalized(row["package_name"]),
                        description,
                        " ".join(keywords),
                    ]
                    if part
                ),
                "normalized_owner": normalized(row["owner"]),
                "normalized_package": normalized(row["package_name"]),
                "normalized_description": description,
                "normalized_license": normalized(row["license"]),
                "normalized_repository": normalized(row["repository"]),
                "normalized_keywords": keywords,
            }
        )
    write_json(out_dir / "search" / "search-index.json", {"items": items})
    return len(items)


def export_package_details(conn: sqlite3.Connection, out_dir: Path) -> int:
    rows = conn.execute(
        f"""
        SELECT {SUMMARY_COLUMNS}, p.id, p.repository, p.license, p.version_count, p.keywords_json,
          p.download_count_30d_ago, s.activity_multiplier, s.part_dependents, s.part_recent_dependents, s.part_downloads
        FROM packages p JOIN package_scores s ON s.package_id = p.id
        """
    ).fetchall()
    by_name = {row["full_name"]: row for row in rows}
    for row in rows:
        versions = [
            {
                "version": version["version"],
                "created_at": version["created_at"],
                "yanked": bool(version["yanked"]),
                "deps": json.loads(version["deps_json"]),
            }
            for version in conn.execute(
                "SELECT version, created_at, yanked, deps_json FROM versions WHERE package_id = ? ORDER BY position ASC",
                (row["id"],),
            )
        ]
        dependents = [
            {
                "full_name": dependent["full_name"],
                "owner": dependent["owner"],
                "package_name": dependent["package_name"],
                "description": dependent["description"],
                "latest_version": dependent["latest_version"],
                "score": dependent["score"],
                "rank_label": dependent["rank_label"],
                "rank_position": dependent["rank_position"],
                "momentum_label": dependent["momentum_label"],
                "same_owner": bool(dependent["same_owner"]),
                "first_seen_at": dependent["first_seen_at"],
            }
            for dependent in conn.execute(
                """
                SELECT p.full_name, p.owner, p.package_name, p.description, p.latest_version,
                  s.score, s.rank_label, s.rank_position, s.momentum_label, e.same_owner, e.first_seen_at
                FROM package_edges e
                JOIN packages p ON p.id = e.source_package_id
                JOIN package_scores s ON s.package_id = p.id
                WHERE e.target_package_id = ?
                ORDER BY e.same_owner ASC, s.rank_position ASC, p.full_name ASC
                """,
                (row["id"],),
            )
        ]
        latest = next((version for version in versions if version["version"] == row["latest_version"]), None)
        dependencies = []
        for name, requirement in (latest["deps"] if latest and isinstance(latest["deps"], dict) else {}).items():
            target = by_name.get(name)
            dependencies.append(
                {
                    "full_name": name,
                    "version_req": requirement if isinstance(requirement, str) else None,
                    "in_registry": target is not None,
                    "description": target["description"] if target else None,
                    "score": target["score"] if target else None,
                    "rank_label": target["rank_label"] if target else None,
                    "rank_position": target["rank_position"] if target else None,
                }
            )
        dependencies.sort(key=lambda item: (item["rank_position"] is None, item["rank_position"] or 0, item["full_name"]))
        detail = {
            **summary(row),
            "repository": row["repository"],
            "license": row["license"],
            "version_count": row["version_count"],
            "download_count_30d_ago": row["download_count_30d_ago"],
            "activity_multiplier": row["activity_multiplier"],
            "breakdown": {
                "dependents": row["part_dependents"],
                "recent_dependents": row["part_recent_dependents"],
                "downloads": row["part_downloads"],
                "multiplier": row["activity_multiplier"],
            },
            "keywords": json.loads(row["keywords_json"]),
            "versions": versions,
        }
        write_json(
            out_dir / "packages" / f"{file_key(row['full_name'])}.json",
            {"detail": detail, "dependents": dependents, "dependencies": dependencies},
        )
    return len(rows)


def main() -> None:
    args = parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    try:
        feeds = export_feeds(conn, args.out)
        count = export_search_index(conn, args.out)
        export_package_details(conn, args.out)
        write_json(
            args.out / "manifest.json",
            {
                "schema_version": SCHEMA_VERSION,
                "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "package_count": count,
                "data_mode": "static",
                "meta": read_meta(conn),
                "feeds": feeds,
            },
        )
    finally:
        conn.close()
    print(f"[export] wrote {count} packages to {args.out}")


if __name__ == "__main__":
    main()
