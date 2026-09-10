#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""首小时达成率快照（主装配线）— 数据端参考样例（纯计算，不写任何仓库文件，可独立验证）

数据源: Firebase hourly 桶（每10分钟，键 h=泰国当天分钟，含 actual/plan，累计值）
算法: 首小时 = 段1，取该线 h 落在首小时区间内最接近末端的桶，开班清零算 actual/plan 达成率。
只有 actual>0 才输出（避免写脏快照）。
"""
import json
import urllib.request
from datetime import datetime, timedelta, timezone

DATA_URL = "https://dm111-e8a7d-default-rtdb.firebaseio.com/pdtiii.json"
BKK = timezone(timedelta(hours=7), name="Asia/Bangkok")

# 主装配线（看板/live-data 原 key）
MAIN_LINES = [
    "Motor H-Series", "Motor S-Series", "Motor F-Series", "Motor WL",
    "Final A line", "Final B Line", "Final C line", "Final D line",
]
# 首小时边界 (BKK 当天分钟) : 白班 [480,540) 8-9点 ; 夜班 [1230,1290) 20:30-21:30
DAY_FH = (480, 540)
NIGHT_FH = (1230, 1290)


def fetch(url, tries=3):
    import time
    last = None
    for a in range(tries):
        try:
            q = urllib.request.Request(url, headers={"User-Agent": "fh-probe"})
            with urllib.request.urlopen(q, timeout=60) as r:
                return json.load(r)
        except Exception as e:
            last = e
            if a < tries - 1:
                time.sleep(5 * (a + 1))
    raise last


def first_hour_snapshot(source, shift, date_str):
    """返回主装配线首小时达成率列表 [{line, actual, plan, rate}]"""
    hourly = source.get("hourly") or {}
    lo, hi = DAY_FH if shift == "day" else NIGHT_FH
    out = []
    for name in MAIN_LINES:
        pts = hourly.get(name)
        if not pts:
            continue
        # 归一化 dict/list → [(h, actual, plan)]
        items = []
        if isinstance(pts, dict):
            for _, p in sorted(pts.items(), key=lambda kv: kv[0]):
                items.append(p)
        else:
            items = pts
        # 取 h 落在首小时区间、最接近末端(hi)的桶
        cand = [p for p in items if lo <= p.get("h") < hi]
        if not cand:
            continue
        last = max(cand, key=lambda p: p.get("h"))
        actual = float(last.get("actual") or 0)
        plan = float(last.get("plan") or 0)
        if plan <= 0 or actual <= 0:
            continue  # 脏快照 / 数据未推 → 不写
        rate = round(actual / plan * 100, 1)
        out.append({"date": date_str, "shift": shift, "line": name,
                    "actual": int(actual), "plan": int(plan), "rate": rate, "h": last.get("h")})
    return out


def main():
    src = fetch(DATA_URL)
    # 判断当前班次与归属日期
    now = datetime.now(BKK)
    m = now.hour * 60 + now.minute
    if 480 <= m < 1230:
        shift, date_str = "day", now.date().isoformat()
    else:
        shift, date_str = "night", now.date().isoformat()
    snaps = first_hour_snapshot(src, shift, date_str)
    print(json.dumps({"shift": shift, "date": date_str, "mainFirstHour": snaps},
                     ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()