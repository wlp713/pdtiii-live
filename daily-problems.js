/* ═══════════════════════════════════════════════════════════════
   daily-problems.js — 每日制程问题点日志
   - 数据源: 静态种子 __DAILY_PROBLEMS_SEED__  + localStorage + Firebase(pdtiii_daily_problems)
   - 运行时统一暴露 window.__DAILY_PROBLEMS__ = { savedAt, byDate:{ 日期:[条目] } }
     条目: { date, shift(A-DAY..D-NIGHT), shiftLabel, dept(责任部门), impact(影响数), problem_th(泰语描述),
            owner(责任人), status(""未闭环 | DOING进行中 | CLOSED已闭环), due(承诺闭环日), closedAt(实际闭环日), action(措施摘要) }
   - ★ 2026-10-07 闭环化: 条目支持闭环 5 字段; 重新导入同一天时按「班次|部门|影响|描述」匹配并**继承**已有闭环字段(不冲掉手工填写);
     提供闭环率/超期/平均闭环天数统计 + 行内编辑 + CSV 导出(全部在原「问题点录入」面板内, 不新增页面)
   - 导入UI: 产出分析页顶栏挂"问题点录入"按钮; 支持粘贴文本/复制Excel(制表符)/.csv/.txt
   - 保存: localStorage + Firebase PUT 跨端同步(PUT 后立即生效, 无需重新部署)
   - 部署持久化: "导出部署数据" 生成 daily-problems-data.js 内容 → 复制/下载 → commit+push 到 main
   ═══════════════════════════════════════════════════════════════ */
(function () {
  if (window.__DAILY_PROBLEMS_MODULE__) return;
  window.__DAILY_PROBLEMS_MODULE__ = true;

  var FB_URL = "https://dm111-e8a7d-default-rtdb.firebaseio.com/pdtiii_daily_problems.json";
  var LS_KEY = "pdtiii_daily_problems_v1";

  var seed = (typeof window.__DAILY_PROBLEMS_SEED__ !== "undefined") ? window.__DAILY_PROBLEMS_SEED__ : null;
  var local = null;      // {savedAt, byDate}
  var remote = null;     // {savedAt, byDate}
  var merged = { savedAt: 0, byDate: {} };

  function emptyLast() { return "无"; }

  function cloneByDate(byDate) {
    var bd = {};
    if (!byDate) return bd;
    Object.keys(byDate).forEach(function (k) {
      bd[k] = (Array.isArray(byDate[k]) ? byDate[k] : []).map(function (r) { return Object.assign({}, r); });
    });
    return bd;
  }

  /* ── 闭环字段 (2026-10-07) ── */
  var CLOSURE_FIELDS = ["owner", "status", "due", "closedAt", "action"];
  var ST_LABEL = { "": "未闭环", "DOING": "进行中", "CLOSED": "已闭环" };
  var ST_COLOR = { "": "#b42318", "DOING": "#b54708", "CLOSED": "#1c7a3f" };

  function normStatus(v) {
    var s = String(v == null ? "" : v).trim();
    if (!s) return "";
    if (/^(已闭环|已关闭|闭环|完成|closed|close|done|ok|yes|y)$/i.test(s)) return "CLOSED";
    if (/^(进行中|处理中|跟进中|doing|wip|progress|processing)$/i.test(s)) return "DOING";
    return "";
  }
  function normDateLoose(v) {
    var s = String(v == null ? "" : v).trim();
    if (!s) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);   // 与导入一致: 日/月/年
    if (m) return m[3] + "-" + String(parseInt(m[2], 10)).padStart(2, "0") + "-" + String(parseInt(m[1], 10)).padStart(2, "0");
    var m2 = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (m2) return m2[1] + "-" + String(parseInt(m2[2], 10)).padStart(2, "0") + "-" + String(parseInt(m2[3], 10)).padStart(2, "0");
    return "";
  }
  function normClosure(p) {
    CLOSURE_FIELDS.forEach(function (f) { if (p[f] === undefined || p[f] === null) p[f] = ""; });
    p.owner = String(p.owner).trim();
    p.action = String(p.action).trim();
    p.status = normStatus(p.status);
    p.due = normDateLoose(p.due);
    p.closedAt = normDateLoose(p.closedAt);
    if (!p.status && p.closedAt) p.status = "CLOSED";
    return p;
  }
  function hasClosure(e) {
    return !!(e && (e.owner || e.status || e.due || e.closedAt || e.action));
  }

  /* ★ 2026-10-06 数据自愈: 早期导入把夜班写成 "B LINE N"(N=夜班) 没被识别 → shift 空;
     部门未标注 → dept 空。读取时用 raw 重新解析补齐, 老数据不用重新录入。 */
  function healEntry(r) {
    var p = Object.assign({}, r);
    if (p.raw && (!p.shift || !p.dept)) {
      var q = parseLine(p.raw);
      if (q) {
        if (!p.shift && q.shift) { p.shift = q.shift; p.shiftLabel = q.shiftLabel || p.shiftLabel || ""; }
        if (!p.dept && q.dept) p.dept = q.dept;
      }
    }
    return normClosure(p);
  }

  /* ★ 2026-10-07 重新导入同一天时继承闭环字段: 避免 Excel 数据集(无闭环列)把手工填写冲掉 */
  function entryKey(e) {
    return [e.shift || "", normDept(e.dept || ""), (e.impact === null || e.impact === undefined) ? "" : e.impact,
            String(e.problem_th || "").replace(/\s+/g, " ").trim()].join("|");
  }
  function carryClosure(oldArr, newArr) {
    if (!Array.isArray(oldArr) || !oldArr.length) return newArr;
    var map = {};
    oldArr.forEach(function (o) { if (hasClosure(o)) map[entryKey(o)] = o; });
    if (!Object.keys(map).length) return newArr;
    return newArr.map(function (n) {
      var o = map[entryKey(n)];
      if (o) CLOSURE_FIELDS.forEach(function (f) { if (!n[f] && o[f]) n[f] = o[f]; });
      return n;
    });
  }

  function overlay(dst, src) {
    if (!src) return dst;
    Object.keys(src).forEach(function (date) {
      if (Array.isArray(src[date]) && src[date].length) {
        var incoming = src[date].map(healEntry);
        dst[date] = dst[date] ? carryClosure(dst[date], incoming) : incoming;
      }
    });
    return dst;
  }

  function maxSaved() {
    var m = seed && seed.savedAt ? seed.savedAt : 0;
    if (local && local.savedAt > m) m = local.savedAt;
    if (remote && remote.savedAt > m) m = remote.savedAt;
    return m;
  }

  function rebuild() {
    var bd = {};
    overlay(bd, seed && seed.byDate);
    overlay(bd, local && local.byDate);
    overlay(bd, remote && remote.byDate);
    merged.savedAt = maxSaved();
    merged.byDate = bd;
    window.__DAILY_PROBLEMS__ = merged;
    window.__DAILY_PROBLEMS_READY__ = true;
    return stats();
  }

  function readLocal() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { return null; } }
  function writeLocal(p) { try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (e) {} }
  function readRemote() {
    return fetch(FB_URL + "?t=" + Date.now(), { signal: AbortSignal.timeout(8000) })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .catch(function () { return null; });
  }
  function writeRemote(p) {
    return fetch(FB_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ savedAt: p.savedAt, byDate: p.byDate }),
      signal: AbortSignal.timeout(8000)
    }).catch(function () { return null; });
  }
  function syncFromRemote() {
    readRemote().then(function (r) {
      if (!r || !r.byDate) return;
      var rT = Number(r.savedAt || 0);
      var lT = Number((local && local.savedAt) || 0);
      if (rT > lT) { remote = r; rebuild(); }
    });
  }

  /* ── 解析 (与 scripts/parse_daily_problems.js 一致, 浏览器独立实现) ── */
  var dateStart = /^\s*\d{1,2}\/\d{1,2}\/\d{4}\b/;
  function normalizeDate(s) {
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (!m) return "";
    return m[3] + "-" + String(parseInt(m[2], 10)).padStart(2, "0") + "-" + String(parseInt(m[1], 10)).padStart(2, "0");
  }
  function normDept(d) {
    var x = (d || "").replace(/\s+/g, "").toUpperCase().replace(/PRO\./g, "PRO.");
    if (x === "MODELCHANG" || x === "MODELCHANGE" || x === "CHANGEMODEL") return "CHANGEMODEL";
    return x;
  }
  function parseLine(raw) {
    var line = (raw || "").trim();
    if (!line) return null;
    var out = { raw: line, date: "", shift: "", shiftLabel: "", dept: "", impact: null, problem_th: "" };
    var dmm = line.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (dmm) out.date = normalizeDate(dmm[0]);
    var rest = dmm ? line.slice(dmm[0].length) : line;
    var sm = rest.match(/^\s*([A-D])\s*(LINE\s*)?(DAY|NIGHT|D|N)(?=\s|$)/i);
    if (sm) {
      var sfx = sm[3].toUpperCase();
      if (sfx === "D") sfx = "DAY";          // ★ 2026-10-06 兼容 "B LINE N" / "A LINE D" 简写
      if (sfx === "N") sfx = "NIGHT";
      out.shift = sm[1].toUpperCase() + "-" + sfx;
      out.shiftLabel = sm[0].trim();
      rest = rest.slice(sm[0].length);
    }
    var deptRe = /(PE|IP|QA|PRO[.\s]*[1-4]|Change\s*model|Model\s*chang[e]?)\s*$/i;
    var ptr = deptRe.exec(rest);
    if (ptr) { out.dept = normDept(ptr[1]); rest = rest.slice(0, ptr.index); }
    var nums = rest.match(/\d+/g);
    if (nums && nums.length) out.impact = parseInt(nums[nums.length - 1], 10);
    out.problem_th = rest.replace(/\s+$/g, "").trim();
    return out;
  }
  /* ── 表头式导入 (Excel 带表头复制 / CSV): 支持闭环列 ── */
  var HEADER_MAP = [
    [/^(日期|date|วันที่)$/, "date"],
    [/^(班次|shift|กะ)$/, "shift"],
    [/^(责任部门|部门|dept|department)$/, "dept"],
    [/^(影响数|影响|impact)$/, "impact"],
    [/^(泰语描述|泰语原文|描述|问题描述|问题|problem|problem_th|detail)$/, "problem_th"],
    [/^(责任人|负责人|owner|owner_name|ผู้รับผิดชอบ)$/, "owner"],
    [/^(状态|status|สถานะ)$/, "status"],
    [/^(承诺闭环日|承诺闭环|承诺日期|承诺闭环时间|承诺|due|due_date|plan_close)$/, "due"],
    [/^(实际闭环日|实际闭环|闭环日|实际闭环时间|closed|closed_at|close_date)$/, "closedAt"],
    [/^(措施摘要|措施|对策|action|action_note|countermeasure)$/, "action"]
  ];
  function splitRecords(text) {
    var delim = (text.indexOf("\t") >= 0) ? "\t" : ",";
    var toks = [], cur = "", q = false, i, ch;
    for (i = 0; i < text.length; i++) {
      ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { toks.push(cur); cur = ""; }
      else if (ch === "\n") { toks.push(cur); cur = ""; toks.push("\n"); }
      else if (ch !== "\r") cur += ch;
    }
    toks.push(cur);
    var rows = [], row = [];
    toks.forEach(function (t) { if (t === "\n") { rows.push(row); row = []; } else row.push(t); });
    if (row.length && (row.length > 1 || row[0].trim())) rows.push(row);
    return rows.filter(function (r) { return r.join("").trim() !== ""; });
  }
  function mapHeader(cells) {
    var map = {}, hit = 0;
    cells.forEach(function (c, i) {
      var k = String(c || "").replace(/\s+/g, "").replace(/[（(].*$/, "").toLowerCase();
      if (!k) return;
      for (var j = 0; j < HEADER_MAP.length; j++) {
        if (HEADER_MAP[j][0].test(k)) { if (map[HEADER_MAP[j][1]] === undefined) { map[HEADER_MAP[j][1]] = i; hit++; } break; }
      }
    });
    return (hit >= 3 && map.date !== undefined) ? map : null;
  }
  function parseTable(text) {
    var rows = splitRecords(text || "");
    if (rows.length < 2) return null;
    var map = mapHeader(rows[0]);
    if (!map) return null;
    var byDate = {}, all = [];
    rows.slice(1).forEach(function (cells) {
      function g(f) { var i = map[f]; return (i === undefined || cells[i] === undefined) ? "" : String(cells[i]).trim(); }
      var e = { raw: cells.join(" | "), date: "", shift: "", shiftLabel: "", dept: "", impact: null, problem_th: "" };
      var dv = g("date");
      e.date = /^\d{4}-\d{2}-\d{2}$/.test(dv) ? dv : normalizeDate(dv);
      var sv = g("shift");
      var sm = sv.match(/^\s*([A-D])\s*(?:LINE\s*)?(DAY|NIGHT|D|N)\s*$/i);
      if (sm) {
        var sfx = sm[2].toUpperCase();
        if (sfx === "D") sfx = "DAY";
        if (sfx === "N") sfx = "NIGHT";
        e.shift = sm[1].toUpperCase() + "-" + sfx;
        e.shiftLabel = sv;
      }
      e.dept = normDept(g("dept"));
      var iv = g("impact").replace(/[^\d.-]/g, "");
      e.impact = iv === "" ? null : parseInt(iv, 10);
      e.problem_th = g("problem_th");
      e.owner = g("owner");
      e.status = g("status");
      e.due = g("due");
      e.closedAt = g("closedAt");
      e.action = g("action");
      if (!e.date) {
        var p0 = parseLine([dv, sv, e.problem_th, g("impact"), e.dept].join(" "));
        if (p0 && p0.date) { e.date = p0.date; if (!e.shift && p0.shift) { e.shift = p0.shift; e.shiftLabel = p0.shiftLabel; } if (!e.dept && p0.dept) e.dept = p0.dept; }
      }
      if (!e.date) return;
      e = normClosure(e);
      all.push(e);
      (byDate[e.date] = byDate[e.date] || []).push(e);
    });
    if (!all.length) return null;
    return { byDate: byDate, all: all };
  }

  function parseProblems(text) {
    var tab = parseTable(text);          // 带表头(含闭环列) → 先试表格
    if (tab) return tab;
    var byDate = {}, all = [], pending = [];
    function flush() {
      if (!pending.length) return;
      var raw = pending.join(" ").replace(/\s+/g, " ").trim()
        .replace(/^"/, "").replace(/"$/, "").trim();
      pending = [];
      if (!raw) return;
      var p = parseLine(raw);
      if (!p || !p.date) return;
      p = normClosure(p);            // 统一带上闭环 5 字段(老路径也一致)
      all.push(p);
      if (!byDate[p.date]) byDate[p.date] = [];
      byDate[p.date].push(p);
    }
    (text || "").split(/\r?\n/).forEach(function (ln) {
      if (!ln.trim()) { flush(); return; }
      if (dateStart.test(ln)) { flush(); pending = [ln]; }
      else pending.push(ln);
    });
    flush();
    return { byDate: byDate, all: all };
  }

  /* ── 统计 ── */
  function stats() {
    var dates = Object.keys(merged.byDate).sort();
    var total = dates.reduce(function (s, d) { return s + merged.byDate[d].length; }, 0);
    return { days: dates.length, total: total, dates: dates, first: dates[0] || "", last: dates[dates.length - 1] || "", savedAt: merged.savedAt };
  }
  function refreshStats() {
    var s = stats();
    var el = document.getElementById("dpStats");
    if (el) el.textContent = "已录入 " + s.days + " 天 · " + s.total + " 条 · 覆盖 " + (s.first ? s.first + " → " + s.last : "无") + " · " + (s.savedAt ? "最近保存 " + new Date(s.savedAt).toLocaleString("zh-CN", { hour12: false }) : "");
    var countEl = document.getElementById("dpBtnCount");
    if (countEl) {
      var btn = document.getElementById("dpBtn");
      if (btn) btn.querySelector("span").textContent = "问题点(" + s.total + ")";
    }
  }

  /* ── 导出部署数据: 生成 daily-problems-data.js 内容 ── */
  function exportData() {
    var dates = Object.keys(merged.byDate).sort();
    var total = dates.reduce(function (s, d) { return s + merged.byDate[d].length; }, 0);
    var payload = { savedAt: merged.savedAt, notes: "每日制程问题点日志; 泰语原文保留, 中文翻译由 AI 按提问语言即时处理; 字段 date/shift(班次)/dept(责任部门)/impact(影响数)/problem_th(泰语描述)/owner(责任人)/status(空=未闭环,DOING=进行中,CLOSED=已闭环)/due(承诺闭环日)/closedAt(实际闭环日)/action(措施摘要)", byDate: merged.byDate };
    var js = "/* ══════════════════════════════════════════════════════\n   daily-problems-data.js — 每日制程问题点日志种子数据\n   条目: { date, shift(A-DAY..D-NIGHT), dept(责任部门), impact(影响数), problem_th(泰语原文) }\n   覆盖 " + dates.length + " 天 / " + total + " 条; 由「问题点录入」导出\n   ══════════════════════════════════════════════════════ */\nwindow.__DAILY_PROBLEMS_SEED__ = " + JSON.stringify(payload, null, 1) + ";\n";
    return js;
  }
  function downloadExport() {
    var js = exportData();
    var blob = new Blob([js], { type: "text/javascript;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "daily-problems-data.js";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    return js;
  }
  function copyExport() {
    var js = exportData();
    (navigator.clipboard ? navigator.clipboard.writeText(js) : Promise.reject()).then(
      function () { flash("已复制 daily-problems-data.js 到剪贴板 → 粘贴保存为文件后 commit 推送到 main 即完成永久部署"); },
      function () { flash("复制失败, 请用「下载」获得文件"); }
    );
  }
  function flash(msg) {
    var el = document.getElementById("dpMsg");
    if (el) { el.textContent = msg; el.style.color = "#1c7a3f"; el.style.opacity = "1"; setTimeout(function () { el.style.opacity = "0.6"; }, 6000); }
  }

  /* ── 解析预览 ── */
  function applyPreview(byDate) {
    var dates = Object.keys(byDate).sort();
    var rows = [];
    dates.forEach(function (d) { rows = rows.concat(byDate[d]); });
    var tbody = document.getElementById("dpPreviewBody");
    var tab = document.getElementById("dpPreview");
    var hint = document.getElementById("dpParseHint");
    if (!rows.length) { tab.style.display = "none"; if (hint) hint.textContent = "未解析出有效条目"; return; }
    tab.style.display = "";
    var cap = 200;
    var html = rows.slice(0, cap).map(function (p, i) {
      return '<tr data-i="' + i + '"><td>' + p.date + '</td><td>' + (p.shiftLabel || "-") + '</td><td class="dp-dept">' + (p.dept || "-") + '</td><td class="dp-imp">' + (p.impact === null ? "-" : p.impact) + '</td><td class="dp-th">' + escapeHtml(p.problem_th || "") + '</td></tr>';
    }).join("");
    html = '<tr class="dp-hd"><th>日期</th><th>班次</th><th>部门</th><th>影响</th><th>泰语描述</th></tr>' + html;
    tbody.innerHTML = (rows.length > cap) ? html + '<tr><td colspan="5">…仅预览前 ' + cap + ' 条, 共 ' + rows.length + ' 条, 全部会保存</td></tr>' : html;
    if (hint) hint.textContent = "解析出 " + rows.length + " 条 → 请核对后点「保存到看板」";
  }
  function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  /* ── 保存: 合并到当前数据并持久化 ── */
  function doSave(byDate) {
    var next = cloneByDate(merged.byDate);
    overlay(next, byDate);            // 导入日期整体替换
    var payload = { savedAt: Date.now(), byDate: next };
    writeLocal(payload);
    local = payload;
    writeRemote(payload);             // 立即同步 Firebase
    rebuild();
    refreshStats();
    flash("已保存到看板并同步 Firebase(" + stats().total + " 条)。立即生效, AI 已可查询。注意: 刷新后永久生效需「导出部署数据」推送到 GitHub。");
  }
  function doClearDate(date) {
    if (!date) return;
    var next = cloneByDate(merged.byDate);
    delete next[date];
    var payload = { savedAt: Date.now(), byDate: next };
    writeLocal(payload); local = payload;
    writeRemote(payload);
    rebuild();
    refreshStats();
    flash("已清除 " + date + " 的问题点");
  }

  /* ── 闭环管理 (2026-10-07): 统计 + 行内编辑 + CSV ── */
  var _closureFilter = { days: 14, dept: "", status: "open" };
  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function daysDiff(a, b) {
    if (!a || !b) return null;
    var t1 = Date.parse(a + "T00:00:00"), t2 = Date.parse(b + "T00:00:00");
    if (isNaN(t1) || isNaN(t2)) return null;
    return Math.round((t2 - t1) / 86400000);
  }
  function allDepts() {
    var s = {};
    Object.keys(merged.byDate).forEach(function (d) { merged.byDate[d].forEach(function (e) { if (e.dept) s[e.dept] = 1; }); });
    return Object.keys(s).sort();
  }
  function isOverdue(e) { return e.status !== "CLOSED" && !!e.due && e.due < todayStr(); }
  function closureList() {
    var since = "";
    if (_closureFilter.days > 0) {
      var d0 = new Date(); d0.setDate(d0.getDate() - _closureFilter.days);
      since = d0.getFullYear() + "-" + String(d0.getMonth() + 1).padStart(2, "0") + "-" + String(d0.getDate()).padStart(2, "0");
    }
    var rows = [];
    Object.keys(merged.byDate).sort().forEach(function (date) {
      if (since && date < since) return;
      merged.byDate[date].forEach(function (e, i) {
        if (_closureFilter.dept && (e.dept || "") !== _closureFilter.dept) return;
        if (_closureFilter.status === "open" && e.status === "CLOSED") return;
        if (_closureFilter.status === "closed" && e.status !== "CLOSED") return;
        if (_closureFilter.status === "over" && !isOverdue(e)) return;
        rows.push({ date: date, i: i, e: e });
      });
    });
    rows.sort(function (a, b) {
      var ao = isOverdue(a.e) ? 0 : 1, bo = isOverdue(b.e) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return (b.e.impact || 0) - (a.e.impact || 0);
    });
    return rows;
  }
  function closureKpi(rows) {
    var closed = 0, over = 0, durSum = 0, durN = 0;
    rows.forEach(function (r) {
      var e = r.e;
      if (e.status === "CLOSED") {
        closed++;
        var dd = daysDiff(r.date, e.closedAt);
        if (dd !== null && dd >= 0) { durSum += dd; durN++; }
      } else if (isOverdue(e)) over++;
    });
    var n = rows.length;
    return { n: n, closed: closed, open: n - closed, over: over, rate: n ? Math.round(closed * 1000 / n) / 10 : 0, avgDays: durN ? Math.round(durSum / durN * 10) / 10 : null };
  }
  function kpiCard(label, val, color) {
    return '<div style="flex:1;min-width:104px;border:1px solid #e2e8f0;border-radius:10px;padding:9px 12px;background:#f8fafc;">' +
      '<div style="font-size:11.5px;color:#64748b;font-weight:700;">' + label + '</div>' +
      '<div style="font-size:19px;font-weight:900;color:' + color + ';font-variant-numeric:tabular-nums;">' + val + '</div></div>';
  }
  function escapeAttr(s) { return escapeHtml(String(s == null ? "" : s)).replace(/"/g, "&quot;"); }
  function csvCell(v) { var s = String(v == null ? "" : v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

  function renderClosure() {
    var box = document.getElementById("dpClose2");
    if (!box) return;
    var rows = closureList();
    var k = closureKpi(rows);
    var html = '';
    html += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">';
    html += '<select id="cfDays" class="c-sel">' + [[7, "近7天"], [14, "近14天"], [30, "近30天"], [0, "全部"]].map(function (o) {
      return '<option value="' + o[0] + '"' + (_closureFilter.days === o[0] ? " selected" : "") + '>' + o[1] + '</option>'; }).join("") + '</select>';
    html += '<select id="cfDept" class="c-sel"><option value="">全部部门</option>' + allDepts().map(function (d) {
      return '<option value="' + escapeAttr(d) + '"' + (_closureFilter.dept === d ? " selected" : "") + '>' + escapeHtml(d) + '</option>'; }).join("") + '</select>';
    html += '<select id="cfStatus" class="c-sel">' + [["open", "待闭环"], ["over", "仅超期"], ["closed", "已闭环"], ["all", "全部"]].map(function (o) {
      return '<option value="' + o[0] + '"' + (_closureFilter.status === o[0] ? " selected" : "") + '>' + o[1] + '</option>'; }).join("") + '</select>';
    html += '<button id="cfCsv" class="dp-sec">导出 CSV</button>';
    html += '<span style="font-size:12px;color:#94a3b8;">按「超期 → 影响数」降序; 可直接填 责任人/状态/日期/措施</span>';
    html += '</div>';
    html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">' +
      kpiCard("条目", k.n, "#0f172a") +
      kpiCard("已闭环", k.closed, "#1c7a3f") +
      kpiCard("闭环率", k.rate + "%", k.rate >= 80 ? "#1c7a3f" : (k.rate >= 50 ? "#b54708" : "#b42318")) +
      kpiCard("超期未闭环", k.over, k.over ? "#b42318" : "#1c7a3f") +
      kpiCard("平均闭环", k.avgDays === null ? "-" : k.avgDays + "天", "#2b5cbf") + '</div>';
    var cap = 300;
    html += '<div style="border:1px solid #e2e8f0;border-radius:10px;overflow:auto;max-height:360px;"><table style="width:100%;border-collapse:collapse;font-size:12px;">';
    html += '<tr class="dp-hd"><th>日期</th><th>班次</th><th>部门</th><th>影响</th><th>问题(泰语)</th><th>责任人</th><th>状态</th><th>承诺闭环</th><th>实际闭环</th><th>措施摘要</th><th>超期</th></tr>';
    rows.slice(0, cap).forEach(function (r) {
      var e = r.e;
      html += '<tr data-d="' + r.date + '" data-i="' + r.i + '">' +
        '<td>' + r.date + '</td><td>' + (e.shift || "-") + '</td><td class="dp-dept">' + (e.dept || "-") + '</td>' +
        '<td class="dp-imp">' + (e.impact === null || e.impact === undefined ? "-" : e.impact) + '</td>' +
        '<td class="dp-th" title="' + escapeAttr(e.problem_th || "") + '">' + escapeHtml(e.problem_th || "") + '</td>' +
        '<td><input class="c-owner" value="' + escapeAttr(e.owner || "") + '" placeholder="谁" style="width:66px;"></td>' +
        '<td><select class="c-status" style="color:' + (ST_COLOR[e.status || ""] || "#334155") + ';font-weight:800;">' +
          ["", "DOING", "CLOSED"].map(function (s) { return '<option value="' + s + '"' + ((e.status || "") === s ? " selected" : "") + '>' + ST_LABEL[s] + '</option>'; }).join("") + '</select></td>' +
        '<td><input type="date" class="c-due" value="' + (e.due || "") + '"></td>' +
        '<td><input type="date" class="c-closed" value="' + (e.closedAt || "") + '"></td>' +
        '<td><input class="c-action" value="' + escapeAttr(e.action || "") + '" placeholder="对策" style="width:140px;"></td>' +
        '<td class="c-over">' + (isOverdue(e) ? "超期" : "") + '</td></tr>';
    });
    html += '</table></div>';
    if (rows.length > cap) html += '<div style="font-size:12px;color:#94a3b8;margin-top:6px;">仅显示前 ' + cap + ' 条(共 ' + rows.length + ' 条)</div>';
    if (!rows.length) html += '<div style="font-size:12.5px;color:#64748b;margin-top:8px;">当前筛选下没有问题点条目。若是刚部署, 请先在「录入导入」页粘贴问题点。</div>';
    html += '<div style="display:flex;gap:12px;align-items:center;margin-top:12px;flex-wrap:wrap;">' +
      '<button id="cfSave" style="background:#1c7a3f;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:800;cursor:pointer;">✔ 保存闭环信息(即生效+Firebase同步)</button>' +
      '<span style="font-size:12px;color:#94a3b8;">填「实际闭环日」会自动置为已闭环; 之后重新从 Excel 导入同一天, 这里填的内容不会被冲掉</span></div>';
    box.innerHTML = html;
    bindClosure(box);
  }
  function bindClosure(box) {
    var b1 = box.querySelector("#cfDays"), b2 = box.querySelector("#cfDept"), b3 = box.querySelector("#cfStatus");
    if (b1) b1.addEventListener("change", function () { _closureFilter.days = parseInt(this.value, 10) || 0; renderClosure(); });
    if (b2) b2.addEventListener("change", function () { _closureFilter.dept = this.value; renderClosure(); });
    if (b3) b3.addEventListener("change", function () { _closureFilter.status = this.value; renderClosure(); });
    var sv = box.querySelector("#cfSave");
    if (sv) sv.addEventListener("click", saveClosure);
    var cs = box.querySelector("#cfCsv");
    if (cs) cs.addEventListener("click", exportClosureCsv);
  }
  function saveClosure() {
    var box = document.getElementById("dpClose2");
    if (!box) return;
    var next = cloneByDate(merged.byDate);
    var n = 0;
    Array.prototype.forEach.call(box.querySelectorAll("tr[data-d]"), function (tr) {
      var d = tr.getAttribute("data-d"), i = parseInt(tr.getAttribute("data-i"), 10);
      var arr = next[d];
      if (!arr || !arr[i]) return;
      var e = arr[i];
      e.owner = (tr.querySelector(".c-owner").value || "").trim();
      e.status = normStatus(tr.querySelector(".c-status").value);
      e.due = tr.querySelector(".c-due").value || "";
      e.closedAt = tr.querySelector(".c-closed").value || "";
      e.action = (tr.querySelector(".c-action").value || "").trim();
      if (!e.status && e.closedAt) e.status = "CLOSED";
      n++;
    });
    var payload = { savedAt: Date.now(), byDate: next };
    writeLocal(payload);
    local = payload;
    writeRemote(payload);
    rebuild();
    refreshStats();
    renderClosure();
    flash("已保存 " + n + " 条闭环信息(本地 + Firebase 同步)");
  }
  function exportClosureCsv() {
    var rows = closureList();
    var head = ["日期", "班次", "责任部门", "影响数", "问题(泰语)", "责任人", "状态", "承诺闭环日", "实际闭环日", "措施摘要", "是否超期"];
    var lines = [head.join(",")];
    rows.forEach(function (r) {
      var e = r.e;
      lines.push([r.date, e.shift || "", e.dept || "", e.impact === null || e.impact === undefined ? "" : e.impact, e.problem_th || "",
        e.owner || "", ST_LABEL[e.status || ""], e.due || "", e.closedAt || "", e.action || "", isOverdue(e) ? "超期" : ""].map(csvCell).join(","));
    });
    var blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "问题点闭环_" + todayStr() + ".csv";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    flash("已导出 " + rows.length + " 条闭环明细 CSV");
  }
  function switchTab(i) {
    var t1 = document.getElementById("dpTabImport"), t2 = document.getElementById("dpTabClose");
    var b1 = document.getElementById("dpTabBtn1"), b2 = document.getElementById("dpTabBtn2");
    if (!t1 || !t2) return;
    t1.style.display = (i === 0) ? "" : "none";
    t2.style.display = (i === 1) ? "" : "none";
    [b1, b2].forEach(function (b, k) {
      if (!b) return;
      var on = (k === i);
      b.style.background = on ? "#0f172a" : "#fff";
      b.style.color = on ? "#fff" : "#334155";
      b.style.borderColor = on ? "#0f172a" : "#cbd5e1";
    });
    if (i === 1) renderClosure();
  }

  /* ── UI ── */
  var _ui = null;
  function buildUI() {
    if (_ui && _ui.parentNode) return;
    var panel = document.createElement("div");
    panel.id = "dpModal";
    panel.style.cssText = "position:fixed;inset:0;z-index:12000;display:none;align-items:flex-start;justify-content:center;background:rgba(15,23,42,.45);backdrop-filter:blur(3px);overflo-y:auto;padding:30px 14px;";
    panel.innerHTML =
      '<div style="max-width:980px;width:100%;background:#fff;border-radius:14px;box-shadow:0 24px 64px rgba(15,23,42,.35);overflow:hidden;display:flex;flex-direction:column;max-height:92vh;">' +
      ' <div style="display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">' +
      '   <div style="flex:1;"><div style="font-size:16px;font-weight:800;color:#1e293b;">每日制程问题点录入</div>' +
      '     <div id="dpStats" style="font-size:12px;color:#64748b;margin-top:3px;">加载中…</div></div>' +
      '   <button id="dpClose" style="border:1px solid #e2e8f0;background:#fff;color:#475569;border-radius:9px;width:34px;height:34px;cursor:pointer;font-size:16px;font-weight:800;">×</button>' +
      ' </div>' +
      ' <div style="padding:18px 20px;overflow-y:auto;display:flex;flex-direction:column;gap:14px;">' +
      '   <div style="display:flex;gap:8px;margin-bottom:2px;">' +
      '     <button id="dpTabBtn1" style="border:1px solid #0f172a;background:#0f172a;color:#fff;border-radius:9px;padding:7px 14px;font-size:12.5px;font-weight:800;cursor:pointer;">录入导入</button>' +
      '     <button id="dpTabBtn2" style="border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:9px;padding:7px 14px;font-size:12.5px;font-weight:800;cursor:pointer;">闭环管理</button>' +
      '   </div>' +
      '   <div id="dpTabImport">' +
      '   <div>' +
      '     <div style="font-size:13px;font-weight:800;color:#334155;margin-bottom:8px;">① 粘贴问题点（每行一条）</div>' +
      '     <textarea id="dpInput" rows="8" placeholder="格式: DD/MM/YYYY 班次(A Day / A LINE DAY / B LINE NIGHT…) 泰语描述 影响数 责任部门(PE/IP/QA/PRO.1/Pro.2/Change model…)&#10;&#10;支持从 Excel 直接复制粘贴(制表符/换行), 或上传 .csv/.txt 文件。一行不能完整解析不会丢失, 会合并进上一条。" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;font-size:12.5px;line-height:1.7;resize:vertical;font-family:inherit;color:#334155;"></textarea>' +
      '     <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;">' +
      '       <label style="background:#2b5cbf;color:#fff;border-radius:9px;padding:8px 14px;font-size:12.5px;font-weight:800;cursor:pointer;">上传 .csv/.txt<input id="dpFile" type="file" accept=".csv,.txt,.tsv" style="display:none;"></label>' +
      '       <button id="dpParse" style="background:#0f172a;color:#fff;border:0;border-radius:9px;padding:8px 14px;font-size:12.5px;font-weight:800;cursor:pointer;">解析预览</button>' +
      '       <span id="dpParseHint" style="font-size:12px;color:#64748b;align-self:center;"></span>' +
      '     </div>' +
      '   </div>' +
      '   <div id="dpPreview" style="display:none;"><div style="font-size:13px;font-weight:800;color:#334155;margin-bottom:8px;">② 解析预览</div>' +
      '     <div style="max-height:260px;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;"><table id="dpPreviewBody" style="width:100%;border-collapse:collapse;font-size:12px;"></table></div>' +
      '   </div>' +
      '   <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:2px;">' +
      '     <button id="dpSave" style="background:#1c7a3f;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:800;cursor:pointer;">✔ 保存到看板(即生效+Firebase同步)</button>' +
      '     <span style="font-size:12px;color:#94a3b8;">保存后 AI 立即可查; 想永久部署(刷新仍保留)再点导出推送</span>' +
      '   </div>' +
      '   <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-top:1px dashed #e2e8f0;padding-top:14px;">' +
      '     <div style="font-size:13px;font-weight:800;color:#334155;">③ 永久部署(commit 到 GitHub)</div>' +
      '     <button id="dpCopy" class="dp-sec">复制 daily-problems-data.js</button>' +
      '     <button id="dpDl" class="dp-sec">下载该文件</button>' +
      '     <label style="font-size:12px;color:#64748b;">然后提交推送到 main, GitHub Pages 自动部署。修改只对浏览器生效 vs 全站生效见右侧说明。</label>' +
      '   </div>' +
      '   <div style="border-top:1px dashed #e2e8f0;padding-top:12px;font-size:12px;color:#64748b;line-height:1.8;">' +
      '      <div style="font-weight:800;color:#334155;margin-bottom:4px;">④ 数据说明</div>' +
      '     · 字段: 日期 / 班次(A-D DAY|NIGHT) / 责任部门(PE·IP·QA·PRO.1-4·CHANGEMODEL换型) / 影响数(产出缺口) / 泰语原文描述。<br>' +
      '     · 语言: AI 按提问语言回答 —— 泰语问→用泰语原文总结; 中文问→把泰语翻译成中文并给出分析。<br>' +
      '     · 来源: 静态种子(已部署) + 本浏览器(localStorage) + Firebase 云端; 三源按日期合并, 覆盖面取最新。<br>' +
      '     · 「导出部署数据」会把当前全部(含 lstore+Firebase)写回种子文件, 确保任何人打开都是这份数据。' +
      '     · 闭环字段(责任人/状态/承诺闭环日/实际闭环日/措施摘要): 在「闭环管理」页填写; 带表头的 Excel 复制(含这些列)也能直接导入。' +
      '   </div>' +
      '   </div>' +
      '   <div id="dpTabClose" style="display:none;"><div id="dpClose2"></div></div>' +
      '   <div id="dpMsg" style="font-size:12.5px;color:#1c7a3f;min-height:18px;"></div>' +
      ' </div>' +
      '</div>';
    document.body.appendChild(panel);
    /* 表头样式等 */
    var st = document.createElement("style");
    st.textContent = '.dp-th{color:#475569;max-width:520px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}td.dp-dept,.dp-imp,.dp-hd th{font-weight:800}.dp-hd th{background:#f1f5f9;color:#334155;padding:7px 10px;text-align:left;position:sticky;top:0}#dpPreviewBody td{padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#334155;font-variant-numeric:tabular-nums}.dp-sec{background:#fff;border:1px solid #cbd5e1;color:#334155;border-radius:9px;padding:8px 14px;font-size:12.5px;font-weight:700;cursor:pointer}#dpPreviewBody tr:hover td{background:#f8fafc}'
      + '.c-sel{border:1px solid #cbd5e1;border-radius:9px;padding:6px 10px;font-size:12.5px;font-weight:700;color:#334155;background:#fff}'
      + '#dpClose2 input,#dpClose2 select{border:1px solid #e2e8f0;border-radius:7px;padding:4px 6px;font-size:11.5px;color:#334155;font-family:inherit;background:#fff}'
      + '#dpClose2 input:focus,#dpClose2 select:focus{outline:2px solid #bfdbfe;border-color:#93c5fd}'
      + '#dpClose2 td{padding:4px 6px;border-bottom:1px solid #f1f5f9;color:#334155}'
      + '#dpClose2 tr:hover td{background:#f8fafc}.c-over{color:#b42318;font-weight:800}';
    document.head.appendChild(st);
    _ui = panel;
    bindUI(panel);
  }
  function bindUI(panel) {
    var lastParsed = null;
    panel.querySelector("#dpClose").addEventListener("click", function () { panel.style.display = "none"; });
    var _tb1 = panel.querySelector("#dpTabBtn1"), _tb2 = panel.querySelector("#dpTabBtn2");
    if (_tb1) _tb1.addEventListener("click", function () { switchTab(0); });
    if (_tb2) _tb2.addEventListener("click", function () { switchTab(1); });
    panel.addEventListener("click", function (e) { if (e.target === panel) panel.style.display = "none"; });
    panel.querySelector("#dpParse").addEventListener("click", function () {
      var res = parseProblems(document.getElementById("dpInput").value);
      lastParsed = res.byDate;
      applyPreview(res.byDate);
    });
    panel.querySelector("#dpSave").addEventListener("click", function () {
      var res = parseProblems(document.getElementById("dpInput").value);
      if (!res.all.length) { flash("请先粘贴内容"); return; }
      doSave(res.byDate);
    });
    panel.querySelector("#dpFile").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { document.getElementById("dpInput").value = String(r.result || ""); var res = parseProblems(r.result); lastParsed = res.byDate; applyPreview(res.byDate); };
      r.readAsText(f);
    });
    panel.querySelector("#dpCopy").addEventListener("click", copyExport);
    panel.querySelector("#dpDl").addEventListener("click", function () { downloadExport(); flash("已下载 daily-problems-data.js → 放回仓库根目录, commit+push 到 main 即部署"); });
  }

  function openModal() {
    buildUI();
    if (_ui.style.display === "flex") { _ui.style.display = "none"; return; }
    _ui.style.display = "flex";
    refreshStats();
    var t2 = document.getElementById("dpTabClose");
    if (t2 && t2.style.display !== "none") renderClosure();
  }

  /* ── 挂载到产出分析页顶栏(与 AI 按钮同排) ── */
  window.initDailyProblemsForAnaPage = function (anaRoot) {
    var top = anaRoot && anaRoot.querySelector ? (anaRoot.querySelector(".ana-rt") || anaRoot.querySelector(".ana-top")) : null;
    if (!top) return;
    var btn = document.getElementById("dpBtn");
    if (!btn) {
      buildUI();
      btn = document.createElement("button");
      btn.id = "dpBtn";
      btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg><span>问题点(0)</span>';
      btn.title = "每日制程问题点: 粘贴/Excel导入, 保存后 AI 可精准汇总分析并按语言回答";
      btn.style.cssText = "display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;margin:0;padding:0 14px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font-size:12.5px;font-weight:800;cursor:pointer;line-height:1;white-space:nowrap;letter-spacing:.2px;";
      btn.addEventListener("click", openModal);
    }
    top.appendChild(btn);
    refreshStats();
    syncFromRemote();   // 拉一次 Firebase 云端覆盖
  };

  /* 初始化运行时数据(不依赖 UI) */
  local = readLocal();
  rebuild();
  remote = null;
})();