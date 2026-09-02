/* ============================================================
 * 车间产出分析页 (独立模块, 不影响主看板任何逻辑)
 * 2026-09-02 v1  纯前端: 读 Firebase pdtiii.json hourly
 *   → 按车间/线体/班次聚合 → 拆「正常时段产出 vs 加班时段产出」
 * 加班口径(用户 2026-09-02 确认): 白班 17:20–20:20 / 夜班 5:50–7:50
 * 人数: normal_hc / ot_hc 预留(可手填, 存 Firebase analysis/hc/{date}.json)
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

  /* ════════════════ DOM ════════════════ */
  var css = "\n#anaRoot{position:fixed;inset:0;z-index:9999;background:#000;color:#f0f6fc;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;overflow:auto;display:flex;flex-direction:column}\n" +
    "#anaRoot *{box-sizing:border-box;margin:0;padding:0}\n" +
    "#anaTop{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;padding:10px 16px;background:#000;border-bottom:1px solid #232329;flex-wrap:wrap}\n" +
    "#anaRoot .ana-back{background:#000000;color:#f0f6fc;border:1px solid #2a2a31;border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer}\n" +
    "#anaRoot .ana-back:hover{background:#0c0c0c}\n" +
    "#anaRoot h1{font-size:16px;letter-spacing:1px;font-weight:700}\n" +
    "#anaRoot .ana-sub{font-size:11px;color:#a3adbb;margin-left:4px}\n" +
    "#anaTop input[type=date]{background:#000000;color:#f0f6fc;border:1px solid #2a2a31;border-radius:6px;padding:5px 8px;font-size:12px;color-scheme:dark}\n" +
    "#anaBody{padding:14px 16px 40px;display:flex;flex-direction:column;gap:14px}\n" +
    "#anaRoot .ana-note{font-size:11px;color:#a3adbb;background:#000000;border:1px solid #232329;border-radius:8px;padding:8px 12px;line-height:1.6}\n" +
    "#anaCards{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:10px}\n" +
    ".ana-card{background:#000000;border:1px solid #232329;border-radius:12px;padding:12px;cursor:pointer;transition:border-color .15s}\n" +
    ".ana-card:hover{border-color:#3a3a44}\n" +
    ".ana-card.sel{border-color:#58a6ff;box-shadow:0 0 0 1px #58a6ff66}\n" +
    ".ana-card h3{font-size:14px;display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}\n" +
    ".ana-card h3 .tag{font-size:11px;color:#a3adbb;font-weight:400}\n" +
    ".ana-card h3 .ws-hc{font-size:11px;color:#3fb950;font-weight:600}\n" +
    ".ana-card h3 .ws-miss{font-size:11px;color:#f85149;font-weight:600}\n" +
    ".ana-row{display:grid;grid-template-columns:56px 1fr 1fr 1fr;gap:4px;font-size:11.5px;margin-top:3px}\n" +
    ".ana-row .lb{color:#a3adbb}\n" +
    ".ana-row b{font-size:12.5px}\n" +
    ".ana-row .ot{color:#d29922}\n" +
    ".ana-row .nm{color:#58a6ff}\n" +
    ".ana-cmp{margin-top:8px;font-size:11.5px;padding-top:6px;border-top:1px dashed #2a2a31}\n" +
    ".ana-cmp .good{color:#3fb950}.ana-cmp .bad{color:#f85149}.ana-cmp .na{color:#a3adbb}\n" +
    ".ana-panel{background:#000000;border:1px solid #232329;border-radius:12px;padding:12px}\n" +
    ".ana-panel h3{font-size:14px;margin-bottom:8px}\n" +
    "#anaTable{width:100%;border-collapse:collapse;font-size:12.5px}\n" +
    "#anaTable th{color:#a3adbb;font-size:11px;padding:6px 8px;text-align:right;border-bottom:1px solid #232329;white-space:nowrap}\n" +
    "#anaTable th:first-child,#anaTable td:first-child{text-align:left}\n" +
    "#anaTable td{padding:6px 8px;text-align:right;border-bottom:1px solid #15151a;white-space:nowrap}\n" +
    "#anaTable tr.sum td{font-weight:700;border-top:1px solid #2a2a31;background:#000000}\n" +
    "#anaTable td.ws-line{font-weight:600}\n" +
    "#anaTable .nm{color:#58a6ff}#anaTable .ot{color:#d29922}#anaTable .tot{color:#f0f6fc;font-weight:600}\n" +
    "#anaTable .ppl{color:#a3adbb;font-size:11px}\n" +
    "#anaTable input.hc{width:52px;background:#000000;color:#f0f6fc;border:1px solid #2a2a31;border-radius:4px;padding:2px 4px;font-size:11px;text-align:center}\n" +
    "#anaRoot .ana-foot{font-size:10.5px;color:#6e7681;padding:0 16px 20px;line-height:1.7}\n" +
    "#anaStatus{font-size:11px;color:#a3adbb;margin-left:auto}";

  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  var root = document.createElement("div");
  root.id = "anaRoot";
  root.innerHTML =
    '<div id="anaTop">' +
    '<button class="ana-back" id="anaBack">← 返回看板</button>' +
    "<h1>🏭 车间产出分析</h1><span class='ana-sub'>正常 vs 加班时段产出</span>" +
    '<input type="date" id="anaDate" title="选择历史日期">' +
    '<span id="anaStatus"></span></div>' +
    '<div id="anaBody">' +
    '<div class="ana-note" id="anaNote"></div>' +
    '<div id="anaCards"></div>' +
    '<div class="ana-panel" id="anaDetailWrap" style="display:none">' +
    "<h3 id='anaDetailTitle'></h3><div style='overflow-x:auto'><table id='anaTable'><thead></thead><tbody></tbody></table></div>" +
    '<div class="ana-note" style="margin-top:8px">💡 人数列可手填(仅本车间合计/总人数用途, 存云端); 日后接入共享出勤文件后自动取数。人均 = 产出 ÷ 人数。</div>' +
    "</div></div>" +
    '<div class="ana-foot">口径: 白班加班 17:20–20:20 · 夜班加班 5:50–7:50 · 数据 = MES 10分钟快照差分(班内累计) · True B 已剔除 · 历史归档: 每天 0 点由运行机自动推 archive/日期 (待部署)。' +
    '<br>旧版整点快照(9/2 17:12 前)已兼容解析; 21:50 前夜班数据当晚可见, 完整夜班(20:30→次日8:00)归入开始日。</div>';

  /* root 仅由 openAnaPage() 按需挂载, 禁止页面加载自动显示 */
  var dateInput = root.querySelector("#anaDate");
  var cardsEl = root.querySelector("#anaCards");
  var detailWrap = root.querySelector("#anaDetailWrap");
  var detailTitle = root.querySelector("#anaDetailTitle");
  var tableEl = root.querySelector("#anaTable");
  var statusEl = root.querySelector("#anaStatus");
  var noteEl = root.querySelector("#anaNote");

  root.querySelector("#anaBack").onclick = function () { root.remove(); };

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

  /* 拉取并聚合 */
  function load(date) {
    state.date = date;
    var isToday = date === state.today;
    statusEl.textContent = "加载中…";
    var url = isToday ? DATA_URL : "https://dm111-e8a7d-default-rtdb.firebaseio.com/archive/" + date + ".json";
    Promise.all([
      fetch(url + "?t=" + Date.now(), { signal: AbortSignal.timeout(15000) }).then(function (r) { return r.json(); }),
      loadHC(date)
    ]).then(function (res) {
      var d = res[0] || {};
      if (!d || !d.hourly || Object.keys(d.hourly).length === 0) {
        statusEl.textContent = isToday ? "今天暂无生产数据" : "该日无归档数据 (归档需运行机 0 点推送)";
        cardsEl.innerHTML = '<div class="ana-note">' + statusEl.textContent + "</div>";
        detailWrap.style.display = "none";
        return;
      }
      state.hourly = d.hourly || {};
      state.hc = res[1] || {};
      aggregateAndRender();
      statusEl.textContent = "更新: " + (d.updatedAt || (isToday ? "实时" : date));
    }).catch(function (e) {
      statusEl.textContent = "加载失败: " + e;
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

  function renderCards() {
    var hcAll = {};
    Object.keys(state.hc).forEach(function (ln) {
      var hc = state.hc[ln] || {};
      hcAll[ln] = { n: Number(hc.normal_hc) || 0, o: Number(hc.ot_hc) || 0 };
    });
    var html = "";
    WS_MAP.forEach(function (g) {
      var a = state.wsAgg[g.ws];
      var hcn = 0, hco = 0, nHC = 0;
      g.lines.forEach(function (ln) {
        var h = hcAll[ln];
        if (h && (h.n || h.o)) { nHC++; hcn += h.n; hco += h.o; }
      });
      var dayCmp = "", ntCmp = "";
      if (a.dayOt > 0 && hco > 0 && hcn > 0) {
        var dN = a.dayNorm / hcn, dO = a.dayOt / hco;
        dayCmp = dO >= dN ? '<span class="good">▲ 加班人均 ≥ 正常 (值得)</span>' : '<span class="bad">▼ 加班人均 < 正常 (不值)</span>';
      } else dayCmp = '<span class="na">人数未填, 无法比人均</span>';
      var cls = state.selWs === g.ws ? "ana-card sel" : "ana-card";
      html += '<div class="' + cls + '" data-ws="' + g.ws + '">' +
        "<h3><span>" + g.ws + " <span class='tag'>" + g.tag + "</span></span>" +
        (g.lines.length === 0 ? "<span class='ws-miss'>无线体</span>" : (nHC ? "<span class='ws-hc'>人数已填</span>" : "<span class='ws-miss'>人数空</span>")) +
        "</h3>" +
        '<div class="ana-row"><span class="lb"></span><span class="lb">总产出</span><span class="nm">正常</span><span class="ot">加班</span></div>' +
        '<div class="ana-row"><span class="lb">🌞白班</span><b>' + fmt(a.dayTotal) + '</b><b class="nm">' + fmt(a.dayNorm) + '</b><b class="ot">' + fmt(a.dayOt) + "</b></div>" +
        '<div class="ana-row"><span class="lb">🌙夜班</span><b>' + fmt(a.ntTotal) + '</b><b class="nm">' + fmt(a.ntNorm) + '</b><b class="ot">' + fmt(a.ntOt) + "</b></div>" +
        '<div class="ana-cmp">白班: ' + dayCmp + (a.ntOt > 0 ? "<br>夜班: 加班" + fmt(a.ntOt) : "") + "</div>" +
        "</div>";
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
    detailTitle.textContent = g.ws + " " + g.tag + " · 明细 (点击车间卡可收起)";
    var hcAll = {};
    Object.keys(state.hc).forEach(function (ln) {
      var hc = state.hc[ln] || {};
      hcAll[ln] = { n: hc.normal_hc, o: hc.ot_hc };
    });
    var th = "<tr><th>线体</th><th>白班总</th><th>正常(≤17:20)</th><th>加班(17:20-20:20)</th><th>夜班总</th><th>凌晨段(昨晚夜班)</th><th>正常人数</th><th>加班人数</th><th>正常人均</th><th>加班人均</th></tr>";
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
        "<td>" + (s.nightTail ? fmt(s.nightTail.total) + " (OT " + fmt(s.nightTail.ot) + ")" : "--") + "</td>" +
        "<td><input class='hc' type='number' min='0' value='" + (hc.n || "") + "' data-f='normal_hc'></td>" +
        "<td><input class='hc' type='number' min='0' value='" + (hc.o || "") + "' data-f='ot_hc'></td>" +
        "<td class='ppl'>" + (dayP === null ? "--" : dayP.toFixed(1)) + "</td>" +
        "<td class='ppl'>" + (otP === null ? "--" : otP.toFixed(1)) + "</td></tr>";
    });
    rows += "<tr class='sum'><td>合计 (" + g.lines.length + "线)</td><td>" + fmt(sd.dayTotal) + "</td><td>" + fmt(sd.dayNorm) + "</td><td>" + fmt(sd.dayOt) +
      "</td><td>" + fmt(sd.ntTotal) + "</td><td>" + fmt(sd.ntNorm) + "/OT " + fmt(sd.ntOt) + "</td><td>" + (dN || "") + "</td><td>" + (dO || "") + "</td><td></td><td></td></tr>";
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

  document.body.appendChild(root);
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

  /* 说明 */
  noteEl.textContent = "📊 每线/每班拆出「正常 vs 加班」产出。今天数据实时计算(MES 快照差分); 白班完整需 20:20 后, 夜班完整需次日 8:00 后。选历史日期查看云端归档。";
})();
