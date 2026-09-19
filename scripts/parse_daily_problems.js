/* 解析每日制程问题点日志 → byDate 结构 [可复用: 浏览器导入 + node 生成种子] */
function parseDailyProblemLine(raw) {
  const line = (raw || "").trim();
  if (!line) return null;
  const out = { raw: line, date: "", shift: "", shiftLabel: "", dept: "", impact: null };

  // 1. 日期 DD/MM/YYYY 或 DD/MM/YYYY(可带头尾空白)
  const dm = line.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (dm) {
    const dd = String(parseInt(dm[1], 10)).padStart(2, "0");
    const mm = String(parseInt(dm[2], 10)).padStart(2, "0");
    out.date = dm[3] + "-" + mm + "-" + dd;
  }
  // 剩下去掉日期前缀
  let rest = dm ? line.slice(dm[0].length) : line;

  // 2. 班次标记 A/B/C/D [LINE] [DAY|NIGHT]
  const sm = rest.match(/^\s*([A-D])\s*(LINE\s*)?(DAY|NIGHT)\b/i);
  if (sm) {
    out.shift = (sm[1].toUpperCase()) + "-" + sm[3].toUpperCase();
    out.shiftLabel = sm[0].trim();
    rest = rest.slice(sm[0].length);
  }

  // 3. 责任部门 = 尾部部门词（含两词 Model chang / Change model）
  const deptRe = /(PE|IP|QA|PRO[.\s]*[1-4]|Change\s*model|Model\s*chang[e]?)\s*$/i;
  const ptr = deptRe.exec(rest);
  if (ptr) {
    out.dept = ptr[1].replace(/\s+/g, "").toUpperCase().replace(/PRO\./g, "PRO.").replace(/MODELCHANGE/, "MODELCHANGE").replace(/MODELCHANG/, "MODELCHANG");
    // 规范化：Pro.1 / PRO.2 / Model chang / Change model / PE / IP / QA
    rest = rest.slice(0, ptr.index);
  }

  // 4. 影响数 = 部门前最后一段整数
  const nums = rest.match(/\d+/g);
  if (nums && nums.length) out.impact = parseInt(nums[nums.length - 1], 10);

  // 5. 描述 = 班次之后、影响数之前
  out.problem_th = rest.replace(/\s+$/g, "").trim();
  return out;
}

function parseDailyProblems(text) {
  const byDate = {};
  const all = [];
  let pending = [];
  /* 续行感知: 不以日期开头的行视为上一条的续行(处理 Excel 换行/引号多行) */
  const dateStart = /^\s*\d{1,2}\/\d{1,2}\/\d{4}\b/;
  function flush() {
    if (!pending.length) return;
    const raw = pending.join(" ").replace(/\s+\"/g, "").replace(/\"\s*/g, " ").replace(/\s+/g, " ").trim()
      .replace(/^\"\s*/g, "").replace(/\"$/g, "").trim();
    pending = [];
    if (!raw) return;
    const p = parseDailyProblemLine(raw);
    if (!p) return;
    all.push(p);
    if (!byDate[p.date]) byDate[p.date] = [];
    byDate[p.date].push(p);
  }
  (text || "").split(/\r?\n/).forEach(function (ln) {
    if (!ln.trim()) { flush(); return; }
    if (dateStart.test(ln)) { flush(); pending = [ln]; }
    else pending.push(ln);
  });
  flush();
  return { byDate: byDate, all: all };
}

module.exports = { parseDailyProblemLine: parseDailyProblemLine, parseDailyProblems: parseDailyProblems };