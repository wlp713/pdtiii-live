const fs = require("fs");
const src = fs.readFileSync(require("path").join(__dirname, "..", "ai-widget.js"), "utf8");
function grab(name, indent) {
  const re = new RegExp("(^|\\n)" + (indent || "  ") + "function " + name + "\\s*\\(", "m");
  const m = re.exec(src);
  if (!m) throw new Error("not found: " + name);
  let i = src.indexOf("{", m.index + m[0].length - 1);
  let depth = 0, j = i;
  for (; j < src.length; j++) {
    if (src[j] === "{") depth++;
    else if (src[j] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(m.index, j + 1);
}
const code = [
  "escapeHtml","splitMarkdownTableCells","formatInlineMarkdown","isMarkdownTableDivider",
  "renderMarkdownTable","formatParagraph","formatAiMessage","scrollMsgsIntoView","createTyper"
].map(n => grab(n)).join("\n");

// ── 虚拟时钟 + 假 DOM ──
let vnow = 0, queue = [];
const fakeWin = { requestAnimationFrame: (cb) => { queue.push(cb); return queue.length; } };
const fakeEl = () => { const o = { _html: "", classList: { add(c) { o._cls.push(c); } }, _cls: [], querySelector: () => null }; Object.defineProperty(o, "innerHTML", { get: () => o._html, set: (v) => { o._html = v; o._writes = (o._writes||0)+1; } }); return o; };
const msgs = { scrollTop: 0, scrollHeight: 0, clientHeight: 0 };
const ui = { msgs };
const ctx = new Function("window", "ui", "formatAiMessage", "scrollMsgsIntoView", "createTyper", code + "\nreturn createTyper;")(fakeWin, ui, undefined, undefined, undefined);
const buggyCode = code.replace("lastPaint = now;", "lastPaint = Date.now();");
const createTyper = new Function("window", "ui", (process.env.BUGGY ? buggyCode : code) + "\nreturn createTyper;")(fakeWin, ui);

function drive(untilMs) {
  while (vnow < untilMs && queue.length) {
    vnow += 16;
    const batch = queue; queue = [];
    batch.forEach(cb => cb(vnow));
  }
}

const bubble = fakeEl();
const t = createTyper(bubble);

// 场景: 真流式, 每 60ms 来 6 字, 共 300 字
const chunk = "线体产出低于计划达成率数据";
let sent = 0, nextAt = 0;
const marks = [];
for (let tickIdx = 0; tickIdx < 400; tickIdx++) {
  drive(vnow + 16);
  if (vnow >= nextAt && sent < 300) { const s = chunk.slice(0, 6); t.push(s); sent += s.length; nextAt = vnow + 60; }
  marks.push(bubble.innerHTML.replace(/<[^>]+>/g, "").length);
  if (sent >= 300 && vnow > nextAt + 20000) break;
}
t.finish();
for (let k = 0; k < 3000 && queue.length; k++) drive(vnow + 16);

const uniq = [...new Set(marks)];
console.log("innerHTML 写入次数(重排):", bubble._writes);
console.log("可见文字长度出现过的不同值个数:", uniq.length);
console.log("前 20 帧可见长度:", marks.slice(0, 20).join(","));
console.log("最终可见长度:", marks[marks.length-1]);
console.log("是否 1 字后卡死:", uniq.length <= 2 ? "❌ 是" : "✅ 否(逐字生长)");
