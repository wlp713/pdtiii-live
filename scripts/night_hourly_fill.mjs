#!/usr/bin/env node
// PDTIII 晚班前半夜桶补全服务 (安全版)
// 数据端每晚不生成 20:30-24:00 前半夜 hourly 桶 → 前端晚班 hour 图无法分时段。
// 本服务: 当前时刻处于前半夜窗口时, 把每条在产线(lines.actual>0)的累计写成
// {h,d,actual,plan} 桶, 按线 PATCH 进 Firebase hourly(不动其他节点)。
// 幂等: 已存在同 d+h 桶则跳过; 只在缺桶时补, 不覆盖数据端已写。
// 兵: 用与数据端一致的类边界桶号(2130/2230/2330 = 21:30/22:30/23:30)。
const FB_HOURLY = "https://dm111-e8a7d-default-rtdb.firebaseio.com/pdtiii/hourly.json";
const FB = "https://dm111-e8a7d-default-rtdb.firebaseio.com/pdtiii.json";

function bkkNow(){ return new Date(new Date().toLocaleString("en-US",{timeZone:"Asia/Bangkok"})); }
function pad(n){return String(n).padStart(2,"0");}
function hhmm(dt){return pad(dt.getHours())+":"+pad(dt.getMinutes());}

async function main(){
  const now = bkkNow();
  const H = now.getHours(), M = now.getMinutes();
  const nowMi = H*60+M;
  const NIGHT_START = 20*60+30; // 20:30
  const NIGHT_END   = 21*60;    // 只处理 20:30-20:59? 不, 前半夜到 23:59
  if (nowMi < NIGHT_START){
    console.log(`[skip] 未到前半夜窗口 (${hhmm(now)})`); return;
  }
  // 边界桶号 = 当前所在小时结束的 :30 边界。 如 21:00-21:59 → h=2130? 
  // 数据端前半夜桶号: 2030,2130,2230,2330。 对应 20:30,21:30,22:30,23:30。
  // 当前小时 H 对应的结束边界桶号 = H*100+30 (20→2030, 21→2130,...22→2230)
  const hBucket = Math.min(H,23)*100+30;
  const d = now.toISOString().slice(0,10);
  console.log(`[run] ${hhmm(now)} 补桶 h=${hBucket} d=${d}`);

  const data = await (await fetch(FB)).json();
  const lines = data.lines||[];
  if (!Array.isArray(lines) || !lines.length){ console.log("[skip] 无数"); return; }

  // 需要补的线: 只有在产(actual>0)且缺桶的线
  const tasks = [];
  const skipInfo = [];
  for (const l of lines){
    const name = String(l.name||"").trim();
    const curA = Number(l.actual)||0;
    if (!name) continue;
    if (curA<=0){ skipInfo.push(name+":停"); continue; } // 停产线不补(实际=0, 补0桶无意义且污染)
    // 读该线现有桶
    let arr;
    try{ arr = await (await fetch(FB_HOURLY+"/"+encodeURIComponent(name)+".json")).json(); }catch(e){ arr=null; }
    if (!Array.isArray(arr)) arr=[];
    const dup = arr.some(b => String(b.d)===d && Number(b.h)===hBucket);
    if (dup){ skipInfo.push(name+":已有"+hBucket); continue; }
    tasks.push({ name, arr, curA, curP: Number(l.plan)||0 });
  }
  if (!tasks.length){
    console.log(`[done] 无可补 (跳过: ${skipInfo.join(" / ")} )`); return;
  }
  // 按线 PATCH: 只回写有新增桶的线
  let ok=0;
  for (const {name,arr,curA,curP} of tasks){
    const newArr = arr.concat([{ h:hBucket, d:d, actual:curA, plan:curP }]);
    await fetch(FB_HOURLY+"/"+encodeURIComponent(name)+".json", {
      method:"PUT", headers:{"Content-Type":"application/json"}, body: JSON.stringify(newArr)
    });
    ok++;
  }
  console.log(`[ok] 补写 ${ok} 线 (h=${hBucket}) | 跳过: ${skipInfo.join(" / ")}`);
}
main().catch(e=>{ console.error("[ERR]",e.message); process.exit(1); });