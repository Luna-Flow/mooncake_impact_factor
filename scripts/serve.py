#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import sqlite3
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse


ROOT = Path(__file__).resolve().parent.parent
WEB_ROOT = ROOT / "web"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", type=Path, default=ROOT / "data" / "mooncake.db")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    return parser.parse_args()


def fetch_all(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> list[dict]:
    rows = conn.execute(sql, params).fetchall()
    return [dict(row) for row in rows]


def fetch_one(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> dict | None:
    row = conn.execute(sql, params).fetchone()
    return dict(row) if row else None


class Handler(BaseHTTPRequestHandler):
    db_path: Path

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/":
            self.serve_file(WEB_ROOT / "index.html", "text/html; charset=utf-8")
            return
        if path == "/app.css":
            self.serve_file(WEB_ROOT / "app.css", "text/css; charset=utf-8")
            return
        if path == "/app.js":
            self.serve_file(WEB_ROOT / "app.js", "application/javascript; charset=utf-8")
            return
        if path.startswith("/api/"):
            self.serve_api(path, parse_qs(parsed.query))
            return
        self.send_error(HTTPStatus.NOT_FOUND, "Not found")

    def serve_api(self, path: str, query: dict[str, list[str]]) -> None:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            if path == "/api/search":
                term = (query.get("q") or [""])[0].strip()
                limit = min(int((query.get("limit") or ["20"])[0]), 100)
                if term:
                    rows = fetch_all(
                        conn,
                        """
                        SELECT
                          p.full_name,
                          p.description,
                          p.latest_version,
                          p.dependent_count,
                          p.recent_dependent_count,
                          p.download_count,
                          s.score,
                          s.score_30d_ago,
                          s.score_growth_30d,
                          s.score_growth_ratio_30d,
                          s.rank_label,
                          s.momentum_label
                        FROM search_index si
                        JOIN packages p ON p.id = si.rowid
                        JOIN package_scores s ON s.package_id = p.id
                        WHERE search_index MATCH ?
                        ORDER BY s.score DESC
                        LIMIT ?
                        """,
                        (term.replace("/", " ") + "*", limit),
                    )
                else:
                    rows = fetch_all(
                        conn,
                        """
                        SELECT
                          p.full_name,
                          p.description,
                          p.latest_version,
                          p.dependent_count,
                          p.recent_dependent_count,
                          p.download_count,
                          s.score,
                          s.score_30d_ago,
                          s.score_growth_30d,
                          s.score_growth_ratio_30d,
                          s.rank_label,
                          s.momentum_label
                        FROM packages p
                        JOIN package_scores s ON s.package_id = p.id
                        ORDER BY s.score DESC
                        LIMIT ?
                        """,
                        (limit,),
                    )
                self.send_json({"items": rows})
                return

            if path == "/api/top":
                limit = min(int((query.get("limit") or ["50"])[0]), 200)
                rows = fetch_all(
                    conn,
                    """
                    SELECT
                      p.full_name,
                      p.description,
                      p.latest_version,
                      p.dependent_count,
                      p.recent_dependent_count,
                      p.download_count,
                      s.score,
                      s.score_30d_ago,
                      s.score_growth_30d,
                      s.score_growth_ratio_30d,
                      s.rank_label,
                      s.momentum_label
                    FROM packages p
                    JOIN package_scores s ON s.package_id = p.id
                    ORDER BY s.score DESC
                    LIMIT ?
                    """,
                    (limit,),
                )
                self.send_json({"items": rows})
                return

            if path.startswith("/api/packages/"):
                suffix = unquote(path[len("/api/packages/"):]).strip("/")
                if suffix.endswith("/dependents"):
                    package_name = suffix[: -len("/dependents")].rstrip("/")
                    row = fetch_one(conn, "SELECT id FROM packages WHERE full_name = ?", (package_name,))
                    if not row:
                        self.send_error(HTTPStatus.NOT_FOUND, "Package not found")
                        return
                    dependents = fetch_all(
                        conn,
                        """
                        SELECT
                          p.full_name,
                          p.description,
                          p.latest_version,
                          s.score,
                          s.rank_label,
                          s.momentum_label
                        FROM package_edges e
                        JOIN packages p ON p.id = e.source_package_id
                        JOIN package_scores s ON s.package_id = p.id
                        WHERE e.target_package_id = ?
                        ORDER BY s.score DESC, p.full_name ASC
                        """,
                        (row["id"],),
                    )
                    self.send_json({"items": dependents})
                    return

                package = fetch_one(
                    conn,
                    """
                    SELECT
                      p.*,
                      s.score,
                      s.rank_label,
                      s.score_30d_ago,
                      s.score_growth_30d,
                      s.score_growth_ratio_30d,
                      s.momentum_label,
                      s.activity_multiplier
                    FROM packages p
                    JOIN package_scores s ON s.package_id = p.id
                    WHERE p.full_name = ?
                    """,
                    (suffix,),
                )
                if not package:
                    self.send_error(HTTPStatus.NOT_FOUND, "Package not found")
                    return
                versions = fetch_all(
                    conn,
                    """
                    SELECT version, created_at, deps_json
                    FROM versions
                    WHERE package_id = ?
                    ORDER BY created_at DESC, version DESC
                    LIMIT 20
                    """,
                    (package["id"],),
                )
                package["keywords"] = json.loads(package["keywords_json"])
                package["versions"] = [
                    {
                        "version": row["version"],
                        "created_at": row["created_at"],
                        "deps": json.loads(row["deps_json"]),
                    }
                    for row in versions
                ]
                package.pop("keywords_json", None)
                self.send_json(package)
                return

            self.send_error(HTTPStatus.NOT_FOUND, "Unknown API")
        finally:
            conn.close()

    def serve_file(self, path: Path, content_type: str) -> None:
        if not path.exists():
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return
        data = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def send_json(self, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args) -> None:
        return


def main() -> None:
    args = parse_args()
    Handler.db_path = args.db
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    server.serve_forever()


if __name__ == "__main__":
    main()
