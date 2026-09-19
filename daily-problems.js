/* ═══════════════════════════════════════════════════════════════
   daily-problems.js — 每日制程问题点日志
   - 数据源: 静态种子 __DAILY_PROBLEMS_SEED__  + localStorage + Firebase(pdtiii_daily_problems)
   - 运行时统一暴露 window.__DAILY_PROBLEMS__ = { savedAt, byDate:{ 日期:[条目] } }
     条目: { date, shift(A-DAY..D-NIGHT), shiftLabel, dept(责任部门), impact(影响数), problem_th(泰语描述) }
   - 导入UI: 产出分析页顶栏挂"问题点录入"按钮; 支持粘贴文本/复制Excel(制表符)/.csv/.txt
   - 保存: localStorage + Firebase PUT 跨端同步(PUT 后立即生效, 无需重新部署)
   - 部署持久化: "导出部署数据" 生成 daily-problems-data.js 内容 → 复制/下载 → commit+push 到 main
   ═══════════════════════════════════════════════════════════════ */
(function () {
  if (window.__DAILY_PROBLEMS_MODULE__) return;
  window.__DAILY_PROBLEMS_MODULE__ = true;

  var FB_URL = "https://dm111-e8a7d-default-rtdb.firebaseio.com/pdtiii_daily_problems.json";
  var LS_KEY = "pdtiii_daily_problems_v1";

  var seed = (typeof window.__DAILY_PROBLEMS_SEED__ !== "undefined") ? window.__DAILY_PROBLEMS_SEED__ : null;
  var local = null;      // {savedAt, byDate}
  var remote = null;     // {savedAt, byDate}
  var merged = { savedAt: 0, byDate: {} };

  function emptyLast() { return "无"; }

  function cloneByDate(byDate) {
    var bd = {};
    if (!byDate) return bd;
    Object.keys(byDate).forEach(function (k) {
      bd[k] = (Array.isArray(byDate[k]) ? byDate[k] : []).map(function (r) { return Object.assign({}, r); });
    });
    return bd;
  }

  function overlay(dst, src) {
    if (!src) return dst;
    Object.keys(src).forEach(function (date) {
      if (Array.isArray(src[date]) && src[date].length) dst[date] = src[date].map(function (r) { return Object.assign({}, r); });
    });
    return dst;
  }

  function maxSaved() {
    var m = seed && seed.savedAt ? seed.savedAt : 0;
    if (local && local.savedAt > m) m = local.savedAt;
    if (remote && remote.savedAt > m) m = remote.savedAt;
    return m;
  }

  function rebuild() {
    var bd = {};
    overlay(bd, seed && seed.byDate);
    overlay(bd, local && local.byDate);
    overlay(bd, remote && remote.byDate);
    merged.savedAt = maxSaved();
    merged.byDate = bd;
    window.__DAILY_PROBLEMS__ = merged;
    window.__DAILY_PROBLEMS_READY__ = true;
    return stats();
  }

  function readLocal() { try { return JSON.parse(localStorage.getItem(LS_KEY) || "null"); } catch (e) { return null; } }
  function writeLocal(p) { try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch (e) {} }
  function readRemote() {
    return fetch(FB_URL + "?t=" + Date.now(), { signal: AbortSignal.timeout(8000) })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .catch(function () { return null; });
  }
  function writeRemote(p) {
    return fetch(FB_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ savedAt: p.savedAt, byDate: p.byDate }),
      signal: AbortSignal.timeout(8000)
    }).catch(function () { return null; });
  }
  function syncFromRemote() {
    readRemote().then(function (r) {
      if (!r || !r.byDate) return;
      var rT = Number(r.savedAt || 0);
      var lT = Number((local && local.savedAt) || 0);
      if (rT > lT) { remote = r; rebuild(); }
    });
  }

  /* ── 解析 (与 scripts/parse_daily_problems.js 一致, 浏览器独立实现) ── */
  var dateStart = /^\s*\d{1,2}\/\d{1,2}\/\d{4}\b/;
  function normalizeDate(s) {
    var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (!m) return "";
    return m[3] + "-" + String(parseInt(m[2], 10)).padStart(2, "0") + "-" + String(parseInt(m[1], 10)).padStart(2, "0");
  }
  function normDept(d) {
    var x = (d || "").replace(/\s+/g, "").toUpperCase().replace(/PRO\./g, "PRO.");
    if (x === "MODELCHANG" || x === "MODELCHANGE" || x === "CHANGEMODEL") return "CHANGEMODEL";
    return x;
  }
  function parseLine(raw) {
    var line = (raw || "").trim();
    if (!line) return null;
    var out = { raw: line, date: "", shift: "", shiftLabel: "", dept: "", impact: null, problem_th: "" };
    var dmm = line.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (dmm) out.date = normalizeDate(dmm[0]);
    var rest = dmm ? line.slice(dmm[0].length) : line;
    var sm = rest.match(/^\s*([A-D])\s*(LINE\s*)?(DAY|NIGHT)\b/i);
    if (sm) {
      out.shift = sm[1].toUpperCase() + "-" + sm[3].toUpperCase();
      out.shiftLabel = sm[0].trim();
      rest = rest.slice(sm[0].length);
    }
    var deptRe = /(PE|IP|QA|PRO[.\s]*[1-4]|Change\s*model|Model\s*chang[e]?)\s*$/i;
    var ptr = deptRe.exec(rest);
    if (ptr) { out.dept = normDept(ptr[1]); rest = rest.slice(0, ptr.index); }
    var nums = rest.match(/\d+/g);
    if (nums && nums.length) out.impact = parseInt(nums[nums.length - 1], 10);
    out.problem_th = rest.replace(/\s+$/g, "").trim();
    return out;
  }
  function parseProblems(text) {
    var byDate = {}, all = [], pending = [];
    function flush() {
      if (!pending.length) return;
      var raw = pending.join(" ").replace(/\s+/g, " ").trim()
        .replace(/^"/, "").replace(/"$/, "").trim();
      pending = [];
      if (!raw) return;
      var p = parseLine(raw);
      if (!p || !p.date) return;
      all.push(p);
      if (!byDate[p.date]) byDate[p.date] = [];
      byDate[p.date].push(p);
    }
    (text || "").split(/\r?\n/).forEach(function (ln) {
      if (!ln.trim()) { flush(); return; }
      if (dateStart.test(ln)) { flush(); pending = [ln]; }
      else pending.push(ln);
    });
    flush();
    return { byDate: byDate, all: all };
  }

  /* ── 统计 ── */
  function stats() {
    var dates = Object.keys(merged.byDate).sort();
    var total = dates.reduce(function (s, d) { return s + merged.byDate[d].length; }, 0);
    return { days: dates.length, total: total, dates: dates, first: dates[0] || "", last: dates[dates.length - 1] || "", savedAt: merged.savedAt };
  }
  function refreshStats() {
    var s = stats();
    var el = document.getElementById("dpStats");
    if (el) el.textContent = "已录入 " + s.days + " 天 · " + s.total + " 条 · 覆盖 " + (s.first ? s.first + " → " + s.last : "无") + " · " + (s.savedAt ? "最近保存 " + new Date(s.savedAt).toLocaleString("zh-CN", { hour12: false }) : "");
    var countEl = document.getElementById("dpBtnCount");
    if (countEl) {
      var btn = document.getElementById("dpBtn");
      if (btn) btn.querySelector("span").textContent = "问题点(" + s.total + ")";
    }
  }

  /* ── 导出部署数据: 生成 daily-problems-data.js 内容 ── */
  function exportData() {
    var dates = Object.keys(merged.byDate).sort();
    var total = dates.reduce(function (s, d) { return s + merged.byDate[d].length; }, 0);
    var payload = { savedAt: merged.savedAt, notes: "每日制程问题点日志; 泰语原文保留, 中文翻译由 AI 按提问语言即时处理; 字段 date/shift(班次)/dept(责任部门)/impact(影响数)/problem_th(泰语描述)", byDate: merged.byDate };
    var js = "/* ══════════════════════════════════════════════════════\n   daily-problems-data.js — 每日制程问题点日志种子数据\n   条目: { date, shift(A-DAY..D-NIGHT), dept(责任部门), impact(影响数), problem_th(泰语原文) }\n   覆盖 " + dates.length + " 天 / " + total + " 条; 由「问题点录入」导出\n   ══════════════════════════════════════════════════════ */\nwindow.__DAILY_PROBLEMS_SEED__ = " + JSON.stringify(payload, null, 1) + ";\n";
    return js;
  }
  function downloadExport() {
    var js = exportData();
    var blob = new Blob([js], { type: "text/javascript;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "daily-problems-data.js";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    return js;
  }
  function copyExport() {
    var js = exportData();
    (navigator.clipboard ? navigator.clipboard.writeText(js) : Promise.reject()).then(
      function () { flash("已复制 daily-problems-data.js 到剪贴板 → 粘贴保存为文件后 commit 推送到 main 即完成永久部署"); },
      function () { flash("复制失败, 请用「下载」获得文件"); }
    );
  }
  function flash(msg) {
    var el = document.getElementById("dpMsg");
    if (el) { el.textContent = msg; el.style.color = "#1c7a3f"; el.style.opacity = "1"; setTimeout(function () { el.style.opacity = "0.6"; }, 6000); }
  }

  /* ── 解析预览 ── */
  function applyPreview(byDate) {
    var dates = Object.keys(byDate).sort();
    var rows = [];
    dates.forEach(function (d) { rows = rows.concat(byDate[d]); });
    var tbody = document.getElementById("dpPreviewBody");
    var tab = document.getElementById("dpPreview");
    var hint = document.getElementById("dpParseHint");
    if (!rows.length) { tab.style.display = "none"; if (hint) hint.textContent = "未解析出有效条目"; return; }
    tab.style.display = "";
    var cap = 200;
    var html = rows.slice(0, cap).map(function (p, i) {
      return '<tr data-i="' + i + '"><td>' + p.date + '</td><td>' + (p.shiftLabel || "-") + '</td><td class="dp-dept">' + (p.dept || "-") + '</td><td class="dp-imp">' + (p.impact === null ? "-" : p.impact) + '</td><td class="dp-th">' + escapeHtml(p.problem_th || "") + '</td></tr>';
    }).join("");
    html = '<tr class="dp-hd"><th>日期</th><th>班次</th><th>部门</th><th>影响</th><th>泰语描述</th></tr>' + html;
    tbody.innerHTML = (rows.length > cap) ? html + '<tr><td colspan="5">…仅预览前 ' + cap + ' 条, 共 ' + rows.length + ' 条, 全部会保存</td></tr>' : html;
    if (hint) hint.textContent = "解析出 " + rows.length + " 条 → 请核对后点「保存到看板」";
  }
  function escapeHtml(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  /* ── 保存: 合并到当前数据并持久化 ── */
  function doSave(byDate) {
    var next = cloneByDate(merged.byDate);
    overlay(next, byDate);            // 导入日期整体替换
    var payload = { savedAt: Date.now(), byDate: next };
    writeLocal(payload);
    local = payload;
    writeRemote(payload);             // 立即同步 Firebase
    rebuild();
    refreshStats();
    flash("已保存到看板并同步 Firebase(" + stats().total + " 条)。立即生效, AI 已可查询。注意: 刷新后永久生效需「导出部署数据」推送到 GitHub。");
  }
  function doClearDate(date) {
    if (!date) return;
    var next = cloneByDate(merged.byDate);
    delete next[date];
    var payload = { savedAt: Date.now(), byDate: next };
    writeLocal(payload); local = payload;
    writeRemote(payload);
    rebuild();
    refreshStats();
    flash("已清除 " + date + " 的问题点");
  }

  /* ── UI ── */
  var _ui = null;
  function buildUI() {
    if (_ui && _ui.parentNode) return;
    var panel = document.createElement("div");
    panel.id = "dpModal";
    panel.style.cssText = "position:fixed;inset:0;z-index:12000;display:none;align-items:flex-start;justify-content:center;background:rgba(15,23,42,.45);backdrop-filter:blur(3px);overflo-y:auto;padding:30px 14px;";
    panel.innerHTML =
      '<div style="max-width:980px;width:100%;background:#fff;border-radius:14px;box-shadow:0 24px 64px rgba(15,23,42,.35);overflow:hidden;display:flex;flex-direction:column;max-height:92vh;">' +
      ' <div style="display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">' +
      '   <div style="flex:1;"><div style="font-size:16px;font-weight:800;color:#1e293b;">每日制程问题点录入</div>' +
      '     <div id="dpStats" style="font-size:12px;color:#64748b;margin-top:3px;">加载中…</div></div>' +
      '   <button id="dpClose" style="border:1px solid #e2e8f0;background:#fff;color:#475569;border-radius:9px;width:34px;height:34px;cursor:pointer;font-size:16px;font-weight:800;">×</button>' +
      ' </div>' +
      ' <div style="padding:18px 20px;overflow-y:auto;display:flex;flex-direction:column;gap:14px;">' +
      '   <div>' +
      '     <div style="font-size:13px;font-weight:800;color:#334155;margin-bottom:8px;">① 粘贴问题点（每行一条）</div>' +
      '     <textarea id="dpInput" rows="8" placeholder="格式: DD/MM/YYYY 班次(A Day / A LINE DAY / B LINE NIGHT…) 泰语描述 影响数 责任部门(PE/IP/QA/PRO.1/Pro.2/Change model…)&#10;&#10;支持从 Excel 直接复制粘贴(制表符/换行), 或上传 .csv/.txt 文件。一行不能完整解析不会丢失, 会合并进上一条。" style="width:100%;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;font-size:12.5px;line-height:1.7;resize:vertical;font-family:inherit;color:#334155;"></textarea>' +
      '     <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap;">' +
      '       <label style="background:#2b5cbf;color:#fff;border-radius:9px;padding:8px 14px;font-size:12.5px;font-weight:800;cursor:pointer;">上传 .csv/.txt<input id="dpFile" type="file" accept=".csv,.txt,.tsv" style="display:none;"></label>' +
      '       <button id="dpParse" style="background:#0f172a;color:#fff;border:0;border-radius:9px;padding:8px 14px;font-size:12.5px;font-weight:800;cursor:pointer;">解析预览</button>' +
      '       <span id="dpParseHint" style="font-size:12px;color:#64748b;align-self:center;"></span>' +
      '     </div>' +
      '   </div>' +
      '   <div id="dpPreview" style="display:none;"><div style="font-size:13px;font-weight:800;color:#334155;margin-bottom:8px;">② 解析预览</div>' +
      '     <div style="max-height:260px;overflow:auto;border:1px solid #e2e8f0;border-radius:10px;"><table id="dpPreviewBody" style="width:100%;border-collapse:collapse;font-size:12px;"></table></div>' +
      '   </div>' +
      '   <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:2px;">' +
      '     <button id="dpSave" style="background:#1c7a3f;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-size:13px;font-weight:800;cursor:pointer;">✔ 保存到看板(即生效+Firebase同步)</button>' +
      '     <span style="font-size:12px;color:#94a3b8;">保存后 AI 立即可查; 想永久部署(刷新仍保留)再点导出推送</span>' +
      '   </div>' +
      '   <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-top:1px dashed #e2e8f0;padding-top:14px;">' +
      '     <div style="font-size:13px;font-weight:800;color:#334155;">③ 永久部署(commit 到 GitHub)</div>' +
      '     <button id="dpCopy" class="dp-sec">复制 daily-problems-data.js</button>' +
      '     <button id="dpDl" class="dp-sec">下载该文件</button>' +
      '     <label style="font-size:12px;color:#64748b;">然后提交推送到 main, GitHub Pages 自动部署。修改只对浏览器生效 vs 全站生效见右侧说明。</label>' +
      '   </div>' +
      '   <div style="border-top:1px dashed #e2e8f0;padding-top:12px;font-size:12px;color:#64748b;line-height:1.8;">' +
      '      <div style="font-weight:800;color:#334155;margin-bottom:4px;">④ 数据说明</div>' +
      '     · 字段: 日期 / 班次(A-D DAY|NIGHT) / 责任部门(PE·IP·QA·PRO.1-4·CHANGEMODEL换型) / 影响数(产出缺口) / 泰语原文描述。<br>' +
      '     · 语言: AI 按提问语言回答 —— 泰语问→用泰语原文总结; 中文问→把泰语翻译成中文并给出分析。<br>' +
      '     · 来源: 静态种子(已部署) + 本浏览器(localStorage) + Firebase 云端; 三源按日期合并, 覆盖面取最新。<br>' +
      '     · 「导出部署数据」会把当前全部(含 lstore+Firebase)写回种子文件, 确保任何人打开都是这份数据。' +
      '   </div>' +
      '   <div id="dpMsg" style="font-size:12.5px;color:#1c7a3f;min-height:18px;"></div>' +
      ' </div>' +
      '</div>';
    document.body.appendChild(panel);
    /* 表头样式等 */
    var st = document.createElement("style");
    st.textContent = '.dp-th{color:#475569;max-width:520px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}td.dp-dept,.dp-imp,.dp-hd th{font-weight:800}.dp-hd th{background:#f1f5f9;color:#334155;padding:7px 10px;text-align:left;position:sticky;top:0}#dpPreviewBody td{padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#334155;font-variant-numeric:tabular-nums}.dp-sec{background:#fff;border:1px solid #cbd5e1;color:#334155;border-radius:9px;padding:8px 14px;font-size:12.5px;font-weight:700;cursor:pointer}#dpPreviewBody tr:hover td{background:#f8fafc}';
    document.head.appendChild(st);
    _ui = panel;
    bindUI(panel);
  }
  function bindUI(panel) {
    var lastParsed = null;
    panel.querySelector("#dpClose").addEventListener("click", function () { panel.style.display = "none"; });
    panel.addEventListener("click", function (e) { if (e.target === panel) panel.style.display = "none"; });
    panel.querySelector("#dpParse").addEventListener("click", function () {
      var res = parseProblems(document.getElementById("dpInput").value);
      lastParsed = res.byDate;
      applyPreview(res.byDate);
    });
    panel.querySelector("#dpSave").addEventListener("click", function () {
      var res = parseProblems(document.getElementById("dpInput").value);
      if (!res.all.length) { flash("请先粘贴内容"); return; }
      doSave(res.byDate);
    });
    panel.querySelector("#dpFile").addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () { document.getElementById("dpInput").value = String(r.result || ""); var res = parseProblems(r.result); lastParsed = res.byDate; applyPreview(res.byDate); };
      r.readAsText(f);
    });
    panel.querySelector("#dpCopy").addEventListener("click", copyExport);
    panel.querySelector("#dpDl").addEventListener("click", function () { downloadExport(); flash("已下载 daily-problems-data.js → 放回仓库根目录, commit+push 到 main 即部署"); });
  }

  function openModal() {
    buildUI();
    if (_ui.style.display === "flex") { _ui.style.display = "none"; return; }
    _ui.style.display = "flex";
    refreshStats();
  }

  /* ── 挂载到产出分析页顶栏(与 AI 按钮同排) ── */
  window.initDailyProblemsForAnaPage = function (anaRoot) {
    var top = anaRoot && anaRoot.querySelector ? (anaRoot.querySelector(".ana-rt") || anaRoot.querySelector(".ana-top")) : null;
    if (!top) return;
    var btn = document.getElementById("dpBtn");
    if (!btn) {
      buildUI();
      btn = document.createElement("button");
      btn.id = "dpBtn";
      btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg><span>问题点(0)</span>';
      btn.title = "每日制程问题点: 粘贴/Excel导入, 保存后 AI 可精准汇总分析并按语言回答";
      btn.style.cssText = "display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;margin:0;padding:0 14px;border-radius:10px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font-size:12.5px;font-weight:800;cursor:pointer;line-height:1;white-space:nowrap;letter-spacing:.2px;";
      btn.addEventListener("click", openModal);
    }
    top.appendChild(btn);
    refreshStats();
    syncFromRemote();   // 拉一次 Firebase 云端覆盖
  };

  /* 初始化运行时数据(不依赖 UI) */
  local = readLocal();
  rebuild();
  remote = null;
})();