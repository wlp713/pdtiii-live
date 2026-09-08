#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Capture PDTIII boundary archives without mixing production shifts.

The live Firebase hourly series is a rolling, cumulative source. The old job
read it once per day and wrote ``history/YYYY-MM-DD.json`` directly; a delayed
GitHub Actions run could therefore archive the next night's partial data under
the wrong date. This job now writes immutable boundary records first:

* day: 20:20–20:29 Bangkok, after day overtime ends;
* night: 07:50–07:59 Bangkok, before the 08:00 counter reset.

The analytics index combines the two records by production date. A run outside
its capture window or with a stale/partial source never overwrites a valid
archive.
"""
import argparse
import json
import os
import sys
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

from history_analytics import (
    EXPECTED_LINES,
    detect_old_format,
    hour_to_minute,
    production_date_for_shift,
    source_date,
    summarize_snapshot,
    summarize_shift_archives,
    write_analytics,
)

DATA_URL = "https://dm111-e8a7d-default-rtdb.firebaseio.com/pdtiii.json"
BKK = timezone(timedelta(hours=7), name="Asia/Bangkok")


def fetch(url: str, tries: int = 3):
    """Fetch Firebase with bounded retries and a useful failure message."""
    import time

    last = None
    for attempt in range(tries):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "gh-actions-archive-v2"})
            with urllib.request.urlopen(request, timeout=60) as response:
                return json.load(response)
        except Exception as error:  # pragma: no cover - network-specific
            last = error
            if attempt < tries - 1:
                time.sleep(5 * (attempt + 1))
    raise last


def normalize_hourly(hourly):
    """Normalize Firebase arrays and sparse objects to ordered arrays."""
    output = {}
    for name, value in (hourly or {}).items():
        if isinstance(value, dict):
            try:
                items = [item for _, item in sorted(value.items(), key=lambda pair: int(pair[0]))]
            except (TypeError, ValueError):
                items = list(value.values())
        elif isinstance(value, list):
            items = value
        else:
            continue
        output[name] = items
    return output


def infer_hourly_format(hourly) -> str:
    values = []
    for points in (hourly or {}).values():
        for point in points if isinstance(points, list) else []:
            try:
                values.append(float(point.get("h")))
            except (AttributeError, TypeError, ValueError):
                continue
    # New source buckets use HHMM (0, 10, ..., 2350); old source buckets use
    # integer hours (0..23). One value >= 100 is enough to disambiguate.
    return "HHMM" if any(value >= 100 for value in values) else "hour"


def source_datetime(document: dict):
    value = str(document.get("updatedAt") or "")
    for pattern in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value[:19], pattern).replace(tzinfo=BKK)
        except ValueError:
            continue
    return None


def in_capture_window(now: datetime, shift: str) -> bool:
    minutes = now.hour * 60 + now.minute
    if shift == "day":
        return 20 * 60 + 20 <= minutes < 20 * 60 + 30
    if shift == "night":
        return 7 * 60 + 50 <= minutes < 8 * 60
    return False


def source_is_at_boundary(document: dict, shift: str) -> bool:
    source = source_datetime(document)
    if not source:
        return False
    minutes = source.hour * 60 + source.minute
    if shift == "day":
        return 20 * 60 + 20 <= minutes < 20 * 60 + 30
    if shift == "night":
        return 7 * 60 + 50 <= minutes < 8 * 60
    return False


def make_shift_document(source: dict, shift: str, now: datetime) -> dict:
    hourly = normalize_hourly(source.get("hourly"))
    production_date = now.date().isoformat() if shift == "day" else (now.date() - timedelta(days=1)).isoformat()
    document = {
        "schemaVersion": 2,
        "productionDate": production_date,
        "shift": shift,
        "capturedAt": now.strftime("%Y-%m-%d %H:%M:%S"),
        "sourceUpdatedAt": source.get("updatedAt"),
        "sourceDate": source_date(source),
        "source": "Firebase boundary archive v2",
        "hourlyFormat": source.get("hourlyFormat") or infer_hourly_format(hourly),
        "hourly": hourly,
    }
    # summarize_snapshot uses the source calendar date only to assess source
    # freshness. For the night boundary, that date is the following morning;
    # productionDate remains the previous day by contract.
    summary = summarize_snapshot({
        "date": source_date(source) or production_date,
        "updatedAt": document["sourceUpdatedAt"],
        "hourlyFormat": document["hourlyFormat"],
        "hourly": hourly,
    })
    quality = summary["quality"]
    document["quality"] = {
        "mappedLines": quality.get("mappedLines", 0),
        "expectedLines": EXPECTED_LINES,
        "coveredLines": quality.get("dayCoveredLines" if shift == "day" else "nightCoveredLines", 0),
        "status": quality.get("dayStatus" if shift == "day" else "nightStatus", "partial"),
    }
    return document


def atomic_write(path: Path, document) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(document, handle, ensure_ascii=False, separators=(",", ":"))
    os.replace(temporary, path)


def read_json(path: Path):
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, json.JSONDecodeError):
        return None


def merge_boundary_hourly(day_document: dict, night_document: dict) -> dict:
    """Materialize one read-only hourly view for the historical detail page.

    The analytics index is the authoritative business summary. This smaller
    merged series exists only so the existing shift-detail view can render a
    completed production day without making a Firebase request.
    """
    output = {}
    names = set((day_document.get("hourly") or {})) | set((night_document.get("hourly") or {}))
    for name in sorted(names):
        day_points = (day_document.get("hourly") or {}).get(name) or []
        night_points = (night_document.get("hourly") or {}).get(name) or []
        day_format = day_document.get("hourlyFormat")
        night_format = night_document.get("hourlyFormat")
        selected = []
        for point in day_points:
            minute = hour_to_minute(point.get("h"), detect_old_format(day_points, day_format))
            if minute is not None and 480 <= minute <= 1220:
                selected.append((minute, point))
        for point in night_points:
            minute = hour_to_minute(point.get("h"), detect_old_format(night_points, night_format))
            if minute is not None and (minute >= 1230 or minute < 480):
                selected.append((minute, point))
        selected.sort(key=lambda item: item[0])
        output[name] = [point for _, point in selected]
    return output


def rebuild_daily_artifact(history_dir: Path, production_date: str) -> bool:
    """Materialize a daily view only after both boundary records exist."""
    shifts_dir = history_dir / "shifts"
    day_path = shifts_dir / f"{production_date}-day.json"
    night_path = shifts_dir / f"{production_date}-night.json"
    day_document = read_json(day_path)
    night_document = read_json(night_path)
    if not day_document or not night_document:
        return False
    summary = summarize_shift_archives(day_document, night_document, production_date)
    artifact = {
        "schemaVersion": 2,
        "date": production_date,
        "source": "Firebase boundary archive v2",
        "archiveMode": "shift-boundary",
        "hourlyFormat": day_document.get("hourlyFormat") or night_document.get("hourlyFormat") or "HHMM",
        "hourly": merge_boundary_hourly(day_document, night_document),
        "shiftArchives": {
            "day": f"shifts/{day_path.name}",
            "night": f"shifts/{night_path.name}",
        },
        **summary,
    }
    atomic_write(history_dir / f"{production_date}.json", artifact)
    return True


def rebuild_index(history_dir: Path, analytics: dict) -> None:
    dates = [str(day["date"]) for day in analytics.get("days", []) if day.get("date")]
    atomic_write(history_dir / "index.json", dates)


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture one PDTIII production-shift boundary archive")
    parser.add_argument("--shift", choices=("auto", "day", "night"), default="auto")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    history_dir = root / "history"
    now = datetime.now(BKK)

    shift = args.shift
    if shift == "auto":
        if in_capture_window(now, "day"):
            shift = "day"
        elif in_capture_window(now, "night"):
            shift = "night"
        else:
            print(f"NO CAPTURE WINDOW now={now.isoformat()}")
            return 0

    try:
        source = fetch(DATA_URL)
    except Exception as error:  # pragma: no cover - network-specific
        print(f"FETCH FAILED: {error}", file=sys.stderr)
        return 1
    hourly = normalize_hourly(source.get("hourly"))
    if not hourly:
        print("NO HOURLY DATA", file=sys.stderr)
        return 1
    if not source_is_at_boundary(source, shift):
        print(f"SOURCE NOT AT {shift} BOUNDARY updatedAt={source.get('updatedAt')}", file=sys.stderr)
        return 1

    document = make_shift_document(source, shift, now)
    if document["quality"]["status"] != "complete":
        print(
            f"ARCHIVE REJECTED shift={shift} productionDate={document['productionDate']} "
            f"status={document['quality']['status']} mapped={document['quality']['mappedLines']} "
            f"covered={document['quality']['coveredLines']}",
            file=sys.stderr,
        )
        return 1

    production_date = production_date_for_shift(document, shift)
    if production_date != document["productionDate"]:
        print(f"DATE CONTRACT FAILED shift={shift} expected={document['productionDate']} got={production_date}", file=sys.stderr)
        return 1
    shift_path = history_dir / "shifts" / f"{production_date}-{shift}.json"
    atomic_write(shift_path, document)
    complete = rebuild_daily_artifact(history_dir, production_date)
    analytics = write_analytics(history_dir)
    rebuild_index(history_dir, analytics)
    print(
        f"OK shift={shift} productionDate={production_date} completeDay={complete} "
        f"days={analytics['quality']['archivedDays']} file={shift_path.as_posix()}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
