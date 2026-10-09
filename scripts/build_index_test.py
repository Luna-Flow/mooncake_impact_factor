import argparse
import datetime as dt
import json
import sqlite3
import tempfile
import unittest
from pathlib import Path

from scripts.build_index import (
    DOWNLOAD_HISTORY_KEEP_DAYS,
    build_database,
    choose_metadata_record,
    to_release,
    update_download_history,
)


class ReleaseTests(unittest.TestCase):
    def test_to_release_keeps_only_dependency_names(self) -> None:
        record = {
            "name": "a/app",
            "version": "1.0.0",
            "created_at": "2026-01-01T00:00:00+00:00",
            "deps": {"b/lib": "0.1.0", "c/lib": {"path": "../c"}},
            "yanked": True,
            "description": "ignored",
        }
        self.assertEqual(
            to_release(record),
            {
                "name": "a/app",
                "version": "1.0.0",
                "created_at": "2026-01-01T00:00:00+00:00",
                "deps": ["b/lib", "c/lib"],
                "yanked": True,
            },
        )

    def test_to_release_omits_a_missing_date(self) -> None:
        self.assertNotIn("created_at", to_release({"name": "a/app", "version": "1.0.0", "created_at": None}))

    def test_choose_metadata_record_follows_the_chosen_version(self) -> None:
        records = [{"version": "1.0.0"}, {"version": "2.0.0"}]
        self.assertEqual(choose_metadata_record(records, "1.0.0"), {"version": "1.0.0"})
        self.assertEqual(choose_metadata_record(records, None), {"version": "2.0.0"})


class DownloadHistoryTests(unittest.TestCase):
    def test_history_keeps_recent_daily_snapshots(self) -> None:
        now = dt.datetime(2026, 10, 1, 12, tzinfo=dt.timezone.utc)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "history.json"
            old = (now - dt.timedelta(days=DOWNLOAD_HISTORY_KEEP_DAYS + 1)).isoformat()
            month = (now - dt.timedelta(days=30)).isoformat()
            today_earlier = (now - dt.timedelta(hours=1)).isoformat()
            path.write_text(
                json.dumps(
                    [
                        {"taken_at": old, "counts": {"a/lib": 1}},
                        {"taken_at": month, "counts": {"a/lib": 2}},
                        {"taken_at": today_earlier, "counts": {"a/lib": 3}},
                    ]
                )
            )
            kept = update_download_history(path, now, {"a/lib": 4}, fresh=True)
            self.assertEqual([snapshot["counts"]["a/lib"] for snapshot in kept], [2, 4])
            self.assertEqual(json.loads(path.read_text()), kept)

    def test_cached_counts_are_not_recorded(self) -> None:
        now = dt.datetime(2026, 10, 1, tzinfo=dt.timezone.utc)
        with tempfile.TemporaryDirectory() as tmp:
            kept = update_download_history(Path(tmp) / "history.json", now, {"a/lib": 4}, fresh=False)
            self.assertEqual(kept, [])


class BuildDatabaseTests(unittest.TestCase):
    """Runs the whole pipeline, including the MoonBit command, on a tiny index."""

    def test_build_database_writes_scores_and_current_edges(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            index = root / "index"
            (index / "a").mkdir(parents=True)
            (index / "b").mkdir(parents=True)
            (index / "a" / "lib.index").write_text(
                json.dumps({"name": "a/lib", "version": "1.0.0", "created_at": "2026-01-01T00:00:00+00:00", "description": "A library", "keywords": ["json"]})
                + "\n"
            )
            (index / "b" / "app.index").write_text(
                "\n".join(
                    json.dumps(record)
                    for record in [
                        {"name": "b/app", "version": "1.0.0", "created_at": "2026-02-01T00:00:00+00:00", "deps": {"a/lib": "1.0.0"}},
                        {"name": "b/app", "version": "1.1.0", "created_at": "2026-03-01T00:00:00+00:00", "deps": {"a/lib": "1.0.0"}},
                    ]
                )
                + "\n"
            )
            downloads = root / "downloads.json"
            downloads.write_text(json.dumps({"a/lib": 40, "b/app": 2}))
            db = root / "test.db"
            build_database(
                argparse.Namespace(
                    index_root=index,
                    db=db,
                    downloads_json=downloads,
                    download_cache=root / "cache.json",
                    download_history=root / "history.json",
                    refresh_downloads=False,
                    skip_mooncakes_downloads=True,
                    now="2026-10-01T00:00:00+00:00",
                )
            )
            conn = sqlite3.connect(db)
            try:
                rows = conn.execute(
                    """
                    SELECT p.full_name, p.external_dependent_count, p.description, s.rank_position, s.rank_label
                    FROM packages p JOIN package_scores s ON s.package_id = p.id
                    ORDER BY s.rank_position
                    """
                ).fetchall()
                self.assertEqual(rows[0][:3], ("a/lib", 1, "A library"))
                self.assertEqual([row[3] for row in rows], [1, 2])
                self.assertEqual(conn.execute("SELECT COUNT(*) FROM package_edges").fetchone()[0], 1)
                self.assertEqual(conn.execute("SELECT COUNT(*) FROM versions").fetchone()[0], 3)
                meta = dict(conn.execute("SELECT key, value FROM index_meta").fetchall())
                self.assertEqual(meta["population"], "2")
            finally:
                conn.close()


if __name__ == "__main__":
    unittest.main()
