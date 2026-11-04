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
# 旁路补线体源（2026-11-04）：MES 改名后数据端白名单没补的线，由本机 cron 推到这里的节点。
# 归档时若旁路新鲜（<=10 分钟）且主源没有同名线，就把它并进归档，保证历史不断档。
EXTRA_URL = "https://dm111-e8a7d-default-rtdb.firebaseio.com/pdtiii_extra.json"
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


SHIFT_START_DURATION = {800: 740, 2030: 690}  # HHMM 起点桶 -> 本班时长(分钟)


def sanitize_shift_start_buckets(hourly, hourly_format):
    """清掉「换班起点桶 = 上一班累计」的残留值（2026-11-04 新增）。

    数据端每个 10 分钟桶取窗口内最早的一条记录，而 MES 在换班瞬间(08:00:00 /
    20:30:00)会先出一条「SH_IX 已切到新班、ACTUAL 仍是上一班累计」的过渡记录
    （实测 Final B 2026-11-04 08:00:00 actual=4062，08:01 起才 6/9/18…）。
    于是起点桶被写成上一班累计，后续所有按桶差分的统计（归档、趋势、小时图）都被污染。

    判定：起点桶 > 0 且不低于上一桶（= 没清零），但本班后续桶出现明显回落
    （小于起点桶）→ 起点桶是残留，把 actual/plan 归 0（数据端清零后从 0 重新累计）。
    本班后续桶一次都没回落（数据端确实连续累计，如 2026-10-29 Welding C）→ 保持原样，不猜。
    """
    if hourly_format != "HHMM":
        return hourly
    for points in (hourly or {}).values():
        if not isinstance(points, list) or len(points) < 2:
            continue
        pts = []
        for point in points:
            if not isinstance(point, dict):
                continue
            day = str(point.get("d") or "")[:10]
            try:
                bucket = int(point.get("h"))
                abs_min = datetime.strptime(day, "%Y-%m-%d").toordinal() * 1440 + (bucket // 100) * 60 + bucket % 100
            except (TypeError, ValueError):
                continue
            pts.append((abs_min, bucket, point))
        if len(pts) < 2:
            continue
        pts.sort(key=lambda item: item[0])
        for index, (abs_min, bucket, point) in enumerate(pts):
            duration = SHIFT_START_DURATION.get(bucket)
            if not duration:
                continue
            try:
                value = float(point.get("actual") or 0)
            except (TypeError, ValueError):
                continue
            if value <= 0:
                continue
            tolerance = max(5.0, value * 0.005)
            if index:
                try:
                    previous = float(pts[index - 1][2].get("actual") or 0)
                except (TypeError, ValueError):
                    previous = 0.0
                if value < previous - tolerance:
                    continue  # 起点桶本来就清零了，正常
            later = []
            for later_abs, _, later_point in pts[index + 1:]:
                if later_abs - abs_min > duration:
                    break
                try:
                    later.append(float(later_point.get("actual") or 0))
                except (TypeError, ValueError):
                    continue
            if not later or min(later) >= value - tolerance:
                continue  # 本班没回落 -> 可能是真·连续累计，不改
            point["actual"] = 0
            point["plan"] = 0
            point["sanitized"] = "shiftStartCarryover"
    return hourly


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


def merge_extra_source(source: dict) -> dict:
    """把旁路补线体并进主源（仅补缺，不改已有线；旁路过期则忽略）。"""
    try:
        extra = fetch(EXTRA_URL, tries=1)
    except Exception:
        return source
    if not isinstance(extra, dict) or not extra.get("lines"):
        return source
    try:
        extra_at = datetime.strptime(str(extra.get("updatedAt"))[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=BKK)
    except ValueError:
        return source
    if (datetime.now(BKK) - extra_at).total_seconds() > 600:
        return source                       # 旁路超过 10 分钟没更新 -> 视为失效
    hourly = source.get("hourly") or {}
    existing = {str(name).lower().replace(" ", "") for name in hourly}
    added = []
    for name, points in (extra.get("hourly") or {}).items():
        key = str(name).lower().replace(" ", "")
        if key in existing or not isinstance(points, list) or not points:
            continue
        hourly[name] = points
        added.append(name)
    if added:
        source = dict(source)
        source["hourly"] = hourly
        print("EXTRA merged lines: " + ", ".join(added))
    return source


def make_shift_document(source: dict, shift: str, now: datetime) -> dict:
    hourly = normalize_hourly(source.get("hourly"))
    hourly_format = source.get("hourlyFormat") or infer_hourly_format(hourly)
    hourly = sanitize_shift_start_buckets(hourly, hourly_format)
    production_date = now.date().isoformat() if shift == "day" else (now.date() - timedelta(days=1)).isoformat()
    document = {
        "schemaVersion": 2,
        "productionDate": production_date,
        "shift": shift,
        "capturedAt": now.strftime("%Y-%m-%d %H:%M:%S"),
        "sourceUpdatedAt": source.get("updatedAt"),
        "sourceDate": source_date(source),
        "source": "Firebase boundary archive v2",
        "hourlyFormat": hourly_format,
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


def current_shift_documents(source: dict, now: datetime, requested: str = "auto") -> list:
    """Data-driven capture: return [(production_date, shift, doc)] for every
    complete shift present in the *current* source data.

    Unlike the old design this does not require the run (or the source's
    updatedAt) to fall inside a narrow 10-minute capture window. GitHub Actions
    scheduled runs are not reliable enough to hit those windows, and a run that
    lands even hours late would silently never capture anything. Instead we
    judge completeness from the data itself: a shift is archived only when its
    buckets actually reach the shift end in the live source.

    The live bucket split keeps the two shifts honest:
      * day buckets (08:00..20:20) => the source day's day shift;
      * morning buckets (<08:00)   => the night that ended this morning,
        which belongs to the *previous* production date.
    A still-running night (>=20:30 on the same day) never lands in the morning
    <08:00 band, so it can never be mistaken for a completed night.
    """
    hourly = normalize_hourly(source.get("hourly"))
    source_day = source_date(source)
    if not source_day or not hourly:
        return []
    declared = source.get("hourlyFormat") or infer_hourly_format(hourly)
    summary = summarize_snapshot({
        "date": source_day,
        "updatedAt": source.get("updatedAt"),
        "hourlyFormat": declared,
        "hourly": hourly,
    })
    quality = summary["quality"]
    out = []
    want_day = requested in ("auto", "day")
    want_night = requested in ("auto", "night")
    if want_day and quality["dayStatus"] in ("complete", "comparable"):
        document = make_shift_document(source, "day", now)
        out.append((source_day, "day", document))
    if want_night and quality["nightStatus"] in ("complete", "comparable"):
        document = make_shift_document(source, "night", now)
        night_production = (datetime.strptime(source_day, "%Y-%m-%d").date() - timedelta(days=1)).isoformat()
        out.append((night_production, "night", document))
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture PDTIII production-shift archives (data-driven)")
    parser.add_argument("--shift", choices=("auto", "day", "night"), default="auto")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    history_dir = root / "history"
    now = datetime.now(BKK)

    try:
        source = fetch(DATA_URL)
    except Exception as error:  # pragma: no cover - network-specific
        print(f"FETCH FAILED: {error}", file=sys.stderr)
        return 1

    source = merge_extra_source(source)
    captures = current_shift_documents(source, now, requested=args.shift)
    if not captures:
        print(f"NO COMPLETE SHIFT now={now.isoformat()} updatedAt={source.get('updatedAt')}")
        return 0

    for production_date, shift, document in captures:
        if document["quality"]["status"] != "complete":
            print(
                f"SKIP {shift} {production_date} status={document['quality']['status']}",
                file=sys.stderr,
            )
            continue
        shift_path = history_dir / "shifts" / f"{production_date}-{shift}.json"
        atomic_write(shift_path, document)
        rebuild_daily_artifact(history_dir, production_date)
        print(f"CAPTURED shift={shift} productionDate={production_date} file={shift_path.as_posix()}")

    analytics = write_analytics(history_dir)
    rebuild_index(history_dir, analytics)
    print(
        f"DONE days={analytics['quality']['archivedDays']} "
        f"usableDay={analytics['quality']['usableDayDays']} "
        f"usableNight={analytics['quality']['usableNightDays']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
