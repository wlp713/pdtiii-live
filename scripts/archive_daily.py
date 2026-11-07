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
    canonical_line,
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
    if _document_status(day_document) == "missing" or _document_status(night_document) == "missing":
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


# ---------------------------------------------------------------------------
# 2026-11-08 archive hardening
#
# The data-driven rewrite in September removed the fragile capture window but
# still had three holes:
#   * ``main`` only wrote snapshots whose status was exactly ``complete``; a
#     single idle line therefore made every day shift ``comparable`` and the
#     whole day was skipped forever;
#   * the rolling source only keeps a production day's buckets until midnight,
#     so a day shift missed before 00:00 can only be reconstructed from an
#     already archived snapshot that was captured after 20:20;
#   * a late run could stamp a previous day's buckets with ``now.date()``.
#
# The functions below replace that path. They are deliberately independent of
# the legacy helpers above, which are kept for backward compatibility and the
# existing unit tests.
# ---------------------------------------------------------------------------

HEAL_WINDOW_DAYS = 30
COMPARABLE_MIN = 34
ALERT_WINDOW_HOURS = 6

SHIFT_START = {"day": 8 * 60, "night": 20 * 60 + 30}
SHIFT_END = {"day": 20 * 60 + 20, "night": 7 * 60 + 50}
SHIFT_END_CLOCK = {"day": (20, 20), "night": (7, 50)}
SHIFT_DURATION = {"day": 740, "night": 690}

# MES 合并/改名后的旧线体：旧名缺失时不再阻塞归档完整性。
RETIRED_LINES = {
    "Motor CL": ("Motor FL CL", "Motor FL"),
    "Motor AC": ("Motor FL",),
}


def _number(value):
    try:
        number = float(value)
        return number if number == number else 0.0
    except (TypeError, ValueError):
        return 0.0


def _point_list(value):
    if isinstance(value, list):
        return [point for point in value if isinstance(point, dict)]
    if isinstance(value, dict):
        try:
            return [point for _, point in sorted(value.items(), key=lambda pair: int(pair[0])) if isinstance(point, dict)]
        except (TypeError, ValueError):
            return [point for point in value.values() if isinstance(point, dict)]
    return []


def _point_minute(point, old_format):
    return hour_to_minute(point.get("h"), old_format)


def _in_shift_minute(minute, shift):
    if shift == "day":
        return SHIFT_START["day"] <= minute <= SHIFT_END["day"]
    return minute >= SHIFT_START["night"] or minute <= SHIFT_END["night"]


def _sanitize_filtered_start(points, shift):
    """Clear a start bucket that still carries the previous shift's total."""
    start = SHIFT_START[shift]
    duration = SHIFT_DURATION[shift]
    timed = []
    for point in points:
        minute = _point_minute(point, False)
        if minute is not None:
            timed.append((minute, point))
    timed.sort(key=lambda item: item[0])
    for index, (minute, point) in enumerate(timed):
        if minute != start:
            continue
        value = _number(point.get("actual"))
        if value <= 0:
            continue
        later = []
        for later_minute, later_point in timed[index + 1:]:
            if later_minute - start > duration:
                break
            later.append(_number(later_point.get("actual")))
        if later and min(later) < value - max(5.0, value * 0.005):
            point["actual"] = 0
            point["plan"] = 0
            point["sanitized"] = "shiftStartCarryover"
            return True
    return False


def select_shift_hourly(hourly, shift, production_date, declared_format=None):
    """Keep only the buckets that belong to one shift of one production date.

    Buckets are filtered by both time-of-day and their ``d`` field. This is
    what prevents night first-half buckets frozen at ``2026-09-11`` from
    leaking into a current archive, and what prevents a late run from mixing
    yesterday's day shift into today's file.
    """
    selected = {}
    dropped_dates = set()
    sanitized = 0
    for raw_name, value in (hourly or {}).items():
        points = _point_list(value)
        old_format = detect_old_format(points, declared_format)
        keep = []
        for point in points:
            minute = _point_minute(point, old_format)
            if minute is None or not _in_shift_minute(minute, shift):
                continue
            bucket_date = str(point.get("d") or "")[:10]
            if bucket_date and bucket_date != production_date:
                dropped_dates.add(bucket_date)
                continue
            keep.append(point)
        keep.sort(key=lambda point: _point_minute(point, False) or 0)
        if keep:
            if _sanitize_filtered_start(keep, shift):
                sanitized += 1
            selected[raw_name] = keep
    return selected, sorted(dropped_dates), sanitized


def _effective_expected_lines(lines):
    expected = EXPECTED_LINES
    for line, aliases in RETIRED_LINES.items():
        if line not in lines and any(alias in lines for alias in aliases):
            expected -= 1
    return expected


def assess_shift_hourly(hourly, shift, production_date, source_updated_at,
                        dropped_dates=None, sanitized=0):
    """Grade one already-filtered shift snapshot.

    ``complete`` means every configured line is present and the source reached
    the shift boundary. ``partial`` means the snapshot is still usable but has
    a blocking data-quality issue. ``missing`` means no usable data at all.
    ``eligible`` tells the caller whether the data is reliable enough to write.
    """
    summary = summarize_snapshot({
        "date": production_date,
        "updatedAt": source_updated_at,
        "hourlyFormat": "HHMM",
        "hourly": hourly,
    })
    lines = summary.get("lines") or {}
    mapped = len(lines)
    last_key = "lastDayMinute" if shift == "day" else "lastNightMinute"
    metric_key = shift
    end = SHIFT_END[shift]
    start = SHIFT_START[shift]
    end_lines = 0
    idle_lines = 0
    early_lines = 0
    total_actual = 0.0
    total_plan = 0.0
    for name, item in lines.items():
        metric = item.get(metric_key) or {}
        total_actual += _number(metric.get("total"))
        total_plan += _number(metric.get("plan"))
        last = item.get(last_key)
        if last is not None and last >= end - 10:
            end_lines += 1
        elif last is not None:
            if _number(metric.get("total")) <= 0:
                idle_lines += 1
            else:
                early_lines += 1

    canonical_points = {}
    for raw_name, points in (hourly or {}).items():
        canonical = canonical_line(raw_name)
        if not canonical:
            continue
        if canonical not in canonical_points or len(points) > len(canonical_points[canonical]):
            canonical_points[canonical] = points
    regressed = []
    for name, points in canonical_points.items():
        previous = None
        for point in sorted(points, key=lambda item: _point_minute(item, False) or 0):
            value = _number(point.get("actual"))
            if previous is not None and value < previous - max(5.0, previous * 0.005):
                regressed.append(name)
                break
            previous = value

    expected = _effective_expected_lines(lines)
    threshold = min(COMPARABLE_MIN, max(3, mapped - 2)) if mapped else 1
    boundary_reached = end_lines >= threshold
    covered = mapped if boundary_reached else end_lines
    issues = []
    blocking = False

    if not mapped:
        status = "missing"
    else:
        if not boundary_reached:
            issues.append({"code": "shiftEndNotReached", "severity": "blocking",
                           "detail": f"只有 {end_lines}/{mapped} 条线到达班次末桶"})
            blocking = True
        if mapped < expected:
            issues.append({"code": "lineCoverage", "severity": "blocking",
                           "detail": f"线体 {mapped}/{expected}"})
            blocking = True
        if total_plan <= 0 and total_actual <= 0:
            issues.append({"code": "noPlanOrOutput", "severity": "blocking",
                           "detail": "班次计划与实际均为 0，无法区分停产与缺数据"})
            blocking = True
        elif total_actual <= 0:
            issues.append({"code": "allActualZero", "severity": "blocking",
                           "detail": "全部线体实际产出为 0，可能是停线或数据被清零"})
            blocking = True
        if regressed:
            issues.append({"code": "actualRegression", "severity": "blocking",
                           "detail": "累计实际回落: " + ", ".join(sorted(regressed)[:5])})
            blocking = True
        if dropped_dates:
            issues.append({"code": "bucketDateMismatch", "severity": "warning",
                           "detail": "已排除非本班次日桶: " + ", ".join(dropped_dates)})
        if sanitized:
            issues.append({"code": "startCarryover", "severity": "warning",
                           "detail": f"{sanitized} 条线起点桶已清零"})
        if idle_lines:
            issues.append({"code": "idleLines", "severity": "warning",
                           "detail": f"{idle_lines} 条线本班无产出（停线/未排产）"})
        if early_lines:
            issues.append({"code": "earlyStoppedLines", "severity": "warning",
                           "detail": f"{early_lines} 条线未到班次末桶但已有产出"})
        status = "partial" if blocking else "complete"

    return {
        "mappedLines": mapped,
        "expectedLines": EXPECTED_LINES,
        "effectiveExpectedLines": expected,
        "coveredLines": covered,
        "shiftEndLines": end_lines,
        "idleLines": idle_lines,
        "earlyStoppedLines": early_lines,
        "status": status,
        "issues": issues,
        "droppedBucketDates": dropped_dates or [],
        "sanitizedBuckets": sanitized,
        "eligible": bool(boundary_reached and mapped >= COMPARABLE_MIN and total_plan > 0),
    }


def make_shift_document_v2(source, shift, production_date, source_label,
                           captured_at, source_updated_at=None):
    """Build a filtered, graded shift document from one source snapshot."""
    hourly = normalize_hourly(source.get("hourly"))
    declared = source.get("hourlyFormat") or infer_hourly_format(hourly)
    selected, dropped, sanitized = select_shift_hourly(hourly, shift, production_date, declared)
    updated_at = source_updated_at or source.get("updatedAt")
    quality = assess_shift_hourly(selected, shift, production_date, updated_at, dropped, sanitized)
    return {
        "schemaVersion": 2,
        "productionDate": production_date,
        "shift": shift,
        "capturedAt": captured_at,
        "sourceUpdatedAt": updated_at,
        "sourceDate": source_date(source) if source.get("updatedAt") else (str(updated_at)[:10] if updated_at else None),
        "source": source_label,
        "hourlyFormat": "HHMM",
        "hourly": selected,
        "quality": quality,
    }


def discover_source_shifts(source, now=None, max_age_minutes=None):
    """Return every completed shift that one source snapshot can prove.

    A snapshot captured after 20:20 contains the day shift of its source date;
    a snapshot captured after 07:50 contains the night shift that started on
    the previous production date. No ``now.date()`` is used for attribution.
    """
    source_dt = source_datetime(source) if source.get("updatedAt") else None
    if source_dt is None:
        updated = str(source.get("updatedAt") or "")
        try:
            source_dt = datetime.strptime(updated[:19], "%Y-%m-%d %H:%M:%S").replace(tzinfo=BKK)
        except ValueError:
            return []
    if max_age_minutes is not None and now is not None:
        if (now - source_dt).total_seconds() > max_age_minutes * 60:
            return []
    source_day = source_dt.date().isoformat()
    minutes = source_dt.hour * 60 + source_dt.minute
    out = []
    if minutes >= SHIFT_END["day"]:
        document = make_shift_document_v2(
            source, "day", source_day, "Firebase rolling buffer"
            if source.get("updatedAt") else "archive snapshot",
            captured_at=source_dt.strftime("%Y-%m-%d %H:%M:%S"),
        )
        if document["quality"]["mappedLines"]:
            out.append(document)
    if minutes >= SHIFT_END["night"]:
        night_date = (source_dt.date() - timedelta(days=1)).isoformat()
        document = make_shift_document_v2(
            source, "night", night_date, "Firebase rolling buffer"
            if source.get("updatedAt") else "archive snapshot",
            captured_at=source_dt.strftime("%Y-%m-%d %H:%M:%S"),
        )
        if document["quality"]["mappedLines"]:
            out.append(document)
    return out


def _document_status(document):
    if not document:
        return "missing"
    quality = document.get("quality") or {}
    return str(document.get("status") or quality.get("status") or "partial")


def _rank(document):
    return {"complete": 3, "partial": 2, "missing": 1}.get(_document_status(document), 0)


def load_shift_documents(history_dir):
    documents = {}
    shifts_dir = Path(history_dir) / "shifts"
    if not shifts_dir.exists():
        return documents
    for path in sorted(shifts_dir.glob("????-??-??-*.json")):
        document = read_json(path)
        if not isinstance(document, dict):
            continue
        file_date = path.name[:10]
        shift = path.name[11:-5]
        if shift not in ("day", "night"):
            continue
        document["_filenameDate"] = file_date
        documents[(file_date, shift)] = document
    return documents


def _filename_mismatch(document):
    return bool(document and document.get("productionDate")
                and str(document.get("productionDate")) != str(document.get("_filenameDate")))


def missing_shift_document(production_date, shift, detected_at, reason):
    return {
        "schemaVersion": 2,
        "productionDate": production_date,
        "shift": shift,
        "capturedAt": detected_at,
        "detectedAt": detected_at,
        "source": "archive self-heal",
        "status": "missing",
        "hourlyFormat": "HHMM",
        "hourly": {},
        "quality": {
            "mappedLines": 0,
            "expectedLines": EXPECTED_LINES,
            "effectiveExpectedLines": EXPECTED_LINES,
            "coveredLines": 0,
            "shiftEndLines": 0,
            "status": "missing",
            "issues": [{"code": "sourceWindowExpired", "severity": "blocking", "detail": reason}],
            "droppedBucketDates": [],
            "sanitizedBuckets": 0,
        },
    }


def _write_shift(history_dir, document, dry_run=False):
    production_date = document["productionDate"]
    shift = document["shift"]
    path = Path(history_dir) / "shifts" / f"{production_date}-{shift}.json"
    if path.exists():
        current = read_json(path)
        if current and _document_status(current) != "missing":
            return "immutable"
    if not dry_run:
        atomic_write(path, document)
        rebuild_daily_artifact(Path(history_dir), production_date)
    return "written"


def heal_history(history_dir, source, now, requested="auto", window_days=HEAL_WINDOW_DAYS, dry_run=False):
    """Capture the live payable shifts, recover recent gaps, mark the rest.

    Existing complete/partial snapshots are immutable. A ``missing`` placeholder
    may be replaced later if a recoverable source appears. A placeholder is
    only created when the other shift of the same production date already
    exists, so a holiday with no production at all does not manufacture a gap.
    """
    history_dir = Path(history_dir)
    existing = load_shift_documents(history_dir)
    captured_at = now.strftime("%Y-%m-%d %H:%M:%S")
    candidates = {}

    def add(document, recovered_from=None):
        if recovered_from:
            document = dict(document)
            document["recoveredFrom"] = recovered_from
            document["source"] = "archive snapshot recovery"
        key = (document["productionDate"], document["shift"])
        candidates.setdefault(key, []).append(document)

    for document in discover_source_shifts(source, now=now, max_age_minutes=180):
        add(document)

    for (file_date, shift), document in existing.items():
        if _document_status(document) == "missing" or _filename_mismatch(document):
            continue
        pseudo = {
            "updatedAt": document.get("sourceUpdatedAt") or document.get("capturedAt"),
            "hourlyFormat": document.get("hourlyFormat"),
            "hourly": document.get("hourly"),
        }
        for recovered in discover_source_shifts(pseudo):
            add(recovered, f"shifts/{file_date}-{shift}.json")

    cutoff = (now.date() - timedelta(days=window_days)).isoformat()
    target_dates = sorted({
        production_date for production_date, _ in existing
        if production_date >= cutoff
    } | {
        production_date for production_date, _ in candidates
        if production_date >= cutoff
    })

    report = {"written": [], "immutable": [], "missing": [], "skipped": []}
    for production_date in target_dates:
        for shift in ("day", "night"):
            if requested not in ("auto", shift):
                continue
            key = (production_date, shift)
            current = existing.get(key)
            if current and _document_status(current) != "missing" and not _filename_mismatch(current):
                report["immutable"].append(f"{production_date}-{shift}")
                continue
            best = sorted(candidates.get(key) or [], key=lambda doc: (_rank(doc), doc["quality"].get("mappedLines", 0)))[-1:] or [None]
            best = best[0]
            if best and best["quality"].get("eligible") and best["quality"].get("status") != "missing":
                result = _write_shift(history_dir, best, dry_run=dry_run)
                if result == "written":
                    existing[key] = best
                report["written" if result == "written" else "immutable"].append(f"{production_date}-{shift}")
                continue
            other = "night" if shift == "day" else "day"
            counterpart = existing.get((production_date, other))
            if counterpart and (_document_status(counterpart) != "missing" or _filename_mismatch(counterpart)):
                reason = "Firebase 滚动缓冲已过期，未能重建该班次"
                if current and _filename_mismatch(current):
                    reason = "现有快照的 productionDate 与文件名不一致，已隔离"
                elif best:
                    codes = [item.get("code") for item in best["quality"].get("issues") or []]
                    reason = "可重建数据质量不足: " + ", ".join(codes)
                if current is not None:
                    # Missing placeholders and invalid files are immutable too:
                    # repeated runs must not churn their timestamps.
                    report["missing" if _document_status(current) == "missing" else "skipped"].append(
                        f"{production_date}-{shift}")
                    continue
                if not dry_run:
                    atomic_write(history_dir / "shifts" / f"{production_date}-{shift}.json",
                                 missing_shift_document(production_date, shift, captured_at, reason))
                report["missing"].append(f"{production_date}-{shift}")
            else:
                report["skipped"].append(f"{production_date}-{shift}")
    return report


def unresolved_current_shift(history_dir, now, window_hours=ALERT_WINDOW_HOURS):
    """Return the just-ended shifts that have no valid archive file.

    Only the most recent day/night boundary is checked and only while it is
    still fresh, so an unrepairable historical gap does not keep the workflow
    red forever. This is the signal the workflow should fail on.
    """
    documents = load_shift_documents(history_dir)
    checks = []
    day_end = now.replace(hour=SHIFT_END_CLOCK["day"][0], minute=SHIFT_END_CLOCK["day"][1], second=0, microsecond=0)
    if day_end > now:
        day_end -= timedelta(days=1)
    checks.append(("day", day_end.date().isoformat(), day_end))
    night_end = now.replace(hour=SHIFT_END_CLOCK["night"][0], minute=SHIFT_END_CLOCK["night"][1], second=0, microsecond=0)
    if night_end > now:
        night_end -= timedelta(days=1)
    checks.append(("night", (night_end.date() - timedelta(days=1)).isoformat(), night_end))
    unresolved = []
    for shift, production_date, ended_at in checks:
        if (now - ended_at).total_seconds() > window_hours * 3600:
            continue
        document = documents.get((production_date, shift))
        if _document_status(document) == "missing" or (_filename_mismatch(document)):
            unresolved.append(f"{production_date}-{shift}")
    return unresolved


def main() -> int:
    parser = argparse.ArgumentParser(description="Capture and self-heal PDTIII production-shift archives")
    parser.add_argument("--shift", choices=("auto", "day", "night"), default="auto")
    parser.add_argument("--window-days", type=int, default=HEAL_WINDOW_DAYS)
    parser.add_argument("--history-dir", default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    history_dir = Path(args.history_dir).resolve() if args.history_dir else root / "history"
    now = datetime.now(BKK)

    try:
        source = fetch(DATA_URL)
    except Exception as error:  # pragma: no cover - network-specific
        print(f"FETCH FAILED: {error}", file=sys.stderr)
        return 1

    source = merge_extra_source(source)
    report = heal_history(
        history_dir, source, now,
        requested=args.shift,
        window_days=max(1, args.window_days),
        dry_run=args.dry_run,
    )
    print(
        "HEAL "
        f"written={len(report['written'])} missing={len(report['missing'])} "
        f"immutable={len(report['immutable'])} skipped={len(report['skipped'])}"
    )
    if report["written"]:
        print("WRITTEN " + " ".join(report["written"]))
    if report["missing"]:
        print("MISSING " + " ".join(report["missing"]))

    if not args.dry_run:
        analytics = write_analytics(history_dir)
        rebuild_index(history_dir, analytics)
        print(
            f"DONE days={analytics['quality']['archivedDays']} "
            f"usableDay={analytics['quality']['usableDayDays']} "
            f"usableNight={analytics['quality']['usableNightDays']}"
        )

    unresolved = unresolved_current_shift(history_dir, now)
    if unresolved:
        print("ALERT shift ended but archive is missing: " + ", ".join(unresolved), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

