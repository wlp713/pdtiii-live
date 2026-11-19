/* 两小时检讨会（2026-11-19 v3）
   数据：DM 后台每分钟算好写到同一个实时库 /dm_meeting/PRO2（作业长手机填的 LOSS 问题点、PRO2 未关闭异常单、逐小时 LOSS），30 秒读一次。
   ① 看板「未达成原因」模块改读这份数据（renderProblems 开头调 mtgPanel）
   ② 模块右上角 ⛶ → 完整页面 #meeting（不是弹窗；刷新后仍停在本页，返回回看板）
   ③ 会议大屏：一屏放下、不滚动。顶部横条 = 每小时产出（看板 segsOf 同一份分段数据，时间从左到右，进行中时段发光）；
      下方 = 四条线问题卡一字排开到底（同一问题合并，放不下折叠成「另 N 条 · X 台」，没填原因的 LOSS 合成一行压卡底）+ 升级问题窄栏。 */
(function () {
  "use strict";
  var DB = "https://dm111-e8a7d-default-rtdb.firebaseio.com/dm_meeting/PRO2.json";
  var qs = new URLSearchParams(location.search);
  var SRC = qs.get("mtgsrc") || DB;            // ?mtgsrc= 仅供本地用样例数据测试
  var POLL = 30000, STALE = 5 * 60000;
  var DEPT_COLORS = ["#6ea1ff", "#3ed1c0", "#b49cff", "#ff8fc4", "#5cc8ff", "#e6d38a", "#9aa6b8"];
  var LINES = ["Final A line", "Final B Line", "Final C line", "Final D line"];
  var T = {
    zh: { title: "两小时检讨会", back: "看板", scopeWin: "本次检讨", scopeAll: "全班", hourly: "每小时产出",
      probs: "问题点", issues: "升级问题", day: "白班", night: "夜班", loss: "LOSS", unexp: "未说明",
      lgA: "实际", lgP: "计划", lgGap: "欠产", lgOver: "超产", deptT: "LOSS 责任部门",
      noLoss: "无 LOSS", noIss: "没有未关闭的问题", gapTx: "未填原因", more: "另 {n} 条", moreQ: "{q} 台",
      upd: "更新", stale: "检讨会数据超过 5 分钟没更新，请检查网络或 DM 后台", loading: "正在读取…", fail: "读取失败，30 秒后自动重试",
      open: "待接单", doing: "处理中", verify: "待确认", over: "超时", min: "分钟", hr: "小时", day0: "天", rate: "达成", hrsFmt: "{h} 点" },
    th: { title: "ประชุมทบทวนทุก 2 ชม.", back: "บอร์ด", scopeWin: "รอบนี้", scopeAll: "ทั้งกะ", hourly: "ยอดผลิตรายชั่วโมง",
      probs: "ปัญหา", issues: "ปัญหาที่ยกระดับ", day: "กะเช้า", night: "กะดึก", loss: "LOSS", unexp: "ยังไม่ระบุ",
      lgA: "จริง", lgP: "แผน", lgGap: "ขาด", lgOver: "เกิน", deptT: "LOSS ตามหน่วยงาน",
      noLoss: "ไม่มี LOSS", noIss: "ไม่มีปัญหาค้าง", gapTx: "ยังไม่ระบุสาเหตุ", more: "อีก {n} รายการ", moreQ: "{q} เครื่อง",
      upd: "อัปเดต", stale: "ข้อมูลประชุมไม่อัปเดตเกิน 5 นาที กรุณาตรวจสอบเครือข่ายหรือระบบ DM", loading: "กำลังโหลด…", fail: "โหลดไม่สำเร็จ จะลองใหม่ใน 30 วินาที",
      open: "รอรับงาน", doing: "กำลังแก้ไข", verify: "รอยืนยัน", over: "เกินเวลา", min: "นาที", hr: "ชม.", day0: "วัน", rate: "สำเร็จ", hrsFmt: "{h} น." }
  };
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
  var st = { lang: ls("mtg_lang") || "zh", scope: ls("mtg_scope") || "win", d: null, err: false };
  if (!T[st.lang]) st.lang = "zh";
  function t(k) { return T[st.lang][k]; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function n0(x) { return Math.round(Number(x) || 0).toLocaleString("en-US"); }
  function nm(o, lg) { return o ? (o[lg || st.lang] || o.zh || "") : ""; }
  function short(name) { return String(name || "").replace(/\s*line$/i, "").toUpperCase(); }
  function arr(x) { return Array.isArray(x) ? x.filter(Boolean) : x && typeof x === "object" ? Object.keys(x).map(function (k) { return x[k]; }) : []; }
  function bkk(ts) { return new Date(ts + 7 * 3600000); }   // 工厂时间 UTC+7，与电脑时区无关
  function hhmm(ts) { var d = bkk(ts); return ("0" + d.getUTCHours()).slice(-2) + ":" + ("0" + d.getUTCMinutes()).slice(-2); }
  var ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  var ICON_OK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.6 2.5L16 9.5"/></svg>';

  /* 本次检讨覆盖的小时 = 当班累计：开班 → 本次会议时刻（最近一次会开始后 60 分钟内算本次，否则看下一次会）；
     例：15:00 的会看 8–15 点。最后一次会过后看整班。（创始人 2026-11-19 定：LOSS 按当班累计，不是两次会之间） */
  function windowHours(d) {
    var hours = arr(d.hours), slots = arr(d.slots).map(function (s) { var p = String(s.time).split(":"); return +p[0] * 60 + (+p[1] || 0); });
    if (!slots.length) return hours;
    var night = d.shift === "NIGHT";
    var rel = function (m) { return night && m < 20 * 60 ? m + 1440 : m; };
    var nd = bkk(Date.now()), nowM = rel(nd.getUTCHours() * 60 + nd.getUTCMinutes());
    var ss = slots.map(rel).sort(function (a, b) { return a - b; }), meet = null, i;
    for (i = 0; i < ss.length; i++) if (ss[i] <= nowM && nowM - ss[i] < 60) meet = i;
    if (meet == null) for (i = 0; i < ss.length; i++) if (ss[i] > nowM) { meet = i; break; }
    if (meet == null) return hours;
    var to = ss[meet];
    return hours.filter(function (h) { return rel(h * 60) < to; });
  }
  function hrs(list) { return list.length ? t("hrsFmt").replace("{h}", list.join(" ")) : ""; }   // 小时短写：8 9 10 点
  function winLabel(win) { return win.length ? win[0] + ":00–" + ((win[win.length - 1] + 1) % 24) + ":00" : ""; }

  /* 按范围汇总每条线：计划 / 实际 / LOSS / 未说明（及哪几个小时）/ 按部门归因 / 同一问题合并（台数相加、记下小时） */
  function summarize(d, scopeH) {
    var inS = function (h) { return scopeH.indexOf(h) >= 0; };
    var lines = arr(d.lines).map(function (ln) {
      var s = { key: ln.key, name: ln.name, p: 0, a: 0, l: 0, gap: 0, gapH: [], depts: {}, groups: [] };
      arr(ln.h).forEach(function (h) {
        if (!inS(h.hour)) return;
        s.p += h.p || 0; s.a += h.a || 0;
        if (h.st !== "done") return;
        s.l += h.l || 0;
        var g = Math.round((h.l || 0) - (h.q || 0));
        if (g > 0) { s.gap += g; s.gapH.push(h.hour); }
      });
      return s;
    });
    var byKey = {}; lines.forEach(function (s) { byKey[s.key] = s; });
    var deptTot = {}, gmap = {};
    arr(d.probs).forEach(function (p) {
      var s = byKey[p.line];
      if (!s || !inS(p.hour)) return;
      var dk = p.d ? p.d.zh : "";
      if (p.qty && dk) { if (!s.depts[dk]) s.depts[dk] = { d: p.d, q: 0 }; s.depts[dk].q += p.qty; deptTot[dk] = (deptTot[dk] || 0) + p.qty; }
      var gk = p.line + "|" + (p.text || p.zh || p.type) + "|" + dk, g = gmap[gk];
      if (!g) { g = gmap[gk] = { p: p, q: 0, hours: [], equip: [] }; s.groups.push(g); }
      g.q += p.qty || 0;
      if (g.hours.indexOf(p.hour) < 0) g.hours.push(p.hour);
      if (p.equip && g.equip.indexOf(p.equip) < 0) g.equip.push(p.equip);
    });
    lines.forEach(function (s) {
      s.groups.sort(function (a, b) { return b.q - a.q; });
      s.groups.forEach(function (g) { g.hours.sort(function (a, b) { return scopeH.indexOf(a) - scopeH.indexOf(b); }); });
    });
    var order = Object.keys(deptTot).sort(function (a, b) { return deptTot[b] - deptTot[a]; });
    var color = {}; order.forEach(function (k, i) { color[k] = DEPT_COLORS[Math.min(i, DEPT_COLORS.length - 1)]; });
    var tot = lines.reduce(function (o, s) { o.p += s.p; o.a += s.a; o.l += s.l; o.gap += s.gap; return o; }, { p: 0, a: 0, l: 0, gap: 0 });
    return { lines: lines, order: order, color: color, deptTot: deptTot, tot: tot };
  }

  /* 一屏放下：内容超出就从尾部收起，换成「另 N 条」，绝不出滚动条 */
  function fitList(box, rows, moreHtml) {
    box.innerHTML = rows.map(function (r) { return r.html; }).join("");
    if (box.scrollHeight <= box.clientHeight + 1) return;
    var foot = document.createElement("div"); foot.className = "mtg-more"; box.appendChild(foot);
    var n = rows.length;
    while (n > 0 && box.scrollHeight > box.clientHeight + 1) { n--; box.removeChild(box.children[n]); foot.innerHTML = moreHtml(rows.slice(n)); }
  }
  function moreTxt(hidden, withQ) {
    var q = hidden.reduce(function (a, r) { return a + (r.q || 0); }, 0);
    return t("more").replace("{n}", '<b>' + hidden.length + '</b>') + (withQ && q ? " · " + t("moreQ").replace("{q}", '<b>' + n0(q) + '</b>') : "");
  }

  /* ---------- 页面 DOM ---------- */
  function build() {
    if ($("mtg")) return;
    var el = document.createElement("div");
    el.id = "mtg"; el.hidden = true; el.setAttribute("role", "main");
    el.innerHTML =
      '<header class="mtg-top">' +
        '<button class="mtg-back" id="mtgBack">' + ICON_BACK + '<span data-mk="back"></span></button>' +
        '<div class="mtg-title"><h1 data-mk="title"></h1><span class="mtg-sub" id="mtgSub"></span></div><div class="mtg-sp"></div>' +
        '<div class="mtg-seg" id="mtgScope"><button data-v="win" data-mk="scopeWin"></button><button data-v="all" data-mk="scopeAll"></button></div>' +
        '<div class="mtg-seg" id="mtgLang"><button data-v="zh">中文</button><button data-v="th">ไทย</button></div>' +
        '<span class="mtg-fresh" id="mtgFresh"><i></i><span></span></span><span class="mtg-clock" id="mtgClock"></span>' +
      '</header>' +
      '<div class="mtg-banner" id="mtgBanner"></div>' +
      '<div class="mtg-body">' +
        '<section class="mtg-box mtg-strip"><div class="mtg-h"><h2 data-mk="hourly"></h2><span class="sp"></span><div class="mtg-lg">' +
          '<span><i style="background:linear-gradient(90deg,#3b7cf0,#6aa4ff)"></i><span data-mk="lgA"></span></span>' +
          '<span><i style="background:var(--track)"></i><span data-mk="lgP"></span></span>' +
          '<span><i style="background:var(--hatch-red)"></i><span data-mk="lgGap"></span></span>' +
          '<span><i style="background:var(--green)"></i><span data-mk="lgOver"></span></span></div></div><div class="ms-wrap" id="mtgStrip"></div></section>' +
        '<section class="mtg-box mtg-dept"><div class="mtg-h"><h2 data-mk="deptT"></h2><span class="sp"></span><span class="tot r" id="mtgDeptTot"></span></div><div class="mtg-items md-list" id="mtgDept"></div></section>' +
        '<div class="mtg-cards" id="mtgCards"></div>' +
        '<section class="mtg-box mi-box"><div class="mtg-h"><h2 data-mk="issues"></h2><span class="cnt" id="mtgIssCnt"></span></div><div class="mtg-items" id="mtgIss"></div></section>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      if (b.id === "mtgBack") return closeMeeting();
      var p = b.parentNode && b.parentNode.id;
      if (p === "mtgLang") { st.lang = b.dataset.v; ls("mtg_lang", st.lang); }
      else if (p === "mtgScope") { st.scope = b.dataset.v; ls("mtg_scope", st.scope); }
      else return;
      render();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && isOpen()) closeMeeting(); });
    if (window.ResizeObserver) {
      var rq = 0;
      new ResizeObserver(function () { clearTimeout(rq); rq = setTimeout(function () { if (isOpen()) render(); }, 80); }).observe(el);
    }
  }
  function isOpen() { var el = $("mtg"); return !!(el && !el.hidden); }

  /* ---------- 顶部横条：看板小时分段（segsOf，和看板主页同一份数，进行中时段实时） ---------- */
  function finalLines() {
    try {
      var have = {}, out = state.lines.filter(function (l) { var k = normName(l.name); if (FINAL_SET.has(k)) { have[k] = 1; return true; } return false; });
      LINES.forEach(function (n) { if (!have[normName(n)]) out.push(makeMissingLine(n)); });
      return out.sort(function (a, b) { return normName(a.name).localeCompare(normName(b.name)); });
    } catch (e) { return []; }
  }
  function renderStrip(scopeH) {
    var box = $("mtgStrip"); if (!box) return;
    var night, table, nowM;
    try { nowM = bkkMins(); night = shiftSegAt(nowM).shift === "night"; table = night ? NIGHT_SEGS : DAY_SEGS; } catch (e) { box.innerHTML = ""; return; }
    var cmp = night && nowM < 480 ? nowM + 1440 : nowM;
    if (st.d && st.d.shift !== (night ? "NIGHT" : "DAY")) scopeH = null;   // 交班时 DM（20:00）比看板（20:20 后）先切班：班次对不上就不按检讨范围变暗
    var fm =function (m) { m = ((m % 1440) + 1440) % 1440; return Math.floor(m / 60) + ":" + ("0" + (m % 60)).slice(-2); };
    var inWin = function (t0) { return !scopeH || scopeH.indexOf(Math.floor((t0 % 1440) / 60)) >= 0; };
    var rowsHtml = [];
    var head = '<span></span>' + table.map(function (sg) {
      var cur = sg[0] <= cmp && cmp < sg[1];
      return '<span class="ms-th' + (cur ? " cur" : inWin(sg[0]) && sg[0] < cmp ? " win" : "") + '">' + fm(sg[0]) + '</span>';
    }).join("");
    finalLines().forEach(function (l) {
      var html = "", any = false;
      var segs = []; try { segs = segsOf(l.name, l.actual, l.plan, l.target) || []; } catch (e) { segs = []; }
      var byLab = {}; segs.forEach(function (s) { if (s.lab) byLab[s.lab] = s; else if (s.base) byLab.base = s; });
      html += '<span class="ms-ln">' + esc(short(l.name)) + '</span>';
      table.forEach(function (sg, i) {
        var s = byLab[i + 1] || (i === 0 ? byLab.base : null);
        if (!s || sg[0] > cmp) { html += '<div class="ms-c todo"></div>'; return; }
        var a = Math.round(s.actual || 0), p = Math.round(s.plan || 0), dif = a - p;
        if (!a && !p) { html += '<div class="ms-c idle">—</div>'; return; }   // 没计划也没产出（停线 / 没开线）：不画红斜纹，免得像欠产
        any = true;
        /* 放大差距的刻度：条左端 = 计划的 70%，右端 = 计划。完成 95% → 蓝 83%、红斜纹 17%，欠产一眼看得出（准确数字写在条里） */
        var w = p > 0 ? Math.max(a > 0 ? 6 : 0, Math.min(100, (a / p - 0.7) / 0.3 * 100)) : (a > 0 ? 100 : 0);
        var cls = "ms-c" + (s.live ? " cur" : "") + (st.scope === "win" && !s.live && !inWin(sg[0]) ? " out" : "");
        /* 一格一根粗条：底轨 = 计划（条尾写计划数），蓝 = 实际（条里写实际数），红斜纹 = 欠产，绿边 = 超产；上 = 差异 */
        html += '<div class="' + cls + '"><span class="ms-d ' + (dif < 0 ? "r" : dif > 0 ? "g" : "z") + '">' + (dif > 0 ? "+" : dif < 0 ? "−" : "") + n0(Math.abs(dif)) + '</span>' +
          '<div class="ms-b' + (p > 0 && a > p ? " over" : "") + (a < p ? " short" : "") + '"><i style="width:' + w.toFixed(1) + '%"></i><span class="a">' + n0(a) + '</span><span class="p">' + n0(p) + '</span></div></div>';
      });
      if (any) rowsHtml.push(html);   // 整班没开线的线不占行（创始人：无 LOSS 的隐藏）
    });
    box.innerHTML = '<div class="ms-grid" style="grid-template-columns:var(--lbl) repeat(' + table.length + ',minmax(0,1fr));grid-template-rows:auto repeat(' + Math.max(1, rowsHtml.length) + ',minmax(0,1fr))">' + head + rowsHtml.join("") + '</div>';
  }

  /* ---------- 问题卡 ---------- */
  function cardHtml(s, S) {
    var rate = s.p > 0 ? Math.round(s.a / s.p * 100) : null, rc = rate == null ? "var(--ink3)" : rate >= 95 ? "var(--green)" : rate >= 85 ? "var(--amber)" : "var(--red)";
    var segs = "";
    if (s.l > 0) {
      var used = 0;
      S.order.forEach(function (k) { if (!s.depts[k]) return; var q = Math.min(s.depts[k].q, s.l - used); if (q <= 0) return; used += q; segs += '<span style="flex:0 0 ' + (q / s.l * 100).toFixed(2) + '%;background:' + S.color[k] + '"></span>'; });
      if (s.l - used > 0) segs += '<span class="gap" style="flex:1 1 auto"></span>';
    }
    var head = '<div class="mc-hd"><span class="mc-nm">' + esc(short(s.name)) + '</span><span class="mc-ls' + (s.l > 0 ? "" : " z") + '"><b>' + n0(s.l) + '</b><span>' + t("loss") + '</span></span>' +
      '<span class="mc-rt">' + t("rate") + ' <b style="color:' + rc + '">' + (rate == null ? "—" : rate + "%") + '</b> · <span class="n">' + n0(s.a) + ' / ' + n0(s.p) + '</span></span></div>' +
      '<div class="mc-bar">' + segs + '</div>';
    var gapRow = s.gap > 0 ? '<div class="mp gap"><span class="q">' + n0(s.gap) + '</span><div class="tx"><span class="sw"></span>' + t("gapTx") + '<em>' + hrs(s.gapH) + '</em></div></div>' : "";
    var body = !s.groups.length && !s.gap ? '<div class="mtg-clear">' + ICON_OK + t("noLoss") + '</div>' : '<div class="mtg-items" data-k="' + esc(s.key) + '"></div>' + gapRow;
    return '<section class="mtg-box mc">' + head + body + '</section>';
  }
  function probRow(g, S) {
    var p = g.p, tx = st.lang === "zh" ? (p.zh || p.text) : (p.text || p.zh), dk = p.d ? p.d.zh : "";
    return { q: g.q, html: '<div class="mp"><span class="q">' + (g.q ? n0(g.q) : "—") + '</span><div class="tx">' + esc(tx || nm(p.t)) + '</div>' +
      '<div class="mt">' + (p.d ? '<span class="d"><i style="background:' + (S.color[dk] || "#9aa6b8") + '"></i>' + esc(nm(p.d)) + '</span>' : "") +
      '<span>' + esc(nm(p.t)) + '</span>' + (g.equip.length ? '<span>' + esc(g.equip.join(" · ")) + '</span>' : "") +
      '<span class="h">' + hrs(g.hours) + '</span></div></div>' };
  }

  function render() {
    if (!$("mtg")) return;
    document.querySelectorAll("#mtg [data-mk]").forEach(function (el) { el.textContent = t(el.getAttribute("data-mk")); });
    document.querySelectorAll("#mtgLang button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === st.lang); });
    document.querySelectorAll("#mtgScope button").forEach(function (b) { b.classList.toggle("on", b.dataset.v === st.scope); });
    var d = st.d, stale = d && Date.now() - d.at > STALE;
    $("mtgFresh").classList.toggle("bad", !!(stale || st.err));
    $("mtgFresh").lastChild.textContent = d ? t("upd") + " " + hhmm(d.at) : t(st.err ? "fail" : "loading");
    $("mtgBanner").textContent = st.err ? t("fail") : t("stale");
    $("mtgBanner").classList.toggle("show", !!(d && (stale || st.err)));
    var hours = d ? arr(d.hours) : [], win = d ? windowHours(d) : [], scopeH = st.scope === "win" && win.length ? win : hours;
    renderStrip(d && st.scope === "win" ? scopeH : null);
    if (!d) return;
    $("mtgSub").innerHTML = "PRO2 FINAL A–D · " + esc(String(d.date).slice(5).replace("-", "/")) + " " + t(d.shift === "NIGHT" ? "night" : "day") + ' · <b class="n">' + winLabel(scopeH) + "</b>";
    var S = summarize(d, scopeH);

    var deptName = function (k) { for (var i = 0; i < S.lines.length; i++) if (S.lines[i].depts[k]) return nm(S.lines[i].depts[k].d); return k; };
    /* 横条右侧：LOSS 责任部门排行（本范围，四条线合计；没填原因的单列一行黄色斜纹） */
    var drows = S.order.map(function (k) { return { nm: deptName(k), q: S.deptTot[k], c: S.color[k] }; });
    if (S.tot.gap > 0) drows.push({ nm: t("unexp"), q: S.tot.gap, gap: true });
    var dmax = Math.max.apply(null, drows.map(function (r) { return r.q; }).concat([1])), dsum = drows.reduce(function (a, r) { return a + r.q; }, 0) || 1;
    $("mtgDeptTot").innerHTML = S.tot.l > 0 ? t("loss") + " <b>" + n0(S.tot.l) + "</b>" : "";
    var dbox = $("mtgDept");
    if (!drows.length) dbox.innerHTML = '<div class="mtg-clear">' + ICON_OK + t("noLoss") + '</div>';
    else fitList(dbox, drows.map(function (r) {
      var bg = r.gap ? "var(--hatch-amber)" : r.c;
      return { q: r.q, html: '<div class="md' + (r.gap ? " gap" : "") + '"><span class="nm"><i style="background:' + bg + '"></i>' + esc(r.nm) + '</span>' +
        '<div class="tr"><span style="width:' + (r.q / dmax * 100).toFixed(1) + '%;background:' + bg + '"></span></div>' +
        '<b>' + n0(r.q) + '</b><em>' + Math.round(r.q / dsum * 100) + '%</em></div>' };
    }), function (h) { return moreTxt(h, true); });

    /* 四条线固定 A B C D 从左到右（和横条行序一致） */
    var cards = $("mtgCards"), shown = S.lines.filter(function (s) { return s.l > 0 || s.gap > 0 || s.groups.length; });
    cards.innerHTML = shown.length ? shown.map(function (s) { return cardHtml(s, S); }).join("") : '<section class="mtg-box mc"><div class="mtg-clear">' + ICON_OK + t("noLoss") + '</div></section>';
    shown.forEach(function (s) {
      var box = cards.querySelector('.mtg-items[data-k="' + s.key + '"]');
      if (box) fitList(box, s.groups.map(function (g) { return probRow(g, S); }), function (h) { return moreTxt(h, true); });
    });

    /* 升级问题：PRO2 未关闭异常单（后台已按 升级级别 → 超时 → 新 排好），一条两行 */
    var lineName = {}; S.lines.forEach(function (s) { lineName[s.key] = short(s.name); });
    var iss = arr(d.issues);
    $("mtgIssCnt").textContent = iss.length || "";
    var box = $("mtgIss");
    if (!iss.length) box.innerHTML = '<div class="mtg-empty">' + ICON_OK + t("noIss") + '</div>';
    else fitList(box, iss.map(function (i) {
      var age = Math.max(0, Date.now() - (i.at || 0)), isNew = age < 15 * 60000;
      var ago = age < 3600000 ? Math.max(1, Math.round(age / 60000)) + t("min") : age < 48 * 3600000 ? Math.round(age / 3600000) + t("hr") : Math.floor(age / 86400000) + t("day0");
      var tag = i.line ? lineName[i.line] : (i.lineName || "PRO2");
      return { html: '<div class="mi' + (isNew ? " new" : "") + '"><span class="lv' + (i.esc ? " on" : "") + '">' + (i.esc ? "L" + i.esc : "—") + '</span>' +
        '<span class="tx">' + esc(i.title || i.note || nm(i.t)) + '</span><span class="ag' + (i.over ? " o" : "") + '">' + ago + '</span>' +
        '<span class="mt"><b>' + esc(tag) + '</b><span class="s-' + esc(i.status) + '">' + t(i.status) + '</span>' + (i.over ? '<span class="o">' + t("over") + '</span>' : "") + '<span>' + esc(nm(i.d)) + '</span></span></div>' };
    }), function (h) { return moreTxt(h, false); });
    document.documentElement.lang = st.lang === "th" ? "th" : document.documentElement.lang;
  }

  /* ---------- 看板「未达成原因」模块：改读 DM 数据（看板中文 = 中文；EN = 泰文原文） ---------- */
  window.mtgPanel = function () {
    var d = st.d, body = document.getElementById("prob-body"), src = document.getElementById("prob-src");
    if (!d || !body) return false;
    var zh = (typeof lang === "undefined") || lang === "zh", lg = zh ? "zh" : "th";
    var hours = arr(d.hours), win = windowHours(d), scopeH = win.length ? win : hours, S = summarize(d, scopeH);
    if (src) src.textContent = "SRC: DM · " + hhmm(d.at);
    var shTxt = d.shift === "NIGHT" ? (zh ? "夜班" : "Night") : (zh ? "白班" : "Day");
    var summary = "<div class='prob-summary'>📋 <b>" + shTxt + " · " + winLabel(scopeH) + "</b> · LOSS <b style='color:var(--red)'>" + n0(S.tot.l) + "</b>" +
      (S.tot.gap > 0 ? " · " + (zh ? "未说明" : "Unexplained") + " <b style='color:var(--orange)'>" + n0(S.tot.gap) + "</b>" : "") +
      " · " + (zh ? "升级问题" : "Escalated") + " <b>" + arr(d.issues).length + "</b></div>";
    var groups = [];
    S.lines.forEach(function (s) { s.groups.forEach(function (g) { groups.push({ s: s, g: g }); }); });
    groups.sort(function (a, b) { return b.g.q - a.g.q; });
    var items = groups.slice(0, 4).map(function (x) {
      var p = x.g.p, tx = zh ? (p.zh || p.text) : (p.text || p.zh);
      return { line: short(x.s.name), html: "<span class='prob-txt'>" + esc(tx || nm(p.t, lg)) + "</span>" + (x.g.q ? " <b class='prob-imp' style='color:var(--red)'>-" + n0(x.g.q) + (zh ? "台" : "") + "</b>" : "") };
    });
    if (!items.length) S.lines.filter(function (s) { return s.gap > 0; }).sort(function (a, b) { return b.gap - a.gap; }).slice(0, 4).forEach(function (s) {
      items.push({ line: short(s.name), html: "<span class='prob-txt' style='color:var(--orange)'>" + (zh ? "有 LOSS 未填原因" : "LOSS without reason") + "</span> <b class='prob-imp' style='color:var(--orange)'>" + n0(s.gap) + (zh ? "台" : "") + "</b>" });
    });
    var rows = items.map(function (it, i) {
      return "<tr><td class='prob-line'>" + esc(it.line) + "</td><td class='prob-cell'><div class='prob-top'><span class='prob-rank " + (["r1", "r2", "r3"][i] || "") + "'>" + (i + 1) + ".</span>" + it.html + "</div></td></tr>";
    }).join("");
    body.innerHTML = summary + (rows ? "<table class='mod-table'><thead><tr><th style='width:100px'>" + (zh ? "线体" : "Line") + "</th><th>" + (zh ? "主要问题点" : "Key issues") + "</th></tr></thead><tbody>" + rows + "</tbody></table>"
      : "<div style='color:var(--gray);padding:6px 2px'>" + (zh ? "本次检讨时段没有 LOSS" : "No LOSS in this review window") + "</div>");
    try { if (typeof fitProbFont === "function") fitProbFont(body); } catch (e) {}
    return true;
  };

  /* ---------- 打开 / 关闭（地址带 #meeting：电视刷新后仍停在本页） ---------- */
  function openMeeting() { if (location.hash !== "#meeting") location.hash = "meeting"; else sync(); }
  function closeMeeting() { if (location.hash === "#meeting") history.replaceState(null, "", location.pathname + location.search); sync(); }
  function sync() {
    build();
    var on = location.hash === "#meeting", el = $("mtg");
    if (el.hidden === !on) { if (on) render(); return; }
    el.hidden = !on;
    document.body.classList.toggle("mtg-on", on);
    if (on) { render(); requestAnimationFrame(render); }
  }
  window.openMeeting = openMeeting;
  /* 看板每次刷新数据（renderAll）都会调这里：横条跟着看板实时变 */
  window.mtgDrawChart = function () { if (!isOpen()) return; var d = st.d, win = d ? windowHours(d) : []; renderStrip(d && st.scope === "win" && win.length ? win : null); };
  addEventListener("hashchange", sync);

  function load() {
    fetch(SRC + (SRC.indexOf("?") >= 0 ? "&" : "?") + "_=" + Date.now(), { cache: "no-store" })
      .then(function (r) { if (!r.ok) throw new Error("http " + r.status); return r.json(); })
      .then(function (j) { if (j && j.lines) { st.d = j; st.err = false; } else st.err = true; })
      .catch(function () { st.err = true; })
      .then(function () { try { if (typeof renderProblems === "function") renderProblems(); } catch (e) {} if (isOpen()) render(); });
  }
  function clock() { var c = $("mtgClock"); if (c) { var d = bkk(Date.now()); c.textContent = hhmm(Date.now()) + ":" + ("0" + d.getUTCSeconds()).slice(-2); } }
  build(); sync(); load(); clock();
  setInterval(load, POLL);
  setInterval(clock, 1000);
  setInterval(function () { if (isOpen()) render(); }, 60000);   // 本次检讨时段、超时、几分钟前随时间走
})();
