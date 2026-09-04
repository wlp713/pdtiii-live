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

    out.push("\n(数据为网页当前已加载快照, 如需最新请刷新页面)");
    return out.join("\n");
  }

  /* ── UI 结构 ── */
  /* ── 构建窗口: 内嵌在产出分析页顶栏的按钮 + 大弹窗 ── */
  /* 注: UI 仅由产出分析页触发创建, 不自动挂载到主看板 */
  var ui;                          // 当前 UI 引用 (addMsg/initSpeech/askAI 共用)
  var _panel, _msgs, _input, _mic, _send, _anaBtn;
  var _isMacroOpen = false;

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
      '<span>🤖 AI 智能问答 · 产出数据分析</span><span style="display:flex;align-items:center;gap:12px;">' +
      '<button id="aiWidgetReset" title="清除上下文记忆, 开启新对话" style="background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.35);color:#fff;border-radius:6px;font-size:12px;padding:4px 10px;cursor:pointer;">新对话</button>' +
      '<span id="aiWidgetClose" style="cursor:pointer;font-size:20px;padding:0 4px;line-height:1;">✕</span></span></div>' +
      '<div id="aiWidgetMsgs" style="flex:1;overflow-y:auto;padding:16px 18px;background:#f8fafc;font-size:14px;line-height:1.7;"></div>' +
      '<div style="border-top:1px solid #e2e8f0;padding:12px 16px;display:flex;gap:10px;align-items:flex-end;background:#fff;">' +
      '<textarea id="aiWidgetInput" rows="2" placeholder="问我产出数据, 例如: 哪些线欠产超1000? 各车间达成率? 与昨天相比?"' +
      ' style="flex:1;resize:none;border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;font-size:14px;font-family:inherit;"></textarea>' +
      '<button id="aiWidgetMic" title="语音输入" style="width:42px;height:42px;border-radius:50%;border:1px solid #cbd5e1;background:#fff;cursor:pointer;font-size:20px;flex-shrink:0;">🎤</button>' +
      '<button id="aiWidgetSend" style="width:50px;height:42px;border-radius:10px;border:none;background:#2b5cbf;color:#fff;cursor:pointer;font-size:18px;flex-shrink:0;">➤</button>' +
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
      conversation_id: loadConvId()    // 带上历史会话ID, 实现多轮记忆
    };
    addMsg("🤖 思考中…", "ai");
    setBusy(true);
    fetch(CFG.proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json(); })
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
        addMsg("⚠️ 请求失败: " + e.message, "ai");
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
      send: document.getElementById("aiWidgetSend")
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
      ui.input.focus();
    });
    function send() {
      var q = ui.input.value.trim();
      if (!q) return;
      addMsg(q, "user");
      ui.input.value = "";
      askAI(q);
    }
    ui.send.addEventListener("click", send);
    ui.input.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } });
    addMsg("👋 我是产出分析 AI 助手。可问各车间/线体产出的达成率、欠产、逐时走势、历史趋势。", "ai");
    initSpeech();
  }

  /* ── 对外入口: 在产出分析页顶栏挂载 AI 按钮 ── */
  window.initAIForAnaPage = function (anaRoot) {
    var top = anaRoot && anaRoot.querySelector ? anaRoot.querySelector(".ana-top") : null;
    if (!top) return;
    if (!_anaBtn) {
      buildUI();
      _anaBtn = document.createElement("button");
      _anaBtn.className = "btn";
      _anaBtn.id = "aiAnaBtn";
      _anaBtn.textContent = "🤖 AI 助手";
      _anaBtn.title = "AI 智能问答: 询问产出/达成率/欠产/趋势";
      _anaBtn.style.cssText = "margin-left:6px;padding:8px 14px;border-radius:10px;border:1px solid #4b5d78;" +
        "background:rgba(43,92,191,.14);color:inherit;font-size:13px;font-weight:800;cursor:pointer;" +
        "line-height:1;white-space:nowrap;letter-spacing:.3px;";
    }
    top.appendChild(_anaBtn);
    initAnaUI();
  };

})();