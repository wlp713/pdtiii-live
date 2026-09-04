/* ═══════════════════════════════════════════════════════════════
 * worker.js — 美的 Dify AI 代理 (Cloudflare Worker)
 * 2026-09-04
 *
 * 作用: 持有 API Key (存入 Cloudflare 私密变量, 不暴露给前端/GitHub),
 *       接收网页 POST /ai, 转发到美的 /chat-messages (streaming),
 *       在 Worker 内聚合成完整 answer 后返回 JSON 给前端。
 *
 * 部署 (三种方式二选一):
 *   A. Wrangler CLI:  npx wrangler deploy   (需先配好下的 wrangler.toml)
 *   B. Dashboard (免 CLI):  Cloudflare 控制台 → Workers & Pages →
 *       创建 Worker → 粘贴本文件内容 → 保存部署。详见下方说明。
 *
 * 必须设置的环境/私密变量 (Cloudflare Dashboard → Worker → Settings → Variables):
 *   Midea_apiKey = app-xxxx   (你的美的 Dify API Key)
 *   AIGC_USER    = lipeng.wan (可选, 默认 lipeng.wan)
 *
 * 部署后把前端 index.html 里的 AICONFIG.proxyUrl 改为:
 *   https://<你的worker子域>.workers.dev/ai
 * ═══════════════════════════════════════════════════════════════ */
const UPSTREAM = "https://aigc.midea.com/dify/server/v1/chat-messages";

export default {
  async fetch(request, env) {
    // CORS
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method !== "POST" || (url.pathname !== "/ai" && url.pathname !== "/api/ai")) {
      return new Response(JSON.stringify({ error: "Not Found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const API_KEY = env.Midea_apiKey || "";
    const AIGC_USER = env.AIGC_USER || "lipeng.wan";
    if (!API_KEY) {
      return new Response(JSON.stringify({ error: "服务器未配置 Midea_apiKey, 请到 Cloudflare Worker 设置变量" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      const { query = "", context = "", conversation_id = "" } = await request.json();
      if (!String(query).trim()) {
        return new Response(JSON.stringify({ error: "query 不能为空" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 拼上产出数据上下文
      const prompt = (context ? context + "\n\n[用户提问] " : "") + query;

      const difyRes = await fetch(UPSTREAM, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + API_KEY,
          "AIGC-USER": AIGC_USER,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          inputs: {},
          query: prompt,
          response_mode: "streaming",
          conversation_id: String(conversation_id || ""),
          user: AIGC_USER,
          files: [],
        }),
      });

      if (!difyRes.ok) {
        const t = await difyRes.text();
        return new Response(JSON.stringify({ error: "上游错误 HTTP " + difyRes.status, detail: t.slice(0, 300) }), {
          status: difyRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 聚和 streaming SSE → 完整 answer
      const text = await difyRes.text();
      let answer = "";
      let cid = String(conversation_id || "");
      for (const line of text.split("\n")) {
        const t = line.trim();
        if (!t.startsWith("data:")) continue;
        const json = t.slice(5).trim();
        if (!json || json === "[DONE]") continue;
        try {
          const o = JSON.parse(json);
          if (o.event === "agent_message" && typeof o.answer === "string") answer += o.answer;
          if (o.event === "message_end") { if (o.conversation_id) cid = o.conversation_id; break; }
          if (o.conversation_id && !cid) cid = o.conversation_id;
        } catch (e) { /* 忽略单行解析失败 */ }
      }

      return new Response(JSON.stringify({ answer, conversation_id: cid }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "Worker 错误: " + e.message }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  },
};