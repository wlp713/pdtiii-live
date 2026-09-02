/* ============================================================
 * 车间产出分析页 (独立模块, 不影响主看板任何逻辑)
 * 2026-09-02 v1  纯前端: 读 Firebase pdtiii.json hourly
 *   → 按车间/线体/班次聚合 → 拆「正常时段产出 vs 加班时段产出」
 * 加班口径(用户 2026-09-02 确认): 白班 17:20–20:20 / 夜班 5:50–7:50
 * 人数: normal_hc / ot_hc 预留(可手填, 存 Firebase analysis/hc/{date}.json)
 *
 * 2026-09-02 v2 UI重做 (用户: 卡片太丑/无排版/全是字)
 *   → 现代暗色数据卡: 车间色条+大数字+占比条+徽章化, 去除长段说明文字
 *   → 口径说明收进顶部「ⓘ」折叠; 明细表改双行分组表头(白班/夜班/人数/人均)
 *   → 视觉语言与主看板统一: 纯黑底, #232329 边框, GitHub-dark 语义色
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
  /* 车间 accent 色 (仅用于数据页视觉, 与主看板语义色同族) */
  var WS_ACC = { "Pro.1": "#3fb950", "Pro.2": "#58a6ff", "Pro.3": "#d29922", "Pro.4": "#bc8cff", "Pro.5": "#39c5cf", "Pro.6": "#f778ba" };
  var LINE2WS = {};
  WS_MAP.forEach(function (g) {
    g.lines.forEach(function (ln) { LINE2WS[ln] = g.ws; });
  });
  /* 名字归一化: 去空格+小写 (兼容脏名字变体) */
  function normN(n) { return String(n || "").toLowerCase().replace(/\s+/g, ""); }
  var NORM2WS = {};
  Object.keys(LINE2WS).forEach(function (ln) { NORM2WS[normN(ln)] = ln; });

  /* ── h 字段 → 当天分钟 (兼容新旧格式, 见 memory 2026-09-02) ──
   * 旧版(12条, 9/2 17:12 前)整点: h=8..17 → 8:00..17:00 (h*60)
   * 新版(36条) 10分钟桶: h=HHMM 数值, 前导零丢失(0:10→10, 8:00→800, 17:10→1710)
   * oldFmt: 数组含旧版独有值(8,9,11..17, 排除歧义的 10) 时按旧版解析,
   *   此时 h<60 全部是白班整点(h*60); 否则 h<60 为凌晨 0:00-0:50(直接分钟) */
  function h2m(h, oldFmt) {
    if (h === null || h === undefined) return null;
    h = Number(h);
    if (h < 60) return oldFmt ? h * 60 : h; // 旧版整点→h*60; 新版凌晨→分钟
    return Math.floor(h / 100) * 60 + (h % 100); // 800→480, 1710→1030
  }

  /* ── 班次/加班窗口 (分钟) ── */
  var DAY_START = 480, DAY_NORM_END = 1040, DAY_END = 1220;   // 8:00 / 17:20 / 20:20
  var NIGHT_START = 1230, NIGHT_OT_START = 350, NIGHT_END = 480; // 20:30 / 5:50 / 8:00(跨天)
  var fmt = function (n) {
    if (n === null || n === undefined || isNaN(n)) return "--";
    return Math.round(n).toLocaleString("en-US");
  };

  /* ── 单线聚合: 返回 {total, norm, ot} 按班 ── */
  function aggLine(arr) {
    var raw = arr || [];
    /* 旧版格式探测: 含 8,9,11..17(排除歧义 10) 之一 → 整点旧版混入 */
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
    /* 白班 480..1220 (累计快照, 班起点≈0; 班总=段内最大m点a; 正常=≤1040 最后点a) */
    var dp = pts.filter(function (x) { return x.m >= DAY_START && x.m <= DAY_END; });
    if (dp.length) {
      var lastD = dp[dp.length - 1];
      var cut = null;
      for (var i = 0; i < dp.length; i++) if (dp[i].m <= DAY_NORM_END) cut = dp[i];
      var normA = cut ? cut.a : 0;
      var totalA = lastD.a;
      res.day = { total: totalA, norm: normA, ot: Math.max(0, totalA - normA) };
    }
    /* 今晚夜班 1230..1440 (进行中) */
    var np = pts.filter(function (x) { return x.m >= NIGHT_START; });
    if (np.length) {
      var lastN = np[np.length - 1];
      res.nightCur = { total: lastN.a, norm: lastN.a, ot: 0, live: true };
    }
    /* 凌晨段 0..470 = 昨晚夜班尾巴 (已跨天, 归档后由 archive 提供完整) */
    var tp = pts.filter(function (x) { return x.m < DAY_START && x.m < NIGHT_START && x.m >= 0; });
    if (tp.length) {
      var lastT = tp[tp.length - 1];
      var tCut = null;
      for (var j = 0; j < tp.length; j++) if (tp[j].m <= NIGHT_OT_START) tCut = tp[j];
      var tNormA = tCut ? tCut.a : 0;
      res.nightTail = { total: lastT.a, norm: tNormA, ot: Math.max(0, lastT.a - tNormA), live: false };
    }
    return res;
  }

  /* ── 人数: 手填 → localStorage + Firebase hc/{date}.json ── */
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

  /* ════════════════ DOM (v2 UI) ════════════════ */
  var css = [
    "#anaRoot{position:fixed;inset:0;z-index:9999;overflow:auto;display:flex;flex-direction:column;",
    "background:radial-gradient(1100px 520px at 18% -8%,#0e0e13 0%,#000 58%),#000;color:#f0f6fc;",
    "font-family:'Segoe UI','Microsoft YaHei',system-ui,sans-serif}",
    "#anaRoot *{box-sizing:border-box;margin:0;padding:0}",
    "/* 顶栏 */",
    "#anaTop{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;padding:12px 18px;",
    "background:rgba(0,0,0,.86);backdrop-filter:blur(8px);border-bottom:1px solid #232329;flex-wrap:wrap}",
    ".ana-back{display:inline-flex;align-items:center;gap:6px;background:#0a0a0d;color:#f0f6fc;border:1px solid #2a2a31;",
    "border-radius:8px;padding:6px 12px;font-size:12px;cursor:pointer;transition:all .15s}",
    ".ana-back:hover{border-color:#3d3d47;background:#121218;transform:translateX(-1px)}",
    "#anaTop h1{font-size:16px;font-weight:800;letter-spacing:.4px;display:flex;align-items:center;gap:8px}",
    "#anaTop h1 .ttl-ico{width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;",
    "font-size:14px;background:linear-gradient(135deg,rgba(88,166,255,.22),rgba(88,166,255,.05));border:1px solid rgba(88,166,255,.3)}",
    ".ana-sub{font-size:10.5px;color:#8b949e;font-weight:400;letter-spacing:0;margin-top:1px}",
    "#anaTop input[type=date]{background:#0a0a0d;color:#f0f6fc;border:1px solid #2a2a31;border-radius:8px;padding:5px 10px;",
    "font-size:12px;color-scheme:dark;cursor:pointer}",
    "#anaTop input[type=date]:focus{border-color:#58a6ff;outline:none;box-shadow:0 0 0 2px rgba(88,166,255,.14)}",
    ".ana-ctl{display:flex;align-items:center;gap:8px;margin-left:auto}",
    "#anaHelpBtn{display:inline-flex;align-items:center;gap:5px;background:#0a0a0d;color:#8b949e;border:1px solid #2a2a31;",
    "border-radius:20px;padding:4px 11px;font-size:11px;cursor:pointer;transition:all .15s}",
    "#anaHelpBtn:hover{color:#f0f6fc;border-color:#3d3d47}",
    "#anaHelpBtn.on{color:#58a6ff;border-color:rgba(88,166,255,.4);background:rgba(88,166,255,.08)}",
    "#anaStatus{font-size:11px;color:#8b949e;display:flex;align-items:center;gap:6px}",
    "#anaStatus .st-dot{width:7px;height:7px;border-radius:50%;background:#3fb950;box-shadow:0 0 6px rgba(63,185,80,.6)}",
    "#anaStatus.st-err .st-dot{background:#f85149;box-shadow:0 0 6px rgba(248,81,73,.6)}",
    "#anaStatus.st-idle .st-dot{background:#6e7681;box-shadow:none}",
    "/* 口径折叠 */",
    "#anaHelpBox{display:none;margin:0 18px;padding:12px 16px;background:#08080b;border:1px solid #232329;border-radius:0 0 10px 10px;",
    "font-size:11px;color:#8b949e;line-height:1.9}",
    "#anaHelpBox b{color:#c9d1d9}",
    "#anaHelpBox .hl{color:#58a6ff}.anaHelpBox .hl2{color:#d29922}",
    "/* 主体 */",
    "#anaBody{padding:16px 18px 34px;display:flex;flex-direction:column;gap:14px}",
    ".ana-state{display:flex;align-items:center;justify-content:center;gap:12px;padding:56px 0;color:#8b949e;font-size:12.5px}",
    ".spinner{width:24px;height:24px;border-radius:50%;border:2px solid #232329;border-top-color:#58a6ff;animation:anaSpin .7s linear infinite}",
    "@keyframes anaSpin{to{transform:rotate(360deg)}}",
    "/* 车间卡片网格 */",
    "#anaCards{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:12px}",
    ".ana-card{position:relative;display:flex;flex-direction:column;background:linear-gradient(180deg,#0c0c10 0%,#070709 100%);",
    "border:1px solid #232329;border-radius:12px;padding:13px 14px 10px;cursor:pointer;overflow:hidden;",
    "transition:border-color .15s,box-shadow .15s,transform .15s}",
    ".ana-card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--acc);opacity:.85}",
    ".ana-card:hover{border-color:#34343d;transform:translateY(-1px)}",
    ".ana-card.sel{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc),0 10px 30px -12px var(--acc)}",
    ".ac-top{display:flex;align-items:center;gap:9px;margin-bottom:11px}",
    ".ac-no{flex:none;width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;",
    "font-family:ui-monospace,'Cascadia Mono',monospace;font-size:12px;font-weight:800;color:#fff;",
    "background:var(--acc);opacity:.92;box-shadow:0 0 0 1px rgba(255,255,255,.06) inset}",
    ".ac-name{min-width:0;line-height:1.25}",
    ".ac-name .n{font-size:14.5px;font-weight:800;letter-spacing:.3px}",
    ".ac-name .tag{font-size:10px;color:#8b949e;margin-left:6px;font-weight:400}",
    ".ac-badges{margin-left:auto;display:flex;align-items:center;gap:7px;flex:none}",
    ".chip{font-size:10px;color:#8b949e;background:#121218;border:1px solid #232329;border-radius:14px;padding:2px 8px;",
    "font-variant-numeric:tabular-nums}",
    ".dot{width:8px;height:8px;border-radius:50%;flex:none}",
    ".dot.ok{background:#3fb950;box-shadow:0 0 6px rgba(63,185,80,.7)}",
    ".dot.na{background:#30363d;border:1px solid #484f58}",
    "/* 指标块 */",
    ".ana-metrics{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:9px}",
    ".m{background:#0a0a0e;border:1px solid #1b1b21;border-radius:9px;padding:7px 10px 6px;min-width:0}",
    ".m .l{display:flex;align-items:center;gap:5px;font-size:9.5px;color:#6e7681;letter-spacing:.07em;text-transform:uppercase;margin-bottom:2px;white-space:nowrap}",
    ".m .l i{width:5px;height:5px;border-radius:50%;flex:none}",
    ".m .v{font-family:ui-monospace,'Cascadia Mono',SFMono-Regular,Menlo,monospace;font-size:18px;font-weight:700;",
    "font-variant-numeric:tabular-nums;letter-spacing:-.5px;line-height:1.2;color:#f0f6fc;white-space:nowrap}",
    ".m .v small{font-size:9.5px;color:#6e7681;font-weight:400;letter-spacing:0;margin-left:2px}",
    ".m.nm{border-color:rgba(88,166,255,.16);background:linear-gradient(180deg,rgba(88,166,255,.06),rgba(88,166,255,.01))}",
    ".m.nm .v{color:#79b8ff}.m.nm .l i{background:#58a6ff}",
    ".m.ot{border-color:rgba(210,153,34,.17);background:linear-gradient(180deg,rgba(210,153,34,.06),rgba(210,153,34,.01))}",
    ".m.ot .v{color:#e3b341}.m.ot .l i{background:#d29922}",
    ".m.nt .v{color:#e6edf3}",
    "/* 占比条 */",
    ".ana-share{margin-bottom:9px}",
    ".bar{display:flex;height:5px;border-radius:3px;overflow:hidden;background:#16161c;gap:1px}",
    ".bar .b-nm{background:#58a6ff;border-radius:3px 0 0 3px}",
    ".bar .b-ot{background:linear-gradient(90deg,#d29922,#e3b341);border-radius:0 3px 3px 0}",
    ".bar .b-nm:only-child,.bar .b-ot:only-child{border-radius:3px}",
    ".bar-labels{display:flex;justify-content:space-between;margin-top:4px;font-size:9.5px;color:#6e7681;",
    "font-variant-numeric:tabular-nums}",
    ".bar-labels b{color:#8b949e;font-weight:600}",
    "/* 卡片脚: 人均徽章 */",
    ".ac-foot{display:flex;align-items:center;gap:8px;padding-top:8px;border-top:1px dashed #1e1e25;font-size:10.5px;color:#8b949e}",
    ".pill{display:inline-flex;align-items:center;gap:5px;padding:2.5px 10px;border-radius:20px;font-size:10px;font-weight:700;",
    "letter-spacing:.03em;white-space:nowrap}",
    ".pill.good{color:#3fb950;background:rgba(63,185,80,.1);border:1px solid rgba(63,185,80,.3)}",
    ".pill.bad{color:#f85149;background:rgba(248,81,73,.08);border:1px solid rgba(248,81,73,.28)}",
    ".pill.na{color:#6e7681;background:#121218;border:1px solid #232329}",
    ".ac-foot .t{color:#6e7681;font-size:10px;margin-left:auto;text-align:right;line-height:1.5}",
    "/* 明细面板 */",
    ".ana-panel{background:linear-gradient(180deg,#0b0b0f,#070709);border:1px solid #232329;border-radius:12px;overflow:hidden;display:none}",
    ".panel-head{display:flex;align-items:center;gap:8px;padding:11px 16px;border-bottom:1px solid #232329}",
    ".panel-head h3{font-size:13.5px;font-weight:800;display:flex;align-items:center;gap:8px}",
    ".panel-head h3 .dot2{width:7px;height:7px;border-radius:2px;background:var(--acc)}",
    ".panel-head .tip{margin-left:auto;font-size:10.5px;color:#6e7681}",
    ".panel-scroll{overflow-x:auto}",
    "#anaTable{border-collapse:collapse;font-size:11.5px;width:100%;font-variant-numeric:tabular-nums;white-space:nowrap}",
    "#anaTable th{padding:0;border-bottom:1px solid #232329;text-align:right}",
    "#anaTable th.ws-l{text-align:left}",
    "#anaTable tr.grp th{font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:#6e7681;font-weight:600;padding:5px 10px 3px}",
    "#anaTable tr.grp th.g-blue{color:#58a6ff}#anaTable tr.grp th.g-gold{color:#d29922}",
    "#anaTable tr.grp th.g-gray{color:#8b949e}#anaTable tr.grp th.g-wht{color:#c9d1d9}",
    "#anaTable tr.col th{font-size:10px;color:#8b949e;font-weight:600;padding:4px 10px 6px;background:#0a0a0e}",
    "#anaTable td{padding:5.5px 10px;text-align:right;border-bottom:1px solid #101014;color:#c9d1d9}",
    "#anaTable tbody tr:hover td{background:rgba(255,255,255,.018)}",
    "#anaTable td.ws-line{text-align:left;font-weight:600;color:#f0f6fc}",
    "#anaTable .nm{color:#79b8ff}#anaTable .ot{color:#e3b341}#anaTable .tot{color:#f0f6fc;font-weight:700}",
    "#anaTable .ppl{color:#8b949e;font-size:10.5px}",
    "#anaTable tr.sum td{font-weight:800;border-top:1px solid #2a2a31;background:linear-gradient(90deg,rgba(88,166,255,.08),rgba(88,166,255,0) 60%)}",
    "#anaTable tr.sum td.ws-line{color:#58a6ff}",
    "#anaTable input.hc{width:56px;background:#000;color:#f0f6fc;border:1px solid #2a2a31;border-radius:6px;padding:2.5px 4px;",
    "font-size:11px;text-align:center;font-variant-numeric:tabular-nums}",
    "#anaTable input.hc:focus{border-color:#58a6ff;outline:none;box-shadow:0 0 0 2px rgba(88,166,255,.15)}",
    "/* 滚动条 */",
    "#anaRoot ::-webkit-scrollbar{width:10px;height:10px}",
    "#anaRoot ::-webkit-scrollbar-thumb{background:#26262e;border-radius:5px;border:2px solid #000}",
    "#anaRoot ::-webkit-scrollbar-thumb:hover{background:#34343d}",
    "@media (max-width:640px){#anaCards{grid-template-columns:1fr}.m .v{font-size:16px}}"
  ].join("\n");

  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var root = document.createElement("div");
  root.id = "anaRoot";
  root.innerHTML =
    '<div id="anaTop">' +
    '<button class="ana-back" id="anaBack"><span>←</span> 看板</button>' +
    "<h1><span class='ttl-ico'>📊</span>产出分析<span class='ana-sub'>车间 · 正常 vs 加班</span></h1>" +
    '<input type="date" id="anaDate" title="选择历史日期">' +
    '<div class="ana-ctl">' +
    '<button id="anaHelpBtn">ⓘ 口径</button>' +
    '<span id="anaStatus" class="st-idle"><span class="st-dot"></span><span id="anaStatusTxt">就绪</span></span>' +
    "</div></div>" +
    '<div id="anaHelpBox">' +
    '<b>口径</b>：白班 8:00–20:20（正常 ≤17:20），加班 17:20–20:20；夜班 20:30–次日 8:00，加班 5:50–7:50。' +
    "<br><b>数据</b>：MES 10 分钟快照差分（班内累计）。白班完整需 20:20 后；21:50 前夜班当晚可见，完整夜班归入开始日。" +
    '<br><b>人数</b>：明细表内<span class="hl">可手填</span>（正常/加班人数），存云端；人均 = 产出 ÷ 人数。历史日期查看云端归档。' +
    "</div>" +
    '<div id="anaBody">' +
    '<div id="anaCards"></div>' +
    '<div class="ana-state" id="anaState" style="display:none"><div class="spinner"></div><span id="anaStateTxt">加载中…</span></div>' +
    '<div class="ana-panel" id="anaDetailWrap"><div class="panel-head">' +
    "<h3><span class='dot2' id='anaDot2'></span><span id='anaDetailTitle'></span></h3>" +
    '<span class="tip">点击其他车间卡切换 · 人数可手填</span></div>' +
    "<div class='panel-scroll'><table id='anaTable'><thead></thead><tbody></tbody></table></div></div>" +
    "</div>";

  /* root 仅由 openAnaPage() 按需挂载, 禁止页面加载自动显示 */
  var dateInput = root.querySelector("#anaDate");
  var cardsEl = root.querySelector("#anaCards");
  var detailWrap = root.querySelector("#anaDetailWrap");
  var detailTitle = root.querySelector("#anaDetailTitle");
  var dot2 = root.querySelector("#anaDot2");
  var tableEl = root.querySelector("#anaTable");
  var statusEl = root.querySelector("#anaStatus");
  var statusTxt = root.querySelector("#anaStatusTxt");
  var stateEl = root.querySelector("#anaState");
  var stateTxt = root.querySelector("#anaStateTxt");
  var helpBox = root.querySelector("#anaHelpBox");
  var helpBtn = root.querySelector("#anaHelpBtn");

  root.querySelector("#anaBack").onclick = function () { root.remove(); };
  helpBtn.onclick = function () {
    var show = helpBox.style.display !== "block";
    helpBox.style.display = show ? "block" : "none";
    helpBtn.classList.toggle("on", show);
  };

  var state = { hourly: {}, hc: {}, date: null, selWs: null, today: null };

  function todayStr() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function dstr(off) {
    var d = new Date();
    d.setDate(d.getDate() + off);
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

  /* 拉取并聚合 */
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
        cardsEl.innerHTML = "";
        detailWrap.style.display = "none";
        setStatus(isToday ? "暂无数据" : "无归档", "idle");
        return;
      }
      state.hourly = d.hourly || {};
      state.hc = res[1] || {};
      aggregateAndRender();
      setState(false);
      setStatus("更新 " + (d.updatedAt ? d.updatedAt.replace("T", " ").substring(5, 16) : (isToday ? "实时" : date)), "ok");
    }).catch(function (e) {
      setState(true, false, "加载失败，请重试");
      setStatus("加载失败", "err");
    });
  }

  function aggregateAndRender() {
    /* 每线聚合 + 车间汇总 */
    var wsAgg = {};
    WS_MAP.forEach(function (g) { wsAgg[g.ws] = { dayTotal: 0, dayNorm: 0, dayOt: 0, ntTotal: 0, ntNorm: 0, ntOt: 0, nLine: 0 }; });
    Object.keys(state.hourly).forEach(function (rawName) {
      var std = NORM2WS[normN(rawName)];
      if (!std) return; // 不在 36 线清单(如 True B) → 跳过
      var ws = LINE2WS[std];
      var g = wsAgg[ws];
      if (!g) return;
      var s = aggLine(state.hourly[rawName]);
      g.nLine++;
      if (s.day) { g.dayTotal += s.day.total; g.dayNorm += s.day.norm; g.dayOt += s.day.ot; }
      if (s.nightCur) { g.ntTotal += s.nightCur.total; }
      if (s.nightTail) { g.ntTotal += s.nightTail.total; g.ntNorm += s.nightTail.norm; g.ntOt += s.nightTail.ot; }
    });
    state.wsAgg = wsAgg;
    renderCards();
    if (state.selWs && wsAgg[state.selWs] && wsAgg[state.selWs].nLine) renderDetail(state.selWs);
    else { state.selWs = null; detailWrap.style.display = "none"; }
  }

  function wsMeta(ws) {
    for (var i = 0; i < WS_MAP.length; i++) if (WS_MAP[i].ws === ws) return WS_MAP[i];
    return null;
  }

  /* 人均对比徽章: 有正常+加班人数且白班有加班 → 值/亏; 否则待填 */
  function hcPill(a, hcn, hco) {
    if (a.dayOt > 0 && hco > 0 && hcn > 0) {
      var dN = a.dayNorm / hcn, dO = a.dayOt / hco;
      return dO >= dN
        ? '<span class="pill good">▲ 加班人均更值</span>'
        : '<span class="pill bad">▼ 加班人均更低</span>';
    }
    return '<span class="pill na">待填人数算人均</span>';
  }

  function renderCards() {
    var hcAll = {};
    Object.keys(state.hc).forEach(function (ln) {
      var hc = state.hc[ln] || {};
      hcAll[ln] = { n: Number(hc.normal_hc) || 0, o: Number(hc.ot_hc) || 0 };
    });
    var html = "";
    WS_MAP.forEach(function (g, idx) {
      var a = state.wsAgg[g.ws];
      var acc = WS_ACC[g.ws] || "#58a6ff";
      var hcn = 0, hco = 0, nHC = 0;
      g.lines.forEach(function (ln) {
        var h = hcAll[ln];
        if (h && (h.n || h.o)) { nHC++; hcn += h.n; hco += h.o; }
      });
      var cls = state.selWs === g.ws ? "ana-card sel" : "ana-card";
      var noLines = g.lines.length === 0;
      /* 白班正常vs加班占比条 */
      var share = "";
      if (!noLines && (a.dayNorm > 0 || a.dayOt > 0)) {
        var tot = a.dayNorm + a.dayOt;
        var wp = Math.max(a.dayNorm / tot * 100, a.dayNorm > 0 ? 4 : 0);
        var op = 100 - wp;
        share = '<div class="ana-share"><div class="bar">' +
          (a.dayNorm > 0 ? '<div class="b-nm" style="width:' + wp.toFixed(1) + '%"></div>' : "") +
          (a.dayOt > 0 ? '<div class="b-ot" style="width:' + op.toFixed(1) + '%"></div>' : "") +
          "</div><div class='bar-labels'><span>正常 <b>" + fmt(a.dayNorm) + "</b></span><span>加班 <b>" + fmt(a.dayOt) + "</b></span></div></div>";
      } else if (!noLines) {
        share = '<div class="ana-share"><div class="bar"></div><div class="bar-labels"><span>白班暂未结束或无产出</span></div></div>';
      }
      var hcDot = noLines
        ? '<span class="dot na" title="未配置线体"></span>'
        : (nHC ? '<span class="dot ok" title="人数已填"></span>' : '<span class="dot na" title="人数未填"></span>');
      var foot = noLines
        ? '<span class="pill na">未配置线体</span><span class="t">线体清单待定<br>暂无聚合</span>'
        : hcPill(a, hcn, hco) +
          '<span class="t">' + (a.ntOt > 0 ? "夜班加班 " + fmt(a.ntOt) : g.lines.length + " 线体") + "</span>";
      html += '<div class="' + cls + '" data-ws="' + g.ws + '" style="--acc:' + acc + '">' +
        '<div class="ac-top">' +
        '<span class="ac-no">' + String(idx + 1).padStart(2, "0") + "</span>" +
        '<div class="ac-name"><span class="n">' + g.ws + '</span><span class="tag">' + g.tag + "</span></div>" +
        '<div class="ac-badges">' + (noLines ? "" : '<span class="chip">' + g.lines.length + "线</span>") + hcDot + "</div>" +
        "</div>" +
        '<div class="ana-metrics">' +
        '<div class="m nm"><div class="l"><i></i>白班 · 正常</div><div class="v">' + fmt(a.dayNorm) + "</div></div>" +
        '<div class="m ot"><div class="l"><i></i>白班 · 加班</div><div class="v">' + fmt(a.dayOt) + "</div></div>" +
        '<div class="m nt"><div class="l"><i></i>夜班 · 总</div><div class="v">' + fmt(a.ntTotal) + "</div></div>" +
        '<div class="m ot"><div class="l"><i></i>夜班 · 加班</div><div class="v">' + fmt(a.ntOt) + "</div></div>" +
        "</div>" + share +
        '<div class="ac-foot">' + foot + "</div></div>";
    });
    cardsEl.innerHTML = html;
    Array.prototype.forEach.call(cardsEl.querySelectorAll(".ana-card"), function (c) {
      c.onclick = function () {
        var ws = c.getAttribute("data-ws");
        state.selWs = (state.selWs === ws) ? null : ws;
        renderCards();
        if (state.selWs) renderDetail(state.selWs); else detailWrap.style.display = "none";
      };
    });
  }

  function renderDetail(ws) {
    var g = wsMeta(ws);
    var acc = WS_ACC[ws] || "#58a6ff";
    dot2.style.background = acc;
    detailTitle.textContent = g.ws + " · " + g.tag + " 明细";
    var hcAll = {};
    Object.keys(state.hc).forEach(function (ln) {
      var hc = state.hc[ln] || {};
      hcAll[ln] = { n: hc.normal_hc, o: hc.ot_hc };
    });
    var th = "<tr class='grp'>" +
      "<th class='ws-l' rowspan='2'></th>" +
      "<th colspan='3' class='g-blue'>白班 (8:00–20:20)</th>" +
      "<th colspan='2' class='g-wht'>夜班</th>" +
      "<th colspan='2' class='g-gray'>人数</th>" +
      "<th colspan='2' class='g-gold'>人均</th></tr>" +
      "<tr class='col'><th>总产出</th><th>正常 ≤17:20</th><th>加班</th><th>今晚总</th><th>凌晨段(昨晚)</th>" +
      "<th>正常</th><th>加班</th><th>正常</th><th>加班</th></tr>";
    var rows = "", sd = state.wsAgg[ws], dN = 0, dO = 0, nN = 0, nO = 0;
    g.lines.forEach(function (ln) {
      var raw = state.hourly[ln];
      if (!raw) return;
      var s = aggLine(raw);
      var hc = hcAll[ln] || {};
      var hn = Number(hc.n) || 0, ho = Number(hc.o) || 0;
      dN += hn; dO += ho;
      var dayP = s.day ? (hn ? (s.day.norm / hn) : null) : null;
      var otP = (s.day && s.day.ot > 0 && ho) ? (s.day.ot / ho) : null;
      rows += "<tr data-ln='" + ln + "'><td class='ws-line'>" + ln + "</td>" +
        "<td class='tot'>" + fmt(s.day ? s.day.total : null) + "</td>" +
        "<td class='nm'>" + fmt(s.day ? s.day.norm : null) + "</td>" +
        "<td class='ot'>" + fmt(s.day ? s.day.ot : null) + "</td>" +
        "<td class='tot'>" + fmt(s.nightCur ? s.nightCur.total : null) + "</td>" +
        "<td>" + (s.nightTail ? fmt(s.nightTail.total) + ' <span class="ot">OT ' + fmt(s.nightTail.ot) + "</span>" : "--") + "</td>" +
        "<td><input class='hc' type='number' min='0' value='" + (hc.n || "") + "' data-f='normal_hc'></td>" +
        "<td><input class='hc' type='number' min='0' value='" + (hc.o || "") + "' data-f='ot_hc'></td>" +
        "<td class='ppl'>" + (dayP === null ? "--" : dayP.toFixed(1)) + "</td>" +
        "<td class='ppl'>" + (otP === null ? "--" : otP.toFixed(1)) + "</td></tr>";
    });
    rows += "<tr class='sum'><td class='ws-line'>合计 (" + g.lines.length + "线)</td><td>" + fmt(sd.dayTotal) + "</td><td>" + fmt(sd.dayNorm) + "</td><td>" + fmt(sd.dayOt) +
      "</td><td>" + fmt(sd.ntTotal) + "</td><td>" + fmt(sd.ntNorm) + ' <span class="ot">OT ' + fmt(sd.ntOt) + "</span></td><td>" + (dN || "") + "</td><td>" + (dO || "") +
      "</td><td class='ppl'>" + (dN ? (sd.dayNorm / dN).toFixed(1) : "--") + "</td><td class='ppl'>" + (dO ? (sd.dayOt / dO).toFixed(1) : "--") + "</td></tr>";
    tableEl.querySelector("thead").innerHTML = th;
    tableEl.querySelector("tbody").innerHTML = rows;
    detailWrap.style.display = "block";
    /* 人数手填 → 云端 */
    Array.prototype.forEach.call(tableEl.querySelectorAll("input.hc"), function (inp) {
      inp.onchange = function () {
        var ln = inp.closest("tr").getAttribute("data-ln");
        var f = inp.getAttribute("data-f");
        var v = inp.value === "" ? null : Number(inp.value);
        var hc = state.hc[ln] || {};
        hc[f] = v;
        state.hc[ln] = hc;
        saveHC(state.date, state.hc);
        renderCards();
        renderDetail(state.selWs);
      };
    });
  }

  var started = false;
  /* 点击顶部「🏭 产出分析」按钮打开; 再次点击已开则不重建 */
  window.openAnaPage = function () {
    if (document.getElementById("anaRoot")) { root.style.display = "flex"; return; }
    state.today = todayStr();
    dateInput.max = state.today;
    dateInput.onchange = function () {
      if (!dateInput.value) return;
      state.selWs = null;
      detailWrap.style.display = "none";
      load(dateInput.value);
    };
    if (!dateInput.value) dateInput.value = state.today;
    document.body.appendChild(root);
    if (!started) started = true;
    load(dateInput.value || state.today);
  };
  window.closeAnaPage = function () { if (root.parentNode) root.remove(); };
  /* 每小时自动刷新今天数据(页面打开期间) */
  setInterval(function () {
    if (root.parentNode && state.date === state.today) load(state.today);
  }, 3600000);
})();
