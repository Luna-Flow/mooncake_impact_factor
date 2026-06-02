import datetime as dt
import unittest

from scripts.build_index import (
    choose_latest,
    compute_historical_snapshot_inputs,
    compute_history_window_bounds,
    parse_semver_key,
)


class BuildIndexVersionTests(unittest.TestCase):
    def test_parse_semver_key_prefers_release_over_prerelease(self) -> None:
        self.assertGreater(parse_semver_key("1.0.0"), parse_semver_key("1.0.0-rc1"))

    def test_choose_latest_uses_semver_when_created_at_matches(self) -> None:
        records = [
            {"created_at": "2024-01-01T00:00:00+00:00", "version": "1.9.0"},
            {"created_at": "2024-01-01T00:00:00+00:00", "version": "1.10.0"},
        ]

        self.assertEqual(choose_latest(records)["version"], "1.10.0")

    def test_choose_latest_orders_prerelease_identifiers(self) -> None:
        records = [
            {"created_at": "2024-01-01T00:00:00+00:00", "version": "0.0.2-a2"},
            {"created_at": "2024-01-01T00:00:00+00:00", "version": "0.0.2-a3"},
        ]

        self.assertEqual(choose_latest(records)["version"], "0.0.2-a3")

    def test_history_window_uses_trailing_180_days_from_30_days_ago(self) -> None:
        now = dt.datetime(2026, 6, 2, tzinfo=dt.timezone.utc)

        score_30d_cutoff, historical_recent_start, recent_cutoff = compute_history_window_bounds(now)

        self.assertEqual(score_30d_cutoff, dt.datetime(2026, 5, 3, tzinfo=dt.timezone.utc))
        self.assertEqual(historical_recent_start, dt.datetime(2025, 11, 4, tzinfo=dt.timezone.utc))
        self.assertEqual(recent_cutoff, dt.datetime(2025, 12, 4, tzinfo=dt.timezone.utc))

    def test_unreleased_package_has_zero_historical_baseline(self) -> None:
        now = dt.datetime(2026, 6, 2, tzinfo=dt.timezone.utc)
        released_at = dt.datetime(2026, 5, 20, tzinfo=dt.timezone.utc)

        historical_days, historical_downloads = compute_historical_snapshot_inputs(
            now=now,
            released_at=released_at,
        )

        self.assertEqual(historical_days, 0)
        self.assertEqual(historical_downloads, 0)

    def test_released_package_keeps_historical_age_but_zero_downloads(self) -> None:
        now = dt.datetime(2026, 6, 2, tzinfo=dt.timezone.utc)
        released_at = dt.datetime(2026, 1, 1, tzinfo=dt.timezone.utc)

        historical_days, historical_downloads = compute_historical_snapshot_inputs(
            now=now,
            released_at=released_at,
        )

        self.assertEqual(historical_days, 122)
        self.assertEqual(historical_downloads, 0)


if __name__ == "__main__":
    unittest.main()
