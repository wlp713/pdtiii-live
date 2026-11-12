#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""补充线体推送器 (2026-11-04)

背景：MES 在 2026-11-01 17:23 把产线「Motor AC」改名/合并为「Motor FL  CL 」。
数据端 sync_db.py 的 MAIN_NAMES 白名单还是旧名字，整条线被 WANT 过滤掉，
Firebase pdtiii.json 里根本没有这条线 → 看板 PRO1 少一条在产线。

数据端跑在别的机器上，够不到；Firebase 是公开可写的 → 这里把「主源没有、
但确实在产」的线单独推到一个旁路节点 pdtiii_extra.json，看板加载主源后合并。
一旦数据端白名单补上该名字，主源里有同名线，看板优先用主源、自动忽略旁路，不会重复。

输出格式与主源完全一致（lines / hourly / hourlyFormat=HHMM），看板无需特判。
"""
import argparse
import datetime
import json
import os
import sys
import urllib.request

import pymysql

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))            # pdtiii-live/
DB_CONFIG = os.path.join(os.path.dirname(BASE), 'pdtiii_db', 'db_config.json')  # 与数据端同一份
EXTRA_URL = 'https://dm111-e8a7d-default-rtdb.firebaseio.com/pdtiii_extra.json'

# 需要补推的线体: 看板显示名 -> SQL LIKE 匹配（MES 实际名可能带多余空格）
EXTRA_LINES = [
    ('Motor FL CL', 'Motor FL%CL%'),
    # ★ 2026-11-12: 新增两条球头线(MES 里叫 Piston Balljion / Rod balljion)。
    #   数据端 sync_db.py 的 MAIN_NAMES 白名单没有它们 → 被 WANT 过滤, 主源里没有, 走旁路补推。
    ('Piston Balljion', 'Piston Balljion%'),
    ('Rod balljion', 'Rod balljion%'),
]

# 与数据端一致的段边界桶（只写这些，控制体积）
HOURLY_BOUNDARY_BUCKETS = {
    800, 900, 1000, 1010, 1100, 1200, 1300, 1400, 1500, 1510,
    1600, 1700, 1720, 1820, 1920, 2020,
    2030, 2130, 2230, 2240, 2330,
    30, 130, 230, 330, 430, 530, 630, 750,
}
SHIFT_START_BUCKETS = {800, 2030}   # 换班起点桶: MES 会先出一条「未清零」的过渡记录


def load_db_config():
    with open(DB_CONFIG, encoding='utf-8') as f:
        cfg = json.load(f)
    return cfg


def fetch_rows(cfg, like):
    conn = pymysql.connect(host=cfg['host'], port=cfg['port'], user=cfg['user'],
                           password=cfg['password'], database=cfg['db'],
                           charset=cfg.get('charset', 'utf8mb4'), connect_timeout=8)
    try:
        cur = conn.cursor()
        cur.execute(
            """SELECT PDT_NAME, TIME_STAMP, PLAN, ACTUAL, DIFF, NG, EFF_STR, SH_IX, MODEL_DPLAN
               FROM pdt_data
               WHERE PDT_NAME LIKE %s AND TIME_STAMP >= CURDATE() AND TIME_STAMP <= NOW()
               ORDER BY TIME_STAMP""", (like,))
        rows = cur.fetchall()
        cur.close()
    finally:
        conn.close()
    return rows


def valid(row):
    _, ts, plan, actual, diff, ng, eff, sh, dplan = row
    try:
        plan = float(plan or 0)
        actual = float(actual or 0)
    except (TypeError, ValueError):
        return False
    if actual < 0 or actual > 100000 or plan < 0 or plan > 50000:
        return False      # MES 偶发 -16777214 这类错误哨兵值
    try:
        e = float(eff) if eff else 0.0
    except (TypeError, ValueError):
        e = 0.0
    return e <= 150


def build(display_name, rows):
    rows = [r for r in rows if valid(r)]
    if not rows:
        return None, None
    last = rows[-1]
    _, ts, plan, actual, diff, ng, eff, sh, dplan = last
    target = float(dplan or 0)
    if target > 100000 or target < 0:
        target = 0
    try:
        eff_v = round(float(eff), 1) if eff else 0.0
    except (TypeError, ValueError):
        eff_v = 0.0
    now = datetime.datetime.now()
    age_min = (now - ts).total_seconds() / 60.0
    status = 'STALLED' if age_min > 3 else 'RUNNING'
    line = {
        'name': display_name,
        'time': ts.strftime('%d-%b') + '-%d' % (sh if sh is not None else 0),
        'target': target,
        'plan': float(plan or 0),
        'actual': float(actual or 0),
        'cb': float(diff or 0),
        'cum': float(actual or 0),
        'eff': eff_v,
        'status': status,
        'stalled': status == 'STALLED',
        'pushed': now.strftime('%Y-%m-%d %H:%M:%S'),
        'extra': True,
    }
    # hourly: 每 10 分钟桶取窗口内最早记录；换班起点桶取最小 actual（跳过 MES 的未清零过渡行）
    buckets = {}
    for r in rows:
        ts2, plan2, actual2 = r[1], r[2], r[3]
        hh = int('%02d%02d' % (ts2.hour, (ts2.minute // 10) * 10))
        if hh not in HOURLY_BOUNDARY_BUCKETS:
            continue
        cur_v = float(actual2 or 0)
        existed = buckets.get(hh)
        if existed is None:
            buckets[hh] = {'ts': ts2, 'h': hh, 'actual': cur_v, 'plan': float(plan2 or 0)}
        elif hh in SHIFT_START_BUCKETS:
            if cur_v < existed['actual']:
                buckets[hh] = {'ts': ts2, 'h': hh, 'actual': cur_v, 'plan': float(plan2 or 0)}
        elif ts2 < existed['ts']:
            buckets[hh] = {'ts': ts2, 'h': hh, 'actual': cur_v, 'plan': float(plan2 or 0)}
    hourly = sorted(({'h': b['h'], 'actual': b['actual'], 'plan': b['plan']} for b in buckets.values()),
                    key=lambda x: x['h'])
    return line, hourly


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry', action='store_true', help='只打印, 不写 Firebase')
    args = ap.parse_args()

    cfg = load_db_config()
    lines, hourly, errors = [], {}, []
    for display_name, like in EXTRA_LINES:
        try:
            rows = fetch_rows(cfg, like)
            line, buckets = build(display_name, rows)
            if line is None:
                errors.append('%s: 今天没有有效记录' % display_name)
                continue
            lines.append(line)
            if buckets:
                hourly[display_name] = buckets
        except Exception as exc:                      # 单条线失败不影响其他线
            errors.append('%s: %s' % (display_name, exc))

    if not lines:
        print('[%s] 没有可推送的线体: %s' % (datetime.datetime.now().strftime('%F %T'), '; '.join(errors)))
        return 0

    payload = {
        'mode': 'extra',
        'updatedAt': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'source': 'mysql db140613_06 (readonly) / 补线体',
        'hourlyFormat': 'HHMM',
        'lines': lines,
        'hourly': hourly,
    }
    if args.dry:
        print(json.dumps(payload, ensure_ascii=False, indent=1))
        return 0
    req = urllib.request.Request(EXTRA_URL, data=json.dumps(payload).encode('utf-8'), method='PUT',
                                 headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        resp.read()
    print('[%s] 已推送 %d 条: %s%s' % (
        datetime.datetime.now().strftime('%F %T'), len(lines),
        ', '.join('%s %s/%s' % (l['name'], l['actual'], l['plan']) for l in lines),
        (' | 跳过: ' + '; '.join(errors)) if errors else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
