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
  /* ★ v5.44 线名对齐: PDTIII 实际名 "Inspection A/B/C/D"(无 line 后缀) 与 "Rotor B/D Line"(大 L) 归一后补齐别名 */
  NORM2WS["inspectiona"] = "Inspection A line";
  NORM2WS["inspectionb"] = "Inspection B line";
  NORM2WS["inspectionc"] = "Inspection C line";
  NORM2WS["inspectiond"] = "Inspection D line";
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
"#anaRoot{position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#000;color:#e6edf3;",
"font-family:'Segoe UI','Microsoft YaHei','PingFang SC',sans-serif;font-size:12.5px;padding:0 clamp(14px,2vw,34px) 36px;scrollbar-gutter:stable}",
"#anaRoot *{box-sizing:border-box;margin:0;padding:0}",
"#anaRoot ::-webkit-scrollbar{width:10px;height:10px}",
"#anaRoot ::-webkit-scrollbar-track{background:transparent}",
"#anaRoot ::-webkit-scrollbar-thumb{background:#21262d;border-radius:6px;border:2px solid #000}",
"#anaRoot ::-webkit-scrollbar-thumb:hover{background:#2d333b}",
"#anaRoot input[type=date]{background:#0b0e13;color:#e6edf3;border:1px solid rgba(255,255,255,.14);border-radius:8px;padding:5px 10px;",
"font-size:12px;color-scheme:dark;font-family:inherit;height:30px;transition:border-color .15s, box-shadow .15s}",
"#anaRoot input[type=date]:focus{border-color:#58a6ff;outline:none;box-shadow:0 0 0 3px rgba(88,166,255,.18)}",
".ana-in{max-width:1560px;margin:0 auto;width:100%}",
".ic{width:32px;height:32px;border-radius:10px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.02);color:#a3adbb;",
"font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0}",
".ic:hover{border-color:#58a6ff;color:#58a6ff;background:rgba(88,166,255,.1);transform:translateX(-1px)}",
"#anaBack{margin-right:2px}",
".tt{font-size:11px;color:#8b949e}",
".ana-top{display:flex;align-items:center;gap:14px;padding:14px 2px 13px;position:sticky;top:0;z-index:20;",
"background:linear-gradient(180deg,#000 78%,rgba(0,0,0,0));border-bottom:1px solid rgba(255,255,255,.05);margin-bottom:16px;backdrop-filter:blur(0)}",
".ana-top h1{font-size:19px;font-weight:800;letter-spacing:.4px;display:flex;align-items:center;gap:10px;color:#f0f6fc}",
".ana-top h1 .cnt{font-size:10.5px;font-weight:700;color:#7d8894;border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:3px 10px;font-variant-numeric:tabular-nums}",
".ana-rt{margin-left:auto;display:flex;align-items:center;gap:12px}",
"#anaStatus{display:inline-flex;align-items:center;gap:7px;font-size:11px;color:#8b949e;white-space:nowrap}",
"#anaStatus .dot{width:7px;height:7px;border-radius:50%;background:#3fb950;box-shadow:0 0 8px rgba(63,185,80,.65)}",
"#anaStatus.st-ok .dot{animation:anaPulse 1.8s ease-in-out infinite}",
"#anaStatus.st-err .dot{background:#f85149;box-shadow:0 0 8px rgba(248,81,73,.6)}",
"#anaStatus.st-idle .dot{background:#484f58;box-shadow:none}",
"@keyframes anaPulse{0%,100%{box-shadow:0 0 3px rgba(63,185,80,.4)}50%{box-shadow:0 0 10px rgba(63,185,80,.85)}}",
".subrow{display:flex;align-items:center;gap:10px;padding:0 2px 12px}",
".chips{display:inline-flex;background:#0a0d11;border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:3px;gap:2px}",
".chips button{border:0;background:transparent;color:#8b949e;font-size:12px;font-weight:600;padding:6px 18px;border-radius:9px;cursor:pointer;font-family:inherit;transition:all .15s;letter-spacing:.3px}",
".chips button.on{background:#1c222b;color:#f0f6fc;box-shadow:inset 0 0 0 1px rgba(255,255,255,.07),0 1px 4px rgba(0,0,0,.4)}",
".chips button:hover:not(.on){color:#e6edf3;background:rgba(255,255,255,.04)}",
"#vsBand{display:flex;align-items:stretch;gap:0;margin-bottom:14px;border:1px solid rgba(255,255,255,.08);border-radius:18px;background:#0a0d11;overflow:hidden}",
".vs-side{flex:1;padding:16px 22px 15px;display:flex;flex-direction:column;justify-content:center;gap:2px;min-width:0;position:relative}",
".vs-side:first-child{border-right:1px solid rgba(255,255,255,.06)}",
".vs-side .lb{font-size:12.5px;color:#9aa4b0;font-weight:600;display:flex;align-items:center;gap:8px}",
".vs-side .lb .tag{font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;background:rgba(88,166,255,.14);color:#79b8ff;letter-spacing:.2px}",
".vs-side.ot .lb .tag{background:rgba(210,153,34,.16);color:#e3b341}",
".vs-side .num{font-size:38px;font-weight:800;letter-spacing:.6px;font-variant-numeric:tabular-nums;line-height:1.1;color:#f0f6fc;margin:2px 0 1px}",
".vs-side .num small{font-size:12.5px;font-weight:600;color:#6e7681;margin-left:6px;letter-spacing:0}",
".vs-side .sb{font-size:10.5px;color:#5f6b76;font-variant-numeric:tabular-nums}",
".vs-side .sb b{color:#8b949e;font-weight:700}",
".vs-mid{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 24px;gap:8px;min-width:190px}",
".vs-side.ot{border-left:1px solid rgba(255,255,255,.06)}",
".vs-mid .vsw{font-size:10px;font-weight:800;color:#5f6b76;letter-spacing:2.5px;text-transform:uppercase}",
"#diffChip{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;font-weight:800;padding:7px 16px;border-radius:20px;font-variant-numeric:tabular-nums;letter-spacing:.2px}",
"#diffChip.good{background:rgba(63,185,80,.13);color:#4ade80;border:1px solid rgba(63,185,80,.4);box-shadow:0 0 18px rgba(63,185,80,.12)}",
"#diffChip.bad{background:rgba(248,81,73,.11);color:#ff7b72;border:1px solid rgba(248,81,73,.38);box-shadow:0 0 18px rgba(248,81,73,.1)}",
"#diffChip.flat{background:rgba(255,255,255,.03);color:#8b949e;border:1px solid rgba(255,255,255,.1)}",
".card{background:linear-gradient(180deg,#0d1015 0%,#090c10 100%);border:1px solid rgba(255,255,255,.075);border-radius:16px;padding:14px 16px 8px;min-width:0;margin-bottom:14px}",
".grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:0}",
".grid2 .card{margin-bottom:0}",
"#anaRoot .card:last-of-type{margin-bottom:14px}",
".card h3{font-size:12px;color:#9aa4b0;font-weight:700;letter-spacing:.6px;display:flex;align-items:center;gap:8px;margin-bottom:8px;min-height:16px}",
".card h3 .pl{width:8px;height:8px;border-radius:2.5px;flex-shrink:0}",
".card .hint-r{margin-left:auto;display:flex;align-items:center;gap:12px;font-size:10px;color:#6e7681;font-weight:500;letter-spacing:.2px}",
".card .hint-r .lg{display:inline-flex;align-items:center;gap:5px}",
".card .hint-r .lg i{width:9px;height:9px;border-radius:2.5px;display:inline-block}",
".card canvas{width:100%;display:block}",
".empty-tip{color:#545e69;font-size:11.5px;padding:20px 0 22px;text-align:center;letter-spacing:.4px;line-height:1.7}",
".bar-list{display:flex;flex-direction:column;gap:4px;padding:8px 2px 10px}",
".brow{display:flex;align-items:center;gap:12px;padding:4px 0;font-variant-numeric:tabular-nums}",
".brow .nm{width:52px;font-size:12.5px;font-weight:800;color:#e6edf3;flex-shrink:0;letter-spacing:.2px}",
".brow .barw{flex:1;min-width:0;display:flex;align-items:center;gap:10px}",
".brow .hb{flex:1;height:11px;background:#141922;border-radius:6px;overflow:hidden;display:flex;box-shadow:inset 0 1px 2px rgba(0,0,0,.4)}",
".brow .hb span{height:100%}",
".brow .pc{width:46px;text-align:right;font-size:12px;font-weight:800;color:#e3b341;flex-shrink:0}",
".brow .pc.off{color:#545e69;font-weight:600}",
".brow .num{width:74px;text-align:right;font-size:11.5px;color:#8b949e;flex-shrink:0}",
"#fillPanel{border:1px solid rgba(255,255,255,.08);border-radius:16px;background:linear-gradient(180deg,#0d1015 0%,#090c10 100%);overflow:hidden;margin-top:14px}",
"#fillHead{display:flex;align-items:center;gap:10px;padding:13px 16px;cursor:pointer;user-select:none;transition:background .15s}",
"#fillHead:hover{background:rgba(255,255,255,.02)}",
"#fillHead h3{font-size:12.5px;color:#9aa4b0;font-weight:700;letter-spacing:.5px;display:flex;align-items:center;gap:8px}",
"#fillHead .ch{width:8px;height:8px;border-right:2px solid #8b949e;border-bottom:2px solid #8b949e;transform:rotate(45deg);transition:transform .2s;margin-top:-3px}",
"#fillPanel.open #fillHead .ch{transform:rotate(-135deg);margin-top:3px}",
"#fillHead .note{margin-left:auto;font-size:10.5px;color:#5f6b76}",
"#fillBody{display:none;padding:2px 12px 14px}",
"#fillPanel.open #fillBody{display:block}",
".table-scroll{overflow-x:auto;border:1px solid rgba(255,255,255,.06);border-radius:12px}",
"table#anaTable{width:100%;border-collapse:collapse;font-size:12.5px;font-variant-numeric:tabular-nums;min-width:900px}",
"#anaTable th{text-align:right;padding:7px 12px;color:#6e7681;font-weight:600;font-size:10.5px;border-bottom:1px solid rgba(255,255,255,.07);white-space:nowrap;letter-spacing:.3px}",
"#anaTable thead tr:first-child th{border-bottom:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.018);font-size:10px;color:#77818c;letter-spacing:.5px}",
"#anaTable th:first-child,#anaTable td:first-child{text-align:left}",
"#anaTable td{padding:8px 12px;border-bottom:1px solid rgba(255,255,255,.045);text-align:right;white-space:nowrap}",
"#anaTable tr:last-child td{border-bottom:0}",
"#anaTable tbody tr:hover td{background:rgba(255,255,255,.022)}",
"#anaTable .nmw{font-weight:800;font-size:13.5px;color:#f0f6fc;letter-spacing:.2px}",
"#anaTable .nmw small{color:#6e7681;font-size:9.5px;font-weight:600;margin-left:7px}",
"#anaTable .g{color:#58a6ff;font-weight:700}",
"#anaTable .o{color:#e3b341;font-weight:700}",
"#anaTable .ng{color:#8b949e;font-weight:400}",
"#anaTable .tot-r{font-weight:800;color:#f0f6fc}",
"#anaTable td.pc2{color:#545e69;font-size:11px}",
"#anaTable tr.s-row td{border-top:1px solid rgba(255,255,255,.1);font-weight:800;background:rgba(88,166,255,.055)}",
"#anaTable tr.s-row:hover td{background:rgba(88,166,255,.075)}",
"input.hc{width:64px;height:27px;background:#0a0d12;color:#e6edf3;border:1px solid rgba(255,255,255,.13);border-radius:7px;padding:0 4px;",
"font-size:12.5px;text-align:center;font-variant-numeric:tabular-nums;font-family:inherit;transition:border-color .15s, box-shadow .15s}",
"input.hc:focus{border-color:#58a6ff;outline:none;box-shadow:0 0 0 3px rgba(88,166,255,.15)}",
"input.hc:hover:not(:focus){border-color:rgba(255,255,255,.28)}",
"input.hc::placeholder{color:#3d434d}",
".ana-state{display:flex;flex-direction:column;align-items:center;gap:14px;padding:80px 0;color:#8b949e;font-size:13px;letter-spacing:.3px}",
".spinner{width:24px;height:24px;border-radius:50%;border:2px solid #21262d;border-top-color:#58a6ff;animation:anaSpin .7s linear infinite}",
"@keyframes anaSpin{to{transform:rotate(360deg)}}",
"@media (max-width:1100px){.grid2{grid-template-columns:1fr}.vs-mid{min-width:150px;padding:0 14px}}",
"@media (max-width:760px){#vsBand{flex-direction:column}.vs-side:first-child{border-right:0;border-bottom:1px solid rgba(255,255,255,.06)}.vs-side.ot{border-left:0;border-top:1px solid rgba(255,255,255,.06)}.vs-mid{padding:12px;flex-direction:row;min-width:0}.ana-top{flex-wrap:wrap}}",
"#otEmpty{cursor:pointer;transition:color .15s}",
"#otEmpty:hover{color:#8b949e}"
  ].join("\n");

  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var root = document.createElement("div");
  root.id = "anaRoot";
  root.innerHTML =
  root.innerHTML =
    '<div class="ana-in">' +
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
    '<div class="vs-side" id="vsN"><div class="lb">正常时段 <span class="tag" id="vsNtag">白班 ≤17:20</span></div><div class="num" id="vsNnum">--</div><div class="sb" id="vsNsb"></div></div>' +
    '<div class="vs-mid"><span class="vsw">效率对比</span><span id="diffChip" class="flat">--</span></div>' +
    '<div class="vs-side ot" id="vsO"><div class="lb">加班时段 <span class="tag" id="vsOtag">白班 17:20–20:20</span></div><div class="num" id="vsOnum">--</div><div class="sb" id="vsOsb"></div></div>' +
    "</div>" +
    /* 卡1 车间效率对比 */
    '<div class="card"><h3><span class="pl" style="background:#58a6ff"></span>车间效率对比 <span class="hint-r">单位 件/线·时</span></h3><canvas id="cvCmp"></canvas></div>' +
    '<div class="grid2">' +
    /* 卡2 加班人力 */
    '<div class="card"><h3><span class="pl" style="background:#d29922"></span>加班人力 · 提报人数 <span class="hint-r"><span class="lg"><i style="background:#d29922"></i>白班OT</span><span class="lg"><i style="background:#bc8cff"></i>夜班OT</span></span></h3>' +
    '<canvas id="cvOt"></canvas><div class="empty-tip" id="otEmpty" style="display:none">暂无提报人数 — 点击展开下方「车间数据」填入，或待自动化数据源接入</div></div>' +
    /* 卡3 加班依赖度 */
    '<div class="card"><h3><span class="pl" style="background:#d29922"></span>加班依赖度 <span class="hint-r">加班产出 ÷ 白班产出</span></h3><div class="bar-list" id="depList"></div></div>' +
    "</div>" +
    /* 卡4 趋势 */
    '<div class="card"><h3><span class="pl" style="background:#39c5cf"></span>趋势 · 正常 vs 加班 日产出' +
    '<span class="hint-r"><span class="lg"><i style="background:#58a6ff"></i>正常产出</span><span class="lg"><i style="background:#d29922"></i>加班产出</span></span></h3>' +
    '<canvas id="cvTrend"></canvas><div class="empty-tip" id="trendEmpty" style="display:none"></div></div>' +
    /* 填报面板 */
    '<div id="fillPanel"><div id="fillHead"><div class="ch"></div><h3>车间数据 · 白班 / 夜班人数提报</h3><span class="note" id="fillNote"></span></div>' +
    '<div id="fillBody"><div class="table-scroll"><table id="anaTable"><thead></thead><tbody></tbody></table></div></div></div>' +
    "</div>";
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
  otEmpty.onclick = function () { fillPanel.classList.add("open"); fillPanel.scrollIntoView({ behavior: "smooth", block: "start" }); };

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
      ctx.fillStyle = "#545e69"; ctx.font = "12px 'Segoe UI',sans-serif"; ctx.textAlign = "center";
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
    var th = "<tr><th rowspan='2'>车间</th><th colspan='3'>当日产出 · 件</th><th colspan='4'>提报人数</th><th rowspan='2'>加班占比</th></tr>" +
      "<tr><th>白班正常</th><th>白班加班</th><th>夜班 · 实时+凌晨</th><th>白班 正常</th><th>白班 OT</th><th>夜班 正常</th><th>夜班 OT</th></tr>";
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
        "<td><input class='hc' type='number' min='0' placeholder='0' value='" + (hc.d || "") + "' data-ws='" + g.ws + "' data-f='d'></td>" +
        "<td><input class='hc' type='number' min='0' placeholder='0' value='" + (hc.dO || "") + "' data-ws='" + g.ws + "' data-f='dO'></td>" +
        "<td><input class='hc' type='number' min='0' placeholder='0' value='" + (hc.n || "") + "' data-ws='" + g.ws + "' data-f='n'></td>" +
        "<td><input class='hc' type='number' min='0' placeholder='0' value='" + (hc.nO || "") + "' data-ws='" + g.ws + "' data-f='nO'></td>" +
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
      _tipEl.style.cssText = "position:fixed;z-index:99;background:#10141a;border:1px solid rgba(255,255,255,.14);border-radius:10px;" +
        "padding:7px 12px;font-size:12px;color:#e6edf3;pointer-events:none;display:none;font-variant-numeric:tabular-nums;" +
        "box-shadow:0 10px 30px rgba(0,0,0,.6);line-height:1.4";
      document.body.appendChild(_tipEl);
    }
    return _tipEl;
  }
  /* 圆角柱: 底色调 + 顶部光泽 (sheen) */
  function barPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function barFill(ctx, x, y, w, h, color, r) {
    if (h < 1) return;
    barPath(ctx, x, y, w, h, r);
    ctx.fillStyle = color;
    ctx.fill();
    if (h > 6) {
      var g = ctx.createLinearGradient(0, y, 0, y + h * 0.55);
      g.addColorStop(0, "rgba(255,255,255,.16)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      barPath(ctx, x, y, w, h, r);
      ctx.fillStyle = g;
      ctx.fill();
    }
  }
  function hexA(hex, a) {
    var h = hex.replace("#", "");
    var n = h.length === 3 ? h.split("").map(function (c) { return c + c; }).join("") : h;
    var r = parseInt(n.substring(0, 2), 16), g = parseInt(n.substring(2, 4), 16), b = parseInt(n.substring(4, 6), 16);
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
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
      var padL = 46, padR = 14, padT = 20, padB = 26;
      var n = cfg.labels.length;
      var allV = cfg.s1.concat(cfg.s2).filter(function (v) { return v !== null && v !== undefined; });
      var maxV = allV.length ? Math.max.apply(null, allV) : 1;
      maxV = cfg.int ? Math.ceil(maxV) : (Math.ceil(maxV / 10) * 10 || 10);
      var cw = W - padL - padR, ch = H - padT - padB;
      ctx.font = "10px 'Segoe UI',sans-serif";
      for (var i = 0; i <= 4; i++) {
        var y = padT + ch - (ch * i / 4);
        ctx.strokeStyle = i === 0 ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.05)";
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
        ctx.fillStyle = "#5f6b76"; ctx.textAlign = "right";
        ctx.fillText(cfg.int ? fmt((maxV * i / 4)) : ((maxV * i / 4) >= 100 ? fmt(maxV * i / 4) : (maxV * i / 4).toFixed(0)), padL - 8, y + 3);
      }
      var group = cw / n;
      var bw = Math.max(26, Math.min(54, group * 0.3));
      var has2 = cfg.s2 && cfg.s2.some(function (v) { return v !== null && v !== undefined; });
      var hitRects = [];
      cfg.labels.forEach(function (lb, i) {
        var gx = padL + group * i + group / 2;
        var base = padT + ch;
        var has1 = cfg.s1[i] !== null && cfg.s1[i] !== undefined;
        if (has1) {
          var h1 = Math.max(0, cfg.s1[i] / maxV * ch);
          if (h1 > 0.5) {
            var x1 = has2 ? gx - bw - 2 : gx - bw / 2;
            barFill(ctx, x1, base - h1, bw, h1, cfg.s1c, 3);
            hitRects.push([x1, base - h1, bw, h1, lb, cfg.lg1 + "  " + (cfg.int ? fmt(cfg.s1[i]) : Math.round(cfg.s1[i]))]);
          }
        }
        if (cfg.s2 && cfg.s2[i] !== null && cfg.s2[i] !== undefined) {
          var h2 = Math.max(0, cfg.s2[i] / maxV * ch);
          if (h2 > 0.5) {
            var x2 = has2 ? gx + 2 : gx - bw / 2;
            barFill(ctx, x2, base - h2, bw, h2, cfg.s2c, 3);
            hitRects.push([x2, base - h2, bw, h2, lb, cfg.lg2 + "  " + (cfg.int ? fmt(cfg.s2[i]) : Math.round(cfg.s2[i]))]);
          }
        }
        ctx.fillStyle = "#76818e"; ctx.textAlign = "center"; ctx.font = "10.5px 'Segoe UI',sans-serif";
        ctx.fillText(lb, gx, H - 9);
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
            var l = Math.min(e.clientX + 14, window.innerWidth - 180);
            t.style.left = l + "px"; t.style.top = (e.clientY - 38) + "px";
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
    barFill(ctx, x, y, w, h, color, r === undefined ? 3 : r);
  }

  /* ═══════════ 趋势折线 ═══════════ */
  function drawTrend() {
    var cv = cvTrend, dpr = window.devicePixelRatio || 1;
    var W = cv.clientWidth, H = 216;
    if (W < 20) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    var tr = state.trend || [];
    var hasD = tr.some(function (x) { return x.dN > 0 || x.dO > 0; });
    if (!hasD) {
      trendEmpty.style.display = "none";
      ctx.fillStyle = "#545e69"; ctx.textAlign = "center"; ctx.font = "12.5px 'Segoe UI',sans-serif";
      ctx.fillText("历史数据积累中", W / 2, H / 2 - 8);
      ctx.font = "11px 'Segoe UI',sans-serif";
      ctx.fillStyle = "#4a5260";
      ctx.fillText("自 2026-09-03 起每日自动归档后可见趋势", W / 2, H / 2 + 12);
      return;
    }
    var list = tr.filter(function (x) { return x.dN > 0 || x.dO > 0; }).slice(-state.win);
    var padL = 46, padR = 14, padT = 18, padB = 28;
    var cw = W - padL - padR, ch = H - padT - padB;
    var allV = [];
    list.forEach(function (x) { allV.push(x.dN, x.dO); });
    var maxV = Math.max(1, Math.ceil(Math.max.apply(null, allV) / 10) * 10);
    ctx.font = "10px 'Segoe UI',sans-serif";
    for (var i = 0; i <= 4; i++) {
      var y = padT + ch - (ch * i / 4);
      ctx.strokeStyle = i === 0 ? "rgba(255,255,255,.1)" : "rgba(255,255,255,.05)";
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = "#5f6b76"; ctx.textAlign = "right";
      ctx.fillText(fmt(maxV * i / 4), padL - 8, y + 3);
    }
    var X = function (i) { return list.length === 1 ? padL + cw / 2 : padL + cw * i / (list.length - 1); };
    function series(key, color) {
      var vals = list.map(function (x) { return x[key] || 0; });
      /* 线下渐变面积 */
      var ag = ctx.createLinearGradient(0, padT, 0, padT + ch);
      ag.addColorStop(0, hexA(color, .14));
      ag.addColorStop(1, hexA(color, 0));
      ctx.beginPath();
      vals.forEach(function (v, i) {
        var x = X(i), y = padT + ch - (v / maxV * ch);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.lineTo(X(vals.length - 1), padT + ch);
      ctx.lineTo(X(0), padT + ch);
      ctx.closePath();
      ctx.fillStyle = ag; ctx.fill();
      /* 主线 */
      ctx.strokeStyle = color; ctx.lineWidth = 2.2; ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath();
      vals.forEach(function (v, i) {
        var x = X(i), y = padT + ch - (v / maxV * ch);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      /* 数据点 */
      vals.forEach(function (v, i) {
        if (v <= 0) return;
        var x = X(i), y = padT + ch - (v / maxV * ch);
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#000"; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.stroke();
      });
    }
    series("dN", "#58a6ff");
    series("dO", "#d29922");
    ctx.fillStyle = "#76818e"; ctx.textAlign = "center"; ctx.font = "10px 'Segoe UI',sans-serif";
    var step = Math.max(1, Math.ceil(list.length / 8));
    list.forEach(function (x, i) {
      if (i % step !== 0 && i !== list.length - 1) return;
      ctx.fillText(x.d.substring(5), X(i), H - 11);
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
