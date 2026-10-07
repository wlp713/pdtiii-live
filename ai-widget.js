/* ═════════════════════════════════════════════════════════════
 * ai-widget.js — PDT III 看板 AI 智能问答助手 (悬浮窗)
 * 2026-09-04
 *
 * 功能:
 *   1) 右侧悬浮 🎨 按钮 → 点击弹出对话窗
 *   2) 支持文字输入 + 麦克风语音转文字(浏览器 Web Speech API)
 *   3) 发问时自动采集当前系统产出数据(__LIVE_DATA__ + __HISTORY__)拼入上下文
 *   4) 调代理接口(/api/ai 或配置的代理URL) → 转发美的 Dify API
 *
 * 安全: API Key 不进本文件, 由 AIPROXY_URL 代理持有 (见 _config 区)
 * ═════════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* ── 配置区 ── */
  var CFG = {
    // 代理接口地址。静态页默认同站 /api/ai (若部署在支持服务的环境)
    // 若走独立代理服务, 改成其地址即可, 例如:
    //   proxyUrl: "https://your-proxy.example.com/ai"
    proxyUrl: (function () {
      try {
        return window.AICONFIG && window.AICONFIG.proxyUrl
          ? window.AICONFIG.proxyUrl
          : (location.protocol === "https:" ? "https://" : "http://") + location.host + "/api/ai";
      } catch (e) { return "/api/ai"; }
    })(),
    theme: { bg: "#1e293b", accent: "#2b5cbf", userBubble: "#2b5cbf", aiBubble: "#f1f5f9" },
  };

  /* ── 车间分组 (与 index.html 的 WS_GROUPS 一致) ── */
  var WS_GROUPS = [
    { ws: "PRO1",  label: "PRO1",           lines: ["Motor AC","Motor CL","Motor WL","Motor F-Series","Motor H-Series","Motor S-Series"] },
    { ws: "PRO2R", label: "PRO2·Rotor/Fin", lines: ["Final A line","Final B Line","Final C line","Final D line","Rotor A line","Rotor B Line","Rotor C line","Rotor D Line"] },
    { ws: "PRO2S", label: "PRO2·Shipping",  lines: ["Inspection A","Inspection B","Inspection C","Inspection D"] },
    { ws: "PRO3",  label: "PRO3",           lines: ["Welding A line","Welding B line","Welding C line","Welding D line"] },
    { ws: "PRO4H", label: "PRO4·Hon/Pist",  lines: ["Frame No.1","Frame No.2","Frame No.3","Frame No.4","Frame No.5","Piston Grinding","Rod Pispin","Press C-Shaft"] },
    { ws: "PRO4B", label: "PRO4·Body/Pin",  lines: ["C-Shaft Body A","C-Shaft Body B","C-Shaft Body C","C-Shaft Pin A","C-Shft Pin B","C-Shaft Pin C"] },
    { ws: "PRO5",  label: "PRO5",           lines: ["Frame Honing FL","Piston honing FL","Cylinder Honing"] },
    { ws: "AUX",   label: "辅助/其他",   lines: ["Water Line","True B"] }
  ];
  function wsLabelOf(lineName) {
    var n = String(lineName||"").toLowerCase().replace(/\s+/g,"");
    for (var i=0;i<WS_GROUPS.length;i++){
      for (var j=0;j<WS_GROUPS[i].lines.length;j++){
        if (String(WS_GROUPS[i].lines[j]).toLowerCase().replace(/\s+/g,"")===n) return WS_GROUPS[i].label;
      }
    }
    return "其他";
  }
  function getStateRef() {
    try { if (typeof state !== "undefined") return state; } catch(e){}
    try { if (typeof window !== "undefined" && window.state) return window.state; } catch(e){}
    return null;
  }

  function normalizeArchiveToken(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, "");
  }

  function archiveDatesFromQuery(query, availableDates) {
    var q = String(query || "");
    var dates = Array.isArray(availableDates) ? availableDates : [];
    var found = {};
    function add(date) {
      date = String(date || "");
      if (dates.indexOf(date) >= 0) found[date] = true;
    }
    dates.forEach(function (date) {
      if (q.indexOf(date) >= 0 || q.indexOf(date.replace(/-/g, "/")) >= 0) add(date);
    });
    q.replace(/(20\d{2})\s*(?:年|[-/.])\s*(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})\s*日?/g, function (_, year, month, day) {
      add(year + "-" + ("0" + Number(month)).slice(-2) + "-" + ("0" + Number(day)).slice(-2));
      return _;
    });
    q.replace(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?/g, function (_, month, day) {
      var suffix = "-" + ("0" + Number(month)).slice(-2) + "-" + ("0" + Number(day)).slice(-2);
      dates.forEach(function (date) { if (String(date).slice(-6) === suffix) add(date); });
      return _;
    });
    q.replace(/(?:^|[^\d])(\d{1,2})\s*[-/]\s*(\d{1,2})(?!\d)/g, function (_, month, day) {
      var suffix = "-" + ("0" + Number(month)).slice(-2) + "-" + ("0" + Number(day)).slice(-2);
      dates.forEach(function (date) { if (String(date).slice(-6) === suffix) add(date); });
      return _;
    });
    var relativeQuery = q.toLowerCase();
    var relativeDays = /前天|前日|the\s*day\s*before\s*yesterday/.test(relativeQuery) ? 2 : (/昨天|昨日|yesterday/.test(relativeQuery) ? 1 : (/今天|今日|today/.test(relativeQuery) ? 0 : null));
    if (relativeDays !== null) {
      var relative = new Date();
      relative.setDate(relative.getDate() - relativeDays);
      add(relative.getFullYear() + "-" + ("0" + (relative.getMonth() + 1)).slice(-2) + "-" + ("0" + relative.getDate()).slice(-2));
    }
    return dates.filter(function (date) { return !!found[date]; });
  }

  /* ── 产出分析页人数(出勤/加班)按问句日期实时补查 (方案A) ── */
  var HC_API = "https://dm111-e8a7d-default-rtdb.firebaseio.com/analysis/hc";
  var HC_WS_ALIAS = { "ws1": "Pro.1", "ws2": "Pro.2", "ws3": "Pro.3", "ws4": "Pro.4", "ws5": "Pro.5", "ws6": "Pro.6" };
  /* 从问句解析出目标日期(YYYY-MM-DD)，支持今天/昨天/前天；解析不出返回 null */
  function parseHCDate(query) {
    var q = String(query || "");
    var found = [];
    q.replace(/(20\d{2})\s*(?:年|[-/.])\s*(\d{1,2})\s*(?:月|[-/.])\s*(\d{1,2})\s*日?/g, function (_, y, m, d) { found.push(y + "-" + ("0" + Number(m)).slice(-2) + "-" + ("0" + Number(d)).slice(-2)); return _; });
    q.replace(/(\d{1,2})\s*月\s*(\d{1,2})\s*(?:日|号)?/g, function (_, m, d) { found.push((new Date().getFullYear()) + "-" + ("0" + Number(m)).slice(-2) + "-" + ("0" + Number(d)).slice(-2)); return _; });
    q.replace(/(?:^|[^\d])(\d{1,2})\s*[-/]\s*(\d{1,2})(?:日|号)?(?!\d)/g, function (_, m, d) { found.push((new Date().getFullYear()) + "-" + ("0" + Number(m)).slice(-2) + "-" + ("0" + Number(d)).slice(-2)); return _; });
    var rel = /前天|前日|the\s*day\s*before\s*yesterday/i.test(q) ? 2 : (/昨天|昨日|yesterday/i.test(q) ? 1 : (/今天|今日|today/i.test(q) ? 0 : null));
    if (rel !== null) { var dt = new Date(); dt.setDate(dt.getDate() - rel); found.push(dt.getFullYear() + "-" + ("0" + (dt.getMonth() + 1)).slice(-2) + "-" + ("0" + dt.getDate()).slice(-2)); }
    if (!found.length) return null;
    /* 取第一个(通常唯一) */
    return found[found.length - 1];
  }
  /* fetch 指定日期产出分析页人数，返回按车间格式化文本(无数据返回 "") */
  function fetchHCAttendance(date) {
    date = String(date || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Promise.resolve("");
    return fetch(HC_API + "/" + date + ".json", { signal: typeof AbortSignal !== "undefined" ? AbortSignal.timeout(6000) : undefined })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || typeof j !== "object") { return "[E2. 每日人数快照 (日期 " + date + ")] 该日尚无出勤/加班人数数据"; }
        var lines = [];
        var any = false;
        Object.keys(HC_WS_ALIAS).forEach(function (ws) {
          var h = j[ws];
          if (!h || typeof h !== "object") { return; }
          any = true;
          var d = (h.d === undefined || h.d === null || h.d === "") ? null : Number(h.d);
          var dO = (h.dO === undefined || h.dO === null || h.dO === "") ? null : Number(h.dO);
          var n = (h.n === undefined || h.n === null || h.n === "") ? null : Number(h.n);
          var nO = (h.nO === undefined || h.nO === null || h.nO === "") ? null : Number(h.nO);
          var normal = ((d === null ? 0 : d) + (n === null ? 0 : n)) || 0;
          var ot = ((dO === null ? 0 : dO) + (nO === null ? 0 : nO)) || 0;
          var rate = normal > 0 ? (ot / normal * 100) : null;
          lines.push("  " + HC_WS_ALIAS[ws] + " 出勤(正常)" + (normal || "未填") + "人 加班" + (ot || 0) + "人 加班占比" + (rate === null ? "-" : rate.toFixed(1) + "%") +
            (d !== null ? " (白班" + d + "/" + (dO === null ? 0 : dO) + ")" : "") + (n !== null ? " (夜班" + n + "/" + (nO === null ? 0 : nO) + ")" : ""));
        });
        if (!any) return "[E2. 每日人数快照 (日期 " + date + ")] 该日尚无出勤/加班人数数据";
        return "[E2. 每日人数快照 (日期 " + date + "，按问句实时查库)]\n以下是该日期各车间的【出勤/加班人数】，与历史归档的产出数量是两回事——回答‘出勤人数/加班人数/加班占比’时绝对使用本 E2 段的数值，不要用历史归档里的产出件数：\n" + lines.join("\n");
      })
      .catch(function () { return ""; });
  }

  function archiveShiftFromQuery(query) {
    var q = String(query || "").toLowerCase();
    var hasNight = /夜班|晚班|night(?:\s*shift)?/.test(q);
    var hasDay = /白班|早班|\bday(?:\s*shift)?\b/.test(q);
    if (/全天|全日|完整工作日|整天|full\s*day|all\s*day/.test(q) || (hasDay && hasNight)) return "full";
    if (hasNight) return "night";
    if (hasDay) return "day";
    return "";
  }

  function archiveValue(value, percent) {
    if (value === null || value === undefined || value === "") return "缺失";
    if (percent && isFinite(Number(value))) return Number(value).toFixed(1) + "%";
    return String(value);
  }

  // 按用户问题从已加载的静态归档中检索。这里不读取 Firebase，也不要求切换页面筛选。
  function collectArchiveQueryContext(archive, query) {
    if (!archive || !Array.isArray(archive.rows) || !archive.rows.length) return "";
    var rows = archive.rows;
    var totals = Array.isArray(archive.totals) ? archive.totals : [];
    var dates = archiveDatesFromQuery(query, archive.availableDates || []);
    var shift = archiveShiftFromQuery(query);
    var queryToken = normalizeArchiveToken(query);
    var lineTokens = [];
    var workshopTokens = [];

    rows.forEach(function (row) {
      var lineToken = normalizeArchiveToken(row.line);
      var workshopToken = normalizeArchiveToken(row.workshop);
      if (lineToken && lineToken.length >= 4 && queryToken.indexOf(lineToken) >= 0 && lineTokens.indexOf(lineToken) < 0) lineTokens.push(lineToken);
      if (workshopToken && workshopToken.length >= 4 && queryToken.indexOf(workshopToken) >= 0 && workshopTokens.indexOf(workshopToken) < 0) workshopTokens.push(workshopToken);
    });

    var hasEntityFilter = lineTokens.length || workshopTokens.length;
    var out = [
      "\n[G. 独立历史归档检索（不受页面当前日期/班次/车间/线体筛选影响）]",
      "归档范围: " + ((archive.availableDates || []).length ? archive.availableDates[0] + " → " + archive.availableDates[archive.availableDates.length - 1] : "无") ,
      "可用日期: " + ((archive.availableDates || []).join(", ") || "无")
    ];
    if (dates.length) out.push("本次日期条件: " + dates.join(", "));
    if (shift) out.push("本次班次条件: " + (shift === "day" ? "白班" : (shift === "night" ? "夜班" : "全天（白班+夜班）")));
    if (hasEntityFilter) out.push("本次对象条件: " + (lineTokens.length ? "线体匹配" : "车间匹配"));

    function matches(row) {
      if (dates.length && dates.indexOf(String(row.date)) < 0) return false;
      if (shift && shift !== "full" && row.shift !== shift) return false;
      if (lineTokens.length && lineTokens.indexOf(normalizeArchiveToken(row.line)) < 0) return false;
      if (!lineTokens.length && workshopTokens.length && workshopTokens.indexOf(normalizeArchiveToken(row.workshop)) < 0) return false;
      return true;
    }
    function rowText(row, includeLine) {
      return "  " + row.date + " | " + (row.shift === "day" ? "白班" : "夜班") + " | " + row.workshop + " | " +
        (includeLine ? row.line + " | " : "车间汇总 | ") +
        "正常=" + archiveValue(row.normal) + " | 加班=" + archiveValue(row.overtime) + " | 总产出=" + archiveValue(row.total) +
        " | 计划=" + archiveValue(row.plan) + " | 达成率=" + archiveValue(row.attainment, true) +
        (row.quality ? " | 完整性=" + row.quality : "");
    }

    // 没有指定线体/车间时使用车间汇总，避免把全部线体明细无谓地塞进每一次 AI 请求。
    var selected = hasEntityFilter || dates.length ? rows.filter(matches) : totals.filter(matches);
    if (selected.length > 800) selected = selected.slice(0, 800);
    if (selected.length) {
      out.push("字段: 日期 | 班次 | 车间 | 线体/汇总 | 正常产出 | 加班产出 | 总产出 | 计划 | 达成率 | 完整性");
      selected.forEach(function (row) { out.push(rowText(row, hasEntityFilter || dates.length)); });
      if ((hasEntityFilter || dates.length ? rows : totals).filter(matches).length > selected.length) out.push("  …结果过多，仅展示前800条；如需精确结果请补充日期或线体。");
    } else {
      out.push("查询条件在当前归档索引中没有匹配记录。请依据上面的可用日期核对日期格式；没有匹配时不要把缺失解释为0。");
    }
    out.push("口径: " + (archive.note || "静态成品线归档；不新增 Firebase 请求。"));
    return out.join("\n");
  }

  /* ── 数据采集: 从网页已加载的数据(零新增请求)组全量上下文 ── */
  function collectContext(query, hcExtra) {
    var out = [];
    var now = new Date();
    out.push("当前本地时间: " + now.toLocaleString("zh-CN", { hour12: false }));

    var st = getStateRef();
    if (!st || (!st.lines || !st.lines.length)) {
      out.push("\n(⚠️ 网页数据尚未加载完成, 请稍候再问)");
    }

    /* A. 当天全部线体完整产出汇总 */
    if (st && st.lines && st.lines.length) {
      var lines = st.lines.slice();
      lines.sort(function(a,b){ return (b.cb!==undefined?b.cb:0)-(a.cb!==undefined?a.cb:0); });
      out.push("\n[A. 当天"+st.lines.length+"条线体产出汇总 更新时间 "+(st.updatedAt||"-")+"]");
      lines.forEach(function(l){
        var nm=l.name, ws=wsLabelOf(nm);
        var eff=(l.eff!==undefined?l.eff:0); if (typeof eff==="number") eff=eff.toFixed(1);
        var cb=(l.cb!==undefined?l.cb:(l.plan!==undefined?(l.actual||0)-l.plan:0));
        out.push("  "+(ws?"["+ws+"]":"[无车间]")+" "+nm+" 目标"+(l.target||"-")+" 计划"+(l.plan||"-")+" 实际"+(l.actual||"-")+" 达成率"+eff+"% 欠产"+(cb>0?"+":"")+cb+(l.status?" "+l.status:""));
      });
    }

    /* B. 关键线逐小时走势 (达成率最低的5条) */
    if (st && st.hourly) {
      var fk=[];
      if (st.lines && st.lines.length) {
        fk=st.lines.slice().sort(function(a,b){return (a.eff||0)-(b.eff||0);}).slice(0,5).map(function(l){return l.name;});
      }
      if (fk.length) {
        out.push("\n[B. 关键线逐小时走势(达成率最低的"+fk.length+"条)]");
        fk.forEach(function(nm){
          var arr=st.hourly[nm];
          if (!arr||!arr.length) return;
          var pts=arr.map(function(p){return ((p.h!==undefined?p.h:"")+":"+(p.actual!==undefined?p.actual:"-")+"/"+(p.plan!==undefined?p.plan:"-"));});
          if (pts.length>14){ pts=pts.slice(0,7).concat(["…"]).concat(pts.slice(-6)); }
          out.push("  "+nm+" → "+pts.join(" "));
        });
      }
    }

    /* C. 历史趋势 */
    var H=(typeof window.__HISTORY__!=="undefined")?window.__HISTORY__:null;
    if (H&&H.length) {
      out.push("\n[C. 历史达成率(最近"+Math.min(H.length,14)+"天)]");
      H.slice(-14).forEach(function(d){
        var ls=d.lines||{}; var names=Object.keys(ls);
        var parts=names.map(function(k){return k+":"+(typeof ls[k]==="number"?ls[k].toFixed(1):ls[k])+"%";});
        if (parts.length>16){ parts=parts.slice(0,16).concat(["…("+(parts.length-16)+"条线)"]); }
        out.push("  "+d.date+" — "+parts.join(" , "));
      });
    }

    /* D. 其它: 问题点 */
    var D=(typeof window.__LIVE_DATA__!=="undefined")?window.__LIVE_DATA__:null;
    if (D&&D.problems&&D.problems.length) {
      out.push("\n[D. 今日问题点 "+D.problems.length+" 条]");
      D.problems.slice(0,8).forEach(function(p){
        out.push("  ["+(p.ws||"")+" "+(p.series||"")+" "+(p.time||"")+"] 计划"+(p.plan||"-")+"/实际"+(p.actual||"-")+"/缺口"+(p.impact||"-")+" — "+(p.problem_zh||p.problem_th||""));
      });
    }

    /* H. 每日制程问题点日志(导入) 字段: 日期 班次 责任部门 影响数 泰语原文 + 闭环(责任人/状态/承诺闭环日/实际闭环日/措施) */
    var DP = (typeof window.__DAILY_PROBLEMS__ !== "undefined") ? window.__DAILY_PROBLEMS__ : null;
    if (DP && DP.byDate) {
      var dpDates = Object.keys(DP.byDate).sort();
      var dpRows = [];
      dpDates.forEach(function (dd) { dpRows = dpRows.concat(DP.byDate[dd] || []); });
      /* 过滤: 日期条件(有则按日期) / 班次 / 部门 token */
      var dpQ = normalizeArchiveToken(query);
      var dpSelDates = archiveDatesFromQuery(query, dpDates);
      var dpShift = archiveShiftFromQuery(query);
      var dpDeptTok = null;
      var qRaw = String(query || "").toLowerCase();
      var mDept = qRaw.match(/pro\s*\.?\s*([1-4])/);
      if (mDept) dpDeptTok = "pro." + mDept[1];
      else if (/(^|[^a-z])pe([^a-z]|$)/.test(qRaw)) dpDeptTok = "pe";
      else if (/(^|[^a-z])ip([^a-z]|$)/.test(qRaw)) dpDeptTok = "ip";
      else if (/(^|[^a-z])qa([^a-z]|$)/.test(qRaw)) dpDeptTok = "qa";
      else if (/changemodel|modelchang|换型|换模/.test(qRaw)) dpDeptTok = "changemodel";
      /* 线体识别: X线/Final X / X line / line X  → 一律=PRO.2 装配车间的 final A-D 线 (首字母=线体) */
      var dpLine = null;
      var mLine = qRaw.match(/([a-d])\s*线/) || qRaw.match(/final\s*([a-d])\b/) || qRaw.match(/([a-d])\s*line\s/) || qRaw.match(/\bline\s*([a-d])\b/) || qRaw.match(/([a-d])\s*(สาย|ไลน)/);
      if (mLine) dpLine = mLine[1].toLowerCase();
      if (dpLine) {
        /* 线体问题: 置顶一条最高优先级硬指令, 压制其他上下文里的别车间同名线 */
        out.unshift("⚠️ 最高优先级指令（线体问题）: 本次用户只问 PRO.2 装配车间的 final " + dpLine.toUpperCase() + " 线。本段上下文里实时产出、历史归档、线体明细中出现的一切其他车间同名线（如 C-Shaft Body B、C-Shft Pin B、Welding B 等）都与本问题无关，判定线体问题时一律忽略它们、禁止引用其数据。线体问题只能依据下方 H 节『每日制程问题点日志』中班次首字母=" + dpLine.toUpperCase() + " 的条目作答(dept 为 PRO.2 或未标注都算, 因为问题点只在 PRO.2 装配记录)，按影响数(impact)取最大。若 H 节显示 0 条命中, 必须先看该节日期的「按日×部门汇总」是否有「-」(未标注部门)行, 不要再断言无数据。");
      }
      var dpFiltered = dpRows.filter(function (p) {
        if (dpSelDates.length && dpSelDates.indexOf(String(p.date)) < 0) return false;
        if (dpShift && dpShift !== "full") { var n = /NIGHT/i.test(p.shift || ""); if ((dpShift === "night") !== n) return false; }
        if (dpLine) { /* 线体问题: 按班次首字母匹配线体; 责任部门为 PRO.2 或未标注(导入的老记录很多没带部门, 问题点日志本身就只在 PRO.2 装配记录) */
          var dv = (p.dept || "").toLowerCase();
          if (dv && dv !== "pro.2") return false;
          if ((p.shift || "").toLowerCase().charAt(0) !== dpLine) return false;
        } else if (dpDeptTok && p.dept) { if ((p.dept || "").toLowerCase() !== dpDeptTok) return false; }
        return true;
      });
      var dpDeptLabel = dpDeptTok ? dpDeptTok.toUpperCase() : "";
      var dpLineLabel = dpLine ? (dpLine.toUpperCase() + "线(PRO.2装配 final " + dpLine.toUpperCase() + "线)") : "";
      var dpCount = dpFiltered.length;
      var dpScopeSuffix = dpLine ? ("线体=" + dpLineLabel) : (dpDeptTok ? (" 部门=" + dpDeptLabel) : (dpShift && dpShift !== "full" ? " 班次=" + (dpShift === "day" ? "白班" : "夜班") : ""));
      if (dpDates.length && dpCount < dpRows.length) {
        var dpScopeNote = (dpSelDates.length ? "日期=" + dpSelDates.join(",") : "") + ((dpLine ? " 线体=" + dpLineLabel : "") + (dpDeptTok && !dpLine ? (" " + "部门=" + dpDeptLabel) : ""));
        out.push("\n[H. 每日制程问题点日志 共" + dpDates.length + "天/" + dpRows.length + "条, 本问句命中 " + dpCount + " 条 (" + (dpScopeNote || "全部") + ")]");
      } else {
        out.push("\n[H. 每日制程问题点日志 共" + dpDates.length + "天/" + dpCount + "条" + dpScopeSuffix + "]");
      }
      out.push("字段: 日期 | 班次(shift)·责任部门(dept) | 影响数(impact,产出缺口) | 泰语原文描述 | 闭环: 责任人(owner)·状态(status:空=未闭环/DOING进行中/CLOSED已闭环)·承诺闭环日(due)·实际闭环日(closedAt)·措施(action)");
      out.push("注: dept 为「-」表示该条未标注责任部门(不表示无部门); 线体问题按班次首字母(A/B/C/D = final A-D 线)匹配, 与 dept 是否标注无关。");
      /* 按日+部门汇总(影响合计), 便于快速归因 */
      var dpSum = {};
      dpFiltered.forEach(function (p) {
        var k = p.date + "|" + (p.dept || "-");
        if (!dpSum[k]) dpSum[k] = { date: p.date, dept: p.dept || "-", n: 0, imp: 0 };
        dpSum[k].n += 1; dpSum[k].imp += (Number(p.impact) || 0);
      });
      var dpSumKeys = Object.keys(dpSum).sort();
      if (dpSumKeys.length) {
        out.push("按日×部门汇总(条数/影响合计):");
        var dpCapSum = dpSumKeys.length > 40 ? dpSumKeys.slice(0, 40) : dpSumKeys;
        dpCapSum.forEach(function (k) { var s = dpSum[k]; out.push("  " + s.date + " " + s.dept + " → " + s.n + "条/" + s.imp); });
        if (dpSumKeys.length > 40) out.push("  …(" + (dpSumKeys.length - 40) + "个组合省略, 明细见下全量)");
      }
      /* ★ 2026-10-07 闭环概览: 闭环率/超期/平均闭环天数 + 待闭环 Top (闭环字段在「问题点录入 → 闭环管理」里维护) */
      var dpToday = (function () { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); })();
      var dpIsClosed = function (p) { return (p.status || "") === "CLOSED"; };
      var dpIsOver = function (p) { return !dpIsClosed(p) && !!p.due && p.due < dpToday; };
      var dpTag = function (p) {
        if (!(p.owner || p.status || p.due || p.closedAt || p.action)) return "";
        return " 〔责任人:" + (p.owner || "未指派") + " 状态:" + (dpIsClosed(p) ? "已闭环" : (p.status === "DOING" ? "进行中" : "未闭环")) +
          (p.due ? " 承诺:" + p.due + (dpIsOver(p) ? "(已超期)" : "") : "") + (p.closedAt ? " 实际闭环:" + p.closedAt : "") + (p.action ? " 措施:" + p.action : "") + "〕";
      };
      var dpCl = { n: dpFiltered.length, closed: 0, over: 0, noOwner: 0, durSum: 0, durN: 0 };
      dpFiltered.forEach(function (p) {
        if (dpIsClosed(p)) {
          dpCl.closed++;
          if (p.closedAt && p.date) {
            var t1 = Date.parse(p.date + "T00:00:00"), t2 = Date.parse(p.closedAt + "T00:00:00");
            if (!isNaN(t1) && !isNaN(t2) && t2 >= t1) { dpCl.durSum += Math.round((t2 - t1) / 86400000); dpCl.durN++; }
          }
        } else { if (dpIsOver(p)) dpCl.over++; if (!p.owner) dpCl.noOwner++; }
      });
      var dpRate = dpCl.n ? Math.round(dpCl.closed * 1000 / dpCl.n) / 10 : 0;
      out.push("闭环概览(截至 " + dpToday + "): 条目 " + dpCl.n + " | 已闭环 " + dpCl.closed + " | 闭环率 " + dpRate + "% | 超期未闭环 " + dpCl.over + " | 未指派责任人 " + dpCl.noOwner + " | 平均闭环 " + (dpCl.durN ? (Math.round(dpCl.durSum / dpCl.durN * 10) / 10) + "天" : "无数据"));
      out.push("闭环口径: 闭环率=已闭环/本段条目数; 超期=未闭环且已过承诺闭环日; 平均闭环=实际闭环日−发生日; 未填闭环字段一律算「未闭环」(历史条目未填属正常, 不代表已闭环)。");
      var dpOpen = dpFiltered.filter(function (p) { return !dpIsClosed(p); }).sort(function (a, b) {
        var ao = dpIsOver(a) ? 0 : 1, bo = dpIsOver(b) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return (Number(b.impact) || 0) - (Number(a.impact) || 0);
      }).slice(0, 12);
      if (dpOpen.length) {
        out.push("待闭环 Top" + dpOpen.length + "(超期优先, 再按影响数降序):");
        dpOpen.forEach(function (p) {
          out.push("  [" + p.date + " " + (normalizeArchiveToken(p.shift || "").replace("-", " ").toUpperCase() || (p.shiftLabel || "")) + "] " + (p.dept || "-") + " 影响" + (p.impact === null ? "-" : p.impact) +
            " 责任人" + (p.owner || "未指派") + (p.due ? " 承诺" + p.due + (dpIsOver(p) ? "(已超期)" : "") : " 无承诺日") + " — " + (p.problem_th || "") + (p.action ? " | 措施:" + p.action : ""));
        });
      }
      /* 全量明细(带上过滤后上限) */
      var dpShown = dpFiltered.length > 500 ? dpFiltered.slice(dpFiltered.length - 500) : dpFiltered;
      if (dpShown.length) {
        out.push("明细" + (dpShown.length < dpFiltered.length ? "(最近500条, 共" + dpFiltered.length + ")" : ":"));
        dpShown.forEach(function (p) {
          out.push("  [" + p.date + " " + (normalizeArchiveToken(p.shift || "").replace("-", " ").toUpperCase() || (p.shiftLabel || "")) + "] " + (p.dept || "-") + " 影响" + (p.impact === null ? "-" : p.impact) + " — " + (p.problem_th || "") + dpTag(p));
        });
      } else {
        out.push("本次条件无命中条目。");
      }
      out.push("口径: 导入的每日制程问题点。泰语为原始描述; 责任部门=dept(PE/IP/QA/PRO.1-4/CHANGEMODEL换型); 影响数=该问题造成的产出缺口; 闭环字段由「问题点录入→闭环管理」填写, 也可由带表头的 Excel 直接导入(缺失=未闭环)。问「闭环率/超期/谁负责/多久闭环」时看上方『闭环概览』与『待闭环 Top』。线体解释: 用户问'A/B/C/D线'时一律指PRO.2装配车间的final A-D四条线(条目的班次首字母=线体), 问题点目前只在PRO.2装配记录, 其他车间没有数据。回答语言跟随提问语言——泰语提问用泰语原文总结, 中文提问把泰语翻译成中文再分析。");
    }

    /* E. 产出分析页数据: 出勤人数/加班效率/车间明细 (由 analysis-page 导出) */
    var A = (typeof window.__ANA_DATA__ !== "undefined") ? window.__ANA_DATA__ : null;
    if (A) {
      out.push("\n[E. 产出分析页数据 (日期 " + (A.date||"-") + " · " + (A.shift||"-") + ")]");
      if (A.wsRows && A.wsRows.length) {
        A.wsRows.forEach(function(r){
          out.push("  车间"+r.ws+" 线数"+r.lines+" 正常人数"+(r.normalPeople===null?"未填":r.normalPeople)+" 加班人数"+(r.otPeople===null?"未填":r.otPeople)+
            " 正常效率"+(r.normalEff===null?"-":r.normalEff+"件/人·时")+" 加班效率"+(r.otEff===null?"-":r.otEff+"件/人·时")+
            (r.otRate!==null?" 加班相对正常"+r.otRate+"%":""));
        });
      }
      if (A.totNormalPeople!==null || A.totOtPeople!==null) {
        out.push("  合计: 正常出勤"+(A.totNormalPeople===null?"未填":A.totNormalPeople+"人")+" 加班出勤"+(A.totOtPeople===null?"未填":A.totOtPeople+"人")+
          " 正常产出"+(A.normalOutput??"-")+" 加班产出"+(A.otOutput??"-")+
          (A.otVsNormalRate!==null?" 加班效率/正常效率="+A.otVsNormalRate+"%":""));
      }
    }

    /* E2. 按问句日期实时查产出分析页人数(方案A: 不依赖页面当前选中日期) */
    if (hcExtra) out.push("\n" + hcExtra);

    /* F. 当前历史分析视图: 让 AI 知道用户正在看什么, 不新增请求 */
    var V = (typeof window.__PDTIII_HISTORY_VIEW__ !== "undefined") ? window.__PDTIII_HISTORY_VIEW__ : null;
    if (V) {
      out.push("\n[F. 当前历史分析视图]");
      out.push("  范围=" + V.scope + " · 班次=" + V.shift + " · 日期=" + (V.selectedDate || V.dateRange) + " · 模式=" + V.qualityMode);
      if (V.latest) out.push("  最新/指定日: 正常" + V.latest.normal + " 加班" + V.latest.overtime + " 总产出" + V.latest.total + " 计划" + V.latest.plan + " 达成率" + (V.latest.attainment == null ? "-" : V.latest.attainment) + "%");
      if (V.trend && V.trend.length) out.push("  趋势: " + V.trend.map(function (x) { return x.date + "总" + x.total + "/达成" + (x.attainment == null ? "-" : x.attainment) + "%"; }).join(" | "));
      if (V.topRisks && V.topRisks.length) out.push("  欠产重点: " + V.topRisks.slice(0, 5).map(function (x) { return x.line + "缺口" + x.gap + "达成" + (x.attainment == null ? "-" : x.attainment) + "%"; }).join(" | "));
      // 白班/夜班独立归档: 页面当前只显示一个班次, 但 AI 上下文必须同时携带两种班次。
      if (V.shiftSnapshots && V.shiftSnapshots.length) {
        var shiftMetricText = function (m) {
          return m ? "正常" + m.normal + " 加班" + m.overtime + " 总" + m.total + " 计划" + m.plan + " 达成率" + (m.attainment == null ? "-" : Number(m.attainment).toFixed(1)) + "%" : "未归档/无数据";
        };
        out.push("  白班/夜班独立归档（当前分析范围）:");
        V.shiftSnapshots.forEach(function (s) {
          out.push("    " + s.date + " | 白班: " + shiftMetricText(s.day) + " | 夜班: " + shiftMetricText(s.night));
        });
      }
      if (V.shiftMatrix) {
        var matrixMetricText = function (r) {
          return r.line + " [" + r.workshop + "] 正常" + r.normal + " 加班" + r.overtime + " 总" + r.total + " 计划" + r.plan + " 达成率" + (r.attainment == null ? "-" : Number(r.attainment).toFixed(1)) + "%";
        };
        out.push("  指定日期线体白班/夜班明细（日期 " + V.shiftMatrix.date + ", 成品线范围）:");
        out.push("    白班:");
        (V.shiftMatrix.day || []).forEach(function (r) { out.push("      " + matrixMetricText(r)); });
        out.push("    夜班:");
        (V.shiftMatrix.night || []).forEach(function (r) { out.push("      " + matrixMetricText(r)); });
      }
      // 完整线体矩阵(全量): 与页面矩阵逐行一致, AI 可精确回答任意线体/车间的所有指标
      if (V.matrixRows && V.matrixRows.length) {
        out.push("  ∑线体矩阵(" + V.matrixRows.length + "条):");
        V.matrixRows.forEach(function (r) {
          var a = r.attainment;
          out.push("    " + r.line + " [" + r.workshop + "] 总" + r.total + " 正常" + r.normal + " 加班" + r.overtime + " 计划" + r.plan + " 达成" + (a == null ? "-" : a.toFixed(1)) + "% 均" + (r.average == null ? "-" : r.average) + " 前日比" + (r.delta == null ? "-" : (r.delta >= 0 ? "+" : "") + r.delta.toFixed(1) + "%") + " 波动" + (r.variation == null ? "-" : r.variation.toFixed(3)) + " 连续欠" + r.streak + "日 缺口" + r.gap);
        });
      }
      out.push("  口径: " + V.note);
    }

    var archive = (typeof window.__PDTIII_HISTORY_ARCHIVE__ !== "undefined") ? window.__PDTIII_HISTORY_ARCHIVE__ : null;
    var archiveContext = collectArchiveQueryContext(archive, query);
    if (archiveContext) out.push(archiveContext);

    out.push("\n(数据为网页已加载快照；历史问题会按提问条件从静态归档检索；如需最新实时数据请刷新页面)");
    return out.join("\n");
  }

  function localBrief() {
    var V = window.__PDTIII_HISTORY_VIEW__;
    if (!V) return "当前页面的历史分析数据尚未准备好, 请先打开产出分析页并稍候。";
    var lines = (V.topRisks || []).slice(0, 3).map(function (x, i) {
      return (i + 1) + ". " + x.line + "：欠产 " + Math.round(Number(x.gap) || 0) + " 件，达成 " + (x.attainment == null ? "-" : Number(x.attainment).toFixed(1)) + "%";
    });
    var latest = V.latest ? ("最新总产出 " + Math.round(Number(V.latest.total) || 0) + " 件，正常段达成 " + (V.latest.attainment == null ? "-" : Number(V.latest.attainment).toFixed(1)) + "%") : "暂无可用指标";
    return "本地快速诊断（基于当前已加载静态归档）\n范围：" + V.scope + " · " + V.shift + " · " + (V.selectedDate || V.dateRange) + "\n" + latest + "\n\n优先关注：\n" + (lines.length ? lines.join("\n") : "暂无可计算的线体风险") + "\n\n建议：先确认最大欠产线的停机、换型、缺料和品质记录，再决定是否需要调整加班或人员。";
  }

  /* ── UI 结构 ── */
  /* ── 构建窗口: 内嵌在产出分析页顶栏的按钮 + 大弹窗 ── */
  /* 注: UI 仅由产出分析页触发创建, 不自动挂载到主看板 */
  var ui;                          // 当前 UI 引用 (addMsg/initSpeech/askAI 共用)
  var _panel, _msgs, _input, _mic, _send, _anaBtn;
  var _isMacroOpen = false;
  var recognition;                 // 语音识别实例
  var recording = false;           // 语音录制状态
  var requestBusy = false;         // 当前是否正在等待 AI 响应
  var _bodyLockState = null;       // 打开 AI 时锁定背景页面，避免滚动/键盘冲突
  var _focusBeforeOpen = null;
  var _viewportEventsBound = false;

  function lockBackgroundPage() {
    if (_bodyLockState || !document.body) return;
    _bodyLockState = {
      scrollY: window.pageYOffset || document.documentElement.scrollTop || 0,
      htmlOverflow: document.documentElement.style.overflow,
      bodyPosition: document.body.style.position,
      bodyTop: document.body.style.top,
      bodyWidth: document.body.style.width,
      bodyOverflow: document.body.style.overflow
    };
    document.documentElement.classList.add("ai-modal-open");
    document.body.classList.add("ai-modal-open");
    document.body.style.position = "fixed";
    document.body.style.top = (-_bodyLockState.scrollY) + "px";
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
  }

  function unlockBackgroundPage() {
    if (!_bodyLockState || !document.body) return;
    var state = _bodyLockState;
    _bodyLockState = null;
    document.documentElement.classList.remove("ai-modal-open");
    document.body.classList.remove("ai-modal-open");
    document.documentElement.style.overflow = state.htmlOverflow;
    document.body.style.position = state.bodyPosition;
    document.body.style.top = state.bodyTop;
    document.body.style.width = state.bodyWidth;
    document.body.style.overflow = state.bodyOverflow;
    window.scrollTo(0, state.scrollY);
  }

  function syncViewportHeight() {
    if (!_panel || !_panel.style || _panel.style.display !== "flex") return;
    var viewport = window.visualViewport;
    if (!viewport) return;
    var height = Math.max(320, Math.round(viewport.height));
    _panel.style.setProperty("--ai-viewport-height", height + "px");
    if (ui && ui.input && document.activeElement === ui.input && viewport.height < window.innerHeight - 80) {
      window.requestAnimationFrame(function () { ui.input.scrollIntoView({ block: "nearest", inline: "nearest" }); });
    }
  }

  function bindViewportEvents() {
    if (_viewportEventsBound || !window.visualViewport) return;
    _viewportEventsBound = true;
    window.visualViewport.addEventListener("resize", syncViewportHeight);
    window.visualViewport.addEventListener("scroll", syncViewportHeight);
  }

  function openAiPanel() {
    if (!_panel) return;
    _focusBeforeOpen = document.activeElement;
    lockBackgroundPage();
    bindViewportEvents();
    _panel.style.display = "flex";
    syncViewportHeight();
    if (_anaBtn) {
      _anaBtn.style.visibility = "hidden";
      _anaBtn.style.pointerEvents = "none";
    }
    updateScope();
    checkProxyHealth();   // ★ 2026-10-06 打开即自检 AI 代理连通性, 避免"无响应"时无从判断原因
    window.requestAnimationFrame(function () {
      if (ui && ui.input) ui.input.focus({ preventScroll: true });
      syncViewportHeight();
    });
  }

  /* ★ 2026-10-06 AI 代理连通性自检: 用 OPTIONS 预检(不消耗模型额度), 结果直接显示在弹窗头部
     目的: 网络/公司代理拦截 workers.dev 时, 一眼看出是"连不上"还是"上游没返回", 而不是只看到"无响应" */
  var _proxyHealthState = "未检测";
  function proxyHealthDot() {
    return _panel ? _panel.querySelector(".ai-live-dot") : null;
  }
  function setProxyHealth(text, ok, color) {
    var dot = proxyHealthDot();
    if (!dot) return;
    dot.innerHTML = '<i style="background:' + (color || (ok ? "#4ade80" : "#f87171")) + '"></i>' + escapeHtml(text);
    dot.title = text;
  }
  function proxyHostLabel() {
    try { return String(CFG.proxyUrl || "").replace(/^https?:\/\//, "").split("/")[0] || "代理地址未配置"; }
    catch (e) { return "代理地址未配置"; }
  }
  function checkProxyHealth() {
    if (!CFG || !CFG.proxyUrl) { _proxyHealthState = "代理地址未配置"; setProxyHealth("AI 代理地址未配置", false); return; }
    setProxyHealth("正在检测 AI 代理…", true, "#fbbf24");
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var tmr = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;
    fetch(CFG.proxyUrl, { method: "OPTIONS", signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (tmr) clearTimeout(tmr);
        if (!r.ok) throw new Error("HTTP " + r.status);
        _proxyHealthState = "AI 代理已连接";
        setProxyHealth("AI 代理已连接", true);
      })
      .catch(function (e) {
        if (tmr) clearTimeout(tmr);
        _proxyHealthState = "AI 代理连接失败";
        setProxyHealth("AI 代理连不上（网络可能拦截 " + proxyHostLabel() + "）", false);
      });
  }
  function proxyHealthHint() {
    return _proxyHealthState === "AI 代理已连接"
      ? "代理连通正常（说明是上游模型这次没产出内容）"
      : (_proxyHealthState === "AI 代理连接失败"
        ? "代理连不上（当前网络/DNS 拦截了 " + proxyHostLabel() + "，可换网络或用手机热点重试）"
        : "代理状态未知（可点右上角有新对话重开后自动重检）");
  }

  function closeAiPanel() {
    if (!_panel) return;
    if (recording && recognition) {
      try { recognition.stop(); } catch (e) {}
    }
    _panel.style.display = "none";
    unlockBackgroundPage();
    if (_anaBtn) {
      _anaBtn.style.visibility = "visible";
      _anaBtn.style.pointerEvents = "auto";
    }
    if (_focusBeforeOpen && typeof _focusBeforeOpen.focus === "function") {
      try { _focusBeforeOpen.focus({ preventScroll: true }); } catch (e) { _focusBeforeOpen.focus(); }
    } else if (_anaBtn) {
      _anaBtn.focus();
    }
    _focusBeforeOpen = null;
  }

  function syncComposerState() {
    if (!ui || !ui.send || !ui.input) return;
    var hasText = Boolean(String(ui.input.value || "").trim());
    ui.send.disabled = requestBusy || !hasText;
    ui.send.setAttribute("aria-disabled", ui.send.disabled ? "true" : "false");
  }

  function buildUI() {
    if (_panel) return;
    var btn = document.createElement("button");
    btn.className = "btn";
    btn.id = "aiAnaBtn";
    btn.textContent = "AI 助手";
    btn.title = "AI 智能问答: 询问产出/达成率/欠产/趋势";
    btn.style.cssText = "margin-left:6px;padding:8px 14px;border-radius:10px;border:1px solid #4b5d78;" +
      "background:rgba(43,92,191,.14);color:inherit;font-size:13px;font-weight:800;cursor:pointer;" +
      "line-height:1;white-space:nowrap;letter-spacing:.3px;";

    var style = document.createElement("style");
    style.id = "aiWidgetStyles";
    style.textContent = "" +
      "#aiWidgetPanel{--ai-ink:#14233b;--ai-muted:#718096;--ai-line:#dfe7f2;--ai-blue:#1d5fd1;--ai-blue-soft:#edf4ff;--ai-navy:#0e2346;position:fixed;inset:0;margin:auto;z-index:999999;width:min(1040px,94vw);height:min(84vh,760px);display:none;flex-direction:column;overflow:hidden;background:rgba(247,249,252,.96);border:0;outline:0;border-radius:22px;box-shadow:0 24px 80px rgba(5,20,48,.34),0 0 0 100vmax rgba(8,20,42,.34);font-family:'Segoe UI Variable','Segoe UI','Microsoft YaHei',sans-serif;color:var(--ai-ink)}" +
      "#aiWidgetPanel *{box-sizing:border-box}#aiWidgetPanel button{font-family:inherit}#aiWidgetPanel button:focus-visible,#aiWidgetPanel textarea:focus-visible{outline:3px solid rgba(62,126,232,.38);outline-offset:2px}" +
      ".ai-panel-head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 20px 22px;background:linear-gradient(180deg,rgba(13,33,67,.96) 0%,rgba(27,77,156,.82) 55%,rgba(27,77,156,0) 100%);color:#fff;backdrop-filter:blur(15px) saturate(118%);-webkit-mask-image:linear-gradient(180deg,#000 0%,#000 64%,rgba(0,0,0,.76) 82%,transparent 100%);mask-image:linear-gradient(180deg,#000 0%,#000 64%,rgba(0,0,0,.76) 82%,transparent 100%)}.ai-brand{display:flex;align-items:center;gap:11px;min-width:0}.ai-brand-mark{display:grid;place-items:center;width:36px;height:36px;border:1px solid rgba(255,255,255,.2);border-radius:11px;background:rgba(255,255,255,.1)}.ai-brand-mark svg{width:20px;height:20px}.ai-brand-copy{display:flex;flex-direction:column;gap:2px;min-width:0}.ai-brand-copy small{font-size:9px;letter-spacing:1.6px;font-weight:900;color:#a9c8ff}.ai-brand-copy strong{font-size:15px;line-height:1.2;white-space:nowrap}.ai-head-actions{display:flex;align-items:center;gap:8px}.ai-live-dot{display:inline-flex;align-items:center;gap:6px;margin-right:4px;color:#d9e8ff;font-size:10px;font-weight:800}.ai-live-dot i{width:7px;height:7px;border-radius:50%;background:#4ade80;box-shadow:0 0 0 4px rgba(74,222,128,.13)}.ai-head-btn{height:32px;padding:0 10px;border:1px solid rgba(255,255,255,.22);border-radius:8px;background:rgba(255,255,255,.1);color:#fff;cursor:pointer;font-size:11px;font-weight:800}.ai-head-btn:hover{background:rgba(255,255,255,.18)}.ai-close{width:32px;padding:0;font-size:18px}" +
      ".ai-layout{display:grid;grid-template-columns:250px minmax(0,1fr);flex:1;min-height:0}.ai-rail{padding:18px 14px;background:#f0f4fa;border-right:1px solid var(--ai-line);overflow:auto}.ai-rail-kicker,.ai-kicker{display:block;color:#69809e;font-size:9px;font-weight:900;letter-spacing:1.35px;text-transform:uppercase}.ai-rail-title{margin:5px 0 14px;font-size:15px;font-weight:900}.ai-action{display:flex;align-items:center;gap:9px;width:100%;margin:0 0 8px;padding:10px 9px;border:1px solid transparent;border-radius:11px;background:transparent;color:var(--ai-ink);text-align:left;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}.ai-action:hover{border-color:#c8d9f2;background:#fff;transform:translateX(2px)}.ai-action-index{display:grid;place-items:center;width:25px;height:25px;border-radius:8px;background:#dce9fb;color:var(--ai-blue);font-size:10px;font-weight:900}.ai-action-copy{display:flex;flex-direction:column;gap:2px;min-width:0;font-size:11.5px;font-weight:900}.ai-action-copy small{color:var(--ai-muted);font-size:9.5px;font-weight:600;line-height:1.35}.ai-action-arrow{margin-left:auto;color:#91a2ba;font-size:16px}.ai-rail-rule{height:1px;margin:18px 0;border:0;background:var(--ai-line)}.ai-context-card{padding:12px;border:1px solid #d7e3f3;border-radius:12px;background:#fff}.ai-context-card strong{display:block;margin-top:5px;font-size:12px}.ai-context-card p{margin:5px 0 0;color:var(--ai-muted);font-size:10px;line-height:1.55}.ai-context-tag{display:inline-flex;margin-top:9px;padding:4px 7px;border-radius:999px;background:var(--ai-blue-soft);color:#3866a2;font-size:9px;font-weight:800}" +
      ".ai-chat{display:flex;flex-direction:column;min-width:0;min-height:0;background:linear-gradient(180deg,rgba(251,252,254,.76),#fbfcfe 22%)}.ai-chat-intro{padding:19px 22px 12px;border-bottom:1px solid #e8edf5;background:rgba(255,255,255,.66)}.ai-chat-intro h3{margin:4px 0 3px;font-size:17px;line-height:1.25}.ai-chat-intro p{margin:0;color:var(--ai-muted);font-size:11px}.ai-messages{flex:1;min-height:0;overflow-y:auto;padding:16px 22px 20px}.ai-message{display:flex;gap:9px;align-items:flex-start;margin:0 0 15px;animation:aiMsgIn .2s ease-out}.ai-message.user{flex-direction:row-reverse}.ai-message-avatar{display:grid;place-items:center;flex:0 0 26px;width:26px;height:26px;border-radius:9px;background:#dbe9fb;color:var(--ai-blue);font-size:10px;font-weight:900}.ai-message.user .ai-message-avatar{background:#1d5fd1;color:#fff}.ai-message-body{display:block;flex:0 1 620px;max-width:78%;min-width:0}.ai-message-meta{display:block;margin:1px 0 4px;color:#8a9ab0;font-size:9px;font-weight:800}.ai-message.user .ai-message-meta{text-align:right}.ai-message-bubble{display:block;width:fit-content;max-width:100%;padding:11px 14px;border:1px solid #e0e7f1;border-radius:4px 14px 14px 14px;background:#fff;color:#28384e;font-size:12.5px;line-height:1.68;white-space:normal;word-break:break-word;box-shadow:0 3px 10px rgba(31,58,96,.04)}.ai-message-bubble p{margin:0 0 9px}.ai-message-bubble p:last-child{margin-bottom:0}.ai-message-bubble ul{margin:5px 0 9px;padding-left:18px}.ai-message-bubble li{margin:3px 0}.ai-message-bubble .ai-answer-label{color:#1d5fd1;font-weight:900}.ai-message-bubble .ai-answer-divider{height:1px;margin:9px 0;background:#e8edf5}.ai-message-bubble .ai-answer-muted{color:#718096}.ai-message.user .ai-message-bubble{border:0;border-radius:14px 4px 14px 14px;background:#1d5fd1;color:#fff}.ai-composer{padding:12px 16px 14px;border-top:1px solid var(--ai-line);background:rgba(255,255,255,.78)}.ai-composer-box{display:flex;align-items:flex-end;gap:9px;padding:6px;border:1px solid #cbd8e8;border-radius:13px;background:#f9fbfe;transition:border-color .15s,box-shadow .15s}.ai-composer-box:focus-within{border-color:#83a9e7;box-shadow:0 0 0 3px rgba(53,110,209,.1)}.ai-composer textarea{flex:1;min-height:42px;max-height:110px;resize:none;border:0;outline:0;background:transparent;padding:8px 8px;color:var(--ai-ink);font-size:12.5px;line-height:1.5}.ai-composer textarea::placeholder{color:#94a3b8}.ai-icon-btn,.ai-send-btn{display:grid;place-items:center;flex:0 0 40px;width:40px;height:40px;border-radius:10px;cursor:pointer}.ai-icon-btn{border:1px solid #d2ddea;background:#fff;color:#506b8d;font-size:17px}.ai-icon-btn:hover{background:#eef4ff;color:var(--ai-blue)}.ai-send-btn{border:0;background:#1d5fd1;color:#fff;font-size:17px}.ai-send-btn:hover{background:#164ba8;transform:translateY(-1px)}.ai-compose-hint{margin:6px 4px 0;color:#9aa9bc;font-size:9.5px}.ai-compose-hint kbd{padding:1px 4px;border:1px solid #d4dce8;border-radius:4px;background:#f4f6f9;font-family:inherit}" +
      ".ai-message.user .ai-message-body{display:flex;flex-direction:column;align-items:flex-end}.ai-message-bubble{display:block;width:fit-content;max-width:100%}" +
      "@keyframes aiMsgIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}@media (prefers-reduced-motion:reduce){#aiWidgetPanel *{transition:none!important;animation:none!important}}@media (max-width:720px){#aiWidgetPanel{width:calc(100vw - 20px);height:calc(100vh - 20px);border-radius:16px}.ai-layout{grid-template-columns:1fr}.ai-rail{display:none}.ai-chat-intro{padding:15px 16px 10px}.ai-messages{padding:14px 14px 16px}.ai-message-body{max-width:84%}.ai-panel-head{padding:13px 14px}.ai-live-dot{display:none}.ai-composer{padding:10px}.ai-compose-hint{display:none}}";
    style.textContent += "#aiWidgetPanel .ai-message-bubble.ai-table-message{width:100%;padding:10px 12px}.ai-message-bubble h4{margin:2px 0 8px;color:#14233b;font-size:14px;line-height:1.4}.ai-message-bubble strong{font-weight:800}.ai-message-bubble code{padding:1px 4px;border-radius:4px;background:#eef2f7;color:#315176;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.92em}.ai-message-bubble ol{margin:5px 0 9px;padding-left:20px}.ai-message-bubble li{padding-left:2px}.ai-answer-table-wrap{width:100%;max-width:100%;margin:10px 0 4px;overflow-x:auto;border:1px solid #d8e1ec;border-radius:10px;background:#fff;box-shadow:0 2px 8px rgba(31,58,96,.04);-webkit-overflow-scrolling:touch}.ai-answer-table-wrap:focus-visible{outline:3px solid rgba(62,126,232,.38);outline-offset:2px}.ai-answer-table{width:100%;min-width:560px;border-collapse:separate;border-spacing:0;table-layout:auto;color:#28384e;font-size:12px;line-height:1.5}.ai-answer-table th,.ai-answer-table td{padding:9px 10px;text-align:left;vertical-align:top;white-space:normal;overflow-wrap:anywhere}.ai-answer-table th{background:#f2f5f9;color:#172942;font-size:11px;font-weight:900;letter-spacing:.1px}.ai-answer-table thead th+th,.ai-answer-table tbody td+td{border-left:1px solid #d8e1ec}.ai-answer-table tbody tr+tr td{border-top:1px solid #e3e9f1}.ai-answer-table tbody tr:nth-child(even) td{background:#fbfcfe}.ai-answer-table .align-center{text-align:center}.ai-answer-table .align-right{text-align:right;font-variant-numeric:tabular-nums}.ai-answer-table .ai-answer-muted{color:#8a9ab0;font-style:italic}.ai-message.user .ai-answer-table{color:#fff}.ai-message.user .ai-answer-table-wrap{border:0;background:rgba(255,255,255,.1);box-shadow:none}.ai-message.user .ai-answer-table th{background:rgba(255,255,255,.16);color:#fff}.ai-message.user .ai-answer-table td{color:#fff}.ai-message.user .ai-answer-table thead th+th,.ai-message.user .ai-answer-table tbody td+td,.ai-message.user .ai-answer-table tbody tr+tr td{border-color:rgba(255,255,255,.18)}";
     style.textContent += "#aiWidgetPanel{width:min(1240px,96vw);height:min(90vh,900px);height:min(90dvh,900px);min-height:560px;border-radius:24px;background:rgba(247,249,252,.985);box-shadow:0 28px 90px rgba(5,20,48,.38),0 0 0 100vmax rgba(8,20,42,.42)}" +
       ".ai-layout{grid-template-columns:238px minmax(0,1fr)}.ai-chat{background:linear-gradient(180deg,rgba(251,252,254,.9),#fbfcfe 24%)}" +
       ".ai-chat-intro{padding:16px 28px 12px}.ai-chat-intro h3{font-size:18px}.ai-chat-intro p{font-size:12px;line-height:1.55}" +
       ".ai-messages{padding:20px 28px 30px;scroll-behavior:smooth;overscroll-behavior:contain}" +
       ".ai-message{gap:12px;margin-bottom:19px}.ai-message-body{flex-basis:860px;max-width:min(88%,860px)}.ai-message-bubble{padding:14px 18px;border-radius:7px 17px 17px 17px;font-size:14px;line-height:1.72;box-shadow:0 5px 16px rgba(31,58,96,.06)}.ai-message.user .ai-message-bubble{border-radius:17px 7px 17px 17px}.ai-message-meta{margin-bottom:5px;font-size:10px}.ai-message-avatar{flex-basis:30px;width:30px;height:30px;border-radius:10px;font-size:11px}" +
       ".ai-message-bubble h4{font-size:16px;margin:3px 0 10px}.ai-message-bubble p{margin-bottom:11px}.ai-message-bubble ul,.ai-message-bubble ol{margin:6px 0 11px}.ai-message-bubble li{margin:4px 0}.ai-message-bubble.ai-table-message{padding:12px 14px}.ai-answer-table{font-size:13px;line-height:1.55}.ai-answer-table th,.ai-answer-table td{padding:10px 12px}" +
       ".ai-composer{padding:15px 22px 18px;background:rgba(255,255,255,.9)}.ai-composer-box{gap:10px;padding:7px;border-radius:15px}.ai-composer textarea{min-height:58px;max-height:180px;padding:9px 10px;font-size:14px;line-height:1.6}.ai-icon-btn,.ai-send-btn{flex-basis:44px;width:44px;height:44px;border-radius:11px;touch-action:manipulation;transition:background .15s,color .15s,transform .15s,box-shadow .15s}.ai-icon-btn:active,.ai-send-btn:active{transform:scale(.96)}.ai-send-btn:hover{box-shadow:0 6px 14px rgba(29,95,209,.22)}.ai-action{min-height:44px;transition:background .18s,border-color .18s,transform .18s,box-shadow .18s}.ai-action:active{transform:scale(.985)}.ai-head-btn{min-width:44px;min-height:36px;touch-action:manipulation}.ai-close{font-size:20px}.ai-context-card p{font-size:11px;line-height:1.6}" +
       ".ai-send-btn.is-busy{position:relative;color:transparent;cursor:wait;transform:none}.ai-send-btn.is-busy::after{content:\"\";width:16px;height:16px;border:2px solid rgba(255,255,255,.4);border-top-color:#fff;border-radius:50%;animation:aiSpin .7s linear infinite}@keyframes aiSpin{to{transform:rotate(360deg)}}" +
       "@media (max-width:720px){#aiWidgetPanel{inset:8px;width:calc(100vw - 16px);height:calc(100vh - 16px);height:calc(100dvh - 16px);min-height:0;border-radius:18px}.ai-panel-head{padding:max(13px,env(safe-area-inset-top)) 14px 16px}.ai-layout{grid-template-columns:1fr}.ai-chat-intro{padding:14px 16px 10px}.ai-chat-intro h3{font-size:17px}.ai-messages{padding:16px 14px 22px}.ai-message-body{max-width:90%;flex-basis:calc(100% - 42px)}.ai-message-bubble{padding:13px 15px;font-size:14px;line-height:1.68}.ai-message-bubble.ai-table-message{padding:10px}.ai-answer-table{font-size:12.5px}.ai-answer-table th,.ai-answer-table td{padding:9px 10px}.ai-composer{padding:10px 10px max(12px,env(safe-area-inset-bottom))}.ai-compose-hint{display:block;font-size:10px}.ai-brand-copy strong{font-size:14px}.ai-head-actions{gap:6px}.ai-head-btn{padding:0 9px}.ai-live-dot{display:none}}";
    style.textContent +=
      "html.ai-modal-open,body.ai-modal-open{overflow:hidden!important}#aiWidgetPanel{isolation:isolate;contain:layout paint;overscroll-behavior:contain}#aiWidgetPanel .ai-panel-head{position:sticky;top:0;z-index:4;flex:0 0 auto;isolation:isolate}#aiWidgetPanel .ai-layout{overflow:hidden}#aiWidgetPanel .ai-chat{overflow:hidden;min-height:0}#aiWidgetPanel .ai-messages{overscroll-behavior:contain;touch-action:pan-y;-webkit-overflow-scrolling:touch}#aiWidgetPanel .ai-composer{position:relative;z-index:3;flex:0 0 auto}#aiWidgetPanel .ai-send-btn:disabled{background:#cbd5e1;color:#fff;cursor:not-allowed;opacity:.82;transform:none;box-shadow:none}#aiWidgetPanel .ai-icon-btn[aria-pressed=\"true\"]{border-color:#ef9a9a;background:#fff1f2;color:#dc2626;box-shadow:0 0 0 4px rgba(239,68,68,.1)}#aiWidgetPanel .ai-icon-btn[aria-pressed=\"true\"] svg{animation:aiMicPulse 1.35s ease-in-out infinite}@keyframes aiMicPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.14)}}" +
      "#aiWidgetPanel textarea{font-family:inherit;min-width:0;width:0;overscroll-behavior:contain}#aiWidgetPanel .ai-composer-box{min-height:56px}#aiWidgetPanel .ai-icon-btn,#aiWidgetPanel .ai-send-btn{touch-action:manipulation;user-select:none;-webkit-tap-highlight-color:transparent}" +
      "@media (max-width:720px){#aiWidgetPanel{inset:0;width:100vw;max-width:100vw;height:var(--ai-viewport-height,100dvh);max-height:var(--ai-viewport-height,100dvh);min-height:0;border-radius:0;box-shadow:0 0 0 100vmax rgba(8,20,42,.48)}#aiWidgetPanel .ai-panel-head{padding:max(12px,env(safe-area-inset-top)) 14px 14px;min-height:64px;background:linear-gradient(180deg,rgba(13,33,67,.98),rgba(27,77,156,.9) 68%,rgba(27,77,156,0) 100%)}#aiWidgetPanel .ai-layout{min-height:0}#aiWidgetPanel .ai-chat{min-height:0}#aiWidgetPanel .ai-chat-intro{flex:0 0 auto;padding:12px 16px 10px}#aiWidgetPanel .ai-chat-intro p{line-height:1.5}#aiWidgetPanel .ai-messages{padding:14px 12px 18px}#aiWidgetPanel .ai-message{gap:8px;margin-bottom:14px}#aiWidgetPanel .ai-message-avatar{flex-basis:28px;width:28px;height:28px}#aiWidgetPanel .ai-message-body{max-width:calc(100% - 36px);flex-basis:calc(100% - 36px)}#aiWidgetPanel .ai-message-bubble{padding:12px 13px;font-size:15px;line-height:1.62;border-radius:5px 16px 16px 16px}#aiWidgetPanel .ai-message.user .ai-message-bubble{border-radius:16px 5px 16px 16px}#aiWidgetPanel .ai-composer{padding:8px 10px max(10px,env(safe-area-inset-bottom));background:rgba(247,249,252,.96)}#aiWidgetPanel .ai-composer-box{gap:7px;padding:6px;border-radius:19px;background:#fff;box-shadow:0 5px 18px rgba(31,58,96,.09)}#aiWidgetPanel .ai-composer textarea{min-height:42px;max-height:132px;padding:8px 7px;font-size:16px;line-height:1.45}#aiWidgetPanel .ai-icon-btn,#aiWidgetPanel .ai-send-btn{flex-basis:44px;width:44px;height:44px;border-radius:50%}#aiWidgetPanel .ai-compose-hint{margin:5px 6px 0;line-height:1.4;text-align:center}#aiWidgetPanel .ai-brand-copy small{font-size:8px;letter-spacing:1.2px}#aiWidgetPanel .ai-brand-copy strong{font-size:15px}#aiWidgetPanel .ai-head-btn{min-width:42px;height:38px;border-radius:11px}#aiWidgetPanel .ai-close{font-size:20px}}" +
      "@media (max-width:380px){#aiWidgetPanel .ai-brand-copy small{display:none}#aiWidgetPanel .ai-chat-intro h3{font-size:16px}#aiWidgetPanel .ai-message-bubble{font-size:14px}#aiWidgetPanel .ai-compose-hint{font-size:9px}}";
    document.head.appendChild(style);

    var panel = document.createElement("div");
    panel.id = "aiWidgetPanel";

     panel.setAttribute("role", "dialog");
     panel.setAttribute("aria-modal", "true");
     panel.setAttribute("aria-labelledby", "aiWidgetTitle");
     panel.innerHTML =
       '<div class="ai-panel-head"><div class="ai-brand"><span class="ai-brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M8 12h.01M16 12h.01M12 4v4M9 16h6"/></svg></span><span class="ai-brand-copy"><small>AI OPERATIONS COPILOT</small><strong id="aiWidgetTitle">产出经营诊断</strong></span></div><div class="ai-head-actions"><span class="ai-live-dot"><i></i>页面数据已加载</span><button id="aiWidgetReset" class="ai-head-btn" title="清除上下文记忆, 开启新对话">新对话</button><button id="aiWidgetClose" class="ai-head-btn ai-close" aria-label="关闭 AI 助手">×</button></div></div>' +
       '<div class="ai-layout"><aside class="ai-rail"><span class="ai-rail-kicker">DECISION PATHS</span><div class="ai-rail-title">从哪里开始？</div><button class="ai-action" type="button" data-ai-prompt="请先给出当前范围的经营结论，再列出最需要关注的3条线体和证据。"><span class="ai-action-index">01</span><span class="ai-action-copy">今日经营结论<small>先看全局，再找重点</small></span><span class="ai-action-arrow">›</span></button><button class="ai-action" type="button" data-ai-prompt="请按欠产贡献排序，说明最需要改善的线体，并给出现场核查顺序。"><span class="ai-action-index">02</span><span class="ai-action-copy">欠产诊断<small>从差距追到现场</small></span><span class="ai-action-arrow">›</span></button><button class="ai-action" type="button" data-ai-prompt="请比较当前选定日期与前一有效日，指出产出、达成率和加班的变化。"><span class="ai-action-index">03</span><span class="ai-action-copy">前后日对比<small>看变化，不只看结果</small></span><span class="ai-action-arrow">›</span></button><button class="ai-action" type="button" data-ai-prompt="请生成一份班前会可直接使用的3分钟汇报：结果、风险、行动、责任确认。"><span class="ai-action-index">04</span><span class="ai-action-copy">班前会汇报<small>把分析变成动作</small></span><span class="ai-action-arrow">›</span></button><hr class="ai-rail-rule"><div class="ai-context-card"><span class="ai-rail-kicker">CURRENT SCOPE</span><strong id="aiWidgetScope">读取当前视图…</strong><p>可直接询问任意已归档日期、班次、车间或线体；无需先切换页面筛选。</p><span class="ai-context-tag">静态归档 · 不新增数据库请求</span></div></aside><main class="ai-chat"><div class="ai-chat-intro"><span class="ai-kicker">当前诊断上下文</span><h3>直接询问任意日期与线体</h3><p>先说判断，再给证据和下一步；如果数据不足，会明确标出未知。</p></div><div id="aiWidgetMsgs" class="ai-messages" role="log" aria-live="polite" aria-label="AI 对话记录"></div><div class="ai-composer"><div class="ai-composer-box"><textarea id="aiWidgetInput" rows="2" aria-label="询问 AI 助手" autocomplete="off" autocapitalize="sentences" autocorrect="on" spellcheck="true" inputmode="text" enterkeyhint="send" placeholder="例如：查询 2026-09-10 夜班 Pro.2 Final A 的正常和加班产出"></textarea><button id="aiWidgetMic" class="ai-icon-btn" type="button" aria-label="语音输入" aria-pressed="false" title="语音输入"><svg viewBox="0 0 24 24" aria-hidden="true" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg></button><button id="aiWidgetSend" class="ai-send-btn" type="button" aria-label="发送问题" disabled><svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 14-7-4 14-3-6-7-1Z"/><path d="m12 13 7-8"/></svg></button></div><div class="ai-compose-hint">Enter 发送 · <kbd>Shift</kbd> + Enter 换行 · 可直接问任意日期/班次/线体</div></div></main></div>';

    document.body.appendChild(panel);
    _panel = panel;
    return { btn: btn, panel: panel };
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text).replace(/[&<>"']/g, function (ch) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch];
    });
  }

  function formatInlineMarkdown(text) {
    var safe = escapeHtml(text);
    // 先转义，再只处理有限的行内语法，避免 AI 返回内容注入 HTML。
    safe = safe.replace(/`([^`\n]+)`/g, "<code>$1</code>");
    safe = safe.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    safe = safe.replace(/__([^_\n]+)__/g, "<strong>$1</strong>");
    safe = safe.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    return safe;
  }

  function splitMarkdownTableCells(line) {
    var source = String(line || "").trim();
    if (source.charAt(0) === "|") source = source.slice(1);
    if (source.charAt(source.length - 1) === "|" && source.charAt(source.length - 2) !== "\\") {
      source = source.slice(0, -1);
    }
    var cells = [], cell = "";
    for (var i = 0; i < source.length; i++) {
      var ch = source.charAt(i);
      if (ch === "\\" && source.charAt(i + 1) === "|") {
        cell += "|";
        i++;
      } else if (ch === "|") {
        cells.push(cell.trim());
        cell = "";
      } else {
        cell += ch;
      }
    }
    cells.push(cell.trim());
    return cells;
  }

  function isMarkdownTableDivider(line) {
    var cells = splitMarkdownTableCells(line);
    return cells.length >= 2 && cells.every(function (cell) {
      return /^:?-{3,}:?$/.test(cell.trim());
    });
  }

  function renderMarkdownTable(headerLine, dividerLine, bodyLines) {
    var headers = splitMarkdownTableCells(headerLine);
    var alignments = splitMarkdownTableCells(dividerLine).map(function (cell) {
      var value = cell.trim();
      return value.charAt(0) === ":" && value.charAt(value.length - 1) === ":"
        ? "center"
        : value.charAt(value.length - 1) === ":" ? "right" : "left";
    });
    var headerHtml = headers.map(function (cell, index) {
      return "<th scope=\"col\" class=\"align-" + (alignments[index] || "left") + "\">" + formatInlineMarkdown(cell) + "</th>";
    }).join("");
    var rowsHtml = bodyLines.map(function (line) {
      var cells = splitMarkdownTableCells(line);
      while (cells.length < headers.length) cells.push("");
      if (cells.length > headers.length) cells = cells.slice(0, headers.length);
      return "<tr>" + cells.map(function (cell, index) {
        return "<td class=\"align-" + (alignments[index] || "left") + "\">" + (cell ? formatInlineMarkdown(cell) : "<span class=\"ai-answer-muted\">未填</span>") + "</td>";
      }).join("") + "</tr>";
    }).join("");
    return "<div class=\"ai-answer-table-wrap\" role=\"region\" aria-label=\"结构化数据表格\" tabindex=\"0\"><table class=\"ai-answer-table\"><thead><tr>" + headerHtml + "</tr></thead><tbody>" + rowsHtml + "</tbody></table></div>";
  }

  function formatParagraph(lines) {
    var content = lines.map(formatInlineMarkdown).join("<br>");
    content = content.replace(/^(结论|判断|证据|行动|建议|风险)[:：]/, "<span class=\"ai-answer-label\">$1</span>：");
    return "<p>" + content + "</p>";
  }

  // 一个 AI 回复只生成一个气泡；表格、段落、列表和换行都在同一气泡内部排版。
  function formatAiMessage(text) {
    var raw = String(text == null ? "" : text).replace(/\r\n?/g, "\n").trim();
    if (!raw) return "<p class=\"ai-answer-muted\">无内容</p>";
    var lines = raw.split("\n");
    var html = [], paragraph = [];
    function flushParagraph() {
      if (paragraph.length) {
        html.push(formatParagraph(paragraph));
        paragraph = [];
      }
    }
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      var trimmed = line.trim();
      if (!trimmed) {
        flushParagraph();
        i++;
        continue;
      }

      var heading = trimmed.match(/^#{1,6}\s+(.+)$/);
      if (heading) {
        flushParagraph();
        html.push("<h4>" + formatInlineMarkdown(heading[1]) + "</h4>");
        i++;
        continue;
      }

      // 标准 Markdown 表格: 当前行是表头，下一行是 |---|---| 分隔线。
      if (trimmed.indexOf("|") >= 0 && i + 1 < lines.length && isMarkdownTableDivider(lines[i + 1])) {
        flushParagraph();
        var tableHeader = line;
        var tableDivider = lines[i + 1];
        var tableRows = [];
        i += 2;
        while (i < lines.length && lines[i].trim() && lines[i].indexOf("|") >= 0) {
          tableRows.push(lines[i]);
          i++;
        }
        html.push(renderMarkdownTable(tableHeader, tableDivider, tableRows));
        continue;
      }

      var listMatch = trimmed.match(/^([-*•]|\d+[.)])\s+(.+)$/);
      if (listMatch) {
        flushParagraph();
        var ordered = /^\d/.test(listMatch[1]);
        var items = [];
        while (i < lines.length) {
          var item = lines[i].trim().match(/^([-*•]|\d+[.)])\s+(.+)$/);
          if (!item || (/^\d/.test(item[1]) !== ordered)) break;
          items.push("<li>" + formatInlineMarkdown(item[2]) + "</li>");
          i++;
        }
        html.push("<" + (ordered ? "ol" : "ul") + ">" + items.join("") + "</" + (ordered ? "ol" : "ul") + ">");
        continue;
      }

      paragraph.push(line);
      i++;
    }
    flushParagraph();
    return html.join("");
  }

  function addMsg(text, who) {
    var m = ui.msgs;
    var d = document.createElement("div");
    d.className = "ai-message " + (who === "user" ? "user" : "ai");
    d.innerHTML = '<span class="ai-message-avatar" aria-hidden="true">' + (who === "user" ? "你" : "AI") + '</span><span class="ai-message-body"><span class="ai-message-meta">' + (who === "user" ? "你" : "经营诊断助手") + '</span><span class="ai-message-bubble"></span></span>';
    var bubble = d.querySelector(".ai-message-bubble");
    bubble.innerHTML = formatAiMessage(text);
    if (bubble.querySelector(".ai-answer-table-wrap")) bubble.classList.add("ai-table-message");
    m.appendChild(d);
    m.scrollTop = m.scrollHeight;
  }

  /* ★ 2026-10-07 把文本写进最后一条 AI 气泡(没有就新建), 用于错误/兜底文案, 避免多出一条"正在生成回答…" */
  function writeAiBubble(text) {
    var b = ui && ui.msgs ? (function () {
      var ms = ui.msgs;
      for (var i = ms.children.length - 1; i >= 0; i--) {
        if (ms.children[i].className.indexOf("user") < 0) return ms.children[i].querySelector(".ai-message-bubble");
      }
      return null;
    })() : null;
    if (b) {
      b.innerHTML = formatAiMessage(text);
      if (b.querySelector(".ai-answer-table-wrap")) b.classList.add("ai-table-message");
      scrollMsgsIntoView();
      return b;
    }
    addMsg(text, "ai");
    return null;
  }

  /* ★ 2026-10-07 流式/渐显时自动跟到最新(用户往回翻则不打扰) */
  function scrollMsgsIntoView() {
    try {
      var m = ui && ui.msgs;
      if (!m) return;
      if (m.scrollHeight - m.scrollTop - m.clientHeight < 140) m.scrollTop = m.scrollHeight;
    } catch (e) {}
  }

  /* ★ 2026-10-07 逐字渲染器: 与主流 AI 网页一致的打字机效果
     - push(text): 文本入队(真流式的每个 delta / 兜底的整段都走它), 自动开始逐字吐字
     - finish(): 上游已结束, 吐完剩余队列后收尾
     - 速率自适应: 基准 ~55 字/秒(人眼舒适的打字感), 队列积压时自动加速, 最多落后约 1.2 秒
       → 既有逐字观感, 又不会因为网络一块来 200 字而拖到天荒地老 */
  function createTyper(bubble) {
    var q = "", painted = "", done = false, running = false, last = 0, lastPaint = 0;
    var BASE_CPS = 55, MAX_CPS = 320, PAINT_MS = 33, MAX_DT = 0.25;   // 33ms ≈ 30fps 重排, 长文本不卡顿
    var raf = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function (f) { return setTimeout(f, 16); };
    function clock(ts) { return typeof ts === "number" ? ts : Date.now(); }   // ★ 统一时钟: rAF 时间戳是页面相对值, 绝不能和 Date.now() 混用
    function paint(now) {
      lastPaint = now;
      bubble.innerHTML = formatAiMessage(painted);
      scrollMsgsIntoView();
    }
    function tick(ts) {
      var now = clock(ts);
      if (!last) last = now;
      // ★ 限幅: 页面切后台时 rAF 会停, 回来那一帧的 dt 可能巨大 → 夹到 0.25s, 避免一次性倾泻一大段
      var dt = Math.min(MAX_DT, Math.max(0, (now - last) / 1000)); last = now;
      if (q) {
        var cps = Math.min(MAX_CPS, Math.max(BASE_CPS, q.length / 1.2));   // 积压越多吐字越快
        var n = Math.max(1, Math.round(cps * dt));
        painted += q.slice(0, n); q = q.slice(n);
        if (now - lastPaint >= PAINT_MS) paint(now);
      }
      if (q || !done) { raf(tick); return; }
      running = false;
      paint(now);
      if (bubble.querySelector(".ai-answer-table-wrap")) bubble.classList.add("ai-table-message");
    }
    function start() { if (running) return; running = true; last = 0; raf(tick); }
    return {
      push: function (txt) { q += String(txt == null ? "" : txt); start(); },
      finish: function () { done = true; start(); }
    };
  }

  /* ★ 2026-10-07 兜底渐显: 代理不透传 SSE 时, 拿到完整文本后仍逐字吐出 */
  function typewriterReveal(bubble, text) {
    if (!bubble) return;
    var t = createTyper(bubble);
    t.push(text);
    t.finish();
  }

  function sendIconMarkup() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 14-7-4 14-3-6-7-1Z"/><path d="m12 13 7-8"/></svg>';
  }

  function setBusy(flag) {
    var s = ui.send;
    requestBusy = Boolean(flag);
    if (flag) {
      s.disabled = true;
      s.classList.add("is-busy");
      s.setAttribute("aria-busy", "true");
      s.setAttribute("aria-label", "正在生成回答");
      s.textContent = "";
    } else {
      s.disabled = false;
      s.classList.remove("is-busy");
      s.removeAttribute("aria-busy");
      s.setAttribute("aria-label", "发送问题");
      s.innerHTML = sendIconMarkup();
      syncComposerState();
    }
  }

  function updateScope() {
    if (!ui || !ui.scope) return;
    var V = window.__PDTIII_HISTORY_VIEW__;
    ui.scope.textContent = V ? "当前视图：" + V.scope + " · " + V.shift + " · " + (V.selectedDate || V.dateRange) + " · 静态归档" : "当前视图：实时数据加载中 · AI 将基于页面已加载数据回答";
  }

  /* ── 会话记忆: 用 conversation_id 实现多轮上下文 (仅当前会话) ── */
  function loadConvId() {
    try { return localStorage.getItem("aiWidget_convId") || ""; } catch(e){ return ""; }
  }
  function saveConvId(id) {
    try { if (id) localStorage.setItem("aiWidget_convId", id); } catch(e){}
  }
  function clearConvId() {
    try { localStorage.removeItem("aiWidget_convId"); } catch(e){}
    try { localStorage.removeItem("aiWidget_convTurns"); } catch(e){}
  }

  /* ★ 2026-10-06 多轮历史会累积进上游每次请求(每轮都带 SYSPROMPT+上下文), 长了就 400「token 超上限」
     → 本地记录轮数, 满 3 轮自动开新对话, 从源头少出现超限 */
  var CONV_MAX_TURNS = 3;
  function convTurns() { try { return parseInt(localStorage.getItem("aiWidget_convTurns") || "0", 10) || 0; } catch(e){ return 0; } }
  function setConvTurns(n) { try { localStorage.setItem("aiWidget_convTurns", String(n)); } catch(e){} }
  var CTX_MAX_CHARS = 12000;
  function clipContext(s) {
    s = String(s || "");
    if (s.length <= CTX_MAX_CHARS) return s;
    return s.slice(0, Math.round(CTX_MAX_CHARS * 0.7)) + "\n…（上下文过长已截断）…\n" + s.slice(-Math.round(CTX_MAX_CHARS * 0.3));
  }

  function askAI(query) {
    var hcDate = parseHCDate(query);
    var hcExtraPromise = fetchHCAttendance(hcDate);   /* 无目标日期时 Promise.resolve("") */
    hcExtraPromise.then(function (hcExtra) {
      doAsk(query, hcExtra);
    }, function () {
      doAsk(query, "");   // ★ 2026-10-06 人数预取异常也不能让提问静默失败(否则表现为"点了没反应")
    });
  }

  /* 实际调用代理 (转发到美的 Dify) */
  function doAsk(query, hcExtra, isRetry) {
    var ctx = "";
    try { ctx = clipContext(collectContext(query, hcExtra)); }
    catch (ctxErr) {
      // ★ 2026-10-06 上下文构建异常时降级提问, 绝不静默; 页面数据异常时仍能拿到 AI 回答
      ctx = "（页面上下文构建异常, 已按最小上下文提问: " + ((ctxErr && ctxErr.message) || ctxErr) + "）";
    }
    var convId = loadConvId();
    var newConvNotice = "";
    if (convId && convTurns() >= CONV_MAX_TURNS) {
      // 轮数已达上限 → 主动开新对话, 避免上游「输入 token 超上限」400
      clearConvId(); convId = ""; newConvNotice = "（对话轮数已达上限，已自动开启新对话，避免上游超限）\n\n";
    }
    var payload = {
      query: query,
      context: ctx,
      mode: "pdtiii_operations_diagnosis_v2",
      response_contract: "先给结论；再列证据（日期、范围、指标）；再给不超过3项行动。用户询问任意日期、班次、车间或线体时，优先检索上下文中的‘独立历史归档检索’，不要求用户先切换页面日期或班次；仅当归档索引确实没有该日期/对象时才说明无数据。回答白班或夜班问题时，优先读取‘白班/夜班独立归档’和‘指定日期线体白班/夜班明细’，不要因为页面当前选中了一个班次就说看不到另一个班次。对于数据核查、日期对比、线体明细、异常清单和经营矩阵，优先使用标准 Markdown 表格（表头行 + 分隔行 + 数据行），不要用空格对齐或把每一行拆成独立段落。缺失值明确写‘缺失’或‘未填’，绝不把缺失当作0。没有数据就明确说未知，不要臆测根因。当用户问及每日制程问题点时（上下文中的‘每日制程问题点日志’节），回答语言必须跟随提问语言：若用户用泰语提问，直接用日志中的泰语原文概括并作答；若用户用中文提问，则先把泰语原文翻译成中文再给出总结与分析。回答问题点倾向/归因时，依据‘按日×部门汇总’的条数和影响合计、结合泰语原文描述判断，优先统计影响数(impact)大和出现频次高的问题，不要臆造。当用户询问某线体的最大/主要问题时（A线/B线/C线/D线、final A-D 线等）：该线体一律指 PRO.2 装配车间(零件装配)的 final A-D 四条线，线体字母=问题点条目的班次首字母；只能依据上下文‘每日制程问题点日志’节中该日期、该线体(PRO.2)的条目来回答，优先按影响数(impact)排序取最大，并翻译其泰语描述；绝不引用实时产出数据或其他车间(PRO.3/PRO.4/PE/IP/QA)里名称相似的同字母线体，因为问题点目前只在 PRO.2 装配记录，其他车间没有问题点数据。",
      conversation_id: convId    // 带上历史会话ID, 实现多轮记忆(超轮数上限时会自动置空开新对话)
      ,stream: true                    // ★ 2026-10-07 恢复「边生成边显示」(首字即出); 代理若没透传 SSE, 前端自动转逐字渐显兜底, 不会再卡在"正在生成回答…"
    };
    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timeoutId = controller ? setTimeout(function () { controller.abort(); }, 120000) : null;  // ★ 120s (DeepSeek 长响应)
    function clearRequestTimeout() {
      if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    }
    addMsg("正在生成回答…", "ai");
    var fullAnswer = "";   // ★ 累积完整回答
    // ★ 用 DOM 定位最后一条 AI 气泡并复用(不依赖 addMsg 返回值, 杜绝每块新建气泡)
    function liveBubble() {
      var ms = ui.msgs;
      for (var i = ms.children.length - 1; i >= 0; i--) {
        if (ms.children[i].className.indexOf("user") < 0) return ms.children[i].querySelector(".ai-message-bubble");
      }
      addMsg("", "ai");
      return ui.msgs.lastElementChild.querySelector(".ai-message-bubble");
    }
    function liveBubbleEl() {   // 返回可写的包裹层(用于最终替换)
      var ms = ui.msgs;
      for (var i = ms.children.length - 1; i >= 0; i--) {
        if (ms.children[i].className.indexOf("user") < 0) return ms.children[i];
      }
      return ms.lastElementChild;
    }
    setBusy(true);
    fetch(CFG.proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined
    })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status);
        var ctype = (r.headers && r.headers.get && r.headers.get("content-type")) || "";
        // ★ 2026-10-07 真流式: 代理透传 Dify SSE → 逐块渲染(想到多少显示多少, 首字即出)
        if (payload.stream && r.body && r.body.getReader && /text\/event-stream/i.test(ctype)) {
          var reader = r.body.getReader();
          var decoder = new TextDecoder();
          var acc = "";
          var cidSav = "";
          var upErr = "";
          var streamDone = false;
          var typer = null;
          function pushDelta(txt) {          // ★ 2026-10-07 逐字渲染(不再整块替换)
            if (!typer) typer = createTyper(liveBubble());
            typer.push(txt);
          }
          function endStream() {
            if (streamDone) return; streamDone = true;
            clearRequestTimeout(); setBusy(false);
            if (cidSav) { saveConvId(cidSav); setConvTurns(convTurns() + 1); }
            if (fullAnswer) { if (typer) typer.finish(); liveBubbleEl().classList.add("ai-table-message-v2"); return; }
            // ★ 2026-10-07 流式一个字都没出来(网络中断/上游空返回/超上限) → 明确报错, 不再永久停在"正在生成回答…"
            writeAiBubble(emptyAnswerReport({ error: upErr || "流式响应未产出内容(网络中断或上游空返回)" }));
          }
          function flush() {
            return reader.read().then(function (_r) {
              if (_r.done) { endStream(); return; }
              acc += decoder.decode(_r.value, { stream: true });
              var lines = acc.split("\n"); acc = lines.pop();
              for (var i = 0; i < lines.length; i++) {
                var ln = lines[i].trim();
                if (!ln.startsWith("data:")) continue;
                var j = ln.slice(5).trim();
                if (!j || j === "[DONE]") continue;
                try {
                  var o = JSON.parse(j);
                  if ((o.event === "agent_message" || o.event === "message") && typeof o.answer === "string") {
                    fullAnswer += o.answer;                     // ★ 累积
                    pushDelta(o.answer);                        // ★ 2026-10-07 入队逐字输出
                  }
                  if (o.event === "error") upErr = String(o.message || o.code || "上游 error 事件").slice(0, 200);
                  if (o.conversation_id) cidSav = o.conversation_id;
                  if (o.event === "message_end") {
                    endStream();
                    reader.cancel().catch(function(){});
                    return;
                  }
                } catch (e) {}
              }
              return flush();
            }, function () { endStream(); });
          }
          return flush();
        }
        // ★ 2026-10-07 兜底: 代理没透传 SSE(返回 JSON, 例如旧代理或中间层缓冲) → 读完整段后逐字渐显,
        //   即使拿不到真流式也有"边出边显示"的观感, 且绝不会卡在"正在生成回答…"
        return r.text().then(function (txt) {
          var d = null;
          try { d = JSON.parse(txt); } catch (e) {}
          if (!d) {   // content-type 标错但 body 其实是 SSE → 现场聚合
            var agg = "", cid2 = "";
            String(txt).split("\n").forEach(function (line) {
              var t = line.trim();
              if (t.indexOf("data:") !== 0) return;
              try {
                var o2 = JSON.parse(t.slice(5).trim());
                if ((o2.event === "agent_message" || o2.event === "message") && typeof o2.answer === "string") agg += o2.answer;
                if (o2.conversation_id) cid2 = o2.conversation_id;
              } catch (e2) {}
            });
            if (agg) d = { answer: agg, conversation_id: cid2 };
          }
          return d;
        }); })
      .then(function (data) {
        // 非流式分支 (未走 reader 时)
        if (!data) return;
        clearRequestTimeout();
        setBusy(false);
        var last = ui.msgs.lastElementChild;
        var pendingBubble = (last && last.textContent === "正在生成回答…") ? last.querySelector(".ai-message-bubble") : null;
        if (data && data.conversation_id) { saveConvId(data.conversation_id); setConvTurns(convTurns() + 1); }
        var answer = (data && (data.answer || data.reply)) || "";
        if (!answer) {
          // ★ 2026-10-06 代理 200 但无内容: 先降级(清历史开新对话)重试一次; 仍空则给出可诊断的原因, 不再只显示"无响应"
          if (!isRetry) { if (pendingBubble && pendingBubble.parentNode) pendingBubble.parentNode.remove(); clearConvId(); return doAsk(query, hcExtra, true); }
          var rep = formatAiMessage(emptyAnswerReport(data));
          if (pendingBubble) pendingBubble.innerHTML = rep; else addMsg(emptyAnswerReport(data), "ai");
          return;
        }
        var finalText = String(newConvNotice || (data && data.note ? "（提示：" + data.note + "）\n\n" : "")) + String(answer);
        // ★ 2026-10-07 逐字渐显(复用"正在生成回答…"那条气泡), 替代一次性整段弹出
        typewriterReveal(pendingBubble || liveBubble(), finalText);
      })
      .catch(function (e) {
        clearRequestTimeout();
        setBusy(false);
        var last = ui.msgs.lastElementChild;
        if (last && last.textContent === "正在生成回答…") last.remove();
        var timedOut = e && (e.name === "AbortError" || /timeout|timed out/i.test(String(e.message || "")));
        var reason = timedOut
          ? "AI 代理连接超时（120 秒无响应）：当前网络到 " + proxyHostLabel() + " 可能被限速或拦截，建议换网络/手机热点后重试。"
          : "AI 代理连不上（" + ((e && e.message) || "网络错误") + "）：多为当前网络/DNS 拦截 " + proxyHostLabel() + "，也可能是代理服务临时不可用。";
        setProxyHealth("AI 代理连接失败", false);
        addMsg(reason + "\n\n先给你页面内快速诊断：\n\n" + localBrief(), "ai");
      });
  }

  /* ★ 2026-10-06 空答案诊断文案 (代理连通但上游无内容时) */
  function emptyAnswerReport(data) {
    var bits = [];
    var errStr = String((data && data.error) || "");
    var tokenOver = /token count exceeds|maximum number|invalid_param|INVALID_ARGUMENT|context length|too long/i.test(errStr + String((data && data.detail) || ""));
    if (errStr) bits.push("代理返回: " + errStr.slice(0, 160));
    if (data && data.detail) bits.push("上游原文: " + String(data.detail).slice(0, 200));
    if (tokenOver) {
      // ★ 2026-10-06 真因已能识别(上游输入 token 超上限): 给出针对性处置, 而不是笼统"再问一次"
      return "AI 这次没能回答（已自动开新对话 + 压缩数据上下文重试，仍被上游拦下）。\n\n"
        + "原因已定位：**输入内容超过上游模型上限**（上游原文：" + errStr.slice(0, 120) + "…）。"
        + "常见于一次问得太宽（同时要比很多日期/很多线体）或同一对话轮数太多。\n"
        + (bits.length ? "\n诊断信息：\n- " + bits.join("\n- ") + "\n" : "")
        + "\n建议：① 点右上角「+」开新对话再问一次；② 把问题问窄一点（例如只问某个车间/某一天）；③ 仍不行就截图给维护人。\n\n"
        + "先看页面内快速诊断：\n\n" + localBrief();
    }
    return "AI 这次没有返回内容（已自动重试 1 次，仍为空）。\n\n"
      + "判断：" + proxyHealthHint() + "。常见原因是上游模型偶发空返回、并发达上限或额度用尽。\n"
      + (bits.length ? "\n诊断信息：\n- " + bits.join("\n- ") + "\n" : "")
      + "\n建议：① 直接再问一次（多数情况一次就好）；② 仍为空就把这句话截图给维护人；③ 先看下面的页面内快速诊断：\n\n"
      + localBrief();
  }

  function micIconMarkup(active) {
    return active
      ? '<svg viewBox="0 0 24 24" aria-hidden="true" width="17" height="17" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg>';
  }

  function setRecordingUI(active) {
    recording = Boolean(active);
    if (!ui || !ui.mic) return;
    ui.mic.innerHTML = micIconMarkup(recording);
    ui.mic.setAttribute("aria-pressed", recording ? "true" : "false");
    ui.mic.setAttribute("aria-label", recording ? "停止语音输入" : "语音输入");
    ui.mic.title = recording ? "正在聆听，点击停止" : "语音输入";
  }

  function speechLanguage() {
    var lang = String(document.documentElement.lang || "").toLowerCase();
    if (lang.indexOf("th") === 0) return "th-TH";
    if (lang.indexOf("en") === 0) return "en-US";
    return "zh-CN";
  }

  /* ── 语音输入 ── */
  function initSpeech() {
    if (!ui || !ui.mic || ui.mic.getAttribute("data-ai-speech-bound") === "true") return;
    ui.mic.setAttribute("data-ai-speech-bound", "true");
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { ui.mic.disabled = true; ui.mic.style.opacity = "0.45"; ui.mic.title = "当前浏览器不支持语音"; return; }
    recognition = new SR();
    recognition.lang = speechLanguage();
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = function (e) {
      var t = e.results[0][0].transcript;
      ui.input.value += (ui.input.value ? "\n" : "") + t;
      setRecordingUI(false);
      ui.input.dispatchEvent(new Event("input", { bubbles: true }));
      ui.input.focus({ preventScroll: true });
    };
    recognition.onerror = function () { setRecordingUI(false); };
    recognition.onend = function () { setRecordingUI(false); };
    ui.mic.addEventListener("click", function () {
      if (!recognition) return;
      if (recording) { recognition.stop(); return; }
      try {
        recognition.lang = speechLanguage();
        recognition.start();
        setRecordingUI(true);
      } catch (e) { /* 已启动 */ }
    });
  }

  /* ── 初始化 ── */
  /* ── 初始化: 由产出分析页调用, 把按钮放进其顶栏 ── */
  function initAnaUI() {
    // 幂等: 已建则直接返回引用
    buildUI();
    ui = {
      btn: _anaBtn,
      panel: _panel,
      msgs: document.getElementById("aiWidgetMsgs"),
      input: document.getElementById("aiWidgetInput"),
      mic: document.getElementById("aiWidgetMic"),
      send: document.getElementById("aiWidgetSend"),
      scope: document.getElementById("aiWidgetScope")
    };
    ui.btn = _anaBtn;
    ui.panel = _panel;

    // 产出分析页可能因切换视图而重复初始化；只绑定一次，避免一次点击发送多次请求。
    if (_panel.getAttribute("data-ai-events-bound") === "true") {
      updateScope();
      syncComposerState();
      return;
    }
    _panel.setAttribute("data-ai-events-bound", "true");

    document.getElementById("aiWidgetClose").onclick = function () {
      closeAiPanel();
    };
    document.getElementById("aiWidgetReset").onclick = function () {
      if (ui.msgs) ui.msgs.innerHTML = "";
      clearConvId();
      addMsg("已开启新对话，之前的问题不会影响本次。", "ai");
    };
    ui.btn.addEventListener("click", function () {
      openAiPanel();
    });
    function send() {
      var q = ui.input.value.trim();
      if (!q) return;
      addMsg(q, "user");
      ui.input.value = "";
      ui.input.style.height = "";
      syncComposerState();
      askAI(q);
    }
    ui.quick = ui.panel.querySelectorAll("button[data-ai-prompt]");
    ui.quick.forEach(function (button) {
      button.addEventListener("click", function () { ui.input.value = button.getAttribute("data-ai-prompt"); send(); });
    });
    ui.send.addEventListener("click", send);
    ui.input.addEventListener("input", function () {
      ui.input.style.height = "auto";
      ui.input.style.height = Math.min(ui.input.scrollHeight, 180) + "px";
      syncComposerState();
    });
    var composing = false;
    ui.input.addEventListener("compositionstart", function () { composing = true; });
    ui.input.addEventListener("compositionend", function () { composing = false; });
    ui.input.addEventListener("keydown", function (e) {
      // 中文/泰文输入法组合确认时，Enter 只提交候选词，不应误触发发送。
      if (e.key === "Enter" && !e.shiftKey && !composing && !e.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        send();
      }
    });
    if (!_panel.getAttribute("data-ai-keyboard-bound")) {
      _panel.setAttribute("data-ai-keyboard-bound", "true");
      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape" || !_panel || _panel.style.display !== "flex") return;
        document.getElementById("aiWidgetClose").click();
      });
    }
    addMsg("我会先定位异常，再引用页面已加载的数据证据，最后给出可执行行动。你可以直接点上面的快捷问题，也可以追问任意日期、班次、车间或线体。", "ai");
    initSpeech();
    syncComposerState();
  }

  /* ── 对外入口: 在产出分析页顶栏挂载 AI 按钮 ── */
  window.initAIForAnaPage = function (anaRoot) {
    var top = anaRoot && anaRoot.querySelector ? (anaRoot.querySelector(".ana-rt") || anaRoot.querySelector(".ana-top")) : null;
    if (!top) return;
    if (!_anaBtn) {
      buildUI();
      _anaBtn = document.createElement("button");
      _anaBtn.className = "btn";
      _anaBtn.id = "aiAnaBtn";
      _anaBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round"><rect x="3" y="11" width="18" height="10" rx="2"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/><path d="M12 3v4"/><path d="M8 7h8"/></svg><span>AI 助手</span>';
      _anaBtn.title = "AI 智能问答: 询问产出/达成率/欠产/趋势";
      _anaBtn.style.cssText = "display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:38px;" +
        "margin:0;padding:0 14px;border-radius:10px;border:1px solid rgba(255,255,255,.18);" +
        "background:rgba(255,255,255,.08);color:#fff;font-size:12.5px;font-weight:800;cursor:pointer;" +
        "line-height:1;white-space:nowrap;letter-spacing:.2px;";
    }
    top.appendChild(_anaBtn);
    initAnaUI();
  };

})();
