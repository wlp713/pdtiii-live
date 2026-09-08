#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build a compact, static analytics index from archived PDTIII snapshots.

The browser reads ``history/analytics.json`` from GitHub Pages. It never writes
analytics data to Firebase and does not need to download every full daily file.
"""

from __future__ import annotations

import argparse
import json
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
BKK = timezone(timedelta(hours=7), name="Asia/Bangkok")
DAY_START = 8 * 60
DAY_NORMAL_END = 17 * 60 + 20
DAY_END = 20 * 60 + 20
NIGHT_NORMAL_END = 5 * 60 + 50
NIGHT_END = 7 * 60 + 50

WORKSHOPS = {
    "Pro.1": ["Motor AC", "Motor CL", "Motor WL", "Motor F-Series", "Motor H-Series", "Motor S-Series"],
    "Pro.2": [
        "Final A line", "Final B line", "Final C line", "Final D line",
        "Inspection A line", "Inspection B line", "Inspection C line", "Inspection D line",
        "Water Line", "Rotor A line", "Rotor B line", "Rotor C line", "Rotor D line",
    ],
    "Pro.3": ["Welding A line", "Welding B line", "Welding C line", "Welding D line", "Press C-Shaft"],
    "Pro.4": [
        "C-Shaft Body A", "C-Shaft Body B", "C-Shaft Pin A", "C-Shaft Pin C", "C-Shft Pin B",
        "Piston Grinding", "Rod Pispin", "Frame Honing FL", "Frame No.1", "Frame No.2",
        "Frame No.3", "Frame No.4", "Frame No.5",
    ],
    "Pro.5": ["Piston honing FL", "Cylinder Honing"],
}
EXPECTED_LINES = sum(len(lines) for lines in WORKSHOPS.values())

# 产出经营分析与归档汇总均使用成品口径；原始工序线仍保留在源快照中，
# 但不进入经营汇总，避免把中间工序重复计入成品产量。
FINISHED_PRODUCT_LINES = {
    "Pro.1": WORKSHOPS["Pro.1"],
    "Pro.2": ["Final A line", "Final B line", "Final C line", "Final D line"],
    "Pro.3": ["Welding A line", "Welding B line", "Welding C line", "Welding D line"],
    "Pro.4": WORKSHOPS["Pro.4"],
    "Pro.5": WORKSHOPS["Pro.5"],
}


def normalize_name(value: object) -> str:
    return re.sub(r"[\s.]+", "", str(value or "").lower())


CANONICAL_BY_NORMALIZED = {
    normalize_name(line): line
    for lines in WORKSHOPS.values()
    for line in lines
}
CANONICAL_BY_NORMALIZED.update({
    "inspectiona": "Inspection A line",
    "inspectionb": "Inspection B line",
    "inspectionc": "Inspection C line",
    "inspectiond": "Inspection D line",
})
WORKSHOP_BY_LINE = {
    line: workshop
    for workshop, lines in WORKSHOPS.items()
    for line in lines
}


def canonical_line(name: object) -> str | None:
    return CANONICAL_BY_NORMALIZED.get(normalize_name(name))


def hour_to_minute(value: object, old_format: bool) -> int | None:
    try:
        hour = int(float(value))
    except (TypeError, ValueError):
        return None
    if hour < 60:
        return hour * 60 if old_format else hour
    return (hour // 100) * 60 + hour % 100


def detect_old_format(points: list[dict], declared_format: str | None) -> bool:
    if declared_format == "hour":
        return True
    if declared_format == "HHMM":
        return False
    for point in points:
        try:
            value = float(point.get("h", -1))
        except (TypeError, ValueError):
            continue
        if 8 <= value <= 17 and value != 10:
            return True
    return False


def _number(value: object) -> float:
    try:
        number = float(value)
        return number if number == number else 0.0
    except (TypeError, ValueError):
        return 0.0


def aggregate_line(points: list[dict], declared_format: str | None = None) -> dict:
    old_format = detect_old_format(points, declared_format)
    normalized = []
    for point in points:
        minute = hour_to_minute(point.get("h"), old_format)
        if minute is None:
            continue
        normalized.append({
            "minute": minute,
            "actual": _number(point.get("actual")),
            "plan": _number(point.get("plan")),
        })
    normalized.sort(key=lambda item: item["minute"])

    day_points = [item for item in normalized if DAY_START <= item["minute"] <= DAY_END]
    night_points = [item for item in normalized if item["minute"] < DAY_START]

    day_normal = day_overtime = day_plan = 0.0
    last_day = None
    if day_points:
        day_cut = next((item for item in reversed(day_points) if item["minute"] <= DAY_NORMAL_END), None)
        day_normal = day_cut["actual"] if day_cut else 0.0
        day_overtime = max(0.0, day_points[-1]["actual"] - day_normal)
        day_plan = day_cut["plan"] if day_cut else 0.0
        last_day = day_points[-1]["minute"]

    night_normal = night_overtime = night_plan = 0.0
    last_night = None
    if night_points:
        night_cut = next((item for item in reversed(night_points) if item["minute"] <= NIGHT_NORMAL_END), None)
        night_normal = night_cut["actual"] if night_cut else 0.0
        night_overtime = max(0.0, night_points[-1]["actual"] - night_normal)
        night_plan = night_cut["plan"] if night_cut else 0.0
        last_night = night_points[-1]["minute"]

    return {
        "day": metric(day_normal, day_overtime, day_plan),
        "night": metric(night_normal, night_overtime, night_plan),
        "lastDayMinute": last_day,
        "lastNightMinute": last_night,
    }


def metric(normal: float, overtime: float, plan: float) -> dict:
    normal = round(normal, 2)
    overtime = round(overtime, 2)
    plan = round(plan, 2)
    return {
        "normal": normal,
        "overtime": overtime,
        "total": round(normal + overtime, 2),
        "plan": plan,
        "attainment": round(normal / plan * 100, 1) if plan > 0 else None,
    }


def sum_metrics(items: list[dict]) -> dict:
    return metric(
        sum(item.get("normal", 0) for item in items),
        sum(item.get("overtime", 0) for item in items),
        sum(item.get("plan", 0) for item in items),
    )


def source_date(document: dict) -> str | None:
    """Return the production date represented by a snapshot.

    The archive job may run after midnight, but the prior night shift still
    belongs to the previous production date.
    """
    updated_at = str(document.get("updatedAt") or document.get("sourceUpdatedAt") or "")
    match = re.match(r"^(\d{4}-\d{2}-\d{2})(?:\s|T)", updated_at)
    return match.group(1) if match else None


def production_date_for_shift(document: dict, shift: str) -> str | None:
    """Map a boundary snapshot to the production date it represents.

    A night boundary is captured after midnight, but belongs to the night
    shift that started on the previous production date.
    """
    source = source_date(document)
    if not source:
        return None
    if shift == "night":
        return (datetime.strptime(source, "%Y-%m-%d").date() - timedelta(days=1)).isoformat()
    return source


def _coverage_status(mapped: int, covered: int, fresh: bool) -> str:
    if not fresh:
        return "partial"
    if mapped >= EXPECTED_LINES and covered >= EXPECTED_LINES:
        return "complete"
    if mapped >= 34 and covered >= 34:
        return "comparable"
    return "partial"


def _scope_records(lines: dict) -> tuple[dict, dict]:
    """Build process-line and finished-product workshop scopes from lines."""
    workshops = {}
    for workshop, expected in WORKSHOPS.items():
        records = [lines[name] for name in expected if name in lines]
        workshops[workshop] = {
            "lineCount": len(records),
            "day": sum_metrics([item["day"] for item in records]),
            "night": sum_metrics([item["night"] for item in records]),
        }
    finished_products = {}
    for workshop, expected in FINISHED_PRODUCT_LINES.items():
        records = [lines[name] for name in expected if name in lines]
        finished_products[workshop] = {
            "lineCount": len(records),
            "day": sum_metrics([item["day"] for item in records]),
            "night": sum_metrics([item["night"] for item in records]),
        }
    return workshops, finished_products


def summarize_shift_archives(day_document: dict | None, night_document: dict | None, production_date: str) -> dict:
    """Combine two boundary snapshots without mixing their time windows."""
    day_summary = summarize_snapshot(day_document) if day_document else None
    night_summary = summarize_snapshot(night_document) if night_document else None
    day_lines = (day_summary or {}).get("lines") or {}
    night_lines = (night_summary or {}).get("lines") or {}
    line_names = set(day_lines) | set(night_lines)
    lines = {}
    for name in sorted(line_names):
        source = day_lines.get(name) or night_lines.get(name)
        lines[name] = {
            "workshop": source["workshop"],
            "day": (day_lines.get(name) or {}).get("day", metric(0, 0, 0)),
            "night": (night_lines.get(name) or {}).get("night", metric(0, 0, 0)),
        }

    day_source = source_date(day_document or {})
    night_source = source_date(night_document or {})
    expected_night_source = None
    if production_date:
        expected_night_source = (datetime.strptime(production_date, "%Y-%m-%d").date() + timedelta(days=1)).isoformat()
    day_fresh = bool(day_document and day_source == production_date)
    night_fresh = bool(night_document and night_source == expected_night_source)
    day_quality = (day_summary or {}).get("quality") or {}
    night_quality = (night_summary or {}).get("quality") or {}
    day_mapped = int(day_quality.get("mappedLines") or 0)
    night_mapped = int(night_quality.get("mappedLines") or 0)
    day_covered = int(day_quality.get("dayCoveredLines") or 0)
    night_covered = int(night_quality.get("nightCoveredLines") or 0)
    unknown = sorted(set((day_quality.get("unknownLines") or []) + (night_quality.get("unknownLines") or [])))
    day_status = _coverage_status(day_mapped, day_covered, day_fresh)
    night_status = _coverage_status(night_mapped, night_covered, night_fresh)
    if day_fresh and night_fresh:
        freshness = "fresh"
    elif day_document or night_document:
        # One boundary may have arrived while the other is still pending. That
        # is incomplete, not automatically stale; stale is reserved for a
        # boundary whose source date contradicts the production-date contract.
        contradictory = (
            (day_document and day_source and day_source != production_date)
            or (night_document and night_source and night_source != expected_night_source)
        )
        freshness = "stale" if contradictory else "partial"
    else:
        freshness = "unknown"
    workshops, finished_products = _scope_records(lines)
    quality = {
        "archiveVersion": 2,
        "archiveMode": "shift-boundary",
        "mappedLines": len(lines),
        "expectedLines": EXPECTED_LINES,
        "unknownLines": unknown,
        "dayMappedLines": day_mapped,
        "nightMappedLines": night_mapped,
        "dayCoveredLines": day_covered,
        "nightCoveredLines": night_covered,
        "dayStatus": day_status,
        "nightStatus": night_status,
        "sourceDate": day_source or night_source,
        "daySourceDate": day_source,
        "nightSourceDate": night_source,
        "expectedNightSourceDate": expected_night_source,
        "freshnessStatus": freshness,
    }
    return {
        "date": production_date,
        "snapshotAt": (day_document or night_document or {}).get("capturedAt") or (day_document or night_document or {}).get("snapAt"),
        "updatedAt": (day_document or {}).get("sourceUpdatedAt") or (day_document or {}).get("updatedAt"),
        "quality": quality,
        "archive": {
            "day": {"capturedAt": (day_document or {}).get("capturedAt"), "sourceUpdatedAt": day_source},
            "night": {"capturedAt": (night_document or {}).get("capturedAt"), "sourceUpdatedAt": night_source},
        },
        # Top-level totals are the business-facing finished-product totals.
        # Process-line totals remain available under ``workshops`` for audit.
        "totals": {
            "day": sum_metrics([item["day"] for item in finished_products.values()]),
            "night": sum_metrics([item["night"] for item in finished_products.values()]),
        },
        "workshops": workshops,
        "finishedProducts": finished_products,
        "lines": lines,
    }


def summarize_snapshot(document: dict) -> dict:
    hourly = document.get("hourly") or {}
    declared_format = document.get("hourlyFormat")
    canonical_points: dict[str, list[dict]] = {}
    unknown_lines = []
    for raw_name, points in hourly.items():
        canonical = canonical_line(raw_name)
        if not canonical:
            unknown_lines.append(str(raw_name))
            continue
        if not isinstance(points, list):
            if isinstance(points, dict):
                points = [value for _, value in sorted(points.items(), key=lambda pair: int(pair[0]))]
            else:
                continue
        # If two aliases resolve to one line, retain the more complete series.
        if canonical not in canonical_points or len(points) > len(canonical_points[canonical]):
            canonical_points[canonical] = points

    lines = {
        name: {
            "workshop": WORKSHOP_BY_LINE[name],
            **aggregate_line(points, declared_format),
        }
        for name, points in canonical_points.items()
    }
    workshops = {}
    for workshop, expected in WORKSHOPS.items():
        workshop_lines = [lines[name] for name in expected if name in lines]
        workshops[workshop] = {
            "lineCount": len(workshop_lines),
            "day": sum_metrics([item["day"] for item in workshop_lines]),
            "night": sum_metrics([item["night"] for item in workshop_lines]),
        }

    finished_products = {}
    for workshop, expected in FINISHED_PRODUCT_LINES.items():
        finished_lines = [lines[name] for name in expected if name in lines]
        finished_products[workshop] = {
            "lineCount": len(finished_lines),
            "day": sum_metrics([item["day"] for item in finished_lines]),
            "night": sum_metrics([item["night"] for item in finished_lines]),
        }

    mapped_count = len(lines)
    day_covered = sum(1 for item in lines.values() if (item["lastDayMinute"] or -1) >= DAY_END - 10)
    night_covered = sum(1 for item in lines.values() if (item["lastNightMinute"] or -1) >= NIGHT_END - 10)
    archive_date = str(document.get("date") or "")
    updated_at = str(document.get("updatedAt") or "")
    source_day = source_date(document)
    freshness_status = "fresh" if source_day == archive_date else ("stale" if source_day else "unknown")

    def coverage_status(covered: int) -> str:
        if freshness_status == "stale":
            return "partial"
        if mapped_count >= EXPECTED_LINES and covered >= EXPECTED_LINES:
            return "complete"
        if mapped_count >= 34 and covered >= 34:
            return "comparable"
        return "partial"

    day_status = coverage_status(day_covered)
    night_status = coverage_status(night_covered)
    quality = {
        "mappedLines": mapped_count,
        "expectedLines": EXPECTED_LINES,
        "unknownLines": sorted(unknown_lines),
        "dayCoveredLines": day_covered,
        "nightCoveredLines": night_covered,
        "dayStatus": day_status,
        "nightStatus": night_status,
        "sourceDate": source_day,
        "freshnessStatus": freshness_status,
    }
    return {
        "date": document.get("date"),
        "snapshotAt": document.get("snapAt"),
        "updatedAt": document.get("updatedAt"),
        "quality": quality,
        # Top-level totals are the business-facing finished-product totals.
        # Process-line totals remain available under ``workshops`` for audit.
        "totals": {
            "day": sum_metrics([item["day"] for item in finished_products.values()]),
            "night": sum_metrics([item["night"] for item in finished_products.values()]),
        },
        "workshops": workshops,
        "finishedProducts": finished_products,
        "lines": lines,
    }


def build_analytics(history_dir: Path, generated_at: str | None = None) -> dict:
    days = []
    shift_archives = {}
    shifts_dir = history_dir / "shifts"
    if shifts_dir.exists():
        for path in sorted(shifts_dir.glob("????-??-??-day.json")):
            try:
                with path.open("r", encoding="utf-8") as handle:
                    document = json.load(handle)
                production_date = str(document.get("productionDate") or path.name[:10])
                shift_archives.setdefault(production_date, {})["day"] = document
            except (OSError, json.JSONDecodeError, TypeError, ValueError) as error:
                print(f"ANALYTICS SKIP {path.name}: {error}")
        for path in sorted(shifts_dir.glob("????-??-??-night.json")):
            try:
                with path.open("r", encoding="utf-8") as handle:
                    document = json.load(handle)
                production_date = str(document.get("productionDate") or path.name[:10])
                shift_archives.setdefault(production_date, {})["night"] = document
            except (OSError, json.JSONDecodeError, TypeError, ValueError) as error:
                print(f"ANALYTICS SKIP {path.name}: {error}")

    # Boundary archives are authoritative. A legacy same-day JSON is ignored
    # once either shift has a v2 record, preventing a 17:10 snapshot from
    # silently replacing a boundary snapshot.
    authoritative_dates = set(shift_archives)
    for production_date, records in sorted(shift_archives.items()):
        days.append(summarize_shift_archives(records.get("day"), records.get("night"), production_date))

    for path in sorted(history_dir.glob("????-??-??.json")):
        try:
            with path.open("r", encoding="utf-8") as handle:
                document = json.load(handle)
            if document.get("date") not in authoritative_dates and document.get("date") and document.get("hourly") and (
                not source_date(document) or source_date(document) == str(document.get("date"))
            ):
                days.append(summarize_snapshot(document))
        except (OSError, json.JSONDecodeError, TypeError, ValueError) as error:
            print(f"ANALYTICS SKIP {path.name}: {error}")
    days.sort(key=lambda item: item["date"])
    return {
        "schemaVersion": 2,
        "generatedAt": generated_at or datetime.now(BKK).strftime("%Y-%m-%d %H:%M:%S"),
        "source": "GitHub Pages static daily snapshots",
        "metricContract": {
            "total": "normal + overtime output",
            "plan": "normal-shift cumulative plan at the normal-shift boundary",
            "attainment": "normal output / normal plan * 100",
            "productionDate": "calendar-day day shift plus the prior night shift ending that morning",
            "archive": "day boundary and following-morning night boundary are stored as separate immutable source records",
        },
        "workshops": WORKSHOPS,
        "finishedProductLines": FINISHED_PRODUCT_LINES,
        "days": days,
        "quality": {
            "archivedDays": len(days),
            "completeDayDays": sum(1 for day in days if day["quality"]["dayStatus"] == "complete"),
            "completeNightDays": sum(1 for day in days if day["quality"]["nightStatus"] == "complete"),
            "comparableDayDays": sum(1 for day in days if day["quality"]["dayStatus"] == "comparable"),
            "comparableNightDays": sum(1 for day in days if day["quality"]["nightStatus"] == "comparable"),
            "usableDayDays": sum(1 for day in days if day["quality"]["dayStatus"] != "partial"),
            "usableNightDays": sum(1 for day in days if day["quality"]["nightStatus"] != "partial"),
            "staleDays": sum(1 for day in days if day["quality"]["freshnessStatus"] == "stale"),
        },
    }


def validate_analytics(payload: dict) -> list[str]:
    """Return contract violations that would make the dashboard misleading."""
    errors = []
    if payload.get("finishedProductLines") != FINISHED_PRODUCT_LINES:
        errors.append("finishedProductLines does not match the approved production contract")
    seen_dates = set()
    previous_date = ""
    for day in payload.get("days", []):
        date = str(day.get("date") or "")
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            errors.append(f"invalid date: {date!r}")
        if date in seen_dates:
            errors.append(f"duplicate date: {date}")
        if previous_date and date < previous_date:
            errors.append(f"dates not sorted: {previous_date} then {date}")
        seen_dates.add(date)
        previous_date = date
        scopes = [("totals", day.get("totals") or {})]
        scopes.extend((f"workshops.{name}", value) for name, value in (day.get("workshops") or {}).items())
        scopes.extend((f"finishedProducts.{name}", value) for name, value in (day.get("finishedProducts") or {}).items())
        scopes.extend((f"lines.{name}", value) for name, value in (day.get("lines") or {}).items())
        for scope_name, scope in scopes:
            for shift in ("day", "night"):
                item = scope.get(shift) or {}
                normal = _number(item.get("normal"))
                overtime = _number(item.get("overtime"))
                total = _number(item.get("total"))
                plan = _number(item.get("plan"))
                if min(normal, overtime, total, plan) < 0:
                    errors.append(f"{date} {scope_name}.{shift} contains negative values")
                if abs(total - (normal + overtime)) > 0.02:
                    errors.append(f"{date} {scope_name}.{shift} total mismatch")
                expected_rate = round(normal / plan * 100, 1) if plan > 0 else None
                actual_rate = item.get("attainment")
                if expected_rate is None and actual_rate is not None:
                    errors.append(f"{date} {scope_name}.{shift} rate must be null without plan")
                elif expected_rate is not None and abs(_number(actual_rate) - expected_rate) > 0.11:
                    errors.append(f"{date} {scope_name}.{shift} attainment mismatch")
        for shift in ("day", "night"):
            expected_total = sum_metrics([
                (day.get("finishedProducts") or {}).get(workshop, {}).get(shift, {})
                for workshop in FINISHED_PRODUCT_LINES
            ])
            actual_total = (day.get("totals") or {}).get(shift) or {}
            for field in ("normal", "overtime", "total", "plan"):
                if abs(_number(actual_total.get(field)) - _number(expected_total.get(field))) > 0.01:
                    errors.append(f"{date} totals.{shift} must equal finishedProducts sum")
                    break
        quality = day.get("quality") or {}
        if quality.get("expectedLines") != EXPECTED_LINES:
            errors.append(f"{date} expectedLines must be {EXPECTED_LINES}")
        if quality.get("mappedLines") != len(day.get("lines") or {}):
            errors.append(f"{date} mappedLines does not match line records")
        if quality.get("mappedLines", 0) > EXPECTED_LINES:
            errors.append(f"{date} mappedLines exceeds configured lines")
        for workshop, configured_lines in FINISHED_PRODUCT_LINES.items():
            actual_scope = (day.get("finishedProducts") or {}).get(workshop) or {}
            expected_count = sum(1 for line in configured_lines if line in (day.get("lines") or {}))
            if actual_scope.get("lineCount") != expected_count:
                errors.append(f"{date} finishedProducts.{workshop} lineCount mismatch")
            for shift in ("day", "night"):
                expected_metric = sum_metrics([
                    day["lines"][line][shift]
                    for line in configured_lines
                    if line in (day.get("lines") or {})
                ])
                actual_metric = actual_scope.get(shift) or {}
                for field in ("normal", "overtime", "total", "plan"):
                    if abs(_number(actual_metric.get(field)) - _number(expected_metric.get(field))) > 0.01:
                        errors.append(f"{date} finishedProducts.{workshop}.{shift}.{field} mismatch")
                        break
        if quality.get("freshnessStatus") == "stale":
            if quality.get("dayStatus") != "partial" or quality.get("nightStatus") != "partial":
                errors.append(f"{date} stale source must not be analytics eligible")
    return errors


def write_analytics(history_dir: Path, output_path: Path | None = None) -> dict:
    history_dir = Path(history_dir)
    output_path = output_path or history_dir / "analytics.json"
    payload = build_analytics(history_dir)
    violations = validate_analytics(payload)
    if violations:
        raise ValueError("analytics contract failed: " + "; ".join(violations[:10]))
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_suffix(output_path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
    os.replace(temporary, output_path)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Build PDTIII static history analytics index")
    parser.add_argument("--history-dir", default=None)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    history_dir = Path(args.history_dir).resolve() if args.history_dir else root / "history"
    payload = write_analytics(history_dir)
    print(
        "ANALYTICS OK "
        f"days={payload['quality']['archivedDays']} "
        f"usableDay={payload['quality']['usableDayDays']} "
        f"usableNight={payload['quality']['usableNightDays']} "
        f"file={history_dir / 'analytics.json'}"
    )


if __name__ == "__main__":
    main()
