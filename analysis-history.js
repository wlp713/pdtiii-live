/* PDTIII 历史经营分析模块
 * 数据源仅为 GitHub Pages 静态文件 history/analytics.json。
 * 不读取、不写入 Firebase；完整日快照只在用户主动回看某日时由主页面加载。
 */
(function () {
  "use strict";

  var DATA_URL = "https://dm111-e8a7d-default-rtdb.firebaseio.com/pdtiii.json";

  var mounted = false;
  var host = null;
  var data = null;
  var analyticsPromise = null;
  var state = { shift: "day", period: "-1", selectedDate: "", workshop: "", line: "", includePartial: false, matrixOpen: false };
  var todayPromise = null;      // 今日实时快照缓存 Promise
  var todayLive = null;         // 今日实时 day 对象({date,lines:{...},totals,quality}) 或 null(非今日模式)
  var resizeTimer = null;
  var resizeBound = false;

  function esc(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function num(value) { value = Number(value); return isFinite(value) ? value : 0; }
  function fmt(value, digits) {
    if (value === null || value === undefined || !isFinite(value)) return "-";
    return Number(value).toLocaleString("en-US", { maximumFractionDigits: digits || 0 });
  }
  function pct(value) { return value === null || value === undefined || !isFinite(value) ? "-" : Number(value).toFixed(1) + "%"; }
  function mean(values) { return values.length ? values.reduce(function (a, b) { return a + b; }, 0) / values.length : null; }
  function cv(values) {
    if (values.length < 3) return null;
    var average = mean(values);
    if (!average) return null;
    var variance = values.reduce(function (sum, value) { return sum + Math.pow(value - average, 2); }, 0) / values.length;
    return Math.sqrt(variance) / average;
  }
  function loadAnalytics(url) {
    if (!analyticsPromise) {
      analyticsPromise = fetch(url || "history/analytics.json", { cache: "no-cache", signal: AbortSignal.timeout(15000) })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function (payload) {
          if (!payload || ![1, 2].includes(payload.schemaVersion) || !Array.isArray(payload.days)) throw new Error("历史索引格式不兼容");
          return payload;
        })
        .catch(function (error) {
          analyticsPromise = null;
          throw error;
        });
    }
    return analyticsPromise;
  }

  function sumMetricItems(items) {
    var normal = items.reduce(function (sum, item) { return sum + num(item && item.normal); }, 0);
    var overtime = items.reduce(function (sum, item) { return sum + num(item && item.overtime); }, 0);
    var plan = items.reduce(function (sum, item) { return sum + num(item && item.plan); }, 0);
    return { normal: normal, overtime: overtime, total: normal + overtime, plan: plan, attainment: plan > 0 ? normal / plan * 100 : null };
  }
  function shiftMetric(scope) {
    if (!scope) return null;
    return state.shift === "full" ? sumMetricItems([scope.day, scope.night].filter(Boolean)) : scope[state.shift];
  }
  function shiftLabel() { return state.shift === "full" ? "全天" : (state.shift === "day" ? "白班" : "夜班"); }
  function qualityStatus(day) {
    if (!day || !day.quality) return "partial";
    if (state.shift !== "full") return day.quality[state.shift + "Status"] || "partial";
    if (day.quality.dayStatus === "partial" || day.quality.nightStatus === "partial") return "partial";
    return day.quality.dayStatus === "complete" && day.quality.nightStatus === "complete" ? "complete" : "comparable";
  }
  function finishedWorkshopMetric(day, workshop) {
    if (day.finishedProducts && day.finishedProducts[workshop]) return shiftMetric(day.finishedProducts[workshop]);
    var configured = (data && data.finishedProductLines && data.finishedProductLines[workshop]) || [];
    return sumMetricItems(configured.map(function (line) {
      return day.lines && day.lines[line] ? shiftMetric(day.lines[line]) : null;
    }).filter(Boolean));
  }
  function metricFor(day, workshop, line) {
    if (line) return day.lines && day.lines[line] ? shiftMetric(day.lines[line]) : null;
    if (workshop) return finishedWorkshopMetric(day, workshop);
    return day.totals ? shiftMetric(day.totals) : null;
  }
  function isTodayMode() { return state.period === "today"; }
  function usableDays() {
    if (!data || !data.days) return [];
    if (isTodayMode()) {
      // 今日实时: 用实时快照 day 对象( suspend 时 todayLive 为 null → 显示 loading/empty)
      //   需按当前班次口径过滤: 夜班未开始时 metricFor(day) 为 null → 排除, 避免渲染层对 null 取值崩溃
      if (!todayLive) return [];
      return [todayLive].filter(function (day) { return !!metricFor(day, state.workshop, state.line); });
    }
    var exactRetrospective = state.period === "-1" && !!state.selectedDate;
    var days = data.days.filter(function (day) {
      if (exactRetrospective) return day.date === state.selectedDate;
      if (day.quality && day.quality.freshnessStatus === "stale") return false;
      return state.includePartial || qualityStatus(day) !== "partial";
    });
    if (state.selectedDate) days = days.filter(function (day) { return day.date <= state.selectedDate; });
    var p = Number(state.period);
    if (exactRetrospective) days = days.filter(function (day) { return day.date === state.selectedDate; });
    else if (!isNaN(p) && p > 0) days = days.slice(-p);
    return days.filter(function (day) { return !!metricFor(day, state.workshop, state.line); });
  }
  function periodLabel() {
    if (isTodayMode()) return "今日";
    if (state.period === "-1") return "单日";
    var p = Number(state.period);
    return isNaN(p) ? "全部" : (p ? p + "日" : "全部");
  }
  function scopeLabel() {
    if (state.line) return state.line;
    if (state.workshop) return state.workshop + " 成品";
    return "全厂";
  }

  function buildShell() {
    host.innerHTML = [
      '<section class="hist-shell" aria-labelledby="histTitle">',
      '  <div class="hist-head">',
      '    <div><h2 id="histTitle">历史产出经营分析</h2><p>从结果看趋势，从差距找到重点线体</p></div>',
      '    <div class="hist-head-actions"><span class="hist-static" id="histSource"><i aria-hidden="true"></i>静态归档 · 不增加数据库流量</span><button class="hist-export" id="histExport" type="button">导出 Excel</button></div>',
      '  </div>',
      '  <div class="hist-controls" aria-label="历史分析筛选">',
      '    <div class="hist-control"><div class="hist-control-label" id="histWsLabel">分析层级<span class="hist-help"><button class="hist-info" type="button" aria-label="查看车间成品产量统计口径" aria-describedby="histScopeTip">?</button><span class="hist-tooltip" id="histScopeTip" role="tooltip">产出分析统一使用成品线口径：Pro.1 全部 6 条，Pro.2 为 Final A-D，Pro.3 为 Welding A-D，Pro.4 和 Pro.5 为全部线体。过程线不会重复计入成品产量。</span></span></div><select id="histWs" aria-labelledby="histWsLabel"><option value="">全厂</option></select></div>',
      '    <label for="histLine"><span>线体钻取</span><select id="histLine"><option value="">全部线体</option></select></label>',
      '    <div class="hist-shift"><span>班次口径</span><div role="group" aria-label="选择班次口径"><button type="button" data-hist-shift="day" aria-pressed="true">白班</button><button type="button" data-hist-shift="night" aria-pressed="false">夜班</button><button type="button" data-hist-shift="full" aria-pressed="false">全天</button></div></div>',
      '    <label class="hist-period"><span>分析周期</span><select id="histPeriod">',
      '      <option value="today">今日 · 实时</option>',
      '      <option value="-1">单日</option>',
      '      <option value="7">近7日</option>',
      '      <option value="14">近14日</option>',
      '      <option value="30">近30日</option>',
      '      <option value="0">全部</option>',
      '    </select></label>',
      '    <label class="hist-partial"><input id="histPartial" type="checkbox"><span>纳入部分归档</span></label>',
      '  </div>',
      '  <div class="hist-quality" id="histQuality" role="status" aria-live="polite"></div>',
      '  <div class="hist-kpis" id="histKpis"></div>',
      '  <div class="hist-insights" id="histInsights"></div>',
      '  <div class="hist-visual-grid">',
      '    <section class="hist-card" aria-labelledby="histTrendTitle"><div class="hist-card-head"><div><h3 id="histTrendTitle">产出与计划趋势</h3><p id="histTrendSub"></p></div><div class="hist-legend"><span><i class="normal"></i>正常产出</span><span><i class="ot"></i>加班产出</span><span><i class="plan"></i>正常段计划</span></div></div><canvas id="histTrendCanvas" role="img" aria-label="历史正常产出、加班产出与正常段计划趋势图"></canvas><div class="hist-empty" id="histTrendEmpty"></div></section>',
      '    <section class="hist-card" aria-labelledby="histGapTitle"><div class="hist-card-head"><div><h3 id="histGapTitle">正常段欠产贡献</h3><p id="histGapSub">按计划减正常产出计算，不把加班产出冲抵正常段差距</p></div></div><canvas id="histGapCanvas" role="img" aria-label="正常段欠产贡献排行图"></canvas><div class="hist-empty" id="histGapEmpty"></div></section>',
      '  </div>',
      '  <section class="hist-card hist-rank" aria-labelledby="histRankTitle"><div class="hist-card-head"><div><h3 id="histRankTitle">线体经营矩阵</h3><p>按车间分类查看成品线的产出、达成、波动和连续风险</p></div><div class="hist-rank-actions"><span id="histRankCount"></span><button class="hist-rank-toggle" id="histRankToggle" type="button" aria-expanded="false" aria-controls="histRankPanel"><span id="histRankToggleText">展开矩阵</span><span class="hist-toggle-icon" aria-hidden="true">⌄</span></button></div></div><div class="hist-table-wrap" id="histRankPanel" hidden><table><thead><tr><th>线体</th><th>车间</th><th>有效日</th><th>总产出</th><th>正常段达成</th><th>加班段产出</th><th>较前日</th><th>稳定性</th><th>连续&lt;90%</th></tr></thead><tbody id="histRankBody"></tbody></table></div></section>',
      '  <details class="hist-method"><summary>指标口径与归档质量</summary><div><b>生产日：</b>当日白班 + 当日上午结束的前一夜班。<b>总产出：</b>正常产出 + 加班产出。<b>正常段达成：</b>正常段产出 ÷ 正常段计划；加班产出不冲抵正常段欠产。<b>稳定性：</b>至少 3 个有效日的日产出变异系数。完整、可比日进入默认经营分析；部分归档仅在手工勾选后纳入。</div></details>',
      '</section>'
    ].join("");
  }

  function populateFilters() {
    var ws = host.querySelector("#histWs");
    Object.keys(data.workshops || {}).forEach(function (name) {
      ws.insertAdjacentHTML("beforeend", '<option value="' + esc(name) + '">' + esc(name) + "</option>");
    });
    fillLineOptions();
    ws.addEventListener("change", function () {
      state.workshop = ws.value;
      state.line = "";
      fillLineOptions();
      render();
    });
    host.querySelector("#histLine").addEventListener("change", function (event) {
      state.line = event.target.value;
      render();
    });
    host.querySelector(".hist-shift").addEventListener("click", function (event) {
      var button = event.target.closest("button[data-hist-shift]");
      if (!button) return;
      state.shift = button.getAttribute("data-hist-shift");
      syncShiftState();
      render();
    });
    host.querySelector("#histPeriod").addEventListener("change", function (event) {
      setPeriod(event.target.value);
    });
    host.querySelector("#histPartial").addEventListener("change", function (event) {
      state.includePartial = event.target.checked;
      render();
    });
    host.querySelector("#histExport").addEventListener("click", exportFinishedProductWorkbook);
    host.querySelector("#histRankToggle").addEventListener("click", function () {
      state.matrixOpen = !state.matrixOpen;
      syncMatrixState();
    });
    syncShiftState();
    syncMatrixState();
  }

  function syncPeriodState() {
    var sel = host.querySelector("#histPeriod");
    if (sel) sel.value = String(state.period);
  }

  function setPeriod(value) {
    state.period = String(value);
    syncPeriodState();
    // 单日档需有选中日期(默认最新归档日)
    if (state.period === "-1" && !state.selectedDate && data && data.days && data.days.length) {
      state.selectedDate = data.days[data.days.length - 1].date;
    }
    // 今日档: 始终重新拉取实时快照(与看板同步)
    var src = host.querySelector("#histSource");
    if (src) {
      src.innerHTML = '<i aria-hidden="true"></i>' + (isTodayMode() ? "实时看板 · 随生产同步" : "静态归档 · 不增加数据库流量");
    }
    if (isTodayMode()) {
      refreshToday();
      return;
    }
    todayLive = null;
    render();
  }

  // ── 今日实时快照(与主看板/归档同源口径, 非静态, 算当前进行中的班次进度) ──
var TODAY_DAY_NORMAL_END = 17 * 60 + 20;   // 白班加班起点 1040
  // 今日实时: 直接读 Firebase 顶层 lines(与主看板同源), 逐线与看板一致。
  //   Motor H 需手动曲线覆盖(plan/target/eff/cb), 口径与主看板相同 → 今日档 Motor H 才与看板一致。
  //   normal/overtime: 白班进行中(<加班起点)全部记 normal, overtime=0(尚未进入加班);
  //     已进加班段则以 hourly 差分加班量(只能拆分已发生部分, 无法预支)。
  //   night: 今日 20:30 白班未结束前 night 为 null(该夜班尚未开始)。
  var TODAY_DAY_END = 20 * 60 + 20;
  var TODAY_NIGHT_START = 20 * 60 + 30;
  var TODAY_NIGHT_END = 8 * 60;             // 凌晨 0-8 属前一夜班, 不作为"今日"夜班
  var H_MANUAL_TARGET = 1800;
  var OT_DAY_START = 17 * 60 + 20;          // 1040
  var OT_NIGHT_START = 5 * 60 + 50 + 1440;  // 1790 跨天基准
  // 今日档手工目标段表(与桌面 index.html DAY_SEGS/NIGHT_SEGS 一致)
  var TODAY_DAY_SEGS = [[480,540],[540,600],[610,660],[660,720],[780,840],[840,900],[910,960],[960,1020],[1040,1100],[1100,1160],[1160,1220]];
  var TODAY_NIGHT_SEGS = [[1230,1290],[1290,1350],[1360,1410],[1410,1470],[1530,1590],[1590,1650],[1650,1710],[1710,1770],[1770,1830],[1830,1910]];
  function _isManualHLine(name) {
    var m = String(name || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
    // 两种写法都判(motorhseries / motorh-series)
    return m.replace(/-/g, "") === "motorhseries";
  }
  function _hManualNormalMins(shift) {
    var table = shift === "night" ? TODAY_NIGHT_SEGS : TODAY_DAY_SEGS;
    var otStart = shift === "night" ? OT_NIGHT_START : OT_DAY_START;
    var m = 0;
    for (var i = 0; i < table.length; i++) { if (table[i][0] >= otStart) break; m += Math.min(table[i][1], otStart) - table[i][0]; }
    return m;
  }
  function _hManualPlanAt(shift, t) {
    var table = shift === "night" ? TODAY_NIGHT_SEGS : TODAY_DAY_SEGS;
    var otStart = shift === "night" ? OT_NIGHT_START : OT_DAY_START;
    var nm = _hManualNormalMins(shift) || 1;
    var pace = H_MANUAL_TARGET / nm;
    var cum = 0;
    for (var i = 0; i < table.length; i++) { if (table[i][0] >= otStart) break; var nEnd = Math.min(t, table[i][1], otStart); if (nEnd > table[i][0]) cum += (nEnd - table[i][0]) * pace; }
    var ot = 0;
    for (var i = 0; i < table.length; i++) { if (table[i][1] <= otStart) continue; if (table[i][0] >= t) break; var oEnd = Math.min(t, table[i][1]); var oStart = Math.max(table[i][0], otStart); if (oEnd > oStart) ot += (oEnd - oStart) * pace; }
    return Math.round(cum + ot);
  }
  // 当前泰国(UTC+7)班次日分钟: 夜班跨天时>1440
  function _todayNowMins() {
    var now = new Date(Date.now() + 7 * 3600 * 1000);
    var m = now.getUTCHours() * 60 + now.getUTCMinutes();
    return m < TODAY_NIGHT_END ? m + 1440 : m; // 凌晨0-8归前一夜班(跨天基准)
  }
  function _todayShift() {
    // 当前进行中的班次: 白班 480-1230; 夜班(当前日历) 1230 起 或 凌晨[0,480)(前一夜间段)
    var m = _todayNowMins() < 1440 ? _todayNowMins() : _todayNowMins() - 1440;
    if (m >= TODAY_DAY_START_ACTUAL && m < TODAY_NIGHT_START) return "day";
    return "night";
  }
  function _todayBkkDate() {
    var now = new Date(Date.now() + 7 * 3600 * 1000);
    var m = now.getUTCHours() * 60 + now.getUTCMinutes();
    // 凌晨0-8归前一天(夜班归属前一生产日), 与生产日口径一致
    var d = new Date(Date.now() + 7 * 3600 * 1000);
    if (m < TODAY_NIGHT_END) d = new Date(d.getTime() - 24 * 3600 * 1000);
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  }
  function _normLine(name) { return String(name || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }
  // hourly 桶 h → 班次日分钟(对齐归档 hour_to_minute): h<60 旧格式(h*60); 否则 HHMM≈(h//100)*60+h%100
  function _h2m(h) {
    var v = Number(h); if (!isFinite(v)) return null;
    if (v < 60) return v * 60;
    return (Math.floor(v / 100)) * 60 + (v % 100);
  }
  function _todayOvertimeFromHourly(hourly, line, shift, nowMins) {
    // 用 hourly 桶差分拆分当前班次的加班产出:
    //   overtime = 当前末桶累计(该线今日) - 该班次到加班起点(白班17:20/夜班5:50)的累计。
    //   仅当已进加班段才有加班量; 未到加班段返回 0。缺桶/异常返回 0(不拆, 全计 normal)。
    if (!hourly) return 0;
    var norm = _normLine(line);
    var arr = null;
    for (var k in hourly) { if (_normLine(k) === norm) { arr = hourly[k]; break; } }
    if (!Array.isArray(arr) || !arr.length) return 0;
    var dayShift = shift === "night";
    var otStart = dayShift ? OT_NIGHT_START % 1440 : OT_DAY_START;   // 夜班 5:50 / 白班 17:20 (分钟制)
    var pts = arr.map(function (b) { var m = _h2m(b && b.h); return { m: m, a: Number(b && b.actual) || 0, p: Number(b && b.plan) || 0 }; }).filter(function (p) { return p.m !== null && isFinite(p.m); }).sort(function (a, b) { return a.m - b.m; });
    if (!pts.length) return 0;
    // 只认当前班次的桶: 白班 h∈[480, 1220]; 夜班 h>=1230 或 凌晨<480(凌晨归前一夜, 今日夜班只有20:30后)
    var inW = dayShift
      ? pts.filter(function (p) { return p.m >= 1230 || p.m < 480; })
      : pts.filter(function (p) { return p.m >= 480 && p.m <= 1220; });
    if (!inW.length) return 0;
    var lastInW = inW[inW.length - 1];
    var lastA = lastInW.a, lastM = lastInW.m;
    // 到加班起点的累计 = 加班起点前最近桶
    var cut = null;
    for (var i = inW.length - 1; i >= 0; i--) { if (inW[i].m <= otStart + (dayShift ? 0 : (lastM < 480 ? -480 : 0))) { cut = inW[i]; break; } }
    // 夜班 cut 只在凌晨段才有; 白班 cut 在 17:20 前
    if (!cut) {
      if (dayShift) return 0;                                   // 白班未到17:20→无加班
      // 夜班: 若还没到凌晨5:50 窗口, 今日夜班刚开始(20:30后, <5:50) → 无加班
      return 0;
    }
    var ot = Math.max(0, Math.round(lastA - cut.a));
    // 白班: 仅当当前已过 17:20 (nowMins>=OT_DAY_START) 才可能有加班; 夜班: only 凌晨段(lastM<480)
    if (dayShift && nowMins < OT_DAY_START) return 0;
    if (!dayShift && lastM >= 480) return 0;
    return ot;
  }
  var TODAY_DAY_START_ACTUAL = 8 * 60;       // 480 白班起点
  var TODAY_END_WRAP = 24 * 60 + 8 * 60;     // 上限(夜班凌晨段基准封顶)
  var _todaySeq = 0;
  function refreshToday() {
    if (!data || !host) return;
    var seq = ++_todaySeq;
    var qEl = host.querySelector("#histQuality"); if (qEl) qEl.className = "hist-quality is-loading";
    var scopes = data.finishedProductLines || data.workshops || {};
    // 与看板一致: 逐线读 d.lines(原始名), 再按 finishedProductLines 归车间
    fetch(DATA_URL, { cache: "no-cache", signal: AbortSignal.timeout(15000) })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (payload) {
        if (seq !== _todaySeq) return;
        var raw = payload.lines || [];
        var byNorm = {};
        raw.forEach(function (l) { if (l && l.name) byNorm[_normLine(l.name)] = l; });
        var nowMins = _todayNowMins();
        var shift = _todayShift();
        var lines = {};
        // 遍历成品车间配置的线名(原始名), 从 d.lines 取当前累计
        Object.keys(scopes).forEach(function (ws) {
          (scopes[ws] || []).forEach(function (lineName) {
            var l = byNorm[_normLine(lineName)];
            if (!l) return;
            var actual = Number(l.actual) || 0;
            var plan = Number(l.plan) || 0;
            var eff = l.eff != null ? Number(l.eff) : (plan > 0 ? Number((actual / plan * 100).toFixed(1)) : null);
            var target = l.target != null ? Number(l.target) : null;
            var isH = _isManualHLine(lineName);
            if (isH) { // 手工曲线覆盖(与看板同口径)
              var sc = _todaySegFor(nowMins);
              var mp = _hManualPlanAt(sc.shift, sc.isNightAndEarlyMorn ? nowMins + 1440 : nowMins);
              target = H_MANUAL_TARGET; plan = mp;
              eff = mp > 0 ? Number((actual / mp * 100).toFixed(1)) : null;
            }
            var dayMetric, nightMetric = null;
            if (shift === "day") {
              var ot = _todayOvertimeFromHourly(payload.hourly, lineName, "day", nowMins);
              var normal = actual - ot;
              dayMetric = { normal: Math.round(normal), overtime: Math.round(ot), total: Math.round(actual), plan: plan, attainment: eff, target: target, eff: eff };
            } else { // night 当前
              var otN = _todayOvertimeFromHourly(payload.hourly, lineName, "night", nowMins);
              var normalN = actual - otN;
              nightMetric = { normal: Math.round(normalN), overtime: Math.round(otN), total: Math.round(actual), plan: plan, attainment: eff, target: target, eff: eff };
            }
            lines[lineName] = { day: dayMetric, night: nightMetric };
          });
        });
        function mkMetric(items) { var n = 0, o = 0, p = 0; Object.keys(items).forEach(function (k) { var v = items[k]; ["day", "night"].forEach(function (s) { var m = v[s]; if (!m) return; n += m.normal; o += m.overtime; p += m.plan; }); }); return { normal: n, overtime: o, total: n + o, plan: p, attainment: p > 0 ? Number((n / p * 100).toFixed(1)) : null, target: null, eff: null }; }
        var totals = { day: { normal: 0, overtime: 0, total: Object.keys(lines).reduce(function (s, k) { var d = lines[k].day; return s + (d ? d.total : 0); }, 0), plan: 0, attainment: null, target: null, eff: null }, night: null };
        // 重算 totals day(逐线 day 汇总)
        var tn = 0, to = 0, tp = 0; Object.keys(lines).forEach(function (k) { var d = lines[k].day; if (d) { tn += d.normal; to += d.overtime; tp += d.plan; } });
        totals.day = { normal: tn, overtime: to, total: tn + to, plan: tp, attainment: tp > 0 ? Number((tn / tp * 100).toFixed(1)) : null, target: null, eff: null };
        todayLive = {
          date: _todayBkkDate(),
          lines: lines, totals: totals,
          quality: { dayStatus: shift === "day" ? "complete" : "partial", nightStatus: shift === "night" ? "complete" : "partial", freshnessStatus: "" },
          snapshotAt: new Date().toISOString().slice(0, 19).replace("T", " ")
        };
        var q = host.querySelector("#histQuality"); if (q) q.className = "hist-quality";
        render();
      })
      .catch(function (e) {
        if (seq !== _todaySeq) return;
        todayLive = null;
        var q = host.querySelector("#histQuality"); if (q) q.className = "hist-quality";
        showError("今日实时加载失败：" + (e && e.message ? e.message : "未知错误"), "history/analytics.json");
      });
  }
  function _todaySegFor() {
    var m = _todayNowMins();
    var early = m >= 1440 && (m - 1440) < TODAY_NIGHT_END; // 凌晨0-8(夜班跨天后半段)
    return { shift: _todayShift(), isNightAndEarlyMorn: early, nowMins: m };
  }

  function syncShiftState() {
    host.querySelectorAll("button[data-hist-shift]").forEach(function (button) {
      var active = button.getAttribute("data-hist-shift") === state.shift;
      button.classList.toggle("on", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function syncMatrixState() {
    var panel = host.querySelector("#histRankPanel");
    var button = host.querySelector("#histRankToggle");
    if (!panel || !button) return;
    panel.hidden = !state.matrixOpen;
    button.setAttribute("aria-expanded", state.matrixOpen ? "true" : "false");
    host.querySelector("#histRankToggleText").textContent = state.matrixOpen ? "收起矩阵" : "展开矩阵";
    host.querySelector(".hist-rank").classList.toggle("is-open", state.matrixOpen);
  }

  function fillLineOptions() {
    var select = host.querySelector("#histLine");
    var lines = [];
    var scopes = data.finishedProductLines || data.workshops || {};
    if (state.workshop) lines = scopes[state.workshop] || [];
    else Object.keys(scopes).forEach(function (ws) { lines = lines.concat(scopes[ws]); });
    select.innerHTML = '<option value="">全部线体</option>' + lines.map(function (line) {
      return '<option value="' + esc(line) + '">' + esc(line) + "</option>";
    }).join("");
    select.value = state.line;
  }

  function lineNamesInScope() {
    var scopes = data.finishedProductLines || data.workshops || {};
    if (state.line) return [state.line];
    if (state.workshop) return (scopes[state.workshop] || []).slice();
    var out = [];
    Object.keys(scopes).forEach(function (ws) { out = out.concat(scopes[ws]); });
    return out;
  }

  function aggregatePeriod(days, workshop, line) {
    var metrics = days.map(function (day) { return metricFor(day, workshop, line); }).filter(Boolean);
    var normal = metrics.reduce(function (sum, item) { return sum + num(item.normal); }, 0);
    var overtime = metrics.reduce(function (sum, item) { return sum + num(item.overtime); }, 0);
    var plan = metrics.reduce(function (sum, item) { return sum + num(item.plan); }, 0);
    return { normal: normal, overtime: overtime, total: normal + overtime, plan: plan, attainment: plan > 0 ? normal / plan * 100 : null, days: metrics.length };
  }

  function previousDelta(days) {
    if (days.length < 2) return null;
    var latest = metricFor(days[days.length - 1], state.workshop, state.line);
    var previous = metricFor(days[days.length - 2], state.workshop, state.line);
    if (!latest || !previous || !num(previous.total)) return null;
    return (num(latest.total) - num(previous.total)) / num(previous.total) * 100;
  }

  function lineRows(days) {
    return lineNamesInScope().map(function (line) {
      var entries = [];
      days.forEach(function (day) {
        var item = day.lines && day.lines[line] ? shiftMetric(day.lines[line]) : null;
        if (item) entries.push({ day: day.date, metric: item });
      });
      var metrics = entries.map(function (entry) { return entry.metric; });
      var total = metrics.reduce(function (sum, item) { return sum + num(item.total); }, 0);
      var normal = metrics.reduce(function (sum, item) { return sum + num(item.normal); }, 0);
      var overtime = metrics.reduce(function (sum, item) { return sum + num(item.overtime); }, 0);
      var plan = metrics.reduce(function (sum, item) { return sum + num(item.plan); }, 0);
      var rates = metrics.map(function (item) { return item.attainment; });
      var streak = 0;
      for (var i = rates.length - 1; i >= 0; i--) {
        if (rates[i] !== null && rates[i] < 90) streak++;
        else break;
      }
      var delta = null;
      if (metrics.length >= 2 && num(metrics[metrics.length - 2].total)) {
        delta = (num(metrics[metrics.length - 1].total) - num(metrics[metrics.length - 2].total)) / num(metrics[metrics.length - 2].total) * 100;
      }
      return {
        line: line,
        workshop: findWorkshop(line),
        days: metrics.length,
        total: total,
        attainment: plan > 0 ? normal / plan * 100 : null,
        overtime: overtime,
        average: metrics.length ? total / metrics.length : null,
        delta: delta,
        variation: cv(metrics.filter(function (item) { return num(item.plan) > 0; }).map(function (item) { return num(item.total); })),
        streak: streak,
        gap: Math.max(0, plan - normal),
      };
    }).filter(function (row) { return row.days > 0; }).sort(function (a, b) { return b.gap - a.gap; });
  }

  function findWorkshop(line) {
    var found = "-";
    Object.keys(data.workshops || {}).some(function (ws) {
      if (data.workshops[ws].indexOf(line) >= 0) { found = ws; return true; }
      return false;
    });
    return found;
  }

  function renderQuality(days) {
    var counts = { complete: 0, comparable: 0, partial: 0 };
    (data.days || []).forEach(function (day) { counts[qualityStatus(day)]++; });
    var staleDays = data.quality && data.quality.staleDays ? data.quality.staleDays : 0;
    var selectedText = days.length ? days[0].date + " → " + days[days.length - 1].date : "无可用日期";
    var anchorDay = state.selectedDate ? (data.days || []).find(function (day) { return day.date === state.selectedDate; }) : null;
    if (isTodayMode()) {
      // 今日实时: 明确标注实时快照, 含更新时间
      var snap = todayLive && todayLive.snapshotAt ? String(todayLive.snapshotAt).substring(11, 16) : "";
      host.querySelector("#histQuality").innerHTML = '<span class="hist-q-label">' + esc(shiftLabel()) + " · " + esc(scopeLabel()) + '</span>' +
        '<span class="hist-q good">今日实时</span>' +
        '<span class="hist-q-range is-caution">数据取自实时看板 · ' + (snap ? "更新 " + esc(snap) : "正在同步") + " · 与生产看板一致</span>";
      return;
    }
    var anchorQuality = anchorDay && anchorDay.quality ? anchorDay.quality : null;
    var anchorStatus = qualityStatus(anchorDay);
    var anchorNote = anchorDay && anchorQuality && anchorQuality.freshnessStatus === "stale" ? " · 过期源" : (anchorDay && anchorStatus === "partial" ? " · 部分归档" : "");
    host.querySelector("#histQuality").innerHTML = '<span class="hist-q-label">' + esc(shiftLabel()) + " · " + esc(scopeLabel()) + '</span>' +
      '<span class="hist-q good">完整 ' + counts.complete + '</span><span class="hist-q info">可比 ' + counts.comparable + '</span><span class="hist-q warn">部分 ' + counts.partial + '</span>' +
      (staleDays ? '<span class="hist-q stale">过期源 ' + staleDays + '</span>' : "") +
      '<span class="hist-q-range' + (anchorQuality && (anchorQuality.freshnessStatus === "stale" || anchorStatus === "partial") ? " is-caution" : "") + '">' +
      (state.selectedDate ? "回看至 " + esc(state.selectedDate) + " · " + periodLabel() + " · " + esc(selectedText) + esc(anchorNote) : "当前 " + periodLabel() + " · " + esc(selectedText) + (state.includePartial ? " · 纳入部分归档" : " · 过滤部分归档") + (staleDays ? " · 过期源不计入" : "")) + "</span>";
  }

  function renderKpis(days, rows) {
    var total = aggregatePeriod(days, state.workshop, state.line);
    var delta = previousDelta(days);
    var risk = rows.filter(function (row) { return row.attainment !== null && row.attainment < 90; }).length;
    var latest = days.length ? metricFor(days[days.length - 1], state.workshop, state.line) : null;
    var singleDay = state.period === "-1" || isTodayMode();
    var outputLabel = singleDay ? "当日产出" : "周期总产出";
    if (state.workshop && !state.line) outputLabel = singleDay ? "当日成品产量" : "周期成品产量";
    if (state.line) outputLabel = singleDay ? "当日线体产出" : "周期线体产出";
    var cards = [
      { code: "OUTPUT", label: outputLabel, value: fmt(total.total), unit: "件", meta: "正常 " + fmt(total.normal) + " · 加班 " + fmt(total.overtime), tone: "blue" },
      { code: "ATTAIN", label: "正常段计划达成", value: pct(total.attainment), unit: "", meta: "正常产出 ÷ 正常段计划", tone: total.attainment !== null && total.attainment >= 95 ? "green" : "amber" },
      { code: "MOMENTUM", label: "较前一有效日", value: delta === null ? "-" : (delta >= 0 ? "+" : "") + delta.toFixed(1) + "%", unit: "", meta: latest ? "最新产出 " + fmt(latest.total) + " 件" : "至少需要 2 个有效日", tone: delta !== null && delta >= 0 ? "green" : "amber" },
      { code: "RISK", label: "低于 90% 线体", value: rows.length ? risk : "-", unit: rows.length ? "条" : "", meta: singleDay ? "按当日正常产出/计划计算" : "按周期正常产出/计划汇总", tone: risk > 0 ? "red" : "green" },
    ];
    host.querySelector("#histKpis").innerHTML = cards.map(function (card) {
      return '<article class="hist-kpi ' + card.tone + '" data-code="' + card.code + '"><span>' + card.label + '</span><strong>' + card.value + (card.unit ? '<small>' + card.unit + "</small>" : "") + '</strong><p>' + card.meta + "</p></article>";
    }).join("");
  }

  function renderInsights(rows) {
    var biggestGap = rows.length ? rows[0] : null;
    var improving = rows.filter(function (row) { return row.delta !== null; }).sort(function (a, b) { return b.delta - a.delta; })[0];
    var longest = rows.slice().sort(function (a, b) { return b.streak - a.streak; })[0];
    var insights = [
      { kind: "focus", title: "最大欠产贡献", body: biggestGap && biggestGap.gap > 0 ? biggestGap.line + " · 缺口 " + fmt(biggestGap.gap) + " 件" : "当前范围未形成正常段欠产" },
      { kind: "up", title: "改善信号", body: improving && improving.delta > 0 ? improving.line + " · 较前日 +" + improving.delta.toFixed(1) + "%" : "暂未识别到明确的环比改善" },
      { kind: "risk", title: "连续风险", body: longest && longest.streak > 0 ? longest.line + " · 连续 " + longest.streak + " 日低于 90%" : "当前范围无连续低达成记录" },
    ];
    host.querySelector("#histInsights").innerHTML = insights.map(function (item) {
      return '<article class="hist-insight ' + item.kind + '"><span>' + item.title + '</span><strong>' + esc(item.body) + "</strong></article>";
    }).join("");
  }

  function setupCanvas(canvas, height) {
    var ratio = window.devicePixelRatio || 1;
    var width = Math.max(300, canvas.clientWidth || 300);
    canvas.style.height = height + "px";
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    var context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    return { context: context, width: width, height: height };
  }

  function drawTrend(days) {
    var canvas = host.querySelector("#histTrendCanvas");
    var box = setupCanvas(canvas, 254);
    var ctx = box.context, width = box.width, height = box.height;
    var empty = host.querySelector("#histTrendEmpty");
    host.querySelector("#histTrendSub").textContent = scopeLabel() + " · " + shiftLabel() + " · 正常产出/加班产出/正常段计划";
    if (!days.length) { empty.textContent = "没有符合当前质量条件的历史数据"; empty.style.display = "grid"; return; }
    empty.style.display = "none";
    var values = days.map(function (day) { return metricFor(day, state.workshop, state.line); });
    var maxValue = Math.max.apply(null, values.reduce(function (all, item) { return all.concat([num(item.normal) + num(item.overtime), num(item.plan)]); }, [1]));
    maxValue = Math.ceil(maxValue / 100) * 100 || 100;
    var left = 54, right = 18, top = 24, bottom = 34, chartW = width - left - right, chartH = height - top - bottom;
    ctx.font = "10px 'Segoe UI',sans-serif";
    for (var i = 0; i <= 4; i++) {
      var y = top + chartH - chartH * i / 4;
      ctx.strokeStyle = i === 0 ? "#cbd5e1" : "#e9eef5";
      ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(width - right, y); ctx.stroke();
      ctx.fillStyle = "#7b899c"; ctx.textAlign = "right"; ctx.fillText(fmt(maxValue * i / 4), left - 8, y + 3);
    }
    var group = chartW / days.length;
    var barW = Math.max(8, Math.min(34, group * 0.52));
    values.forEach(function (item, index) {
      var center = left + group * index + group / 2;
      var normalH = num(item.normal) / maxValue * chartH;
      var otH = num(item.overtime) / maxValue * chartH;
      ctx.fillStyle = "#2563eb"; ctx.fillRect(center - barW / 2, top + chartH - normalH, barW, normalH);
      if (otH > 0) { ctx.fillStyle = "#d97706"; ctx.fillRect(center - barW / 2, top + chartH - normalH - otH, barW, otH); }
    });
    ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = "#334155"; ctx.lineWidth = 2; ctx.beginPath();
    values.forEach(function (item, index) {
      var x = left + group * index + group / 2;
      var y = top + chartH - num(item.plan) / maxValue * chartH;
      index ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.stroke(); ctx.restore();
    var labelStep = Math.max(1, Math.ceil(days.length / 8));
    days.forEach(function (day, index) {
      if (index % labelStep && index !== days.length - 1) return;
      ctx.fillStyle = "#64748b"; ctx.textAlign = "center"; ctx.fillText(day.date.substring(5), left + group * index + group / 2, height - 11);
    });
  }

  function gapRows(days, rows) {
    if (!state.line) return rows.filter(function (row) { return row.gap > 0; }).slice(0, 6).map(function (row) { return { label: row.line, value: row.gap }; });
    return days.map(function (day) {
      var item = metricFor(day, state.workshop, state.line);
      return { label: day.date.substring(5), value: item ? Math.max(0, num(item.plan) - num(item.normal)) : 0 };
    }).filter(function (item) { return item.value > 0; }).sort(function (a, b) { return b.value - a.value; }).slice(0, 6);
  }

  function drawGap(days, rows) {
    var list = gapRows(days, rows);
    var canvas = host.querySelector("#histGapCanvas");
    var height = 254;
    var box = setupCanvas(canvas, height), ctx = box.context, width = box.width;
    var empty = host.querySelector("#histGapEmpty");
    host.querySelector("#histGapSub").textContent = state.line ? state.line + " · 欠产最大的生产日" : "按计划减正常产出计算 · 展示前 6 项";
    if (!list.length) { empty.textContent = "当前范围没有正常段欠产"; empty.style.display = "grid"; return; }
    empty.style.display = "none";
    var maxValue = Math.max.apply(null, list.map(function (item) { return item.value; })) || 1;
    var left = Math.min(150, Math.max(92, width * 0.28)), right = 56, top = 18, rowH = 34, usable = width - left - right;
    list.forEach(function (item, index) {
      var y = top + index * rowH;
      var barW = item.value / maxValue * usable;
      ctx.fillStyle = "#f1f5f9"; ctx.fillRect(left, y + 6, usable, 12);
      ctx.fillStyle = index === 0 ? "#c2410c" : "#d97706"; ctx.fillRect(left, y + 6, barW, 12);
      ctx.fillStyle = "#334155"; ctx.font = "600 10.5px 'Segoe UI',sans-serif"; ctx.textAlign = "right";
      var label = item.label.length > 19 ? item.label.substring(0, 18) + "…" : item.label;
      ctx.fillText(label, left - 9, y + 16);
      ctx.textAlign = "left"; ctx.fillStyle = "#7c3d0a"; ctx.fillText(fmt(item.value), Math.min(width - right + 7, left + barW + 7), y + 16);
    });
  }

  function toneRate(value) { return value === null ? "muted" : (value >= 95 ? "good" : (value >= 90 ? "info" : "bad")); }
  function stabilityLabel(value) {
    if (value === null) return '<span class="hist-pill muted">样本不足</span>';
    if (value <= 0.10) return '<span class="hist-pill good">稳定</span>';
    if (value <= 0.20) return '<span class="hist-pill info">一般</span>';
    return '<span class="hist-pill bad">波动大</span>';
  }
  function renderTable(rows) {
    host.querySelector("#histRankCount").textContent = rows.length + " 条线体";
    var groups = [];
    rows.forEach(function (row) {
      var group = groups.find(function (item) { return item.name === row.workshop; });
      if (!group) { group = { name: row.workshop, rows: [] }; groups.push(group); }
      group.rows.push(row);
    });
    host.querySelector("#histRankBody").innerHTML = groups.map(function (group) {
      var header = '<tr class="hist-workshop-group"><th colspan="9"><span>' + esc(group.name) + '</span><small>' + group.rows.length + ' 条成品线</small></th></tr>';
      var body = group.rows.map(function (row) {
        var delta = row.delta === null ? "-" : (row.delta >= 0 ? "▲ +" : "▼ ") + row.delta.toFixed(1) + "%";
        var deltaClass = row.delta === null ? "muted" : (row.delta >= 0 ? "good" : "bad");
        return '<tr><td><strong>' + esc(row.line) + '</strong></td><td>' + esc(row.workshop) + '</td><td>' + row.days + '</td><td>' + fmt(row.total) + '</td><td><span class="hist-pill ' + toneRate(row.attainment) + '">' + pct(row.attainment) + '</span></td><td>' + fmt(row.overtime) + '</td><td><span class="hist-delta ' + deltaClass + '">' + delta + '</span></td><td>' + stabilityLabel(row.variation) + '</td><td>' + (row.streak ? '<span class="hist-pill bad">' + row.streak + " 日</span>" : '<span class="hist-pill good">无</span>') + "</td></tr>";
      }).join("");
      return header + body;
    }).join("") || '<tr><td colspan="9" class="hist-no-row">当前条件下没有可计算的线体数据</td></tr>';
  }

  function publishAIContext(days, rows) {
    try {
      var latest = days.length ? metricFor(days[days.length - 1], state.workshop, state.line) : null;
      window.__PDTIII_HISTORY_VIEW__ = {
        scope: scopeLabel(), workshop: state.workshop || "全厂", line: state.line || "全部线体",
        shift: shiftLabel(), selectedDate: state.selectedDate || "",
        dateRange: days.length ? days[0].date + " → " + days[days.length - 1].date : "无可用日期",
        qualityMode: state.selectedDate ? ("回看至 " + state.selectedDate + " · " + periodLabel()) : (state.includePartial ? "周期分析·含部分归档" : "周期分析·过滤部分归档"),
        latest: latest ? { normal: num(latest.normal), overtime: num(latest.overtime), total: num(latest.total), plan: num(latest.plan), attainment: latest.attainment } : null,
        trend: days.slice(-14).map(function (day) { var item = metricFor(day, state.workshop, state.line); return { date: day.date, normal: num(item && item.normal), overtime: num(item && item.overtime), total: num(item && item.total), plan: num(item && item.plan), attainment: item && item.attainment }; }),
        topRisks: rows.slice(0, 8).map(function (row) { return { line: row.line, workshop: row.workshop, gap: row.gap, attainment: row.attainment, delta: row.delta, streak: row.streak, average: row.average }; }),
        note: "产出分析与线体经营矩阵统一使用已确认成品线口径。数据来自静态归档，不增加数据库请求。"
      };
    } catch (e) {}
  }

  function finishedMetricForExport(day, workshop, shift) {
    var scope = day && day.finishedProducts && day.finishedProducts[workshop];
    if (scope && scope[shift]) return scope[shift];
    var configured = (data.finishedProductLines && data.finishedProductLines[workshop]) || [];
    return sumMetricItems(configured.map(function (line) {
      return day && day.lines && day.lines[line] && day.lines[line][shift];
    }).filter(Boolean));
  }

  function lineMetric(day, line, shift) {
    var scope = day && day.lines && day.lines[line];
    return scope ? (scope[shift] || null) : null;
  }

  function exportFinishedProductWorkbook() {
    if (!data || !Array.isArray(data.days)) return;
    var scopes = data.finishedProductLines || {};
    var workshops = Object.keys(scopes);
    // 每个车间一个 worksheet；行 = 日期 × 线体，日期列竖向合并，线末尾车间总产出
    var sheets = workshops.map(function (workshop) {
      var header = ["日期", "线体", "白班正常(件)", "白班加班(件)", "白班合计(件)",
                    "夜班正常(件)", "夜班加班(件)", "夜班合计(件)", "线体合计(件)"];
      // body: 每行 [date, lineName, dayNormal, dayOT, dayTotal, nightNormal, nightOT, nightTotal, lineTotal]
      var body = [];
      var lines = scopes[workshop] || [];
      data.days.forEach(function (day) {
        lines.forEach(function (line) {
          var d = lineMetric(day, line, "day");
          var n = lineMetric(day, line, "night");
          var dt = num(d && d.total);
          var nt = num(n && n.total);
          body.push([day.date || "", line,
            num(d && d.normal), num(d && d.overtime), dt,
            num(n && n.normal), num(n && n.overtime), nt,
            dt + nt]);
        });
        // 车间总产出行
        var dayM = finishedMetricForExport(day, workshop, "day");
        var nightM = finishedMetricForExport(day, workshop, "night");
        var dtTot = num(dayM && dayM.total);
        var ntTot = num(nightM && nightM.total);
        body.push([day.date || "", "★ 车间总产出",
          num(dayM && dayM.normal), num(dayM && dayM.overtime), dtTot,
          num(nightM && nightM.normal), num(nightM && nightM.overtime), ntTot,
          dtTot + ntTot]);
      });
      return {
        name: workshop,
        title: "PDTIII 成品产出 · " + workshop + "（按线体" + lines.length + "条 + 车间总产出）",
        header: header,
        body: body,
        dateCol: 0
      };
    });
    var xml = excelWorkbookXml(sheets, data);
    var blob = new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "PDTIII_成品产出归档_" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + ".xls";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function excelEscape(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }
  function excelCell(value, style, type) {
    if (value === null || value === undefined || value === "") return '<Cell ss:StyleID="' + (style || "Body") + '"></Cell>';
    return '<Cell ss:StyleID="' + (style || "Body") + '"><Data ss:Type="' + (type || "String") + '">' + excelEscape(value) + "</Data></Cell>";
  }
  function excelRow(cells) { return "<Row>" + cells.join("") + "</Row>"; }
  function excelWorkbookXml(sheets, payload) {
    // sheets: [{ name, title, header[], body[][] }]
    var xml = '<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">';
    xml += '<DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Author>PDTIII</Author><LastAuthor>Codex</LastAuthor><Created>' + excelEscape(new Date().toISOString()) + '</Created></DocumentProperties>';
    xml += '<Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Center"/><Font ss:FontName="Microsoft YaHei" ss:Size="10" ss:Color="#23324D"/></Style>';
    xml += '<Style ss:ID="Title"><Font ss:FontName="Microsoft YaHei" ss:Size="16" ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#123B75" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/></Style>';
    xml += '<Style ss:ID="Subtitle"><Font ss:FontName="Microsoft YaHei" ss:Size="9" ss:Color="#51657E"/><Interior ss:Color="#EEF4FB" ss:Pattern="Solid"/></Style>';
    xml += '<Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#1F3864" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/></Style>';
    xml += '<Style ss:ID="ShiftDay"><Font ss:Bold="1" ss:Color="#1F3864"/><Interior ss:Color="#DDEBF7" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/></Style>';
    xml += '<Style ss:ID="ShiftNight"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2E4C6D" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/></Style>';
    xml += '<Style ss:ID="Total"><Font ss:Bold="1" ss:Color="#B36A00"/><Interior ss:Color="#FFF4E0" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="1"/></Style>';
    xml += '<Style ss:ID="Body"><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style><Style ss:ID="Number"><NumberFormat ss:Format="#,##0"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style><Style ss:ID="Percent"><NumberFormat ss:Format="0.0%"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style></Styles>';
    sheets.forEach(function (sheet) {
      var name = sheet.name, header = sheet.header, body = sheet.body;
      var colCount = header.length;
      // 列宽：A–I 放大 8 倍
      var widths = [12, 12, 12, 12, 12, 12, 12, 12, 12];
      xml += '<Worksheet ss:Name="' + excelEscape(name) + '"><Table ss:ExpandedColumnCount="' + colCount + '" ss:ExpandedRowCount="' + (body.length + 3) + '">';
      widths.slice(0, colCount).forEach(function (w) { xml += '<Column ss:Width="' + (w * 8) + '"/>'; });
      xml += '<Row ss:Height="28"><Cell ss:MergeAcross="' + (colCount - 1) + '" ss:StyleID="Title"><Data ss:Type="String">' + excelEscape(sheet.title) + '</Data></Cell></Row>';
      xml += '<Row><Cell ss:MergeAcross="' + (colCount - 1) + '" ss:StyleID="Subtitle"><Data ss:Type="String">生产日 = 当日白班 + 次日清晨结束的前一夜班；每行一条线体，★ 车间总产出为人/总，数据来自静态归档，不产生数据库请求。</Data></Cell></Row>';
      // 表头：日期/线体 Header，白班3列 ShiftDay，夜班3列 ShiftNight，合计 Total
      xml += excelRow(header.map(function (value, cIdx) {
        if (cIdx >= 2 && cIdx <= 4) return excelCell(value, "ShiftDay");
        if (cIdx >= 5 && cIdx <= 7) return excelCell(value, "ShiftNight");
        if (cIdx === 8) return excelCell(value, "Total");
        return excelCell(value, "Header");
      }));
      // 日期列竖向合并：连续相同日期合并首行
      var prevDate = null, mergeStart = 0;
      for (var b = 0; b <= body.length; b++) {
        var rowDate = b < body.length ? String(body[b][0] || "") : "\u0000END";
        if (b < body.length && rowDate === prevDate) continue;
        if (prevDate !== null) {
          var mergeLen = b - mergeStart;
          var groupRows = body.slice(mergeStart, b);
          groupRows.forEach(function (row, gi) {
            var cells = [];
            row.forEach(function (value, index) {
              if (index === 0) {
                if (gi === 0) {
                  var dateCell = '<Cell ss:StyleID="Header"' + (mergeLen > 1 ? ' ss:MergeDown="' + (mergeLen - 1) + '"' : '') + '><Data ss:Type="String">' + excelEscape(value) + '</Data></Cell>';
                  cells.push(dateCell);
                } else {
                  cells.push('<Cell ss:StyleID="Header"></Cell>');
                }
              } else if (index === 1) {
                var isTotal = String(value).indexOf("★") === 0;
                cells.push(excelCell(value, isTotal ? "Total" : "Body"));
              } else {
                cells.push(excelCell(value, "Number", "Number"));
              }
            });
            xml += excelRow(cells);
          });
        }
        mergeStart = b;
        prevDate = rowDate;
      }
      xml += '</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>3</SplitHorizontal><TopRowBottomPane>3</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions></Worksheet>';
    });
    xml += '<Worksheet ss:Name="口径说明"><Table ss:ExpandedColumnCount="3"><Column ss:Width="150"/><Column ss:Width="330"/><Column ss:Width="360"/>';
    xml += '<Row ss:Height="28"><Cell ss:MergeAcross="2" ss:StyleID="Title"><Data ss:Type="String">数据口径与归档说明</Data></Cell></Row>';
    xml += excelRow([excelCell("项目", "Header"), excelCell("规则", "Header"), excelCell("说明", "Header")]);
    [["成品线范围", "Pro.1 全部6条；Pro.2 Final A-D；Pro.3 Welding A-D；Pro.4、Pro.5全部线体", "过程线保留在原始源快照中，不进入成品经营汇总。"],
      ["生产日", "当日白班 + 次日清晨结束的前一夜班", "夜班凌晨数据归属夜班开始的前一生产日，避免把前一日晚班算到当日。"],
      ["白班时段", "正常 08:00–17:20；加班 17:20–20:20", "白班边界快照在泰国时间20:20–20:29采集。"],
      ["夜班时段", "正常 20:30–次日05:50；加班05:50–07:50", "夜班边界快照在泰国时间07:50–07:59采集。"],
      ["完整性", "完整 / 可比 / 部分", "未达到边界覆盖或来源日期不符合生产日合同时，不作为默认完整数据。"],
      ["生成时间", payload.generatedAt || "", "导出为 Excel 兼容工作簿，不读取 Firebase。"]].forEach(function (row) {
        xml += excelRow(row.map(function (value) { return excelCell(value, "Body"); }));
      });
    xml += '</Table></Worksheet></Workbook>';
    return xml;
  }

  function render() {
    if (!data || !host) return;
    var days = usableDays();
    var rows = lineRows(days);
    renderQuality(days);
    renderKpis(days, rows);
    renderInsights(rows);
    renderTable(rows);
    publishAIContext(days, rows);
    syncMatrixState();
    requestAnimationFrame(function () { drawTrend(days); drawGap(days, rows); });
  }

  function showError(message, url) {
    host.innerHTML = '<section class="hist-shell hist-load-error"><h2>历史经营分析暂时不可用</h2><p>' + esc(message) + '</p><button type="button" id="histRetry">重新加载</button></section>';
    host.querySelector("#histRetry").onclick = function () { mounted = false; analyticsPromise = null; mount(host, { url: url }); };
  }

  function mount(element, options) {
    if (!element) return;
    host = element;
    if (mounted) { render(); return; }
    mounted = true;
    var url = options && options.url ? options.url : "history/analytics.json";
    host.innerHTML = '<section class="hist-shell hist-loading" aria-busy="true"><span></span><div><strong>正在读取静态历史索引</strong><p>不会访问生产数据库</p></div></section>';
    loadAnalytics(url)
      .then(function (payload) {
        data = payload;
        buildShell();
        populateFilters();
        // 默认今日实时档(开页即同步看板); 进不了今日(加载失败)时落到最新归档日单日
        setPeriod("today");
      })
      .catch(function (error) { showError("加载失败：" + (error && error.message ? error.message : "未知错误"), url); });
    if (!resizeBound) {
      resizeBound = true;
      window.addEventListener("resize", function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(render, 120);
      });
    }
  }

  function setShift(shift) {
    state.shift = shift === "full" ? "full" : (shift === "night" ? "night" : "day");
    syncShiftState();
    syncPeriodState();
    render();
  }

  function setDate(date) {
    state.selectedDate = date || "";
    state.period = state.selectedDate ? "-1" : "7";
    syncPeriodState();
    render();
  }

  window.PDTIIIHistoryModule = { mount: mount, setShift: setShift, setDate: setDate, loadAnalytics: loadAnalytics };
})();
