# 🤖 美的 AI 助手 — 部署说明（方案 2：Cloudflare Worker 代理）

这个 AI 悬浮窗助手（产出分析问答）用 **Cloudflare Worker 做免费代理**，你的美的 Dify API Key
存在 Cloudflare 的**私密变量**里，**不会进入 GitHub 公开仓库**，线上也能安全用。

> 旧的 `server/ai-proxy.js` 是本机 Node 代理（备用/本地测试用），正式走 Worker。
> 需要部署的就是 `server/worker.js`。

---

## 一、部署 Worker（约 5 分钟，需要 Cloudflare 免费账号）

### 方式 A：Cloudflare 控制台（不用装任何东西）— 推荐新手

1. 注册/登录 Cloudflare → 左侧菜单 **Workers & Pages** → **Create** → **Worker** → **Create Worker**
2. 给 Worker 起名，如 `midea-ai-proxy`
3. 点右上角 **Edit code** → **删除默认代码** → **粘贴 `server/worker.js` 的全部内容** → **Save and deploy**
4. 保存后进入该 Worker 的 **Settings → Variables** → 点 **Add** 添加两个：
   - `Midea_apiKey` = 你的美的 Dify Key（`app-97jse...`）
   - `AIGC_USER` = `lipeng.wan`
   - 类型选 **Secret（加密）**，不要选明文 Text
5. 记下你的 Worker 网址：`https://<worker名>.<你的子域>.workers.dev`

### 方式 B：Wrangler CLI（有 Node 环境时）

```bash
cd /mnt/c/Users/19777/Desktop/pdtiii-live/server
npx wrangler login
npx wrangler secret put Midea_apiKey   # 粘贴你的 key
npx wrangler secret put AIGC_USER      # 默认可不设, 用 lipeng.wan
npx wrangler deploy
```

---

## 二、配置网页前端指向 Worker

部署好后，把 `index.html` 里这一行：

```html
<script>window.AICONFIG={proxyUrl:(location.protocol==="https:"?"https://":"http://")+location.host+"/api/ai"};</script>
```

改成你的 Worker 地址（这一步告诉我你的 Worker 域名，我可以直接帮你改）：

```html
<script>window.AICONFIG={proxyUrl:"https://你的worker名.你的子域.workers.dev/ai"};</script>
```

改完 commit + push，网页上的 🎨 AI 悬浮窗就能在全球任何设备上使用了。

---

## 三、验证

部署并改好前端后，打开看板 → 点 🎨 → 问一句「今天 S 系列和 F 系列哪个欠产严重？」
若返回分析结果 = 全链路通了。

---

## 四、安全说明

- ✅ 美的 Key 只存在 **Cloudflare 私密变量**，GitHub 仓库里看不到，浏览器看不到
- ✅ Worker 无服务器费用（免费额度每月 10 万请求，个人自用绰绰有余）
- ✅ 前端只有 data（产出数据）→ Worker，Worker 带 key → 美的，双层隔离
- ⚠️ 代理 CORS 目前是 `*`（方便局域网）。若只想自己用，可收紧成你的域名，见 worker.js 顶部注释