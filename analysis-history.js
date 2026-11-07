/* PDTIII 产出分析 · 每日结算 / 归档健康 / 车间每日趋势
 * 2026-11-08 重写：深色、目视化、缺档占位、不编数。
 * 只读 history/analytics.json；不写 Firebase，不改归档。
 */
(function () {
  "use strict";

  var WS = ["Pro.1", "Pro.2", "Pro.3", "Pro.4", "Pro.5"];
  var WS_LABEL = { "Pro.1": "Pro.1", "Pro.2": "Pro.2", "Pro.3": "Pro.3", "Pro.4": "Pro.4", "Pro.5": "Pro.5" };
  var state = { host: null, data: null, promise: null, shift: "day", selected: "", onDate: null, styleReady: false, resizeTimer: null };
  var STATUS_LABEL = { complete: "完好", partial: "部分", missing: "缺档", invalid: "异常" };
  var ISSUE_LABEL = {
    shiftEndNotReached: "未到班次末桶", lineCoverage: "线体不足", allActualZero: "实际全为 0",
    actualRegression: "累计回落", noPlanOrOutput: "无计划/无产出", bucketDateMismatch: "桶日期不符",
    startCarryover: "起点桶残留", idleLines: "停线", earlyStoppedLines: "提前停线",
    sourceWindowExpired: "缓冲已过期", productionDateMismatch: "日期串档", noArchiveFile: "无归档文件",
    legacyQualityUnverified: "旧快照完整度存疑"
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(value) { var n = Number(value); return isFinite(n) ? n : 0; }
  function fmt(value) { return Math.round(num(value)).toLocaleString("en-US"); }
  function pct(value) { return value === null || value === undefined || !isFinite(Number(value)) ? "—" : Number(value).toFixed(1) + "%"; }
  function tone(value) { if (value === null || value === undefined) return "na"; return value >= 90 ? "good" : value >= 80 ? "warn" : "bad"; }
  function toneText(value) { return tone(value) === "good" ? "good" : tone(value) === "warn" ? "warn" : tone(value) === "bad" ? "bad" : "na"; }
  function dateLabel(date) { return date ? date.slice(5) : "—"; }
  function weekday(date) {
    if (!date) return "";
    var d = new Date(date + "T00:00:00+07:00");
    return ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][d.getDay()] || "";
  }
  function issueText(issues) {
    if (!issues || !issues.length) return "";
    return issues.map(function (item) { return ISSUE_LABEL[item.code] || item.code || "问题"; }).join(" · ");
  }
  function statusLabel(status) { return STATUS_LABEL[status] || "未知"; }

  function metricOf(day, workshop, shift) {
    if (!day) return null;
    var scope = workshop ? (day.finishedProducts || {})[workshop] : day.totals;
    if (!scope) return null;
    if (shift === "full") {
      var d = scope.day, n = scope.night;
      if (!d || !n) return null;
      var normal = num(d.normal) + num(n.normal);
      var overtime = num(d.overtime) + num(n.overtime);
      var plan = num(d.plan) + num(n.plan);
      return { normal: normal, overtime: overtime, total: normal + overtime, plan: plan, attainment: plan > 0 ? normal / plan * 100 : null };
    }
    return scope[shift] || null;
  }

  function healthMap() {
    var map = {};
    ((state.data && state.data.health && state.data.health.days) || []).forEach(function (item) { map[item.date] = item; });
    return map;
  }
  function statusOf(date, shift, day, map) {
    var entry = map[date];
    if (shift === "full") {
      var d = statusOf(date, "day", day, map), n = statusOf(date, "night", day, map);
      if (d === "invalid" || n === "invalid") return "invalid";
      if (d === "missing" || n === "missing") return "missing";
      return d === "partial" || n === "partial" ? "partial" : "complete";
    }
    if (entry && entry[shift] && entry[shift].status) return entry[shift].status;
    if (day && day.archiveStatus && day.archiveStatus[shift]) return day.archiveStatus[shift];
    if (day && day.quality) {
      var legacy = day.quality[shift + "Status"];
      if (legacy) return legacy === "partial" ? "partial" : "complete";
    }
    return "missing";
  }
  function issuesOf(date, shift, map) {
    var entry = map[date];
    if (!entry) return [];
    if (shift === "full") {
      return [].concat((entry.day && entry.day.issues) || [], (entry.night && entry.night.issues) || []);
    }
    return (entry[shift] && entry[shift].issues) || [];
  }
  function dayByDate(date) {
    var days = (state.data && state.data.days) || [];
    for (var i = 0; i < days.length; i++) if (days[i].date === date) return days[i];
    return null;
  }
  function latestDataDate() {
    var days = (state.data && state.data.days) || [];
    if (days.length) return days[days.length - 1].date;
    var health = (state.data && state.data.health && state.data.health.days) || [];
    return health.length ? health[health.length - 1].date : "";
  }
  function healthDates() {
    return ((state.data && state.data.health && state.data.health.days) || []).map(function (item) { return item.date; });
  }
  function allArchiveDates() {
    var set = {};
    healthDates().forEach(function (d) { set[d] = 1; });
    ((state.data && state.data.days) || []).forEach(function (d) { set[d.date] = 1; });
    return Object.keys(set).sort();
  }
  function resolveSelected() {
    var dates = healthDates();
    var days = (state.data && state.data.days) || [];
    if (state.selected && /^\d{4}-\d{2}-\d{2}$/.test(state.selected)) return state.selected;
    var valid = {};
    dates.forEach(function (d) { valid[d] = 1; });
    days.forEach(function (d) { valid[d.date] = 1; });
    if (state.selected && valid[state.selected]) return state.selected;
    var latest = latestDataDate();
    state.selected = latest || (dates.length ? dates[dates.length - 1] : "");
    return state.selected;
  }

  function loadAnalytics(url) {
    if (!state.promise) {
      state.promise = fetch(url || "history/analytics.json", { cache: "no-cache", signal: AbortSignal.timeout(15000) })
        .then(function (response) {
          if (!response.ok) throw new Error("HTTP " + response.status);
          return response.json();
        })
        .then(function (payload) {
          if (!payload || payload.schemaVersion !== 2 || !Array.isArray(payload.days)) throw new Error("历史索引格式不兼容");
          state.data = payload;
          if (state.host) render();
          return payload;
        })
        .catch(function (error) {
          state.promise = null;
          if (state.host) {
            state.host.innerHTML = '<div class="hop-error">历史归档读取失败：' + esc(error && error.message || error) + "</div>";
          }
          throw error;
        });
    }
    return state.promise;
  }

  function styleOnce() {
    if (state.styleReady || document.getElementById("histOpsStyle")) { state.styleReady = true; return; }
    var css = [
      "#histOps{--hop-panel:#101014;--hop-panel2:#15151b;--hop-line:rgba(255,255,255,.08);--hop-line2:rgba(255,255,255,.14);--hop-text:#f4f4f5;--hop-muted:#a1a1aa;--hop-dim:#71717a;--hop-blue:#3b82f6;--hop-orange:#f59e0b;--hop-green:#10b981;--hop-red:#ef4444;--hop-gold:#eab308;--hop-purple:#a78bfa;color:var(--hop-text);font-size:13px;margin:0 0 12px}",
      "#histOps *{box-sizing:border-box}",
      "#histOps .hop-panel{background:linear-gradient(180deg,rgba(22,22,27,.94),rgba(14,14,18,.97));border:1px solid var(--hop-line);border-radius:14px;padding:10px 12px;margin-bottom:10px;box-shadow:0 12px 36px rgba(0,0,0,.28);position:relative;overflow:hidden}",
      "#histOps .hop-panel::before{content:'';position:absolute;left:0;right:0;top:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.16),transparent)}",
      "#histOps .hop-head{display:flex;align-items:center;gap:9px;margin-bottom:6px;min-height:22px}",
      "#histOps .hop-head h2{font-size:14px;font-weight:800;letter-spacing:.3px;display:flex;align-items:center;gap:8px}",
      "#histOps .hop-head h2 .pl{width:7px;height:7px;border-radius:2px;background:var(--hop-blue)}",
      "#histOps .hop-head .sub{font-size:11px;color:var(--hop-dim)}",
      "#histOps .hop-right{margin-left:auto;display:flex;align-items:center;gap:7px;flex-wrap:wrap;justify-content:flex-end}",
      "#histOps .hop-date{height:30px;padding:4px 8px;border-radius:8px;border:1px solid var(--hop-line2);background:var(--hop-panel2);color:var(--hop-text);font:inherit;font-size:12px;color-scheme:dark}",
      "#histOps .hop-btn{height:28px;padding:0 10px;border-radius:8px;border:1px solid var(--hop-line2);background:var(--hop-panel2);color:var(--hop-muted);font:inherit;font-size:11px;font-weight:700;cursor:pointer}",
      "#histOps .hop-btn:hover{color:var(--hop-text);border-color:var(--hop-blue)}",
      "#histOps .hop-btn:focus-visible,#histOps .hop-date:focus-visible,#histOps .hop-hcell:focus-visible{outline:2px solid var(--hop-blue);outline-offset:2px}",
      "#histOps .hop-badge{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:800;padding:2px 7px;border-radius:20px;border:1px solid;white-space:nowrap}",
      "#histOps .hop-badge.complete{color:#34d399;border-color:rgba(16,185,129,.45);background:rgba(16,185,129,.1)}",
      "#histOps .hop-badge.partial{color:#fbbf24;border-color:rgba(245,158,11,.45);background:rgba(245,158,11,.1)}",
      "#histOps .hop-badge.missing{color:#f87171;border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.08)}",
      "#histOps .hop-badge.invalid{color:#c4b5fd;border-color:rgba(167,139,250,.45);background:rgba(167,139,250,.1)}",
      "#histOps .hop-settle{display:grid;grid-template-columns:360px minmax(0,1fr);gap:8px;align-items:start}",
      "#histOps .hop-scards{display:grid;grid-template-rows:auto auto;gap:6px}",
      "#histOps .hop-scard{border:1px solid var(--hop-line);border-radius:11px;padding:7px 10px;background:var(--hop-panel2);position:relative;overflow:hidden;min-width:0}",
      "#histOps .hop-scard::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--hop-blue)}",
      "#histOps .hop-scard.night::before{background:var(--hop-gold)}",
      "#histOps .hop-scard.partial::before{background:var(--hop-orange)}",
      "#histOps .hop-scard.missing{border-style:dashed;border-color:rgba(255,255,255,.18);background:repeating-linear-gradient(135deg,rgba(255,255,255,.02),rgba(255,255,255,.02) 7px,transparent 7px,transparent 14px)}",
      "#histOps .hop-scard.missing::before{background:var(--hop-red)}",
      "#histOps .hop-scard.invalid::before{background:var(--hop-purple)}",
      "#histOps .hop-scard .r1{display:flex;align-items:center;gap:7px;margin-bottom:2px}",
      "#histOps .hop-scard .nm{font-size:12px;font-weight:800}",
      "#histOps .hop-scard .r1 .hop-badge{margin-left:auto}",
      "#histOps .hop-scard .big{font-size:22px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1}",
      "#histOps .hop-scard .big small{font-size:10.5px;color:var(--hop-dim);font-weight:600;margin-left:4px}",
      "#histOps .hop-scard .meta{display:flex;gap:9px;font-size:10.5px;color:var(--hop-dim);margin-top:3px;flex-wrap:wrap}",
      "#histOps .hop-scard .meta b{color:var(--hop-muted);font-weight:700}",
      "#histOps .hop-scard .miss-reason{font-size:10.5px;color:var(--hop-dim);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
      "#histOps .hop-attain{display:flex;align-items:center;gap:7px;margin-top:4px}",
      "#histOps .hop-attain .track{flex:1;height:5px;border-radius:6px;background:rgba(255,255,255,.07);overflow:hidden}",
      "#histOps .hop-attain .fill{height:100%;border-radius:6px;background:var(--hop-red)}",
      "#histOps .hop-attain .pc{font-size:11px;font-weight:800;color:#f87171;font-variant-numeric:tabular-nums}",
      "#histOps .hop-attain .pc.good{color:#34d399}#histOps .hop-attain .pc.warn{color:#fbbf24}#histOps .hop-attain .pc.na{color:var(--hop-dim)}",
      "#histOps .hop-wslist{display:flex;flex-direction:column;gap:3px;min-width:0}",
      "#histOps .hop-wsrow{display:grid;grid-template-columns:40px 1fr 1fr;gap:6px;align-items:center;background:var(--hop-panel2);border:1px solid var(--hop-line);border-radius:9px;padding:3px 7px;min-width:0}",
      "#histOps .hop-wsrow .nm{font-size:11px;font-weight:800;color:var(--hop-muted)}",
      "#histOps .hop-ws{min-width:0}",
      "#histOps .hop-ws .wh{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--hop-dim);margin-bottom:1px}",
      "#histOps .hop-ws .wh .q{font-size:10px;font-weight:800;color:var(--hop-dim)}",
      "#histOps .hop-ws .track{height:7px;border-radius:5px;background:rgba(255,255,255,.06);position:relative;overflow:hidden}",
      "#histOps .hop-ws .fill{height:100%;display:flex}",
      "#histOps .hop-ws .normal{background:var(--hop-blue)}#histOps .hop-ws .ot{background:var(--hop-gold)}",
      "#histOps .hop-ws .plan{position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--hop-orange);box-shadow:0 0 5px rgba(245,158,11,.6)}",
      "#histOps .hop-ws .cap{display:flex;justify-content:space-between;font-size:10px;color:var(--hop-dim);margin-top:1px;font-variant-numeric:tabular-nums}",
      "#histOps .hop-ws .cap b{color:var(--hop-muted)}",
      "#histOps .hop-ws.missing .track{background:repeating-linear-gradient(135deg,rgba(255,255,255,.04),rgba(255,255,255,.04) 4px,transparent 4px,transparent 8px);border:1px dashed rgba(255,255,255,.16)}",
      "#histOps .hop-ws.missing .cap{color:var(--hop-dim)}",
      "#histOps .hop-health{display:grid;grid-template-columns:repeat(30,minmax(0,1fr));gap:3px;margin-top:9px}",
      "#histOps .hop-hcell{height:16px;border-radius:4px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.06);position:relative;cursor:pointer;padding:0}",
      "#histOps .hop-hcell.complete{background:rgba(16,185,129,.55);border-color:rgba(16,185,129,.75)}",
      "#histOps .hop-hcell.partial{background:linear-gradient(90deg,rgba(245,158,11,.7) 50%,rgba(245,158,11,.2) 50%);border-color:rgba(245,158,11,.65)}",
      "#histOps .hop-hcell.missing{background:repeating-linear-gradient(135deg,rgba(255,255,255,.06),rgba(255,255,255,.06) 3px,transparent 3px,transparent 6px);border:1px dashed rgba(255,255,255,.22)}",
      "#histOps .hop-hcell.invalid{background:rgba(167,139,250,.55);border-color:rgba(167,139,250,.8)}",
      "#histOps .hop-hcell.on{box-shadow:0 0 0 2px var(--hop-blue),0 0 8px rgba(59,130,246,.55)}",
      "#histOps .hop-trends{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}",
      "#histOps .hop-tcard{background:var(--hop-panel2);border:1px solid var(--hop-line);border-radius:11px;padding:7px 9px 5px;min-width:0}",
      "#histOps .hop-tcard .th{display:flex;align-items:center;gap:6px;margin-bottom:2px}",
      "#histOps .hop-tcard .tn{font-size:12px;font-weight:800;color:var(--hop-text)}",
      "#histOps .hop-tcard .tchip{margin-left:auto;font-size:10.5px;font-weight:800;padding:2px 6px;border-radius:20px;border:1px solid rgba(255,255,255,.12);color:var(--hop-muted);background:rgba(255,255,255,.04)}",
      "#histOps .hop-tcard canvas{width:100%;height:100px;display:block}",
      "#histOps .hop-tcard .tf{display:flex;justify-content:space-between;font-size:10.5px;color:var(--hop-dim);margin-top:2px}",
      "#histOps .hop-error{padding:24px;color:#f87171;font-size:12px}",
      "#histOps .hop-empty{padding:20px;color:var(--hop-dim);font-size:12px;text-align:center}",
      "@media (max-width:1500px){#histOps .hop-settle{grid-template-columns:320px minmax(0,1fr)}}",
      "@media (max-width:1180px){#histOps .hop-trends{grid-template-columns:repeat(3,minmax(0,1fr))}#histOps .hop-settle{grid-template-columns:1fr}#histOps .hop-scards{grid-template-rows:auto;grid-template-columns:1fr 1fr}}",
      "@media (max-height:780px){#histOps .hop-panel{padding:8px 11px;margin-bottom:8px}#histOps .hop-head{margin-bottom:5px}#histOps .hop-scard{padding:7px 9px}#histOps .hop-scard .big{font-size:20px}#histOps .hop-tcard canvas{height:94px}#histOps .hop-health{margin-top:6px}#histOps .hop-hcell{height:13px}#histOps .hop-wsrow{padding:3px 7px}}",
      "@media (max-height:700px){#histOps .hop-panel{padding:4px 9px;margin-bottom:4px}#histOps .hop-head{margin-bottom:2px;min-height:17px}#histOps .hop-head h2{font-size:13px}#histOps .hop-head .sub{font-size:10.5px}#histOps .hop-scard{padding:4px 7px}#histOps .hop-scard .big{font-size:18px}#histOps .hop-scard .meta{font-size:10px;gap:5px}#histOps .hop-scard .r1{margin-bottom:1px}#histOps .hop-scard .hop-attain{margin-top:2px}#histOps .hop-wsrow{padding:1px 6px}#histOps .hop-ws .track{height:6px}#histOps .hop-ws .cap{display:none}#histOps .hop-ws .wh{font-size:10px}#histOps .hop-health{margin-top:4px}#histOps .hop-hcell{height:8px}#histOps .hop-tcard{padding:4px 6px 3px}#histOps .hop-tcard canvas{height:64px}#histOps .hop-tcard .tf{display:none}#histOps .hop-tcard .tn{font-size:11.5px}#histOps .hop-settle{grid-template-columns:280px minmax(0,1fr);gap:4px}#histOps .hop-scards{gap:4px}#histOps .hop-btn{height:23px;font-size:10.5px;padding:0 7px}#histOps .hop-date{height:24px;font-size:11px;padding:2px 6px}#histOps .hop-badge{font-size:10px;padding:1px 5px}#histOps .hop-trends{gap:5px}}",
      "@media (min-height:1100px){#histOps .hop-panel{padding:10px 12px;margin-bottom:10px}#histOps .hop-head{min-height:24px;margin-bottom:8px}#histOps .hop-head h2{font-size:14px}#histOps .hop-scard{padding:9px 11px}#histOps .hop-scard .big{font-size:26px}#histOps .hop-scard .meta{font-size:11px;gap:10px}#histOps .hop-scard .miss-reason{font-size:11px}#histOps .hop-wsrow{padding:5px 8px}#histOps .hop-ws .track{height:8px}#histOps .hop-ws .wh{font-size:10px}#histOps .hop-ws .cap{font-size:10px}#histOps .hop-hcell{height:16px}#histOps .hop-health{gap:3px;margin-top:9px}#histOps .hop-tcard{padding:8px 9px 6px}#histOps .hop-tcard canvas{height:132px}#histOps .hop-tcard .tn{font-size:13px}#histOps .hop-tcard .tf{font-size:10px}#histOps .hop-trends{gap:10px}#histOps .hop-btn{height:30px;font-size:11px}#histOps .hop-date{height:32px;font-size:12px}}",
      "@media (max-width:1180px) and (max-height:780px){#histOps .hop-trends{grid-template-columns:repeat(3,minmax(0,1fr))}}"
    ].join("\n");
    var style = document.createElement("style");
    style.id = "histOpsStyle";
    style.textContent = css;
    document.head.appendChild(style);
    state.styleReady = true;
  }

  function shellHtml() {
    return '<div id="histOps">' +
      '<section class="hop-panel" aria-labelledby="hopSettleTitle">' +
        '<div class="hop-head"><h2 id="hopSettleTitle"><span class="pl" style="background:var(--hop-gold)"></span>每日结算</h2>' +
        '<span class="sub" id="hopDateLabel"></span>' +
        '<div class="hop-right"><span id="hopDayBadge"></span><span id="hopNightBadge"></span>' +
        '<button class="hop-btn" id="hopPrev" type="button" aria-label="前一天">前一天</button>' +
        '<button class="hop-btn" id="hopNext" type="button" aria-label="后一天">后一天</button>' +
        '<input class="hop-date" id="hopDate" type="date" aria-label="选择归档日期"></div></div>' +
        '<div class="hop-settle"><div class="hop-scards" id="hopScards"></div><div class="hop-wslist" id="hopWsList"></div></div>' +
        '<div class="hop-health" id="hopHealth" role="group" aria-label="最近 30 个生产日归档健康度"></div>' +
      '</section>' +
      '<section class="hop-panel" aria-labelledby="hopTrendTitle">' +
        '<div class="hop-head"><h2 id="hopTrendTitle"><span class="pl" style="background:var(--hop-green)"></span>车间每日趋势</h2>' +
        '<span class="sub">近 14 个生产日 · 产出与达成</span>' +
        '<div class="hop-right"><span class="hop-badge" id="hopTrendShift" style="color:var(--hop-muted);border-color:var(--hop-line2);background:rgba(255,255,255,.04)">白班</span></div></div>' +
        '<div class="hop-trends" id="hopTrends"></div>' +
      '</section>' +
    '</div>';
  }

  function renderSettlement() {
    var map = healthMap();
    var selected = resolveSelected();
    var day = dayByDate(selected);
    var dayStatus = statusOf(selected, "day", day, map);
    var nightStatus = statusOf(selected, "night", day, map);
    var dayIssues = issuesOf(selected, "day", map);
    var nightIssues = issuesOf(selected, "night", map);
    var dateEl = state.host.querySelector("#hopDate");
    if (dateEl) {
      dateEl.value = selected;
      var dates = healthDates();
      var allDays = (state.data && state.data.days) || [];
      dateEl.min = allDays.length ? allDays[0].date : (dates[0] || "");
      dateEl.max = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
    }
    var label = state.host.querySelector("#hopDateLabel");
    if (label) {
      var today = new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
      var latest = latestDataDate();
      label.textContent = selected
        ? selected + " · " + weekday(selected) + (selected === latest && selected !== today ? " · 最新归档" : "")
        : "暂无归档";
    }
    var badge = function (status, issues) {
      var text = statusLabel(status);
      var more = issueText(issues);
      return '<span class="hop-badge ' + esc(status) + '" title="' + esc(more || text) + '">' + esc(text) + (more ? " · " + esc(more.split(" · ")[0]) : "") + "</span>";
    };
    var dayBadge = state.host.querySelector("#hopDayBadge");
    var nightBadge = state.host.querySelector("#hopNightBadge");
    if (dayBadge) dayBadge.innerHTML = badge(dayStatus, dayIssues);
    if (nightBadge) nightBadge.innerHTML = badge(nightStatus, nightIssues);

    function shiftCard(shift, status, issues) {
      var isNight = shift === "night";
      var nm = isNight ? "夜班" : "白班";
      var metric = metricOf(day, "", shift);
      var cls = "hop-scard" + (isNight ? " night" : "") + (status === "partial" ? " partial" : status === "missing" ? " missing" : status === "invalid" ? " invalid" : "");
      if (status === "missing" || status === "invalid" || !metric) {
        return '<div class="' + cls + '"><div class="r1"><span class="nm">' + nm + '</span>' + badge(status, issues) + '</div>' +
          '<div class="big">' + (status === "invalid" ? "异常" : "缺档") + '</div>' +
          '<div class="miss-reason" title="' + esc(issueText(issues) || "该班次没有可用归档") + '">' + esc(issueText(issues) || (status === "invalid" ? "日期串档，已隔离" : "缓冲过期，无法重建")) + '</div></div>';
      }
      var rate = metric.attainment;
      var toneName = toneText(rate);
      var width = rate === null || rate === undefined ? 0 : Math.max(0, Math.min(100, rate));
      return '<div class="' + cls + '"><div class="r1"><span class="nm">' + nm + '</span>' + badge(status, issues) + '</div>' +
        '<div class="big">' + fmt(metric.total) + '<small>件</small></div>' +
        '<div class="meta"><span>正常 <b>' + fmt(metric.normal) + '</b></span><span>加班 <b>' + fmt(metric.overtime) + '</b></span><span>计划 <b>' + fmt(metric.plan) + '</b></span></div>' +
        '<div class="hop-attain"><div class="track"><div class="fill" style="width:' + width + '%;background:' + (toneName === "good" ? "var(--hop-green)" : toneName === "warn" ? "var(--hop-orange)" : toneName === "bad" ? "var(--hop-red)" : "var(--hop-dim)") + '"></div></div><span class="pc ' + toneName + '">' + pct(rate) + '</span></div></div>';
    }
    var scards = state.host.querySelector("#hopScards");
    if (scards) scards.innerHTML = shiftCard("day", dayStatus, dayIssues) + shiftCard("night", nightStatus, nightIssues);

    function wsBar(shift, status) {
      if (status === "missing" || status === "invalid") {
        return '<div class="hop-ws missing"><div class="wh"><span>' + (shift === "night" ? "夜班" : "白班") + '</span><span class="q">缺档</span></div><div class="track"></div><div class="cap"><span>—</span><span>—</span></div></div>';
      }
      var m = metricOf(day, currentWorkshop, shift);
      if (!m) return '<div class="hop-ws missing"><div class="wh"><span>' + (shift === "night" ? "夜班" : "白班") + '</span><span class="q">无数据</span></div><div class="track"></div><div class="cap"><span>—</span><span>—</span></div></div>';
      var max = Math.max(num(m.plan), num(m.total), 1);
      var totalW = Math.min(100, num(m.total) / max * 100);
      var planW = Math.min(100, num(m.plan) / max * 100);
      var normalW = totalW > 0 ? Math.min(100, num(m.normal) / num(m.total) * 100) : 0;
      var otW = Math.max(0, 100 - normalW);
      return '<div class="hop-ws"><div class="wh"><span>' + (shift === "night" ? "夜班" : "白班") + '</span><span class="q">' + pct(m.attainment) + '</span></div><div class="track"><div class="fill" style="width:' + totalW + '%"><div class="normal" style="width:' + normalW + '%"></div><div class="ot" style="width:' + otW + '%"></div></div>' + (planW ? '<div class="plan" style="left:' + planW + '%"></div>' : '') + '</div><div class="cap"><span>' + fmt(m.total) + '</span><span>计划 ' + fmt(m.plan) + '</span></div></div>';
    }
    var list = state.host.querySelector("#hopWsList");
    if (list) {
      list.innerHTML = WS.map(function (ws) {
        currentWorkshop = ws;
        return '<div class="hop-wsrow"><span class="nm">' + WS_LABEL[ws] + '</span>' + wsBar("day", dayStatus) + wsBar("night", nightStatus) + '</div>';
      }).join("");
      currentWorkshop = "";
    }
  }

  var currentWorkshop = "";

  function renderHealth() {
    var map = healthMap();
    var el = state.host.querySelector("#hopHealth");
    if (!el) return;
    var selected = resolveSelected();
    var entries = ((state.data && state.data.health && state.data.health.days) || []).slice(-30);
    el.innerHTML = entries.map(function (item) {
      var day = dayByDate(item.date);
      var d = statusOf(item.date, "day", day, map);
      var n = statusOf(item.date, "night", day, map);
      var stateClass = d === "invalid" || n === "invalid" ? "invalid" : d === "missing" || n === "missing" ? "missing" : d === "partial" || n === "partial" ? "partial" : "complete";
      var text = item.date + " · 白班 " + statusLabel(d) + " · 夜班 " + statusLabel(n) + " · " + (issueText(issuesOf(item.date, "day", map)) || "无问题");
      return '<button type="button" class="hop-hcell ' + stateClass + (item.date === selected ? " on" : "") + '" data-date="' + esc(item.date) + '" title="' + esc(text) + '" aria-label="' + esc(text) + '" aria-pressed="' + (item.date === selected ? "true" : "false") + '"></button>';
    }).join("");
  }

  function trendAxis() {
    var selected = resolveSelected();
    var health = ((state.data && state.data.health && state.data.health.days) || []).filter(function (item) { return item.date <= selected; });
    if (health.length) return health.slice(-14);
    var days = ((state.data && state.data.days) || []).filter(function (item) { return item.date <= selected; }).slice(-14);
    return days.map(function (item) { return { date: item.date }; });
  }

  function trendSeries(ws) {
    var map = healthMap();
    var axis = trendAxis();
    return axis.map(function (item) {
      var day = dayByDate(item.date);
      var status = statusOf(item.date, state.shift, day, map);
      var metric = status === "missing" || status === "invalid" ? null : metricOf(day, ws, state.shift);
      return { date: item.date, status: status, metric: metric };
    });
  }

  function chipTone(value) {
    var t = tone(value);
    return { color: t === "good" ? "#34d399" : t === "warn" ? "#fbbf24" : t === "bad" ? "#f87171" : "var(--hop-dim)", border: t === "good" ? "rgba(16,185,129,.45)" : t === "warn" ? "rgba(245,158,11,.45)" : t === "bad" ? "rgba(239,68,68,.4)" : "rgba(255,255,255,.12)", bg: t === "good" ? "rgba(16,185,129,.1)" : t === "warn" ? "rgba(245,158,11,.1)" : t === "bad" ? "rgba(239,68,68,.08)" : "rgba(255,255,255,.04)" };
  }

  function drawTrend(canvas, series, ws) {
    if (!canvas) return;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth || 260, h = canvas.clientHeight || 112;
    if (w < 20 || h < 20) return;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var padL = 30, padR = 6, padT = 12, padB = 17;
    var innerW = w - padL - padR, innerH = h - padT - padB;
    var max = 1;
    series.forEach(function (item) {
      if (item.status === "missing" || item.status === "invalid" || !item.metric) return;
      max = Math.max(max, num(item.metric.total), num(item.metric.plan));
    });
    var slot = innerW / Math.max(1, series.length);
    var barW = Math.max(7, Math.min(18, slot * 0.58));
    function y(value) { return padT + innerH - (value / max) * innerH; }
    ctx.font = "10.5px 'Segoe UI',sans-serif";
    ctx.textAlign = "right";
    [0, max / 2, max].forEach(function (value) {
      var yy = y(value);
      ctx.strokeStyle = "rgba(255,255,255,.05)";
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
      ctx.fillStyle = "#71717a";
      ctx.fillText(value >= 1000 ? (value / 1000).toFixed(0) + "k" : String(Math.round(value)), padL - 4, yy + 3);
    });
    series.forEach(function (item, index) {
      var cx = padL + index * slot + slot / 2;
      if (item.status === "missing" || item.status === "invalid" || !item.metric) {
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = item.status === "invalid" ? "rgba(167,139,250,.4)" : "rgba(255,255,255,.22)";
        ctx.beginPath(); ctx.moveTo(cx, padT); ctx.lineTo(cx, padT + innerH); ctx.stroke();
        ctx.restore();
        ctx.fillStyle = item.status === "invalid" ? "#c4b5fd" : "#71717a";
        ctx.textAlign = "center";
        ctx.fillText(item.status === "invalid" ? "!" : "×", cx, padT + innerH - 2);
        return;
      }
      var m = item.metric;
      var total = num(m.total), normal = num(m.normal), overtime = num(m.overtime), plan = num(m.plan);
      var bottom = y(0), normalH = normal / max * innerH, otH = overtime / max * innerH;
      var bx = cx - barW / 2;
      if (normalH > 0) { ctx.fillStyle = "#3b82f6"; ctx.fillRect(bx, bottom - normalH, barW, normalH); }
      if (otH > 0) { ctx.fillStyle = "#eab308"; ctx.fillRect(bx, bottom - normalH - otH, barW, otH); }
      if (plan > 0) {
        var py = y(plan);
        ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(bx - 2, py); ctx.lineTo(bx + barW + 2, py); ctx.stroke(); ctx.setLineDash([]);
      }
      var rate = m.attainment;
      var t = tone(rate);
      ctx.fillStyle = t === "good" ? "#10b981" : t === "warn" ? "#f59e0b" : t === "bad" ? "#ef4444" : "#52525b";
      ctx.fillRect(bx, bottom + 2, barW, 3);
      if (index % 3 === 0) {
        ctx.fillStyle = "#71717a"; ctx.font = "10.5px 'Segoe UI',sans-serif"; ctx.textAlign = "center";
        ctx.fillText(dateLabel(item.date), cx, h - 4);
      }
    });
    var last = series.filter(function (item) { return item.metric && item.status !== "missing" && item.status !== "invalid"; }).slice(-1)[0];
    var rate = last ? last.metric.attainment : null;
    var chip = canvas.parentNode.querySelector(".tchip");
    if (chip) {
      var ct = chipTone(rate);
      chip.textContent = pct(rate);
      chip.style.color = ct.color;
      chip.style.borderColor = ct.border;
      chip.style.background = ct.bg;
    }
    canvas.setAttribute("aria-label", ws + " 近 14 个生产日产出趋势" + (last ? "，最近有数据日 " + last.date + " 达成 " + pct(rate) : "，暂无数据"));
  }

  function renderTrends() {
    var el = state.host.querySelector("#hopTrends");
    if (!el) return;
    var shiftLabel = state.shift === "full" ? "全天" : state.shift === "night" ? "夜班" : "白班";
    var shiftChip = state.host.querySelector("#hopTrendShift");
    if (shiftChip) shiftChip.textContent = shiftLabel;
    el.innerHTML = WS.map(function (ws) {
      return '<div class="hop-tcard" data-ws="' + ws + '"><div class="th"><span class="tn">' + WS_LABEL[ws] + '</span><span class="tchip">—</span></div><canvas role="img" tabindex="0"></canvas><div class="tf"><span>正常+加班</span><span>虚线=计划</span></div></div>';
    }).join("");
    el.querySelectorAll(".hop-tcard").forEach(function (card) {
      drawTrend(card.querySelector("canvas"), trendSeries(card.getAttribute("data-ws")), card.getAttribute("data-ws"));
    });
  }

  function render() {
    if (!state.host || !state.data) return;
    resolveSelected();
    renderSettlement();
    renderHealth();
    renderTrends();
  }

  function shiftDate(delta) {
    var selected = resolveSelected();
    var dates = allArchiveDates();
    var index = dates.indexOf(selected);
    if (index < 0) return;
    var next = dates[index + delta];
    if (next) { state.selected = next; render(); if (state.onDate) state.onDate(next); }
  }

  function bind() {
    var dateEl = state.host.querySelector("#hopDate");
    if (dateEl) dateEl.addEventListener("change", function () {
      if (!dateEl.value) return;
      state.selected = dateEl.value;
      render();
      if (state.onDate) state.onDate(state.selected);
    });
    var prev = state.host.querySelector("#hopPrev"), next = state.host.querySelector("#hopNext");
    if (prev) prev.addEventListener("click", function () { shiftDate(-1); });
    if (next) next.addEventListener("click", function () { shiftDate(1); });
    var health = state.host.querySelector("#hopHealth");
    if (health) {
      health.addEventListener("click", function (event) {
        var cell = event.target.closest(".hop-hcell");
        if (!cell) return;
        state.selected = cell.getAttribute("data-date");
        render();
        if (state.onDate) state.onDate(state.selected);
      });
      health.addEventListener("keydown", function (event) {
        if (event.key !== "Enter" && event.key !== " ") return;
        var cell = event.target.closest(".hop-hcell");
        if (!cell) return;
        event.preventDefault();
        cell.click();
      });
    }
    window.addEventListener("resize", function () {
      clearTimeout(state.resizeTimer);
      state.resizeTimer = setTimeout(function () { if (state.host && state.data) { renderHealth(); renderTrends(); } }, 150);
    });
  }

  function mount(host, options) {
    if (!host) return;
    options = options || {};
    state.host = host;
    state.onDate = options.onDate || null;
    styleOnce();
    host.innerHTML = shellHtml();
    bind();
    return loadAnalytics(options.url || "history/analytics.json").then(function (payload) {
      if (state.host) render();
      return payload;
    }).catch(function () { return null; });
  }

  function setShift(shift) {
    state.shift = shift === "night" || shift === "full" ? shift : "day";
    if (state.host && state.data) { renderTrends(); }
  }
  function setDate(date) {
    if (!date) return;
    state.selected = date;
    if (state.host && state.data) render();
  }

  window.PDTIIIHistoryModule = {
    mount: mount,
    setShift: setShift,
    setDate: setDate,
    loadAnalytics: loadAnalytics
  };
})();
