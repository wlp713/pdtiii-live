/* ============================================================
 * 车间产出分析页 v6 - 效率仪表盘 (独立模块, 零侵入主看板)
 * 叙事主线: 「加班到底值不值」 → 加班人均小时效率 vs 正常人均小时效率
 *
 * 口径(用户 2026-09-02 确认):
 *   白班 8:00-20:20 | 正常 ≤17:20 | 加班 17:20-20:20 (净3.0h)
 *   夜班 20:30-次日8:00 | 正常 20:30-5:50(净8.17h) | 加班 5:50-7:50(净2.0h)
 *   v7 人均效率口径(用户 2026-09-03 确认):
 *     正常效率 = 正常产出 ÷ 正常出勤人数 ÷ 8h
 *     白班加班效率 = 白班加班产出 ÷ 白班加班人数 ÷ 3h
 *     夜班加班效率 = 夜班加班产出 ÷ 夜班加班人数 ÷ 2h
 *   人数: 车间级 4 字段 → analysis/hc/{date}.json, 页面内填写并跨端实时同步
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
    { ws: "Pro.4", tag: "", lines: ["C-Shaft Body A", "C-Shaft Body B", "C-Shaft Pin A", "C-Shaft Pin C", "C-Shft Pin B", "Piston Grinding", "Rod Pispin", "Frame Honing FL"] },
    { ws: "Pro.5", tag: "", lines: ["Piston honing FL", "Cylinder Honing"] },
    { ws: "Pro.6", tag: "", lines: [] }
  ];
  var WS_ACC = { "Pro.1": "#3fb950", "Pro.2": "#58a6ff", "Pro.3": "#d29922", "Pro.4": "#bc8cff", "Pro.5": "#39c5cf", "Pro.6": "#f778ba" };
  var WS_MAP_LINES = 0; WS_MAP.forEach(function (g) { WS_MAP_LINES += g.lines.length; }); // 应有线体数(34): 空车间不算
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
  var EFF_HOURS = { dN: 8, dO: 3, nN: 8, nO: 2 };
  var fmt = function (n) {
    if (n === null || n === undefined || isNaN(n)) return "--";
    return Math.round(n).toLocaleString("en-US");
  };

  /* 单线聚合: 返回各窗口末点累计 → 产出(件) */
  function aggLine(arr, fmt) {
    var raw = arr || [];
    /* ★ 2026-09-03 Codex §8.1: 桶格式优先级 = 显式参数(历史文件自身) > state.fmt(当前日期 load 读到的
       hourlyFormat 字段) > 启发式推断(新 HHMM 凌晨桶 0/10/../50 转 int 后 <100, 启发式只认 8~17 小时值) */
    var oldFmt;
    if (fmt === "hour") oldFmt = true;
    else if (fmt === "HHMM") oldFmt = false;
    else if (state.fmt === "hour") oldFmt = true;
    else if (state.fmt === "HHMM") oldFmt = false;
    else oldFmt = raw.some(function (p) { var h = Number(p.h); return h >= 8 && h <= 17 && h !== 10; });
    var pts = [];
    raw.forEach(function (p) {
      var m = h2m(p.h, oldFmt);
      if (m === null) return;
      pts.push({ m: m, a: Number(p.actual) || 0, p: Number(p.plan) || 0 });
    });
    pts.sort(function (x, y) { return x.m - y.m; });
    var res = { dayNorm: 0, dayOt: 0, nLive: 0, nNorm: 0, nOt: 0, planN: 0, hasDay: false, hasNight: false, lastDpM: null, lastNpM: null, lastTpM: null };
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
    /* 凌晨 0:00-7:59 段(归前一夜班; 5:50 前=夜班正常, 5:50 后=夜班OT) */
    var tp = pts.filter(function (x) { return x.m < DAY_START; });
    if (tp.length) {
      res.hasNight = true;
      res.lastTpM = tp[tp.length - 1].m;   /* 凌晨段末桶分钟 (夜班 OT 时长基准) */
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
  function aggWs(wsMap, fmt) {
    function zero() {
      return { dN: 0, dO: 0, nL: 0, nN: 0, nO: 0, dayL: 0, nightL: 0, lines: 0, dOtL: 0, dOtN: 0, nOtL: 0, nOtN: 0, planN: 0, lastDpM: null, lastTpM: null };
    }
    var out = {}, tot = zero();
    WS_MAP.forEach(function (g) { out[g.ws] = zero(); });
    Object.keys(wsMap).forEach(function (rawName) {
      var std = NORM2WS[normN(rawName)];
      if (!std) return;
      var ws = LINE2WS[std]; if (!ws) return;
      var s = aggLine(wsMap[rawName], fmt);
      var g = out[ws];
      g.dN += s.dayNorm; g.dO += s.dayOt; g.nL += s.nLive; g.nN += s.nNorm; g.nO += s.nOt;
      g.planN += s.planN;
      g.lines++;
      if (s.hasDay) g.dayL++;
      if (s.hasNight) g.nightL++;
      if (s.lastDpM !== null && s.lastDpM > (g.lastDpM || 0)) g.lastDpM = s.lastDpM;
      if (s.lastTpM !== null && s.lastTpM > (g.lastTpM || 0)) g.lastTpM = s.lastTpM;
      if (s.dayOt > 0) { g.dOtL++; g.dOtN += s.dayNorm; }        /* 这条线今晚加了班 → 计入同批线集 */
      if (s.nOt > 0) { g.nOtL++; g.nOtN += s.nNorm; }           /* 这条线凌晨加了班 */
    });
    WS_MAP.forEach(function (g) {
      var a = out[g.ws];
      tot.dN += a.dN; tot.dO += a.dO; tot.nL += a.nL; tot.nN += a.nN; tot.nO += a.nO;
      tot.lines += a.lines; tot.dayL += a.dayL; tot.nightL += a.nightL;
      tot.dOtL += a.dOtL; tot.dOtN += a.dOtN; tot.nOtL += a.nOtL; tot.nOtN += a.nOtN;
      tot.planN += a.planN;
      if (a.lastDpM !== null && a.lastDpM > (tot.lastDpM || 0)) tot.lastDpM = a.lastDpM;
      if (a.lastTpM !== null && a.lastTpM > (tot.lastTpM || 0)) tot.lastTpM = a.lastTpM;
    });
    return { ws: out, tot: tot };
  }

  /* ★ v10.2 Firebase key 安全化: RTDB key 禁止 . # $ / [ ] - 车间名 Pro.1~Pro.6 含点号导致 400.
     方案: 车间名 ↔ 云端固定别名(ws1..ws6) 双向映射, 云端用别名做 key, 本地 state.hc 仍用原名 */
  var HC_ALIAS = {}, HC_ALIAS_R = {};
  WS_MAP.forEach(function (g, i) { var a = "ws" + (i + 1); HC_ALIAS[g.ws] = a; HC_ALIAS_R[a] = g.ws; });
  function hcKey(ws) { return HC_ALIAS[ws] || ws; }
  function hcUnkey(k) { return HC_ALIAS_R[k] || k; }
  /* 云端节点(别名key) → 本地(原名key) */
  function hcLoadMap(j) {
    var out = {}, k;
    if (!j || typeof j !== "object") return out;
    for (k in j) if (Object.prototype.hasOwnProperty.call(j, k)) out[hcUnkey(k)] = j[k];
    return out;
  }
  var hcSaving = 0; /* 保存中的车间计数: 轮询/同步期间跳过覆盖, 防"填了就消失" */
  function loadHC(date, cb) {
    /* promise 风格(load 内 Promise.all 用) + cb 可选(pollHC 用) */
    return fetch(HC_URL + "/" + date + ".json?t=" + Date.now(), { signal: AbortSignal.timeout(6000) })
      .then(function (r) { return r.json(); })
      .then(function (j) { var out = hcLoadMap(j); if (cb) cb(out); return out; })
      .catch(function () { if (cb) cb({}); return {}; });
  }
  function saveHC(date, ws, hc, cb) {
    /* 按车间写入(别名key), 避免两台设备同时填写不同车间时互相覆盖 */
    hcSaving++;
    fetch(HC_URL + "/" + date + "/" + hcKey(ws) + ".json", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(hc), signal: AbortSignal.timeout(8000) })
      .then(function (r) { hcSaving = Math.max(0, hcSaving - 1); cb && cb(r.ok); })
      .catch(function () { hcSaving = Math.max(0, hcSaving - 1); cb && cb(false); });
  }

  /* ═══════════ CSS ═══════════ */
  var css = [
/* Codex UI: 设计令牌 - 颜色/间距/圆角统一到 #anaRoot 作用域 (与主看板同一视觉基线) */
"#anaRoot{--ana-bg:#e6ecf3;--ana-surface:#ffffff;--ana-surface-2:#f1f5f9;--ana-border:#e2e8f0;--ana-border-strong:#cbd5e1;--ana-text:#1e293b;--ana-text-muted:#5b6b7e;--ana-text-dim:#7a8794;--ana-blue:#2b5cbf;--ana-green:#1c7a3f;--ana-orange:#9a4a14;--ana-red:#dc2626;--ana-radius-sm:6px;--ana-radius-md:10px;--ana-radius-lg:12px;--ana-gap-1:8px;--ana-gap-2:12px;--ana-gap-3:16px;--ana-gap-4:24px}",
"#anaRoot{position:fixed;inset:0;z-index:9999;overflow-y:auto;background:#e6ecf3;color:#1f2a37;",
"font-family:'Segoe UI','Microsoft YaHei','PingFang SC',sans-serif;font-size:12.5px;padding:0 clamp(14px,2vw,34px) 36px;scrollbar-gutter:stable}",
"#anaRoot *{box-sizing:border-box;margin:0;padding:0}",
"#anaRoot ::-webkit-scrollbar{width:10px;height:10px}",
"#anaRoot ::-webkit-scrollbar-track{background:transparent}",
"#anaRoot ::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:6px;border:2px solid transparent}",
"#anaRoot ::-webkit-scrollbar-thumb:hover{background:#94a3b8}",
"#anaRoot input[type=date]{background:#ffffff;color:#1f2a37;border:1px solid rgba(30,41,59,.12);border-radius:8px;padding:5px 10px;",
"font-size:12px;color-scheme:light;font-family:inherit;height:30px;transition:border-color .15s, box-shadow .15s}",
"#anaRoot input[type=date]:focus{border-color:#2b5cbf;outline:none;box-shadow:0 0 0 3px rgba(43,92,191,.18)}",
".ana-in{max-width:1560px;margin:0 auto;width:100%}",
".ic{width:32px;height:32px;border-radius:10px;border:1px solid rgba(30,41,59,.12);background:rgba(30,41,59,.02);color:#5b6b7e;",
"font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0}",
".ic:hover{border-color:#2b5cbf;color:#2b5cbf;background:rgba(43,92,191,.1);transform:translateX(-1px)}",
"#anaBack{margin-right:2px}",
".tt{font-size:11px;color:#64748b}",
".ana-top{display:flex;align-items:center;gap:14px;padding:14px 2px 13px;position:sticky;top:0;z-index:20;",
"background:linear-gradient(180deg,#fff 78%,rgba(0,0,0,0));border-bottom:1px solid rgba(30,41,59,.06);margin-bottom:16px;backdrop-filter:blur(0)}",
".ana-top h1{font-size:19px;font-weight:800;letter-spacing:.4px;display:flex;align-items:center;gap:10px;color:#1e293b}",
".ana-top h1 .cnt{font-size:10.5px;font-weight:700;color:#64748b;border:1px solid rgba(30,41,59,.10);border-radius:20px;padding:3px 10px;font-variant-numeric:tabular-nums}",
".ana-rt{margin-left:auto;display:flex;align-items:center;gap:12px}",
"#anaStatus{display:inline-flex;align-items:center;gap:7px;font-size:11px;color:#64748b;white-space:nowrap}",
"#anaStatus .dot{width:7px;height:7px;border-radius:50%;background:#1c7a3f;box-shadow:0 0 8px rgba(28,122,63,.65)}",
"#anaStatus.st-ok .dot{animation:anaPulse 1.8s ease-in-out infinite}",
"#anaStatus.st-err .dot{background:#dc2626;box-shadow:0 0 8px rgba(220,38,38,.6)}",
"#anaStatus.st-idle .dot{background:#cbd5e1;box-shadow:none}",
"@keyframes anaPulse{0%,100%{box-shadow:0 0 3px rgba(28,122,63,.4)}50%{box-shadow:0 0 10px rgba(28,122,63,.85)}}",
".subrow{display:flex;align-items:center;gap:10px;padding:0 2px 12px}",
".chips{display:inline-flex;background:#ffffff;border:1px solid rgba(30,41,59,.09);border-radius:12px;padding:3px;gap:2px}",
".chips button{border:0;background:transparent;color:#64748b;font-size:12px;font-weight:600;padding:6px 18px;border-radius:9px;cursor:pointer;font-family:inherit;transition:all .15s;letter-spacing:.3px}",
".chips button.on{background:#e8edf4;color:#1e293b;box-shadow:inset 0 0 0 1px rgba(30,41,59,.08),0 1px 4px rgba(15,23,42,.18)}",
".chips button:hover:not(.on){color:#1f2a37;background:rgba(30,41,59,.045)}",
"#vsBand{display:flex;align-items:stretch;gap:0;margin-bottom:14px;border:1px solid rgba(30,41,59,.09);border-radius:18px;background:#ffffff;overflow:hidden}",
".vs-side{flex:1;padding:16px 22px 15px;display:flex;flex-direction:column;justify-content:center;gap:2px;min-width:0;position:relative}",
".vs-side:first-child{border-right:1px solid rgba(30,41,59,.07)}",
".vs-side .lb{font-size:12.5px;color:#5b6b7e;font-weight:600;display:flex;align-items:center;gap:8px}",
".vs-side .lb .tag{font-size:10px;font-weight:700;padding:2px 9px;border-radius:20px;background:rgba(43,92,191,.14);color:#3b82f6;letter-spacing:.2px}",
".vs-side.ot .lb .tag{background:rgba(202,138,4,.16);color:#9a4a14}",
".vs-side .num{font-size:38px;font-weight:800;letter-spacing:.6px;font-variant-numeric:tabular-nums;line-height:1.1;color:#1e293b;margin:2px 0 1px}",
".vs-side .num small{font-size:12.5px;font-weight:600;color:#7a8794;margin-left:6px;letter-spacing:0}",
".vs-side .sb{font-size:10.5px;color:#8494a8;font-variant-numeric:tabular-nums}",
".vs-side .sb b{color:#64748b;font-weight:700}",
".vs-mid{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0 24px;gap:8px;min-width:190px}",
".vs-side.ot{border-left:1px solid rgba(30,41,59,.07)}",
".vs-mid .vsw{font-size:10px;font-weight:800;color:#8494a8;letter-spacing:2.5px;text-transform:uppercase}",
"#diffChip{display:inline-flex;align-items:center;gap:6px;font-size:13.5px;font-weight:800;padding:7px 16px;border-radius:20px;font-variant-numeric:tabular-nums;letter-spacing:.2px}",
"#diffChip.good{background:rgba(28,122,63,.13);color:#1c7a3f;border:1px solid rgba(28,122,63,.4);box-shadow:0 0 18px rgba(28,122,63,.12)}",
"#diffChip.bad{background:rgba(220,38,38,.11);color:#dc2626;border:1px solid rgba(220,38,38,.38);box-shadow:0 0 18px rgba(220,38,38,.1)}",
"#diffChip.flat{background:rgba(30,41,59,.035);color:#64748b;border:1px solid rgba(30,41,59,.1)}",
".card{background:linear-gradient(180deg,#ffffff 0%,#ffffff 100%);border:1px solid rgba(30,41,59,.08);border-radius:16px;padding:14px 16px 8px;min-width:0;margin-bottom:14px}",
".grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:0}",
".grid2 .card{margin-bottom:0}",
"#anaRoot .card:last-of-type{margin-bottom:14px}",
".card h3{font-size:12px;color:#5b6b7e;font-weight:700;letter-spacing:.6px;display:flex;align-items:center;gap:8px;margin-bottom:8px;min-height:16px}",
".card h3 .pl{width:8px;height:8px;border-radius:2.5px;flex-shrink:0}",
".card .hint-r{margin-left:auto;display:flex;align-items:center;gap:12px;font-size:10px;color:#7a8794;font-weight:500;letter-spacing:.2px}",
".card .hint-r .lg{display:inline-flex;align-items:center;gap:5px}",
".card .hint-r .lg i{width:9px;height:9px;border-radius:2.5px;display:inline-block}",
".card canvas{width:100%;display:block}",
".empty-tip{color:#94a3b8;font-size:11.5px;padding:20px 0 22px;text-align:center;letter-spacing:.4px;line-height:1.7}",
".bar-list{display:flex;flex-direction:column;gap:4px;padding:8px 2px 10px}",
".brow{display:flex;align-items:center;gap:12px;padding:4px 0;font-variant-numeric:tabular-nums}",
".brow .nm{width:52px;font-size:12.5px;font-weight:800;color:#1f2a37;flex-shrink:0;letter-spacing:.2px}",
".brow .barw{flex:1;min-width:0;display:flex;align-items:center;gap:10px}",
".brow .hb{flex:1;height:11px;background:#eef2f7;border-radius:6px;overflow:hidden;display:flex;box-shadow:inset 0 1px 2px rgba(15,23,42,.18)}",
".brow .hb span{height:100%}",
".brow .pc{width:58px;text-align:right;font-size:12px;font-weight:800;color:#9a4a14;flex-shrink:0;white-space:nowrap}",
".brow .pc.off{color:#94a3b8;font-weight:600}",
".brow .num{width:74px;text-align:right;font-size:11.5px;color:#64748b;flex-shrink:0}",
"#fillPanel{border:1px solid rgba(30,41,59,.09);border-radius:16px;background:linear-gradient(180deg,#ffffff 0%,#ffffff 100%);overflow:hidden;margin-top:14px}",
"#fillHead{display:flex;align-items:center;gap:10px;padding:13px 16px;cursor:pointer;user-select:none;transition:background .15s}",
"#fillHead:hover{background:rgba(30,41,59,.02)}",
"#fillHead h3{font-size:12.5px;color:#5b6b7e;font-weight:700;letter-spacing:.5px;display:flex;align-items:center;gap:8px}",
"#fillHead .ch{width:8px;height:8px;border-right:2px solid #64748b;border-bottom:2px solid #64748b;transform:rotate(45deg);transition:transform .2s;margin-top:-3px}",
"#fillPanel.open #fillHead .ch{transform:rotate(-135deg);margin-top:3px}",
"#fillHead .note{margin-left:auto;font-size:10.5px;color:#8494a8}",
"#fillBody{display:none;padding:2px 12px 14px}",
"#fillPanel.open #fillBody{display:block}",
".table-scroll{overflow-x:auto;border:1px solid rgba(30,41,59,.07);border-radius:12px}",
"table#anaTable{width:100%;border-collapse:collapse;font-size:12px;font-variant-numeric:tabular-nums;min-width:0;table-layout:fixed}",
"#anaTable th{text-align:right;padding:7px 12px;color:#7a8794;font-weight:600;font-size:10.5px;border-bottom:1px solid rgba(30,41,59,.08);white-space:nowrap;letter-spacing:.3px}",
"#anaTable thead tr:first-child th{border-bottom:1px solid rgba(30,41,59,.07);background:rgba(30,41,59,.02);font-size:10px;color:#64748b;letter-spacing:.5px}",
"#anaTable th:first-child,#anaTable td:first-child{text-align:left}",
"#anaTable td{padding:8px 12px;border-bottom:1px solid rgba(30,41,59,.055);text-align:right;white-space:nowrap}",
"#anaTable tr:last-child td{border-bottom:0}",
"#anaTable tbody tr:hover td{background:rgba(30,41,59,.025)}",
"#anaTable .nmw{font-weight:800;font-size:13.5px;color:#1e293b;letter-spacing:.2px}",
"#anaTable .nmw small{color:#7a8794;font-size:9.5px;font-weight:600;margin-left:7px}",
"#anaTable .g{color:#2b5cbf;font-weight:700}",
"#anaTable .o{color:#9a4a14;font-weight:700}",
"#anaTable .ng{color:#64748b;font-weight:400}",
"#anaTable .tot-r{font-weight:800;color:#1e293b}",
"#anaTable td.pc2{color:#94a3b8;font-size:11px}",
"#anaTable tr.s-row td{border-top:1px solid rgba(30,41,59,.1);font-weight:800;background:rgba(43,92,191,.055)}",
"#anaTable tr.s-row:hover td{background:rgba(43,92,191,.075)}",
"input.hc{width:64px;height:27px;background:#ffffff;color:#1f2a37;border:1px solid rgba(30,41,59,.12);border-radius:7px;padding:0 4px;",
"font-size:12.5px;text-align:center;font-variant-numeric:tabular-nums;font-family:inherit;transition:border-color .15s, box-shadow .15s}",
"input.hc:focus{border-color:#2b5cbf;outline:none;box-shadow:0 0 0 3px rgba(43,92,191,.15)}",
"input.hc:hover:not(:focus){border-color:rgba(30,41,59,.22)}",
"input.hc::placeholder{color:#cbd5e1}",
".ana-state{display:flex;flex-direction:column;align-items:center;gap:14px;padding:80px 0;color:#64748b;font-size:13px;letter-spacing:.3px}",
".spinner{width:24px;height:24px;border-radius:50%;border:2px solid #cbd5e1;border-top-color:#2b5cbf;animation:anaSpin .7s linear infinite}",
"@keyframes anaSpin{to{transform:rotate(360deg)}}",
"@media (max-width:1100px){.grid2{grid-template-columns:1fr}.vs-mid{min-width:150px;padding:0 14px}}",
"@media (max-width:760px){#vsBand{flex-direction:column}.vs-side:first-child{border-right:0;border-bottom:1px solid rgba(30,41,59,.07)}.vs-side.ot{border-left:0;border-top:1px solid rgba(30,41,59,.07)}.vs-mid{padding:12px;flex-direction:row;min-width:0}.ana-top{flex-wrap:wrap}}",
"#otEmpty{cursor:pointer;transition:color .15s}",
"#otEmpty:hover{color:#64748b}",
"#vsVerdict{display:none;margin:-6px 0 14px;padding:11px 16px;border-radius:12px;background:rgba(43,92,191,.06);border:1px solid rgba(43,92,191,.22);color:#475569;font-size:12.5px;line-height:1.8}",
"#vsVerdict.show{display:block}",
"#vsVerdict b{color:#1e293b;font-weight:800}",
"#vsVerdict .k{color:#9a4a14;font-weight:800}",
"#vsVerdict .ok{color:#1c7a3f;font-weight:800}",
"#detailList{overflow-x:auto}",
".dgrid{display:grid;grid-template-columns:minmax(190px,2.1fr) repeat(7,minmax(78px,1fr)) minmax(126px,1.5fr);align-items:center;gap:0;font-variant-numeric:tabular-nums}",
".dh{padding:8px 14px;color:#7a8794;font-size:10.5px;font-weight:600;letter-spacing:.3px;border-bottom:1px solid rgba(30,41,59,.08)}",
".dh>div{text-align:right;padding:0 6px;white-space:nowrap}",
".dh>div:first-child{text-align:left;padding-left:8px}",
".wsrow{padding:9px 14px;border-bottom:1px solid rgba(30,41,59,.055);cursor:pointer;user-select:none;background:linear-gradient(90deg,rgba(30,41,59,.015),transparent)}",
".wsrow:hover{background:rgba(43,92,191,.05)}",
".wsrow .nm{display:flex;align-items:center;gap:8px;font-weight:800;color:#1e293b;font-size:13px;min-width:0}",
".wsrow .acc{width:0;height:0;border-left:5px solid #64748b;border-top:4px solid transparent;border-bottom:4px solid transparent;transition:transform .18s;flex-shrink:0}",
".wsrow.open .acc{transform:rotate(90deg)}",
".cnt{font-size:10px;font-weight:700;color:#64748b;background:rgba(30,41,59,.07);border-radius:20px;padding:2px 9px;letter-spacing:.2px;white-space:nowrap}",
".lrow{padding:7px 14px 7px 44px;border-bottom:1px solid rgba(30,41,59,.035);font-size:12px;cursor:default}",
".lrow:hover{background:rgba(30,41,59,.018)}",
".lrow .nm{color:#3f4c5e;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}",
".trow{padding:11px 14px;font-weight:800;background:rgba(43,92,191,.07);border-top:1px solid rgba(43,92,191,.18)}",
".trow .nm{color:#2b5cbf}",
".vl{text-align:right;padding:0 6px;white-space:nowrap;font-size:12px;color:#334155}",
".v-n{color:#3b82f6}",
".v-o{color:#9a4a14}",
".v-0{color:#94a3b8}",
".trow .vl{color:#1f2a37;font-weight:800}",
".st-tag{display:inline-flex;align-items:center;justify-content:flex-end;gap:5px;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:.3px;white-space:nowrap;justify-self:end}",
".st-tag i{width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0}",
".st-ot{background:rgba(202,138,4,.13);color:#9a4a14;border:1px solid rgba(202,138,4,.35)}",
".st-now{background:rgba(43,92,191,.12);color:#2b5cbf;border:1px solid rgba(43,92,191,.35)}",
".st-now i{animation:tagPulse 1.6s ease-in-out infinite}",
".st-no{background:rgba(30,41,59,.045);color:#64748b;border:1px solid rgba(30,41,59,.1)}",
".st-none{background:transparent;color:#94a3b8;border:1px dashed rgba(30,41,59,.09)}",
".st-mid{background:rgba(91,47,160,.13);color:#5b2fa0;border:1px solid rgba(91,47,160,.35)}",
"@keyframes tagPulse{0%,100%{opacity:.45}50%{opacity:1}}",
".diff-u{font-weight:800;font-size:12px;text-align:right;padding:0 6px}",
".diff-u.good{color:#1c7a3f}",
".diff-u.bad{color:#dc2626}",
".diff-u.flat{color:#64748b}",
".rate-chip{display:inline-block;font-size:11px;font-weight:800;padding:3px 11px;border-radius:20px;letter-spacing:.2px;white-space:nowrap;justify-self:end;text-align:center}",
".rate-chip.g{background:rgba(28,122,63,.13);color:#1c7a3f;border:1px solid rgba(28,122,63,.35)}",
".rate-chip.b{background:rgba(43,92,191,.12);color:#3b82f6;border:1px solid rgba(43,92,191,.35)}",
".rate-chip.y{background:rgba(202,138,4,.13);color:#9a4a14;border:1px solid rgba(202,138,4,.35)}",
".rate-chip.x{background:rgba(30,41,59,.035);color:#7a8794;border:1px solid rgba(30,41,59,.09)}",
".footnote{margin-top:-6px;padding:9px 14px 12px;color:#8494a8;font-size:10.5px;line-height:1.8;letter-spacing:.2px;border-top:1px dashed rgba(30,41,59,.08)}",
".footnote b{color:#64748b}",
".chips-sm{transform:scale(.92);transform-origin:left center}",
".fill-ot{padding:2px 0 2px;margin-bottom:8px;border-bottom:1px dashed rgba(30,41,59,.08)}",
".fill-ot .fh3{font-size:11.5px;color:#5b6b7e;font-weight:700;display:flex;align-items:center;gap:8px;margin-bottom:2px}",
".fill-ot .fh3 .pl{width:8px;height:8px;border-radius:2.5px;flex-shrink:0}",
".fill-ot .fh3 .lg{display:inline-flex;align-items:center;gap:5px;font-size:10px;color:#7a8794;font-weight:500;margin-left:10px}",
".fill-ot .fh3 .lg i{width:9px;height:9px;border-radius:2.5px;display:inline-block}",
".fill-ot canvas{width:100%;height:150px}",
".sub-hint{margin-left:auto;font-size:10px;color:#8494a8;letter-spacing:.2px;white-space:nowrap}",
".lbox{display:none}",
".wsrow.open+.lbox{display:block}",
/* ═══════ Codex UI 覆盖层: 令牌落地 + 布局重排 + 状态样式 (v10) ═══════ */
"#anaRoot{background:var(--ana-bg);color:var(--ana-text)}",
"#anaRoot .ana-in{max-width:1680px;margin:0 auto;width:100%}",
"#anaRoot .ana-top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:14px;padding:13px 2px 12px;background:rgba(248,250,252,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--ana-border);margin-bottom:var(--ana-gap-3)}",
"#anaRoot .ana-top h1{font-size:21px;color:var(--ana-text)}",
"#anaRoot .ic{width:36px;height:36px;border-radius:var(--ana-radius-sm);border:1px solid var(--ana-border);color:var(--ana-text-muted);background:var(--ana-surface)}",
"#anaRoot .ic:hover{border-color:var(--ana-blue);color:var(--ana-blue);background:rgba(43,92,191,.08)}",
"#anaRoot .chips{background:var(--ana-surface);border:1px solid var(--ana-border);border-radius:10px}",
"#anaRoot .chips button{min-height:32px;color:var(--ana-text-muted)}",
"#anaRoot .chips button.on{background:rgba(43,92,191,.14);color:var(--ana-text);box-shadow:inset 0 0 0 1px rgba(43,92,191,.55)}",
"#anaRoot .chips button:focus-visible,.ic:focus-visible,#anaRoot button:focus-visible,#anaRoot input[type=date]:focus-visible{outline:2px solid var(--ana-blue);outline-offset:2px}",
/* vsBand 三段式对比: 中性表面 + 状态色只给中间差异 */
"#vsBand{display:grid;grid-template-columns:1fr auto 1fr;background:var(--ana-surface);border:1px solid var(--ana-border);border-radius:var(--ana-radius-lg);box-shadow:0 8px 24px rgba(15,23,42,.08);margin-bottom:var(--ana-gap-2);overflow:hidden}",
"#vsBand .vs-side{background:var(--ana-surface);border:0;padding:16px 22px 15px}",
"#vsBand .vs-side:first-child{border-right:1px solid var(--ana-border)}",
"#vsBand .vs-side.ot{border-left:1px solid var(--ana-border)}",
"#vsBand .vs-mid{background:var(--ana-surface);border:0;min-width:0;padding:0 20px}",
"#vsBand .vs-side .lb{color:var(--ana-text-muted)}",
"#vsBand .vs-side .num{color:var(--ana-text);font-size:34px}",
"#vsBand .vs-side .num small{color:var(--ana-text-dim)}",
"#vsBand .vs-side .sb{color:var(--ana-text-dim)}",
"#vsBand .vs-side .sb b{color:var(--ana-text-muted)}",
"#diffChip{background:rgba(30,41,59,.045);border:1px solid var(--ana-border-strong);color:var(--ana-text-muted)}",
"#diffChip.good{background:rgba(28,122,63,.12);border-color:rgba(28,122,63,.5);color:#1c7a3f}",
"#diffChip.bad{background:rgba(220,38,38,.1);border-color:rgba(220,38,38,.45);color:#dc2626}",
/* 独立结论行: 全宽 + 状态色左边线 */
"#vsVerdict{display:none;margin:0 0 var(--ana-gap-2);padding:12px 18px;border-radius:var(--ana-radius-md);background:var(--ana-surface-2);border:1px solid var(--ana-border-strong);border-left:3px solid var(--ana-blue);color:var(--ana-text-muted);font-size:13px;line-height:1.9}",
"#vsVerdict.show{display:block}",
"#vsVerdict b{color:var(--ana-text);font-weight:800}",
"#vsVerdict .k{color:var(--ana-orange);font-weight:800}",
"#vsVerdict .ok{color:#1c7a3f;font-weight:800}",
"#vsVerdict .bad{color:#dc2626;font-weight:800}",
/* 卡片统一: 一级表面 + 令牌圆角 */
"#anaRoot .card{background:var(--ana-surface);border:1px solid var(--ana-border);border-radius:var(--ana-radius-lg);box-shadow:0 8px 24px rgba(15,23,42,.07);padding:16px 18px 10px;margin-bottom:0}",
"#anaRoot .card h3{color:var(--ana-text-muted);font-size:13px}",
"#anaRoot .card .hint-r{color:var(--ana-text-dim)}",
/* 车间明细: 卡片标题行 + 数量 */
"#wsDetail .hint-r .ws-count{display:inline-flex;align-items:center;color:var(--ana-text-muted);font-weight:700}",
"#anaTable th{color:var(--ana-text-dim)}",
"#anaTable tbody tr{height:46px}",
"#anaTable tbody tr:nth-child(even) td{background:rgba(30,41,59,.015)}",
"#anaTable td,.dgrid>div{font-variant-numeric:tabular-nums}",
/* 展开行动画 */
".wsrow,.lbox{transition:background .18s}",
".lbox{animation:anaFadeIn .16s ease}",
"@keyframes anaFadeIn{from{opacity:0}to{opacity:1}}",
/* 双栏: 趋势 | 人员投入 */
".ana-lower-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:var(--ana-gap-3);align-items:stretch;margin-bottom:var(--ana-gap-2)}",
"#fillPanel{margin-top:0;background:var(--ana-surface);border:1px solid var(--ana-border);border-radius:var(--ana-radius-lg);box-shadow:0 8px 24px rgba(15,23,42,.07);display:flex;flex-direction:column;overflow:hidden}",
"#fillPanel #fillHead{padding:15px 18px;border-bottom:1px solid transparent}",
"#fillPanel.open #fillHead{border-bottom-color:var(--ana-border)}",
"#fillPanel #fillHead h3{color:var(--ana-text-muted);font-size:13px}",
"#fillPanel #fillBody{padding:4px 14px 14px;flex:1}",
"#hcModal .table-scroll{margin:0 auto 14px;max-width:1120px;border:1px solid var(--ana-border);border-radius:var(--ana-radius-sm)}",
"#hcModal #anaTable{min-width:0;table-layout:fixed}",
"#hcModal input.hc{width:64px;height:30px;background:var(--ana-surface-2);border-color:var(--ana-border-strong)}",
/* 口径说明: 可折叠 details */
"#anaRoot .footnote{display:block;margin:4px 0 0;padding:0;border:1px solid var(--ana-border);border-radius:var(--ana-radius-md);background:var(--ana-surface);font-size:12px;line-height:1.85;color:var(--ana-text-dim)}",
"#anaRoot .footnote summary{cursor:pointer;user-select:none;padding:11px 16px;color:var(--ana-text-muted);font-weight:700;font-size:12.5px;letter-spacing:.3px;display:flex;align-items:center;gap:8px;list-style:none}",
"#anaRoot .footnote summary::-webkit-details-marker{display:none}",
"#anaRoot .footnote summary::before{content:'▸';color:var(--ana-text-dim);font-size:11px;transition:transform .18s}",
"#anaRoot .footnote[open] summary::before{transform:rotate(90deg)}",
"#anaRoot .footnote .fn-body{padding:0 16px 13px;border-top:1px solid var(--ana-border)}",
"#anaRoot .footnote b{color:var(--ana-text-muted)}",
"#anaRoot .footnote summary:hover{color:var(--ana-text)}",
"#anaRoot .footnote summary:focus-visible{outline:2px solid var(--ana-blue);outline-offset:-2px;border-radius:var(--ana-radius-sm)}",
/* 加载/空/延迟/错误 状态 (沿用 v9 语义 + 令牌) */
"#anaRoot .ana-state .spinner{border-color:var(--ana-border);border-top-color:var(--ana-blue)}",
"#anaRoot .empty-tip{color:var(--ana-text-dim);font-size:12px;padding:24px 0}",
"#anaStatus.st-warn .dot{background:var(--ana-orange);box-shadow:0 0 8px rgba(202,138,4,.55)}",
"#anaStatus.st-warn #anaStatusTxt{color:#9a4a14}",
"#anaStatus.st-err #anaStatusTxt{color:#dc2626}",
"#otEmpty{color:var(--ana-text-dim)}",
/* 响应式断点 */
"@media (max-width:1100px){.ana-lower-grid{grid-template-columns:1fr;gap:var(--ana-gap-2)}#fillPanel{min-height:0}}",
"@media (max-width:760px){#anaRoot{padding:0 12px 28px}.ana-top{flex-wrap:wrap;gap:10px}.ana-top h1{width:auto}.ana-rt{margin-left:auto}#vsBand{grid-template-columns:1fr}.vs-side:first-child{border-right:0;border-bottom:1px solid var(--ana-border)}.vs-side.ot{border-left:0;border-top:1px solid var(--ana-border)}.vs-mid{padding:10px 12px;flex-direction:row;min-width:0}.vs-mid .vsw{display:none}.subrow{flex-wrap:wrap;gap:8px}.sub-hint{margin-left:0;white-space:normal}#wsDetail .hint-r{display:none}}",
"@media (max-width:390px){#anaRoot{padding:0 10px 24px}#anaRoot h1{font-size:17px}#anaRoot .ic{width:32px;height:32px}.vs-side .num{font-size:27px}#anaRoot .chips button{padding:6px 12px;font-size:11.5px}#anaStatusTxt{max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}",
/* v7: 人均效率 KPI 卡片 */,
"#anaRoot .ana-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--ana-gap-2);margin-bottom:var(--ana-gap-2)}",
"#anaRoot .ana-kpi{min-width:0;padding:13px 15px 12px;background:var(--ana-surface);border:1px solid var(--ana-border);border-radius:var(--ana-radius-md);box-shadow:0 8px 24px rgba(15,23,42,.06)}",
"#anaRoot .ana-kpi .k-label{font-size:11px;color:var(--ana-text-muted);font-weight:700;letter-spacing:.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
"#anaRoot .ana-kpi .k-value{margin-top:6px;font-size:25px;font-weight:800;line-height:1.1;color:var(--ana-text);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
"#anaRoot .ana-kpi .k-value small{font-size:11px;color:var(--ana-text-dim);font-weight:600;margin-left:4px}",
"#anaRoot .ana-kpi .k-meta{margin-top:6px;font-size:10.5px;color:var(--ana-text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
"#anaRoot .ana-kpi.k-n .k-value{color:var(--ana-blue)}#anaRoot .ana-kpi.k-o .k-value{color:var(--ana-orange)}#anaRoot .ana-kpi.k-good .k-value{color:var(--ana-green)}#anaRoot .ana-kpi.k-warn .k-value{color:var(--ana-orange)}#anaRoot .ana-kpi.k-bad .k-value{color:var(--ana-red)}",
"@media (max-width:760px){#anaRoot .ana-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}#anaRoot .ana-kpi .k-value{font-size:22px}}",
"@media (max-width:390px){#anaRoot .ana-kpis{grid-template-columns:1fr}#anaRoot .ana-kpi .k-value{font-size:24px}}",
/* v11: 浅色主题精修 - 模块底色分层 · 精致化 */
"#anaRoot{background:linear-gradient(180deg,#e8edf5 0%,#dfe6f0 240px,#dfe6f0 100%)}",
"#anaRoot .ana-top{background:rgba(244,247,251,.9);border-bottom:1px solid rgba(30,41,59,.08)}",
"#anaRoot h1{color:#111827}",
"#anaRoot .chips{background:#e8edf4;border:1px solid transparent}",
"#anaRoot .chips button{color:#64748b}",
"#anaRoot .chips button.on{background:#fff;color:#2b5cbf;box-shadow:0 1px 4px rgba(15,23,42,.14),inset 0 0 0 1px rgba(43,92,191,.35)}",
"#anaRoot .chips button:hover:not(.on){color:#1e293b;background:rgba(255,255,255,.7)}",
"#anaRoot input[type=date]{background:#fff;border:1px solid #d7dee9;box-shadow:0 1px 2px rgba(15,23,42,.05)}",
"#anaRoot input[type=date]:focus{border-color:#2b5cbf;box-shadow:0 0 0 3px rgba(43,92,191,.15)}",
"#vsBand{background:#fff;border-color:#e5eaf1;box-shadow:0 10px 30px rgba(15,23,42,.07)}",
"#vsBand .vs-side:first-child{border-right:1px solid #eef2f7}",
"#vsBand .vs-side.ot{border-left:1px solid #eef2f7}",
"#vsBand .vs-side .lb{color:#64748b}",
"#vsBand .vs-side .num{color:#0f172a}",
"#vsBand .vs-side .num small{color:#94a3b8}",
"#vsBand .vs-side .sb{color:#94a3b8}",
"#vsBand .vs-side .sb b{color:#475569}",
"#vsBand .vs-side .lb .tag{background:rgba(43,92,191,.1);color:#2b5cbf}",
"#vsBand .vs-side.ot .lb .tag{background:rgba(168,106,31,.12);color:#c2620a}",
"#diffChip.flat{background:#f1f5f9;border-color:#e2e8f0;color:#64748b}",
"#anaRoot .ana-kpi{background:#fff;border:1px solid #e5eaf1;box-shadow:0 4px 14px rgba(15,23,42,.05);position:relative;overflow:hidden}",
"#anaRoot .ana-kpi::before{content:'';position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--ana-blue)}",
"#anaRoot .ana-kpi.k-o::before{background:#a86a1f}",
"#anaRoot .ana-kpi:nth-child(3)::before{background:#1c7a3f}",
"#anaRoot .ana-kpi:nth-child(4)::before{background:#5b2fa0}",
"#anaRoot .ana-kpi .k-label{color:#475569;font-size:10.5px}",
"#anaRoot .ana-kpi .k-value{font-size:26px}",
"#anaRoot .card{background:#fff;border:1px solid #e5eaf1;box-shadow:0 6px 20px rgba(15,23,42,.05);border-radius:14px}",
"#anaRoot .card h3{color:#334155;font-size:13.5px;font-weight:800}",
"#anaRoot .card h3 .pl{box-shadow:0 0 0 3px rgba(43,92,191,.12)}",
"#anaRoot .card .hint-r{color:#94a3b8}",
"#anaRoot .card .hint-r .lg{color:#64748b}",
"#wsDetail{border-top:3px solid #2b5cbf}",
"#fillPanel{border-top:3px solid #5b2fa0;background:#fff;box-shadow:0 6px 20px rgba(15,23,42,.05)}",
".ana-trend-card{border-top:3px solid #0a5d78}",
"#fillPanel #fillHead h3{color:#334155;font-weight:800}",
"#fillHead .note{color:#94a3b8}",
"#fillPanel #fillHead:hover{background:#f8fafc}",
"#anaRoot .footnote{background:#fff;border-color:#e5eaf1;box-shadow:0 4px 14px rgba(15,23,42,.04)}",
"#anaRoot .footnote summary{color:#475569}",
"#anaRoot .footnote .fn-body{color:#64748b;background:#f8fafc;border-radius:0 0 10px 10px}",
"#anaRoot .footnote b{color:#334155}",
"#hcModal .table-scroll{border:1px solid #e5eaf1;background:#f8fafc;border-radius:12px;overflow-x:auto}",
"#anaTable th{color:#64748b;background:#f1f5f9;border-bottom:1px solid #e2e8f0}",
"#anaTable thead tr:first-child th{background:#f1f5f9;color:#475569;border-bottom:1px solid #e2e8f0}",
"#anaTable td{border-bottom:1px solid #eef2f7;color:#334155}",
"#anaTable tbody tr:nth-child(even) td{background:#f8fafc}",
"#anaTable tbody tr:hover td{background:#eff6ff}",
"#anaTable .nmw{color:#111827}",
"#anaTable .nmw small{color:#94a3b8}",
"#anaTable .g{color:#2b5cbf}",
"#anaTable .o{color:#c2620a}",
"#anaTable .ng{color:#94a3b8}",
"#anaTable .tot-r{color:#0f172a}",
"#anaTable td.pc2{color:#b6c2cf}",
"#anaTable tr.s-row td{border-top:2px solid #2b5cbf;background:#eff6ff;color:#1e293b}",
"#anaTable tr.s-row:hover td{background:#e8f1ff}",
"input.hc{background:#fff;border:1px solid #d7dee9;color:#0f172a;box-shadow:inset 0 1px 2px rgba(15,23,42,.04)}",
"input.hc:focus{border-color:#2b5cbf;box-shadow:0 0 0 3px rgba(43,92,191,.15)}",
"input.hc:hover:not(:focus){border-color:#b6c2cf}",
"input.hc::placeholder{color:#b6c2cf}",
"input.hc:disabled{background:#f1f5f9;color:#94a3b8;cursor:not-allowed}",
"#anaTable th,#anaTable td{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
"#anaTable th:nth-child(1){width:14%;text-align:left}",
"#anaTable th:nth-child(2){width:11%}",
"#anaTable th:nth-child(3){width:11%}",
"#anaTable th:nth-child(4){width:9%}",
"#anaTable th:nth-child(5){width:9%}",
"#anaTable th:nth-child(6){width:14%}",
"#anaTable th:nth-child(7){width:14%}",
"#anaTable th:nth-child(8){width:12%}",
"#anaTable td:nth-child(1){text-align:left}",
"#anaTable td:nth-child(8){padding-right:8px}",
"#anaTable td input.hc{width:100%;min-width:44px;max-width:60px}",
".dgrid.dh{color:#64748b;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-weight:800}",
".wsrow{background:#fff;border-bottom:1px solid #eef2f7}",
".wsrow:hover{background:#f1f7ff}",
".wsrow .nm{color:#0f172a}",
".wsrow.open{background:#f8fbff}",
".lrow .nm{color:#475569}",
".trow{background:#eff6ff;border-top:1px solid #d7dee9}",
".trow .nm{color:#2b5cbf}",
".vl{color:#334155}",
".v-n{color:#2b5cbf}",
".v-o{color:#c2620a}",
".v-0{color:#b6c2cf}",
".trow .vl{color:#111827}",
"#wsDetail .hint-r .ws-count{color:#475569}",
"#detailList{border:1px solid #eef2f7;border-radius:10px}",
".rate-chip.g{background:rgba(28,122,63,.1);color:#166b32;border-color:rgba(28,122,63,.3)}",
".rate-chip.b{background:rgba(43,92,191,.08);color:#2b5cbf;border-color:rgba(43,92,191,.25)}",
".rate-chip.y{background:rgba(168,106,31,.1);color:#9a4a14;border-color:rgba(168,106,31,.3)}",
".rate-chip.x{background:#f1f5f9;color:#94a3b8;border-color:#e2e8f0}",
".st-tag.st-ot{background:rgba(168,106,31,.1);color:#9a4a14;border-color:rgba(168,106,31,.3)}",
".st-tag.st-now{background:rgba(43,92,191,.1);color:#2b5cbf;border-color:rgba(43,92,191,.3)}",
".st-tag.st-no{background:#f1f5f9;color:#64748b;border-color:#e2e8f0}",
".st-tag.st-none{color:#94a3b8;border-color:#d7dee9}",
".st-tag.st-mid{background:rgba(91,47,160,.09);color:#5b2fa0;border-color:rgba(91,47,160,.25)}",
"#vsVerdict{background:#f8fbff;border-color:#dbeafe;border-left:3px solid #2b5cbf;color:#475569}",
"#vsVerdict b{color:#0f172a}",
"#vsVerdict .k{color:#9a4a14}",
"#vsVerdict .ok{color:#166b32}",
"#vsVerdict .bad{color:#dc2626}",
".empty-tip{color:#94a3b8}",
".fill-ot{border-bottom:1px dashed #e2e8f0}",
".fill-ot .fh3{color:#475569}",
"#anaStatus .dot{background:#1c7a3f}",
"#anaStatus.st-idle .dot{background:#cbd5e1}",
"#anaStatus.st-err .dot{background:#dc2626}",
"#anaStatus.st-warn .dot{background:#a86a1f}",
"#anaStatus.st-warn #anaStatusTxt{color:#9a4a14}",
"#anaStatus.st-err #anaStatusTxt{color:#dc2626}",
"#anaRoot .sub-hint{color:#94a3b8}",
"#anaRoot .ic{background:#fff;border-color:#e2e8f0;color:#64748b}",
"#anaRoot .ic:hover{background:#eff6ff}",,
"#anaRoot .tt{color:#94a3b8}",
"#hcModal h3 .note{margin-left:auto;font-size:11px;color:#94a3b8;font-weight:500;letter-spacing:.2px}",
"#hcModal #anaTable th,#hcModal #anaTable td{white-space:nowrap}",
"#fillPanel .fill-ot .fh3{display:flex;justify-content:flex-end;gap:14px;align-items:center;font-size:11px;font-weight:600;color:#64748b;padding:6px 2px 10px}",
"#vsBand .vs-side .lb{font-size:15px;font-weight:800;color:#0f172a;letter-spacing:.4px;gap:10px}",
"#vsBand .vs-side .lb .tag{font-size:11px;font-weight:700;padding:3px 11px;background:rgba(43,92,191,.12);color:#234f9e;border-radius:20px;letter-spacing:.3px}",
"#vsBand .vs-side.ot .lb .tag{background:rgba(168,106,31,.13);color:#9a4a14}",
"#vsBand .vs-side .num{font-size:40px;font-weight:900;color:#0f172a;letter-spacing:.6px}",
"#vsBand .vs-side .num small{font-size:13px;font-weight:700;color:#64748b}",
"#vsBand .vs-side .sb{font-size:11.5px;color:#64748b}",
"#vsBand .vs-side .sb b{color:#334155;font-weight:800}",
"#vsBand .vs-side{padding:18px 26px 17px}",
"#vsBand .vs-side:first-child{background:linear-gradient(180deg,rgba(43,92,191,.05),rgba(43,92,191,0) 85%)}",
"#vsBand .vs-side.ot{background:linear-gradient(180deg,rgba(168,106,31,.05),rgba(168,106,31,0) 85%)}",
"#vsBand .vs-mid .vsw{font-size:11px;color:#475569}",
"#diffChip{font-size:14px;padding:8px 18px}",
"@keyframes tagPulse{0%,100%{opacity:.55}50%{opacity:1}}",
/* v13: 明细表网格线+行距+分组视觉提升 */
"#wsDetail{box-shadow:0 8px 26px rgba(43,92,191,.07)}",
"#wsDetail .dgrid{grid-template-columns:minmax(190px,2fr) repeat(7,minmax(88px,1fr)) minmax(150px,1.7fr)}",
"#wsDetail .wsrow{padding:12px 15px}",
"#wsDetail .wsrow .nm{font-size:13.5px}",
"#wsDetail .wsrow .cnt{background:rgba(43,92,191,.1);color:#2b5cbf;font-weight:700}",
"#wsDetail .lrow{padding:10px 15px 10px 46px;font-size:12.5px}",
"#wsDetail .lrow .nm{font-weight:600}",
"#wsDetail .trow{padding:12px 15px;font-size:13px}",
"#wsDetail .vl{padding:0 8px;font-size:12.5px}",
"#wsDetail .dgrid>*+*{border-left:1px solid rgba(30,41,59,.05)}",
"#wsDetail .lbox{padding:4px 0;border-bottom:1px solid rgba(30,41,59,.06)}",
"#wsDetail .lbox .lrow:last-child{border-bottom-color:transparent}",
"#wsDetail .lrow:hover{background:rgba(43,92,191,.05)}",
"#wsDetail .trow .vl{font-weight:800}",
/* v13: 人数填报卡 3 列聚焦填报, 居中窄卡 */
"#hcModal .table-scroll{max-width:680px;margin:0 auto 16px;overflow:hidden}",
"#hcModal #anaTable{width:100%;min-width:0;table-layout:fixed}",
"#hcModal #anaTable th,#hcModal #anaTable td{padding:11px 14px}",
"#hcModal #anaTable th:nth-child(1){width:36%}",
"#hcModal #anaTable th:nth-child(2),#hcModal #anaTable th:nth-child(3){width:32%}",
"#hcModal #anaTable th:nth-child(n+2),#hcModal #anaTable td:nth-child(n+2){text-align:center}",
"#hcModal #anaTable th:nth-child(1),#hcModal #anaTable td:nth-child(1){text-align:left}",
"#hcModal #anaTable td input.hc{width:96px;max-width:96px;height:33px;font-size:14px;font-weight:700;text-align:center}",
"#hcModal #anaTable tr.s-row td{background:#eff6ff;border-top:2px solid #2b5cbf;font-weight:800}",
"#anaRoot .btn-hc{margin-left:6px;padding:9px 16px;border-radius:10px;border:1px solid #4b5d78;background:rgba(43,92,191,.14);color:var(--ana-text);font-size:13px;font-weight:800;letter-spacing:.3px;cursor:pointer;line-height:1;transition:background .15s,border-color .15s;white-space:nowrap}",
"#anaRoot .btn-hc:hover{background:rgba(43,92,191,.22);border-color:#3b4c70}",
/* v14: 人数填报弹窗 */
"#anaRoot .hc-mask{position:fixed;inset:0;z-index:30;background:rgba(15,23,42,.55);opacity:0;pointer-events:none;transition:opacity .2s}",
"#anaRoot .hc-mask.show{opacity:1;pointer-events:auto}",
"#anaRoot .hc-modal{position:fixed;z-index:31;top:50%;left:50%;transform:translate(-50%,-46%);width:min(720px,92vw);max-height:82vh;display:flex;flex-direction:column;background:var(--ana-surface);border:1px solid #3b4c70;border-radius:16px;box-shadow:0 24px 60px rgba(15,23,42,.45);opacity:0;pointer-events:none;transition:opacity .18s,transform .18s;overflow:hidden}",
"#anaRoot .hc-modal.show{opacity:1;pointer-events:auto;transform:translate(-50%,-50%)}",
"#anaRoot .hc-modal .hc-head{display:flex;align-items:center;gap:10px;padding:13px 18px;border-bottom:1px solid var(--ana-border);background:rgba(15,23,42,.03)}",
"#anaRoot .hc-modal .hc-head h3{display:flex;align-items:center;gap:8px;font-size:14px;margin:0;color:var(--ana-text);font-weight:800}",
"#anaRoot .hc-modal .hc-x{margin-left:auto;width:32px;height:32px;font-size:14px;line-height:1}",
"#anaRoot .hc-modal .table-scroll{overflow-y:auto;padding:14px 18px 18px}",
"#anaRoot .hc-modal #anaTable{max-width:560px;margin:0 auto}",
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
    ' <button class="btn-hc" id="anaHcBtn" title="填报各车间人数">👥 人数填报</button>' +
    "</div></div>" +
    '<div class="subrow"><div class="chips" id="shiftChips"><button data-sh="day" class="on">白班</button><button data-sh="night">夜班</button></div>' +
    '<span class="sub-hint" id="subHint">白班 8:00-20:20 · 正常 ≤17:20 · 加班 17:20-20:20</span></div>' +
    '<div class="ana-kpis" id="anaKpis">' +
    '<div class="ana-kpi k-n"><div class="k-label">正常人均小时效率</div><div class="k-value" id="kpiNormEff">-<small>件/人·时</small></div><div class="k-meta" id="kpiNormMeta">正常产出 ÷ 正常人数 ÷ 8h</div></div>' +
    '<div class="ana-kpi k-o"><div class="k-label">加班人均小时效率</div><div class="k-value" id="kpiOtEff">-<small>件/人·时</small></div><div class="k-meta" id="kpiOtMeta">加班产出 ÷ 加班人数 ÷ 工时</div></div>' +
    '<div class="ana-kpi"><div class="k-label">加班效率达成</div><div class="k-value" id="kpiOtRate">-<small>基准</small></div><div class="k-meta" id="kpiOtRateMeta">加班效率 ÷ 正常效率</div></div>' +
    '<div class="ana-kpi"><div class="k-label">本班投入人数</div><div class="k-value" id="kpiHead">-<small>人</small></div><div class="k-meta" id="kpiHeadMeta">正常 / 加班</div></div>' +
    '</div>' +
    /* vs 对比带 (三段式: 正常 | 差异 | 加班) */
    '<div id="vsBand">' +
    '<div class="vs-side" id="vsN"><div class="lb">正常时段 <span class="tag" id="vsNtag">白班 ≤17:20</span></div><div class="num" id="vsNnum">--</div><div class="sb" id="vsNsb"></div></div>' +
    '<div class="vs-mid"><span class="vsw">效率对比</span><span id="diffChip" class="flat">--</span></div>' +
    '<div class="vs-side ot" id="vsO"><div class="lb">加班时段 <span class="tag" id="vsOtag">白班 17:20-20:20</span></div><div class="num" id="vsOnum">--</div><div class="sb" id="vsOsb"></div></div>' +
    "</div>" +
    /* 独立结论行 (Codex UI §5.4: 不再嵌入对比横条) */
    '<div id="vsVerdict"></div>' +
    /* ── v7 主卡: 车间 · 线体产出明细 (手风琴) ── */
    '<div class="card" id="wsDetail"><h3><span class="pl" style="background:#2b5cbf"></span>车间 · 线体产出明细 <span class="hint-r">车间效率按填报人数计算 · 点击车间行展开线体产出</span></h3>' +
    '<div id="detailHead" class="dgrid dh"></div><div id="detailList"></div></div>' +
    /* ── 双栏区: 趋势 | 加班人力 (Codex UI §5.6: 1100px 以下单栏) ── */
    '<div class="ana-lower-grid">' +
    /* ── 趋势卡: winChips 移入 h3 ── */
    '<div class="card ana-trend-card"><h3><span class="pl" style="background:#0a5d78"></span>趋势 · 正常 vs 加班 日产出' +
    '<span class="chips chips-sm" id="winChips"><button data-w="7" class="on">7天</button><button data-w="14">14天</button><button data-w="30">30天</button></span>' +
    '<span class="hint-r"><span class="lg"><i style="background:#2b5cbf"></i>正常产出</span><span class="lg"><i style="background:#a86a1f"></i>加班产出</span></span></h3>' +
    '<canvas id="cvTrend"></canvas><div class="empty-tip" id="trendEmpty" style="display:none"></div></div>' +
    /* ── 填报面板: 加班人力图 + 人数提报表 (右栏) ── */
    '<div id="fillPanel" class="open"><div id="fillHead"><div class="ch"></div><h3>班次人数对比</h3></div>' +
    '<div id="fillBody"><div class="fill-ot"><div class="fh3"><span class="lg"><i style="background:#2b5cbf"></i>正常人数</span><span class="lg"><i style="background:#a86a1f"></i>加班人数</span></div>' +
    '<canvas id="cvOt"></canvas><div class="empty-tip" id="otEmpty" style="display:none">暂无提报人数 - 点击下方填报表格填入</div></div>' +
    '</div></div>' +
    "</div>" +
    /* ── 口径说明 (Codex UI §5.7: 可折叠, 默认收起) ── */
    '<details class="footnote"><summary>数据口径说明</summary><div class="fn-body">白班正常 ≤17:20、白班加班 17:20-20:20;夜班正常 20:30-5:50、夜班加班 5:50-7:50。<b>正常人均小时效率 = 正常产出 ÷ 正常出勤人数 ÷ 8h</b>;<b>白班加班效率 = 加班产出 ÷ 加班人数 ÷ 加班已过时长</b>(封顶 3h,进行中实时计算,避免整段稀释);<b>夜班加班效率 = 加班产出 ÷ 加班人数 ÷ 加班已过时长</b>(封顶 2h)。加班效率达成 = 加班效率 ÷ 正常效率。人数按车间填报(顶栏「人数填报」)，保存到云端并通过实时流/轮询同步到其他设备。数据10分钟一档，历史数据按现有归档机制读取。</div></details>' +
    /* ── v12→v14: 人数填报移植为顶栏按钮弹窗 ── */
    '<div class="hc-mask" id="hcMask"></div>' +
    '<div class="hc-modal" id="hcModal">' +
    '<div class="hc-head"><h3><span class="pl" style="background:#6a28b8"></span>人数填报 · 车间人数<span class="note" id="fillNote"></span></h3>' +
    '<button class="ic hc-x" id="hcClose" title="关闭">✕</button></div>' +
    '<div class="table-scroll"><table id="anaTable"><thead></thead><tbody></tbody></table></div>' +
    '</div>' +
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
  var kpiNormEff = root.querySelector("#kpiNormEff"), kpiOtEff = root.querySelector("#kpiOtEff");
  var kpiOtRate = root.querySelector("#kpiOtRate"), kpiHead = root.querySelector("#kpiHead");
  var kpiNormMeta = root.querySelector("#kpiNormMeta"), kpiOtMeta = root.querySelector("#kpiOtMeta");
  var kpiOtRateMeta = root.querySelector("#kpiOtRateMeta"), kpiHeadMeta = root.querySelector("#kpiHeadMeta");

  root.querySelector("#anaBack").onclick = function () { closeHCStream(); root.remove(); };
  fillPanel.querySelector("#fillHead").onclick = function () { fillPanel.classList.toggle("open"); if (fillPanel.classList.contains("open")) drawOt(); };
  otEmpty.onclick = function () { openHcModal(); drawOt(); };
  var hcModal = root.querySelector("#hcModal"), hcMask = root.querySelector("#hcMask"), hcBtn = root.querySelector("#anaHcBtn");
  function openHcModal() { if (state.date) drawTable(); hcModal.classList.add("show"); hcMask.classList.add("show"); document.body.style.overflow = "hidden"; }
  function closeHcModal() { hcModal.classList.remove("show"); hcMask.classList.remove("show"); document.body.style.overflow = ""; }
  hcBtn.onclick = openHcModal;
  hcModal.querySelector("#hcClose").onclick = closeHcModal;
  hcMask.onclick = closeHcModal;
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeHcModal(); });
  /* v7: 手风琴展开委托(容器常驻, 只绑一次) */
  detailList.addEventListener("click", function (e) {
    var r = e.target.closest(".wsrow"); if (!r) return;
    var ws = r.getAttribute("data-ws");
    var op = r.classList.toggle("open");
    state.openWs = state.openWs || {}; state.openWs[ws] = op ? 1 : 0;
  });

  var state = { hourly: {}, hc: {}, wsAgg: null, date: null, today: null, sh: "day", win: 7, trend: null, fmt: null };
  var hcStream = null, hcStreamDate = null, hcPollBusy = false;

  function renderHCDependent() {
    if (!state.wsAgg) return;
    drawVs();
    drawOt();
    drawTable();
    renderDetail();
  }

  function applyHCStreamEvent(msg) {
    if (!msg || !state.date) return;
    state.hc = state.hc || {};
    var path = String(msg.path || "/").split("/").filter(function (x) { return x !== ""; });
    if (!path.length) {
      /* 整树推送: 云端是别名key, 需要映射回原名 */
      state.hc = hcLoadMap(msg.data) || {};
      renderHCDependent();
      return;
    }
    var ws = hcUnkey(decodeURIComponent(path[0]));
    if (path.length === 1) {
      if (msg.data === null) delete state.hc[ws];
      else state.hc[ws] = msg.data || {};
    } else {
      state.hc[ws] = state.hc[ws] || {};
      var key = decodeURIComponent(path[1]);
      if (msg.data === null) delete state.hc[ws][key];
      else state.hc[ws][key] = msg.data;
    }
    renderHCDependent();
  }

  function closeHCStream() {
    if (hcStream) { try { hcStream.close(); } catch (e) {} }
    hcStream = null;
    hcStreamDate = null;
  }

  function startHCStream(date) {
    closeHCStream();
    if (!window.EventSource || !date) return;
    try {
      hcStreamDate = date;
      hcStream = new EventSource(HC_URL + "/" + date + ".json");
      hcStream.addEventListener("put", function (e) { try { applyHCStreamEvent(JSON.parse(e.data)); } catch (x) {} });
      hcStream.addEventListener("patch", function (e) { try { applyHCStreamEvent(JSON.parse(e.data)); } catch (x) {} });
      hcStream.onerror = function () { /* EventSource 会自动重连;轮询仍作为兼容兜底 */ };
    } catch (e) { hcStream = null; }
  }

  function pollHC() {
    if (!root.parentNode || !state.date || hcPollBusy) return;
    if (hcSaving > 0) return; /* 有车间正在保存: 跳过本轮, 防云端旧值覆盖刚输入的数 */
    hcPollBusy = true;
    loadHC(state.date, function (hc) {
      hcPollBusy = false;
      if (!root.parentNode) return;
      var next = hc || {};
      if (JSON.stringify(next) !== JSON.stringify(state.hc || {})) {
        state.hc = next;
        renderHCDependent();
      }
    });
  }

  function todayStr() {
    return typeof bkkDateStr === "function" ? bkkDateStr() : (function () { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })(); // ★ v5.42 泰国日期
  }
  function nowMins() { return typeof bkkMins === "function" ? bkkMins() : (function () { var d = new Date(); return d.getHours() * 60 + d.getMinutes(); })(); }
  function setStatus(txt, k) { statusTxt.textContent = txt; statusEl.className = "st-" + (k || "idle"); }
  /* ═══════════ 数据加载 ═══════════ */
  var lastGoodDate = null; // ★ Codex §8.4: 失败时标注仍在显示的旧数据日期
  var loadSeq = 0; // ★ P0-4 竞态守卫: 快速切日期时旧响应(慢网络)不得覆盖新日期渲染
  function load(date, keepWs) {
    var seq = ++loadSeq;
    closeHCStream();
    state.date = date;
    var isToday = date === state.today;
    setStatus("加载中...");
    var url = isToday ? DATA_URL : "history/" + date + ".json";
    Promise.all([
      fetch(url + (isToday ? "?t=" + Date.now() : ""), { signal: AbortSignal.timeout(15000) }).then(function (r) { return r.json(); }),
      loadHC(date)
    ]).then(function (res) {
      if (seq !== loadSeq) return; // 已被更新的 load() 取代 → 丢弃
      var d = res[0] || {};
      if (!d || !d.hourly || !Object.keys(d.hourly).length) {
        cntEl.textContent = lastGoodDate ? "旧数据" : "无数据";
        return fail("该日无生产数据");
      }
      state.hourly = d.hourly;
      state.fmt = d.hourlyFormat || null;   /* ★ Codex §8.1: hourlyFormat 字段优先, aggLine 据此解析桶 */
      state.hc = res[1] || {};
      startHCStream(date);
      lastGoodDate = state.date;
      renderAll();
      /* P0-5 数据健康度: 线体覆盖提示 - hourly 里有但 WS_MAP 未配置的线 → 计数提示(说明上游新增线未加映射) */
      var unknown = 0;
      Object.keys(state.hourly).forEach(function (k) { if (!NORM2WS[normN(k)]) unknown++; });
      var nLn = Object.keys(state.hourly).length;
      var nowTxt = d.updatedAt ? String(d.updatedAt).substring(11, 16) : "";
      var srcTxt = isToday ? "实时" : "历史";
      /* 数据延迟: 今天实时源才有意义(历史归档无延迟概念) */
      var lagTxt = "";
      if (isToday && d.updatedAt) {
        var ts = new Date(String(d.updatedAt).replace(" ", "T") + "+07:00").getTime();
        var lag = ts ? Math.round((Date.now() - ts) / 60000) : -1;
        if (lag >= 0) lagTxt = (lag <= 1 ? "实时" : "延迟 " + lag + " 分") + " · ";
      }
      setStatus("[" + srcTxt + "] " + (d.updatedAt ? String(d.updatedAt).substring(0, 10) + " " + nowTxt : "") +
        " · " + lagTxt + "线体 " + nLn + "/" + WS_MAP_LINES + (unknown ? " · ⚠️未映射 " + unknown + " 条" : ""), "ok");
    }).catch(function () {
      if (seq !== loadSeq) return;
      fail("加载失败,请重试");
    });
    function fail(t) {
      setStatus(t + (lastGoodDate && lastGoodDate !== state.date ? " · 保留 " + lastGoodDate + " 数据" : ""), "err");
      vsNnum.textContent = vsOnum.textContent = "--";
    }
  }

  /* 趋势缓存: {date: {dN,dO,hasD}} - 会话内不重复请求历史归档 (2026-09-03 Codex §8.5) */
  var trendCache = {};
  function loadTrend() {
    /* 数据源: history/index.json 列出可用日期 → 只请求存在的日期(不再盲目并发 40 个文件) */
    fetch("history/index.json?t=" + Date.now()).then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (dates) {
        if (!dates || !dates.length) { trendByDays(); return; }  /* index 缺失(旧部署) → 降级按日扫描 */
        var last = [];
        dates.forEach(function (dt) {
          if (dt >= state.today) return;                        /* 今天实时不参与历史轴(同原行为) */
          if (last.length >= 40) return;
          last.push(dt);
        });
        loadTrendDates(last);
      });
  }
  /* 降级路径: 无 index.json 时, 从昨天往前逐个探测(与旧版同行为, 仅作兜底) */
  function trendByDays() {
    var d0 = new Date(state.today); d0.setDate(d0.getDate() - 1);
    function iso(x) { return x.getFullYear() + "-" + String(x.getMonth() + 1).padStart(2, "0") + "-" + String(x.getDate()).padStart(2, "0"); }
    var days = [];
    for (var i = 1; i <= 40; i++) { var x = new Date(d0); x.setDate(d0.getDate() - (i - 1)); days.push(iso(x)); }
    loadTrendDates(days);
  }
  function loadTrendDates(days) {
    var todo = days.filter(function (dt) { return !trendCache[dt]; });
    var seen = 0;
    function finish() {
      var out = [];
      days.forEach(function (dt) {
        var c = trendCache[dt];
        if (c && !c.skip) out.push(c);
      });
      out.sort(function (a, b) { return a.d < b.d ? -1 : 1; });
      state.trend = out; drawTrend();
    }
    if (!todo.length) { finish(); return; }
    todo.forEach(function (dt) {
      fetch("history/" + dt + ".json?t=" + Date.now()).then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          seen++;
          if (d && d.hourly) {
            /* ★ Codex §8.1 per-file: 历史文件各自独立判定格式(不能用 state.fmt - 那是当前选中日期的) */
            var f = d.hourlyFormat || null;
            if (!f) {
              var anyHi = false;
              Object.keys(d.hourly).some(function (k) {
                var arr = d.hourly[k];
                for (var i = 0; i < arr.length; i++) if (Number(arr[i].h) >= 100) { anyHi = true; return true; }
                return false;
              });
              f = anyHi ? "HHMM" : "hour";
            }
            var a = aggWs(d.hourly, f);
            /* v13: 历史归档完整性闸门 -- 旧快照(17:10 截断/无加班段/线体口径不一 35/12/34)不入趋势,
               避免「正常vs加班」出现 0 加班、总量跳变的误导。完整 = 线体数达标 + 白班覆盖到日末 */
            var cov = -1, nLn = 0;
            Object.keys(d.hourly).forEach(function (rawName) {
              var std = NORM2WS[normN(rawName)];
              if (!std) return;
              nLn++;
              var s = aggLine(d.hourly[rawName], f);
              if (s.hasDay && s.lastDpM !== null && s.lastDpM > cov) cov = s.lastDpM;
            });
            var full = nLn >= 30 && cov >= DAY_END - 10;   /* ~34 线全量 & 覆盖 ≥20:10 */
            trendCache[dt] = full
              ? { d: dt, dN: a.tot.dN, dO: a.tot.dO, hasD: a.tot.dayL > 0 }
              : { d: dt, skip: true };
          }
          if (seen >= todo.length) finish();
        }).catch(function () { seen++; if (seen >= todo.length) finish(); });
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
      ws: ws,
      dN: a.dN, dO: a.dO, nL: a.nL, nN: a.nN, nO: a.nO, planN: a.planN,
      lines: a.lines, dayL: a.dayL, nightL: a.nightL,
      dOtL: a.dOtL, dOtN: a.dOtN, nOtL: a.nOtL, nOtN: a.nOtN,
      lastDpM: a.lastDpM, lastTpM: a.lastTpM,
      hcD: hcValue(hc, "d"), hcDO: hcValue(hc, "dO"), hcN: hcValue(hc, "n"), hcNO: hcValue(hc, "nO")
    };
  }

  function hcValue(hc, key) {
    if (!hc || hc[key] === null || hc[key] === undefined || hc[key] === "") return null;
    var n = Number(hc[key]);
    return isFinite(n) && n >= 0 ? Math.floor(n) : null;
  }
  function sumHC(key) {
    var sum = 0, entered = 0;
    WS_MAP.forEach(function (g) {
      var n = hcValue(state.hc[g.ws] || {}, key);
      if (n !== null) { sum += n; entered++; }
    });
    return { value: sum, entered: entered };
  }
  /* ★ 2026-09-03 v13.1 加班效率分母口径修正(用户 18:01 指出):
     原口径 = 加班产出 ÷ 人数 ÷ 固定 3h/2h → 加班进行中(产出只累计到最新桶)
     却被整段 3h 稀释(如 17:55 才加班 35min ÷ 3h ≈ 低估 5 倍)。
     改为: 分母 = 截至最新数据桶的已过加班净时长 min(封顶 3h/2h)。
     加班结束/历史完整档(末桶≈20:20/7:50)时自动等于 3h/2h, 与旧口径一致。 */
  function otRealHours(t, isDay) {
    var lastM = isDay ? (t && t.lastDpM) : (t && t.lastTpM);
    var startM = isDay ? DAY_NORM_END : NIGHT_OT_START; /* 17:20 / 5:50 */
    var cap = EFF_HOURS[isDay ? "dO" : "nO"];          /* 3 / 2 */
    if (lastM === null || lastM === undefined || lastM <= startM) return null;
    var h = (lastM - startM) / 60;
    return Math.min(h, cap);
  }
  function efficiency(output, people, hours) {
    var o = Number(output);
    return isFinite(o) && o >= 0 && people > 0 && hours > 0 ? o / people / hours : null;
  }
  function fmtEff(v) {
    if (v === null || v === undefined || isNaN(v)) return "-";
    return v >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(1);
  }
  function shiftNormalOutput(t, isDay) {
    /* 今天夜班优先显示 20:30 起的实时累计;历史日使用归档的凌晨正常段 */
    return isDay ? t.dN : ((state.date === state.today && t.nL > 0) ? t.nL : t.nN);
  }
  function otStarted(isDay) {
    if (state.date !== state.today) return true;
    var m = nowMins();
    return isDay ? m >= DAY_NORM_END : (m >= NIGHT_OT_START && m < NIGHT_START);
  }
  function shiftSnapshot(t, isDay) {
    var normalKey = isDay ? "d" : "n", otKey = isDay ? "dO" : "nO";
    var normalPeople = sumHC(normalKey), otPeople = sumHC(otKey);
    var normalOutput = shiftNormalOutput(t, isDay), otRawOutput = isDay ? t.dO : t.nO;
    var started = otStarted(isDay), otOutput = started ? otRawOutput : null;
    var normalHours = EFF_HOURS[isDay ? "dN" : "nN"], otHours = otRealHours(t, isDay);
    if (otHours === null) otHours = 0; /* 加班尚无产出桶(刚开始/数据滞后) */
    var otEff = null;
    if (otHours > 0) otEff = efficiency(otOutput, otPeople.value, otHours);
    var normalEff = efficiency(normalOutput, normalPeople.value, normalHours);
    var rate = normalEff !== null && normalEff > 0 && otEff !== null ? otEff / normalEff : null;
    return {
      normalOutput: normalOutput, otOutput: otOutput, otRawOutput: otRawOutput, otStarted: started,
      normalPeople: normalPeople, otPeople: otPeople,
      normalEff: normalEff, otEff: otEff, rate: rate,
      normalHours: normalHours, otHours: otHours
    };
  }
  function kpiValue(el, value, unit) {
    el.innerHTML = (value === null || value === undefined ? "-" : value) + "<small>" + unit + "</small>";
  }
  function kpiTone(el, tone) {
    var box = el && el.parentNode;
    if (!box) return;
    box.className = "ana-kpi" + (tone ? " k-" + tone : "");
  }
  function peopleText(x, label) {
    return x.entered ? label + " " + x.value + " 人" : "待填" + label;
  }

  /* ── v7 人均小时效率对比: 产出 ÷ 出勤人数 ÷ 标准工时 ── */
  function drawVs() {
    var t = state.wsAgg.tot, isDay = state.sh === "day", s = shiftSnapshot(t, isDay);
    subHint.textContent = isDay ? "白班 · 正常效率按 8h · 加班效率按已过时长(≤3h) · 件/人·时" : "夜班 · 正常效率按 8h · 加班效率按已过时长(≤2h) · 件/人·时";
    vsNtag.textContent = isDay ? "白班正常 ≤17:20" : "夜班正常 20:30-5:50";
    vsOtag.textContent = isDay ? "白班加班 17:20-20:20" : "夜班加班 5:50-7:50";
    kpiValue(kpiNormEff, fmtEff(s.normalEff), "件/人·时");
    kpiValue(kpiOtEff, fmtEff(s.otEff), "件/人·时");
    kpiValue(kpiOtRate, s.rate === null ? "-" : Math.round(s.rate * 100) + "%", "基准");
    kpiValue(kpiHead, s.normalPeople.entered || s.otPeople.entered ? s.normalPeople.value + " / " + s.otPeople.value : "-", "正常/加班");
    kpiNormMeta.textContent = fmt(s.normalOutput) + " 件 ÷ " + peopleText(s.normalPeople, "正常") + " ÷ " + s.normalHours + "h";
    kpiOtMeta.textContent = !s.otStarted ? "加班时段尚未开始" : (s.otHours > 0 ? fmt(s.otOutput) + " 件 ÷ " + peopleText(s.otPeople, "加班") + " ÷ " + s.otHours + "h" : "加班产出未到(数据滞后)");
    kpiOtRateMeta.textContent = s.rate === null ? "先填写正常人数和加班人数" : "加班效率 ÷ 正常效率";
    kpiHeadMeta.textContent = (isDay ? "白班" : "夜班") + " · 正常 / 加班";
    kpiTone(kpiOtRate, s.rate === null ? "" : (s.rate >= 1.05 ? "good" : (s.rate >= .95 ? "warn" : "bad")));
    vsNnum.innerHTML = s.normalEff === null ? "-" : fmtEff(s.normalEff) + "<small>件/人·时</small>";
    vsOnum.innerHTML = s.otEff === null ? "-" : fmtEff(s.otEff) + "<small>件/人·时</small>";
    vsNsb.textContent = peopleText(s.normalPeople, "正常人数") + " · 标准 " + s.normalHours + "h";
    vsOsb.textContent = !s.otStarted ? "加班时段尚未开始 · " + s.normalHours + "h" : peopleText(s.otPeople, "加班人数") + " · 已过 " + s.otHours + "h";
    if (s.rate === null) {
      diffChip.className = "flat";
      diffChip.textContent = !s.otStarted ? "未开始" : (s.otHours <= 0 ? "产出未到" : (s.normalEff === null || s.otEff === null ? "待填人数" : "无法比较"));
      setVerdict(isDay, s, null, false);
      return;
    }
    var d = (s.rate - 1) * 100, g = d >= 0;
    diffChip.className = Math.abs(d) < 5 ? "flat" : (g ? "good" : "bad");
    diffChip.textContent = Math.abs(d) < 5 ? "≈正常基准" : (g ? "▲ 高 " : "▼ 低 ") + Math.abs(d).toFixed(0) + "%";
    setVerdict(isDay, s, d, g);
  }

  /* ── 人力柱: 当前班次正常人数 / 加班人数 ── */
  function drawOt() {
    var isDay = state.sh === "day", normalKey = isDay ? "d" : "n", otKey = isDay ? "dO" : "nO";
    var hcs = [];
    var any = false;
    WS_MAP.forEach(function (g) {
      var hc = state.hc[g.ws] || {};
      var normal = hcValue(hc, normalKey), ot = hcValue(hc, otKey);
      if (normal !== null || ot !== null) any = true;
      hcs.push({ nm: g.ws, normal: normal === null ? 0 : normal, ot: ot === null ? 0 : ot });
    });
    otEmpty.style.display = any ? "none" : "block";
    barChart(cvOt, {
      labels: hcs.map(function (h) { return h.nm; }),
      s1: hcs.map(function (h) { return h.normal; }), s1c: "#2b5cbf",
      s2: hcs.map(function (h) { return h.ot; }), s2c: "#a86a1f",
      lg1: isDay ? "白班正常" : "夜班正常", lg2: isDay ? "白班加班" : "夜班加班", h: 178, int: true
    });
  }

  /* ═══════════ v7: 车间·线体明细 (线体只展示产出和状态) ═══════════ */
  /* 行内显示名: 去 line/-Series 后缀 */
  function shortStd(s) { return String(s).replace(/ line$/i, "").replace(/-Series$/i, ""); }
  /* 数值 cell: null/NaN → 灰 - (0 不作数据上色) */
  function cellV(v, cls, u) {
    if (v === null || v === undefined || isNaN(v)) return '<span class="vl v-0">-</span>';
    return '<span class="vl ' + (cls || "") + '">' + (u ? fmtU(v) : fmt(v)) + "</span>";
  }
  function diffTxt(d) {
    if (d === null || d === undefined || isNaN(d)) return '<span class="diff-u flat">-</span>';
    if (Math.abs(d) < 3) return '<span class="diff-u flat">≈0%</span>';
    var g = d > 0;
    return '<span class="diff-u ' + (g ? "good" : "bad") + '">' + (g ? "▲" : "▼") + " " + Math.abs(d).toFixed(0) + "%</span>";
  }
  /* 正常段计划达成率 chip: 超产绿/达标蓝/补缺金/无计划灰 */
  function rateChip(rate) {
    if (rate === null || rate === undefined || isNaN(rate)) return '<span class="rate-chip x">-</span>';
    var p = Math.round(rate * 100);
    if (rate >= 1) return '<span class="rate-chip g">超产 ' + (p - 100) + '%</span>';
    if (rate >= 0.95) return '<span class="rate-chip b">达标 ' + p + '%</span>';
    return '<span class="rate-chip y">补缺 ' + p + '%</span>';
  }
  function effRateChip(rate) {
    if (rate === null || rate === undefined || isNaN(rate)) return '<span class="rate-chip x">待填人数</span>';
    var p = Math.round(rate * 100);
    if (rate >= 1.05) return '<span class="rate-chip g">高于基准 ' + p + '%</span>';
    if (rate >= .95) return '<span class="rate-chip b">接近基准 ' + p + '%</span>';
    return '<span class="rate-chip y">低于基准 ' + p + '%</span>';
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
  function lineRowDay(a) {
    var tot = null, n = null, o = null;
    if (!a || !a.hasDay) return { tot: tot, n: n, o: o };
    n = a.dayNorm > 0 ? a.dayNorm : null;
    o = a.dayOt > 0 ? a.dayOt : null;
    tot = a.dayNorm + a.dayOt;
    return { tot: tot, n: n, o: o };
  }
  function lineRowNight(a) {
    var tot = null, n = null, o = null;
    if (!a || !a.hasNight) return { tot: tot, n: n, o: o };
    var normalOutput = state.date === state.today && a.nLive > 0 ? a.nLive : a.nNorm;
    n = normalOutput > 0 ? normalOutput : null;
    o = a.nOt > 0 ? a.nOt : null;
    if (normalOutput + a.nOt > 0) tot = normalOutput + a.nOt;
    return { tot: tot, n: n, o: o };
  }
  /* 车间行数值:车间正常/加班效率统一按"产出 ÷ 车间填报人数 ÷ 工时"
     加班工时 = 截至该车间最新桶的已过加班净时长(修正口径) */
  function wsRowCellsDay(d) {
    var n = d.dN > 0 ? d.dN : null, o = d.dO > 0 ? d.dO : null;
    var hO = otRealHours(d, true);
    var eN = efficiency(d.dN, d.hcD, EFF_HOURS.dN), eO = hO !== null ? efficiency(d.dO, d.hcDO, hO) : null;
    var diff = eN !== null && eO !== null && eN > 0 ? (eO - eN) / eN * 100 : null;
    return { personMode: true, tot: d.dayL > 0 ? d.dN + d.dO : null, n: n, o: o, hN: d.hcD, hO: d.hcDO, effN: eN, effO: eO, diff: diff };
  }
  function wsRowCellsNight(d) {
    var normalOutput = state.date === state.today && d.nL > 0 ? d.nL : d.nN;
    var n = normalOutput > 0 ? normalOutput : null, o = d.nO > 0 ? d.nO : null;
    var hO = otRealHours(d, false);
    var eN = efficiency(normalOutput, d.hcN, EFF_HOURS.nN), eO = hO !== null ? efficiency(d.nO, d.hcNO, hO) : null;
    var diff = eN !== null && eO !== null && eN > 0 ? (eO - eN) / eN * 100 : null;
    return { personMode: true, tot: d.nightL > 0 ? normalOutput + d.nO : null, n: n, o: o, hN: d.hcN, hO: d.hcNO, effN: eN, effO: eO, diff: diff };
  }
  /* 车间行尾列:加班效率相对正常效率的达成率 */
  function wsRowTag(d, isDay) {
    var c = isDay ? wsRowCellsDay(d) : wsRowCellsNight(d);
    return effRateChip(c.effN !== null && c.effN > 0 && c.effO !== null ? c.effO / c.effN : null);
  }
  function cellEff(v) {
    if (v === null || v === undefined || isNaN(v)) return '<span class="vl v-0">-</span>';
    return '<span class="vl ' + (v >= 0 ? "" : "v-0") + '">' + fmtEff(v) + "</span>";
  }
  /* 行 html: [名称,总产出,正常产出,加班产出,正常人数,加班人数,正常效率,加班效率,达成] */
  function rowCellsHtml(c) {
    if (c.personMode) {
      return cellV(c.tot, "", false) + cellV(c.n, "v-n", false) + cellV(c.o, "v-o", false) +
        cellV(c.hN, "", false) + cellV(c.hO, "", false) + cellEff(c.effN) + cellEff(c.effO);
    }
    /* 展开线体没有车间级人数,不在这里展示另一套容易混淆的线体效率口径 */
    return cellV(c.tot, "", false) + cellV(c.n, "v-n", false) + cellV(c.o, "v-o", false) +
      '<span class="vl v-0">-</span><span class="vl v-0">-</span><span class="vl v-0">-</span><span class="vl v-0">-</span>';
  }
  function wsRowHtml(ws, d, isDay, nmOverride) {
    var c = isDay ? wsRowCellsDay(d) : wsRowCellsNight(d);
    var otN = isDay ? d.dOtL : d.nOtL;
    var nm = nmOverride || ('<span class="acc"></span>' + ws +
      (d.lines ? '<span class="cnt">' + d.lines + "线" + (otN ? " · OT " + otN : "") + "</span>" : ""));
    return '<div class="nm">' + nm + "</div>" + rowCellsHtml(c) + wsRowTag(d, isDay);
  }
  function trowHtml(d, isDay) {
    var s = shiftSnapshot(d, isDay);
    var c = {
      personMode: true,
      tot: isDay ? d.dN + d.dO : shiftNormalOutput(d, false) + d.nO,
      n: s.normalOutput > 0 ? s.normalOutput : null,
      o: s.otOutput > 0 ? s.otOutput : null,
      hN: s.normalPeople.entered ? s.normalPeople.value : null,
      hO: s.otPeople.entered ? s.otPeople.value : null,
      effN: s.normalEff, effO: s.otEff, diff: s.rate !== null ? (s.rate - 1) * 100 : null
    };
    var tag = effRateChip(s.rate);
    return '<div class="nm">全厂合计</div>' + rowCellsHtml(c) + tag;
  }
  /* v7 结论: 只解释人均小时效率,不用线体数稀释人数口径 */
  function setVerdict(isDay, s, d, g) {
    var html = "";
    var shift = isDay ? "白班" : "夜班";
    if (!s.otStarted) {
      html = "<b>" + shift + "加班时段尚未开始</b> · 已录入的人数会保留,开始产生加班产出后自动计算加班效率";
    } else if (!s.normalPeople.entered || !s.otPeople.entered) {
      html = "<b>请先填写" + shift + "各车间的正常人数和加班人数</b> · 填报后将实时计算件/人·时和加班效率达成";
    } else if (s.normalPeople.value <= 0 || s.otPeople.value <= 0) {
      html = "<b>人数为 0,暂无法计算效率</b> · 请确认" + shift + "正常人数和加班人数后再判断加班是否有效";
    } else if (s.normalEff === null || s.otEff === null) {
      html = "<b>人数已填,但当前产出数据不足</b> · 等待生产数据更新后自动计算";
    } else {
      var cls = Math.abs(d) < 5 ? "k" : (g ? "ok" : "k");
      var txt = Math.abs(d) < 5 ? "≈正常基准" : ((g ? "高" : "低") + " " + Math.abs(d).toFixed(0) + "%");
      html = shift + "加班效率为 <b>" + fmtEff(s.otEff) + " 件/人·时</b>,正常效率为 <b>" + fmtEff(s.normalEff) + " 件/人·时</b> · 加班效率相对正常基准 <b class=\"" + cls + "\">" + txt + "</b>";
      if (isDay && state.wsAgg.tot.planN > 0) {
        var planRate = state.wsAgg.tot.dN / state.wsAgg.tot.planN;
        html += " · 正常时段计划达成 " + Math.round(planRate * 100) + "%";
      }
    }
    vsVerdict.className = html ? "show" : "";
    vsVerdict.innerHTML = html;
  }
  /* 明细渲染入口: 填表头 → 车间行 + 展开线体行 → 全厂合计行 */
  function renderDetail() {
    var isDay = state.sh === "day";
    var heads = isDay ?
      ["车间 / 线体", "当日总产出", "正常产出", "加班产出", "正常人数", "加班人数", "正常效率", "加班效率", "OT效率达成"] :
      ["车间 / 线体", "夜班总产出", "正常产出", "加班产出", "正常人数", "加班人数", "正常效率", "加班效率", "OT效率达成"];
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

  /* ── 车间人数填报 + 人均效率联动 ── */
  function inputVal(v) { return v === null || v === undefined ? "" : String(v); }
  function drawTable() {
    var isToday = state.date === state.today, isDay = state.sh === "day";
    var normalKey = isDay ? "d" : "n", otKey = isDay ? "dO" : "nO";
    var normalLabel = isDay ? "白班正常" : "夜班正常", otLabel = isDay ? "白班加班" : "夜班加班";
    var th = "<tr><th>车间</th><th>" + normalLabel + "人数</th><th>" + otLabel + "人数</th></tr>";
    var html = "";
    WS_MAP.forEach(function (g) {
      var hc = state.hc[g.ws] || {};
      var nPeople = hcValue(hc, normalKey), oPeople = hcValue(hc, otKey);
      var disabled = isToday ? "" : " disabled";
      html += "<tr><td class='nmw'>" + g.ws + "</td>" +
        "<td><input class='hc' type='number' min='0' step='1' placeholder='人数' value='" + inputVal(nPeople) + "' data-ws='" + g.ws + "' data-f='" + normalKey + "'" + disabled + "></td>" +
        "<td><input class='hc' type='number' min='0' step='1' placeholder='人数' value='" + inputVal(oPeople) + "' data-ws='" + g.ws + "' data-f='" + otKey + "'" + disabled + "></td></tr>";
    });
    var t = state.wsAgg.tot, s = shiftSnapshot(t, isDay);
    html += "<tr class='s-row'><td>合计</td>" +
      "<td>" + (s.normalPeople.entered ? s.normalPeople.value : "-") + "</td>" +
      "<td>" + (s.otPeople.entered ? s.otPeople.value : "-") + "</td></tr>";
    tbl.querySelector("thead").innerHTML = th;
    tbl.querySelector("tbody").innerHTML = html;
    fillNote.textContent = (isToday ? "填写 " + normalLabel + "/" + otLabel + "人数 · 修改后实时同步" : "历史日 · 数据只读,人数沿用该日提报");
    Array.prototype.forEach.call(tbl.querySelectorAll("input.hc"), function (inp) {
      inp.onchange = function () {
        if (!isToday) return;
        var ws = inp.getAttribute("data-ws"), f = inp.getAttribute("data-f");
        var raw = String(inp.value || "").trim(), val = raw === "" ? null : Number(raw);
        if (val !== null && (!isFinite(val) || val < 0)) { inp.value = ""; val = null; }
        if (val !== null) val = Math.floor(val);
        var hc = state.hc[ws] || {};
        hc[f] = val;
        state.hc[ws] = hc;
        /* 先本地重算,用户输入后立即看到效率;随后保存到云端 */
        renderHCDependent();
        fillNote.textContent = "⏳ 保存中...";
        saveHC(state.date, ws, hc, function (ok) {
          fillNote.textContent = ok ? "✅ 已保存 " + state.date + " · 其他设备将实时更新" : "⚠️ 保存失败(网络?) · 请重试";
        });
      };
    });
  }

  /* ═══════════ Canvas 柱图 (双序列) ═══════════ */
  var _tipEl = null;
  function tip() {
    if (!_tipEl) {
      _tipEl = document.createElement("div");
      _tipEl.style.cssText = "position:fixed;z-index:99;background:#fff;border:1px solid rgba(30,41,59,.14);border-radius:10px;" +
        "padding:7px 12px;font-size:12px;color:#1f2a37;pointer-events:none;display:none;font-variant-numeric:tabular-nums;" +
        "box-shadow:0 10px 30px rgba(15,23,42,.16);line-height:1.4";
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
      g.addColorStop(0, "rgba(255,255,255,.28)");
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
      var padL = 46, padR = 14, padT = 26, padB = 26;
      var n = cfg.labels.length;
      var allV = cfg.s1.concat(cfg.s2).filter(function (v) { return v !== null && v !== undefined; });
      var maxV = allV.length ? Math.max.apply(null, allV) : 1;
      maxV = cfg.int ? Math.ceil(maxV) : (Math.ceil(maxV / 10) * 10 || 10);
      var cw = W - padL - padR, ch = H - padT - padB;
      ctx.font = "10px 'Segoe UI',sans-serif";
      for (var i = 0; i <= 4; i++) {
        var y = padT + ch - (ch * i / 4);
        ctx.strokeStyle = i === 0 ? "rgba(30,41,59,.12)" : "rgba(30,41,59,.06)";
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
        ctx.fillStyle = "#94a3b8"; ctx.textAlign = "right";
        ctx.fillText(cfg.int ? fmt((maxV * i / 4)) : ((maxV * i / 4) >= 100 ? fmt(maxV * i / 4) : (maxV * i / 4).toFixed(0)), padL - 8, y + 3);
      }
      var group = cw / n;
      var bw = Math.max(26, Math.min(54, group * 0.3));
      /* v12: 柱顶数值标签 (成对柱向外分列避免重叠; 矮柱不标) */
      function barLbl(v, cx, cy, col, al) {
        if (v === null || v === undefined) return;
        ctx.font = "700 8.5px 'Segoe UI',sans-serif";
        ctx.textAlign = al || "center";
        ctx.fillStyle = col;
        ctx.fillText(cfg.int ? fmt(v) : String(Math.round(v)), cx, cy);
      }
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
            barLbl(cfg.s1[i], has2 ? gx - bw / 2 - 1 : gx, base - h1 - 6, cfg.s1c, has2 ? "right" : "center");
            hitRects.push([x1, base - h1, bw, h1, lb, cfg.lg1 + "  " + (cfg.int ? fmt(cfg.s1[i]) : Math.round(cfg.s1[i]))]);
          }
        }
        if (cfg.s2 && cfg.s2[i] !== null && cfg.s2[i] !== undefined) {
          var h2 = Math.max(0, cfg.s2[i] / maxV * ch);
          if (h2 > 0.5) {
            var x2 = has2 ? gx + 2 : gx - bw / 2;
            barFill(ctx, x2, base - h2, bw, h2, cfg.s2c, 3);
            barLbl(cfg.s2[i], has2 ? gx + bw / 2 + 1 : gx, base - h2 - 6, cfg.s2c, has2 ? "left" : "center");
            hitRects.push([x2, base - h2, bw, h2, lb, cfg.lg2 + "  " + (cfg.int ? fmt(cfg.s2[i]) : Math.round(cfg.s2[i]))]);
          }
        }
        ctx.fillStyle = "#64748b"; ctx.textAlign = "center"; ctx.font = "10.5px 'Segoe UI',sans-serif";
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
      ctx.fillStyle = "#94a3b8"; ctx.textAlign = "center"; ctx.font = "12.5px 'Segoe UI',sans-serif";
      ctx.fillText("历史趋势积累中", W / 2, H / 2 - 18);
      ctx.font = "11px 'Segoe UI',sans-serif";
      ctx.fillStyle = "#b6c2cf";
      ctx.fillText("9-03 前旧快照已自动过滤(止于 17:00 · 无加班段 · 线体口径不一)", W / 2, H / 2 + 1);
      ctx.fillText("今晚 20:40 起完整归档 → 每日自动累积趋势", W / 2, H / 2 + 19);
      return;
    }
    var list = tr.filter(function (x) { return x.dN > 0 || x.dO > 0; }).slice(-state.win);
    var padL = 46, padR = 14, padT = 24, padB = 28;
    var cw = W - padL - padR, ch = H - padT - padB;
    var allV = [];
    list.forEach(function (x) { allV.push(x.dN, x.dO); });
    var maxV = Math.max(1, Math.ceil(Math.max.apply(null, allV) / 10) * 10);
    ctx.font = "10px 'Segoe UI',sans-serif";
    for (var i = 0; i <= 4; i++) {
      var y = padT + ch - (ch * i / 4);
      ctx.strokeStyle = i === 0 ? "rgba(30,41,59,.12)" : "rgba(30,41,59,.06)";
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
      ctx.fillStyle = "#94a3b8"; ctx.textAlign = "right";
      ctx.fillText(fmt(maxV * i / 4), padL - 8, y + 3);
    }
    var X = function (i) { return list.length === 1 ? padL + cw / 2 : padL + cw * i / (list.length - 1); };
    var step = Math.max(1, Math.ceil(list.length / 8));
    function series(key, color, dir) {
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
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.stroke();
        /* v12: 数值标签, 与日期标签同抽稀节奏; 正常上/加班下, 白描边防重叠 */
        if (i % step === 0 || i === vals.length - 1) {
          var lbTxt = fmt(v);
          var lbY = dir < 0 ? y - 8 : y + 15;
          if (lbY < 10) lbY = y + 15; else if (lbY > H - 9) lbY = y - 8;
          ctx.font = "600 8.5px 'Segoe UI',sans-serif";
          ctx.textAlign = "center";
          ctx.lineWidth = 3; ctx.strokeStyle = "rgba(255,255,255,.9)";
          ctx.strokeText(lbTxt, x, lbY);
          ctx.fillStyle = color;
          ctx.fillText(lbTxt, x, lbY);
        }
      });
    }
    series("dN", "#2b5cbf", -1);
    series("dO", "#a86a1f", 1);
    ctx.fillStyle = "#64748b"; ctx.textAlign = "center"; ctx.font = "10px 'Segoe UI',sans-serif";
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
    if (state.wsAgg) { drawVs(); drawOt(); drawTable(); renderDetail(); }
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
  window.closeAnaPage = function () { closeHCStream(); if (root.parentNode) root.remove(); };
  setInterval(function () {
    if (root.parentNode && state.date === state.today) load(state.today);
  }, 600000);
  /* Firebase REST 流实时推送;每 8 秒轮询作为浏览器/网络不支持流式连接时的兜底 */
  setInterval(function () { if (root.parentNode && state.date) pollHC(); }, 8000);
})();
