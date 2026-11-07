# -*- coding: utf-8 -*-
"""Tests for the 2026-11-08 archive self-heal and quality grading."""
import json
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from archive_daily import (  # noqa: E402
    BKK,
    assess_shift_hourly,
    heal_history,
    make_shift_document_v2,
    missing_shift_document,
    select_shift_hourly,
)
from history_analytics import WORKSHOPS, build_analytics  # noqa: E402

ALL_LINES = [line for lines in WORKSHOPS.values() for line in lines]


def day_points(date, value=100):
    return [
        {"d": date, "h": 800, "actual": 0, "plan": 0},
        {"d": date, "h": 1720, "actual": round(value * 0.8, 2), "plan": value},
        {"d": date, "h": 2020, "actual": value, "plan": round(value * 1.2, 2)},
    ]


def night_points(date, value=100):
    return [
        {"d": date, "h": 30, "actual": 0, "plan": 0},
        {"d": date, "h": 550, "actual": round(value * 0.8, 2), "plan": value},
        {"d": date, "h": 750, "actual": value, "plan": round(value * 1.2, 2)},
    ]


def day_source(date, value=100):
    return {
        "updatedAt": f"{date} 21:00:00",
        "hourlyFormat": "HHMM",
        "hourly": {line: day_points(date, value) for line in ALL_LINES},
    }


def night_source(date, value=100):
    """Source captured on the morning after ``date``."""
    next_date = (datetime.strptime(date, "%Y-%m-%d").date() + timedelta(days=1)).isoformat()
    return {
        "updatedAt": f"{next_date} 07:55:00",
        "hourlyFormat": "HHMM",
        "hourly": {line: night_points(date, value) for line in ALL_LINES},
    }


class ArchiveHardeningTests(unittest.TestCase):
    def test_gap_fill_writes_day_and_is_idempotent(self):
        production_date = "2026-10-20"
        with tempfile.TemporaryDirectory() as temporary:
            history = Path(temporary)
            (history / "shifts").mkdir()
            night = make_shift_document_v2(night_source(production_date), "night", production_date,
                                           "test", "2026-10-21 07:55:00")
            (history / "shifts" / f"{production_date}-night.json").write_text(
                json.dumps(night, ensure_ascii=False), encoding="utf-8")
            now = datetime(2026, 10, 20, 21, 30, tzinfo=BKK)
            report = heal_history(history, day_source(production_date), now, requested="day")
            self.assertIn(f"{production_date}-day", report["written"])
            path = history / "shifts" / f"{production_date}-day.json"
            self.assertTrue(path.exists())
            first = path.read_text(encoding="utf-8")
            document = json.loads(first)
            self.assertEqual(document["productionDate"], production_date)
            self.assertEqual(document["quality"]["mappedLines"], 39)
            self.assertIn(document["quality"]["status"], ("complete", "partial"))
            # A second run must not overwrite an immutable snapshot.
            heal_history(history, day_source(production_date, value=999), now, requested="day")
            self.assertEqual(path.read_text(encoding="utf-8"), first)

    def test_missing_placeholder_is_written_when_source_expired(self):
        production_date = "2026-10-20"
        with tempfile.TemporaryDirectory() as temporary:
            history = Path(temporary)
            (history / "shifts").mkdir()
            night = make_shift_document_v2(night_source(production_date), "night", production_date,
                                           "test", "2026-10-21 07:55:00")
            (history / "shifts" / f"{production_date}-night.json").write_text(
                json.dumps(night, ensure_ascii=False), encoding="utf-8")
            # Next evening: the day buckets are gone, only the night remains.
            expired = {
                "updatedAt": "2026-10-21 21:00:00",
                "hourlyFormat": "HHMM",
                "hourly": {line: [{"d": production_date, "h": 750, "actual": 100, "plan": 120}]
                           for line in ALL_LINES},
            }
            now = datetime(2026, 10, 21, 21, 30, tzinfo=BKK)
            report = heal_history(history, expired, now, requested="day")
            self.assertIn(f"{production_date}-day", report["missing"])
            document = json.loads((history / "shifts" / f"{production_date}-day.json").read_text(encoding="utf-8"))
            self.assertEqual(document["status"], "missing")
            self.assertEqual(document["quality"]["status"], "missing")
            self.assertEqual(document["quality"]["issues"][0]["code"], "sourceWindowExpired")

    def test_late_run_does_not_stamp_previous_day_as_today(self):
        # 00:30 snapshot still carries the previous day's buckets. The day
        # candidate must not be attributed to the new calendar date.
        source = day_source("2026-10-20")
        source["updatedAt"] = "2026-10-21 00:30:00"
        from archive_daily import discover_source_shifts
        documents = discover_source_shifts(source)
        self.assertEqual([doc["productionDate"] for doc in documents if doc["shift"] == "day"], [])

    def test_dirty_data_is_not_complete(self):
        production_date = "2026-10-20"
        hourly = {line: day_points(production_date) for line in ALL_LINES}
        # Cumulative actual falls on one line -> dirty.
        hourly["Final A line"] = [
            {"d": production_date, "h": 800, "actual": 0, "plan": 0},
            {"d": production_date, "h": 1720, "actual": 500, "plan": 600},
            {"d": production_date, "h": 2020, "actual": 400, "plan": 700},
        ]
        quality = assess_shift_hourly(hourly, "day", production_date, f"{production_date} 21:00:00")
        self.assertEqual(quality["status"], "partial")
        self.assertIn("actualRegression", [item["code"] for item in quality["issues"]])

        missing_end = {line: day_points(production_date) for line in ALL_LINES}
        for line in ALL_LINES:
            missing_end[line] = missing_end[line][:2]
        quality = assess_shift_hourly(missing_end, "day", production_date, f"{production_date} 19:00:00")
        self.assertEqual(quality["status"], "partial")
        self.assertFalse(quality["eligible"])

    def test_night_buckets_keep_start_date_ownership(self):
        production_date = "2026-10-20"
        document = make_shift_document_v2(night_source(production_date), "night", production_date,
                                          "test", "2026-10-21 07:55:00")
        self.assertEqual(document["productionDate"], production_date)
        self.assertEqual(document["quality"]["status"], "complete")
        for points in document["hourly"].values():
            self.assertTrue(all(point["d"] == production_date for point in points))

    def test_mismatched_bucket_dates_are_excluded_and_flagged(self):
        production_date = "2026-11-07"
        hourly = {
            "Final A line": [
                {"d": production_date, "h": 30, "actual": 100, "plan": 120},
                {"d": "2026-09-11", "h": 2030, "actual": 0, "plan": 0},
                {"d": "2026-09-11", "h": 2130, "actual": 343, "plan": 429},
            ]
        }
        selected, dropped, sanitized = select_shift_hourly(hourly, "night", production_date)
        self.assertEqual([point["h"] for point in selected["Final A line"]], [30])
        self.assertIn("2026-09-11", dropped)
        self.assertEqual(sanitized, 0)

    def test_analytics_health_marks_missing_and_invalid(self):
        with tempfile.TemporaryDirectory() as temporary:
            history = Path(temporary)
            (history / "shifts").mkdir()
            date = "2026-10-20"
            night = make_shift_document_v2(night_source(date), "night", date,
                                           "test", "2026-10-21 07:55:00")
            (history / "shifts" / f"{date}-night.json").write_text(
                json.dumps(night, ensure_ascii=False), encoding="utf-8")
            day_missing = missing_shift_document(date, "day", "2026-10-21 09:00:00", "test gap")
            (history / "shifts" / f"{date}-day.json").write_text(
                json.dumps(day_missing, ensure_ascii=False), encoding="utf-8")
            broken_date = "2026-10-21"
            broken = make_shift_document_v2(night_source(broken_date), "night", broken_date,
                                            "test", "2026-10-22 07:55:00")
            broken["productionDate"] = "2026-10-22"
            (history / "shifts" / f"{broken_date}-night.json").write_text(
                json.dumps(broken, ensure_ascii=False), encoding="utf-8")
            payload = build_analytics(history, generated_at="test")
            health = {item["date"]: item for item in payload["health"]["days"]}
            self.assertEqual(health[date]["day"]["status"], "missing")
            self.assertEqual(health[date]["night"]["status"], "complete")
            self.assertEqual(health[broken_date]["night"]["status"], "invalid")
            self.assertNotIn(broken_date, [day["date"] for day in payload["days"]])
            self.assertEqual(payload["quality"]["invalidArchives"], 1)


if __name__ == "__main__":
    unittest.main()
