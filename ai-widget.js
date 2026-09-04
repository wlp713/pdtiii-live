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

  /* ── 数据采集: 把当前看板的产出数据拼成文本上下文 ── */
  function collectContext() {
    var out = [];
    var now = new Date();
    out.push("当前本地时间: " + now.toLocaleString("zh-CN", { hour12: false }));

    var D = (typeof window.__LIVE_DATA__ !== "undefined") ? window.__LIVE_DATA__ : null;
    if (D) {
      // 当天产出明细 (first_hour)
      if (D.first_hour && D.first_hour.length) {
        var date = D.first_hour[0].date || "";
        out.push("\n【当天产出明细 " + date + " 各线达成率】");
        D.first_hour.forEach(function (r) {
          out.push("  " + r.ws + "·" + (r.series || r.line) +
            "  目标 " + r.target + "  实际 " + r.actual + "  达成率 " + r.rate + "%");
        });
      }
      // 问题点
      if (D.problems && D.problems.length) {
        out.push("\n【今日问题点 " + D.problems.length + " 条】");
        D.problems.forEach(function (p) {
          out.push("  [" + (p.ws||"") + " " + (p.series||"") + " " + (p.time||"") + "] " +
            "计划 " + (p.plan||"-") + "/实际 " + (p.actual||"-") + "/缺口 " + (p.impact||"-") +
            " — " + (p.problem_zh || p.problem_th || ""));
        });
      }
      // 出勤
      if (D.attendance) {
        out.push("\n【出勤】" + JSON.stringify(D.attendance));
      }
    } else {
      out.push("\n(当前无 __LIVE_DATA__ 实时数据)");
    }

    // 历史达成率
    var H = (typeof window.__HISTORY__ !== "undefined") ? window.__HISTORY__ : null;
    if (H && H.length) {
      out.push("\n【历史达成率最近 [" + Math.min(H.length, 10) + " 天]】");
      H.slice(-10).forEach(function (d) {
        var ls = d.lines || {};
        var parts = Object.keys(ls).slice(0, 8).map(function (k) { return k + ":" + ls[k] + "%"; });
        out.push("  " + d.date + " — " + parts.join(" , "));
      });
    }
    return out.join("\n");
  }

  /* ── UI 结构 ── */
  function buildUI() {
    var btn = document.createElement("button");
    btn.id = "aiWidgetBtn";
    btn.textContent = "🤖";
    btn.title = "AI 产出分析助手";
    btn.style.cssText = "position:fixed;right:14px;bottom:96px;z-index:999999;width:52px;height:52px;" +
      "border-radius:50%;border:none;background:linear-gradient(135deg,#2b5cbf,#1e3a8a);color:#fff;" +
      "font-size:24px;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35);transition:transform .15s;";
    btn.addEventListener("mouseenter", function () { btn.style.transform = "scale(1.08)"; });
    btn.addEventListener("mouseleave", function () { btn.style.transform = "scale(1)"; });

    var panel = document.createElement("div");
    panel.id = "aiWidgetPanel";
    panel.style.cssText = "position:fixed;right:14px;bottom:154px;z-index:999999;width:420px;max-width:92vw;" +
      "height:560px;max-height:72vh;background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,.3);" +
      "display:none;flex-direction:column;overflow:hidden;font-family:'Segoe UI','Microsoft YaHei',sans-serif;";

    panel.innerHTML =
      '<div style="background:#1e293b;color:#fff;padding:12px 16px;font-size:14px;font-weight:700;' +
      'display:flex;justify-content:space-between;align-items:center;">' +
      '<span>🤖 AI 产出分析助手</span>' +
      '<span id="aiWidgetClose" style="cursor:pointer;font-size:18px;padding:0 4px;">✕</span></div>' +
      '<div id="aiWidgetMsgs" style="flex:1;overflow-y:auto;padding:12px;background:#f8fafc;font-size:13px;line-height:1.6;"></div>' +
      '<div style="border-top:1px solid #e2e8f0;padding:10px;display:flex;gap:8px;align-items:flex-end;background:#fff;">' +
      '<textarea id="aiWidgetInput" rows="2" placeholder="问我产出数据, 例如: 哪条线欠产最多? 今天总达成率多少?"' +
      ' style="flex:1;resize:none;border:1px solid #cbd5e1;border-radius:10px;padding:8px 10px;font-size:13px;font-family:inherit;"></textarea>' +
      '<button id="aiWidgetMic" title="语音输入" style="width:38px;height:38px;border-radius:50%;border:1px solid #cbd5e1;background:#fff;cursor:pointer;font-size:18px;flex-shrink:0;">🎤</button>' +
      '<button id="aiWidgetSend" style="width:46px;height:38px;border-radius:10px;border:none;background:#2b5cbf;color:#fff;cursor:pointer;font-size:16px;flex-shrink:0;">➤</button>' +
      '</div>';

    document.body.appendChild(btn);
    document.body.appendChild(panel);
    return { btn: btn, panel: panel };
  }

  var ui;
  var recording = false;
  var recognition = null;

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

  /* ── 实际调用代理 (转发到美的 Dify) ── */
  function askAI(query) {
    var ctx = collectContext();
    var payload = {
      query: query,
      context: ctx             // 产出数据上下文
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
  function init() {
    if (document.getElementById("aiWidgetBtn")) return;
    ui = buildUI();
    ui.btn = ui.btn;
    ui.panel = ui.panel;
    var b = ui; // buildUI 已返回 {btn,panel}; 补 query
    ui.msgs = document.getElementById("aiWidgetMsgs");
    ui.input = document.getElementById("aiWidgetInput");
    ui.mic = document.getElementById("aiWidgetMic");
    ui.send = document.getElementById("aiWidgetSend");
    document.getElementById("aiWidgetClose").onclick = function () { ui.panel.style.display = "none"; ui.btn.style.display = "flex"; };

    ui.btn.addEventListener("click", function () {
      ui.panel.style.display = "flex";
      ui.btn.style.display = "none";
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

    addMsg("👋 我是你的产出分析助手。直接问我产量、达成率、欠产线体等问题，我会结合当前看板数据回答。", "ai");
    initSpeech();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();