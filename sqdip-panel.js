(function () {
  "use strict";

  var dataPromise = null;
  var cachedData = null;
  var activeRoot = null;
  var keyHandler = null;
  var scriptUrl = (function () {
    var source = document.currentScript && document.currentScript.src;
    return source ? new URL("sqdip-data.js?v=20261007b", source).href : "./sqdip-data.js?v=20261007b";
  })();

  var dimensions = [
    { id: "S", en: "SAFETY", cn: "安全", color: "green" },
    { id: "Q", en: "QUALITY", cn: "质量", color: "red" },
    { id: "D", en: "DELIVERY", cn: "交付", color: "orange" },
    { id: "I", en: "INVENTORY", cn: "库存 / 损耗", color: "blue" },
    { id: "P", en: "PRODUCTIVITY", cn: "效率", color: "green" }
  ];

  var css = `
#sqdip-root {
  --sq-bg: var(--bg, #09090b);
  --sq-panel: #15181c;
  --sq-panel-2: #1b2025;
  --sq-border: rgba(212, 218, 224, .18);
  --sq-text: var(--white, #f4f4f5);
  --sq-muted: #a1a1aa;
  --sq-green: var(--green, #10b981);
  --sq-blue: var(--blue, #3b82f6);
  --sq-orange: var(--orange, #f59e0b);
  --sq-red: var(--red, #ef4444);
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  box-sizing: border-box;
  overflow: hidden;
  color: var(--sq-text);
  background: var(--sq-bg);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.25;
}
#sqdip-root *, #sqdip-root *::before, #sqdip-root *::after { box-sizing: border-box; }
#sqdip-root button { font: inherit; }
.sqdip-shell { width: 100%; height: 100%; min-height: 0; padding: 14px 18px 12px; display: grid; grid-template-rows: 64px minmax(0, 1fr) 22px; gap: 9px; }
.sqdip-head { min-width: 0; display: flex; align-items: center; gap: 20px; border-bottom: 1px solid var(--sq-border); }
.sqdip-brand { min-width: 0; display: flex; align-items: center; gap: 13px; }
.sqdip-mark { width: 8px; height: 40px; flex: 0 0 auto; background: var(--sq-green); }
.sqdip-title-wrap { display: flex; flex-direction: column; gap: 3px; }
.sqdip-overline { color: var(--sq-green); font-size: 10px; font-weight: 800; letter-spacing: .16em; }
.sqdip-title { margin: 0; color: #fff; font-size: 27px; line-height: 1; font-weight: 800; letter-spacing: .045em; }
.sqdip-period { display: flex; align-items: center; gap: 9px; padding-left: 17px; border-left: 1px solid var(--sq-border); }
.sqdip-period strong { color: #fff; font-size: 17px; letter-spacing: .035em; }
.sqdip-period span { color: var(--sq-muted); font-size: 12px; }
.sqdip-head-spacer { flex: 1; }
.sqdip-legend { display: flex; align-items: center; gap: 16px; color: #d4d4d8; font-size: 12px; }
.sqdip-legend-item { display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; }
.sqdip-legend-dot { width: 7px; height: 7px; display: inline-block; border-radius: 1px; }
.sqdip-legend-dot.actual { background: #fff; }
.sqdip-legend-dot.target { background: var(--sq-blue); }
.sqdip-close { height: 36px; min-width: 86px; margin-left: 3px; padding: 0 12px; border: 1px solid rgba(255,255,255,.24); border-radius: 4px; background: #202429; color: #f4f4f5; font-size: 13px; font-weight: 700; cursor: pointer; }
.sqdip-close:hover { background: #30363c; border-color: rgba(255,255,255,.45); }
.sqdip-board { min-width: 0; min-height: 0; }
.sqdip-grid { width: 100%; height: 100%; display: grid; grid-template-columns: 104px repeat(5, minmax(0, 1fr)); grid-template-rows: 42px repeat(5, minmax(0, 1fr)); gap: 6px; }
.sqdip-corner { display: flex; align-items: center; padding: 0 10px; color: #858b92; font-size: 9px; font-weight: 800; letter-spacing: .13em; }
.sqdip-plant-head { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 0 12px; border-bottom: 2px solid var(--sq-green); background: #111518; }
.sqdip-plant-index { color: var(--sq-green); font-size: 10px; font-weight: 800; letter-spacing: .12em; }
.sqdip-plant-name { overflow: hidden; color: #fff; font-size: 17px; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.sqdip-dim-head { position: relative; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 8px 9px 8px 13px; border: 1px solid var(--sq-border); background: #111518; }
.sqdip-dim-head::before { position: absolute; inset: 0 auto 0 0; width: 3px; content: ""; background: var(--dim-color); }
.sqdip-dim-code { color: var(--dim-color); font-size: 22px; line-height: 1; font-weight: 900; }
.sqdip-dim-en { overflow: hidden; color: #d4d4d8; font-size: 8px; font-weight: 800; letter-spacing: .075em; text-overflow: ellipsis; white-space: nowrap; }
.sqdip-dim-cn { overflow: hidden; color: var(--sq-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.sqdip-cell { min-width: 0; min-height: 0; width: 100%; padding: 7px 8px; display: flex; flex-direction: column; justify-content: stretch; gap: 0; overflow: hidden; border: 1px solid var(--sq-border); border-left: 2px solid rgba(255,255,255,.16); border-radius: 3px; background: var(--sq-panel); color: var(--sq-text); text-align: left; cursor: pointer; transition: border-color .12s ease, background-color .12s ease; }
.sqdip-cell:hover { border-color: rgba(255,255,255,.42); border-left-color: var(--sq-green); background: #1b2025; }
.sqdip-cell:focus-visible, .sqdip-close:focus-visible, .sqdip-detail-close:focus-visible { outline: 2px solid var(--sq-green); outline-offset: 2px; }
.sqdip-cell-list { min-height: 0; height: 100%; display: flex; flex-direction: column; justify-content: space-evenly; }
.sqdip-metric { min-width: 0; padding: 3px 1px 4px; }
.sqdip-metric + .sqdip-metric { border-top: 1px solid rgba(255,255,255,.12); }
.sqdip-metric-title { min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 4px; }
.sqdip-group-name { min-width: 0; overflow: hidden; color: #d8dde2; font-size: 11px; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }
.sqdip-value-label { flex: 0 0 auto; overflow: hidden; color: #9099a1; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.sqdip-value-pair { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, .88fr); gap: 7px; align-items: center; }
.sqdip-value-side { min-width: 0; }
.sqdip-value-side.target-side { padding-left: 8px; border-left: 1px solid rgba(255,255,255,.14); }
.sqdip-value-caption { display: block; margin-bottom: 1px; color: #929aa2; font-size: 9px; font-weight: 700; letter-spacing: .08em; }
.sqdip-value-number { display: block; overflow: hidden; color: #fff; font-size: 18px; line-height: 1.05; font-variant-numeric: tabular-nums; font-weight: 800; text-overflow: ellipsis; white-space: nowrap; }
.target-side .sqdip-value-number { color: #8db8ff; font-size: 14px; font-weight: 700; }
.sqdip-no-target { color: #9da3a9 !important; font-size: 11px !important; font-weight: 600 !important; }
.sqdip-error-note { margin-top: 2px; color: #ff8585; font-size: 8px; }
.sqdip-cell[data-metrics="3"] { padding: 3px 5px; }
.sqdip-cell[data-metrics="3"] .sqdip-metric { padding: 0; line-height: 1; }
.sqdip-cell[data-metrics="3"] .sqdip-metric-title { line-height: 1; margin-bottom: 1px; }
.sqdip-cell[data-metrics="3"] .sqdip-group-name { font-size: 9px; line-height: 1; }
.sqdip-cell[data-metrics="3"] .sqdip-value-label { font-size: 8px; line-height: 1; }
.sqdip-cell[data-metrics="3"] .sqdip-value-caption { margin-bottom: 0; font-size: 7px; line-height: 1; }
.sqdip-cell[data-metrics="3"] .sqdip-value-number { font-size: 13px; line-height: 1; }
.sqdip-cell[data-metrics="3"] .target-side .sqdip-value-number { font-size: 11px; }
.sqdip-cell[data-metrics="3"] .sqdip-error-note { margin-top: 0; font-size: 7px; line-height: 1; }.sqdip-empty { height: 100%; display: flex; align-items: center; justify-content: center; color: #858b92; font-size: 12px; }
.sqdip-foot { display: flex; align-items: center; justify-content: space-between; gap: 10px; overflow: hidden; color: #858b92; font-size: 10px; }
.sqdip-foot strong { color: #b9bec3; font-weight: 600; }
.sqdip-foot-note { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sqdip-detail { position: absolute; inset: 0; z-index: 2; display: grid; place-items: center; padding: 24px; background: rgba(0,0,0,.74); }
.sqdip-detail[hidden] { display: none; }
.sqdip-detail-card { width: min(900px, 94vw); max-height: 86vh; min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr); overflow: hidden; border: 1px solid rgba(255,255,255,.23); border-top: 3px solid var(--sq-green); border-radius: 5px; background: #121518; box-shadow: 0 18px 70px rgba(0,0,0,.65); }
.sqdip-detail-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 19px 22px 14px; border-bottom: 1px solid var(--sq-border); }
.sqdip-detail-kicker { margin-bottom: 5px; color: var(--sq-green); font-size: 10px; font-weight: 800; letter-spacing: .13em; }
.sqdip-detail-title { margin: 0; color: #fff; font-size: 21px; line-height: 1.2; }
.sqdip-detail-subtitle { margin-top: 5px; color: #a1a1aa; font-size: 12px; }
.sqdip-detail-close { width: 34px; height: 34px; flex: 0 0 auto; border: 1px solid var(--sq-border); border-radius: 4px; background: #202429; color: #fff; font-size: 20px; cursor: pointer; }
.sqdip-detail-group { padding: 2px 0 17px; }
.sqdip-detail-group + .sqdip-detail-group { padding-top: 15px; border-top: 1px solid var(--sq-border); }
.sqdip-detail-group-title { display: flex; justify-content: space-between; gap: 12px; margin: 0 0 8px; color: #f4f4f5; font-size: 13px; }
.sqdip-detail-group-title small { color: #a1a1aa; font-size: 10px; font-weight: 600; }
.sqdip-detail-summary { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; padding: 0 0 10px; }
.sqdip-detail-table-label { margin: 3px 0 4px; color: #b6bdc4; font-size: 10px; font-weight: 700; }
.sqdip-detail-stat { padding: 10px 12px; border: 1px solid var(--sq-border); background: #181d21; }
.sqdip-detail-stat small { display: block; margin-bottom: 5px; color: #a1a1aa; font-size: 10px; }
.sqdip-detail-stat strong { color: #fff; font-size: 22px; font-variant-numeric: tabular-nums; }
.sqdip-detail-stat.target-stat strong { color: #8db8ff; font-size: 19px; }
.sqdip-detail-content { min-height: 0; padding: 15px 22px 20px; overflow: auto; }
.sqdip-detail-content h3 { margin: 0 0 9px; color: #e4e4e7; font-size: 12px; }
.sqdip-detail-table { width: 100%; border-collapse: collapse; }
.sqdip-detail-table th, .sqdip-detail-table td { padding: 9px 10px; border-bottom: 1px solid rgba(255,255,255,.1); text-align: left; }
.sqdip-detail-table th { color: #969da4; font-size: 10px; font-weight: 700; }
.sqdip-detail-table td { color: #e4e4e7; font-size: 12px; }
.sqdip-detail-table td:last-child, .sqdip-detail-table th:last-child { text-align: right; font-variant-numeric: tabular-nums; }
.sqdip-detail-source { margin-top: 14px; color: #858b92; font-size: 10px; overflow-wrap: anywhere; }
.sqdip-loading { height: 100%; display: grid; place-items: center; color: #d4d4d8; font-size: 14px; }
.sqdip-load-error { color: #ff8585; }
@media (max-width: 1450px) {
  .sqdip-shell { padding: 12px 12px 10px; grid-template-rows: 58px minmax(0,1fr) 20px; gap: 7px; }
  .sqdip-grid { grid-template-columns: 88px repeat(5,minmax(0,1fr)); gap: 4px; grid-template-rows: 38px repeat(5,minmax(0,1fr)); }
  .sqdip-cell { padding: 5px 6px; }
  .sqdip-value-number { font-size: 16px; }
  .target-side .sqdip-value-number { font-size: 13px; }
}
@media (max-height: 820px) {
  .sqdip-shell { min-height: 720px; }
  #sqdip-root { overflow: auto; }
}
@media (prefers-reduced-motion: reduce) {
  .sqdip-cell { transition: none; }
}`;

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
    if (cachedData) return Promise.resolve(cachedData);
    if (dataPromise) return dataPromise;
    dataPromise = new Promise(function (resolve, reject) {
      var script = document.createElement("script");
      var received = false;
      function onData(event) {
        if (received) return;
        received = true;
        window.removeEventListener("sqdip:data-ready", onData);
        cachedData = event.detail;
        resolve(cachedData);
      }
      window.addEventListener("sqdip:data-ready", onData);
      script.src = scriptUrl;
      script.async = true;
      script.onerror = function () {
        window.removeEventListener("sqdip:data-ready", onData);
        dataPromise = null;
        reject(new Error("SQDIP 数据文件加载失败"));
      };
      document.head.appendChild(script);
    });
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
    actual.appendChild(el("span", "sqdip-value-caption", "实际达成"));
    var actualValue = el("strong", "sqdip-value-number", formatValue(group.actual));
    actual.appendChild(actualValue);
    pair.appendChild(actual);
    var target = el("div", "sqdip-value-side target-side");
    target.appendChild(el("span", "sqdip-value-caption", "目标"));
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
      rowHead.style.setProperty("--dim-color", "var(--sq-" + dimension.color + ")");
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
        cell.style.borderLeftColor = "var(--sq-" + dimension.color + ")";
        cell.dataset.metrics = String(groups.length);
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