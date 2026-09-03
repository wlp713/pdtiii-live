/* ============================================================
 * 车间产出分析页 v5 — 效率仪表盘 (独立模块, 零侵入主看板)
 * 叙事主线: 「加班到底值不值」 → 正常时段效率 vs 加班时段效率
 *
 * 口径(用户 2026-09-02 确认):
 *   白班 8:00–20:20 | 正常 ≤17:20 | 加班 17:20–20:20 (净3.0h)
 *   夜班 20:30–次日8:00 | 正常 20:30–5:50(净8.17h) | 加班 5:50–7:50(净2.0h)
 *   白班正常净时 7.67h(8:00–17:20 扣 4 段休 100min)
 *   UPH(线·小时) = 车间/全厂该窗产出 ÷ (当日有数据线数 × 窗净时)
 *      → 不依赖人数也能比效率; 提报人数后另算人均
 *   人数: 车间级 4 字段(白正常/白OT/夜正常/夜OT) → analysis/hc/{date}.json
 *     待接自动化数据源(用户提供路径后写提取脚本 → 自动 PUT)
 *
 * 2026-09-02 v5: 仪表盘化重设计(首屏 KPI 对比带 + 4 卡 + 底部折叠填报)
 *   删除 v4: 车间 tag 小字 / 条形图下说明小字 / 线级明细展开 / 灰字注释
 *   新增: vs 对比带(白/夜 tab)、车间效率对比柱图、加班人力柱图(双班)、
 *         加班依赖度条、趋势折线(读 history/ 每日归档, 近7/14/30天)
 * ============================================================ */
(function () {
  "use strict";
  if (document.getElementById("anaRoot")) return;

  var DATA_URL = "https://dm111-e8a7d-default-rtdb.firebaseio.com/pdtiii.json";
  var HC_URL = "https://dm111-e8a7d-default-rtdb.firebaseio.com/analysis/hc";

  /* ── 车间 → 线体 (True B 剔除, 用户确认) ── */
  var WS_MAP = [
    { ws: "Pro.1", tag: "", lines: ["Motor AC", "Motor CL", "Motor WL", "Motor F-Series", "Motor H-Series", "Motor S-Series"] },
    { ws: "Pro.2", tag: "", lines: ["Final A line", "Final B line", "Final C line", "Final D line", "Inspection A line", "Inspection B line", "Inspection C line", "Inspection D line", "Water Line", "Rotor A line", "Rotor B line", "Rotor C line", "Rotor D line"] },
    { ws: "Pro.3", tag: "", lines: ["Welding A line", "Welding B line", "Welding C line", "Welding D line", "Press C-Shaft"] },
    { ws: "Pro.4", tag: "", lines: ["C-Shaft Body A", "C-Shaft Body B", "C-Shaft Body C", "C-Shaft Pin A", "C-Shaft Pin C", "C-Shft Pin B", "Piston Grinding", "Rod Pispin", "Frame Honing FL"] },
    { ws: "Pro.5", tag: "", lines: ["Piston honing FL", "Cylinder Honing"] },
    { ws: "Pro.6", tag: "", lines: [] }
  ];
  var WS_ACC = { "Pro.1": "#3fb950", "Pro.2": "#58a6ff", "Pro.3": "#d29922", "Pro.4": "#bc8cff", "Pro.5": "#39c5cf", "Pro.6": "#f778ba" };
  var LINE2WS = {};
  WS_MAP.forEach(function (g) { g.lines.forEach(function (ln) { LINE2WS[ln] = g.ws; }); });
  var NORM2WS = {};
  Object.keys(LINE2WS).forEach(function (ln) { NORM2WS[String(ln).toLowerCase().replace(/\s+/g, "")] = ln; });
  function normN(n) { return String(n || "").toLowerCase().replace(/\s+/g, ""); }

  function h2m(h, oldFmt) {
    if (h === null || h === undefined) return null;
    h = Number(h);
    if (h < 60) return oldFmt ? h * 60 : h;
    return Math.floor(h / 100) * 60 + (h % 100);
  }
  var DAY_START = 480, DAY_NORM_END = 1040, DAY_END = 1220; // 8:00 / 17:20 / 20:20
  var NIGHT_START = 1230, NIGHT_OT_START = 350, NIGHT_END = 480; // 20:30 / 5:50 / 8:00
  /* 净时段(小时): 白正常 7.67h / 白OT 3h / 夜正常 8.17h / 夜OT 2h */
  var NET = { dN: 7.67, dO: 3, nN: 8.17, nO: 2 };
  var fmt = function (n) {
    if (n === null || n === undefined || isNaN(n)) return "--";
    return Math.round(n).toLocaleString("en-US");
  };

  /* 单线聚合: 返回各窗口末点累计 → 产出(件) */
  function aggLine(arr) {
    var raw = arr || [];
    var oldFmt = raw.some(function (p) { var h = Number(p.h); return h >= 8 && h <= 17 && h !== 10; });
    var pts = [];
    raw.forEach(function (p) {
      var m = h2m(p.h, oldFmt);
      if (m === null) return;
      pts.push({ m: m, a: Number(p.actual) || 0, p: Number(p.plan) || 0 });
    });
    pts.sort(function (x, y) { return x.m - y.m; });
    var res = { dayNorm: 0, dayOt: 0, nLive: 0, nNorm: 0, nOt: 0, hasDay: false, hasNight: false };
    var dp = pts.filter(function (x) { return x.m >= DAY_START && x.m <= DAY_END; });
    if (dp.length) {
      res.hasDay = true;
      var cut = null;
      for (var i = 0; i < dp.length; i++) if (dp[i].m <= DAY_NORM_END) cut = dp[i];
      var normA = cut ? cut.a : 0;
      var totalA = dp[dp.length - 1].a;
      res.dayNorm = normA; res.dayOt = Math.max(0, totalA - normA);
    }
    /* 今晚 20:30 起实时段(累计到最新快照) */
    var np = pts.filter(function (x) { return x.m >= NIGHT_START; });
    if (np.length) { res.hasNight = true; res.nLive = np[np.length - 1].a; }
    /* 凌晨 0:00–7:59 段(归前一夜班; 5:50 前=夜班正常, 5:50 后=夜班OT) */
    var tp = pts.filter(function (x) { return x.m < DAY_START; });
    if (tp.length) {
      res.hasNight = true;
      var tCut = null;
      for (var j = 0; j < tp.length; j++) if (tp[j].m <= NIGHT_OT_START) tCut = tp[j];
      var tA = tp[tp.length - 1].a;
      var tNA = tCut ? tCut.a : 0;
      res.nNorm = tNA; res.nOt = Math.max(0, tA - tNA);
    }
    return res;
  }

  /* 车间聚合 (dayL/nightL = 当日该车间有 白/夜 数据的线数, 作 UPH 分母) */
  function aggWs(wsMap) {
    var out = {}, tot = { dN: 0, dO: 0, nL: 0, nN: 0, nO: 0, dayL: 0, nightL: 0, lines: 0 };
    WS_MAP.forEach(function (g) { out[g.ws] = { dN: 0, dO: 0, nL: 0, nN: 0, nO: 0, dayL: 0, nightL: 0, lines: 0 }; });
    Object.keys(wsMap).forEach(function (rawName) {
      var std = NORM2WS[normN(rawName)];
      if (!std) return;
      var ws = LINE2WS[std]; if (!ws) return;
      var s = aggLine(wsMap[rawName]);
      var g = out[ws];
      g.dN += s.dayNorm; g.dO += s.dayOt; g.nL += s.nLive; g.nN += s.nNorm; g.nO += s.nOt;
      g.lines++;
      if (s.hasDay) g.dayL++;
      if (s.hasNight) g.nightL++;
    });
    WS_MAP.forEach(function (g) {
      var a = out[g.ws];
      tot.dN += a.dN; tot.dO += a.dO; tot.nL += a.nL; tot.nN += a.nN; tot.nO += a.nO;
      tot.lines += a.lines; tot.dayL += a.dayL; tot.nightL += a.nightL;
    });
    return { ws: out, tot: tot };
  }

  /* UPH(线·小时) = 窗产出 ÷ (当日有数据线数 × 窗净时); null=无数据 */
  function uphDayNorm(a) { return a.dayL ? a.dN / (a.dayL * NET.dN) : null; }
  function uphDayOt(a) { return a.dayL ? a.dO / (a.dayL * NET.dO) : null; }
  function uphNightLive(a) { var h = nightNetNow(); return (h && a.nightL) ? a.nL / (a.nightL * h) : null; }
  function uphNightNorm(a) { return a.nightL ? a.nN / (a.nightL * NET.nN) : null; }
  function uphNightOt(a) { return a.nightL ? a.nO / (a.nightL * NET.nO) : null; }

  function loadHC(date, cb) {
    fetch(HC_URL + "/" + date + ".json?t=" + Date.now(), { signal: AbortSignal.timeout(6000) })
      .then(function (r) { return r.json(); }).then(function (j) { cb(j || {}); }).catch(function () { cb({}); });
  }
  function saveHC(date, hc) {
    fetch(HC_URL + "/" + date + ".json", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(hc) }).catch(function () { });
  }

  /* ═══════════ CSS ═══════════ */
  var css = [
    "#anaRoot{position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#000;color:#f0f6fc;",
    "font-family:'Segoe UI','Microsoft YaHei',sans-serif;font-size:12px;padding:0 18px 24px}",
    "#anaRoot *{box-sizing:border-box;margin:0;padding:0}",
    "#anaRoot ::-webkit-scrollbar{width:9px;height:9px}#anaRoot ::-webkit-scrollbar-thumb{background:#21262d;border-radius:5px}",
    "#anaRoot input[type=date]{background:#0d0f14;color:#f0f6fc;border:1px solid #2a2f3a;border-radius:8px;padding:4px 9px;",
    "font-size:12px;color-scheme:dark;font-family:inherit}",
    ".ic{width:32px;height:32px;border-radius:50%;border:1px solid #2a2f3a;background:transparent;color:#a3adbb;",
    "font-size:15px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0}",
    ".ic:hover{border-color:#58a6ff;color:#58a6ff;background:rgba(88,166,255,.08)}",
    "#anaBack{margin-right:2px}",
    ".tt{font-size:11px;color:#a3adbb}",
    ".ana-top{display:flex;align-items:center;gap:12px;padding:12px 2px 2px;position:sticky;top:0;background:#000;z-index:20}",
    ".ana-top h1{font-size:17px;font-weight:800;letter-spacing:.3px;display:flex;align-items:center;gap:10px}",
    ".ana-top h1 .cnt{font-size:10px;font-weight:600;color:#8b949e;border:1px solid #2a2f3a;border-radius:20px;padding:2px 8px}",
    ".ana-rt{margin-left:auto;display:flex;align-items:center;gap:10px}",
    "#anaStatus{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#8b949e}",
    "#anaStatus .dot{width:7px;height:7px;border-radius:50%;background:#3fb950;box-shadow:0 0 6px rgba(63,185,80,.6)}",
    "#anaStatus.st-err .dot{background:#f85149}#anaStatus.st-idle .dot{background:#484f58;box-shadow:none}",
    ".subrow{display:flex;align-items:center;gap:8px;padding:8px 2px 10px}",
    ".chips{display:inline-flex;background:#0d0f14;border:1px solid #2a2f3a;border-radius:20px;padding:2px;gap:2px}",
    ".chips button{border:0;background:transparent;color:#8b949e;font-size:11px;font-weight:600;padding:4px 14px;border-radius:16px;cursor:pointer;font-family:inherit;transition:all .12s}",
    ".chips button.on{background:#21262d;color:#f0f6fc}",
    ".chips button:hover:not(.on){color:#f0f6fc}",
    "/* vs 对比带 */",
    "#vsBand{display:flex;align-items:stretch;gap:10px;margin-bottom:10px}",
    ".vs-side{flex:1;background:#0d0f14;border:1px solid #2a2f3a;border-radius:14px;padding:10px 18px;display:flex;align-items:center;justify-content:space-between;min-width:0}",
    ".vs-side .lb{font-size:11.5px;color:#8b949e;font-weight:700;display:flex;align-items:center;gap:7px}",
    ".vs-side .lb .tag{font-size:9px;font-weight:600;padding:1px 6px;border-radius:10px;background:rgba(88,166,255,.12);color:#58a6ff}",
    ".vs-side.ot .lb .tag{background:rgba(210,153,34,.14);color:#d29922}",
    ".vs-side .num{font-size:30px;font-weight:800;letter-spacing:.5px;font-variant-numeric:tabular-nums;line-height:1.05}",
    ".vs-side .num small{font-size:12px;font-weight:600;color:#6e7681;margin-left:4px}",
    ".vs-side .sb{font-size:10px;color:#6e7681;margin-top:5px}",
    ".vs-mid{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 6px;gap:6px}",
    ".vs-mid .vsw{font-size:11px;font-weight:800;color:#484f58;letter-spacing:1px}",
    "#diffChip{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:800;padding:5px 12px;border-radius:20px;font-variant-numeric:tabular-nums}",
    "#diffChip.good{background:rgba(63,185,80,.12);color:#3fb950;border:1px solid rgba(63,185,80,.35)}",
    "#diffChip.bad{background:rgba(248,81,73,.1);color:#f85149;border:1px solid rgba(248,81,73,.3)}",
    "#diffChip.flat{background:#0d0f14;color:#8b949e;border:1px solid #2a2f3a}",
    "/* 卡片 */",
    ".grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}",
    ".card{background:#0d0f14;border:1px solid #2a2f3a;border-radius:14px;padding:12px 14px 8px;min-width:0}",
    ".card h3{font-size:11px;color:#8b949e;font-weight:700;letter-spacing:.4px;display:flex;align-items:center;gap:8px;margin-bottom:2px}",
    ".card h3 .pl{width:7px;height:7px;border-radius:2px}",
    ".card .hint-r{margin-left:auto;display:flex;align-items:center;gap:10px;font-size:9.5px;color:#6e7681}",
    ".card .hint-r .lg{display:inline-flex;align-items:center;gap:4px}",
    ".card .hint-r .lg i{width:8px;height:8px;border-radius:2px}",
    ".card canvas{width:100%;display:block}",
    ".empty-tip{color:#484f58;font-size:11px;padding:26px 0;text-align:center;letter-spacing:.3px}",
    ".bar-list{display:flex;flex-direction:column;gap:2px;padding:6px 0}",
    ".brow{display:flex;align-items:center;gap:10px;padding:3px 0;font-variant-numeric:tabular-nums}",
    ".brow .nm{width:44px;font-size:12px;font-weight:800;color:#f0f6fc;flex-shrink:0}",
    ".brow .barw{flex:1;min-width:0;display:flex;align-items:center;gap:6px}",
    ".brow .hb{flex:1;height:9px;background:#161b22;border-radius:5px;overflow:hidden;display:flex}",
    ".brow .hb span{height:100%}",
    ".brow .pc{width:44px;text-align:right;font-size:11.5px;font-weight:700;color:#d29922;flex-shrink:0}",
    ".brow .pc.off{color:#6e7681}",
    ".brow .num{width:60px;text-align:right;font-size:11px;color:#8b949e;flex-shrink:0}",
    "/* 填报面板 */",
    "#fillPanel{border:1px solid #2a2f3a;border-radius:14px;background:#0d0f14;overflow:hidden;margin-top:10px}",
    "#fillHead{display:flex;align-items:center;gap:10px;padding:9px 14px;cursor:pointer;user-select:none}",
    "#fillHead h3{font-size:11.5px;color:#8b949e;font-weight:700;letter-spacing:.4px;display:flex;align-items:center;gap:8px}",
    "#fillHead .ch{width:9px;height:9px;border-right:2px solid #8b949e;border-bottom:2px solid #8b949e;transform:rotate(45deg);transition:transform .15s;margin-top:-3px}",
    "#fillPanel.open #fillHead .ch{transform:rotate(-135deg);margin-top:3px}",
    "#fillHead .note{margin-left:auto;font-size:10px;color:#6e7681}",
    "#fillBody{display:none;padding:4px 10px 12px}",
    "#fillPanel.open #fillBody{display:block}",
    "table#anaTable{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums}",
    "#anaTable th{text-align:right;padding:5px 8px;color:#6e7681;font-weight:600;font-size:10px;border-bottom:1px solid #2a2f3a;white-space:nowrap;letter-spacing:.3px}",
    "#anaTable th:first-child,#anaTable td:first-child{text-align:left}",
    "#anaTable td{padding:7px 8px;border-bottom:1px solid #1b1e24;text-align:right;white-space:nowrap}",
    "#anaTable tr:hover td{background:#11141a}",
    "#anaTable .nmw{font-weight:800;font-size:13px;color:#f0f6fc}",
    "#anaTable .nmw small{color:#6e7681;font-size:9px;font-weight:600;margin-left:6px}",
    "#anaTable .g{color:#58a6ff;font-weight:700}#anaTable .o{color:#d29922;font-weight:700}",
    "#anaTable .ng{color:#8b949e;font-weight:400}",
    "#anaTable .tot-r{font-weight:800;color:#f0f6fc}",
    "#anaTable td.pc2{color:#484f58;font-size:10.5px}",
    "#anaTable tr.s-row td{border-top:1px solid #2a2f3a;font-weight:800;background:rgba(88,166,255,.05)}",
    "input.hc{width:58px;background:#08090c;color:#e6edf3;border:1px solid #2a2f3a;border-radius:7px;padding:3px 5px;",
    "font-size:12px;text-align:center;font-variant-numeric:tabular-nums;font-family:inherit}",
    "input.hc:focus{border-color:#58a6ff;outline:none}input.hc::placeholder{color:#3d434d}",
    ".hcwrap{display:inline-flex;align-items:center;gap:4px}",
    ".hcwrap .hl{font-size:9px;color:#484f58;width:14px}",
    ".ana-state{display:flex;flex-direction:column;align-items:center;gap:12px;padding:70px 0;color:#8b949e;font-size:12.5px}",
    ".spinner{width:22px;height:22px;border-radius:50%;border:2px solid #21262d;border-top-color:#58a6ff;animation:anaSpin .7s linear infinite}",
    "@keyframes anaSpin{to{transform:rotate(360deg)}}",
    "@media (max-width:1000px){.grid2{grid-template-columns:1fr}}"
  ].join("\n");

  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var root = document.createElement("div");
  root.id = "anaRoot";
  root.innerHTML =
    '<div class="ana-top">' +
    '<button class="ic" id="anaBack" title="返回看板">←</button>' +
    "<h1>产出分析 <span class='cnt' id='anacnt'></span></h1>" +
    '<div class="ana-rt">' +
    '<span id="anaStatus" class="st-idle"><span class="dot"></span><span id="anaStatusTxt">就绪</span></span>' +
    '<input type="date" id="anaDate">' +
    "</div></div>" +
    '<div class="subrow"><div class="chips" id="shiftChips"><button data-sh="day" class="on">白班</button><button data-sh="night">夜班</button></div>' +
    '<div class="chips" id="winChips" style="display:none"><button data-w="7" class="on">7天</button><button data-w="14">14天</button><button data-w="30">30天</button></div></div>' +
    /* vs 对比带 */
    '<div id="vsBand">' +
    '<div class="vs-side" id="vsN"><div><div class="lb">正常时段 <span class="tag" id="vsNtag">白班 ≤17:20</span></div><div class="num" id="vsNnum">--</div><div class="sb" id="vsNsb"></div></div></div>' +
    '<div class="vs-mid"><span class="vsw">效率对比</span><span id="diffChip" class="flat">--</span></div>' +
    '<div class="vs-side ot" id="vsO"><div><div class="lb">加班时段 <span class="tag" id="vsOtag">白班 17:20–20:20</span></div><div class="num" id="vsOnum">--</div><div class="sb" id="vsOsb"></div></div></div>' +
    "</div>" +
    /* 卡1 车间效率对比 */
    '<div class="card" style="margin-bottom:10px"><h3><span class="pl" style="background:#58a6ff"></span>车间效率对比 <span class="hint-r">单位 UPH 件/线·时</span></h3><canvas id="cvCmp"></canvas></div>' +
    '<div class="grid2">' +
    /* 卡2 加班人力 */
    '<div class="card"><h3><span class="pl" style="background:#d29922"></span>加班人力 提报 <span class="hint-r"><span class="lg"><i style="background:#d29922"></i>白班OT</span><span class="lg"><i style="background:#bc8cff"></i>夜班OT</span></span></h3>' +
    '<canvas id="cvOt"></canvas><div class="empty-tip" id="otEmpty" style="display:none">人数在下方「车间数据」填入，或待自动化数据源接入</div></div>' +
    /* 卡3 加班依赖度 */
    '<div class="card"><h3><span class="pl" style="background:#d29922"></span>加班依赖度 <span class="hint-r">OT产出 ÷ 白班产出</span></h3><div class="bar-list" id="depList"></div></div>' +
    "</div>" +
    /* 卡4 趋势 */
    '<div class="card"><h3><span class="pl" style="background:#39c5cf"></span>趋势 · 正常 vs 加班 日产出' +
    '<span class="hint-r"><span class="lg"><i style="background:#58a6ff"></i>正常产出</span><span class="lg"><i style="background:#d29922"></i>加班产出</span></span></h3>' +
    '<canvas id="cvTrend"></canvas><div class="empty-tip" id="trendEmpty" style="display:none"></div></div>' +
    /* 填报面板 */
    '<div id="fillPanel"><div id="fillHead"><div class="ch"></div><h3>车间数据 · 白班/夜班人数提报</h3><span class="note" id="fillNote"></span></div>' +
    '<div id="fillBody"><div class="table-scroll"><table id="anaTable"><thead></thead><tbody></tbody></table></div></div></div>';

  var dateInput = root.querySelector("#anaDate");
  var statusEl = root.querySelector("#anaStatus"), statusTxt = root.querySelector("#anaStatusTxt");
  var vsNnum = root.querySelector("#vsNnum"), vsOnum = root.querySelector("#vsOnum");
  var vsNtag = root.querySelector("#vsNtag"), vsOtag = root.querySelector("#vsOtag");
  var vsNsb = root.querySelector("#vsNsb"), vsOsb = root.querySelector("#vsOsb");
  var diffChip = root.querySelector("#diffChip");
  var cvCmp = root.querySelector("#cvCmp"), cvOt = root.querySelector("#cvOt"), cvTrend = root.querySelector("#cvTrend");
  var depList = root.querySelector("#depList");
  var otEmpty = root.querySelector("#otEmpty"), trendEmpty = root.querySelector("#trendEmpty");
  var fillPanel = root.querySelector("#fillPanel"), fillNote = root.querySelector("#fillNote");
  var tbl = root.querySelector("#anaTable");
  var cntEl = root.querySelector("#anacnt");
  var winChips = root.querySelector("#winChips");

  root.querySelector("#anaBack").onclick = function () { root.remove(); };
  fillPanel.querySelector("#fillHead").onclick = function () { fillPanel.classList.toggle("open"); };

  var state = { hourly: {}, hc: {}, wsAgg: null, date: null, today: null, sh: "day", win: 7, trend: null };

  function todayStr() {
    return typeof bkkDateStr === "function" ? bkkDateStr() : (function () { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })(); // ★ v5.42 泰国日期
  }
  function setStatus(txt, k) { statusTxt.textContent = txt; statusEl.className = "st-" + (k || "idle"); }
  function nowMins() { return typeof bkkMins === "function" ? bkkMins() : (function () { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); })(); } // ★ v5.42 泰国时间
  /* 夜班已过净时(20:30 起): 休息 22:30-22:40(10m) + 00:30-01:30(60m) 分段扣除 */
  function nightNetNow() {
    var m = nowMins();
    var rel = null;
    if (m >= NIGHT_START) rel = m - NIGHT_START;
    else if (m < NIGHT_END) rel = (1440 - NIGHT_START) + m;
    if (rel === null) return null;
    var net = rel;
    if (rel > 130) net -= 10;   /* 过 22:30–22:40 */
    if (rel > 300) net -= 60;   /* 过 00:30–01:30 */
    return Math.max(0, net) / 60;
  }

  /* ═══════════ 数据加载 ═══════════ */
  function load(date, keepWs) {
    state.date = date;
    var isToday = date === state.today;
    setStatus("加载中…");
    var url = isToday ? DATA_URL : "history/" + date + ".json";
    Promise.all([
      fetch(url + (isToday ? "?t=" + Date.now() : ""), { signal: AbortSignal.timeout(15000) }).then(function (r) { return r.json(); }),
      loadHC(date)
    ]).then(function (res) {
      var d = res[0] || {};
      if (!d || !d.hourly || !Object.keys(d.hourly).length) {
        cntEl.textContent = "无数据";
        return fail("该日无生产数据");
      }
      state.hourly = d.hourly;
      state.hc = res[1] || {};
      renderAll();
      setStatus("更新于 " + (d.updatedAt ? String(d.updatedAt).substring(11, 16) : ""), "ok");
    }).catch(function () { fail("加载失败，请重试"); });
    function fail(t) {
      setStatus(t, "err");
      vsNnum.textContent = vsOnum.textContent = "--";
    }
  }

  function loadTrend() {
    /* 历史 = 仓库 history/*.json (仅白班完整: 归档 17:00). 今天实时不参与历史轴 */
    var last = [];
    var d0 = new Date(state.today); d0.setDate(d0.getDate() - 1);
    var days = [];
    for (var i = 1; i <= 40; i++) { var x = new Date(d0); x.setDate(d0.getDate() - (i - 1)); days.push(iso(x)); }
    function iso(x) { return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); }
    var seen = 0;
    days.forEach(function (dt) {
      fetch("history/" + dt + ".json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
        seen++;
        if (d && d.hourly) {
          var a = aggWs(d.hourly);
          last.push({ d: dt, dN: a.tot.dN, dO: a.tot.dO, hasD: a.tot.dayL > 0 });
        }
        if (seen >= days.length) { last.sort(function (a, b) { return a.d < b.d ? -1 : 1; }); state.trend = last; drawTrend(); }
      }).catch(function () { seen++; if (seen >= days.length) { state.trend = last; drawTrend(); } });
    });
  }

  /* ═══════════ 渲染总入口 ═══════════ */
  function renderAll() {
    state.wsAgg = aggWs(state.hourly);
    drawVs(); drawCmp(); drawOt(); drawDep(); drawTable();
    cntEl.textContent = Object.keys(state.hourly).length + " 线";
  }

  function wsData() { return state.hc; }
  function wsOf(ws) {
    var a = state.wsAgg.ws[ws];
    var hc = state.hc[ws] || {};
    return {
      dN: a.dN, dO: a.dO, nL: a.nL, nN: a.nN, nO: a.nO,
      lines: a.lines, dayL: a.dayL, nightL: a.nightL,
      hcD: Number(hc.d) || 0, hcDO: Number(hc.dO) || 0, hcN: Number(hc.n) || 0, hcNO: Number(hc.nO) || 0
    };
  }

  /* ── vs 对比带 ── */
  function drawVs() {
    var t = state.wsAgg.tot;
    var isDay = state.sh === "day";
    var upN, upO, tagN, tagO, sbN, sbO;
    if (isDay) {
      upN = uphDayNorm(t); upO = uphDayOt(t);
      tagN = "白班 ≤17:20"; tagO = "白班 17:20–20:20";
      sbN = "净时段 7.67h · " + t.dayL + " 线"; sbO = "净时段 3.0h · " + t.dayL + " 线";
    } else {
      var live = (t.nL > 0);
      upN = live ? uphNightLive(t) : uphNightNorm(t);
      upO = (t.nO > 0) ? uphNightOt(t) : null;
      tagN = "夜班 20:30–5:50"; tagO = "凌晨 5:50–7:50";
      sbN = live ? "今晚实时 · 净" + (nightNetNow() ? nightNetNow().toFixed(1) : "-") + "h" : "净时段 8.17h · " + t.nightL + " 线";
      sbO = (t.nO > 0) ? "净时段 2.0h · " + t.nightL + " 线" : "凌晨段于次日 8:00 前记账";
    }
    vsNtag.textContent = tagN; vsOtag.textContent = tagO;
    vsNnum.innerHTML = upN === null ? "--" : fmt(upN) + "<small>件/线·时</small>";
    vsNsb.textContent = sbN;
    if (upO === null || upN === null || upN === 0) {
      vsOnum.innerHTML = upO === null ? "—" : fmt(upO) + "<small>件/线·时</small>";
      vsOsb.textContent = sbO;
      diffChip.className = "flat";
      diffChip.textContent = upN === null ? "等待数据" : "—";
      return;
    }
    vsOnum.innerHTML = fmt(upO) + "<small>件/线·时</small>";
    vsOsb.textContent = sbO;
    var d = (upO - upN) / upN * 100;
    var g = d >= 0;
    diffChip.className = Math.abs(d) < 3 ? "flat" : (g ? "good" : "bad");
    diffChip.textContent = (g ? "▲" : "▼") + " 加班" + (g ? "高" : "低") + " " + Math.abs(d).toFixed(0) + "%";
  }

  /* ── 卡1 车间效率对比柱 (白班: 正常 vs OT UPH; 夜班: 实时/凌晨正常 vs 凌晨OT) ── */
  function drawCmp() {
    var isDay = state.sh === "day";
    var rows = [];
    var any = false;
    WS_MAP.forEach(function (g) {
      var d = wsOf(g.ws);
      var v1 = isDay ? uphDayNorm(d) : (d.nL > 0 ? uphNightLive(d) : uphNightNorm(d));
      var v2 = isDay ? uphDayOt(d) : uphNightOt(d);
      if (v1 !== null || v2 !== null) any = true;
      rows.push({ nm: g.ws, v1: v1, v2: v2 });
    });
    if (!any) {
      var cv = cvCmp;
      var ctx = cv.getContext("2d");
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.fillStyle = "#484f58"; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
      ctx.fillText(isDay ? "—" : "夜班 20:30 后开始统计", cv.width / 2 / (window.devicePixelRatio || 1), 60);
      return;
    }
    barChart(cvCmp, {
      labels: rows.map(function (r) { return r.nm; }),
      s1: rows.map(function (r) { return r.v1; }), s1c: "#58a6ff",
      s2: rows.map(function (r) { return r.v2; }), s2c: "#d29922",
      lg1: isDay ? "正常" : "夜正常", lg2: isDay ? "加班" : "凌晨OT", h: 208
    });
  }

  /* ── 卡2 加班人力柱: 每车间 白OT / 夜OT 人数 ── */
  function drawOt() {
    var hcs = [];
    var any = false;
    WS_MAP.forEach(function (g) {
      var hc = state.hc[g.ws] || {};
      var dO = Number(hc.dO) || 0, nO = Number(hc.nO) || 0;
      if (dO || nO) any = true;
      hcs.push({ nm: g.ws, dO: dO, nO: nO });
    });
    otEmpty.style.display = any ? "none" : "block";
    barChart(cvOt, {
      labels: hcs.map(function (h) { return h.nm; }),
      s1: hcs.map(function (h) { return h.dO; }), s1c: "#d29922",
      s2: hcs.map(function (h) { return h.nO; }), s2c: "#bc8cff",
      lg1: "白OT", lg2: "夜OT", h: 178, int: true
    });
  }

  /* ── 卡3 加班依赖度(横向条: 白班正常/OT 构成 + OT占白班%) ── */
  function drawDep() {
    var rows = [];
    WS_MAP.forEach(function (g) {
      var d = wsOf(g.ws);
      var dayTot = d.dN + d.dO;
      rows.push({ nm: g.ws, dN: d.dN, dO: d.dO, dayTot: dayTot, lines: d.lines });
    });
    rows.sort(function (x, y) {
      var px = x.dayTot > 0 ? x.dO / x.dayTot : 0, py = y.dayTot > 0 ? y.dO / y.dayTot : 0;
      return py - px;
    });
    depList.innerHTML = rows.map(function (r) {
      var pct = r.dayTot > 0 ? r.dO / r.dayTot * 100 : null;
      var segN = r.dN > 0 ? '<span style="background:#58a6ff;width:' + (r.dN / r.dayTot * 100) + '%"></span>' : "";
      var segO = r.dO > 0 ? '<span style="background:#d29922;width:' + (r.dO / r.dayTot * 100) + '%"></span>' : "";
      return '<div class="brow"><span class="nm">' + r.nm + '</span>' +
        '<span class="barw"><span class="hb">' + segN + segO + "</span>" +
        '<span class="pc' + (pct === null || r.lines === 0 ? " off" : "") + '">' + (r.lines === 0 ? "—" : pct.toFixed(0) + "%") + "</span></span>" +
        '<span class="num">' + fmt(r.dayTot) + "</span></div>";
    }).join("");
  }

  /* ── 底部车间填报 ── */
  function drawTable() {
    var isToday = state.date === state.today;
    var th = "<tr><th>车间</th><th>白班正常</th><th>白班加班</th><th>夜班 实时/凌晨</th>" +
      "<th>白班 正常</th><th>白班 OT</th><th>夜班 正常</th><th>夜班 OT</th><th>加班占比</th></tr>";
    var html = "";
    WS_MAP.forEach(function (g) {
      var d = wsOf(g.ws);
      var hc = state.hc[g.ws] || {};
      var empty = d.lines === 0;
      var pct = d.dN + d.dO > 0 ? d.dO / (d.dN + d.dO) * 100 : null;
      var nt = d.nL + d.nN + d.nO;
      html += "<tr><td class='nmw'>" + g.ws + "</td>" +
        "<td class='g'>" + (empty ? "—" : fmt(d.dN)) + "</td>" +
        "<td class='o'>" + (empty ? "—" : fmt(d.dO)) + "</td>" +
        "<td class='tot-r'>" + (empty ? "—" : fmt(nt)) + "</td>" +
        "<td><div class='hcwrap'><span class='hl'>白</span><input class='hc' type='number' min='0' placeholder='0' value='" + (hc.d || "") + "' data-ws='" + g.ws + "' data-f='d'></div></td>" +
        "<td><div class='hcwrap'><span class='hl'>OT</span><input class='hc' type='number' min='0' placeholder='0' value='" + (hc.dO || "") + "' data-ws='" + g.ws + "' data-f='dO'></div></td>" +
        "<td><div class='hcwrap'><span class='hl'>白</span><input class='hc' type='number' min='0' placeholder='0' value='" + (hc.n || "") + "' data-ws='" + g.ws + "' data-f='n'></div></td>" +
        "<td><div class='hcwrap'><span class='hl'>OT</span><input class='hc' type='number' min='0' placeholder='0' value='" + (hc.nO || "") + "' data-ws='" + g.ws + "' data-f='nO'></div></td>" +
        "<td class='" + (pct === null ? "pc2" : "o") + "'>" + (pct === null ? "—" : pct.toFixed(0) + "%") + "</td></tr>";
    });
    var t = state.wsAgg.tot;
    var tp = t.dN + t.dO > 0 ? t.dO / (t.dN + t.dO) * 100 : 0;
    html += "<tr class='s-row'><td>合计</td><td class='g'>" + fmt(t.dN) + "</td><td class='o'>" + fmt(t.dO) + "</td><td class='tot-r'>" + fmt(t.nL + t.nN + t.nO) +
      "</td><td colspan='4'></td><td class='o'>" + tp.toFixed(0) + "%</td></tr>";
    tbl.querySelector("thead").innerHTML = th;
    tbl.querySelector("tbody").innerHTML = html;
    fillNote.textContent = (isToday ? "提报即存云端 · 自动化数据源接入后将自动填充" : "历史日 · 数据只读，人数沿用该日提报");
    Array.prototype.forEach.call(tbl.querySelectorAll("input.hc"), function (inp) {
      inp.onchange = function () {
        if (!isToday) return;
        var ws = inp.getAttribute("data-ws"), f = inp.getAttribute("data-f");
        var hc = state.hc[ws] || {};
        hc[f] = inp.value === "" ? null : Number(inp.value);
        state.hc[ws] = hc;
        saveHC(state.date, state.hc);
        drawOt();
      };
    });
  }

  /* ═══════════ Canvas 柱图 (双序列) ═══════════ */
  var _tipEl = null;
  function tip() {
    if (!_tipEl) {
      _tipEl = document.createElement("div");
      _tipEl.style.cssText = "position:fixed;z-index:99;background:#161b22;border:1px solid #30363d;border-radius:8px;" +
        "padding:6px 10px;font-size:11px;color:#f0f6fc;pointer-events:none;display:none;font-variant-numeric:tabular-nums;box-shadow:0 8px 24px rgba(0,0,0,.5)";
      document.body.appendChild(_tipEl);
    }
    return _tipEl;
  }
  function barChart(cv, cfg) {
    function draw() {
      var dpr = window.devicePixelRatio || 1;
      var W = cv.clientWidth, H = cfg.h || 200;
      if (W < 20) return;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
      var ctx = cv.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var padL = 40, padR = 10, padT = 18, padB = 22;
      var n = cfg.labels.length;
      var allV = cfg.s1.concat(cfg.s2).filter(function (v) { return v !== null && v !== undefined; });
      var maxV = allV.length ? Math.max.apply(null, allV) : 1;
      maxV = cfg.int ? Math.ceil(maxV) : (Math.ceil(maxV / 10) * 10 || 10);
      var cw = W - padL - padR, ch = H - padT - padB;
      ctx.font = "10px sans-serif";
      ctx.strokeStyle = "#1c2026"; ctx.fillStyle = "#6e7681";
      for (var i = 0; i <= 4; i++) {
        var y = padT + ch - (ch * i / 4);
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
        ctx.textAlign = "right";
        ctx.fillText(cfg.int ? fmt((maxV * i / 4)) : ((maxV * i / 4) >= 100 ? fmt(maxV * i / 4) : (maxV * i / 4).toFixed(0)), padL - 6, y + 3);
      }
      var group = cw / n;
      var bw = Math.min(30, group * 0.26);
      var has2 = cfg.s2 && cfg.s2.some(function (v) { return v !== null && v !== undefined; });
      var hitRects = [];
      cfg.labels.forEach(function (lb, i) {
        var gx = padL + group * i + group / 2;
        var has1 = cfg.s1[i] !== null && cfg.s1[i] !== undefined;
        if (has1) {
          var h1 = Math.max(0, cfg.s1[i] / maxV * ch);
          if (h1 > 0.5) {
            var x1 = has2 ? gx - bw - 1.5 : gx - bw / 2;
            rRect(ctx, x1, padT + ch - h1, bw, h1, cfg.s1c, 3);
            hitRects.push([x1, padT + ch - h1, bw, h1, lb, cfg.lg1 + " " + cfg.s1[i]]);
          }
        }
        if (cfg.s2 && cfg.s2[i] !== null && cfg.s2[i] !== undefined) {
          var h2 = Math.max(0, cfg.s2[i] / maxV * ch);
          if (h2 > 0.5) {
            var x2 = has2 ? gx + 1.5 : gx - bw / 2;
            rRect(ctx, x2, padT + ch - h2, bw, h2, cfg.s2c, 3);
            hitRects.push([x2, padT + ch - h2, bw, h2, lb, cfg.lg2 + " " + cfg.s2[i]]);
          }
        }
        ctx.fillStyle = "#8b949e"; ctx.textAlign = "center"; ctx.font = "10.5px sans-serif";
        ctx.fillText(lb, gx, H - 7);
      });
      cv._hits = hitRects;
      cv._cfg = cfg;
      if (!cv._bound) {
        cv._bound = true;
        cv.addEventListener("mousemove", function (e) {
          var r = cv.getBoundingClientRect();
          var x = e.clientX - r.left, y = e.clientY - r.top;
          var found = null;
          (cv._hits || []).forEach(function (h) {
            if (x >= h[0] && x <= h[0] + h[2] && y >= h[1] && y <= h[1] + h[3]) found = h;
          });
          var t = tip();
          if (found) {
            t.textContent = found[4] + " · " + found[5];
            t.style.display = "block";
            var l = Math.min(e.clientX + 14, window.innerWidth - 160);
            t.style.left = l + "px"; t.style.top = (e.clientY - 34) + "px";
            cv.style.cursor = "pointer";
          } else { t.style.display = "none"; cv.style.cursor = "default"; }
        });
        cv.addEventListener("mouseleave", function () { tip().style.display = "none"; });
      }
    }
    draw();
    if (!cv._rz) {
      cv._rz = function () { draw(); };
      window.addEventListener("resize", cv._rz);
    }
  }
  function rRect(ctx, x, y, w, h, color, r) {
    if (h < 1) return;
    r = Math.min(r, w / 2, h / 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  /* ═══════════ 趋势折线 ═══════════ */
  function drawTrend() {
    var tr = state.trend || [];
    var hasD = tr.some(function (x) { return x.dN > 0; });
    if (!hasD) {
      trendEmpty.style.display = "block";
      trendEmpty.textContent = "历史数据积累中 — 自 2026-09-03 起每日自动归档后可见趋势";
      return;
    }
    trendEmpty.style.display = "none";
    var w = state.win;
    var list = tr.filter(function (x) { return x.dN > 0 || x.dO > 0; }).slice(-w);
    var cv = cvTrend, dpr = window.devicePixelRatio || 1;
    var W = cv.clientWidth, H = 210;
    if (W < 20) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var padL = 42, padR = 12, padT = 14, padB = 24;
    var cw = W - padL - padR, ch = H - padT - padB;
    var allV = [];
    list.forEach(function (x) { allV.push(x.dN, x.dO); });
    var maxV = Math.max(1, Math.ceil(Math.max.apply(null, allV) / 10) * 10);
    ctx.strokeStyle = "#1c2026"; ctx.fillStyle = "#6e7681"; ctx.font = "10px sans-serif";
    for (var i = 0; i <= 4; i++) {
      var y = padT + ch - (ch * i / 4);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.textAlign = "right"; ctx.fillText(fmt(maxV * i / 4), padL - 6, y + 3);
    }
    function line(key, color) {
      var vals = list.map(function (x) { return x[key] || 0; });
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineJoin = "round";
      ctx.beginPath();
      vals.forEach(function (v, i) {
        var x = list.length === 1 ? padL + cw / 2 : padL + cw * i / (list.length - 1);
        var y = padT + ch - (v / maxV * ch);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      /* 端点圆点 + hover 由 tooltip 承担(简化: 画数据点) */
      vals.forEach(function (v, i) {
        if (v <= 0) return;
        var x = list.length === 1 ? padL + cw / 2 : padL + cw * i / (list.length - 1);
        var y = padT + ch - (v / maxV * ch);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill();
      });
    }
    line("dN", "#58a6ff");
    line("dO", "#d29922");
    /* x 轴标签: 显示日期 M/D */
    ctx.fillStyle = "#6e7681"; ctx.textAlign = "center"; ctx.font = "9.5px sans-serif";
    var step = Math.max(1, Math.ceil(list.length / 8));
    list.forEach(function (x, i) {
      if (i % step !== 0 && i !== list.length - 1) return;
      var xx = list.length === 1 ? padL + cw / 2 : padL + cw * i / (list.length - 1);
      ctx.fillText(x.d.substring(5), xx, H - 8);
    });
  }

  /* ═══════════ 事件 & 初始化 ═══════════ */
  root.querySelector("#shiftChips").addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    state.sh = b.getAttribute("data-sh");
    root.querySelectorAll("#shiftChips button").forEach(function (x) { x.classList.toggle("on", x === b); });
    winChips.style.display = state.sh === "day" ? "none" : "none";
    if (state.wsAgg) { drawVs(); drawCmp(); }
  });
  winChips.addEventListener("click", function (e) {
    var b = e.target.closest("button"); if (!b) return;
    state.win = Number(b.getAttribute("data-w"));
    root.querySelectorAll("#winChips button").forEach(function (x) { x.classList.toggle("on", x === b); });
    drawTrend();
  });
  dateInput.onchange = function () { if (dateInput.value) { state.sel = null; load(dateInput.value); } };

  window.openAnaPage = function () {
    if (document.getElementById("anaRoot")) { root.style.display = ""; return; }
    state.today = todayStr();
    dateInput.max = state.today;
    if (!dateInput.value) dateInput.value = state.today;
    document.body.appendChild(root);
    load(dateInput.value || state.today);
    loadTrend();
  };
  window.closeAnaPage = function () { if (root.parentNode) root.remove(); };
  setInterval(function () {
    if (root.parentNode && state.date === state.today) load(state.today);
  }, 600000);
})();
