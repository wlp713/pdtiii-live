#!/usr/bin/env python3
"""Live parser: read latest pktmon pcapng -> extract S2C payloads -> parse lines -> update data.json.
Usage: python3 live_parse.py [pcapng_path]
"""
import struct, re, json, sys, os, datetime
import urllib.request

DASH = "/mnt/c/Users/19777/Desktop/PDTIII_Dashboard/data.json"
CACHE = "/mnt/c/Users/19777/Desktop/PDTIII_Dashboard/lines_cache.json"  # 持久缓存: 没抓到的线沿用旧值, 线永不消失
HOUR_CACHE = "/mnt/c/Users/19777/Desktop/PDTIII_Dashboard/hourly_cache.json"  # 小时产量快照: 每线每小时末的累计值
# 云端中转: Firebase Realtime Database (dm111-e8a7d, 公开读写) — 独立路径 pdtiii, 与 DMS 数据隔离
FIREBASE_URL = "https://dm111-e8a7d-default-rtdb.firebaseio.com/pdtiii.json"
DEFAULT_PCAP = "/mnt/c/Users/19777/Desktop/pdtiii_auto/cap_live.pcapng"
NAME_RE = re.compile(rb'\x1e([A-Za-z][A-Za-z0-9\- ]{1,24}?)\x1e {16}\x1e')  # ★ 加 \x1e 字段边界前缀: 只匹配完整线名字段, 杜绝从名字中间匹配出子串碎片

# 压缩标记: 可能出现在线名中间(如 Welding D \x00\x00p\x02line)或字段中间(如 62.8\x00\x00p\x020)
# → 必须在正则匹配前对整条流做清理, 否则线名被拆成残片(ng D line/g D line/line...)或字段错位
STREAM_CLEAN_RE = [
    re.compile(rb'\x14\x00\x00p\x02'),
    re.compile(rb'\x00\x00p\x02'),
    re.compile(rb'\x00+p'),
]
def clean_stream(b):
    for r in STREAM_CLEAN_RE:
        b = r.sub(b'', b)
    return b

def parse_pcapng(path):
    data = open(path, "rb").read()
    pos = 0
    s2c = b""
    while pos + 12 <= len(data):
        btype, blen = struct.unpack_from("<II", data, pos)
        if blen < 12 or pos + blen > len(data):
            break
        if btype == 0x00000006:
            caplen = struct.unpack_from("<I", data, pos + 24)[0]
            pkt = data[pos + 32 : pos + 32 + caplen]
            if len(pkt) >= 54:
                # IP at offset 10, TCP header after IHL
                if pkt[10] >> 4 == 4:
                    ihl = (pkt[10] & 0x0F) * 4
                    tcp_off = 10 + ihl
                    sport, dport = struct.unpack_from(">HH", pkt, tcp_off)
                    if sport == 7001:
                        hlen = (pkt[tcp_off + 12] >> 4) * 4
                        s2c += pkt[tcp_off + hlen:]
        pos += blen
    return s2c

def clean(field):
    # remove compression/garbage markers that can split tokens (e.g. Tr<00 00 p 02>ue)
    field = re.sub(rb'\x14\x00\x00p\x02', b'', field)
    field = re.sub(rb'\x00\x00p\x02', b'', field)
    field = re.sub(rb'\x00+p', b'', field)
    return "".join(chr(b) if 32 <= b < 127 else "" for b in field).strip()

def num(s):
    s2 = re.sub(r'[A-Za-z]', '', s)
    m = re.match(r'-?\d+(?:\.\d+)?', s2)
    return float(m.group(0)) if m else None

def parse(s2c):
    s2c = clean_stream(s2c)  # ★ 整流清理压缩标记后再匹配线名/字段
    _cand, order = {}, []
    for m in NAME_RE.finditer(s2c):
        name = clean(m.group(1))
        if not name:
            continue
        # ★ 丢弃残片线名(真实线名长度>=6; 残片如 'line'/'ne'/'B' 是被压包破坏名字的重复推送)
        if len(name) < 5:
            continue
        chunk = s2c[m.end():m.end()+400]
        parts = [clean(p) for p in chunk.split(b"\x1e")]
        if len(parts) < 12:
            continue
        status_flag = parts[9:12]
        if len(status_flag) < 3 or status_flag[0] != "True":
            continue
        _cand[name] = {
            "name": name,
            "target": num(parts[1]),
            "plan": num(parts[2]),
            "start": parts[3],
            "updated": parts[4],
            "actual": num(parts[5]),
            "cb": num(parts[6]),
            "eff": num(parts[7]),
            "ip": next((p for p in parts[12:] if re.match(r'^\d+\.\d+\.\d+\.\d+$', p)), ""),
        }
        if name not in order:
            order.append(name)
    # ★ 统一过滤子串残片: 'otor C  line' 是 'Rotor C  line' 去空格后的子串 → 丢弃
    def _norm(n): return (n or "").lower().replace(" ", "").replace("\t", "")
    _norm_map = {k: _norm(k) for k in _cand}
    _drop = set()
    for k in _cand:
        nk = _norm_map[k]
        for k2 in _cand:
            if k2 == k or len(_norm_map[k2]) <= len(nk):
                continue
            if nk and nk in _norm_map[k2]:
                _drop.add(k)
                break
    for k in _drop:
        del _cand[k]
    order = [n for n in order if n not in _drop]
    return _cand, order

def main():
    pcap = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PCAP
    s2c = parse_pcapng(pcap)
    if not s2c:
        print("ERR no 7001 S2C data in", pcap)
        sys.exit(1)
    lines, order = parse(s2c)
    if not lines:
        print("ERR no lines parsed")
        sys.exit(1)
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    # ---- 持久缓存合并: 本轮抓到的线更新, 没抓到的沿用旧值 ----
    cache = {"order": [], "lines": {}}
    try:
        with open(CACHE, encoding="utf-8") as f:
            cache = json.load(f)
        if not isinstance(cache.get("lines"), dict):
            cache = {"order": [], "lines": {}}
    except Exception:
        cache = {"order": [], "lines": {}}
    merged = cache["lines"]
    merged_order = cache["order"]
    # ★ 清理缓存中遗留的残片线名: 长度<5 或 是另一个更长线名的子串(去空格后)
    #   'otor C  line'⊂'Rotor C  line'、'line'⊂'Welding D line'、'otor CL'⊂'Motor CL'
    #   这些是名字被压包吃掉首字母/中间部分后的重复记录, 数据与完整线重复, 可安全丢弃
    def _norm(n): return (n or "").lower().replace(" ", "").replace("\t", "")
    _keys = list(merged.keys())
    _norm_keys = {k: _norm(k) for k in _keys}
    bad = set()
    for k in _keys:
        nk = _norm_keys[k]
        if len(k) < 5:
            bad.add(k); continue
        # 是其他更长名字的子串(去空格后) → 残片
        for k2 in _keys:
            if k2 == k or len(_norm_keys[k2]) <= len(nk):
                continue
            if nk and nk in _norm_keys[k2]:
                bad.add(k)
                break
    for k in bad:
        del merged[k]
    if bad:
        merged_order = [n for n in merged_order if n not in bad]
    STALL_ROUNDS = 8   # 连续8轮(≈5分钟) actual 无变化 → 停滞 (37s/轮)
    # ★ 停滞检测只作用于主要线体（与看板 MAIN_LINES 一致），其他线不参与
    MAIN_LINES = [
        "Final A line", "Final B Line", "Final C line", "Final D line",
        "Motor H-Series", "Motor S-Series", "Motor F-Series", "Motor WL"
    ]
    MAIN_SET = {_norm(x) for x in MAIN_LINES}
    for name, rec in lines.items():
        rec["pushed"] = now          # 最后推送时间(本轮刚抓到)
        is_main = _norm(name) in MAIN_SET
        if name not in merged:
            merged_order.append(name)
            rec["stallCnt"] = 0
            rec["prevActual"] = rec.get("actual")
            rec["stalled"] = False
            merged[name] = rec
        else:
            old = merged[name]
            prev = old.get("actual")
            cur = rec.get("actual") or 0
            # ★ 只对运行中的线(actual>0)检测停滞: actual<=0 的线(-OFF/未运行)不累积, 避免误报
            if is_main and cur > 0 and prev is not None and abs(cur - (prev or 0)) < 0.5:
                rec["stallCnt"] = (old.get("stallCnt") or 0) + 1
            else:
                rec["stallCnt"] = 0
            rec["stalled"] = is_main and cur > 0 and rec["stallCnt"] >= STALL_ROUNDS
            merged[name] = rec
    # ---- 小时产量快照: 每小时末记录累计值, 前端差值算每小时产量/目标 ----
    hourly_cache = {}
    try:
        with open(HOUR_CACHE, encoding="utf-8") as f:
            hourly_cache = json.load(f)
        if not isinstance(hourly_cache, dict):
            hourly_cache = {}
    except Exception:
        hourly_cache = {}
    today = now[:10]
    hour = int(now[11:13])
    day_snaps = hourly_cache.setdefault(today, {})
    for name, rec in lines.items():
        snaps = day_snaps.setdefault(name, [])
        if snaps and snaps[-1]["h"] == hour:
            snaps[-1]["actual"] = rec.get("actual") or 0
            snaps[-1]["plan"] = rec.get("plan") or 0
        else:
            snaps.append({"h": hour, "actual": rec.get("actual") or 0, "plan": rec.get("plan") or 0})
    # ★ 清理当天快照里的历史碎片键(旧版解析出的 'g D line'/'line'/'otor CL' 等)
    #   白名单 = 合并后的完整线名(本轮+缓存兜底), 避免偶发缺抓误删; 再补子串残片检测
    _cur_names = list(merged.keys())
    _cur_norm = {_norm(x) for x in _cur_names}
    _snap_keys = list(day_snaps.keys())
    _drop_snap = set()
    for k in _snap_keys:
        nk = _norm(k)
        if nk not in _cur_norm:
            _drop_snap.add(k)
            continue
        # 子串残片(与干净线同名但被压包): 去空格后是另一条更长干净线的子串
        for k2 in _cur_names:
            nk2 = _norm(k2)
            if nk == nk2 or len(nk2) <= len(nk):
                continue
            if nk and nk in nk2:
                _drop_snap.add(k)
                break
    for k in _drop_snap:
        del day_snaps[k]
    for nm in day_snaps:
        if len(day_snaps[nm]) > 12:
            day_snaps[nm] = day_snaps[nm][-12:]
    # ---- 组装看板数据 ----
    dash_lines = []
    for n in merged_order:
        r = merged.get(n)
        if not r:
            continue
        dash_lines.append({
            "name": r["name"],
            "time": (r.get("start") or "")[:8],
            "target": r.get("target") or 0,
            "plan": r.get("plan") or 0,
            "actual": r.get("actual") or 0,
            "cb": r.get("cb") if r.get("cb") is not None else 0,
            "cum": r.get("actual") or 0,
            "eff": r.get("eff"),
            "status": "STALLED" if r.get("stalled") else ("RUNNING" if (r.get("actual") and r["actual"] > 0) else "-OFF"),
            "stalled": r.get("stalled") or False,
            "pushed": r.get("pushed") or "",
        })
    out = {
        "mode": "live",
        "updatedAt": now,
        "source": "packet capture 10.3.176.20:7001 (passive)",
        "lines": dash_lines,
        "hourly": day_snaps,
    }
    with open(DASH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    try:
        with open(CACHE, "w", encoding="utf-8") as f:
            json.dump({"order": merged_order, "lines": merged}, f, ensure_ascii=False)
    except Exception as e:
        print("CACHE WARN: %s" % e)
    try:
        with open(HOUR_CACHE, "w", encoding="utf-8") as f:
            json.dump(hourly_cache, f, ensure_ascii=False)
    except Exception as e:
        print("HOUR WARN: %s" % e)
    print("OK %d lines -> %s @ %s" % (len(dash_lines), DASH, now))
    # 云端推送 (失败不影响本地, 只告警)
    try:
        req = urllib.request.Request(FIREBASE_URL,
            data=json.dumps(out).encode("utf-8"),
            method="PUT",
            headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=20) as r:
            print("FIREBASE OK (%d)" % r.status)
    except Exception as e:
        print("FIREBASE WARN: %s" % e)

if __name__ == "__main__":
    main()
