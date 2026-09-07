/* PDTIII 历史经营分析模块
 * 数据源仅为 GitHub Pages 静态文件 history/analytics.json。
 * 不读取、不写入 Firebase；完整日快照只在用户主动回看某日时由主页面加载。
 */
(function () {
  "use strict";

  var mounted = false;
  var host = null;
  var data = null;
  var analyticsPromise = null;
  var state = { shift: "day", period: 7, selectedDate: "", workshop: "", line: "", includePartial: false, matrixOpen: false };
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
          if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.days)) throw new Error("历史索引格式不兼容");
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
  function finishedWorkshopMetric(day, workshop) {
    if (day.finishedProducts && day.finishedProducts[workshop]) return day.finishedProducts[workshop][state.shift];
    var configured = (data && data.finishedProductLines && data.finishedProductLines[workshop]) || [];
    return sumMetricItems(configured.map(function (line) {
      return day.lines && day.lines[line] ? day.lines[line][state.shift] : null;
    }).filter(Boolean));
  }
  function metricFor(day, workshop, line) {
    if (line) return day.lines && day.lines[line] ? day.lines[line][state.shift] : null;
    if (workshop) return finishedWorkshopMetric(day, workshop);
    return day.totals ? day.totals[state.shift] : null;
  }
  function usableDays() {
    if (!data || !data.days) return [];
    if (state.selectedDate) {
      return data.days.filter(function (day) { return day.date === state.selectedDate && !!metricFor(day, state.workshop, state.line); });
    }
    var key = state.shift + "Status";
    var days = data.days.filter(function (day) {
      if (day.quality && day.quality.freshnessStatus === "stale") return false;
      return state.includePartial || (day.quality && day.quality[key] !== "partial");
    });
    if (state.period > 0) days = days.slice(-state.period);
    return days.filter(function (day) { return !!metricFor(day, state.workshop, state.line); });
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
      '    <span class="hist-static"><i aria-hidden="true"></i>静态归档 · 不增加数据库流量</span>',
      '  </div>',
      '  <div class="hist-controls" aria-label="历史分析筛选">',
      '    <div class="hist-control"><div class="hist-control-label" id="histWsLabel">分析层级<span class="hist-help"><button class="hist-info" type="button" aria-label="查看车间成品产量统计口径" aria-describedby="histScopeTip">?</button><span class="hist-tooltip" id="histScopeTip" role="tooltip">车间层级仅统计成品线。Pro.1 全部 6 条，Pro.2 为 Final A-D，Pro.3 为 Welding A-D，Pro.4 和 Pro.5 为全部线体。线体钻取仍可查看所有工序。</span></span></div><select id="histWs" aria-labelledby="histWsLabel"><option value="">全厂</option></select></div>',
      '    <label for="histLine"><span>线体钻取</span><select id="histLine"><option value="">全部线体</option></select></label>',
      '    <label for="histDate"><span>特定日期</span><select id="histDate"><option value="">按周期查看</option></select></label>',
      '    <div class="hist-period"><span>分析周期</span><div role="group" aria-label="选择历史分析周期">',
      '      <button type="button" data-period="7" class="on" aria-pressed="true">7日</button>',
      '      <button type="button" data-period="14" aria-pressed="false">14日</button>',
      '      <button type="button" data-period="30" aria-pressed="false">30日</button>',
      '      <button type="button" data-period="0" aria-pressed="false">全部</button>',
      '    </div></div>',
      '    <label class="hist-partial"><input id="histPartial" type="checkbox"><span>纳入部分归档</span></label>',
      '  </div>',
      '  <div class="hist-quality" id="histQuality" role="status" aria-live="polite"></div>',
      '  <div class="hist-kpis" id="histKpis"></div>',
      '  <div class="hist-insights" id="histInsights"></div>',
      '  <div class="hist-visual-grid">',
      '    <section class="hist-card" aria-labelledby="histTrendTitle"><div class="hist-card-head"><div><h3 id="histTrendTitle">产出与计划趋势</h3><p id="histTrendSub"></p></div><div class="hist-legend"><span><i class="normal"></i>正常产出</span><span><i class="ot"></i>加班产出</span><span><i class="plan"></i>正常段计划</span></div></div><canvas id="histTrendCanvas" role="img" aria-label="历史正常产出、加班产出与正常段计划趋势图"></canvas><div class="hist-empty" id="histTrendEmpty"></div></section>',
      '    <section class="hist-card" aria-labelledby="histGapTitle"><div class="hist-card-head"><div><h3 id="histGapTitle">正常段欠产贡献</h3><p id="histGapSub">按计划减正常产出计算，不把加班产出冲抵正常段差距</p></div></div><canvas id="histGapCanvas" role="img" aria-label="正常段欠产贡献排行图"></canvas><div class="hist-empty" id="histGapEmpty"></div></section>',
      '  </div>',
      '  <section class="hist-card hist-rank" aria-labelledby="histRankTitle"><div class="hist-card-head"><div><h3 id="histRankTitle">线体经营矩阵</h3><p>展开后查看全部工序的产出、达成、波动和连续风险</p></div><div class="hist-rank-actions"><span id="histRankCount"></span><button class="hist-rank-toggle" id="histRankToggle" type="button" aria-expanded="false" aria-controls="histRankPanel"><span id="histRankToggleText">展开矩阵</span><span class="hist-toggle-icon" aria-hidden="true">⌄</span></button></div></div><div class="hist-table-wrap" id="histRankPanel" hidden><table><thead><tr><th>线体</th><th>车间</th><th>有效日</th><th>总产出</th><th>正常段达成</th><th>日均产出</th><th>较前日</th><th>稳定性</th><th>连续&lt;90%</th></tr></thead><tbody id="histRankBody"></tbody></table></div></section>',
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
    fillDateOptions();
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
    host.querySelector("#histDate").addEventListener("change", function (event) {
      state.selectedDate = event.target.value;
      syncPeriodState();
      render();
    });
    host.querySelector(".hist-period").addEventListener("click", function (event) {
      var button = event.target.closest("button[data-period]");
      if (!button) return;
      state.period = Number(button.getAttribute("data-period"));
      host.querySelectorAll("button[data-period]").forEach(function (item) {
        var active = item === button;
        item.classList.toggle("on", active);
        item.setAttribute("aria-pressed", active ? "true" : "false");
      });
      render();
    });
    host.querySelector("#histPartial").addEventListener("change", function (event) {
      state.includePartial = event.target.checked;
      render();
    });
    host.querySelector("#histRankToggle").addEventListener("click", function () {
      state.matrixOpen = !state.matrixOpen;
      syncMatrixState();
    });
    syncPeriodState();
    syncMatrixState();
  }

  function fillDateOptions() {
    var select = host.querySelector("#histDate");
    var key = state.shift + "Status";
    var options = (data.days || []).slice().reverse().map(function (day) {
      var status = day.quality && day.quality.freshnessStatus === "stale" ? "过期源" : ((day.quality && day.quality[key]) || "partial");
      var label = status === "complete" ? "完整" : (status === "comparable" ? "可比" : (status === "partial" ? "部分" : status));
      return '<option value="' + esc(day.date) + '">' + esc(day.date + "  [" + label + "]") + "</option>";
    }).join("");
    select.innerHTML = '<option value="">按周期查看</option>' + options;
    select.value = state.selectedDate;
  }

  function syncPeriodState() {
    var exact = !!state.selectedDate;
    host.querySelectorAll("button[data-period]").forEach(function (button) {
      button.disabled = exact;
      button.setAttribute("aria-disabled", exact ? "true" : "false");
    });
    host.querySelector(".hist-period").classList.toggle("is-disabled", exact);
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
    if (state.workshop) lines = (data.workshops && data.workshops[state.workshop]) || [];
    else Object.keys(data.workshops || {}).forEach(function (ws) { lines = lines.concat(data.workshops[ws]); });
    select.innerHTML = '<option value="">全部线体</option>' + lines.map(function (line) {
      return '<option value="' + esc(line) + '">' + esc(line) + "</option>";
    }).join("");
    select.value = state.line;
  }

  function lineNamesInScope() {
    if (state.line) return [state.line];
    if (state.workshop) return ((data.workshops || {})[state.workshop] || []).slice();
    var out = [];
    Object.keys(data.workshops || {}).forEach(function (ws) { out = out.concat(data.workshops[ws]); });
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
        var item = day.lines && day.lines[line] ? day.lines[line][state.shift] : null;
        if (item) entries.push({ day: day.date, metric: item });
      });
      var metrics = entries.map(function (entry) { return entry.metric; });
      var total = metrics.reduce(function (sum, item) { return sum + num(item.total); }, 0);
      var normal = metrics.reduce(function (sum, item) { return sum + num(item.normal); }, 0);
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
    var key = state.shift + "Status";
    var counts = { complete: 0, comparable: 0, partial: 0 };
    (data.days || []).forEach(function (day) { counts[(day.quality && day.quality[key]) || "partial"]++; });
    var staleDays = data.quality && data.quality.staleDays ? data.quality.staleDays : 0;
    var selectedText = days.length ? days[0].date.substring(5) + " → " + days[days.length - 1].date.substring(5) : "无可用日期";
    var exactDay = state.selectedDate && days.length ? days[0] : null;
    var exactQuality = exactDay && exactDay.quality ? exactDay.quality : null;
    var exactStatus = exactQuality ? exactQuality[key] : null;
    var exactNote = "";
    if (exactDay) {
      selectedText = exactDay.date;
      if (exactQuality.freshnessStatus === "stale") exactNote = " · 过期源，仅供追溯";
      else if (exactStatus === "partial") exactNote = " · 部分归档，请谨慎使用";
      else exactNote = " · " + (exactStatus === "complete" ? "完整归档" : "可比归档");
    }
    host.querySelector("#histQuality").innerHTML = '<span class="hist-q-label">' + esc(state.shift === "day" ? "白班" : "夜班") + " · " + esc(scopeLabel()) + '</span>' +
      '<span class="hist-q good">完整 ' + counts.complete + '</span><span class="hist-q info">可比 ' + counts.comparable + '</span><span class="hist-q warn">部分 ' + counts.partial + '</span>' +
      (staleDays ? '<span class="hist-q stale">过期源 ' + staleDays + '</span>' : "") +
      '<span class="hist-q-range' + (exactQuality && (exactQuality.freshnessStatus === "stale" || exactStatus === "partial") ? " is-caution" : "") + '">' +
      (exactDay ? "特定日期回看 · " + esc(selectedText) + esc(exactNote) : "当前计算 " + days.length + " 日 · " + esc(selectedText) + (state.includePartial ? " · 纳入部分归档" : " · 过滤部分归档") + (staleDays ? " · 过期源不计入" : "")) + "</span>";
  }

  function renderKpis(days, rows) {
    var total = aggregatePeriod(days, state.workshop, state.line);
    var delta = previousDelta(days);
    var risk = rows.filter(function (row) { return row.attainment !== null && row.attainment < 90; }).length;
    var latest = days.length ? metricFor(days[days.length - 1], state.workshop, state.line) : null;
    var outputLabel = state.selectedDate ? "当日产出" : "周期总产出";
    if (state.workshop && !state.line) outputLabel = state.selectedDate ? "当日成品产量" : "周期成品产量";
    if (state.line) outputLabel = state.selectedDate ? "当日线体产出" : "周期线体产出";
    var cards = [
      { code: "OUTPUT", label: outputLabel, value: fmt(total.total), unit: "件", meta: "正常 " + fmt(total.normal) + " · 加班 " + fmt(total.overtime), tone: "blue" },
      { code: "ATTAIN", label: "正常段计划达成", value: pct(total.attainment), unit: "", meta: "正常产出 ÷ 正常段计划", tone: total.attainment !== null && total.attainment >= 95 ? "green" : "amber" },
      { code: "MOMENTUM", label: "较前一有效日", value: delta === null ? "-" : (delta >= 0 ? "+" : "") + delta.toFixed(1) + "%", unit: "", meta: latest ? "最新产出 " + fmt(latest.total) + " 件" : "至少需要 2 个有效日", tone: delta !== null && delta >= 0 ? "green" : "amber" },
      { code: "RISK", label: "低于 90% 线体", value: rows.length ? risk : "-", unit: rows.length ? "条" : "", meta: state.selectedDate ? "按当日正常产出/计划计算" : "按周期正常产出/计划汇总", tone: risk > 0 ? "red" : "green" },
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
    host.querySelector("#histTrendSub").textContent = scopeLabel() + " · " + (state.shift === "day" ? "白班" : "夜班") + " · 正常产出/加班产出/正常段计划";
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
    host.querySelector("#histRankBody").innerHTML = rows.map(function (row) {
      var delta = row.delta === null ? "-" : (row.delta >= 0 ? "▲ +" : "▼ ") + row.delta.toFixed(1) + "%";
      var deltaClass = row.delta === null ? "muted" : (row.delta >= 0 ? "good" : "bad");
      return '<tr><td><strong>' + esc(row.line) + '</strong></td><td>' + esc(row.workshop) + '</td><td>' + row.days + '</td><td>' + fmt(row.total) + '</td><td><span class="hist-pill ' + toneRate(row.attainment) + '">' + pct(row.attainment) + '</span></td><td>' + fmt(row.average) + '</td><td><span class="hist-delta ' + deltaClass + '">' + delta + '</span></td><td>' + stabilityLabel(row.variation) + '</td><td>' + (row.streak ? '<span class="hist-pill bad">' + row.streak + " 日</span>" : '<span class="hist-pill good">无</span>') + "</td></tr>";
    }).join("") || '<tr><td colspan="9" class="hist-no-row">当前条件下没有可计算的线体数据</td></tr>';
  }

  function publishAIContext(days, rows) {
    try {
      var latest = days.length ? metricFor(days[days.length - 1], state.workshop, state.line) : null;
      window.__PDTIII_HISTORY_VIEW__ = {
        scope: scopeLabel(), workshop: state.workshop || "全厂", line: state.line || "全部线体",
        shift: state.shift === "day" ? "白班" : "夜班", selectedDate: state.selectedDate || "",
        dateRange: days.length ? days[0].date + " → " + days[days.length - 1].date : "无可用日期",
        qualityMode: state.selectedDate ? "指定日期回看" : (state.includePartial ? "周期分析·含部分归档" : "周期分析·过滤部分归档"),
        latest: latest ? { normal: num(latest.normal), overtime: num(latest.overtime), total: num(latest.total), plan: num(latest.plan), attainment: latest.attainment } : null,
        trend: days.slice(-14).map(function (day) { var item = metricFor(day, state.workshop, state.line); return { date: day.date, normal: num(item && item.normal), overtime: num(item && item.overtime), total: num(item && item.total), plan: num(item && item.plan), attainment: item && item.attainment }; }),
        topRisks: rows.slice(0, 8).map(function (row) { return { line: row.line, workshop: row.workshop, gap: row.gap, attainment: row.attainment, delta: row.delta, streak: row.streak, average: row.average }; }),
        note: "车间层级为成品线口径；线体钻取为全部工序线。数据来自静态归档，不增加数据库请求。"
      };
    } catch (e) {}
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
        render();
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
    state.shift = shift === "night" ? "night" : "day";
    if (data && host && host.querySelector("#histDate")) fillDateOptions();
    render();
  }

  window.PDTIIIHistoryModule = { mount: mount, setShift: setShift, loadAnalytics: loadAnalytics };
})();
