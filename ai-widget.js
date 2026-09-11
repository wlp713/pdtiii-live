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
  function collectContext(query) {
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
     document.head.appendChild(style);

    var panel = document.createElement("div");
    panel.id = "aiWidgetPanel";

     panel.setAttribute("role", "dialog");
     panel.setAttribute("aria-modal", "true");
     panel.setAttribute("aria-labelledby", "aiWidgetTitle");
     panel.innerHTML =
       '<div class="ai-panel-head"><div class="ai-brand"><span class="ai-brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M8 12h.01M16 12h.01M12 4v4M9 16h6"/></svg></span><span class="ai-brand-copy"><small>AI OPERATIONS COPILOT</small><strong id="aiWidgetTitle">产出经营诊断</strong></span></div><div class="ai-head-actions"><span class="ai-live-dot"><i></i>页面数据已加载</span><button id="aiWidgetReset" class="ai-head-btn" title="清除上下文记忆, 开启新对话">新对话</button><button id="aiWidgetClose" class="ai-head-btn ai-close" aria-label="关闭 AI 助手">×</button></div></div>' +
       '<div class="ai-layout"><aside class="ai-rail"><span class="ai-rail-kicker">DECISION PATHS</span><div class="ai-rail-title">从哪里开始？</div><button class="ai-action" type="button" data-ai-prompt="请先给出当前范围的经营结论，再列出最需要关注的3条线体和证据。"><span class="ai-action-index">01</span><span class="ai-action-copy">今日经营结论<small>先看全局，再找重点</small></span><span class="ai-action-arrow">›</span></button><button class="ai-action" type="button" data-ai-prompt="请按欠产贡献排序，说明最需要改善的线体，并给出现场核查顺序。"><span class="ai-action-index">02</span><span class="ai-action-copy">欠产诊断<small>从差距追到现场</small></span><span class="ai-action-arrow">›</span></button><button class="ai-action" type="button" data-ai-prompt="请比较当前选定日期与前一有效日，指出产出、达成率和加班的变化。"><span class="ai-action-index">03</span><span class="ai-action-copy">前后日对比<small>看变化，不只看结果</small></span><span class="ai-action-arrow">›</span></button><button class="ai-action" type="button" data-ai-prompt="请生成一份班前会可直接使用的3分钟汇报：结果、风险、行动、责任确认。"><span class="ai-action-index">04</span><span class="ai-action-copy">班前会汇报<small>把分析变成动作</small></span><span class="ai-action-arrow">›</span></button><hr class="ai-rail-rule"><div class="ai-context-card"><span class="ai-rail-kicker">CURRENT SCOPE</span><strong id="aiWidgetScope">读取当前视图…</strong><p>可直接询问任意已归档日期、班次、车间或线体；无需先切换页面筛选。</p><span class="ai-context-tag">静态归档 · 不新增数据库请求</span></div></aside><main class="ai-chat"><div class="ai-chat-intro"><span class="ai-kicker">当前诊断上下文</span><h3>直接询问任意日期与线体</h3><p>先说判断，再给证据和下一步；如果数据不足，会明确标出未知。</p></div><div id="aiWidgetMsgs" class="ai-messages" role="log" aria-live="polite" aria-label="AI 对话记录"></div><div class="ai-composer"><div class="ai-composer-box"><textarea id="aiWidgetInput" rows="2" aria-label="询问 AI 助手" placeholder="例如：查询 2026-09-10 夜班 Pro.2 Final A 的正常和加班产出"></textarea><button id="aiWidgetMic" class="ai-icon-btn" aria-label="语音输入" title="语音输入"><svg viewBox="0 0 24 24" aria-hidden="true" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg></button><button id="aiWidgetSend" class="ai-send-btn" aria-label="发送问题"><svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 14-7-4 14-3-6-7-1Z"/><path d="m12 13 7-8"/></svg></button></div><div class="ai-compose-hint">Enter 发送 · <kbd>Shift</kbd> + Enter 换行 · 可直接问任意日期/班次/线体</div></div></main></div>';

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

  function sendIconMarkup() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 14-7-4 14-3-6-7-1Z"/><path d="m12 13 7-8"/></svg>';
  }

  function setBusy(flag) {
    var s = ui.send;
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
  }

  /* ── 实际调用代理 (转发到美的 Dify) ── */
  function askAI(query) {
    var ctx = collectContext(query);
    var payload = {
      query: query,
      context: ctx,
      mode: "pdtiii_operations_diagnosis_v2",
      response_contract: "先给结论；再列证据（日期、范围、指标）；再给不超过3项行动。用户询问任意日期、班次、车间或线体时，优先检索上下文中的‘独立历史归档检索’，不要求用户先切换页面日期或班次；仅当归档索引确实没有该日期/对象时才说明无数据。回答白班或夜班问题时，优先读取‘白班/夜班独立归档’和‘指定日期线体白班/夜班明细’，不要因为页面当前选中了一个班次就说看不到另一个班次。对于数据核查、日期对比、线体明细、异常清单和经营矩阵，优先使用标准 Markdown 表格（表头行 + 分隔行 + 数据行），不要用空格对齐或把每一行拆成独立段落。缺失值明确写‘缺失’或‘未填’，绝不把缺失当作0。没有数据就明确说未知，不要臆测根因。",
      conversation_id: loadConvId()    // 带上历史会话ID, 实现多轮记忆
    };
    addMsg("正在生成回答…", "ai");
    setBusy(true);
    fetch(CFG.proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        setBusy(false);
        // 替换占位消息
        var last = ui.msgs.lastElementChild;
        if (last && last.textContent === "正在生成回答…") last.remove();
        if (data && data.conversation_id) saveConvId(data.conversation_id);
        var answer = (data && (data.answer || data.reply)) || (data && data.error) || "无响应";
        addMsg(String(answer), "ai");
      })
      .catch(function (e) {
        setBusy(false);
        var last = ui.msgs.lastElementChild;
        if (last && last.textContent === "正在生成回答…") last.remove();
        addMsg("在线 AI 暂时不可用，先给你页面内快速诊断：\n\n" + localBrief() + "\n\n（原因：" + e.message + "）", "ai");
      });
  }

  function micIconMarkup(active) {
    return active
      ? '<svg viewBox="0 0 24 24" aria-hidden="true" width="17" height="17" fill="currentColor"><circle cx="12" cy="12" r="5"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg>';
  }

  /* ── 语音输入 ── */
  function initSpeech() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { ui.mic.disabled = true; ui.mic.style.opacity = "0.45"; ui.mic.title = "当前浏览器不支持语音"; return; }
    recognition = new SR();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = function (e) {
      var t = e.results[0][0].transcript;
      ui.input.value += (ui.input.value ? "\n" : "") + t;
      recording = false;
      ui.mic.innerHTML = micIconMarkup(false);
      ui.mic.setAttribute("aria-label", "语音输入");
      ui.mic.style.background = "#fff";
    };
    recognition.onerror = function () { recording = false; ui.mic.innerHTML = micIconMarkup(false); ui.mic.setAttribute("aria-label", "语音输入"); ui.mic.style.background = "#fff"; };
    recognition.onend = function () { recording = false; ui.mic.innerHTML = micIconMarkup(false); ui.mic.setAttribute("aria-label", "语音输入"); ui.mic.style.background = "#fff"; };
    ui.mic.addEventListener("click", function () {
      if (!recognition) return;
      if (recording) { recognition.stop(); return; }
      try {
        recognition.start();
        recording = true;
        ui.mic.innerHTML = micIconMarkup(true);
        ui.mic.setAttribute("aria-label", "停止语音输入");
        ui.mic.style.background = "#fee2e2";
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

    document.getElementById("aiWidgetClose").onclick = function () {
      ui.panel.style.display = "none";
      ui.btn.style.visibility = "visible";
      ui.btn.style.pointerEvents = "auto";
      ui.btn.focus();
    };
    document.getElementById("aiWidgetReset").onclick = function () {
      if (ui.msgs) ui.msgs.innerHTML = "";
      clearConvId();
      addMsg("已开启新对话，之前的问题不会影响本次。", "ai");
    };
    ui.btn.addEventListener("click", function () {
      ui.panel.style.display = "flex";
      ui.btn.style.visibility = "hidden";
      ui.btn.style.pointerEvents = "none";
      updateScope();
      ui.input.focus();
    });
    function send() {
      var q = ui.input.value.trim();
      if (!q) return;
      addMsg(q, "user");
      ui.input.value = "";
      ui.input.style.height = "";
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
    });
    ui.input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
    if (!_panel.getAttribute("data-ai-keyboard-bound")) {
      _panel.setAttribute("data-ai-keyboard-bound", "true");
      document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape" || !_panel || _panel.style.display !== "flex") return;
        document.getElementById("aiWidgetClose").click();
      });
    }
    addMsg("我会先定位异常，再引用页面已加载的数据证据，最后给出可执行行动。你可以直接点上面的快捷问题，也可以追问任意日期、班次、车间或线体。", "ai");
    initSpeech();
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
