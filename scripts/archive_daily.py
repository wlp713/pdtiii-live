#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
每日归档快照 (v6, 纯云端 GitHub Actions)
====================================================
从 Firebase 拉当天全量 hourly → 写 history/<泰国日期>.json

为什么一个文件就够:
  - PDTIII 每线 actual = "当班累计", 只在 20:30 / 8:00 换班清零, 跨 0 点不清零
  - 因此「当天 0:00–20:40 的全段数据」同时包含:
      ① 当天白班完整: 正常 8:00–17:20 + 加班 17:20–20:20 (dp 窗口)
      ② 前一夜班完整: 夜班 20:30→次日 8:00 (凌晨段 0:00–8:00 的
         5:50/7:50 累计值天然含昨晚 20:30–24:00 的产出)
  归档时刻: 泰国 20:40 (UTC 13:40), 白班收班后

兼容性: hourly 结构与实时 Firebase 一致(线名→点数组 {actual,plan,h});
  保留数据端 17:10 快照写入的 eff/first_hour/problems/attendance 等字段。
用法: python3 scripts/archive_daily.py   (cwd = 仓库根目录)
"""
import json
import os
import sys
import urllib.request
from datetime import datetime
from zoneinfo import ZoneInfo

DATA_URL = "https://dm111-e8a7d-default-rtdb.firebaseio.com/pdtiii.json"
BKK = ZoneInfo("Asia/Bangkok")
KEEP_OLD_KEYS = ("eff", "first_hour", "problems", "attendance", "source")

def fetch(url, tries=3):
    """拉取带重试 (GH runner 偶发网络抖动自愈)"""
    import time
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "gh-actions-archive"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:
            last = e
            if i < tries - 1:
                time.sleep(5 * (i + 1))
    raise last

def normalize_hourly(h):
    """Firebase 连续 key 返回数组、稀疏 key 返回 dict → 统一为 线名→按 key 升序的数组"""
    out = {}
    for name, val in (h or {}).items():
        if isinstance(val, dict):
            items = [v for _, v in sorted(val.items(), key=lambda kv: int(kv[0]))]
        elif isinstance(val, list):
            items = val
        else:
            continue
        out[name] = items
    return out

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.chdir(root)
    now = datetime.now(BKK)
    date = now.strftime("%Y-%m-%d")
    snap = now.strftime("%Y-%m-%d %H:%M:%S")

    try:
        d = fetch(DATA_URL)
    except Exception as e:
        print(f"FETCH FAILED: {e}", file=sys.stderr)
        sys.exit(1)

    hourly = normalize_hourly(d.get("hourly"))
    if not hourly:
        print("NO HOURLY DATA", file=sys.stderr)
        sys.exit(1)

    doc = {
        "date": date,
        "snapAt": snap,
        "source": "gh-actions 每日归档 v6",
        "lines": d.get("lines"),
        "hourlyFormat": d.get("hourlyFormat", "HHMM"),
        "hourly": hourly,
        "updatedAt": d.get("updatedAt"),
    }
    # 保留数据端同日期快照写的分析字段(17:10 任务仍会跑, 不冲突)
    old_path = os.path.join("history", f"{date}.json")
    if os.path.exists(old_path):
        try:
            with open(old_path, "r", encoding="utf-8") as f:
                old = json.load(f)
            for k in KEEP_OLD_KEYS:
                if k in old and k not in doc:
                    doc[k] = old[k]
        except Exception:
            pass

    os.makedirs("history", exist_ok=True)
    with open(old_path, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))

    # ── index.json 重建 (原子写): 扫 history/*.json, 按泰国日期降序, 只收录带 hourly 的归档 ──
    idx = []
    try:
        for fn in sorted(os.listdir("history")):
            if not fn.endswith(".json") or fn == "index.json":
                continue
            p = os.path.join("history", fn)
            try:
                with open(p, "r", encoding="utf-8") as f:
                    doc2 = json.load(f)
                if doc2.get("hourly") and doc2.get("date"):
                    idx.append(doc2["date"])
            except Exception:
                continue
        idx.sort(reverse=True)
        tmp_idx = os.path.join("history", "index.json.tmp")
        with open(tmp_idx, "w", encoding="utf-8") as f:
            json.dump(idx, f, ensure_ascii=False, separators=(",", ":"))
        os.replace(tmp_idx, os.path.join("history", "index.json"))
    except Exception as e:
        print(f"INDEX WARN: {e}", file=sys.stderr)

    npts = sum(len(v) for v in hourly.values())
    print(f"OK {date} snap={snap} lines={len(hourly)} points={npts} file={old_path} idx={len(idx)}")

if __name__ == "__main__":
    main()
