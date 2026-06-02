#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sqlite3
from pathlib import Path


DEFAULT_DB_PATH = Path("data/mooncake.db")
DEFAULT_OUTPUT_PATH = Path("public/data")
SCHEMA_VERSION = "1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=DEFAULT_DB_PATH)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUTPUT_PATH)
    return parser.parse_args()


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def write_json(path: Path, payload: object) -> None:
    ensure_parent(path)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def file_key(owner: str, package_name: str) -> str:
    return f"{owner}--{package_name}"


def package_summary_from_row(row: sqlite3.Row) -> dict[str, object]:
    return {
        "full_name": row["full_name"],
        "owner": row["owner"],
        "package_name": row["package_name"],
        "description": row["description"],
        "latest_version": row["latest_version"],
        "dependent_count": row["dependent_count"],
        "recent_dependent_count": row["recent_dependent_count"],
        "download_count": row["download_count"],
        "score": row["score"],
        "score_30d_ago": row["score_30d_ago"],
        "score_growth_30d": row["score_growth_30d"],
        "score_growth_ratio_30d": row["score_growth_ratio_30d"],
        "rank_label": row["rank_label"],
        "momentum_label": row["momentum_label"],
    }


def export_feeds(conn: sqlite3.Connection, out_dir: Path) -> dict[str, int]:
    feed_queries = {
        "top": """
            SELECT
              p.full_name, p.owner, p.package_name, p.description, p.latest_version,
              p.dependent_count, p.recent_dependent_count, p.download_count,
              s.score, s.score_30d_ago, s.score_growth_30d, s.score_growth_ratio_30d,
              s.rank_label, s.momentum_label
            FROM packages p
            JOIN package_scores s ON s.package_id = p.id
            ORDER BY s.score DESC, p.full_name ASC
            LIMIT 40
        """,
        "hot": """
            SELECT
              p.full_name, p.owner, p.package_name, p.description, p.latest_version,
              p.dependent_count, p.recent_dependent_count, p.download_count,
              s.score, s.score_30d_ago, s.score_growth_30d, s.score_growth_ratio_30d,
              s.rank_label, s.momentum_label
            FROM packages p
            JOIN package_scores s ON s.package_id = p.id
            WHERE s.momentum_label = 'Hot'
            ORDER BY s.score_growth_30d DESC, s.score DESC, p.full_name ASC
            LIMIT 24
        """,
        "rising": """
            SELECT
              p.full_name, p.owner, p.package_name, p.description, p.latest_version,
              p.dependent_count, p.recent_dependent_count, p.download_count,
              s.score, s.score_30d_ago, s.score_growth_30d, s.score_growth_ratio_30d,
              s.rank_label, s.momentum_label
            FROM packages p
            JOIN package_scores s ON s.package_id = p.id
            WHERE s.momentum_label = 'Rising'
            ORDER BY s.score_growth_30d DESC, s.score DESC, p.full_name ASC
            LIMIT 24
        """,
    }
    counts: dict[str, int] = {}
    for feed_name, sql in feed_queries.items():
        items = [package_summary_from_row(row) for row in conn.execute(sql)]
        write_json(out_dir / "feeds" / f"{feed_name}.json", {"items": items})
        counts[feed_name] = len(items)
    return counts


def export_search_index(conn: sqlite3.Connection, out_dir: Path) -> int:
    rows = conn.execute(
        """
        SELECT
          p.full_name, p.owner, p.package_name, p.description, p.repository, p.license,
          p.latest_version, p.latest_created_at, p.version_count,
          p.dependent_count, p.recent_dependent_count, p.download_count,
          p.keywords_json,
          s.score, s.score_30d_ago, s.score_growth_30d, s.score_growth_ratio_30d,
          s.rank_label, s.momentum_label, s.activity_multiplier
        FROM packages p
        JOIN package_scores s ON s.package_id = p.id
        ORDER BY p.full_name ASC
        """
    )
    packages: list[dict[str, object]] = []
    for row in rows:
        packages.append(
            {
                "full_name": row["full_name"],
                "owner": row["owner"],
                "package_name": row["package_name"],
                "description": row["description"],
                "repository": row["repository"],
                "license": row["license"],
                "latest_version": row["latest_version"],
                "latest_created_at": row["latest_created_at"],
                "version_count": row["version_count"],
                "dependent_count": row["dependent_count"],
                "recent_dependent_count": row["recent_dependent_count"],
                "download_count": row["download_count"],
                "score": row["score"],
                "score_30d_ago": row["score_30d_ago"],
                "score_growth_30d": row["score_growth_30d"],
                "score_growth_ratio_30d": row["score_growth_ratio_30d"],
                "rank_label": row["rank_label"],
                "momentum_label": row["momentum_label"],
                "activity_multiplier": row["activity_multiplier"],
                "keywords": json.loads(row["keywords_json"]),
            }
        )
    write_json(out_dir / "search" / "packages.json", {"items": packages})
    write_json(out_dir / "search" / "search-index.json", {"items": packages})
    return len(packages)


def export_package_details(conn: sqlite3.Connection, out_dir: Path) -> int:
    package_rows = conn.execute(
        """
        SELECT
          p.id, p.full_name, p.owner, p.package_name, p.description, p.repository, p.license,
          p.latest_version, p.latest_created_at, p.version_count,
          p.dependent_count, p.recent_dependent_count, p.download_count, p.keywords_json,
          s.score, s.score_30d_ago, s.score_growth_30d, s.score_growth_ratio_30d,
          s.rank_label, s.momentum_label, s.activity_multiplier
        FROM packages p
        JOIN package_scores s ON s.package_id = p.id
        ORDER BY p.full_name ASC
        """
    ).fetchall()
    count = 0
    for row in package_rows:
        package_id = row["id"]
        versions = [
            {
                "version": version_row["version"],
                "created_at": version_row["created_at"],
                "deps": json.loads(version_row["deps_json"]),
            }
            for version_row in conn.execute(
                """
                SELECT version, created_at, deps_json
                FROM versions
                WHERE package_id = ?
                ORDER BY created_at DESC, version DESC
                LIMIT 20
                """,
                (package_id,),
            )
        ]
        dependents = [
            {
                "full_name": dependent_row["full_name"],
                "owner": dependent_row["owner"],
                "package_name": dependent_row["package_name"],
                "description": dependent_row["description"],
                "latest_version": dependent_row["latest_version"],
                "score": dependent_row["score"],
                "rank_label": dependent_row["rank_label"],
                "momentum_label": dependent_row["momentum_label"],
            }
            for dependent_row in conn.execute(
                """
                SELECT
                  p.full_name, p.owner, p.package_name, p.description, p.latest_version,
                  s.score, s.rank_label, s.momentum_label
                FROM package_edges e
                JOIN packages p ON p.id = e.source_package_id
                JOIN package_scores s ON s.package_id = p.id
                WHERE e.target_package_id = ?
                ORDER BY s.score DESC, p.full_name ASC
                """,
                (package_id,),
            )
        ]
        payload = {
            "detail": {
                "full_name": row["full_name"],
                "owner": row["owner"],
                "package_name": row["package_name"],
                "description": row["description"],
                "repository": row["repository"],
                "license": row["license"],
                "latest_version": row["latest_version"],
                "latest_created_at": row["latest_created_at"],
                "version_count": row["version_count"],
                "dependent_count": row["dependent_count"],
                "recent_dependent_count": row["recent_dependent_count"],
                "download_count": row["download_count"],
                "score": row["score"],
                "score_30d_ago": row["score_30d_ago"],
                "score_growth_30d": row["score_growth_30d"],
                "score_growth_ratio_30d": row["score_growth_ratio_30d"],
                "rank_label": row["rank_label"],
                "momentum_label": row["momentum_label"],
                "activity_multiplier": row["activity_multiplier"],
                "keywords": json.loads(row["keywords_json"]),
                "versions": versions,
            },
            "dependents": dependents,
        }
        write_json(
            out_dir / "packages" / f"{file_key(row['owner'], row['package_name'])}.json",
            payload,
        )
        count += 1
    return count


def export_manifest(out_dir: Path, package_count: int, feed_counts: dict[str, int]) -> None:
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "generated_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "package_count": package_count,
        "data_mode": "static",
        "feeds": feed_counts,
    }
    write_json(out_dir / "manifest.json", manifest)


def main() -> None:
    args = parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(args.db)
    conn.row_factory = sqlite3.Row
    try:
        feed_counts = export_feeds(conn, args.out)
        package_count = export_search_index(conn, args.out)
        export_package_details(conn, args.out)
        export_manifest(args.out, package_count, feed_counts)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
