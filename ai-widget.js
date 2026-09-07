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

    var panel = document.createElement("div");
    panel.id = "aiWidgetPanel";
    panel.style.cssText = "position:fixed;inset:0;margin:auto;z-index:999999;width:min(860px,94vw);" +
      "height:min(82vh,780px);display:none;flex-direction:column;overflow:hidden;background:#f8fafc;" +
      "border-radius:18px;box-shadow:0 20px 70px rgba(0,0,0,.45);font-family:'Segoe UI','Microsoft YaHei',sans-serif;";

    panel.innerHTML =
      '<div style="background:linear-gradient(135deg,#1e3a8a,#2b5cbf);color:#fff;padding:14px 18px;font-size:15px;font-weight:800;' +
      'display:flex;justify-content:space-between;align-items:center;">' +
      '<span>🤖 AI 智能问答 · 产出经营诊断</span><span style="display:flex;align-items:center;gap:12px;">' +
      '<button id="aiWidgetReset" title="清除上下文记忆, 开启新对话" style="background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:6px;font-size:12px;padding:4px 10px;cursor:pointer;">新对话</button>' +
      '<button id="aiWidgetClose" aria-label="关闭 AI 助手" style="cursor:pointer;font-size:20px;padding:0 4px;line-height:1;background:transparent;border:0;color:#fff;">✕</button></span></div>' +
      '<div id="aiWidgetScope" style="padding:9px 16px;background:#eef4ff;border-bottom:1px solid #dbe5f5;color:#35547d;font-size:12px;font-weight:700;">当前视图：读取中 · AI 将基于页面已加载数据回答</div>' +
      '<div id="aiWidgetQuick" style="display:flex;gap:7px;flex-wrap:wrap;padding:10px 16px 0;background:#f8fafc;">' +
      '<button type="button" data-ai-prompt="请先给出当前范围的经营结论，再列出最需要关注的3条线体和证据。">今日经营结论</button>' +
      '<button type="button" data-ai-prompt="请按欠产贡献排序，说明最需要改善的线体，并给出现场核查顺序。">欠产诊断</button>' +
      '<button type="button" data-ai-prompt="请比较当前选定日期与前一有效日，指出产出、达成率和加班的变化。">前后日对比</button>' +
      '<button type="button" data-ai-prompt="请生成一份班前会可直接使用的3分钟汇报：结果、风险、行动、责任确认。">班前会汇报</button>' +
      '</div>' +
      '<div id="aiWidgetMsgs" style="flex:1;overflow-y:auto;padding:16px 18px;background:#f8fafc;font-size:14px;line-height:1.7;"></div>' +
      '<div style="border-top:1px solid #e2e8f0;padding:12px 16px;display:flex;gap:10px;align-items:flex-end;background:#fff;">' +
      '<textarea id="aiWidgetInput" rows="2" aria-label="询问 AI 助手" placeholder="问我：先给结论，再说明证据和下一步行动…"' +
      ' style="flex:1;resize:none;border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;"></textarea>' +
      '<button id="aiWidgetMic" aria-label="语音输入" title="语音输入" style="width:42px;height:42px;border-radius:50%;border:1px solid #cbd5e1;background:#fff;cursor:pointer;font-size:20px;flex-shrink:0;">🎤</button>' +
      '<button id="aiWidgetSend" aria-label="发送问题" style="width:50px;height:42px;border-radius:10px;border:none;background:#2b5cbf;color:#fff;cursor:pointer;font-size:18px;flex-shrink:0;">➤</button>' +
      '</div>';

    document.body.appendChild(panel);
    _panel = panel;
    return { btn: btn, panel: panel };
  }

  function addMsg(text, who) {
    var m = ui.msgs;
    var d = document.createElement("div");
    d.style.cssText = "margin:6px 0;max-width:85%;padding:8px 12px;border-radius:12px;white-space:pre-wrap;word-wrap:break-word;" +
      (who === "user"
        ? "background:#2b5cbf;color:#fff;margin-left:auto;border-bottom-right-radius:2px;"
        : "background:#eef2f7;color:#1e293b;border-bottom-left-radius:2px;");
    d.textContent = text;
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
    ui.quick = document.getElementById("aiWidgetQuick");
    ui.quick.querySelectorAll("button[data-ai-prompt]").forEach(function (button) {
      button.style.cssText = "border:1px solid #cbd8ee;border-radius:999px;background:#fff;color:#35547d;padding:6px 10px;font:700 11px 'Segoe UI','Microsoft YaHei',sans-serif;cursor:pointer;";
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
