/* ============================================================
 * 车间产出分析页 (独立模块, 不影响主看板任何逻辑)
 * 2026-09-02 v1  纯前端: 读 Firebase pdtiii.json hourly
 *   → 按车间/线体/班次聚合 → 拆「正常时段产出 vs 加班时段产出」
 * 加班口径(用户 2026-09-02 确认): 白班 17:20–20:20 / 夜班 5:50–7:50
 * 人数: normal_hc / ot_hc 预留(可手填, 存 Firebase analysis/hc/{date}.json)
 *
 * 2026-09-02 v2/v3 UI重做 → 用户仍不满意(卡片乱/无章法/丑)
 * 2026-09-02 v4 彻底对齐主看板视觉: 用户原话「参考我的主页面」
 *   → 纯黑 #000 底 + #232329 细边框 + 灰阶小字 + KPI(label左/value右) 横排
 *   → 车间=可点击展开的对比表(与主看板 mainTable 同构), 不再用自由卡片
 * ============================================================ */
(function () {
  "use strict";
  if (document.getElementById("anaRoot")) return;

  var DATA_URL = "https://dm111-e8a7d-default-rtdb.firebaseio.com/pdtiii.json";
  var HC_URL = "https://dm111-e8a7d-default-rtdb.firebaseio.com/analysis/hc";

  /* ── 36条线体 → 车间 (True B 剔除, 用户 2026-09-02 确认) ── */
  var WS_MAP = [
    { ws: "Pro.1", tag: "电机装配", lines: ["Motor AC", "Motor CL", "Motor WL", "Motor F-Series", "Motor H-Series", "Motor S-Series"] },
    { ws: "Pro.2", tag: "总装·终检", lines: ["Final A line", "Final B line", "Final C line", "Final D line", "Inspection A line", "Inspection B line", "Inspection C line", "Inspection D line", "Water Line", "Rotor A line", "Rotor B line", "Rotor C line", "Rotor D line"] },
    { ws: "Pro.3", tag: "焊接·压轴", lines: ["Welding A line", "Welding B line", "Welding C line", "Welding D line", "Press C-Shaft"] },
    { ws: "Pro.4", tag: "轴类·机加", lines: ["C-Shaft Body A", "C-Shaft Body B", "C-Shaft Body C", "C-Shaft Pin A", "C-Shaft Pin C", "C-Shft Pin B", "Piston Grinding", "Rod Pispin", "Frame Honing FL"] },
    { ws: "Pro.5", tag: "FL精加工", lines: ["Piston honing FL", "Cylinder Honing"] },
    { ws: "Pro.6", tag: "电机部件", lines: [] }
  ];
  var WS_ACC = { "Pro.1": "#3fb950", "Pro.2": "#58a6ff", "Pro.3": "#d29922", "Pro.4": "#bc8cff", "Pro.5": "#39c5cf", "Pro.6": "#f778ba" };
  var LINE2WS = {};
  WS_MAP.forEach(function (g) {
    g.lines.forEach(function (ln) { LINE2WS[ln] = g.ws; });
  });
  function normN(n) { return String(n || "").toLowerCase().replace(/\s+/g, ""); }
  var NORM2WS = {};
  Object.keys(LINE2WS).forEach(function (ln) { NORM2WS[normN(ln)] = ln; });

  function h2m(h, oldFmt) {
    if (h === null || h === undefined) return null;
    h = Number(h);
    if (h < 60) return oldFmt ? h * 60 : h;
    return Math.floor(h / 100) * 60 + (h % 100);
  }
  var DAY_START = 480, DAY_NORM_END = 1040, DAY_END = 1220;
  var NIGHT_START = 1230, NIGHT_OT_START = 350, NIGHT_END = 480;
  var fmt = function (n) {
    if (n === null || n === undefined || isNaN(n)) return "--";
    return Math.round(n).toLocaleString("en-US");
  };

  function aggLine(arr) {
    var raw = arr || [];
    var oldFmt = raw.some(function (p) {
      var h = Number(p.h);
      return h >= 8 && h <= 17 && h !== 10;
    });
    var pts = [];
    raw.forEach(function (p) {
      var m = h2m(p.h, oldFmt);
      if (m === null) return;
      pts.push({ m: m, a: Number(p.actual) || 0, p: Number(p.plan) || 0 });
    });
    pts.sort(function (x, y) { return x.m - y.m; });
    var res = { day: null, nightCur: null, nightTail: null };
    var dp = pts.filter(function (x) { return x.m >= DAY_START && x.m <= DAY_END; });
    if (dp.length) {
      var lastD = dp[dp.length - 1];
      var cut = null;
      for (var i = 0; i < dp.length; i++) if (dp[i].m <= DAY_NORM_END) cut = dp[i];
      var normA = cut ? cut.a : 0;
      var totalA = lastD.a;
      res.day = { total: totalA, norm: normA, ot: Math.max(0, totalA - normA) };
    }
    var np = pts.filter(function (x) { return x.m >= NIGHT_START; });
    if (np.length) {
      var lastN = np[np.length - 1];
      res.nightCur = { total: lastN.a, norm: lastN.a, ot: 0, live: true };
    }
    var tp = pts.filter(function (x) { return x.m < DAY_START; });
    if (tp.length) {
      var lastT = tp[tp.length - 1];
      var tCut = null;
      for (var j = 0; j < tp.length; j++) if (tp[j].m <= NIGHT_OT_START) tCut = tp[j];
      var tNormA = tCut ? tCut.a : 0;
      res.nightTail = { total: lastT.a, norm: tNormA, ot: Math.max(0, lastT.a - tNormA), live: false };
    }
    return res;
  }

  function loadHC(date, cb) {
    fetch(HC_URL + "/" + date + ".json?t=" + Date.now(), { signal: AbortSignal.timeout(6000) })
      .then(function (r) { return r.json(); })
      .then(function (j) { cb(j || {}); })
      .catch(function () { cb({}); });
  }
  function saveHC(date, hc) {
    fetch(HC_URL + "/" + date + ".json", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(hc)
    }).catch(function () { });
  }

  /* ════════════════ DOM (v4: 对齐主看板) ════════════════
   * 视觉 = 主看板: #000 底 / #232329 边 / #a3adbb 灰字 / #f0f6fc 主字
   *        语义色仅标数值: 正常=#58a6ff 加班=#d29922 */
  var css = [
    "#anaRoot{position:fixed;inset:0;z-index:9999;overflow:auto;background:#000;color:#f0f6fc;",
    "font-family:'Segoe UI','Microsoft YaHei',sans-serif;font-size:12px;padding:10px 16px}",
    "#anaRoot *{box-sizing:border-box;margin:0;padding:0}",
    "#anaRoot input[type=date]{background:#000;color:#f0f6fc;border:1px solid #232329;border-radius:6px;",
    "padding:3px 8px;font-size:12px;color-scheme:dark}",
    "#anaRoot ::-webkit-scrollbar{width:9px;height:9px}#anaRoot ::-webkit-scrollbar-thumb{background:#21262d;border-radius:5px}",
    "#anaRoot ::-webkit-scrollbar-thumb:hover{background:#30363d}",
    "/* 顶栏(同主看板 title-wrap + header-right) */",
    ".ana-head{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}",
    ".ana-head h1{font-size:16px;font-weight:800;letter-spacing:.3px;display:flex;align-items:center;gap:8px;margin-right:6px}",
    ".ana-head h1 .sub{font-size:11px;color:#484f58;font-weight:400;margin-left:2px}",
    ".ana-ctl{margin-left:auto;display:flex;align-items:center;gap:8px}",
    ".btn{background:#000;color:#58a6ff;border:1px solid rgba(88,166,255,.35);border-radius:6px;padding:3px 10px;",
    "font-size:11.5px;cursor:pointer;transition:all .15s;white-space:nowrap}",
    ".btn:hover{border-color:#58a6ff;background:rgba(88,166,255,.08)}",
    ".btn.gray{color:#a3adbb;border-color:#232329}.btn.gray:hover{border-color:#484f58;color:#f0f6fc;background:none}",
    "#anaHelpBtn.on{color:#f0f6fc;border-color:#58a6ff}",
    "#anaStatus{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#a3adbb;white-space:nowrap}",
    "#anaStatus .dot{width:7px;height:7px;border-radius:50%;background:#3fb950;box-shadow:0 0 6px rgba(63,185,80,.6)}",
    "#anaStatus.st-err .dot{background:#f85149;box-shadow:0 0 6px rgba(248,81,73,.6)}",
    "#anaStatus.st-idle .dot{background:#484f58;box-shadow:none}",
    "#anaHelpBox{display:none;background:#000;border:1px solid #232329;border-top:none;border-radius:0 0 10px 10px;",
    "padding:10px 14px;font-size:11px;color:#8b949e;line-height:1.9;margin-top:-8px;margin-bottom:10px}",
    "#anaHelpBox b{color:#a3adbb}",
    "/* KPI 行(逐像素复刻主看板 .kpis/.kpi) */",
    "#anaKpis{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:10px;flex-shrink:0}",
    ".ana-kpi{background:#000;border:1px solid #232329;border-radius:10px;padding:4px 12px;box-shadow:0 4px 14px rgba(0,0,0,.25);",
    "min-width:0;display:flex;flex-direction:column;justify-content:center}",
    ".ana-kpi .kt{display:flex;justify-content:space-between;align-items:center;gap:6px;min-width:0}",
    ".ana-kpi .lb{font-size:12.5px;color:#a3adbb;font-weight:700;display:flex;align-items:center;gap:5px;white-space:nowrap}",
    ".ana-kpi .va{font-size:22px;font-weight:700;line-height:1.1;letter-spacing:.5px;flex-shrink:0;font-variant-numeric:tabular-nums}",
    ".ana-kpi .va.blue{color:#58a6ff}.ana-kpi .va.orange{color:#d29922}.ana-kpi .va.green{color:#3fb950}",
    ".ana-kpi .sb{font-size:11px;color:#a3adbb;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    "/* 主面板(同主看板 .panel) */",
    ".panel{background:#000;border:1px solid #232329;border-radius:10px;padding:8px 12px;box-shadow:0 4px 14px rgba(0,0,0,.25);margin-bottom:10px}",
    ".panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap}",
    ".panel-head h2{font-size:12.5px;color:#a3adbb;font-weight:700;letter-spacing:.5px;display:flex;align-items:center;gap:6px}",
    ".panel-head h2 .tt{font-weight:400;color:#484f58;font-size:10.5px;letter-spacing:0}",
    "/* 表(同主看板 table) */",
    ".table-scroll{overflow-x:auto}",
    "#anaTable,#anaDetTable{width:100%;border-collapse:collapse;font-size:11.5px;font-variant-numeric:tabular-nums;white-space:nowrap}",
    "#anaTable th,#anaDetTable th{text-align:right;padding:4px 8px;color:#a3adbb;font-weight:600;font-size:11px;",
    "border-bottom:1px solid #232329;white-space:nowrap;position:sticky;top:0;background:#000;z-index:1}",
    "#anaTable th:first-child,#anaDetTable th:first-child{text-align:left}",
    "#anaTable td,#anaDetTable td{text-align:right;padding:8px 8px;border-bottom:1px solid #1b1d22;color:#d7dee6}",
    "#anaTable tr:hover td,#anaDetTable tbody tr:hover td{background:#0d1117}",
    "#anaTable .ws-td{text-align:left;font-size:13px;font-weight:800;color:#f0f6fc}",
    "#anaTable .ws-td small{font-weight:400;color:#6e7681;font-size:10px;margin-left:6px;letter-spacing:0}",
    ".bar-cell{padding:3px 8px!important;min-width:160px}",
    ".hbar{position:relative;height:16px;background:#0d1117;border-radius:8px;overflow:hidden}",
    ".hbar .b-n{position:absolute;left:0;top:0;bottom:0;background:#58a6ff;border-radius:8px 0 0 8px;min-width:2px}",
    ".hbar .b-o{position:absolute;top:0;bottom:0;background:#d29922;min-width:2px}",
    ".hbar .b-nt{position:absolute;top:0;bottom:0;background:#30363d;min-width:2px}",
    ".hb-leg{font-size:9.5px;color:#484f58;display:flex;gap:10px;margin-top:2px}",
    ".hb-leg i{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:3px;vertical-align:-1px}",
    ".nm{color:#58a6ff}.ot{color:#d29922}.tot{color:#f0f6fc;font-weight:700}.dim{color:#484f58}",
    ".eff-up{color:#3fb950;font-weight:700}.eff-dn{color:#f85149;font-weight:700}",
    "#anaTable tr.sum td{font-weight:700;border-top:1px solid #2a2f3a;color:#f0f6fc;background:rgba(88,166,255,.06)}",
    "#anaTable tr.sum td:first-child{color:#58a6ff}",
    "#anaTable tr.sel td{background:#11151d!important}",
    "#anaTable tr.sel .ws-td{color:#58a6ff}",
    "#anaTable td.ws-empty{color:#484f58}",
    "#anaDetWrap{display:none}",
    "#anaDetTable td.ws-line{text-align:left;font-weight:700;color:#f0f6fc;font-size:12px}",
    "#anaDetTable tr.sum td{font-weight:700;border-top:1px solid #2a2f3a;background:rgba(88,166,255,.06);color:#f0f6fc}",
    "#anaDetTable input.hc{width:52px;background:#000;color:#e6edf3;border:1px solid #232329;border-radius:6px;padding:2px 4px;",
    "font-size:11.5px;text-align:center;font-variant-numeric:tabular-nums}",
    "#anaDetTable input.hc:focus{border-color:#58a6ff;outline:none}",
    "#anaDetTable input.hc::placeholder{color:#30363d}",
    ".ana-state{display:flex;align-items:center;justify-content:center;gap:12px;padding:60px 0;color:#a3adbb;font-size:13px}",
    ".spinner{width:20px;height:20px;border-radius:50%;border:2px solid #21262d;border-top-color:#58a6ff;animation:anaSpin .7s linear infinite}",
    "@keyframes anaSpin{to{transform:rotate(360deg)}}",
    "@media (max-width:900px){#anaKpis{grid-template-columns:repeat(2,1fr)}}"
  ].join("\n");

  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var root = document.createElement("div");
  root.id = "anaRoot";
  root.innerHTML =
    '<div class="ana-head">' +
    "<h1>🏭 车间产出分析<span class='sub'>正常 vs 加班 · 点击车间行展开明细</span></h1>" +
    '<input type="date" id="anaDate">' +
    '<div class="ana-ctl">' +
    '<span id="anaStatus" class="st-idle"><span class="dot"></span><span id="anaStatusTxt">就绪</span></span>' +
    '<button class="btn gray" id="anaHelpBtn">ⓘ 口径</button>' +
    '<button class="btn" id="anaBack">← 返回看板</button>' +
    "</div></div>" +
    '<div id="anaHelpBox"><b>口径</b> 白班 8:00–20:20 · 正常 ≤17:20 · 加班 17:20–20:20　|　夜班 20:30–次日8:00 · 加班 5:50–7:50<br>' +
    '<b>数据</b> MES 10 分钟快照（班内累计，夜班 20:30 归零重计）· 完整夜班归入开始日 · 历史日期读云端归档<br>' +
    '<b>人均</b> 展开车间明细 → 手填各线正常/加班人数（云端保存）→ 自动算人均对比</div>' +
    '<div id="anaKpis"></div>' +
    '<div class="ana-state" id="anaState" style="display:none"><div class="spinner"></div><span id="anaStateTxt">加载中…</span></div>' +
    '<div class="panel" id="anaPanel">' +
    '<div class="panel-head"><h2>📋 车间产出对比 <span class="tt">白班·正常 / 加班 / 夜班 拆解</span></h2>' +
    '<span id="anaHeadNote" class="tt" style="font-size:10.5px;color:#6e7681"></span></div>' +
    '<div class="table-scroll"><table id="anaTable"><thead></thead><tbody></tbody></table></div>' +
    "</div>" +
    '<div id="anaDetWrap"><div class="panel" style="margin-bottom:0">' +
    '<div class="panel-head"><h2 id="anaDetTitle">📋 <span id="anaDotTxt"></span> 车间明细 <span class="tt" id="anaDetSub"></span></h2>' +
    '<div class="ana-ctl" style="margin-left:auto">' +
    '<span id="anaDetSum" class="tt" style="font-size:11px;color:#a3adbb;font-variant-numeric:tabular-nums"></span>' +
    '<button class="btn gray" id="anaClose">✕ 收起</button></div></div>' +
    '<div class="table-scroll"><table id="anaDetTable"><thead></thead><tbody></tbody></table></div>' +
    "</div></div>";

  var dateInput = root.querySelector("#anaDate");
  var kpisEl = root.querySelector("#anaKpis");
  var cmpTbl = root.querySelector("#anaTable");
  var detWrap = root.querySelector("#anaDetWrap");
  var detTitle = root.querySelector("#anaDetTitle");
  var detSub = root.querySelector("#anaDetSub");
  var detSum = root.querySelector("#anaDetSum");
  var detDot = root.querySelector("#anaDotTxt");
  var detTbl = root.querySelector("#anaDetTable");
  var statusEl = root.querySelector("#anaStatus");
  var statusTxt = root.querySelector("#anaStatusTxt");
  var stateEl = root.querySelector("#anaState");
  var stateTxt = root.querySelector("#anaStateTxt");
  var helpBox = root.querySelector("#anaHelpBox");
  var helpBtn = root.querySelector("#anaHelpBtn");
  var headNote = root.querySelector("#anaHeadNote");

  root.querySelector("#anaBack").onclick = function () { root.remove(); };
  root.querySelector("#anaClose").onclick = function () { state.selWs = null; detWrap.style.display = "none"; drawCmp(); };
  helpBtn.onclick = function () {
    var show = helpBox.style.display !== "block";
    helpBox.style.display = show ? "block" : "none";
    helpBtn.classList.toggle("on", show);
  };

  var state = { hourly: {}, hc: {}, date: null, selWs: null, today: null, wsAgg: null, sum: null };

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function setStatus(txt, kind) {
    statusTxt.textContent = txt;
    statusEl.className = "st-" + (kind || "idle");
  }
  function setState(show, spinner, txt) {
    stateEl.style.display = show ? "flex" : "none";
    if (spinner !== undefined) stateEl.innerHTML = spinner ? '<div class="spinner"></div>' : "";
    if (txt !== undefined) stateTxt.textContent = txt;
  }

  function load(date) {
    state.date = date;
    var isToday = date === state.today;
    setStatus("加载中…", "idle");
    setState(true, true, "加载数据…");
    var url = isToday ? DATA_URL : "https://dm111-e8a7d-default-rtdb.firebaseio.com/archive/" + date + ".json";
    Promise.all([
      fetch(url + "?t=" + Date.now(), { signal: AbortSignal.timeout(15000) }).then(function (r) { return r.json(); }),
      loadHC(date)
    ]).then(function (res) {
      var d = res[0] || {};
      if (!d || !d.hourly || Object.keys(d.hourly).length === 0) {
        setState(true, false, isToday ? "今天暂无生产数据" : "该日无归档数据");
        cmpTbl.querySelector("tbody").innerHTML = "";
        kpisEl.innerHTML = "";
        detWrap.style.display = "none";
        setStatus(isToday ? "暂无数据" : "无归档", "idle");
        return;
      }
      state.hourly = d.hourly || {};
      state.hc = res[1] || {};
      aggregateAndRender();
      setState(false);
      setStatus("更新 " + (d.updatedAt ? d.updatedAt.replace("T", " ").substring(5, 16) : (isToday ? "实时" : date)), "ok");
    }).catch(function () {
      setState(true, false, "加载失败，请重试");
      setStatus("加载失败", "err");
    });
  }

  function aggregateAndRender() {
    var wsAgg = {}, SUM = { dayTotal: 0, dayNorm: 0, dayOt: 0, ntTotal: 0, ntOt: 0 };
    WS_MAP.forEach(function (g) { wsAgg[g.ws] = { dayTotal: 0, dayNorm: 0, dayOt: 0, ntTotal: 0, ntNorm: 0, ntOt: 0, nLine: 0 }; });
    Object.keys(state.hourly).forEach(function (rawName) {
      var std = NORM2WS[normN(rawName)];
      if (!std) return;
      var ws = LINE2WS[std];
      var g = wsAgg[ws];
      if (!g) return;
      var s = aggLine(state.hourly[rawName]);
      g.nLine++;
      if (s.day) { g.dayTotal += s.day.total; g.dayNorm += s.day.norm; g.dayOt += s.day.ot; }
      if (s.nightCur) g.ntTotal += s.nightCur.total;
      if (s.nightTail) { g.ntTotal += s.nightTail.total; g.ntNorm += s.nightTail.norm; g.ntOt += s.nightTail.ot; }
    });
    WS_MAP.forEach(function (g) {
      var a = wsAgg[g.ws];
      SUM.dayTotal += a.dayTotal; SUM.dayNorm += a.dayNorm; SUM.dayOt += a.dayOt;
      SUM.ntTotal += a.ntTotal; SUM.ntOt += a.ntOt;
    });
    state.wsAgg = wsAgg;
    state.sum = SUM;
    drawKpis();
    drawCmp();
    if (state.selWs && wsAgg[state.selWs] && wsAgg[state.selWs].nLine) drawDet(state.selWs);
    else { state.selWs = null; detWrap.style.display = "none"; }
  }

  function wsMeta(ws) {
    for (var i = 0; i < WS_MAP.length; i++) if (WS_MAP[i].ws === ws) return WS_MAP[i];
    return null;
  }

  /* KPI: 主看板同款(label左 emoji + value右 22px) */
  function drawKpis() {
    var s = state.sum;
    var items = [
      { e: "🏭", lb: "总产出", v: fmt(s.dayTotal + s.ntTotal), cls: "", sb: "白班+夜班 全车间" },
      { e: "🔵", lb: "白班·正常", v: fmt(s.dayNorm), cls: "blue", sb: "≤17:20" },
      { e: "🟠", lb: "加班产出", v: fmt(s.dayOt + s.ntOt), cls: "orange", sb: "白班OT 17:20后 + 夜班OT" },
      { e: "🌙", lb: "夜班产出", v: fmt(s.ntTotal), cls: "", sb: "今晚 + 凌晨段" }
    ];
    kpisEl.innerHTML = items.map(function (k) {
      return '<div class="ana-kpi"><div class="kt"><div class="lb">' + k.e + " " + k.lb + '</div><div class="va ' + k.cls + '">' + k.v + "</div></div><div class='sb'>" + k.sb + "</div></div>";
    }).join("");
  }

  /* 车间对比表(与主看板 mainTable 同构) */
  function drawCmp() {
    var hcAll = {};
    Object.keys(state.hc).forEach(function (ln) {
      var hc = state.hc[ln] || {};
      hcAll[ln] = { n: Number(hc.normal_hc) || 0, o: Number(hc.ot_hc) || 0 };
    });
    var th = "<tr><th>#</th><th>车间</th><th style='text-align:left'>Output <span style='color:#484f58;font-weight:400'>(正常/加班/夜班)</span></th>" +
      "<th>总产出</th><th>白班·正常</th><th>白班·加班</th><th>夜班</th><th>加班人均效益</th></tr>";
    var html = "";
    WS_MAP.forEach(function (g, idx) {
      var a = state.wsAgg[g.ws];
      var hcn = 0, hco = 0;
      g.lines.forEach(function (ln) {
        var h = hcAll[ln];
        if (h) { hcn += h.n; hco += h.o; }
      });
      var noLines = g.lines.length === 0;
      var empty = noLines || (a.nLine === 0 && a.dayTotal === 0 && a.ntTotal === 0);
      var dayTot = a.dayTotal, ntTot = a.ntTotal, grand = dayTot + ntTot;
      var tot = Math.max(1, grand);
      var bar = empty ? '<div class="hbar"></div>' :
        '<div class="hbar">' +
        (a.dayNorm > 0 ? '<div class="b-n" style="width:' + (a.dayNorm / tot * 100).toFixed(1) + '%"></div>' : "") +
        (a.dayOt > 0 ? '<div class="b-o" style="left:' + (a.dayNorm / tot * 100).toFixed(1) + '%;width:' + (a.dayOt / tot * 100).toFixed(1) + '%"></div>' : "") +
        (ntTot > 0 ? '<div class="b-nt" style="left:' + ((a.dayNorm + a.dayOt) / tot * 100).toFixed(1) + '%;width:' + (ntTot / tot * 100).toFixed(1) + '%"></div>' : "") +
        "</div>" +
        '<div class="hb-leg"><span><i style="background:#58a6ff"></i>正常 ' + fmt(a.dayNorm) + '</span>' +
        '<span><i style="background:#d29922"></i>OT ' + fmt(a.dayOt) + '</span>' +
        '<span><i style="background:#30363d"></i>夜 ' + fmt(ntTot) + "</span></div>";
      /* 加班人均效益: 需要 正常人数>0 且 加班人数>0 才可比 */
      var pv = "--";
      var pc = "dim";
      if (a.dayOt > 0 && hcn > 0 && hco > 0) {
        var dN = a.dayNorm / hcn, dO = a.dayOt / hco;
        pv = dO.toFixed(0) + " / " + dN.toFixed(0);
        pc = dO >= dN ? "eff-up" : "eff-dn";
      } else if (empty) { pv = "—"; pc = "dim"; }
      var nm = g.ws;
      var sel = state.selWs === g.ws;
      html += "<tr data-ws='" + g.ws + "'" + (sel ? " class='sel'" : "") + ">" +
        "<td class='dim'>" + String(idx + 1).padStart(2, "0") + "</td>" +
        "<td class='ws-td" + (empty ? " ws-empty" : "") + "'>" + nm + "<small>" + (empty ? "未配置/无数据" : g.tag + " · " + g.lines.length + "线") + "</small></td>" +
        "<td style='text-align:left'>" + bar + "</td>" +
        "<td class='tot'>" + (empty ? "—" : fmt(grand)) + "</td>" +
        "<td class='nm'>" + (empty || !a.dayNorm ? "—" : fmt(a.dayNorm)) + "</td>" +
        "<td class='ot'>" + (empty || !a.dayOt ? "—" : fmt(a.dayOt)) + "</td>" +
        "<td class='tot'>" + (empty || !ntTot ? "—" : fmt(ntTot)) + "</td>" +
        "<td class='" + pc + "'>" + pv + "</td></tr>";
    });
    var s = state.sum;
    html += "<tr class='sum'><td colspan='2'>合计 · 全车间</td><td style='text-align:left'></td><td>" + fmt(s.dayTotal + s.ntTotal) +
      "</td><td>" + fmt(s.dayNorm) + "</td><td>" + fmt(s.dayOt) + "</td><td>" + fmt(s.ntTotal) + "</td><td></td></tr>";
    cmpTbl.querySelector("thead").innerHTML = th;
    cmpTbl.querySelector("tbody").innerHTML = html;
    headNote.textContent = "「加班人均效益」= 加班人均/正常人均 · 绿▲加班更值 · 红▼正常更值 · 人数在明细中手填";
    Array.prototype.forEach.call(cmpTbl.querySelectorAll("tr[data-ws]"), function (tr) {
      tr.onclick = function () {
        var ws = tr.getAttribute("data-ws");
        var a = state.wsAgg[ws];
        if (!a || !a.nLine) return;
        state.selWs = (state.selWs === ws) ? null : ws;
        drawCmp();
        if (state.selWs) drawDet(state.selWs); else detWrap.style.display = "none";
      };
    });
  }

  function drawDet(ws) {
    var g = wsMeta(ws);
    var a = state.wsAgg[ws];
    detDot.textContent = ws;
    detDot.style.color = WS_ACC[ws] || "#58a6ff";
    detSub.textContent = g.tag + " · 各线明细 · 人数手填后自动算人均";
    detSum.textContent = "车间合计 " + fmt(a.dayTotal + a.ntTotal) + " · 白班 " + fmt(a.dayTotal) + " · 夜班 " + fmt(a.ntTotal);
    var hcAll = {};
    Object.keys(state.hc).forEach(function (ln) {
      var hc = state.hc[ln] || {};
      hcAll[ln] = { n: hc.normal_hc, o: hc.ot_hc };
    });
    var th = "<tr><th>线体</th><th style='text-align:left'>构成</th><th>白班总</th><th>正常 ≤17:20</th><th>加班</th><th>夜班</th>" +
      "<th>正常人数</th><th>加班人数</th><th>人均 · 正常 / 加班</th></tr>";
    var rows = "", dN = 0, dO = 0;
    g.lines.forEach(function (ln) {
      var raw = state.hourly[ln];
      if (!raw) return;
      var s = aggLine(raw);
      var hc = hcAll[ln] || {};
      var hn = Number(hc.n) || 0, ho = Number(hc.o) || 0;
      dN += hn; dO += ho;
      var dayP = s.day ? (hn ? (s.day.norm / hn) : null) : null;
      var otP = (s.day && s.day.ot > 0 && ho) ? (s.day.ot / ho) : null;
      var dayTot = s.day ? s.day.total : 0;
      var ntCur = s.nightCur ? s.nightCur.total : 0;
      var ntTail = s.nightTail ? s.nightTail.total : 0;
      var ntTot = ntCur + ntTail;
      var ntOt = s.nightTail ? s.nightTail.ot : 0;
      var ntTip = s.nightTail ? ("今晚 " + fmt(ntCur) + " · 凌晨 " + fmt(ntTail)) : "今晚 " + fmt(ntCur);
      var tot = Math.max(1, dayTot + ntTot);
      var bar = "";
      if (dayTot > 0 || ntTot > 0) {
        bar = '<div class="hbar" style="min-width:150px;height:12px">' +
          (s.day && s.day.norm > 0 ? '<div class="b-n" style="width:' + (s.day.norm / tot * 100).toFixed(1) + '%"></div>' : "") +
          (s.day && s.day.ot > 0 ? '<div class="b-o" style="left:' + (s.day.norm / tot * 100).toFixed(1) + '%;width:' + (s.day.ot / tot * 100).toFixed(1) + '%"></div>' : "") +
          (ntTot > 0 ? '<div class="b-nt" style="left:' + (((s.day ? s.day.norm : 0) + (s.day ? s.day.ot : 0)) / tot * 100).toFixed(1) + '%;width:' + (ntTot / tot * 100).toFixed(1) + '%"></div>' : "") +
          "</div>";
      } else bar = '<div class="hbar" style="min-width:150px;height:12px"></div>';
      rows += "<tr data-ln='" + ln + "'>" +
        "<td class='ws-line'>" + ln + "</td>" +
        "<td style='text-align:left'>" + bar + "</td>" +
        "<td class='tot'>" + fmt(dayTot) + "</td>" +
        "<td class='nm'>" + (s.day ? fmt(s.day.norm) : "—") + "</td>" +
        "<td class='ot'>" + (s.day ? fmt(s.day.ot) : "—") + "</td>" +
        "<td class='tot' title='" + ntTip + "'>" + (ntTot > 0 ? fmt(ntTot) : "—") + (ntOt > 0 ? '<span class="ot" style="font-size:10px"> +OT' + fmt(ntOt) + "</span>" : "") + "</td>" +
        "<td><input class='hc' type='number' min='0' placeholder='—' value='" + (hc.n || "") + "' data-f='normal_hc'></td>" +
        "<td><input class='hc' type='number' min='0' placeholder='—' value='" + (hc.o || "") + "' data-f='ot_hc'></td>" +
        "<td>" + (dayP === null && otP === null ? '<span class="dim">—</span>' : (dayP === null ? "--" : dayP.toFixed(0)) + " / " + (otP === null ? "--" : otP.toFixed(0))) + "</td></tr>";
    });
    rows += "<tr class='sum'><td>合计 (" + g.lines.length + " 线)</td><td></td><td>" + fmt(a.dayTotal) + "</td><td>" + fmt(a.dayNorm) + "</td><td>" + fmt(a.dayOt) +
      "</td><td>" + fmt(a.ntTotal) + "</td><td>" + (dN || "") + "</td><td>" + (dO || "") +
      "</td><td>" + (dN ? (a.dayNorm / dN).toFixed(0) : "--") + " / " + (dO ? (a.dayOt / dO).toFixed(0) : "--") + "</td></tr>";
    detTbl.querySelector("thead").innerHTML = th;
    detTbl.querySelector("tbody").innerHTML = rows;
    detWrap.style.display = "block";
    detWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
    Array.prototype.forEach.call(detTbl.querySelectorAll("input.hc"), function (inp) {
      inp.onchange = function () {
        var ln = inp.closest("tr").getAttribute("data-ln");
        var f = inp.getAttribute("data-f");
        var v = inp.value === "" ? null : Number(inp.value);
        var hc = state.hc[ln] || {};
        hc[f] = v;
        state.hc[ln] = hc;
        saveHC(state.date, state.hc);
        drawCmp();
        drawDet(state.selWs);
      };
    });
  }

  var started = false;
  window.openAnaPage = function () {
    if (document.getElementById("anaRoot")) { root.style.display = "flex"; return; }
    state.today = todayStr();
    dateInput.max = state.today;
    dateInput.onchange = function () {
      if (!dateInput.value) return;
      state.selWs = null;
      detWrap.style.display = "none";
      load(dateInput.value);
    };
    if (!dateInput.value) dateInput.value = state.today;
    document.body.appendChild(root);
    started = true;
    load(dateInput.value || state.today);
  };
  window.closeAnaPage = function () { if (root.parentNode) root.remove(); };
  setInterval(function () {
    if (root.parentNode && state.date === state.today) load(state.today);
  }, 3600000);
})();
