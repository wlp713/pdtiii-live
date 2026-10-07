# -*- coding: utf-8 -*-
"""从五个车间的 2026-10 SQDIP Excel 主表提取 KPI -> JSON（给 pdtiii 看板的 SQDIP 面板用）
- Pro.1 是 .xls(BIFF8) -> xlrd；其余 .xlsx -> openpyxl(read_only)
- 只读每个文件的主 SQDIP 数据表；目标值按原表（块标题文本里的 Target / 块内 Target 行 / 独立目标行）
"""
import json, os, re, sys, datetime

STAGE = "/mnt/c/Users/19777/Desktop/_sqdip_stage"

# ---------------- 底层读取 ----------------
def rows_xlsx(path, sheet):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[sheet]
    out = []
    for row in ws.iter_rows(max_col=min(ws.max_column, 60)):
        out.append([c.value for c in row])
    return out

def rows_xls(path, sheet):
    import xlrd
    wb = xlrd.open_workbook(path, on_demand=True)
    ws = wb.sheet_by_name(sheet)
    out = []
    for i in range(ws.nrows):
        out.append([ws.cell_value(i, j) for j in range(min(ws.ncols, 60))])
    return out

def load(path, sheet):
    if path.lower().endswith(".xls"):
        return rows_xls(path, sheet)
    return rows_xlsx(path, sheet)

# ---------------- 小工具 ----------------
def txt(v):
    if v is None: return ""
    if isinstance(v, float) and v == int(v): return str(int(v))
    return str(v)

def num(v):
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return float(v)
    if isinstance(v, str):
        s = v.strip().replace(",", "")
        try: return float(s)
        except Exception: return None
    return None

def is_num(v):
    return num(v) is not None

def clean_label(c):
    """C 列标签：第一段中文（主名）/ 第二段泰文"""
    if c is None: return "", ""
    s = str(c).replace("\r", "")
    parts = [p.strip() for p in s.split("\n") if p.strip()]
    zh = parts[0] if parts else ""
    th = parts[1] if len(parts) > 1 else ""
    return zh, th

def find_total_col(header):
    for i, v in enumerate(header):
        if isinstance(v, str) and v.strip().lower() in ("total", "total "):
            return i
    return None

def header_rows(rows):
    """C 列含 类别/目标 的行为块头行"""
    idx = []
    for i, r in enumerate(rows):
        c = r[2] if len(r) > 2 else None
        if isinstance(c, str) and "类别" in c and "目标" in c:
            idx.append(i)
    return idx

class Sheet:
    def __init__(self, rows):
        self.rows = rows
        self.hdr = header_rows(rows)
        self.total_col = None
        if self.hdr:
            self.total_col = find_total_col(rows[self.hdr[0]])
        if self.total_col is None:
            self.total_col = 34  # 兜底 AI
        self.dates = self._dates()

    def _dates(self):
        if not self.hdr: return []
        h = self.rows[self.hdr[0]]
        out = []
        for j in range(3, self.total_col):
            v = h[j] if j < len(h) else None
            if isinstance(v, (datetime.datetime, datetime.date)):
                d = v if isinstance(v, datetime.date) else v.date()
                out.append(d.strftime("%m-%d"))
            elif isinstance(v, (int, float)) and 46000 < v < 47000:  # excel serial
                d = datetime.date(1899, 12, 30) + datetime.timedelta(days=int(v))
                out.append(d.strftime("%m-%d"))
            elif isinstance(v, (int, float)) and 1 <= v <= 31:   # 纯日号（如 p45 的 1..31）
                out.append("10-%02d" % int(v))
            elif isinstance(v, str):
                if re.fullmatch(r"\s*\d{1,2}\s*", v) and 1 <= int(v.strip()) <= 31:   # 纯日号字符串
                    out.append("10-%02d" % int(v.strip()))
                    continue
                m = re.match(r"\s*(\d{1,2})\s*[-/]\s*([A-Za-z]{3,})", v)   # 如 "1 - Oct"
                if m:
                    mon = m.group(2)[:3].title()
                    mm = {"Jan":"01","Feb":"02","Mar":"03","Apr":"04","May":"05","Jun":"06",
                          "Jul":"07","Aug":"08","Sep":"09","Oct":"10","Nov":"11","Dec":"12"}.get(mon)
                    out.append("%s-%02d" % (mm, int(m.group(1))) if mm else None)
                else:
                    out.append(None)
            else:
                out.append(None)
        return out

    def blocks(self):
        """返回 [{dim,title,start,end,rows:[(rowidx, zh, th, values, total)]}]"""
        res = []
        hdrs = self.hdr
        for k, hi in enumerate(hdrs):
            end = hdrs[k + 1] if k + 1 < len(hdrs) else len(self.rows)
            braw = None
            for j in range(hi + 1, end):
                r1 = self.rows[j][1] if len(self.rows[j]) > 1 else None
                if isinstance(r1, str) and r1.strip() and r1.strip() != "กราฟข้อมูล":
                    braw = r1
                    break
            b = str(braw).replace("\n", " ").strip() if braw else ""
            body = []
            for j in range(hi + 1, end):
                r = self.rows[j]
                c = r[2] if len(r) > 2 else None
                b2 = r[1] if len(r) > 1 else None
                if not c: continue
                if isinstance(b2, str) and b2.strip() == "กราฟข้อมูล": continue
                zh, th = clean_label(c)
                if not zh: continue
                vals = [num(r[x]) for x in range(3, min(len(r), self.total_col))]
                body.append((j, zh, th, vals, self.total(r)))
            res.append({"dim": b[:1], "title": b, "start": hi, "rows": body})
        return res

    def total(self, r):
        for x in (self.total_col, self.total_col + 1, self.total_col + 2):
            if x < len(r):
                v = num(r[x])
                if v is not None:
                    return v
        return None

    def find_row(self, b_sub, c_sub, occ=0):
        """返回匹配到的行对象 (block标题, zh, th, vals, total)"""
        hit = 0
        for blk in self.blocks():
            if b_sub and b_sub not in blk["title"]: continue
            for (j, zh, th, vals, tot) in blk["rows"]:
                if c_sub in zh or (th and c_sub in th):
                    if hit == occ:
                        return (blk["title"], zh, th, vals, tot)
                    hit += 1
        return None

    def find(self, b_sub, c_sub, occ=0):
        got = self.find_row(b_sub, c_sub, occ)
        if got is None: return None
        _, zh, th, _, tot = got
        return zh, th, tot

    def last_day_ref(self, b_sub, c_sub):
        got = self.find_row(b_sub, c_sub)
        if got is None: return None
        _, _, _, vals, _ = got
        for j in range(len(self.dates) - 1, -1, -1):
            if j < len(vals) and vals[j] not in (None, 0):
                return self.dates[j]
        return None

    def last_day(self):
        """最后一个不少于 2 个块都有非零数据的日期（避开尾部零散残留值的干扰）"""
        blks = self.blocks()
        for j in range(len(self.dates) - 1, -1, -1):
            cnt = 0
            for blk in blks:
                hit = any(j < len(vals) and vals[j] not in (None, 0) for (_, _, _, vals, _) in blk["rows"])
                if hit: cnt += 1
            if cnt >= 2:
                return self.dates[j]
        return None

# ---------------- 每个车间的取数清单 ----------------
# (dim, b_sub, c_sub, 显示名, 泰文, 单位, 目标, 目标文本, 方向, 格式)
# 方向: up=越高越好 / down=越低越好 / zero=必须为0 / na=不判定
SPEC = {
 "Pro.1": dict(file="p1.xls", sheet="SQDIP", cn="一号线", src="10.PRO.1 SQDIP OCT-2026.xls",
   lastday_ref=("Inprocess", "产量"), notes={"闭环率": "闭环"}, rows=[
   ("S","安全","安全事故","安全事故","อุบัติเหตุ","件",0,"Zero","zero","int"),
   ("S","改善","闭环率","5S 闭环率",None,"%",None,None,"na","pct"),
   ("Q","Inprocess","产量","产量","ยอดผลิต","件",None,None,"na","int"),
   ("Q","Inprocess","不良数","不良数","งานเสีย","件",None,None,"na","int"),
   ("Q","Inprocess","费用","不良成本","Cost","฿",None,None,"na","int"),
   ("D","Loss Pro.1","每天损失套","损失套","Loss","套",50,"50/天","na","int"),
   ("D","Loss Pro.1","Loss Pro.2","Loss Pro.2",None,"套",0,"0","zero","int"),
   ("D","Loss Pro.1","损耗率","损耗率","ความสูญเสีย","%",0,"0","down","pct"),
   ("I","Wait Part","等待部件","等待部件","Wait Parts","件",0,"0","zero","int"),
   ("I","Wait Part","等待状态机","等待状态机","Wait Stator","件",0,"0","zero","int"),
   ("I","Wait Part","完成率","完成率","ความสำเร็จ","%",100,"100%","up","pct"),
   ("P","效率","产量","产量","เป้าหมาย","件",None,None,"na","int"),
   ("P","效率","人数","人数","จำนวนคน","人",None,None,"na","int"),
   ("P","效率","工作时间","工作时间","ชั่วโมง","h",None,None,"na","num1"),
   ("P","效率","UPPH","UPPH","UPPH","件/人·h",10.21,"10.21","up","num2"),
 ]),
 "Pro.2": dict(file="p2.xlsx", sheet="SQDIP", cn="二号线", src="Pro2 SQDIP 10 2026.xlsx",
   lastday_ref=("Line Out", "产量"), notes={"闭环率": "闭环", "完成率": "完成"}, rows=[
   ("S","安全","安全事故","安全事故","อุบัติเหตุ","件",0,"Zero","zero","int"),
   ("S","改善","闭环率","5S 闭环率",None,"%",None,None,"na","pct"),
   ("Q","Line Out","产量","NG线外 产量","ยอดผลิต","件",None,None,"na","int"),
   ("Q","Line Out","不良数","NG线外 不良",None,"件",None,None,"na","int"),
   ("Q","Line Out","PPM","NG线外 PPM",None,"PPM",None,None,"down","int"),
   ("Q","焊接","产量","焊接 产量",None,"件",None,None,"na","int"),
   ("Q","焊接","不良数","焊接 不良",None,"件",None,None,"na","int"),
   ("Q","焊接","%","焊接 NG%",None,"%",None,None,"down","num2"),
   ("D","作业完成率","作业个数","作业个数","JOB/MO","个",None,None,"na","int"),
   ("D","作业完成率","完成数","完成数",None,"个",None,None,"na","int"),
   ("D","作业完成率","完成率","完成率","ความสำเร็จ","%",100,"100%","up","pct"),
   ("I","Loss Cost","产量","产量",None,"件",None,None,"na","int"),
   ("I","Loss Cost","不良金额","不良金额",None,"฿",None,None,"na","int"),
   ("I","Loss Cost","损耗率","损耗率",None,"%",None,None,"down","num2"),
   ("P","效率","人数","人数","จำนวนคน","人",None,None,"na","int"),
   ("P","效率","工时","工时","ชั่วโมง","h",None,None,"na","int"),
   ("P","效率","UPPH","UPPH","UPPH","件/人·h",10.73,"10.73","up","num2"),
 ]),
 "Pro.3": dict(file="p3.xlsx", sheet="SQDIP", cn="三号线", src="Pro3 SQDIP Oct 2026 (New).xlsx",
   lastday_ref=("焊接", "产量"), notes={"闭环率": "闭环"}, rows=[
   ("S","安全","安全事故","安全事故","อุบัติเหตุ","件",0,"Zero","zero","int"),
   ("S","改善","闭环率","5S 闭环率",None,"%",90,"90%/月","up","pct"),
   ("Q","Line Out","产量","NG线外 产量",None,"件",None,None,"na","int"),
   ("Q","Line Out","不良数","NG线外 不良",None,"件",None,None,"na","int"),
   ("Q","Line Out","PPM","NG线外 PPM",None,"PPM",None,None,"down","int"),
   ("Q","焊接","产量","焊接 产量",None,"件",None,None,"na","int"),
   ("Q","焊接","不良数","焊接 不良",None,"件",None,None,"na","int"),
   ("Q","焊接","อัตรา NG","焊接 NG%",None,"%",0.71,"0.71%","down","num2"),
   ("Q","焊接","不良金额","焊接 不良金额",None,"฿",None,None,"na","int"),
   ("D","作业完成率","产量","Energy 产量",None,"件",None,None,"na","int"),
   ("D","作业完成率","完成数","Energy 完成",None,"kWh",None,None,"na","num1"),
   ("D","作业完成率","完成率","Energy 完成率",None,"%",None,None,"na","pct"),
   ("I","Loss wait","产量","产量",None,"件",None,None,"na","int"),
   ("I","Loss wait","损耗率","损耗率",None,"%",0,"0","down","num2"),
   ("P","效率","人数","人数","จำนวนคน","人",None,None,"na","int"),
   ("P","效率","工时","工时","ชั่วโมง","h",None,None,"na","num1"),
   ("P","效率","UPPH","UPPH","UPPH","件/人·h",25,"25.0","up","num2"),
 ]),
 "Pro.4-5": dict(file="p45.xlsx", sheet="SQDIP (ข้อมูล)", cn="四/五号线", src="P4_DM Kanban__10-2026.xlsx",
   lastday_ref=("Production 4", "不良数"), notes={"闭环率": "闭环"}, rows=[
   ("S","安全","安全事故","安全事故","อุบัติเหตุ","件",0,"Zero","zero","int"),
   ("S","改善","闭环率","5S 闭环率",None,"%",None,None,"na","pct"),
   ("Q","Production 4","不良数","NG 不良(综合)","งานเสีย","件",8500,"≤8500","down","int"),
   ("Q","Production 4","Cost","NG 成本(综合)","Cost","฿",None,None,"na","int"),
   ("D","Loss NG","Loss Pro.2","Loss Pro.2",None,"套",0,"0","zero","int"),
   ("D","Loss NG","完成率","Loss 完成率",None,"%",100,"100%","up","pct"),
   ("I","Wait Part","No Wait Parts","等待零件","Wait Parts","次",0,"0","zero","int"),
   ("I","Wait Part","Q'ty case","等待批次",None,"次",0,"0","zero","int"),
   ("I","Wait Part","完成率","完成率",None,"%",100,"100%","up","pct"),
   ("P","ประสิทธิภาพ","产量","产量",None,"件",None,None,"na","int"),
   ("P","ประสิทธิภาพ","人数","人数","จำนวนคน","人",None,None,"na","num1"),
   ("P","ประสิทธิภาพ","OT","OT","OT","h",None,None,"na","num1"),
   ("P","ประสิทธิภาพ","UPPH","UPPH","UPPH","件/人·h",10,"10.0","up","num2"),
 ]),
 "Pro.6": dict(file="p6.xlsx", sheet="SQDIP", cn="六号线", src="SQDIP Oct-2026.xlsx",
   lastday_ref=("Stator", "产量"), sum_zero=True, notes={"闭环率": "闭环", "完成率": "完成"},
   ratio_calc={"完成率": ("完成数", "作业个数"), "闭环率": ("闭环数", "项目数"),
               "PPM": ("不良数", "产量")}, rows=[
   ("S","安全","安全事故","安全事故","อุบัติเหตุ","件",0,"Zero","zero","int"),
   ("S","改善","闭环率","5S 闭环率",None,"%",None,None,"na","pct"),
   ("Q","Stator","产量","Stator 产量",None,"件",2500,"2500/天","na","int"),
   ("Q","Stator","不良数","Stator 不良",None,"฿",None,None,"na","int"),
   ("Q","Stator","PPM","Stator 单位不良",None,"฿/件",None,None,"na","num2"),
   ("Q","Rotor","产量","Rotor 产量",None,"件",1500,"1500/天","na","int"),
   ("Q","Rotor","不良数","Rotor 不良",None,"฿",None,None,"na","int"),
   ("Q","Rotor","PPM","Rotor 单位不良",None,"฿/件",None,None,"na","num2"),
   ("Q","Suc-Valve","产量","Suc-Valve 产量",None,"件",910,"910/天","na","int"),
   ("Q","Suc-Valve","不良数","Suc-Valve 不良",None,"฿",None,None,"na","int"),
   ("Q","Suc-Valve","PPM","Suc-Valve 单位不良",None,"฿/件",None,None,"na","num2"),
   ("D","作业完成率","作业个数","作业个数","JOB/MO","个",None,None,"na","int"),
   ("D","作业完成率","完成数","完成数",None,"个",None,None,"na","int"),
   ("D","作业完成率","完成率","完成率","ความสำเร็จ","%",100,"100%","up","pct"),
   ("I","Energy","不良金额","电费异常",None,"฿",None,None,"na","int"),
   ("I","Energy","损耗率","损耗率",None,"%",None,None,"down","num2"),
   ("P","效率","产量","产量",None,"件",None,None,"na","int"),
   ("P","效率","人数","人数","จำนวนคน","人",None,None,"na","int"),
   ("P","效率","工作时间","工作时间",None,"h",None,None,"na","num1"),
   ("P","效率","UPPH","UPPH","UPPH","件/人·h",85,"85","up","num2"),
 ]),
}

def fmt_value(v, fmt):
    """返回 (显示字符串, 判定用的数值)"""
    if v is None: return "--", None
    if fmt == "int": return ("%d" % round(v)), v
    if fmt == "num1": return ("%.1f" % v), v
    if fmt == "num2": return ("%.2f" % v), v
    if fmt == "pct":
        p = v * 100 if abs(v) <= 1.5 else v
        return ("%.0f%%" % p), p
    return str(v), v

def status_of(v, target, direction):
    if v is None or target is None or direction == "na":
        return "na"
    if direction == "zero":
        return "good" if abs(v) < 1e-9 else "bad"
    if direction == "down":
        if v <= target: return "good"
        return "warn" if v <= target * 1.2 else "bad"
    if direction == "up":
        if v >= target: return "good"
        return "warn" if v >= target * 0.9 else "bad"
    return "na"

def build():
    out = {"generatedAt": datetime.datetime.now().astimezone().strftime("%Y-%m-%dT%H:%M:%S%z"),
           "month": "2026-10", "workshops": []}
    for wid, conf in SPEC.items():
        path = os.path.join(STAGE, conf["file"])
        sh = Sheet(load(path, conf["sheet"]))
        sum_zero = conf.get("sum_zero", False)
        ratio_calc = conf.get("ratio_calc", {})
        # 1) 先把所有需要行的原始值读出来（含 total 为 0 时用日值求和兜底）
        cache = {}
        for (dim, b_sub, c_sub, name, th, unit, target, ttext, direction, fmt) in conf["rows"]:
            got = sh.find_row(b_sub, c_sub)
            if got is None: continue
            _, zh, th_src, vals, tot = got
            clean = [v for v in vals if v is not None]
            if c_sub in ratio_calc:
                # 比率为空 -> 分子/分母（同块内，miss 时回表再取）
                def _val_of(sub):
                    k = (dim, b_sub, sub)
                    if k in cache: return cache[k][2]
                    g = sh.find_row(b_sub, sub)
                    if not g: return None
                    t = g[4]
                    if sum_zero and (t is None or t == 0):
                        cl = [x for x in g[3] if x is not None]
                        if cl and sum(cl) > 0: t = sum(cl)
                    return t
                if tot is None:
                    nc, dc = ratio_calc[c_sub]
                    va, vb = _val_of(nc), _val_of(dc)
                    if va and vb:
                        tot = va / vb
            elif sum_zero and (tot is None or tot == 0) and clean and sum(clean) > 0:
                # 总列公式坏掉（如 p6）时用日值求和兜底
                tot = sum(clean)
            if tot == 0 and all(v is None for v in vals):
                tot = None          # 全空 + 总列 0 -> 视为无数据（避免误报红）
            cache[(dim, b_sub, c_sub)] = (zh, th_src, tot, b_sub)
        # 2) 组织输出
        dims, missing = [], []
        order = ["S", "Q", "D", "I", "P"]
        dim_titles = {"S": "安全 S-Safety", "Q": "品质 Quality", "D": "交付 Delivery",
                      "I": "人员/损失 I", "P": "效率 Productivity"}
        for d in order:
            rows_out = []
            for (dim, b_sub, c_sub, name, th, unit, target, ttext, direction, fmt) in conf["rows"]:
                if dim != d: continue
                if (dim, b_sub, c_sub) not in cache:
                    missing.append("%s / %s / %s" % (dim, b_sub, c_sub))
                    continue
                zh, th_src, tot, _blk = cache[(dim, b_sub, c_sub)]
                disp, vnum = fmt_value(tot, fmt)
                note = None
                if c_sub in conf.get("notes", {}) and conf.get("notes").get(c_sub):
                    pair = {"闭环": ("闭环数", "项目数"), "完成": ("完成数", "作业个数")}.get(conf["notes"][c_sub])
                    if pair:
                        a = sh.find_row(b_sub, pair[0]); b2 = sh.find_row(b_sub, pair[1])
                        def _v(g):
                            if not g: return None
                            t = g[4]
                            if sum_zero and (t is None or t == 0):
                                cl = [x for x in g[3] if x is not None]
                                if cl and sum(cl) > 0: t = sum(cl)
                            return t
                        va, vb = _v(a), _v(b2)
                        if va is not None and vb is not None and va != 0:
                            note = "%d/%d" % (round(va), round(vb))
                rows_out.append({"name": name, "note": note, "th": th or th_src or None, "unit": unit,
                                 "block": b_sub,
                                 "target": target, "targetText": ttext, "dir": direction,
                                 "raw": tot, "disp": disp, "value": vnum,
                                 "status": status_of(vnum, target, direction)})
            if rows_out:
                dims.append({"key": d, "title": dim_titles[d], "rows": rows_out})
        mt = os.path.getmtime(path)
        ref = conf.get("lastday_ref")
        lastday = sh.last_day_ref(*ref) if ref else sh.last_day()
        out["workshops"].append({
            "id": wid, "cn": conf["cn"], "src": conf["src"], "sheet": conf["sheet"],
            "mtime": datetime.datetime.fromtimestamp(mt).strftime("%Y-%m-%d %H:%M"),
            "lastDay": lastday, "dims": dims, "missing": missing})
    return out

if __name__ == "__main__":
    data = build()
    dest = sys.argv[1] if len(sys.argv) > 1 else "sqdip_data.json"
    with open(dest, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print("saved", dest)
    for w in data["workshops"]:
        print("\n== %s (%s) 数据截止 %s  源 %s" % (w["id"], w["cn"], w["lastDay"], w["src"]))
        for d in w["dims"]:
            for r in d["rows"]:
                print("  [%s] %-14s %-10s 目标 %-8s  %s" % (
                    d["key"], r["name"], r["disp"], str(r["targetText"] or r["target"] or "-"), r["status"]))
        if w["missing"]:
            print("  !! 未匹配:", w["missing"])
