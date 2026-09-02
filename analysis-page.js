/* ============================================================
 * 车间产出分析页 (独立模块, 不影响主看板任何逻辑)
 * 2026-09-02 v1  纯前端: 读 Firebase pdtiii.json hourly
 *   → 按车间/线体/班次聚合 → 拆「正常时段产出 vs 加班时段产出」
 * 加班口径(用户 2026-09-02 确认): 白班 17:20–20:20 / 夜班 5:50–7:50
 * 人数: normal_hc / ot_hc 预留(可手填, 存 Firebase analysis/hc/{date}.json)
 *
 * 2026-09-02 v2 UI重做 (用户: 卡片太丑/无排版/全是字)
 * 2026-09-02 v3 UI重做×2 (用户: 仍低级/挤/乱/无层次)
 *   → 设计基准: Grafana dark 面板克制性 + shadcn/ui 表格排版 + Linear 灰阶层级
 *   → 去掉彩色底块/发光特效(低级感来源), 回归灰阶系统: 文字三级亮度+字号层级
 *   → 顶部全局 KPI 行(与主看板 .kpi 同构) → 中性车间卡片(左缘色条识别) → 明细
 *   → 明细表精简 8 列, 行高稳定, 等宽数字, 分组表头极淡化
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
  /* 车间识别色 (仅小面积点缀: 卡左缘条 + 点) */
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

  /* ════════════════ DOM (v3 UI) ════════════════
   * 设计基准: Grafana 面板克制 / shadcn 表格排版 / Linear 灰阶层级
   * 灰阶三级: --t1 主字 / --t2 次字 / --t3 弱字; 色仅用于: 语义值(正常蓝/加班金)+识别(车间色小面积) */
  var css = [
    "#anaRoot{position:fixed;inset:0;z-index:9999;overflow:auto;display:flex;flex-direction:column;",
    "background:#07070a;color:#e6edf3;font-family:'Segoe UI','Microsoft YaHei',system-ui,sans-serif;font-size:12px}",
    "#anaRoot *{box-sizing:border-box;margin:0;padding:0}",
    "/* ─ 顶栏 ─ */",
    "#anaTop{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:14px;padding:12px 22px;",
    "background:rgba(7,7,10,.88);backdrop-filter:blur(10px);border-bottom:1px solid #1b1d23;flex-wrap:wrap}",
    ".ana-back{display:inline-flex;align-items:center;gap:7px;background:transparent;color:#a3adbb;border:1px solid #26282f;",
    "border-radius:8px;padding:6px 13px;font-size:12px;cursor:pointer;transition:all .15s}",
    ".ana-back:hover{color:#e6edf3;border-color:#3d414b;background:#0e0f13}",
    "#anaTop h1{font-size:15px;font-weight:800;letter-spacing:.3px;display:flex;align-items:center;gap:9px}",
    ".ana-sub{font-size:10.5px;color:#6e7681;font-weight:400;margin-left:2px}",
    "#anaTop input[type=date]{background:#0e0f13;color:#e6edf3;border:1px solid #26282f;border-radius:8px;padding:5px 10px;",
    "font-size:12px;color-scheme:dark;cursor:pointer}",
    "#anaTop input[type=date]:focus{border-color:#3d414b;outline:none}",
    ".ana-ctl{display:flex;align-items:center;gap:8px;margin-left:auto}",
    "#anaHelpBtn{display:inline-flex;align-items:center;gap:5px;background:transparent;color:#6e7681;border:1px solid #26282f;",
    "border-radius:8px;padding:5px 11px;font-size:11px;cursor:pointer;transition:all .15s}",
    "#anaHelpBtn:hover{color:#a3adbb;border-color:#3d414b}",
    "#anaHelpBtn.on{color:#58a6ff;border-color:rgba(88,166,255,.35)}",
    "#anaStatus{font-size:11px;color:#6e7681;display:flex;align-items:center;gap:7px;white-space:nowrap}",
    "#anaStatus .st-dot{width:6px;height:6px;border-radius:50%;background:#3fb950}",
    "#anaStatus.st-err .st-dot{background:#f85149}#anaStatus.st-idle .st-dot{background:#484f58}",
    "#anaHelpBox{display:none;margin:0 22px;padding:13px 18px;background:#0b0c0f;border:1px solid #1b1d23;border-radius:0 0 10px 10px;",
    "font-size:11px;color:#8b949e;line-height:2;border-top:none}",
    "#anaHelpBox b{color:#c9d1d9;font-weight:700}",
    "/* ─ 主体 ─ */",
    "#anaBody{padding:18px 22px 44px;display:flex;flex-direction:column;gap:18px}",
    "/* 全局 KPI (与主看板 .kpi 同构) */",
    "#anaKpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;flex-shrink:0}",
    ".kpi{background:#0d0e12;border:1px solid #1f2128;border-radius:10px;padding:10px 16px;min-width:0;",
    "display:flex;flex-direction:column;justify-content:center;gap:2px}",
    ".kpi .lb{font-size:10.5px;color:#6e7681;letter-spacing:.06em;display:flex;align-items:center;gap:6px;white-space:nowrap}",
    ".kpi .lb i{width:5px;height:5px;border-radius:50%;flex:none}",
    ".kpi .va{font-size:24px;font-weight:650;letter-spacing:-.5px;line-height:1.25;font-variant-numeric:tabular-nums;color:#e6edf3}",
    ".kpi .va.gold{color:#e3b341}.kpi .va.blue{color:#79c0ff}",
    ".kpi .sb{font-size:10px;color:#484f58;margin-top:1px;white-space:nowrap}",
    "/* 空态/加载 */",
    ".ana-state{display:flex;align-items:center;justify-content:center;gap:12px;padding:70px 0;color:#6e7681;font-size:12.5px}",
    ".spinner{width:22px;height:22px;border-radius:50%;border:2px solid #1f2128;border-top-color:#58a6ff;animation:anaSpin .7s linear infinite}",
    "@keyframes anaSpin{to{transform:rotate(360deg)}}",
    "/* ─ 车间卡片 (中性灰阶, 左缘色条识别) ─ */",
    "#anaCards{display:grid;grid-template-columns:repeat(auto-fill,minmax(348px,1fr));gap:12px}",
    ".ana-card{position:relative;display:flex;flex-direction:column;background:#0d0e12;border:1px solid #1f2128;border-radius:12px;",
    "padding:16px 16px 13px 18px;cursor:pointer;overflow:hidden;transition:border-color .15s,transform .15s,background .15s}",
    ".ana-card::before{content:'';position:absolute;left:0;top:10px;bottom:10px;width:3px;border-radius:0 3px 3px 0;background:var(--acc);opacity:.75}",
    ".ana-card:hover{border-color:#31343d;transform:translateY(-1px);background:#0f1015}",
    ".ana-card.sel{border-color:#3a3f4b;background:#101116;box-shadow:0 0 0 1px #3a3f4b inset}",
    ".ana-card.sel::before{opacity:1}",
    ".ac-top{display:flex;align-items:baseline;gap:8px;margin-bottom:14px}",
    ".ac-name{font-size:13.5px;font-weight:750;letter-spacing:.2px}",
    ".ac-tag{font-size:10px;color:#6e7681;margin-left:1px}",
    ".ac-badges{margin-left:auto;display:flex;align-items:center;gap:8px;flex:none}",
    ".chip{font-size:10px;color:#6e7681;background:#0a0b0e;border:1px solid #26282f;border-radius:12px;padding:1.5px 9px;",
    "font-variant-numeric:tabular-nums}",
    ".hc-st{display:flex;align-items:center;gap:5px;font-size:10px;color:#484f58}",
    ".hc-st i{width:6px;height:6px;border-radius:50%;background:#3fb950;flex:none}",
    ".hc-st.na i{background:#30363d}",
    "/* 主数字 */",
    ".ac-main{display:flex;align-items:baseline;gap:8px;margin-bottom:14px;line-height:1}",
    ".ac-main .mv{font-size:30px;font-weight:650;letter-spacing:-1px;font-variant-numeric:tabular-nums;color:#f0f6fc}",
    ".ac-main .mv small{font-size:11px;color:#484f58;font-weight:400;letter-spacing:0;margin-left:4px}",
    ".ac-main .ml{margin-left:auto;font-size:10px;color:#484f58;text-align:right;line-height:1.5;white-space:nowrap}",
    "/* 班次拆分行 */",
    ".ac-split{display:flex;flex-direction:column;gap:7px;margin-bottom:13px}",
    ".sp-row{display:grid;grid-template-columns:52px 1fr 1fr;gap:10px;align-items:baseline}",
    ".sp-row .sh{font-size:10.5px;color:#6e7681;display:flex;align-items:center;gap:6px}",
    ".sp-row .sh b{font-weight:600}",
    ".sp-cell{display:flex;align-items:baseline;gap:6px;min-width:0}",
    ".sp-cell .k{font-size:9.5px;color:#484f58;letter-spacing:.05em;white-space:nowrap}",
    ".sp-cell .v{font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;color:#d0d7de;letter-spacing:-.2px}",
    ".sp-cell.ot .v{color:#e3b341}",
    ".sp-cell.nm .v{color:#79c0ff}",
    "/* 卡片脚 */",
    ".ac-foot{display:flex;align-items:center;gap:8px;padding-top:11px;border-top:1px solid #1a1c22;font-size:10.5px;color:#6e7681;min-height:28px}",
    ".ac-foot .note{display:flex;align-items:center;gap:6px}",
    ".arrow-up{color:#3fb950;font-weight:700}.arrow-dn{color:#f85149;font-weight:700}",
    ".ac-foot .f-r{margin-left:auto;color:#484f58;font-size:10px;white-space:nowrap}",
    "/* ─ 明细面板 ─ */",
    ".ana-panel{background:#0b0c0f;border:1px solid #1f2128;border-radius:12px;overflow:hidden;display:none}",
    ".panel-head{display:flex;align-items:center;gap:10px;padding:13px 18px;border-bottom:1px solid #1b1d23}",
    ".panel-head .ph-t{font-size:13px;font-weight:750;display:flex;align-items:center;gap:8px}",
    ".panel-head .ph-t .d{width:8px;height:8px;border-radius:2px;background:var(--acc)}",
    ".panel-head .ph-t .tt{font-weight:400;color:#6e7681;font-size:11px;margin-left:2px}",
    ".ph-sum{margin-left:auto;display:flex;align-items:center;gap:10px;font-size:11px;color:#6e7681;font-variant-numeric:tabular-nums}",
    ".ph-sum b{color:#d0d7de;font-weight:650}",
    ".ph-close{background:transparent;border:1px solid #26282f;color:#6e7681;border-radius:7px;width:24px;height:24px;",
    "font-size:12px;line-height:1;cursor:pointer;flex:none;transition:all .15s}",
    ".ph-close:hover{color:#e6edf3;border-color:#3d414b}",
    ".panel-scroll{overflow-x:auto}",
    "/* 明细表: shadcn 式极淡分隔 + tabular */",
    "#anaTable{border-collapse:collapse;font-size:12px;width:100%;font-variant-numeric:tabular-nums;white-space:nowrap}",
    "#anaTable th{font-weight:600;padding:0;border-bottom:1px solid #1b1d23}",
    "#anaTable tr.grp th{font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#484f58;font-weight:600;padding:9px 12px 3px;text-align:right}",
    "#anaTable tr.grp th:first-child{text-align:left}",
    "#anaTable tr.grp th.gh-bl{color:#1f6feb}#anaTable tr.grp th.gh-gd{color:#9e6a03}",
    "#anaTable tr.col th{font-size:10px;color:#8b949e;font-weight:600;padding:2px 12px 8px;background:transparent;text-align:right}",
    "#anaTable tr.col th:first-child{text-align:left}",
    "#anaTable td{padding:7px 12px;text-align:right;border-bottom:1px solid #131519;color:#c9d1d9}",
    "#anaTable tbody tr{transition:background .1s}",
    "#anaTable tbody tr:hover td{background:#101116}",
    "#anaTable td.ws-line{text-align:left;font-weight:650;color:#f0f6fc;font-size:12px}",
    "#anaTable td.ws-line .off-n{color:#484f58;font-size:10px;font-weight:400;margin-left:6px}",
    "#anaTable .nm{color:#79c0ff}#anaTable .ot{color:#e3b341}#anaTable .tot{color:#f0f6fc;font-weight:700}",
    "#anaTable .ppl{color:#a3adbb;font-size:11px}",
    "#anaTable tr.sum td{font-weight:700;border-top:1px solid #26282f;border-bottom:none;color:#f0f6fc;background:rgba(88,166,255,.05)}",
    "#anaTable tr.sum td.ws-line{color:#58a6ff}",
    "#anaTable input.hc{width:50px;background:#07070a;color:#e6edf3;border:1px solid #26282f;border-radius:6px;padding:3px 4px;",
    "font-size:11.5px;text-align:center;font-variant-numeric:tabular-nums}",
    "#anaTable input.hc:focus{border-color:#58a6ff;outline:none}",
    "#anaTable input.hc::placeholder{color:#30363d}",
    "/* 滚动条 */",
    "#anaRoot ::-webkit-scrollbar{width:10px;height:10px}",
    "#anaRoot ::-webkit-scrollbar-thumb{background:#21242b;border-radius:5px;border:2px solid #07070a}",
    "#anaRoot ::-webkit-scrollbar-thumb:hover{background:#2f333c}",
    "@media (max-width:800px){#anaKpis{grid-template-columns:repeat(2,1fr)}#anaCards{grid-template-columns:1fr}.ac-main .mv{font-size:26px}}"
  ].join("\n");

  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var root = document.createElement("div");
  root.id = "anaRoot";
  root.innerHTML =
    '<div id="anaTop">' +
    '<button class="ana-back" id="anaBack">← 返回看板</button>' +
    "<h1>车间产出分析<span class='ana-sub'>正常 vs 加班 · 按班次拆解</span></h1>" +
    '<input type="date" id="anaDate" title="选择历史日期">' +
    '<div class="ana-ctl">' +
    '<button id="anaHelpBtn">ⓘ 口径</button>' +
    '<span id="anaStatus" class="st-idle"><span class="st-dot"></span><span id="anaStatusTxt">就绪</span></span>' +
    "</div></div>" +
    '<div id="anaHelpBox">' +
    '<b>口径</b> 白班 8:00–20:20 · 正常 ≤17:20 · 加班 17:20–20:20　|　夜班 20:30–次日 8:00 · 加班 5:50–7:50<br>' +
    '<b>数据</b> MES 10 分钟快照差分（班内累计）· 白班完整需 20:20 后 · 完整夜班归入开始日 · 历史日期读云端归档<br>' +
    '<b>人均</b> 明细表中可手填各线正常/加班人数（存云端）→ 自动算人均。' +
    "</div>" +
    '<div id="anaBody">' +
    '<div id="anaKpis"></div>' +
    '<div id="anaCards"></div>' +
    '<div class="ana-state" id="anaState" style="display:none"><div class="spinner"></div><span id="anaStateTxt">加载中…</span></div>' +
    '<div class="ana-panel" id="anaDetailWrap"><div class="panel-head">' +
    "<div class='ph-t'><span class='d' id='anaDot2'></span><span id='anaDetailTitle'></span><span class='tt' id='anaDetailSub'></span></div>" +
    '<div class="ph-sum" id="anaDetailSum"></div>' +
    '<button class="ph-close" id="anaClose" title="收起明细">✕</button></div>' +
    "<div class='panel-scroll'><table id='anaTable'><thead></thead><tbody></tbody></table></div></div>" +
    "</div>";

  /* root 仅由 openAnaPage() 按需挂载, 禁止页面加载自动显示 */
  var dateInput = root.querySelector("#anaDate");
  var kpisEl = root.querySelector("#anaKpis");
  var cardsEl = root.querySelector("#anaCards");
  var detailWrap = root.querySelector("#anaDetailWrap");
  var detailTitle = root.querySelector("#anaDetailTitle");
  var detailSub = root.querySelector("#anaDetailSub");
  var detailSum = root.querySelector("#anaDetailSum");
  var dot2 = root.querySelector("#anaDot2");
  var tableEl = root.querySelector("#anaTable");
  var statusEl = root.querySelector("#anaStatus");
  var statusTxt = root.querySelector("#anaStatusTxt");
  var stateEl = root.querySelector("#anaState");
  var stateTxt = root.querySelector("#anaStateTxt");
  var helpBox = root.querySelector("#anaHelpBox");
  var helpBtn = root.querySelector("#anaHelpBtn");

  root.querySelector("#anaBack").onclick = function () { root.remove(); };
  root.querySelector("#anaClose").onclick = function () { state.selWs = null; renderCards(); detailWrap.style.display = "none"; };
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
        cardsEl.innerHTML = ""; kpisEl.innerHTML = "";
        detailWrap.style.display = "none";
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
    /* 每线聚合 + 车间汇总 */
    var wsAgg = {}, SUM = { dayTotal: 0, dayNorm: 0, dayOt: 0, ntTotal: 0, ntOt: 0 };
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
    WS_MAP.forEach(function (g) {
      var a = wsAgg[g.ws];
      SUM.dayTotal += a.dayTotal; SUM.dayNorm += a.dayNorm; SUM.dayOt += a.dayOt;
      SUM.ntTotal += a.ntTotal; SUM.ntOt += a.ntOt;
    });
    state.wsAgg = wsAgg;
    state.sum = SUM;
    renderKpis();
    renderCards();
    if (state.selWs && wsAgg[state.selWs] && wsAgg[state.selWs].nLine) renderDetail(state.selWs);
    else { state.selWs = null; detailWrap.style.display = "none"; }
  }

  function wsMeta(ws) {
    for (var i = 0; i < WS_MAP.length; i++) if (WS_MAP[i].ws === ws) return WS_MAP[i];
    return null;
  }

  /* ─ 顶部全局 KPI ─ */
  function renderKpis() {
    var s = state.sum;
    kpisEl.innerHTML =
      '<div class="kpi"><div class="lb">总产出 · 白班+夜班</div><div class="va">' + fmt(s.dayTotal + s.ntTotal) + '</div><div class="sb">全车间合计</div></div>' +
      '<div class="kpi"><div class="lb"><i style="background:#79c0ff"></i>白班正常时段</div><div class="va blue">' + fmt(s.dayNorm) + '</div><div class="sb">≤ 17:20</div></div>' +
      '<div class="kpi"><div class="lb"><i style="background:#e3b341"></i>加班产出</div><div class="va gold">' + fmt(s.dayOt + s.ntOt) + '</div><div class="sb">白班 OT + 夜班 OT</div></div>' +
      '<div class="kpi"><div class="lb">夜班产出</div><div class="va">' + fmt(s.ntTotal) + '</div><div class="sb">今晚 + 凌晨段</div></div>';
  }

  /* 人均对比: 返回 {html, ok} */
  function perCap(a, hcn, hco) {
    if (a.dayOt > 0 && hco > 0 && hcn > 0) {
      var dN = a.dayNorm / hcn, dO = a.dayOt / hco;
      var better = dO >= dN;
      return {
        html: '<span class="note"><span class="' + (better ? "arrow-up" : "arrow-dn") + '">' + (better ? "▲" : "▼") + "</span>加班人均 " +
          Math.round(dO) + " / " + Math.round(dN) + "·正常</span>",
        ok: true, better: better
      };
    }
    return { html: '<span class="note">填人数后对比加班/正常人均</span>', ok: false };
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
      var dayTot = a.dayTotal, ntTot = a.ntTotal;
      var foot, footR;
      if (noLines) {
        foot = '<span class="note">线体清单未配置</span>';
        footR = "";
      } else {
        var pc = perCap(a, hcn, hco);
        foot = pc.html;
        footR = '<span class="f-r">' + g.lines.length + " 线体 · " +
          (nHC ? "人数 " + (hcn + hco) : "人数未填") + "</span>";
      }
      var hcSt = noLines ? "" :
        '<span class="hc-st' + (nHC ? "" : " na") + '"><i></i>' + (nHC ? "人数已填" : "未填人数") + "</span>";
      html += '<div class="' + cls + '" data-ws="' + g.ws + '" style="--acc:' + acc + '">' +
        '<div class="ac-top">' +
        '<span class="ac-name">' + g.ws + "</span><span class='ac-tag'>" + g.tag + "</span>" +
        '<span class="ac-badges">' + (noLines ? "" : '<span class="chip">' + g.lines.length + "线</span>") + hcSt + "</span>" +
        "</div>" +
        '<div class="ac-main">' +
        '<span class="mv">' + fmt(dayTot + ntTot) + "<small>总产出</small></span>" +
        '<span class="ml">白班 ' + fmt(dayTot) + "<br>夜班 " + fmt(ntTot) + "</span>" +
        "</div>" +
        '<div class="ac-split">' +
        '<div class="sp-row"><span class="sh"><b>白班</b></span>' +
        '<span class="sp-cell nm"><span class="k">正常时段</span><span class="v">' + fmt(a.dayNorm) + "</span></span>" +
        '<span class="sp-cell ot"><span class="k">加班 17:20后</span><span class="v">' + fmt(a.dayOt) + "</span></span></div>" +
        '<div class="sp-row"><span class="sh"><b>夜班</b></span>' +
        '<span class="sp-cell"><span class="k">今晚</span><span class="v">' + fmt(a.ntTotal - a.ntOt) + "</span></span>" +
        '<span class="sp-cell ot"><span class="k">加班/凌晨段</span><span class="v">' + fmt(a.ntOt) + "</span></span></div>" +
        "</div>" +
        '<div class="ac-foot">' + foot + footR + "</div></div>";
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
    detailTitle.textContent = g.ws;
    detailSub.textContent = g.tag + " · 各线明细";
    var sd = state.wsAgg[ws];
    detailSum.innerHTML = "车间合计 <b>" + fmt(sd.dayTotal + sd.ntTotal) + "</b> · 白班 " + fmt(sd.dayTotal) +
      " · 夜班 " + fmt(sd.ntTotal);
    var hcAll = {};
    Object.keys(state.hc).forEach(function (ln) {
      var hc = state.hc[ln] || {};
      hcAll[ln] = { n: hc.normal_hc, o: hc.ot_hc };
    });
    var th = "<tr class='grp'>" +
      "<th colspan='2'>线体</th>" +
      "<th colspan='3' class='gh-bl'>白班 8:00–20:20</th>" +
      "<th>夜班</th>" +
      "<th colspan='2'>人数</th>" +
      "<th>人均 正常/加班</th></tr>" +
      "<tr class='col'><th>线体</th><th>产出构成</th><th>总产出</th><th>正常 ≤17:20</th><th>加班</th><th>今晚+凌晨</th>" +
      "<th>正常人数</th><th>加班人数</th><th></th></tr>";
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
      /* 产出构成条: 白班正常=蓝 白班加班=金 夜班=白 */
      var bar = "";
      if (dayTot > 0 || ntTot > 0) {
        var tot = Math.max(1, dayTot + ntTot);
        var wN = s.day && s.day.norm > 0 ? Math.max(s.day.norm / tot * 100, 3) : 0;
        var wO = s.day && s.day.ot > 0 ? Math.max(s.day.ot / tot * 100, 3) : 0;
        bar = '<div style="display:flex;height:9px;border-radius:4px;overflow:hidden;background:#16181d;min-width:110px">' +
          (wN > 0 ? '<div style="width:' + wN.toFixed(1) + '%;background:#58a6ff"></div>' : "") +
          (wO > 0 ? '<div style="width:' + wO.toFixed(1) + '%;background:#e3b341"></div>' : "") +
          (ntTot > 0 ? '<div style="flex:1;background:rgba(255,255,255,.25)"></div>' : "") +
          "</div>";
      } else bar = '<div style="display:flex;height:9px;border-radius:4px;background:#16181d;min-width:110px"></div>';
      var nW = dayTot > 0 || ntTot > 0 ? "" : " ";
      rows += "<tr data-ln='" + ln + "'>" +
        "<td class='ws-line'>" + ln + "</td>" +
        "<td style='text-align:left'>" + bar + "</td>" +
        "<td class='tot'>" + fmt(dayTot) + "</td>" +
        "<td class='nm'>" + fmt(s.day ? s.day.norm : null) + "</td>" +
        "<td class='ot'>" + fmt(s.day ? s.day.ot : null) + "</td>" +
        "<td class='tot' title='" + ntTip + "'>" + (ntTot > 0 ? fmt(ntTot) : "--") + (ntOt > 0 ? "<span style='color:#e3b341;font-size:10px'> +OT" + fmt(ntOt) + "</span>" : "") + "</td>" +
        "<td><input class='hc' type='number' min='0' placeholder='0' value='" + (hc.n || "") + "' data-f='normal_hc'></td>" +
        "<td><input class='hc' type='number' min='0' placeholder='0' value='" + (hc.o || "") + "' data-f='ot_hc'></td>" +
        "<td class='ppl'>" + (dayP === null && otP === null ? "--" : (dayP === null ? "--" : dayP.toFixed(1)) + " / " + (otP === null ? "--" : otP.toFixed(1))) + "</td></tr>";
    });
    rows += "<tr class='sum'><td class='ws-line' colspan='2'>合计 (" + g.lines.length + " 线)</td><td>" + fmt(sd.dayTotal) + "</td><td>" + fmt(sd.dayNorm) + "</td><td>" + fmt(sd.dayOt) +
      "</td><td>" + fmt(sd.ntTotal) + "</td><td>" + (dN || "") + "</td><td>" + (dO || "") +
      "</td><td class='ppl'>" + (dN ? (sd.dayNorm / dN).toFixed(1) : "--") + " / " + (dO ? (sd.dayOt / dO).toFixed(1) : "--") + "</td></tr>";
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
