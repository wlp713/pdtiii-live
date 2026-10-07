/* ============================================================
   SQDIP 面板（全新，自包含）— 2026-10-07
   数据源：各车间 2026-10 的 SQDIP Excel 主表（由 tools/extract_sqdip.py 提取为 sqdip-data.js）
   入口：顶栏「📊 SQDIP」按钮 -> window.openSQDIP() / window.closeSQDIP()
   设计：与 pdtiii 看板同色系（深空黑底 + 1px 细边玻璃卡片 + 语义色）
   ============================================================ */
(function () {
  "use strict";

  var ROOT_ID = "sqdipRoot";

  var CSS = [
    "#sqdipRoot{position:fixed;inset:0;z-index:9998;box-sizing:border-box;",
    "background:#000;background-image:",
    "radial-gradient(85% 70% at 10% -6%,rgba(30,64,175,.13),transparent 52%),",
    "radial-gradient(65% 65% at 93% 0%,rgba(59,130,246,.09),transparent 55%),",
    "radial-gradient(120% 90% at 50% 120%,rgba(16,185,129,.05),transparent 62%);",
    "color:#f4f4f5;font-family:'Inter',-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;",
    "display:flex;flex-direction:column;padding:11px 15px 8px;gap:8px;overflow:hidden;",
    "-webkit-font-smoothing:antialiased}",
    "#sqdipRoot *{box-sizing:border-box}",

    ".sq-top{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:14px}",
    ".sq-brand{display:flex;align-items:baseline;gap:10px;min-width:0}",
    ".sq-title{font-size:19px;font-weight:800;letter-spacing:2.5px;white-space:nowrap;",
    "background:linear-gradient(90deg,#e6edf3,#58a6ff);-webkit-background-clip:text;background-clip:text;",
    "-webkit-text-fill-color:transparent}",
    ".sq-sub{font-size:11px;color:#71717a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".sq-right{display:flex;align-items:center;gap:14px;flex:0 0 auto}",
    ".sq-legend{display:flex;align-items:center;gap:11px;font-size:10px;color:#a1a1aa}",
    ".sq-legend i{width:6px;height:6px;border-radius:50%;display:inline-block;margin-right:5px;vertical-align:1px}",
    ".sq-btn{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);color:#d4d4d8;",
    "border-radius:7px;padding:5px 11px;font-size:11px;font-weight:600;cursor:pointer;letter-spacing:.5px}",
    ".sq-btn:hover{background:rgba(88,166,255,.15);border-color:rgba(88,166,255,.5);color:#fff}",

    ".sq-alert{flex:0 0 auto;display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:9px;",
    "font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;",
    "background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.22);color:#fca5a5}",
    ".sq-alert.ok{background:rgba(16,185,129,.06);border-color:rgba(16,185,129,.22);color:#6ee7b7}",
    ".sq-alert b{color:#fff;font-weight:700}",
    ".sq-pulse{width:6px;height:6px;border-radius:50%;background:#ef4444;flex:0 0 auto;",
    "box-shadow:0 0 0 0 rgba(239,68,68,.6);animation:sqPulse 2.4s ease-out infinite}",
    ".sq-alert.ok .sq-pulse{background:#10b981;animation:none;box-shadow:none}",
    "@keyframes sqPulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,.45)}70%{box-shadow:0 0 0 7px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}",

    ".sq-grid{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px}",
    ".sq-card{min-height:0;display:flex;flex-direction:column;overflow:hidden;border-radius:11px;",
    "background:rgba(18,18,21,.98);border:1px solid rgba(255,255,255,.08);border-top-width:2px;",
    "box-shadow:0 12px 34px rgba(0,0,0,.55)}",
    ".sq-card.st-good{border-top-color:rgba(16,185,129,.75)}",
    ".sq-card.st-warn{border-top-color:rgba(245,158,11,.8)}",
    ".sq-card.st-bad{border-top-color:rgba(239,68,68,.85)}",
    ".sq-card.st-na{border-top-color:rgba(255,255,255,.14)}",
    ".sq-chd{flex:0 0 auto;display:flex;align-items:center;gap:7px;padding:8px 11px 7px;",
    "background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,0));",
    "border-bottom:1px solid rgba(255,255,255,.06)}",
    ".sq-ws{font-size:17px;font-weight:800;letter-spacing:1.2px;color:#fff}",
    ".sq-wscn{font-size:10px;color:#71717a;padding-top:4px;white-space:nowrap}",
    ".sq-day{margin-left:auto;font-size:10px;color:#6b6b74;background:rgba(255,255,255,.04);",
    "border:1px solid rgba(255,255,255,.07);border-radius:5px;padding:2px 6px;white-space:nowrap}",
    ".sq-count{display:flex;gap:8px;font-size:10.5px;color:#a1a1aa;white-space:nowrap}",
    ".sq-count b{font-variant-numeric:tabular-nums}",
    ".sq-c-good b{color:#10b981}.sq-c-warn b{color:#f59e0b}.sq-c-bad b{color:#ef4444}",
    ".sq-cbody{flex:1 1 auto;min-height:0;overflow:hidden;padding:2px 0 4px;",
    "display:flex;flex-direction:column;justify-content:space-around}",

    ".sq-sec{padding:2px 0 1px}",
    ".sq-shd{display:flex;align-items:center;gap:6px;padding:5px 11px 2px}",
    ".sq-badge{width:16px;height:16px;border-radius:4px;display:grid;place-items:center;font-size:10px;",
    "font-weight:800;background:rgba(255,255,255,.07);color:#d4d4d8;flex:0 0 auto}",
    ".sq-shd .t{font-size:10.5px;color:#8b8b93;letter-spacing:.3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".sq-blk{color:#52525b;font-size:9.5px}",
    ".sq-div{height:1px;background:rgba(255,255,255,.045);margin:5px 11px 2px}",

    ".sq-row{display:flex;align-items:baseline;gap:5px;padding:4px 11px 4px 9px;font-size:12.5px;",
    "border-left:2px solid transparent}",
    ".sq-row .nm{color:#9d9da6;flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".sq-row .nt{flex:0 0 auto;font-size:10px;color:#6b6b74;font-variant-numeric:tabular-nums}",
    ".sq-row .val{flex:0 0 auto;font-weight:800;font-size:15px;color:#e8e8ea;",
    "font-variant-numeric:tabular-nums;letter-spacing:.2px}",
    ".sq-row .u{flex:0 0 auto;font-size:9.5px;color:#52525b;margin-left:2px}",
    ".sq-row .tg{flex:0 0 auto;font-size:10px;color:#4b4b52;font-variant-numeric:tabular-nums;white-space:nowrap}",
    ".sq-row.st-good .val{color:#10b981}",
    ".sq-row.st-warn .val{color:#f59e0b}",
    ".sq-row.st-bad .val{color:#ef4444}",
    ".sq-row.st-bad{border-left-color:rgba(239,68,68,.5);background:rgba(239,68,68,.045)}",
    ".sq-row.st-warn{border-left-color:rgba(245,158,11,.35)}",
    ".sq-row:hover{background:rgba(255,255,255,.03)}",

    ".sq-foot{flex:0 0 auto;display:flex;justify-content:space-between;gap:16px;font-size:9.5px;color:#3f3f46;",
    "white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
    ".sq-foot span{overflow:hidden;text-overflow:ellipsis}",
    "@media (max-width:1400px){#sqdipRoot{font-size:12px}}"
  ].join("");

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  var ST_LABEL = { good: "达成", warn: "预警", bad: "异常", na: "无基准" };
  var DIM_TITLE = { S: "安全", Q: "品质", D: "交付", I: "人员/损失", P: "效率" };

  function worst(statuses) {
    if (statuses.indexOf("bad") >= 0) return "bad";
    if (statuses.indexOf("warn") >= 0) return "warn";
    if (statuses.indexOf("good") >= 0) return "good";
    return "na";
  }

  function renderCard(w) {
    var statuses = [], bad = [], warn = [], good = [];
    w.dims.forEach(function (d) {
      d.rows.forEach(function (r) {
        statuses.push(r.status);
        if (r.status === "bad") bad.push({ d: d.key, r: r });
        else if (r.status === "warn") warn.push({ d: d.key, r: r });
        else if (r.status === "good") good.push({ d: d.key, r: r });
      });
    });
    var card = el("div", "sq-card st-" + worst(statuses));

    var hd = el("div", "sq-chd");
    hd.appendChild(el("div", "sq-ws", w.id));
    if (w.cn) { var cn = el("div", "sq-wscn", w.cn); hd.title = w.id + " " + w.cn; hd.appendChild(cn); }
    var cnt = el("div", "sq-count");
    [["sq-c-good", "✓", good.length], ["sq-c-warn", "!", warn.length], ["sq-c-bad", "✕", bad.length]]
      .forEach(function (it) {
        var s = el("span", it[0]);
        s.appendChild(document.createTextNode(it[1] + " "));
        s.appendChild(el("b", null, String(it[2])));
        cnt.appendChild(s);
      });
    hd.appendChild(cnt);
    if (w.lastDay) hd.appendChild(el("div", "sq-day", "数据至 " + w.lastDay));
    card.appendChild(hd);

    var body = el("div", "sq-cbody");
    w.dims.forEach(function (d, di) {
      var sec = el("div", "sq-sec");
      var sh = el("div", "sq-shd");
      sh.appendChild(el("div", "sq-badge", d.key));
      sh.appendChild(el("div", "t", DIM_TITLE[d.key] || d.title || ""));
      sec.appendChild(sh);
      var multiBlk = d.rows.length > 1;
      var lastBlk = null;
      d.rows.forEach(function (r) {
        if (multiBlk && r.block && r.block !== lastBlk && lastBlk !== null) {
          sec.appendChild(el("div", "sq-div"));
        }
        lastBlk = r.block || lastBlk;
        var row = el("div", "sq-row st-" + r.status);
        var nm = el("div", "nm", r.name);
        if (r.th) nm.title = r.name + " · " + r.th;
        row.appendChild(nm);
        if (r.note) row.appendChild(el("div", "nt", r.note));
        if (r.targetText) row.appendChild(el("div", "tg", "目标 " + r.targetText));
        row.appendChild(el("div", "val", r.disp));
        if (r.unit) row.appendChild(el("div", "u", r.unit));
        sec.appendChild(row);
      });
      body.appendChild(sec);
      if (di < w.dims.length - 1) body.appendChild(el("div", "sq-div"));
    });
    card.appendChild(body);
    return card;
  }

  function render() {
    var data = window.SQDIP_DATA;
    var root = document.getElementById(ROOT_ID);
    if (root) root.parentNode.removeChild(root);
    root = el("div");
    root.id = ROOT_ID;

    /* --- 顶栏 --- */
    var top = el("div", "sq-top");
    var brand = el("div", "sq-brand");
    brand.appendChild(el("div", "sq-title", "SQDIP 日常管理面板"));
    var wsCount = data && data.workshops ? data.workshops.length : 0;
    brand.appendChild(el("div", "sq-sub",
      "2026 年 " + (data && data.month ? data.month.split("-")[1] : "10") + " 月 · " + wsCount +
      " 个车间 · 数据取自各车间 SQDIP 表主表（Excel）"));
    top.appendChild(brand);

    var right = el("div", "sq-right");
    var lg = el("div", "sq-legend");
    [["#10b981", "达成"], ["#f59e0b", "预警"], ["#ef4444", "异常"], ["#a1a1aa", "无基准"]]
      .forEach(function (p) {
        var s = el("span");
        var i = el("i");
        i.style.background = p[0];
        s.appendChild(i);
        s.appendChild(document.createTextNode(p[1]));
        lg.appendChild(s);
      });
    right.appendChild(lg);
    var btn = el("button", "sq-btn", "✕ 关闭 (ESC)");
    btn.onclick = window.closeSQDIP;
    right.appendChild(btn);
    top.appendChild(right);
    root.appendChild(top);

    /* --- 异常汇总条 --- */
    var badList = [], warnCnt = 0, totalRows = 0;
    (data.workshops || []).forEach(function (w) {
      w.dims.forEach(function (d) {
        d.rows.forEach(function (r) {
          totalRows++;
          if (r.status === "bad") badList.push(w.id + " " + r.name + " " + r.disp +
            (r.targetText ? "(目标" + r.targetText + ")" : ""));
          else if (r.status === "warn") warnCnt++;
        });
      });
    });
    var alert = el("div", "sq-alert" + (badList.length ? "" : " ok"));
    alert.appendChild(el("div", "sq-pulse"));
    var msg;
    if (badList.length) {
      msg = "⚠ 异常 " + badList.length + " 项：" + badList.slice(0, 4).join(" · ");
      if (badList.length > 4) msg += " …";
      if (warnCnt) msg += "　（另有预警 " + warnCnt + " 项）";
    } else if (warnCnt) {
      msg = "✓ 无异常指标 · 预警 " + warnCnt + " 项";
    } else {
      msg = "✓ 全部指标正常（共 " + totalRows + " 项）";
    }
    alert.appendChild(el("b", null, msg));
    root.appendChild(alert);

    /* --- 五车间卡片 --- */
    var grid = el("div", "sq-grid");
    (data.workshops || []).forEach(function (w) { grid.appendChild(renderCard(w)); });
    root.appendChild(grid);

    /* --- 脚注 --- */
    var foot = el("div", "sq-foot");
    var srcs = (data.workshops || []).map(function (w) { return w.src; }).join(" · ");
    foot.appendChild(el("span", null, "数据源：" + srcs));
    foot.appendChild(el("span", null, "提取时间 " + (data.generatedAt || "-") +
      " · 刷新：重跑 tools/extract_sqdip.py 后重新发布"));
    root.appendChild(foot);

    document.body.appendChild(root);

    document.addEventListener("keydown", escClose, true);
  }

  function escClose(e) {
    if (e.key === "Escape") { window.closeSQDIP(); }
  }

  window.openSQDIP = function () {
    if (!window.SQDIP_DATA) { alert("SQDIP 数据未加载（sqdip-data.js）"); return; }
    render();
  };
  window.closeSQDIP = function () {
    var root = document.getElementById(ROOT_ID);
    if (root && root.parentNode) root.parentNode.removeChild(root);
    document.removeEventListener("keydown", escClose, true);
  };

  var style = document.createElement("style");
  style.id = "sqdipStyle";
  style.textContent = CSS;
  document.head.appendChild(style);
})();
