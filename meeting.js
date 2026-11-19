/* 两小时检讨会（2026-11-19）
   数据：DM 后台每分钟算好写到同一个实时库 /dm_meeting/PRO2（作业长手机填的 LOSS 问题点、PRO2 未关闭异常单、逐小时 LOSS），30 秒读一次。
   ① 看板「未达成原因」模块改读这份数据（renderProblems 开头调 mtgPanel）
   ② 模块右上角 ⛶ → 完整页面 #meeting（不是弹窗；刷新后仍停在本页，返回回看板）
   ③ 页面左侧直接复用看板的小时产出图 drawBar（只画 FINAL A–D） */
(function () {
  "use strict";
  var DB = "https://dm111-e8a7d-default-rtdb.firebaseio.com/dm_meeting/PRO2.json";
  var qs = new URLSearchParams(location.search);
  var SRC = qs.get("mtgsrc") || DB;            // ?mtgsrc= 仅供本地用样例数据测试
  var POLL = 30000, STALE = 5 * 60000;
  var DEPT_COLORS = ["#5b9bff", "#2dd4bf", "#a78bfa", "#f472b6", "#38bdf8", "#e9d5ff", "#94a3b8"];
  var T = {
    zh: { title: "两小时检讨会", back: "看板", scopeWin: "本次检讨", scopeAll: "全班", hourly: "每小时产出", lossTo: "LOSS 去向",
      probs: "问题点", issues: "升级问题", day: "白班", night: "夜班", winOf: "检讨", loss: "LOSS", unexp: "未说明", gapKey: "未说明",
      noLoss: "无 LOSS", noProb: "这段时间没有 LOSS", noIss: "没有未关闭的问题", gapTx: "有 LOSS 未填原因", gapRep: "未填报",
      upd: "更新", stale: "检讨会数据超过 5 分钟没更新，请检查网络或 DM 后台", loading: "正在读取…", fail: "读取失败，30 秒后自动重试",
      open: "待接单", doing: "处理中", verify: "待确认", over: "超时", fresh: "新", min: "分钟前", hr: "小时前", day0: "天前", unit: "台", rate: "达成" },
    th: { title: "ประชุมทบทวนทุก 2 ชม.", back: "บอร์ด", scopeWin: "รอบนี้", scopeAll: "ทั้งกะ", hourly: "ยอดผลิตรายชั่วโมง", lossTo: "LOSS มาจากไหน",
      probs: "ปัญหา", issues: "ปัญหาที่ยกระดับ", day: "กะเช้า", night: "กะดึก", winOf: "ทบทวน", loss: "LOSS", unexp: "ยังไม่ระบุ", gapKey: "ยังไม่ระบุสาเหตุ",
      noLoss: "ไม่มี LOSS", noProb: "ช่วงนี้ไม่มี LOSS", noIss: "ไม่มีปัญหาค้าง", gapTx: "มี LOSS แต่ยังไม่ระบุสาเหตุ", gapRep: "ยังไม่กรอก",
      upd: "อัปเดต", stale: "ข้อมูลประชุมไม่อัปเดตเกิน 5 นาที กรุณาตรวจสอบเครือข่ายหรือระบบ DM", loading: "กำลังโหลด…", fail: "โหลดไม่สำเร็จ จะลองใหม่ใน 30 วินาที",
      open: "รอรับงาน", doing: "กำลังแก้ไข", verify: "รอยืนยัน", over: "เกินเวลา", fresh: "ใหม่", min: "นาทีที่แล้ว", hr: "ชม.ที่แล้ว", day0: "วันที่แล้ว", unit: "เครื่อง", rate: "สำเร็จ" }
  };
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  var st = { lang: ls("mtg_lang") || "zh", scope: ls("mtg_scope") || "win", line: "", d: null, err: false };
  if (!T[st.lang]) st.lang = "zh";
  function t(k) { return T[st.lang][k]; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function n0(x) { return Math.round(Number(x) || 0).toLocaleString("en-US"); }
  function nm(o, lg) { return o ? (o[lg || st.lang] || o.zh || "") : ""; }
  function short(name) { return String(name || "").replace(/\s*line$/i, "").toUpperCase(); }
  function arr(x) { return Array.isArray(x) ? x.filter(Boolean) : x && typeof x === "object" ? Object.keys(x).map(function (k) { return x[k]; }) : []; }
  function bkk(ts) { return new Date(ts + 7 * 3600000); }   // 工厂时间 UTC+7，与电脑时区无关
  function hhmm(ts) { var d = bkk(ts); return ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2); }
  var ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  var ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.5L16 9.5"/></svg>';

  /* 本次检讨覆盖的小时 = 当班累计：开班 → 本次会议时刻（最近一次会开始后 60 分钟内算本次，否则看下一次会）；
     例：15:00 的会看 8–15 点。最后一次会过后看整班。（创始人 2026-11-19 定：LOSS 按当班累计，不是两次会之间） */
  function windowHours(d) {
    var hours = arr(d.hours), slots = arr(d.slots).map(function (s) { var p = String(s.time).split(":"); return +p[0] * 60 + (+p[1] || 0); });
    if (!slots.length) return hours;
    var night = d.shift === "NIGHT";
    var rel = function (m) { return night && m < 20 * 60 ? m + 1440 : m; };
    var nd = bkk(Date.now()), nowM = rel(nd.getUTCHours() * 60 + nd.getUTCMinutes());
    var ss = slots.map(rel).sort(function (a, b) { return a - b; }), meet = null, i;
    for (i = 0; i < ss.length; i++) if (ss[i] <= nowM && nowM - ss[i] < 60) meet = i;
    if (meet == null) for (i = 0; i < ss.length; i++) if (ss[i] > nowM) { meet = i; break; }
    if (meet == null) return hours;
    var to = ss[meet];
    return hours.filter(function (h) { return rel(h * 60) < to; });
  }
  function winLabel(win) { return win.length ? win[0] + ":00–" + ((win[win.length - 1] + 1) % 24) + ":00" : ""; }

  /* 按范围汇总：每条线 计划 / 实际 / LOSS / 按部门归因 / 未说明 */
  function summarize(d, scopeH) {
    var inS = function (h) { return scopeH.indexOf(h) >= 0; };
    var lines = arr(d.lines).map(function (ln) {
      var s = { key: ln.key, name: ln.name, p: 0, a: 0, l: 0, gap: 0, depts: {}, gaps: [] };
      arr(ln.h).forEach(function (h) {
        if (!inS(h.hour)) return;
        s.p += h.p || 0; s.a += h.a || 0;
        if (h.st !== "done") return;
        s.l += h.l || 0;
        var g = Math.round((h.l || 0) - (h.q || 0));
        if (g > 0) { s.gap += g; s.gaps.push({ hour: h.hour, qty: g, rep: !!h.rep }); }
      });
      return s;
    });
    var byKey = {}; lines.forEach(function (s) { byKey[s.key] = s; });
    var deptTot = {};
    arr(d.probs).forEach(function (p) {
      if (!inS(p.hour) || !byKey[p.line] || !p.qty) return;
      var k = p.d ? p.d.zh : "—";
      var s = byKey[p.line];
      if (!s.depts[k]) s.depts[k] = { d: p.d || { zh: "—", th: "—" }, q: 0 };
      s.depts[k].q += p.qty; deptTot[k] = (deptTot[k] || 0) + p.qty;
    });
    var order = Object.keys(deptTot).sort(function (a, b) { return deptTot[b] - deptTot[a]; });
    var color = {}; order.forEach(function (k, i) { color[k] = DEPT_COLORS[Math.min(i, DEPT_COLORS.length - 1)]; });
    var tot = lines.reduce(function (o, s) { o.p += s.p; o.a += s.a; o.l += s.l; o.gap += s.gap; return o; }, { p: 0, a: 0, l: 0, gap: 0 });
    return { lines: lines, order: order, color: color, deptTot: deptTot, tot: tot };
  }

  /* ---------- 页面 DOM ---------- */
  function build() {
    if ($("mtg")) return;
    var el = document.createElement("div");
    el.id = "mtg"; el.hidden = true; el.setAttribute("role", "main");
    el.innerHTML =
      '<header class="mtg-top">' +
        '<button class="mtg-back" id="mtgBack">' + ICON_BACK + '<span data-mk="back"></span></button>' +
        '<div class="mtg-title"><h1 data-mk="title"></h1><span class="mtg-sub" id="mtgSub"></span></div><div class="mtg-sp"></div>' +
        '<div class="mtg-seg" id="mtgScope"><button data-v="win" data-mk="scopeWin"></button><button data-v="all" data-mk="scopeAll"></button></div>' +
        '<div class="mtg-seg" id="mtgLang"><button data-v="zh">中文</button><button data-v="th">ไทย</button></div>' +
        '<span class="mtg-fresh" id="mtgFresh"><i></i><span></span></span><span class="mtg-clock" id="mtgClock"></span>' +
      '</header>' +
      '<div class="mtg-banner" id="mtgBanner"></div>' +
      '<div class="mtg-grid">' +
        '<section class="mtg-pane mtg-chart"><div class="mtg-ph"><h2 data-mk="hourly"></h2><span class="sp"></span>' +
          '<div class="legend"><span class="lg-actual" data-i18n="lgActual">实际</span><span class="lg-plan" data-i18n="lgPlan">计划</span><span class="lg-gap" data-i18n="lgGap">欠产</span><span class="lg-over" data-i18n="lgOver">超产</span></div></div>' +
          '<div class="mtg-cv"><canvas id="mtgBar"></canvas></div></section>' +
        '<section class="mtg-pane mtg-loss"><div class="mtg-ph"><h2 data-mk="lossTo"></h2><div class="mtg-tot" id="mtgTot"></div><span class="sp"></span><div class="mtg-keys" id="mtgKeys"></div></div><div class="mtg-rows" id="mtgRows"></div></section>' +
        '<section class="mtg-pane mtg-probs"><div class="mtg-ph"><h2 data-mk="probs"></h2><span class="cnt" id="mtgProbCnt"></span></div><div class="mtg-list" id="mtgProbs"></div></section>' +
        '<section class="mtg-pane mtg-iss"><div class="mtg-ph"><h2 data-mk="issues"></h2><span class="cnt" id="mtgIssCnt"></span></div><div class="mtg-list" id="mtgIss"></div></section>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.id === "mtgBack") return closeMeeting();
      var p = b.parentNode && b.parentNode.id;
      if (p === "mtgLang") { st.lang = b.dataset.v; ls("mtg_lang", st.lang); }
      else if (p === "mtgScope") { st.scope = b.dataset.v; ls("mtg_scope", st.scope); }
      else if (b.dataset.line != null) st.line = st.line === b.dataset.line ? "" : b.dataset.line;
      else return;
      render();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen()) closeMeeting(); });
    if (window.ResizeObserver) new ResizeObserver(function () { drawChart(); }).observe(el.querySelector(".mtg-cv"));
  }
  function isOpen() { var el = $("mtg"); return !!(el && !el.hidden); }

  /* 看板的小时产出图：只画 FINAL A–D，强制「分段小时」模式 */
  function finalLines() {
    try {
      var have = {}, out = state.lines.filter(function (l) { var k = normName(l.name); if (FINAL_SET.has(k)) { have[k] = 1; return true; } return false; });
      ["Final A line", "Final B Line", "Final C line", "Final D line"].forEach(function (n) { if (!have[normName(n)]) out.push(makeMissingLine(n)); });
      return out.sort(function (a, b) { return normName(a.name).localeCompare(normName(b.name)); });
    } catch (e) { return []; }
  }
  function drawChart() {
    if (!isOpen() || typeof drawBar !== "function") return;
    var cv = $("mtgBar"), old;
    try { old = segShow; segShow = true; drawBar(finalLines(), cv); } catch (e) { /* 看板数据未就绪 */ } finally { try { segShow = old; } catch (e) {} }
  }

  function render() {
    if (!$("mtg")) return;
    document.querySelectorAll("#mtg [data-mk]").forEach(function (el) { el.textContent = t(el.getAttribute("data-mk")); });
    document.querySelectorAll("#mtgLang button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === st.lang); });
    document.querySelectorAll("#mtgScope button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === st.scope); });
    var d = st.d, stale = d && Date.now() - d.at > STALE;
    $("mtgFresh").classList.toggle("bad", !!(stale || st.err));
    $("mtgFresh").lastChild.textContent = d ? t("upd") + " " + hhmm(d.at) : t(st.err ? "fail" : "loading");
    $("mtgBanner").textContent = st.err ? t("fail") : t("stale");
    $("mtgBanner").classList.toggle("show", !!(d && (stale || st.err)));
    if (!d) return;
    var hours = arr(d.hours), win = windowHours(d), scopeH = st.scope === "win" && win.length ? win : hours;
    var inS = function (h) { return scopeH.indexOf(h) >= 0; };
    var okLine = function (k) { return !st.line || st.line === k; };
    $("mtgSub").innerHTML = "PRO2 FINAL A–D · " + esc(d.date.slice(5).replace("-", "/")) + " " + t(d.shift === "NIGHT" ? "night" : "day") + (win.length ? " · " + t("winOf") + " <b class=\"n\">" + winLabel(win) + "</b>" : "");
    var S = summarize(d, scopeH), lineName = {};
    S.lines.forEach(function (s) { lineName[s.key] = short(s.name); });

    /* LOSS 去向 */
    $("mtgTot").innerHTML = '<span class="bad">' + t("loss") + '<b>' + n0(S.tot.l) + '</b></span>' + (S.tot.gap > 0 ? '<span class="warn">' + t("unexp") + '<b>' + n0(S.tot.gap) + '</b></span>' : "");
    $("mtgKeys").innerHTML = S.order.map(function (k) { return '<span><i style="background:' + S.color[k] + '"></i>' + esc(nm(S.lines.reduce(function (o, s) { return o || (s.depts[k] && s.depts[k].d); }, null))) + ' <b class="n">' + n0(S.deptTot[k]) + '</b></span>'; }).join("") +
      (S.tot.gap > 0 ? '<span><i style="background:repeating-linear-gradient(-45deg,#f5a524 0 3px,#c98516 3px 6px)"></i>' + t("gapKey") + '</span>' : "");
    var maxL = Math.max.apply(null, S.lines.map(function (s) { return s.l; }).concat([1]));
    $("mtgRows").innerHTML = S.lines.map(function (s) {
      var rate = s.p > 0 ? Math.round(s.a / s.p * 100) : null, rc = rate == null ? "" : rate >= 95 ? "var(--m-ok-t)" : rate >= 85 ? "var(--m-warn-t)" : "var(--m-bad-t)";
      var sel = st.line === s.key, dim = st.line && !sel, bar;
      if (s.l <= 0) bar = '<div class="mtg-bar none">' + t("noLoss") + '</div>';
      else {
        var segs = S.order.filter(function (k) { return s.depts[k]; }).map(function (k) {
          var q = Math.min(s.depts[k].q, s.l);
          return '<span style="flex:0 0 ' + (q / maxL * 100).toFixed(2) + '%;background:' + S.color[k] + '" title="' + esc(nm(s.depts[k].d)) + ' ' + n0(q) + '">' + (q / maxL > 0.07 ? esc(nm(s.depts[k].d)) + ' ' + n0(q) : "") + '</span>';
        }).join("");
        var gap = Math.max(0, s.l - Object.keys(s.depts).reduce(function (a, k) { return a + s.depts[k].q; }, 0));
        if (gap > 0) segs += '<span class="gap" style="flex:0 0 ' + (gap / maxL * 100).toFixed(2) + '%">' + (gap / maxL > 0.07 ? n0(gap) : "") + '</span>';
        bar = '<div class="mtg-bar">' + segs + '<span class="rest" style="flex:1 1 auto"></span></div>';
      }
      return '<button class="mtg-row' + (sel ? " sel" : "") + (dim ? " dim" : "") + '" data-line="' + esc(s.key) + '">' +
        '<span><span class="nm">' + esc(short(s.name)) + '</span><span class="rt" style="color:' + (rc || "var(--m-ink3)") + '">' + t("rate") + ' ' + (rate == null ? "—" : rate + "%") + '</span></span>' +
        '<span class="ls' + (s.l <= 0 ? " zero" : "") + '">' + n0(s.l) + '</span>' + bar +
        '<span class="gp">' + (s.gap > 0 ? '<span class="mtg-chip warn">' + t("unexp") + ' <span class="n">' + n0(s.gap) + '</span></span>' : (s.l > 0 ? '<span class="mtg-chip ok">✓</span>' : "")) + '</span></button>';
    }).join("");

    /* 问题点：填了原因的按台数排前，没填原因的小时排后 */
    var rows = arr(d.probs).filter(function (p) { return inS(p.hour) && okLine(p.line); }).map(function (p) {
      var main = st.lang === "zh" ? (p.zh || p.text) : (p.text || p.zh), sub = st.lang === "zh" && p.zh && p.text && p.zh !== p.text ? p.text : "";
      var col = p.d ? S.color[p.d.zh] : "";
      return { g: 0, q: p.qty || 0, h: p.hour, html: '<div class="mtg-it"><div class="lt"><span class="mtg-tag">' + esc(lineName[p.line] || p.line) + '</span><span class="mtg-hr">' + p.hour + ':00</span></div>' +
        '<div><div class="mtg-tx">' + esc(main || nm(p.t)) + '</div>' + (sub ? '<div class="mtg-tx2">' + esc(sub) + '</div>' : "") +
        '<div class="mtg-meta"><span class="mtg-chip">' + esc(nm(p.t)) + '</span>' + (p.d ? '<span class="mtg-chip"><i style="background:' + (col || "#94a3b8") + '"></i>' + esc(nm(p.d)) + '</span>' : "") + (p.equip ? '<span class="mtg-chip">' + esc(p.equip) + '</span>' : "") + '</div></div>' +
        '<div class="mtg-q">' + (p.qty ? n0(p.qty) + '<small>' + t("unit") + '</small>' : "") + '</div></div>' };
    });
    S.lines.forEach(function (s) {
      if (!okLine(s.key)) return;
      s.gaps.forEach(function (g) {
        rows.push({ g: 1, q: g.qty, h: g.hour, html: '<div class="mtg-it gap"><div class="lt"><span class="mtg-tag">' + esc(short(s.name)) + '</span><span class="mtg-hr">' + g.hour + ':00</span></div>' +
          '<div><div class="mtg-tx">' + t("gapTx") + '</div><div class="mtg-meta"><span class="mtg-chip warn">' + t(g.rep ? "unexp" : "gapRep") + '</span></div></div>' +
          '<div class="mtg-q">' + n0(g.qty) + '<small>' + t("unit") + '</small></div></div>' });
      });
    });
    rows.sort(function (a, b) { return a.g - b.g || b.q - a.q || hours.indexOf(b.h) - hours.indexOf(a.h); });
    $("mtgProbs").innerHTML = rows.length ? rows.map(function (r) { return r.html; }).join("") : '<div class="mtg-empty">' + ICON_OK + t("noProb") + '</div>';
    $("mtgProbCnt").textContent = rows.length || "";

    /* 升级问题：PRO2 未关闭异常单（后台已按 升级级别 → 超时 → 新 排好） */
    var iss = arr(d.issues).filter(function (i) { return !st.line || !i.line || i.line === st.line; });
    $("mtgIss").innerHTML = iss.length ? iss.map(function (i) {
      var age = Math.max(0, Date.now() - (i.at || 0)), isNew = age < 15 * 60000;
      var ago = age < 3600000 ? Math.max(1, Math.round(age / 60000)) + " " + t("min") : age < 48 * 3600000 ? Math.round(age / 3600000) + " " + t("hr") : Math.floor(age / 86400000) + " " + t("day0");
      var stc = i.status === "open" ? "warn" : i.status === "verify" ? "ok" : "acc";
      var tag = i.line ? lineName[i.line] : (i.lineName ? short(i.lineName) : "PRO2");
      var main = i.title || i.note || nm(i.t), sub = i.title && i.note && i.note !== i.title ? i.note : "";
      return '<div class="mtg-it' + (isNew ? " new" : "") + '"><div class="lt"><span class="mtg-tag">' + esc(tag) + '</span>' + (i.esc ? '<span class="mtg-lv">L' + i.esc + '</span>' : "") + '</div>' +
        '<div><div class="mtg-tx">' + esc(main) + '</div>' + (sub ? '<div class="mtg-tx2">' + esc(sub) + '</div>' : "") +
        '<div class="mtg-meta"><span class="mtg-chip ' + stc + '">' + t(i.status) + '</span>' + (i.over ? '<span class="mtg-chip bad">' + t("over") + '</span>' : "") +
        '<span class="mtg-chip">' + esc(nm(i.d)) + '</span>' + (isNew ? '<span class="mtg-chip acc">' + t("fresh") + '</span>' : "") + '</div></div>' +
        '<div class="mtg-ago"><b>' + ago + '</b>' + esc(i.no) + '</div></div>';
    }).join("") : '<div class="mtg-empty">' + ICON_OK + t("noIss") + '</div>';
    $("mtgIssCnt").textContent = iss.length || "";
    document.documentElement.lang = st.lang === "th" ? "th" : document.documentElement.lang;
  }

  /* ---------- 看板「未达成原因」模块：改读 DM 数据（看板中文 = 中文；EN = 泰文原文） ---------- */
  window.mtgPanel = function () {
    var d = st.d, body = document.getElementById("prob-body"), src = document.getElementById("prob-src");
    if (!d || !body) return false;
    var zh = (typeof lang === "undefined") || lang === "zh", lg = zh ? "zh" : "th";
    var hours = arr(d.hours), win = windowHours(d), S = summarize(d, win.length ? win : hours), lineName = {};
    S.lines.forEach(function (s) { lineName[s.key] = short(s.name); });
    if (src) src.textContent = "SRC: DM · " + hhmm(d.at);
    var shTxt = d.shift === "NIGHT" ? (zh ? "夜班" : "Night") : (zh ? "白班" : "Day");
    var summary = "<div class='prob-summary'>📋 <b>" + shTxt + " · " + winLabel(win) + "</b> · LOSS <b style='color:var(--red)'>" + n0(S.tot.l) + "</b>" +
      (S.tot.gap > 0 ? " · " + (zh ? "未说明" : "Unexplained") + " <b style='color:var(--orange)'>" + n0(S.tot.gap) + "</b>" : "") +
      " · " + (zh ? "升级问题" : "Escalated") + " <b>" + arr(d.issues).length + "</b></div>";
    var probs = arr(d.probs).filter(function (p) { return win.indexOf(p.hour) >= 0 || !win.length; }).sort(function (a, b) { return (b.qty || 0) - (a.qty || 0); }).slice(0, 4);
    var items = probs.map(function (p) {
      var tx = zh ? (p.zh || p.text) : (p.text || p.zh);
      return { line: lineName[p.line] || p.line, html: "<span class='prob-time'>" + p.hour + ":00</span> <span class='prob-txt'>" + esc(tx || nm(p.t, lg)) + "</span>" + (p.qty ? " <b class='prob-imp' style='color:var(--red)'>-" + n0(p.qty) + (zh ? "台" : "") + "</b>" : "") };
    });
    if (!items.length) S.lines.filter(function (s) { return s.gap > 0; }).sort(function (a, b) { return b.gap - a.gap; }).slice(0, 4).forEach(function (s) {
      items.push({ line: short(s.name), html: "<span class='prob-txt' style='color:var(--orange)'>" + (zh ? "有 LOSS 未填原因" : "LOSS without reason") + "</span> <b class='prob-imp' style='color:var(--orange)'>" + n0(s.gap) + (zh ? "台" : "") + "</b>" });
    });
    var rows = items.map(function (it, i) {
      return "<tr><td class='prob-line'>" + esc(it.line) + "</td><td class='prob-cell'><div class='prob-top'><span class='prob-rank " + (["r1", "r2", "r3"][i] || "") + "'>" + (i + 1) + ".</span>" + it.html + "</div></td></tr>";
    }).join("");
    body.innerHTML = summary + (rows ? "<table class='mod-table'><thead><tr><th style='width:100px'>" + (zh ? "线体" : "Line") + "</th><th>" + (zh ? "主要问题点" : "Key issues") + "</th></tr></thead><tbody>" + rows + "</tbody></table>"
      : "<div style='color:var(--gray);padding:6px 2px'>" + (zh ? "本次检讨时段没有 LOSS" : "No LOSS in this review window") + "</div>");
    try { if (typeof fitProbFont === "function") fitProbFont(body); } catch (e) {}
    return true;
  };

  /* ---------- 打开 / 关闭（地址带 #meeting：电视刷新后仍停在本页） ---------- */
  function openMeeting() { if (location.hash !== "#meeting") location.hash = "meeting"; else sync(); }
  function closeMeeting() { if (location.hash === "#meeting") history.replaceState(null, "", location.pathname + location.search); sync(); }
  function sync() {
    build();
    var on = location.hash === "#meeting", el = $("mtg");
    if (el.hidden === !on) { if (on) { render(); drawChart(); } return; }
    el.hidden = !on;
    document.body.classList.toggle("mtg-on", on);
    if (on) { render(); requestAnimationFrame(drawChart); }
  }
  window.openMeeting = openMeeting;
  window.mtgDrawChart = drawChart;
  addEventListener("hashchange", sync);

  function load() {
    fetch(SRC + (SRC.indexOf("?") >= 0 ? "&" : "?") + "_=" + Date.now(), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (j) { if (j && j.lines) { st.d = j; st.err = false; } else st.err = true; })
      .catch(function () { st.err = true; })
      .then(function () { try { if (typeof renderProblems === "function") renderProblems(); } catch (e) {} if (isOpen()) render(); });
  }
  function clock() { var c = $("mtgClock"); if (c) { var d = bkk(Date.now()); c.textContent = hhmm(Date.now()) + ":" + ("0" + d.getUTCSeconds()).slice(-2); } }
  build(); sync(); load(); clock();
  setInterval(load, POLL);
  setInterval(clock, 1000);
  setInterval(function () { if (isOpen()) render(); }, 60000);   // 本次检讨时段、超时、几分钟前随时间走
})();
