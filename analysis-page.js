/* ============================================================
 * 车间产出分析页 v6 — 效率仪表盘 (独立模块, 零侵入主看板)
 * 叙事主线: 「加班到底值不值」 → 同批加班线自己的 加班效率 vs 正常时段效率
 *
 * 口径(用户 2026-09-02 确认):
 *   白班 8:00–20:20 | 正常 ≤17:20 | 加班 17:20–20:20 (净3.0h)
 *   夜班 20:30–次日8:00 | 正常 20:30–5:50(净8.17h) | 加班 5:50–7:50(净2.0h)
 *   白班正常净时 7.67h(8:00–17:20 扣 4 段休 100min)
 *   v6 公平对比口径: 全厂混合 UPH 无意义(有的线不加班/产品节拍不同会稀释)
 *     → 加班侧分母只计「实际加班的同批线」(dOtL/nOtL), 并与其自身正常段效率比
 *   v6 卡3: 废弃"加班占比=OT/(正常+OT)"(3h窗 vs 7.67h窗 不可比)
 *     → 改看 ①正常时段计划达成率(actual/plan, plan 与 actual 同构当班累计)
 *       ②加班增量件数 → 判断加班是"补缺"还是"冲超产"
 *   人数: 车间级 4 字段 → analysis/hc/{date}.json (待接自动化数据源)
 *
 * 2026-09-03 v5.45: 归档改云端 GitHub Actions 每日 20:40(泰)拉全量 → history/
 *   含完整白班OT + 前夜班(actual 跨 0 点不清零, 凌晨累计含前晚, 一夜=一整段)
 * 2026-09-02 v5: 仪表盘化重设计(首屏 KPI 对比带 + 4 卡 + 底部折叠填报)
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
    var res = { dayNorm: 0, dayOt: 0, nLive: 0, nNorm: 0, nOt: 0, planN: 0, hasDay: false, hasNight: false, lastDpM: null, lastNpM: null };
    var dp = pts.filter(function (x) { return x.m >= DAY_START && x.m <= DAY_END; });
    if (dp.length) {
      res.hasDay = true;
      var cut = null;
      for (var i = 0; i < dp.length; i++) if (dp[i].m <= DAY_NORM_END) cut = dp[i];
      var normA = cut ? cut.a : 0;
      var totalA = dp[dp.length - 1].a;
      res.lastDpM = dp[dp.length - 1].m;
      res.dayNorm = normA; res.dayOt = Math.max(0, totalA - normA);
      /* 白班正常窗口末点的当班计划累计(= 计划增量; plan 与 actual 同构, 8:00 清零) */
      res.planN = cut ? cut.p : 0;
    }
    /* 今晚 20:30 起实时段(累计到最新快照) */
    var np = pts.filter(function (x) { return x.m >= NIGHT_START; });
    if (np.length) { res.hasNight = true; res.lastNpM = np[np.length - 1].m; res.nLive = np[np.length - 1].a; }
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

  /* 车间聚合。字段: dN/dO=白班正常/OT产出, nL/nN/nO=夜班实时/凌晨正常/凌晨OT,
     planN=白班正常段计划累计; dOtL/dOtN=实际加班线数 & 这些线自己的正常产出(同集对比用),
     nOtL/nOtN=凌晨OT线数 & 这些线自己的整夜正常产出 */
  function aggWs(wsMap) {
    function zero() {
      return { dN: 0, dO: 0, nL: 0, nN: 0, nO: 0, dayL: 0, nightL: 0, lines: 0, dOtL: 0, dOtN: 0, nOtL: 0, nOtN: 0, planN: 0 };
    }
    var out = {}, tot = zero();
    WS_MAP.forEach(function (g) { out[g.ws] = zero(); });
    Object.keys(wsMap).forEach(function (rawName) {
      var std = NORM2WS[normN(rawName)];
      if (!std) return;
      var ws = LINE2WS[std]; if (!ws) return;
      var s = aggLine(wsMap[rawName]);
      var g = out[ws];
      g.dN += s.dayNorm; g.dO += s.dayOt; g.nL += s.nLive; g.nN += s.nNorm; g.nO += s.nOt;
      g.planN += s.planN;
      g.lines++;
      if (s.hasDay) g.dayL++;
      if (s.hasNight) g.nightL++;
      if (s.dayOt > 0) { g.dOtL++; g.dOtN += s.dayNorm; }        /* 这条线今晚加了班 → 计入同批线集 */
      if (s.nOt > 0) { g.nOtL++; g.nOtN += s.nNorm; }           /* 这条线凌晨加了班 */
    });
    WS_MAP.forEach(function (g) {
      var a = out[g.ws];
      tot.dN += a.dN; tot.dO += a.dO; tot.nL += a.nL; tot.nN += a.nN; tot.nO += a.nO;
      tot.lines += a.lines; tot.dayL += a.dayL; tot.nightL += a.nightL;
      tot.dOtL += a.dOtL; tot.dOtN += a.dOtN; tot.nOtL += a.nOtL; tot.nOtN += a.nOtN;
      tot.planN += a.planN;
    });
    return { ws: out, tot: tot };
  }

  /* UPH(件/线·净时)。v6 公平口径: 加班效率只与「实际加班的同批线」比 ——
     分母 = 加班线数(dOtL/nOtL), 不再用全厂/全车间所有白班线稀释(有的线不加班) */
  /* 白班 8:00→m 已过净时(扣休息): 休息 10:00-10:10/12:00-13:00/15:00-15:10/17:00-17:20 */
  function dayNetElapsed(m) {
    if (m <= DAY_START) return null;
    var rest = 0;
    [[600, 610], [720, 780], [900, 910], [1020, 1040]].forEach(function (r) {
      if (m > r[0]) rest += Math.min(m, r[1]) - r[0];
    });
    var e = (m - DAY_START - rest) / 60;
    return e > 0.05 ? e : null;
  }
  function netOtH() { /* 白班OT已过净时: 历史/结束后=3h; 今天实时窗口内按已过净时渐进 */
    if (state.date !== state.today) return NET.dO;
    var m = nowMins();
    if (m <= DAY_NORM_END) return null;              /* 还没到 OT 窗口(17:20) */
    return Math.min(Math.max((m - DAY_NORM_END) / 60, 0.05), NET.dO);
  }
  function uphNormOt(a) { return a.dOtL ? a.dOtN / (a.dOtL * NET.dN) : null; }  /* 同批加班线: 白班正常段效率 */
  function uphDayOt(a) { var h = netOtH(); return (a.dOtL && h) ? a.dO / (a.dOtL * h) : null; }
  function uphNightLive(a) { var h = nightNetNow(); return (h && a.nightL) ? a.nL / (a.nightL * h) : null; }
  function uphNightNormOt(a) { return a.nOtL ? a.nOtN / (a.nOtL * NET.nN) : null; } /* 同批凌晨OT线: 整夜正常段效率 */
  function uphNightOt(a) { return a.nOtL ? a.nO / (a.nOtL * NET.nO) : null; }

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
".brow .pc{width:58px;text-align:right;font-size:12px;font-weight:800;color:#e3b341;flex-shrink:0;white-space:nowrap}",
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
"#otEmpty:hover{color:#8b949e}",
"#vsVerdict{display:none;margin:-6px 0 14px;padding:11px 16px;border-radius:12px;background:rgba(88,166,255,.06);border:1px solid rgba(88,166,255,.22);color:#b9c2cc;font-size:12.5px;line-height:1.8}",
"#vsVerdict.show{display:block}",
"#vsVerdict b{color:#f0f6fc;font-weight:800}",
"#vsVerdict .k{color:#e3b341;font-weight:800}",
"#vsVerdict .ok{color:#4ade80;font-weight:800}",
"#detailList{overflow-x:auto}",
".dgrid{display:grid;grid-template-columns:minmax(210px,2.1fr) repeat(6,minmax(82px,1fr)) minmax(112px,1.5fr);align-items:center;gap:0;font-variant-numeric:tabular-nums}",
".dh{padding:8px 14px;color:#6e7681;font-size:10.5px;font-weight:600;letter-spacing:.3px;border-bottom:1px solid rgba(255,255,255,.07)}",
".dh>div{text-align:right;padding:0 6px;white-space:nowrap}",
".dh>div:first-child{text-align:left;padding-left:8px}",
".wsrow{padding:9px 14px;border-bottom:1px solid rgba(255,255,255,.045);cursor:pointer;user-select:none;background:linear-gradient(90deg,rgba(255,255,255,.014),transparent)}",
".wsrow:hover{background:rgba(88,166,255,.05)}",
".wsrow .nm{display:flex;align-items:center;gap:8px;font-weight:800;color:#f0f6fc;font-size:13px;min-width:0}",
".wsrow .acc{width:0;height:0;border-left:5px solid #8b949e;border-top:4px solid transparent;border-bottom:4px solid transparent;transition:transform .18s;flex-shrink:0}",
".wsrow.open .acc{transform:rotate(90deg)}",
".cnt{font-size:10px;font-weight:700;color:#7d8894;background:rgba(255,255,255,.06);border-radius:20px;padding:2px 9px;letter-spacing:.2px;white-space:nowrap}",
".lrow{padding:7px 14px 7px 44px;border-bottom:1px solid rgba(255,255,255,.03);font-size:12px;cursor:default}",
".lrow:hover{background:rgba(255,255,255,.016)}",
".lrow .nm{color:#aab4c0;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}",
".trow{padding:11px 14px;font-weight:800;background:rgba(88,166,255,.07);border-top:1px solid rgba(88,166,255,.18)}",
".trow .nm{color:#58a6ff}",
".vl{text-align:right;padding:0 6px;white-space:nowrap;font-size:12px;color:#c9d1d9}",
".v-n{color:#79b8ff}",
".v-o{color:#e3b341}",
".v-0{color:#545e69}",
".trow .vl{color:#e6edf3;font-weight:800}",
".st-tag{display:inline-flex;align-items:center;justify-content:flex-end;gap:5px;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:.3px;white-space:nowrap;justify-self:end}",
".st-tag i{width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0}",
".st-ot{background:rgba(210,153,34,.13);color:#e3b341;border:1px solid rgba(210,153,34,.35)}",
".st-now{background:rgba(88,166,255,.12);color:#58a6ff;border:1px solid rgba(88,166,255,.35)}",
".st-now i{animation:tagPulse 1.6s ease-in-out infinite}",
".st-no{background:rgba(255,255,255,.04);color:#8b949e;border:1px solid rgba(255,255,255,.1)}",
".st-none{background:transparent;color:#545e69;border:1px dashed rgba(255,255,255,.08)}",
".st-mid{background:rgba(188,140,255,.13);color:#bc8cff;border:1px solid rgba(188,140,255,.35)}",
"@keyframes tagPulse{0%,100%{opacity:.45}50%{opacity:1}}",
".diff-u{font-weight:800;font-size:12px;text-align:right;padding:0 6px}",
".diff-u.good{color:#4ade80}",
".diff-u.bad{color:#ff7b72}",
".diff-u.flat{color:#8b949e}",
".rate-chip{display:inline-block;font-size:11px;font-weight:800;padding:3px 11px;border-radius:20px;letter-spacing:.2px;white-space:nowrap;justify-self:end;text-align:center}",
".rate-chip.g{background:rgba(63,185,80,.13);color:#4ade80;border:1px solid rgba(63,185,80,.35)}",
".rate-chip.b{background:rgba(88,166,255,.12);color:#79b8ff;border:1px solid rgba(88,166,255,.35)}",
".rate-chip.y{background:rgba(210,153,34,.13);color:#e3b341;border:1px solid rgba(210,153,34,.35)}",
".rate-chip.x{background:rgba(255,255,255,.03);color:#6e7681;border:1px solid rgba(255,255,255,.09)}",
".footnote{margin-top:-6px;padding:9px 14px 12px;color:#5f6b76;font-size:10.5px;line-height:1.8;letter-spacing:.2px;border-top:1px dashed rgba(255,255,255,.07)}",
".footnote b{color:#8b949e}",
".chips-sm{transform:scale(.92);transform-origin:left center}",
".fill-ot{padding:2px 0 2px;margin-bottom:8px;border-bottom:1px dashed rgba(255,255,255,.07)}",
".fill-ot .fh3{font-size:11.5px;color:#9aa4b0;font-weight:700;display:flex;align-items:center;gap:8px;margin-bottom:2px}",
".fill-ot .fh3 .pl{width:8px;height:8px;border-radius:2.5px;flex-shrink:0}",
".fill-ot .fh3 .lg{display:inline-flex;align-items:center;gap:5px;font-size:10px;color:#6e7681;font-weight:500;margin-left:10px}",
".fill-ot .fh3 .lg i{width:9px;height:9px;border-radius:2.5px;display:inline-block}",
".fill-ot canvas{width:100%;height:150px}",
".sub-hint{margin-left:auto;font-size:10px;color:#5f6b76;letter-spacing:.2px;white-space:nowrap}",
".lbox{display:none}",
".wsrow.open+.lbox{display:block}"
  ].join("\n");

  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var root = document.createElement("div");
  root.id = "anaRoot";
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
    '<span class="sub-hint" id="subHint">白班 8:00–20:20 · 正常 ≤17:20 · 加班 17:20–20:20</span></div>' +
    /* vs 对比带 */
    '<div id="vsBand">' +
    '<div class="vs-side" id="vsN"><div class="lb">正常时段 <span class="tag" id="vsNtag">白班 ≤17:20</span></div><div class="num" id="vsNnum">--</div><div class="sb" id="vsNsb"></div></div>' +
    '<div class="vs-mid"><span class="vsw">效率对比</span><span id="diffChip" class="flat">--</span></div>' +
    '<div class="vs-side ot" id="vsO"><div class="lb">加班时段 <span class="tag" id="vsOtag">白班 17:20–20:20</span></div><div class="num" id="vsOnum">--</div><div class="sb" id="vsOsb"></div></div>' +
    '<div id="vsVerdict"></div>' +
    "</div>" +
    /* ── v7 主卡: 车间 · 线体产出明细 (手风琴) ── */
    '<div class="card" id="wsDetail"><h3><span class="pl" style="background:#58a6ff"></span>车间 · 线体产出明细 <span class="hint-r">点击车间行展开线体 · 加班效率=加班线自己 vs 自己正常段</span></h3>' +
    '<div id="detailHead" class="dgrid dh"></div><div id="detailList"></div></div>' +
    /* ── v7 趋势卡: winChips 移入 h3 ── */
    '<div class="card"><h3><span class="pl" style="background:#39c5cf"></span>趋势 · 正常 vs 加班 日产出' +
    '<span class="chips chips-sm" id="winChips"><button data-w="7" class="on">7天</button><button data-w="14">14天</button><button data-w="30">30天</button></span>' +
    '<span class="hint-r"><span class="lg"><i style="background:#58a6ff"></i>正常产出</span><span class="lg"><i style="background:#d29922"></i>加班产出</span></span></h3>' +
    '<canvas id="cvTrend"></canvas><div class="empty-tip" id="trendEmpty" style="display:none"></div></div>' +
    /* ── v7 口径注脚 ── */
    '<div class="footnote">口径：白班 8:00–20:20 · 正常段 ≤17:20(净 7.67h) · 加班段 17:20–20:20(净 3.0h)；夜班 20:30–次日 8:00 · 正常 20:30–5:50(净 8.17h) · 凌晨OT 5:50–7:50(净 2.0h)。<b>加班效率=实际加班的那批线, 加班段 ÷ 加班净时, 与它们自己正常段效率比</b>(不掺未加班线稀释)。正常达成率=正常段实际÷计划(同源当班清零)。数据10分钟一档, 归档每日20:40云端自动。</div>' +
    /* ── v7 填报面板: 加班人力图入 fillBody 顶 ── */
    '<div id="fillPanel"><div id="fillHead"><div class="ch"></div><h3>车间数据 · 白班 / 夜班人数提报</h3><span class="note" id="fillNote"></span></div>' +
    '<div id="fillBody"><div class="fill-ot"><div class="fh3"><span class="pl" style="background:#d29922"></span>加班人力 · 提报人数<span class="lg"><i style="background:#d29922"></i>白班OT</span><span class="lg"><i style="background:#bc8cff"></i>夜班OT</span></div>' +
    '<canvas id="cvOt"></canvas><div class="empty-tip" id="otEmpty" style="display:none">暂无提报人数 — 点击在下方表格填入, 或待自动化数据源接入</div></div>' +
    '<div class="table-scroll"><table id="anaTable"><thead></thead><tbody></tbody></table></div></div></div>' +
    "</div>";
  var dateInput = root.querySelector("#anaDate");
  var statusEl = root.querySelector("#anaStatus"), statusTxt = root.querySelector("#anaStatusTxt");
  var vsNnum = root.querySelector("#vsNnum"), vsOnum = root.querySelector("#vsOnum");
  var vsNtag = root.querySelector("#vsNtag"), vsOtag = root.querySelector("#vsOtag");
  var vsNsb = root.querySelector("#vsNsb"), vsOsb = root.querySelector("#vsOsb");
  var diffChip = root.querySelector("#diffChip");
  var cvOt = root.querySelector("#cvOt"), cvTrend = root.querySelector("#cvTrend");
  var otEmpty = root.querySelector("#otEmpty"), trendEmpty = root.querySelector("#trendEmpty");
  var detailList = root.querySelector("#detailList"), detailHead = root.querySelector("#detailHead");
  var vsVerdict = root.querySelector("#vsVerdict"), subHint = root.querySelector("#subHint");
  var fillPanel = root.querySelector("#fillPanel"), fillNote = root.querySelector("#fillNote");
  var tbl = root.querySelector("#anaTable");
  var cntEl = root.querySelector("#anacnt");
  var winChips = root.querySelector("#winChips");

  root.querySelector("#anaBack").onclick = function () { root.remove(); };
  fillPanel.querySelector("#fillHead").onclick = function () { fillPanel.classList.toggle("open"); if (fillPanel.classList.contains("open")) drawOt(); };
  otEmpty.onclick = function () { fillPanel.classList.add("open"); fillPanel.scrollIntoView({ behavior: "smooth", block: "start" }); drawOt(); };
  /* v7: 手风琴展开委托(容器常驻, 只绑一次) */
  detailList.addEventListener("click", function (e) {
    var r = e.target.closest(".wsrow"); if (!r) return;
    var ws = r.getAttribute("data-ws");
    var op = r.classList.toggle("open");
    state.openWs = state.openWs || {}; state.openWs[ws] = op ? 1 : 0;
  });

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
    drawVs(); drawOt(); drawTable(); renderDetail();
    cntEl.textContent = Object.keys(state.hourly).length + " 线";
  }

  function wsData() { return state.hc; }
  function wsOf(ws) {
    var a = state.wsAgg.ws[ws];
    var hc = state.hc[ws] || {};
    return {
      dN: a.dN, dO: a.dO, nL: a.nL, nN: a.nN, nO: a.nO, planN: a.planN,
      lines: a.lines, dayL: a.dayL, nightL: a.nightL,
      dOtL: a.dOtL, dOtN: a.dOtN, nOtL: a.nOtL, nOtN: a.nOtN,
      hcD: Number(hc.d) || 0, hcDO: Number(hc.dO) || 0, hcN: Number(hc.n) || 0, hcNO: Number(hc.nO) || 0
    };
  }

  /* ── vs 对比带 (v6 同集口径: 加班 vs 同批加班线自己的正常段) ── */
  function drawVs() {
    var t = state.wsAgg.tot;
    var isDay = state.sh === "day";
    subHint.textContent = isDay ? "白班 8:00–20:20 · 正常 ≤17:20(净 7.67h) · 加班 17:20–20:20(净 3.0h)" : "夜班 20:30–次日 8:00 · 正常 20:30–5:50(净 8.17h) · 凌晨OT 5:50–7:50(净 2.0h)";
    var upN = null, upO = null, tagN = "", tagO = "", sbN = "", sbO = "";
    if (isDay) {
      tagN = "白班正常 ≤17:20"; tagO = "白班加班 17:20–20:20";
      if (t.dOtL > 0) {
        var h = netOtH();
        upN = uphNormOt(t);
        if (h) upO = t.dO / (t.dOtL * h);
        sbN = "同批加班线 " + t.dOtL + " 条 · 净 7.67h";
        sbO = (h && h < NET.dO) ? "同批线加班 · 净" + h.toFixed(1) + "h 进行中" : "同批线加班 · 净 3.0h";
      } else if (state.date === state.today) {
        /* OT 尚未开始: 左侧给白班实时进度, 不空窗 */
        var de = dayNetElapsed(nowMins());
        upN = (de && t.dayL) ? t.dN / (t.dayL * de) : null;
        sbN = "白班进行中 · 净" + (de ? de.toFixed(1) : "-") + "h · " + t.dayL + " 线";
        sbO = "OT 17:20 后统计";
      } else {
        sbN = "白班 " + t.dayL + " 线 · 净 7.67h";
        sbO = t.dayL === 0 ? "暂无生产数据" : "该日无OT记录(归档升级前)";
      }
    } else {
      tagN = "夜班正常 20:30–5:50"; tagO = "夜班加班 5:50–7:50";
      var live = (state.date === state.today && t.nL > 0 && t.nOtL === 0);
      if (live) {
        upN = uphNightLive(t);
        sbN = "今晚实时 · 净" + (nightNetNow() ? nightNetNow().toFixed(1) : "-") + "h";
        sbO = "凌晨OT 5:50 后记账";
      } else if (t.nOtL > 0) {
        upN = uphNightNormOt(t); upO = uphNightOt(t);
        sbN = "同批OT线 " + t.nOtL + " 条 · 整夜净 8.17h";
        sbO = "同批线凌晨OT · 净 2.0h";
      } else {
        sbN = t.nightL ? "夜班 " + t.nightL + " 线" : "暂无夜班数据";
        sbO = "数据不足";
      }
    }
    vsNtag.textContent = tagN; vsOtag.textContent = tagO;
    vsNnum.innerHTML = upN === null ? "--" : fmt(upN) + "<small>件/线·时</small>";
    vsNsb.textContent = sbN;
    if (upO === null || upN === null || upN === 0) {
      vsOnum.innerHTML = upO === null ? "—" : fmt(upO) + "<small>件/线·时</small>";
      vsOsb.textContent = sbO;
      diffChip.className = "flat";
      diffChip.textContent = upN === null ? "等待数据" : "—";
      vsVerdict.className = ""; vsVerdict.innerHTML = "";
      return;
    }
    vsOnum.innerHTML = fmt(upO) + "<small>件/线·时</small>";
    vsOsb.textContent = sbO;
    var d = (upO - upN) / upN * 100;
    var g = d >= 0;
    diffChip.className = Math.abs(d) < 3 ? "flat" : (g ? "good" : "bad");
    diffChip.textContent = (g ? "▲" : "▼") + " 加班" + (g ? "高" : "低") + " " + Math.abs(d).toFixed(0) + "%";
    setVerdict(isDay, t, d, g);
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

  /* ═══════════ v7: 车间·线体明细 (renderDetail 全套) ═══════════ */
  /* 行内显示名: 去 line/-Series 后缀 */
  function shortStd(s) { return String(s).replace(/ line$/i, "").replace(/-Series$/i, ""); }
  function fmtU(v) { return v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1); }
  /* 数值 cell: null/NaN → 灰 — (0 不作数据上色) */
  function cellV(v, cls, u) {
    if (v === null || v === undefined || isNaN(v)) return '<span class="vl v-0">—</span>';
    return '<span class="vl ' + (cls || "") + '">' + (u ? fmtU(v) : fmt(v)) + "</span>";
  }
  function diffTxt(d) {
    if (d === null || d === undefined || isNaN(d)) return '<span class="diff-u flat">—</span>';
    if (Math.abs(d) < 3) return '<span class="diff-u flat">≈0%</span>';
    var g = d > 0;
    return '<span class="diff-u ' + (g ? "good" : "bad") + '">' + (g ? "▲" : "▼") + " " + Math.abs(d).toFixed(0) + "%</span>";
  }
  /* 正常段计划达成率 chip: 超产绿/达标蓝/补缺金/无计划灰 */
  function rateChip(rate) {
    if (rate === null || rate === undefined || isNaN(rate)) return '<span class="rate-chip x">—</span>';
    var p = Math.round(rate * 100);
    if (rate >= 1) return '<span class="rate-chip g">超产 ' + (p - 100) + '%</span>';
    if (rate >= 0.95) return '<span class="rate-chip b">达标 ' + p + '%</span>';
    return '<span class="rate-chip y">补缺 ' + p + '%</span>';
  }
  function stTag(txt, k) { return '<span class="st-tag ' + k + '"><i></i>' + txt + "</span>"; }
  /* 线体 白班状态: 加班中(脉冲)/加班/运行中/早停/未加班/无OT档/夜班线/无数据 */
  function lineStatusDay(a) {
    if (!a || !a.hasDay) {
      if (a && a.hasNight) return stTag("夜班线", "st-no");
      return stTag("无数据", "st-none");
    }
    var now = nowMins();
    var isT = state.date === state.today;
    if (a.dayOt > 0) {
      if (isT && now > DAY_NORM_END && now <= DAY_END + 5) return stTag("加班中", "st-now");
      return stTag("加班", "st-ot");
    }
    if (isT && now <= DAY_END + 5) {
      var last = a.lastDpM;
      if (last === null) return stTag("无数据", "st-none");
      if (now <= DAY_NORM_END) {
        if (now - last <= 65) return stTag("运行中", "st-now");
        return stTag("早停", "st-no");
      }
      if (last < DAY_NORM_END - 20) return stTag("早停", "st-no");
      return stTag("未加班", "st-no");
    }
    if (state.date < "2026-09-03") return stTag("无OT档", "st-none");
    return stTag("未加班", "st-no");
  }
  /* 线体 夜班状态: 凌晨OT(金)/夜班实时(蓝脉冲)/夜班完成/白班线/无数据 */
  function lineStatusNight(a) {
    if (!a) return stTag("无数据", "st-none");
    var live = state.date === state.today && a.lastNpM !== null && a.lastNpM >= NIGHT_START;
    if (a.nOt > 0) return stTag("凌晨OT", "st-mid");
    if (live) return stTag("夜班实时", "st-now");
    if (a.hasNight) return stTag("夜班完成", "st-no");
    if (a.hasDay) return stTag("白班线", "st-no");
    return stTag("无数据", "st-none");
  }
  /* 线体行 数值(白班/夜班)。口径与 v6 顶带同源: 单线正常段=dayNorm/7.67h(今天实时=进度净时),
     加班=dayOt/已过OT净时(netOtH); 夜班: 完整档案用 nNorm/nOt 归段, 今晚实时只计 nL */
  function dayNormHBase() {
    if (state.date !== state.today) return NET.dN;
    var de = dayNetElapsed(nowMins());
    return de ? Math.max(0.5, Math.min(de, NET.dN)) : NET.dN;
  }
  function lineRowDay(a) {
    var tot = null, n = null, o = null, upN = null, upO = null, diff = null;
    if (!a || !a.hasDay) return { tot: tot, n: n, o: o, upN: upN, upO: upO, diff: diff };
    n = a.dayNorm > 0 ? a.dayNorm : null;
    o = a.dayOt > 0 ? a.dayOt : null;
    tot = a.dayNorm + a.dayOt;
    if (a.dayOt > 0) {
      var h = netOtH();
      upN = a.dayNorm / NET.dN;
      if (h) upO = a.dayOt / h;
    } else {
      upN = a.dayNorm / dayNormHBase();
    }
    if (upN && upO) diff = (upO - upN) / upN * 100;
    return { tot: tot, n: n, o: o, upN: upN, upO: upO, diff: diff };
  }
  function lineRowNight(a) {
    var tot = null, n = null, o = null, upN = null, upO = null, diff = null;
    if (!a || !a.hasNight) return { tot: tot, n: n, o: o, upN: upN, upO: upO, diff: diff };
    var live = state.date === state.today && a.lastNpM !== null && a.lastNpM >= NIGHT_START;
    if (live) {
      var h = nightNetNow();
      if (a.nL > 0) { tot = a.nL; if (h) upN = a.nL / h; }
    } else {
      n = a.nNorm > 0 ? a.nNorm : null;
      o = a.nOt > 0 ? a.nOt : null;
      if (a.nL + a.nNorm + a.nOt > 0) tot = a.nL + a.nNorm + a.nOt;
      if (n !== null) upN = a.nNorm / NET.nN;
      if (o !== null) upO = a.nOt / NET.nO;
    }
    if (upN && upO) diff = (upO - upN) / upN * 100;
    return { tot: tot, n: n, o: o, upN: upN, upO: upO, diff: diff };
  }
  /* 车间行 数值: 白班用 v6 同批集口径(dOtL>0 → 加班线自比; 未加班 → 全车间实时/全时段),
     夜班同线体规则但聚合到车间 */
  function wsRowCellsDay(d) {
    var tot = null, n = null, o = null, upN = null, upO = null, diff = null;
    if (d.dayL > 0) {
      tot = d.dN + d.dO;
      n = d.dN > 0 ? d.dN : null;
      o = d.dO > 0 ? d.dO : null;
      if (d.dOtL > 0) {
        upN = uphNormOt(d);
        upO = uphDayOt(d);
      } else if (state.date === state.today) {
        var de = dayNetElapsed(nowMins());
        if (de && d.dayL) upN = d.dN / (d.dayL * de);
      } else if (d.dayL) {
        upN = d.dN / (d.dayL * NET.dN);
      }
    }
    if (upN && upO) diff = (upO - upN) / upN * 100;
    return { tot: tot, n: n, o: o, upN: upN, upO: upO, diff: diff };
  }
  function wsRowCellsNight(d) {
    var tot = null, n = null, o = null, upN = null, upO = null, diff = null;
    if (d.nightL > 0) {
      var live = state.date === state.today && d.nL > 0;
      if (live) {
        var h = nightNetNow();
        if (d.nL > 0) { tot = d.nL; if (h) upN = d.nL / (d.nightL * h); }
      } else {
        n = d.nN > 0 ? d.nN : null;
        o = d.nO > 0 ? d.nO : null;
        if (d.nL + d.nN + d.nO > 0) tot = d.nL + d.nN + d.nO;
        if (d.nightL) upN = d.nN / (d.nightL * NET.nN);
        if (d.nOtL) upO = d.nO / (d.nOtL * NET.nO);   /* 公平: 凌晨OT只除OT线数 */
      }
    }
    if (upN && upO) diff = (upO - upN) / upN * 100;
    return { tot: tot, n: n, o: o, upN: upN, upO: upO, diff: diff };
  }
  /* 车间行尾列: 白班=达成率chip; 夜班=状态tag */
  function wsRowTag(d, isDay) {
    if (isDay) return rateChip(d.planN > 0 ? d.dN / d.planN : null);
    if (d.nOtL > 0) return stTag("凌晨OT " + d.nOtL + "线", "st-mid");
    if (state.date === state.today && d.nL > 0) return stTag("夜班实时", "st-now");
    if (d.nightL > 0) return stTag("夜班 " + d.nightL + "线", "st-no");
    return stTag("无数据", "st-none");
  }
  /* 行 html: 8 格 [nm,tot,n,o,upN,upO,diff,尾列]; tag 列由调用方传 */
  function rowCellsHtml(c) {
    return cellV(c.tot, "", false) + cellV(c.n, "v-n", false) + cellV(c.o, "v-o", false) +
      cellV(c.upN, "", true) + cellV(c.upO, "", true) + diffTxt(c.diff);
  }
  function wsRowHtml(ws, d, isDay, nmOverride) {
    var c = isDay ? wsRowCellsDay(d) : wsRowCellsNight(d);
    var otN = isDay ? d.dOtL : d.nOtL;
    var nm = nmOverride || ('<span class="acc"></span>' + ws +
      (d.lines ? '<span class="cnt">' + d.lines + "线" + (otN ? " · OT " + otN : "") + "</span>" : ""));
    return '<div class="nm">' + nm + "</div>" + rowCellsHtml(c) + wsRowTag(d, isDay);
  }
  function trowHtml(d, isDay) {
    var c = isDay ? wsRowCellsDay(d) : wsRowCellsNight(d);
    var tag = isDay ? rateChip(d.planN > 0 ? d.dN / d.planN : null) : wsRowTag(d, isDay);
    return '<div class="nm">全厂合计</div>' + rowCellsHtml(c) + tag;
  }
  /* verdict 结论条: 加班线与自身正常段对比 + 正常段计划达成 → 补缺/冲量 */
  function setVerdict(isDay, t, d, g) {
    var html = "";
    var flat = Math.abs(d) < 3;
    if (isDay && t.dOtL > 0) {
      var cls = flat ? "k" : (g ? "ok" : "k");
      var txt = flat ? "≈持平" : ((g ? "高" : "低") + " " + Math.abs(d).toFixed(0) + "%");
      html = "共 <b>" + t.dOtL + "</b> 条线加班 · 加班效率比它们自己正常段 <b class=\"" + cls + "\">" + txt + "</b>";
      if (t.planN > 0) {
        var rate = t.dN / t.planN;
        html += " · 正常时段计划达成 <b>" + Math.round(rate * 100) + "%</b>" +
          (rate < 1 ? '<span class="k">(未达标 → 加班属补缺)</span>' : '<span class="ok">(已达标 → 加班属冲量)</span>');
      }
    } else if (!isDay && t.nOtL > 0) {
      var cls2 = flat ? "k" : (g ? "ok" : "k");
      var txt2 = flat ? "≈持平" : ((g ? "高" : "低") + " " + Math.abs(d).toFixed(0) + "%");
      html = "凌晨 <b>" + t.nOtL + "</b> 条线 OT · 效率比同批线整夜正常段 <b class=\"" + cls2 + "\">" + txt2 + "</b>";
    }
    vsVerdict.className = html ? "show" : "";
    vsVerdict.innerHTML = html;
  }
  /* 明细渲染入口: 填表头 → 车间行 + 展开线体行 → 全厂合计行 */
  function renderDetail() {
    var isDay = state.sh === "day";
    var heads = isDay ?
      ["车间 / 线体", "当日总产出", "正常时段", "加班时段", "正常UPH", "加班UPH", "加班效率", "达成率"] :
      ["车间 / 线体", "夜班产出", "凌晨正常", "凌晨OT", "夜正常UPH", "凌晨OT UPH", "凌晨OT效率", "状态"];
    detailHead.innerHTML = heads.map(function (c) { return "<div>" + c + "</div>"; }).join("");
    /* 即时聚合(仅渲染所需): 每 raw 键 → aggLine; 与 aggWs 同一归并规则 */
    var lineAgg = {};
    Object.keys(state.hourly).forEach(function (rawName) {
      var std = NORM2WS[normN(rawName)];
      if (!std) return;
      lineAgg[std] = aggLine(state.hourly[rawName]);
    });
    var html = "";
    WS_MAP.forEach(function (g) {
      var d = wsOf(g.ws);
      if (d.lines === 0) return;                       /* 空车间(Pro.6)不显示 */
      var open = state.openWs && state.openWs[g.ws] ? " open" : "";
      html += '<div class="dgrid wsrow' + open + '" data-ws="' + g.ws + '">' + wsRowHtml(g.ws, d, isDay) + "</div>";
      html += '<div class="lbox">';
      g.lines.forEach(function (std) {
        var a = lineAgg[std];
        var c, tag;
        if (!a) {
          c = { tot: null, n: null, o: null, upN: null, upO: null, diff: null };
          tag = stTag("无数据", "st-none");
        } else {
          c = isDay ? lineRowDay(a) : lineRowNight(a);
          tag = isDay ? lineStatusDay(a) : lineStatusNight(a);
        }
        html += '<div class="dgrid lrow"><div class="nm">' + shortStd(std) + "</div>" +
          rowCellsHtml(c) + tag + "</div>";
      });
      html += "</div>";
    });
    var tot = state.wsAgg ? state.wsAgg.tot : null;
    if (tot) {
      html += '<div class="dgrid trow" data-ws="__tot__">' + trowHtml(tot, isDay) + "</div>";
    }
    detailList.innerHTML = html;
  }

  /* ── 底部车间填报 ── */
  function drawTable() {
    var isToday = state.date === state.today;
    var th = "<tr><th rowspan='2'>车间</th><th colspan='3'>当日产出 · 件</th><th colspan='4'>提报人数</th><th rowspan='2'>正常达成率</th></tr>" +
      "<tr><th>白班正常</th><th>白班加班</th><th>夜班 · 实时+凌晨</th><th>白班 正常</th><th>白班 OT</th><th>夜班 正常</th><th>夜班 OT</th></tr>";
    var html = "";
    WS_MAP.forEach(function (g) {
      var d = wsOf(g.ws);
      var hc = state.hc[g.ws] || {};
      var empty = d.lines === 0;
      /* 正常达成率 = 白班正常段实际 ÷ 计划 (替代原"加班占比": 3h窗/7.67h窗不可比) */
      var rate = d.planN > 0 ? d.dN / d.planN * 100 : null;
      var nt = d.nL + d.nN + d.nO;
      html += "<tr><td class='nmw'>" + g.ws + "</td>" +
        "<td class='g'>" + (empty ? "—" : fmt(d.dN)) + "</td>" +
        "<td class='o'>" + (empty ? "—" : fmt(d.dO)) + "</td>" +
        "<td class='tot-r'>" + (empty ? "—" : fmt(nt)) + "</td>" +
        "<td><input class='hc' type='number' min='0' placeholder='0' value='" + (hc.d || "") + "' data-ws='" + g.ws + "' data-f='d'></td>" +
        "<td><input class='hc' type='number' min='0' placeholder='0' value='" + (hc.dO || "") + "' data-ws='" + g.ws + "' data-f='dO'></td>" +
        "<td><input class='hc' type='number' min='0' placeholder='0' value='" + (hc.n || "") + "' data-ws='" + g.ws + "' data-f='n'></td>" +
        "<td><input class='hc' type='number' min='0' placeholder='0' value='" + (hc.nO || "") + "' data-ws='" + g.ws + "' data-f='nO'></td>" +
        "<td class='" + (rate === null ? "pc2" : (rate >= 100 ? "g" : "o")) + "'>" + (rate === null ? "—" : rate.toFixed(0) + "%") + "</td></tr>";
    });
    var t = state.wsAgg.tot;
    var trate = t.planN > 0 ? t.dN / t.planN * 100 : null;
    html += "<tr class='s-row'><td>合计</td><td class='g'>" + fmt(t.dN) + "</td><td class='o'>" + fmt(t.dO) + "</td><td class='tot-r'>" + fmt(t.nL + t.nN + t.nO) +
      "</td><td colspan='4'></td><td class='" + (trate !== null && trate >= 100 ? "g" : "o") + "'>" + (trate === null ? "—" : trate.toFixed(0) + "%") + "</td></tr>";
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
    if (state.wsAgg) { drawVs(); renderDetail(); }
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
