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

  /* ── 数据采集: 从网页已加载的数据(零新增请求)组全量上下文 ── */
  function collectContext() {
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
      out.push("  口径: " + V.note);
    }

    out.push("\n(数据为网页当前已加载快照, 如需最新请刷新页面)");
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
    btn.textContent = "🤖 AI 助手";
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
      ".ai-chat{display:flex;flex-direction:column;min-width:0;min-height:0;background:linear-gradient(180deg,rgba(251,252,254,.76),#fbfcfe 22%)}.ai-chat-intro{padding:19px 22px 12px;border-bottom:1px solid #e8edf5;background:rgba(255,255,255,.66)}.ai-chat-intro h3{margin:4px 0 3px;font-size:17px;line-height:1.25}.ai-chat-intro p{margin:0;color:var(--ai-muted);font-size:11px}.ai-messages{flex:1;min-height:0;overflow-y:auto;padding:16px 22px 20px}.ai-message{display:flex;gap:9px;align-items:flex-start;margin:0 0 15px;animation:aiMsgIn .2s ease-out}.ai-message.user{flex-direction:row-reverse}.ai-message-avatar{display:grid;place-items:center;flex:0 0 26px;width:26px;height:26px;border-radius:9px;background:#dbe9fb;color:var(--ai-blue);font-size:10px;font-weight:900}.ai-message.user .ai-message-avatar{background:#1d5fd1;color:#fff}.ai-message-body{max-width:min(78%,620px);min-width:0}.ai-message-meta{margin:1px 0 4px;color:#8a9ab0;font-size:9px;font-weight:800}.ai-message.user .ai-message-meta{text-align:right}.ai-message-bubble{padding:11px 14px;border:1px solid #e0e7f1;border-radius:4px 14px 14px 14px;background:#fff;color:#28384e;font-size:12.5px;line-height:1.68;white-space:normal;word-break:break-word;box-shadow:0 3px 10px rgba(31,58,96,.04)}.ai-message-bubble p{margin:0 0 9px}.ai-message-bubble p:last-child{margin-bottom:0}.ai-message-bubble ul{margin:5px 0 9px;padding-left:18px}.ai-message-bubble li{margin:3px 0}.ai-message-bubble .ai-answer-label{color:#1d5fd1;font-weight:900}.ai-message-bubble .ai-answer-divider{height:1px;margin:9px 0;background:#e8edf5}.ai-message-bubble .ai-answer-muted{color:#718096}.ai-message.user .ai-message-bubble{border:0;border-radius:14px 4px 14px 14px;background:#1d5fd1;color:#fff}.ai-composer{padding:12px 16px 14px;border-top:1px solid var(--ai-line);background:rgba(255,255,255,.78)}.ai-composer-box{display:flex;align-items:flex-end;gap:9px;padding:6px;border:1px solid #cbd8e8;border-radius:13px;background:#f9fbfe;transition:border-color .15s,box-shadow .15s}.ai-composer-box:focus-within{border-color:#83a9e7;box-shadow:0 0 0 3px rgba(53,110,209,.1)}.ai-composer textarea{flex:1;min-height:42px;max-height:110px;resize:none;border:0;outline:0;background:transparent;padding:8px 8px;color:var(--ai-ink);font-size:12.5px;line-height:1.5}.ai-composer textarea::placeholder{color:#94a3b8}.ai-icon-btn,.ai-send-btn{display:grid;place-items:center;flex:0 0 40px;width:40px;height:40px;border-radius:10px;cursor:pointer}.ai-icon-btn{border:1px solid #d2ddea;background:#fff;color:#506b8d;font-size:17px}.ai-icon-btn:hover{background:#eef4ff;color:var(--ai-blue)}.ai-send-btn{border:0;background:#1d5fd1;color:#fff;font-size:17px}.ai-send-btn:hover{background:#164ba8;transform:translateY(-1px)}.ai-compose-hint{margin:6px 4px 0;color:#9aa9bc;font-size:9.5px}.ai-compose-hint kbd{padding:1px 4px;border:1px solid #d4dce8;border-radius:4px;background:#f4f6f9;font-family:inherit}" +
      "@keyframes aiMsgIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}@media (prefers-reduced-motion:reduce){#aiWidgetPanel *{transition:none!important;animation:none!important}}@media (max-width:720px){#aiWidgetPanel{width:calc(100vw - 20px);height:calc(100vh - 20px);border-radius:16px}.ai-layout{grid-template-columns:1fr}.ai-rail{display:none}.ai-chat-intro{padding:15px 16px 10px}.ai-messages{padding:14px 14px 16px}.ai-message-body{max-width:84%}.ai-panel-head{padding:13px 14px}.ai-live-dot{display:none}.ai-composer{padding:10px}.ai-compose-hint{display:none}}";
    document.head.appendChild(style);

    var panel = document.createElement("div");
    panel.id = "aiWidgetPanel";

    panel.innerHTML =
      '<div class="ai-panel-head"><div class="ai-brand"><span class="ai-brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="3"/><path d="M8 12h.01M16 12h.01M12 4v4M9 16h6"/></svg></span><span class="ai-brand-copy"><small>AI OPERATIONS COPILOT</small><strong>产出经营诊断</strong></span></div><div class="ai-head-actions"><span class="ai-live-dot"><i></i>页面数据已加载</span><button id="aiWidgetReset" class="ai-head-btn" title="清除上下文记忆, 开启新对话">新对话</button><button id="aiWidgetClose" class="ai-head-btn ai-close" aria-label="关闭 AI 助手">×</button></div></div>' +
      '<div class="ai-layout"><aside class="ai-rail"><span class="ai-rail-kicker">DECISION PATHS</span><div class="ai-rail-title">从哪里开始？</div><button class="ai-action" type="button" data-ai-prompt="请先给出当前范围的经营结论，再列出最需要关注的3条线体和证据。"><span class="ai-action-index">01</span><span class="ai-action-copy">今日经营结论<small>先看全局，再找重点</small></span><span class="ai-action-arrow">›</span></button><button class="ai-action" type="button" data-ai-prompt="请按欠产贡献排序，说明最需要改善的线体，并给出现场核查顺序。"><span class="ai-action-index">02</span><span class="ai-action-copy">欠产诊断<small>从差距追到现场</small></span><span class="ai-action-arrow">›</span></button><button class="ai-action" type="button" data-ai-prompt="请比较当前选定日期与前一有效日，指出产出、达成率和加班的变化。"><span class="ai-action-index">03</span><span class="ai-action-copy">前后日对比<small>看变化，不只看结果</small></span><span class="ai-action-arrow">›</span></button><button class="ai-action" type="button" data-ai-prompt="请生成一份班前会可直接使用的3分钟汇报：结果、风险、行动、责任确认。"><span class="ai-action-index">04</span><span class="ai-action-copy">班前会汇报<small>把分析变成动作</small></span><span class="ai-action-arrow">›</span></button><hr class="ai-rail-rule"><div class="ai-context-card"><span class="ai-rail-kicker">CURRENT SCOPE</span><strong id="aiWidgetScope">读取当前视图…</strong><p>AI 只引用页面已加载的实时与静态归档数据。</p><span class="ai-context-tag">不新增数据库请求</span></div></aside><main class="ai-chat"><div class="ai-chat-intro"><span class="ai-kicker">当前诊断上下文</span><h3>围绕当前页面继续追问</h3><p>先说判断，再给证据和下一步；如果数据不足，会明确标出未知。</p></div><div id="aiWidgetMsgs" class="ai-messages" role="log" aria-live="polite"></div><div class="ai-composer"><div class="ai-composer-box"><textarea id="aiWidgetInput" rows="2" aria-label="询问 AI 助手" placeholder="问我：先给结论，再说明证据和下一步行动…"></textarea><button id="aiWidgetMic" class="ai-icon-btn" aria-label="语音输入" title="语音输入"><svg viewBox="0 0 24 24" aria-hidden="true" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6"/></svg></button><button id="aiWidgetSend" class="ai-send-btn" aria-label="发送问题"><svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 14-7-4 14-3-6-7-1Z"/><path d="m12 13 7-8"/></svg></button></div><div class="ai-compose-hint">Enter 发送 · <kbd>Shift</kbd> + Enter 换行 · 点击左侧路径快速开始</div></div></main></div>';

    document.body.appendChild(panel);
    _panel = panel;
    return { btn: btn, panel: panel };
  }

  function escapeHtml(text) {
    return String(text == null ? "" : text).replace(/[&<>"']/g, function (ch) {
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch];
    });
  }

  // 一个 AI 回复只生成一个气泡；段落、列表和换行只在气泡内部排版。
  function formatAiMessage(text) {
    var raw = String(text == null ? "" : text).replace(/\r\n?/g, "\n").trim();
    if (!raw) return "<p class=\"ai-answer-muted\">无内容</p>";
    var blocks = raw.split(/\n\s*\n/);
    return blocks.map(function (block) {
      var safe = escapeHtml(block);
      var lines = safe.split("\n");
      var isList = lines.length > 0 && lines.every(function (line) { return /^\s*(?:[-*•]|\d+[.)])\s+/.test(line) || !line.trim(); });
      if (isList) {
        return "<ul>" + lines.filter(function (line) { return line.trim(); }).map(function (line) {
          return "<li>" + line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "") + "</li>";
        }).join("") + "</ul>";
      }
      safe = safe.replace(/^(结论|判断|证据|行动|建议|风险)[:：]/m, "<span class=\"ai-answer-label\">$1</span>：");
      return "<p>" + safe.replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }

  function addMsg(text, who) {
    var m = ui.msgs;
    var d = document.createElement("div");
    d.className = "ai-message " + (who === "user" ? "user" : "ai");
    d.innerHTML = '<span class="ai-message-avatar" aria-hidden="true">' + (who === "user" ? "你" : "AI") + '</span><span class="ai-message-body"><span class="ai-message-meta">' + (who === "user" ? "你" : "经营诊断助手") + '</span><span class="ai-message-bubble"></span></span>';
    d.querySelector(".ai-message-bubble").innerHTML = formatAiMessage(text);
    m.appendChild(d);
    m.scrollTop = m.scrollHeight;
  }

  function setBusy(flag) {
    var s = ui.send;
    if (flag) { s.disabled = true; s.textContent = "…"; } else { s.disabled = false; s.textContent = "➤"; }
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
    var ctx = collectContext();
    var payload = {
      query: query,
      context: ctx,
      mode: "pdtiii_operations_diagnosis_v2",
      response_contract: "先给结论；再列证据（日期、范围、指标）；再给不超过3项行动。没有数据就明确说未知，不要臆测根因。",
      conversation_id: loadConvId()    // 带上历史会话ID, 实现多轮记忆
    };
    addMsg("🤖 思考中…", "ai");
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
        if (last && last.textContent === "🤖 思考中…") last.remove();
        if (data && data.conversation_id) saveConvId(data.conversation_id);
        var answer = (data && (data.answer || data.reply)) || (data && data.error) || "无响应";
        addMsg(String(answer), "ai");
      })
      .catch(function (e) {
        setBusy(false);
        var last = ui.msgs.lastElementChild;
        if (last && last.textContent === "🤖 思考中…") last.remove();
        addMsg("⚠️ 在线 AI 暂时不可用，先给你页面内快速诊断：\n\n" + localBrief() + "\n\n（原因：" + e.message + "）", "ai");
      });
  }

  /* ── 语音输入 ── */
  function initSpeech() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { ui.mic.style.opacity = "0.4"; ui.mic.title = "当前浏览器不支持语音"; return; }
    recognition = new SR();
    recognition.lang = "zh-CN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = function (e) {
      var t = e.results[0][0].transcript;
      ui.input.value += (ui.input.value ? "\n" : "") + t;
      recording = false;
      ui.mic.textContent = "🎤";
      ui.mic.style.background = "#fff";
    };
    recognition.onerror = function () { recording = false; ui.mic.textContent = "🎤"; ui.mic.style.background = "#fff"; };
    recognition.onend = function () { recording = false; ui.mic.textContent = "🎤"; ui.mic.style.background = "#fff"; };
    ui.mic.addEventListener("click", function () {
      if (!recognition) return;
      if (recording) { recognition.stop(); return; }
      try {
        recognition.start();
        recording = true;
        ui.mic.textContent = "🔴";
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
    };
    document.getElementById("aiWidgetReset").onclick = function () {
      if (ui.msgs) ui.msgs.innerHTML = "";
      clearConvId();
      addMsg("👋 已开启新对话, 之前的问题不会影响本次。", "ai");
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
      askAI(q);
    }
    ui.quick = ui.panel.querySelectorAll("button[data-ai-prompt]");
    ui.quick.forEach(function (button) {
      button.addEventListener("click", function () { ui.input.value = button.getAttribute("data-ai-prompt"); send(); });
    });
    ui.send.addEventListener("click", send);
    ui.input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
    addMsg("👋 我会先定位异常，再引用当前页面的数据证据，最后给出可执行行动。你可以直接点上面的快捷问题，也可以追问某个车间或线体。", "ai");
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
