import json
import sys
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from history_analytics import BKK, FINISHED_PRODUCT_LINES, WORKSHOPS, aggregate_line, build_analytics, canonical_line, production_date_for_shift, source_date, summarize_shift_archives, summarize_snapshot, validate_analytics, write_analytics  # noqa: E402
from archive_daily import in_capture_window, make_shift_document, merge_boundary_hourly, source_is_at_boundary  # noqa: E402


class HistoryAnalyticsTests(unittest.TestCase):
    def test_bangkok_clock_does_not_require_external_timezone_data(self):
        self.assertEqual(BKK.utcoffset(None).total_seconds(), 7 * 60 * 60)

    def test_aliases_resolve_to_canonical_line(self):
        self.assertEqual(canonical_line("Inspection A"), "Inspection A line")
        self.assertEqual(canonical_line("Rotor B Line"), "Rotor B line")

    def test_day_and_night_windows_are_aggregated(self):
        result = aggregate_line([
            {"h": 550, "actual": 800, "plan": 1000},
            {"h": 750, "actual": 950, "plan": 1200},
            {"h": 800, "actual": 0, "plan": 0},
            {"h": 1720, "actual": 1600, "plan": 2000},
            {"h": 2020, "actual": 1850, "plan": 2300},
        ], "HHMM")
        self.assertEqual(result["day"]["normal"], 1600)
        self.assertEqual(result["day"]["overtime"], 250)
        self.assertEqual(result["day"]["attainment"], 80.0)
        self.assertEqual(result["night"]["normal"], 800)
        self.assertEqual(result["night"]["overtime"], 150)
        self.assertEqual(result["night"]["attainment"], 80.0)

    def test_build_keeps_partial_days_but_marks_them_ineligible(self):
        with tempfile.TemporaryDirectory() as temporary:
            history = Path(temporary)
            document = {
                "date": "2026-09-01",
                "updatedAt": "2026-09-01 17:10:00",
                "hourlyFormat": "HHMM",
                "hourly": {
                    "Motor AC": [
                        {"h": 800, "actual": 0, "plan": 0},
                        {"h": 1720, "actual": 80, "plan": 100},
                    ]
                },
            }
            (history / "2026-09-01.json").write_text(json.dumps(document), encoding="utf-8")
            payload = build_analytics(history, generated_at="test")
            self.assertEqual(payload["quality"]["archivedDays"], 1)
            self.assertEqual(payload["days"][0]["quality"]["dayStatus"], "partial")
            self.assertEqual(payload["days"][0]["quality"]["expectedLines"], 39)
            self.assertEqual(payload["days"][0]["lines"]["Motor AC"]["day"]["attainment"], 80.0)

    def test_writer_accepts_string_path_and_creates_static_index(self):
        with tempfile.TemporaryDirectory() as temporary:
            payload = write_analytics(temporary)
            output = Path(temporary) / "analytics.json"
            self.assertTrue(output.exists())
            self.assertEqual(payload["schemaVersion"], 2)

    def test_all_39_lines_and_end_of_shift_are_required_for_complete(self):
        points = [
            {"h": 750, "actual": 90, "plan": 100},
            {"h": 800, "actual": 0, "plan": 0},
            {"h": 1720, "actual": 80, "plan": 100},
            {"h": 2020, "actual": 95, "plan": 120},
        ]
        hourly = {line: points for lines in WORKSHOPS.values() for line in lines}
        day = summarize_snapshot({"date": "2026-09-01", "updatedAt": "2026-09-01 20:20:00", "hourlyFormat": "HHMM", "hourly": hourly})
        self.assertEqual(day["quality"]["mappedLines"], 39)
        self.assertEqual(day["quality"]["dayStatus"], "complete")
        self.assertEqual(day["quality"]["nightStatus"], "complete")
        self.assertEqual(validate_analytics({
            "finishedProductLines": FINISHED_PRODUCT_LINES,
            "days": [day],
        }), [])

    def test_workshop_finished_output_excludes_process_lines(self):
        final_points = [
            {"h": 800, "actual": 0, "plan": 0},
            {"h": 1720, "actual": 100, "plan": 120},
            {"h": 2020, "actual": 130, "plan": 150},
        ]
        process_points = [
            {"h": 800, "actual": 0, "plan": 0},
            {"h": 1720, "actual": 900, "plan": 1000},
            {"h": 2020, "actual": 950, "plan": 1100},
        ]
        day = summarize_snapshot({
            "date": "2026-09-01",
            "updatedAt": "2026-09-01 20:20:00",
            "hourlyFormat": "HHMM",
            "hourly": {
                "Final A line": final_points,
                "Rotor A line": process_points,
            },
        })
        self.assertEqual(day["workshops"]["Pro.2"]["day"]["total"], 1080)
        self.assertEqual(day["finishedProducts"]["Pro.2"]["day"]["total"], 130)
        self.assertEqual(day["finishedProducts"]["Pro.2"]["lineCount"], 1)

    def test_shift_archives_keep_day_and_night_boundaries_separate(self):
        production_date = "2026-09-05"
        day_points = [
            {"h": 800, "actual": 0, "plan": 0},
            {"h": 1720, "actual": 100, "plan": 120},
            {"h": 2020, "actual": 130, "plan": 150},
        ]
        night_points = [
            {"h": 30, "actual": 0, "plan": 0},
            {"h": 550, "actual": 80, "plan": 100},
            {"h": 750, "actual": 95, "plan": 120},
        ]
        all_lines = [line for lines in WORKSHOPS.values() for line in lines]
        day_document = {
            "schemaVersion": 2, "productionDate": production_date, "shift": "day",
            "capturedAt": "2026-09-05 20:25:00", "sourceUpdatedAt": "2026-09-05 20:24:00",
            "hourlyFormat": "HHMM", "hourly": {line: day_points for line in all_lines},
        }
        night_document = {
            "schemaVersion": 2, "productionDate": production_date, "shift": "night",
            "capturedAt": "2026-09-06 07:55:00", "sourceUpdatedAt": "2026-09-06 07:54:00",
            "hourlyFormat": "HHMM", "hourly": {line: night_points for line in all_lines},
        }
        summary = summarize_shift_archives(day_document, night_document, production_date)
        self.assertEqual(summary["quality"]["freshnessStatus"], "fresh")
        self.assertEqual(summary["quality"]["dayStatus"], "complete")
        self.assertEqual(summary["quality"]["nightStatus"], "complete")
        self.assertEqual(summary["workshops"]["Pro.2"]["day"]["total"], 13 * 130)
        self.assertEqual(summary["finishedProducts"]["Pro.2"]["day"]["total"], 4 * 130)
        self.assertEqual(summary["finishedProducts"]["Pro.2"]["night"]["total"], 4 * 95)
        self.assertEqual(validate_analytics({"finishedProductLines": FINISHED_PRODUCT_LINES, "days": [summary]}), [])
        merged = merge_boundary_hourly(day_document, night_document)["Final A line"]
        self.assertEqual([point["h"] for point in merged], [30, 550, 750, 800, 1720, 2020])

    def test_night_boundary_maps_to_previous_production_date(self):
        document = {"sourceUpdatedAt": "2026-09-06 07:54:00"}
        self.assertEqual(production_date_for_shift(document, "night"), "2026-09-05")

    def test_archive_only_accepts_exact_boundary_windows(self):
        self.assertTrue(in_capture_window(datetime(2026, 9, 5, 20, 20, tzinfo=BKK), "day"))
        self.assertTrue(in_capture_window(datetime(2026, 9, 6, 7, 55, tzinfo=BKK), "night"))
        self.assertFalse(in_capture_window(datetime(2026, 9, 5, 20, 10, tzinfo=BKK), "day"))
        self.assertFalse(in_capture_window(datetime(2026, 9, 6, 8, 0, tzinfo=BKK), "night"))
        self.assertTrue(source_is_at_boundary({"updatedAt": "2026-09-06 07:54:00"}, "night"))
        self.assertFalse(source_is_at_boundary({"updatedAt": "2026-09-06 01:22:00"}, "night"))

    def test_night_shift_document_is_complete_without_changing_production_date(self):
        points = [
            {"h": 30, "actual": 0, "plan": 0},
            {"h": 550, "actual": 80, "plan": 100},
            {"h": 750, "actual": 95, "plan": 120},
        ]
        source = {
            "updatedAt": "2026-09-06 07:54:00",
            "hourlyFormat": "HHMM",
            "hourly": {line: points for lines in WORKSHOPS.values() for line in lines},
        }
        document = make_shift_document(source, "night", datetime(2026, 9, 6, 7, 55, tzinfo=BKK))
        self.assertEqual(document["productionDate"], "2026-09-05")
        self.assertEqual(document["quality"]["status"], "complete")
        self.assertEqual(production_date_for_shift(document, "night"), "2026-09-05")

    def test_stale_source_is_retained_but_excluded_from_default_analysis(self):
        points = [
            {"h": 750, "actual": 90, "plan": 100},
            {"h": 800, "actual": 0, "plan": 0},
            {"h": 1720, "actual": 80, "plan": 100},
            {"h": 2020, "actual": 95, "plan": 120},
        ]
        hourly = {line: points for lines in WORKSHOPS.values() for line in lines}
        day = summarize_snapshot({
            "date": "2026-09-02",
            "updatedAt": "2026-09-01 21:59:00",
            "hourlyFormat": "HHMM",
            "hourly": hourly,
        })
        self.assertEqual(day["quality"]["freshnessStatus"], "stale")
        self.assertEqual(day["quality"]["dayStatus"], "partial")
        self.assertEqual(day["quality"]["nightStatus"], "partial")

    def test_snapshot_after_midnight_keeps_prior_production_date(self):
        document = {"date": "2026-09-06", "updatedAt": "2026-09-05 21:59:34"}
        self.assertEqual(source_date(document), "2026-09-05")

    def test_duplicate_next_calendar_day_is_excluded_from_index(self):
        with tempfile.TemporaryDirectory() as temporary:
            history = Path(temporary)
            document = {
                "date": "2026-09-06",
                "updatedAt": "2026-09-05 21:59:34",
                "hourlyFormat": "HHMM",
                "hourly": {"Final A line": [{"h": 800, "actual": 0, "plan": 0}, {"h": 1720, "actual": 10, "plan": 10}]},
            }
            (history / "2026-09-06.json").write_text(json.dumps(document), encoding="utf-8")
            payload = build_analytics(history, generated_at="test")
            self.assertEqual(payload["days"], [])


if __name__ == "__main__":
    unittest.main()
