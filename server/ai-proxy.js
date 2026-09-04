/* ═════════════════════════════════════════════════════════════
 * server/ai-proxy.js — 美的 Dify API 代理 (Node 无依赖)
 * 2026-09-04
 *
 * 作用: 持有 API Key(不暴露给前端/GitHub), 接收网页的 POST,
 *       转发到美的 /chat-messages, 返回 AI 答复。
 *
 * 用法:
 *   export Midea_apiKey=app-xxxx        # 设置你的美的 Key
 *   node server/ai-proxy.js            # 默认 8787 端口
 *   前端 AICONFIG.proxyUrl 指向 http://<本机IP>:8787/ai
 *
 * CORS: 默认允许所有来源(局域网/本机); 上线时收紧 origin
 * ═════════════════════════════════════════════════════════════ */
"use strict";
const http = require("http");
const https = require("https");
const path = require("path");

const PORT = process.env.PORT || 8787;
const API_KEY = process.env.Midea_apiKey || "";
const UPSTREAM = "https://aigc.midea.com/dify/server/v1/chat-messages";
const AIGC_USER = "lipeng.wan";

if (!API_KEY) {
  console.error("[ai-proxy] ⚠️ 未设置 Midea_apiKey 环境变量, 请求将失败。");
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = "";
    req.on("data", (c) => { d += c; if (d.length > 2e6) { reject(new Error("body too large")); req.destroy(); } });
    req.on("end", () => resolve(d));
    req.on("error", reject);
  });
}

function postMidea(payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const url = new URL(UPSTREAM);
    const req = https.request({
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: "POST",
      headers: {
        "Authorization": "Bearer " + API_KEY,
        "AIGC-USER": AIGC_USER,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    }, (res) => {
      let d = "";
      res.setEncoding("utf8");
      res.on("data", (c) => d += c);
      res.on("end", () => resolve({ status: res.statusCode, body: d }));
    });
    req.setTimeout(timeoutMs, () => { req.destroy(new Error("upstream timeout")); });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function extractAnswer(body) {
  // 代理端我们用 blocking 模式? 不, 该 Agent 只支持 streaming, 且 Node 转发 SSE 复杂。
  // 此处改用 streaming 并在服务端聚合成完整 answer 后一并返回给前端(简化前端)。
  // 解析 SSE: data: {"event":"agent_message","answer":"..."}\n\n
  let buf = "";
  const lines = body.split("\n");
  for (const ln of lines) {
    const t = ln.trim();
    if (!t.startsWith("data:")) continue;
    const json = t.slice(5).trim();
    if (!json || json === "[DONE]") continue;
    try {
      const o = JSON.parse(json);
      if (o.event === "agent_message" && typeof o.answer === "string") buf += o.answer;
      if (o.event === "message_end") break;
      // agent_thought 忽略
    } catch (e) { /* ignore */ }
  }
  return buf;
}

const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, "http://localhost");
  if (req.method === "POST" && (url.pathname === "/ai" || url.pathname === "/api/ai")) {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || "{}");
      const query = (body.query || "").toString().trim();
      const context = (body.context || "").toString();
      if (!query) { res.writeHead(400, { "Content-Type": "application/json" }); return res.end(JSON.stringify({ error: "query 不能为空" })); }

      const difyPayload = {
        inputs: {},
        query: (context ? context + "\n\n[用户提问] " : "") + query,
        response_mode: "streaming",
        conversation_id: "",
        user: AIGC_USER,
        files: [],
      };
      const r = await postMidea(difyPayload, 60000);
      const answer = extractAnswer(r.body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ answer: answer || (r.status !== 200 ? "上游错误 HTTP " + r.status : ""), upstream: r.status }));
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "代理错误: " + e.message }));
    }
  } else {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not Found" }));
  }
});

server.listen(PORT, () => {
  console.log(`[ai-proxy] 美的 AI 代理已启动 http://0.0.0.0:${PORT}/ai`);
});