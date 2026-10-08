(function () {
  "use strict";

  var dataPromise = null;
  var cachedData = null;
  var cachedAt = 0;
  var activeRoot = null;
  var keyHandler = null;
  var FIREBASE_DATA_URL = "https://dm111-e8a7d-default-rtdb.firebaseio.com/sqdip/current.json";

  var dimensions = [
    { id: "S", en: "SAFETY", cn: "安全" },
    { id: "Q", en: "QUALITY", cn: "质量" },
    { id: "D", en: "DELIVERY", cn: "交付" },
    { id: "I", en: "INVENTORY", cn: "库存 / 损耗" },
    { id: "P", en: "PRODUCTIVITY", cn: "效率" }
  ];

  var css = `
#sqdip-root {
  --sq-bg: var(--bg, #09090b);
  --sq-panel: #101419;
  --sq-line: rgba(235, 241, 247, .17);
  --sq-line-soft: rgba(235, 241, 247, .11);
  --sq-text: var(--white, #f4f4f5);
  --sq-muted: #a1a1aa;
  --sq-accent: var(--blue, #58a6ff);
  position: fixed; inset: 0; z-index: 2147483000; box-sizing: border-box; overflow: hidden;
  color: var(--sq-text); background: var(--sq-bg); font-family: inherit; font-size: 14px; line-height: 1.25;
}
#sqdip-root *, #sqdip-root *::before, #sqdip-root *::after { box-sizing: border-box; }
#sqdip-root button { font: inherit; }
.sqdip-shell { width: 100%; height: 100%; min-height: 0; padding: 14px 18px 11px; display: grid; grid-template-rows: 61px minmax(0,1fr) 22px; gap: 9px; }
.sqdip-head { min-width: 0; display: flex; align-items: center; gap: 18px; border-bottom: 1px solid var(--sq-line); }
.sqdip-brand { min-width: 0; display: flex; align-items: center; gap: 12px; }
.sqdip-mark { width: 4px; height: 34px; flex: 0 0 auto; background: var(--sq-accent); }
.sqdip-title-wrap { display: flex; flex-direction: column; gap: 3px; }
.sqdip-overline { color: var(--sq-accent); font-size: 9px; font-weight: 800; letter-spacing: .15em; }
.sqdip-title { margin: 0; color: #f4f4f5; font-size: 25px; line-height: 1; font-weight: 800; letter-spacing: .04em; }
.sqdip-period { display: flex; align-items: center; gap: 9px; padding-left: 16px; border-left: 1px solid var(--sq-line); }
.sqdip-period strong { color: #fff; font-size: 15px; font-variant-numeric: tabular-nums; letter-spacing: .025em; }
.sqdip-period span { color: #a1a1aa; font-size: 11px; }
.sqdip-head-spacer { flex: 1; }
.sqdip-legend { display: flex; align-items: center; gap: 15px; color: #c8cdd2; font-size: 11px; }
.sqdip-legend-item { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.sqdip-legend-dot { width: 7px; height: 7px; display: inline-block; border-radius: 1px; }
.sqdip-legend-dot.actual { background: #f4f4f5; }
.sqdip-legend-dot.target { background: var(--sq-accent); }
.sqdip-close { height: 33px; min-width: 76px; margin-left: 4px; padding: 0 11px; border: 1px solid rgba(255,255,255,.24); border-radius: 3px; background: transparent; color: #e7e9eb; font-size: 12px; font-weight: 700; cursor: pointer; transition: background-color .14s ease, border-color .14s ease; }
.sqdip-close:hover { background: rgba(59,130,246,.15); border-color: var(--sq-accent); }
.sqdip-board { min-width: 0; min-height: 0; }
.sqdip-grid { width: 100%; height: 100%; display: grid; grid-template-columns: 108px repeat(5,minmax(0,1fr)); grid-template-rows: 43px repeat(5,minmax(0,1fr)); border-top: 1px solid var(--sq-line); border-left: 1px solid var(--sq-line); }
.sqdip-corner { display: flex; align-items: center; padding: 0 10px; color: #8d959d; font-size: 9px; font-weight: 800; letter-spacing: .12em; border-right: 1px solid var(--sq-line); border-bottom: 1px solid var(--sq-line); background: #101318; }
.sqdip-plant-head { min-width: 0; display: flex; align-items: center; gap: 8px; padding: 0 13px; border-right: 1px solid var(--sq-line); border-bottom: 1px solid var(--sq-line); border-top: 3px solid var(--sq-accent); background: #151a20; }
.sqdip-plant-index { color: var(--sq-accent); font-size: 9px; font-weight: 800; letter-spacing: .1em; }
.sqdip-plant-name { overflow: hidden; color: #fff; font-size: 16px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.sqdip-dim-head { min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 3px; padding: 8px 9px 8px 12px; border-right: 1px solid var(--sq-line); border-bottom: 1px solid var(--sq-line); background: #14191f; }
.sqdip-dim-code { color: var(--sq-accent); font-size: 23px; line-height: 1; font-weight: 900; }
.sqdip-dim-en { overflow: hidden; color: #c7cdd3; font-size: 8px; font-weight: 800; letter-spacing: .07em; text-overflow: ellipsis; white-space: nowrap; }
.sqdip-dim-cn { overflow: hidden; color: #a1a1aa; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.sqdip-cell { min-width: 0; min-height: 0; width: 100%; padding: 7px 10px; display: flex; flex-direction: column; justify-content: stretch; overflow: hidden; border: 0; border-right: 1px solid var(--sq-line); border-bottom: 1px solid var(--sq-line); border-radius: 0; background: var(--sq-panel); color: var(--sq-text); text-align: left; cursor: pointer; transition: background-color .13s ease, box-shadow .13s ease; }
.sqdip-cell:hover { position: relative; z-index: 1; background: #17202a; box-shadow: inset 0 0 0 1px var(--sq-accent); }
.sqdip-cell:focus-visible, .sqdip-close:focus-visible, .sqdip-detail-close:focus-visible { outline: 2px solid var(--sq-accent); outline-offset: -2px; }
.sqdip-cell-list { min-height: 0; height: 100%; display: flex; flex-direction: column; justify-content: flex-start; }
.sqdip-metric { min-width: 0; min-height: 0; flex: 0 0 calc(100% / var(--metric-slots,1)); height: calc(100% / var(--metric-slots,1)); display: grid; grid-template-rows: auto auto; align-content: center; padding: 5px 1px; }
.sqdip-metric + .sqdip-metric { border-top: 1px solid var(--sq-line-soft); }
.sqdip-metric-title { min-width: 0; display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.sqdip-group-name { min-width: 0; overflow: hidden; color: #edf0f3; font-size: 11px; line-height: 1.2; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.sqdip-value-label { flex: 0 0 auto; overflow: hidden; color: #929ba4; font-size: 9px; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
.sqdip-value-pair { min-width: 0; display: grid; grid-template-columns: minmax(0,1.12fr) minmax(0,.88fr); align-items: center; }
.sqdip-value-side { min-width: 0; }
.sqdip-value-side.target-side { padding-left: 9px; border-left: 1px solid var(--sq-line-soft); }
.sqdip-value-caption { display: none; }
.sqdip-value-number { display: block; overflow: hidden; color: #f4f4f5; font-size: 18px; line-height: 1.08; font-variant-numeric: tabular-nums; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.target-side .sqdip-value-number { color: #7fb5ff; font-size: 14px; font-weight: 700; }
.sqdip-no-target { color: #a1a1aa !important; font-size: 11px !important; font-weight: 600 !important; }
.sqdip-error-note { margin-top: 2px; color: #ff9494; font-size: 8px; }
.sqdip-cell[data-slots="3"] { padding: 4px 7px; }
.sqdip-cell[data-slots="3"] .sqdip-metric { padding: 3px 1px; }
.sqdip-cell[data-slots="3"] .sqdip-metric-title { margin-bottom: 2px; }
.sqdip-cell[data-slots="3"] .sqdip-group-name { font-size: 10px; }
.sqdip-cell[data-slots="3"] .sqdip-value-label { font-size: 8px; }
.sqdip-cell[data-slots="3"] .sqdip-value-number { font-size: 14px; }
.sqdip-cell[data-slots="3"] .target-side .sqdip-value-number { font-size: 12px; }
.sqdip-cell[data-slots="3"] .sqdip-error-note { margin-top: 0; font-size: 7px; }
.sqdip-empty { height: 100%; display: flex; align-items: center; justify-content: center; color: #89919a; font-size: 11px; }
.sqdip-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; overflow: hidden; color: #89919a; font-size: 10px; }
.sqdip-foot strong { color: #c7cdd3; font-weight: 600; }
.sqdip-foot-note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sqdip-detail { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; padding: 24px; background: rgba(0,0,0,.78); }
.sqdip-detail[hidden] { display: none; }
.sqdip-detail-card { width: min(900px,94vw); max-height: 86vh; min-height: 0; display: grid; grid-template-rows: auto minmax(0,1fr); overflow: hidden; border: 1px solid var(--sq-line); border-top: 3px solid var(--sq-accent); border-radius: 4px; background: #101419; box-shadow: 0 18px 60px rgba(0,0,0,.6); }
.sqdip-detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 18px 22px 14px; border-bottom: 1px solid var(--sq-line); }
.sqdip-detail-kicker { margin-bottom: 5px; color: var(--sq-accent); font-size: 9px; font-weight: 800; letter-spacing: .13em; }
.sqdip-detail-title { margin: 0; color: #fff; font-size: 20px; line-height: 1.2; }
.sqdip-detail-subtitle { margin-top: 5px; color: #a1a1aa; font-size: 11px; }
.sqdip-detail-close { width: 34px; height: 34px; flex: 0 0 auto; border: 1px solid var(--sq-line); border-radius: 3px; background: #181d23; color: #fff; font-size: 19px; cursor: pointer; }
.sqdip-detail-close:hover { border-color: var(--sq-accent); background: #1b2734; }
.sqdip-detail-group { padding: 2px 0 16px; }
.sqdip-detail-group + .sqdip-detail-group { padding-top: 14px; border-top: 1px solid var(--sq-line); }
.sqdip-detail-group-title { display: flex; justify-content: space-between; gap: 12px; margin: 0 0 8px; color: #f4f4f5; font-size: 13px; }
.sqdip-detail-group-title small { color: #a1a1aa; font-size: 10px; font-weight: 600; }
.sqdip-detail-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 0; padding: 0 0 10px; }
.sqdip-detail-table-label { margin: 3px 0 4px; color: #c7cdd3; font-size: 10px; font-weight: 700; }
.sqdip-detail-stat { padding: 10px 12px; border: 1px solid var(--sq-line); background: #151b21; }
.sqdip-detail-stat + .sqdip-detail-stat { border-left: 0; }
.sqdip-detail-stat small { display: block; margin-bottom: 5px; color: #a1a1aa; font-size: 10px; }
.sqdip-detail-stat strong { color: #f4f4f5; font-size: 21px; font-variant-numeric: tabular-nums; }
.sqdip-detail-stat.target-stat strong { color: #7fb5ff; font-size: 18px; }
.sqdip-detail-content { min-height: 0; padding: 15px 22px 20px; overflow: auto; }
.sqdip-detail-content h3 { margin: 0 0 9px; color: #e4e4e7; font-size: 12px; }
.sqdip-detail-table { width: 100%; border-collapse: collapse; }
.sqdip-detail-table th, .sqdip-detail-table td { padding: 9px 10px; border-bottom: 1px solid var(--sq-line-soft); text-align: left; }
.sqdip-detail-table th { color: #a1a1aa; font-size: 10px; font-weight: 700; }
.sqdip-detail-table td { color: #e4e4e7; font-size: 12px; }
.sqdip-detail-table td:last-child, .sqdip-detail-table th:last-child { text-align: right; font-variant-numeric: tabular-nums; }
.sqdip-detail-source { margin-top: 14px; color: #89919a; font-size: 10px; overflow-wrap: anywhere; }
.sqdip-loading { height: 100%; display: grid; place-items: center; color: #d4d4d8; font-size: 14px; }
.sqdip-load-error { color: #ff9494; }
@media (max-width: 1450px) {
  .sqdip-shell { padding: 11px 12px 9px; grid-template-rows: 56px minmax(0,1fr) 20px; gap: 7px; }
  .sqdip-grid { grid-template-columns: 88px repeat(5,minmax(0,1fr)); grid-template-rows: 39px repeat(5,minmax(0,1fr)); }
  .sqdip-cell { padding: 5px 7px; }
  .sqdip-value-number { font-size: 16px; }
  .target-side .sqdip-value-number { font-size: 13px; }
}
@media (max-height: 820px) {
  .sqdip-shell { min-height: 700px; }
  #sqdip-root { overflow: auto; }
}
@media (prefers-reduced-motion: reduce) { .sqdip-cell, .sqdip-close { transition: none; } }
  `;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function compactLabel(label) {
    var value = String(label || "").split("\n")[0].trim();
    var low = value.toLowerCase();
    if (low.indexOf("upph") >= 0) return "UPPH";
    if (low.indexOf("ppm") >= 0) return "PPM";
    if (value === "%") return "NG 率";
    if (low.indexOf("ng %") >= 0 || low.indexOf("อัตรา ng") >= 0) return "NG 率";
    if (value.indexOf("安全事故") >= 0) return "安全事故";
    if (value.indexOf("闭环率") >= 0) return "闭环率";
    if (value.indexOf("完成率") >= 0) return "完成率";
    if (value.indexOf("完成数") >= 0) return "完成数";
    if (value.indexOf("项目数") >= 0) return "项目数";
    if (value.indexOf("不良金额") >= 0) return "不良金额";
    if (value.indexOf("不良数") >= 0) return "不良数";
    if (value.indexOf("损耗率") >= 0) return "损耗率";
    if (low.indexOf("cost (thb)") >= 0) return "质量成本";
    if (low.indexOf("loss pro.2") >= 0) return "Loss Pro.2";
    if (value.indexOf("损失") >= 0) return "损耗量";
    if (value.indexOf("每天损失套") >= 0) return "损耗量";
    if (low.indexOf("no wait parts") >= 0) return "待料次数";
    if (value.indexOf("等待部件") >= 0) return "等待部件";
    return value.length > 14 ? value.slice(0, 13) + "…" : value;
  }

  function numberText(value, maxDigits) {
    var n = Number(value);
    if (!Number.isFinite(n)) return "—";
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: maxDigits,
      minimumFractionDigits: 0
    }).format(n);
  }

  function formatValue(item) {
    if (!item || item.value === null || item.value === undefined || item.value === "") return "—";
    if (typeof item.value !== "number") return String(item.value);
    var value = item.value;
    var kind = item.format || "number";
    var unit = item.unit || "";
    if (kind === "ratio-percent") {
      if (Math.abs(value) <= 1) value = value * 100;
      return numberText(value, 1) + "%" + (unit && unit !== "%" ? unit.replace("%", "") : "");
    }
    if (kind === "percent-point") return numberText(value, 2) + "%" + (unit && unit.indexOf("/") >= 0 ? unit.slice(unit.indexOf("/")) : "");
    if (kind === "ppm") return numberText(value, 1) + " PPM";
    if (kind === "upph") return numberText(value, 2) + " UPPH";
    if (kind === "money") return numberText(value, 2) + (unit || " THB");
    if (kind === "count") return numberText(value, Number.isInteger(value) ? 0 : 2) + (unit ? " " + unit : "");
    return numberText(value, 2) + (unit ? " " + unit : "");
  }

  function loadData() {
    if (cachedData && Date.now() - cachedAt < 60000) return Promise.resolve(cachedData);
    if (dataPromise) return dataPromise;
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, 20000);
    dataPromise = window.fetch(FIREBASE_DATA_URL, { cache: "no-store", signal: controller.signal })
      .then(function (response) {
        if (!response.ok) throw new Error("Firebase 返回 HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.plants)) throw new Error("Firebase 中没有有效的 SQDIP 数据");
        cachedData = data;
        cachedAt = Date.now();
        return cachedData;
      })
      .catch(function (error) {
        dataPromise = null;
        if (error && error.name === "AbortError") throw new Error("SQDIP 数据读取超时");
        throw error;
      })
      .finally(function () { window.clearTimeout(timer); });
    return dataPromise;
  }

  function createHeader(root, period) {
    var shell = el("div", "sqdip-shell");
    var header = el("header", "sqdip-head");
    var brand = el("div", "sqdip-brand");
    brand.appendChild(el("span", "sqdip-mark"));
    var titleWrap = el("div", "sqdip-title-wrap");
    titleWrap.appendChild(el("div", "sqdip-overline", "PRODUCTION PERFORMANCE"));
    titleWrap.appendChild(el("h1", "sqdip-title", "SQDIP"));
    brand.appendChild(titleWrap);
    header.appendChild(brand);
    var periodBox = el("div", "sqdip-period");
    periodBox.appendChild(el("strong", "", String(period || "2026-10").replace("-", " / ")));
    periodBox.appendChild(el("span", "", "月度总览"));
    header.appendChild(periodBox);
    header.appendChild(el("div", "sqdip-head-spacer"));
    var legend = el("div", "sqdip-legend");
    var actualLegend = el("span", "sqdip-legend-item");
    actualLegend.appendChild(el("i", "sqdip-legend-dot actual"));
    actualLegend.appendChild(el("span", "", "实际达成"));
    var targetLegend = el("span", "sqdip-legend-item");
    targetLegend.appendChild(el("i", "sqdip-legend-dot target"));
    targetLegend.appendChild(el("span", "", "目标"));
    legend.appendChild(actualLegend);
    legend.appendChild(targetLegend);
    header.appendChild(legend);
    var close = el("button", "sqdip-close", "关闭 ×");
    close.type = "button";
    close.setAttribute("aria-label", "关闭 SQDIP 面板");
    close.addEventListener("click", function () { window.closeSQDIP(); });
    header.appendChild(close);
    shell.appendChild(header);
    root.appendChild(shell);
    return shell;
  }

  function renderMetric(group) {
    var metric = el("div", "sqdip-metric");
    var title = el("div", "sqdip-metric-title");
    title.appendChild(el("span", "sqdip-group-name", group.title || "SQDIP"));
    title.appendChild(el("span", "sqdip-value-label", compactLabel(group.metricLabel)));
    metric.appendChild(title);
    var pair = el("div", "sqdip-value-pair");
    var actual = el("div", "sqdip-value-side");
    var actualValue = el("strong", "sqdip-value-number", formatValue(group.actual));
    actual.appendChild(actualValue);
    pair.appendChild(actual);
    var target = el("div", "sqdip-value-side target-side");
    if (group.target && group.target.value !== null && group.target.value !== undefined) {
      target.appendChild(el("strong", "sqdip-value-number", formatValue(group.target)));
    } else {
      target.appendChild(el("strong", "sqdip-value-number sqdip-no-target", "无基准"));
    }
    pair.appendChild(target);
    metric.appendChild(pair);
    if (group.actual && group.actual.sourceError) {
      metric.appendChild(el("div", "sqdip-error-note", "源表公式错误"));
    }
    return metric;
  }

  function plantSource(data, plantId) {
    return data.plants.find(function (plant) { return plant.id === plantId; });
  }

  function renderDetail(root, plant, dim, groups, period) {
    var overlay = root.querySelector(".sqdip-detail");
    var dimension = dimensions.find(function (item) { return item.id === dim; });
    overlay.replaceChildren();
    var card = el("section", "sqdip-detail-card");
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", plant.id + " " + dimension.cn + " 明细");
    var head = el("div", "sqdip-detail-head");
    var titleBlock = el("div", "");
    titleBlock.appendChild(el("div", "sqdip-detail-kicker", plant.id + " / " + dimension.en));
    titleBlock.appendChild(el("h2", "sqdip-detail-title", dimension.cn + " 指标组成"));
    titleBlock.appendChild(el("div", "sqdip-detail-subtitle", period + " · " + groups.length + " 项指标 · 显示源表 Total 列"));
    head.appendChild(titleBlock);
    var close = el("button", "sqdip-detail-close", "×");
    close.type = "button";
    close.setAttribute("aria-label", "关闭指标明细");
    close.addEventListener("click", hideDetail);
    head.appendChild(close);
    card.appendChild(head);
    var content = el("div", "sqdip-detail-content");
    groups.forEach(function (group) {
      var section = el("section", "sqdip-detail-group");
      var groupTitle = el("h3", "sqdip-detail-group-title");
      groupTitle.appendChild(el("span", "", group.title || dimension.cn));
      groupTitle.appendChild(el("small", "", compactLabel(group.metricLabel)));
      section.appendChild(groupTitle);
      var summary = el("div", "sqdip-detail-summary");
      var actual = el("div", "sqdip-detail-stat");
      actual.appendChild(el("small", "", "实际达成"));
      actual.appendChild(el("strong", "", formatValue(group.actual)));
      var target = el("div", "sqdip-detail-stat target-stat");
      target.appendChild(el("small", "", "目标"));
      target.appendChild(el("strong", "", group.target ? formatValue(group.target) : "无基准"));
      summary.appendChild(actual);
      summary.appendChild(target);
      section.appendChild(summary);
      section.appendChild(el("div", "sqdip-detail-table-label", "工作簿组成数据"));
      var table = el("table", "sqdip-detail-table");
      var thead = el("thead", "");
      var hr = el("tr", "");
      hr.appendChild(el("th", "", "原始项目"));
      hr.appendChild(el("th", "", "Total"));
      thead.appendChild(hr);
      table.appendChild(thead);
      var tbody = el("tbody", "");
      (group.components || []).forEach(function (component) {
        var tr = el("tr", "");
        tr.appendChild(el("td", "", component.label));
        var value = component.sourceError ? "公式错误 (#DIV/0!)" : formatSource(component);
        tr.appendChild(el("td", "", value));
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      section.appendChild(table);
      content.appendChild(section);
    });
    var sourceName = plant.source ? "来源文件：" + plant.source : "来源：2026 年 10 月 SQDIP 工作簿";
    content.appendChild(el("div", "sqdip-detail-source", sourceName + " · 不对指标做二次计算"));
    card.appendChild(content);
    overlay.appendChild(card);
    overlay.hidden = false;
    close.focus();
  }
  function formatSource(component) {
    if (component.value === null || component.value === undefined) return "—";
    var label = String(component.label || "");
    var kind = "number";
    if (/UPPH/i.test(label)) kind = "upph";
    else if (/PPM/i.test(label)) kind = "ppm";
    else if (/%/.test(label)) kind = "percent-point";
    else if (/Target/i.test(label)) kind = "number";
    else if (/Cost\s*\(THB\)/i.test(label)) kind = "money";
    else if (/闭环率|完成率/.test(label)) kind = "ratio-percent";
    else if (/安全事故|项目数|完成数|不良数/.test(label)) kind = "count";
    return formatValue({ value: component.value, format: kind });
  }

  function hideDetail() {
    if (!activeRoot) return;
    var overlay = activeRoot.querySelector(".sqdip-detail");
    if (overlay) overlay.hidden = true;
  }

  function buildBoard(root, data) {
    var shell = root.querySelector(".sqdip-shell");
    var board = el("main", "sqdip-board");
    var grid = el("div", "sqdip-grid");
    var metricSlots = {};
    dimensions.forEach(function (dimension) {
      metricSlots[dimension.id] = 1;
      data.plants.forEach(function (plant) {
        metricSlots[dimension.id] = Math.max(metricSlots[dimension.id], (plant.groups && plant.groups[dimension.id] || []).length);
      });
    });
    grid.setAttribute("role", "grid");
    grid.appendChild(el("div", "sqdip-corner", "DIMENSION"));
    data.plants.forEach(function (plant) {
      var plantHead = el("div", "sqdip-plant-head");
      plantHead.appendChild(el("span", "sqdip-plant-index", "PRO"));
      plantHead.appendChild(el("span", "sqdip-plant-name", plant.id.replace("PRO.", "")));
      grid.appendChild(plantHead);
    });
    dimensions.forEach(function (dimension) {
      var rowHead = el("div", "sqdip-dim-head");
      rowHead.appendChild(el("span", "sqdip-dim-code", dimension.id));
      rowHead.appendChild(el("span", "sqdip-dim-en", dimension.en));
      rowHead.appendChild(el("span", "sqdip-dim-cn", dimension.cn));
      grid.appendChild(rowHead);
      data.plants.forEach(function (plant) {
        var groups = plant.groups && plant.groups[dimension.id] || [];
        var cell = el("button", "sqdip-cell");
        cell.type = "button";
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", plant.id + " " + dimension.cn + " 指标明细");
        cell.dataset.metrics = String(groups.length);
        cell.dataset.slots = String(metricSlots[dimension.id] || 1);
        cell.style.setProperty("--metric-slots", String(metricSlots[dimension.id] || 1));
        if (!groups.length) {
          cell.appendChild(el("div", "sqdip-empty", "暂无源数据"));
        } else {
          var list = el("div", "sqdip-cell-list");
          groups.forEach(function (group) { list.appendChild(renderMetric(group)); });
          cell.appendChild(list);
          cell.addEventListener("click", function () {
            renderDetail(root, plant, dimension.id, groups, data.period);
          });
        }
        grid.appendChild(cell);
      });
    });
    board.appendChild(grid);
    shell.insertBefore(board, shell.children[1]);
    var foot = el("footer", "sqdip-foot");
    foot.appendChild(el("span", "sqdip-foot-note", "指标结构依据各车间 SQDIP 工作簿 · 点击单元格查看组成数据"));
    foot.appendChild(el("strong", "", "显示源表 Total 列 · 无目标时标记“无基准”"));
    shell.appendChild(foot);
    var detail = el("div", "sqdip-detail");
    detail.hidden = true;
    detail.addEventListener("click", function (event) { if (event.target === detail) hideDetail(); });
    root.appendChild(detail);
  }
  function showLoading(root) {
    var shell = createHeader(root, "2026-10");
    var board = el("main", "sqdip-board");
    board.appendChild(el("div", "sqdip-loading", "正在读取 SQDIP 数据…"));
    shell.insertBefore(board, shell.children[1]);
    shell.appendChild(el("footer", "sqdip-foot", "数据读取自月度 SQDIP 工作簿"));
  }

  function injectStyles() {
    if (document.getElementById("sqdip-style")) return;
    var style = document.createElement("style");
    style.id = "sqdip-style";
    style.textContent = css;
    document.head.appendChild(style);
  }

  function closePanel() {
    if (!activeRoot) return;
    if (keyHandler) document.removeEventListener("keydown", keyHandler);
    keyHandler = null;
    activeRoot.remove();
    activeRoot = null;
  }

  function openPanel() {
    if (activeRoot) return;
    injectStyles();
    var root = el("div", "");
    root.id = "sqdip-root";
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "SQDIP 生产指标总览");
    activeRoot = root;
    document.body.appendChild(root);
    showLoading(root);
    keyHandler = function (event) {
      if (event.key === "Escape") {
        var detail = activeRoot && activeRoot.querySelector(".sqdip-detail");
        if (detail && !detail.hidden) hideDetail();
        else closePanel();
      }
    };
    document.addEventListener("keydown", keyHandler);
    loadData().then(function (data) {
      if (activeRoot !== root) return;
      root.replaceChildren();
      createHeader(root, data.period);
      buildBoard(root, data);
    }).catch(function (error) {
      if (activeRoot !== root) return;
      var loading = root.querySelector(".sqdip-loading");
      if (loading) {
        loading.classList.add("sqdip-load-error");
        loading.textContent = error.message + "。请刷新页面后重试。";
      }
    });
  }

  window.openSQDIP = openPanel;
  window.closeSQDIP = closePanel;
})();
