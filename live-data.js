/* ═══════════════════════════════════════════════════════════
   live-data.js — 由 tools/ 下脚本定时写入（不要手改，会被覆盖）
   - attendance: 每日各车间出勤（来源: 美的云盘 GAT Attendance）
   - problems:   线体问题点（来源: 桌面Excel, 每2小时同步）
   - __HISTORY__: 每日17:00达成率快照 (来源: data.json, 趋势分析用)
   全量历史归档: history/YYYY-MM-DD.json (产量/UPH/问题点/出勤/达成率)
   最后写入: 2026-08-20 17:00:01
   ═══════════════════════════════════════════════════════════ */
window.__LIVE_DATA__ = {
  "attendance": null,
  "problems": [
    {
      "date": "2026-08-20",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "11:00-12:00",
      "problem_th": "เปลี่ยนเชือกเครื่องเย็บ 7 นาที",
      "problem_zh": "更换缝纫机线绳，用时7分钟。",
      "plan": 168,
      "actual": 147,
      "impact": -21
    },
    {
      "date": "2026-08-20",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "08:00-09:00",
      "problem_th": "เปิด Slot - ตรวจสอบยกลงเรต เครื่อง S Coil ไฟไม่เข้าหยุด 08:00-08:15 เครื่องSlotฟีล์มบี้หยุด 08:29 กำลังแก้ไข F-series",
      "problem_zh": "开启Slot机 - 检查升降下降速率，S Coil设备断电停机 08:00-08:15；Slot薄膜机停机 08:29，正在修复F系列。",
      "plan": 141,
      "actual": 141,
      "impact": 0
    },
    {
      "date": "2026-08-20",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "10:00-11:00",
      "problem_th": "เปิด Slot - ตรวจสอบยกลงเรต เครื่องเย็บ No1 ฮิตเตอร์ไม่ร้อนแก้ไข 10นาที F-series",
      "problem_zh": "开启Slot - 检查升降下降速率，No1缝焊机加热器不热，维修10分钟，F系列。",
      "plan": 141,
      "actual": 120,
      "impact": -21
    },
    {
      "date": "2026-08-20",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "11:00-12:00",
      "problem_th": "เปิด Slot - ตรวจสอบยกลงเรต Slot Statorเปิด หยุด11:35 กำลังแก้ไข",
      "problem_zh": "Slot开启 - 检查定子Slot下降速率，开启时11:35停机，正在修复中。",
      "plan": 141,
      "actual": 102,
      "impact": -39
    },
    {
      "date": "2026-08-20",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "08:00-09:00",
      "problem_th": "เครื่องอบRotor เสียใช้งานไม่ได้ตั้งแต่08:00-09:50 ได้จัดพนักงานทำ 5ส. และนำงานกองขึ้นเชื่อมและจัดคนไปช่วย Support ไลน์อื่น(PE กำลังเข้าแก้ไข)(-243) A Line Final",
      "problem_zh": "Rotor干燥机故障停机（08:00-09:50），已安排员工做5S，并将积压工件转至焊接工序，另派人支援其他线体（PE正在修复中）。（-243）A线Final。",
      "plan": 433,
      "actual": 190,
      "impact": -243
    },
    {
      "date": "2026-08-20",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "09:00-10:00",
      "problem_th": "เครื่องอบRotor เสียใช้งานไม่ได้ตั้งแต่08:00-09:50 ได้จัดพนักงานทำ 5ส. และนำงานกองขึ้นเชื่อมและจัดคนไปช่วย Support ไลน์อื่น(PE กำลังแก้ไข)(-423) A Line Final",
      "problem_zh": "Rotor烘干机故障停机（08:00-09:50），已安排员工做5S，并将积压工件转至焊接工序，另派人支援其他线体（PE正在修复中）（-423件）A线Final。",
      "plan": 433,
      "actual": 10,
      "impact": -423
    },
    {
      "date": "2026-08-20",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "10:00-11:00",
      "problem_th": "Marker หยุดไลน์เข้าตรวจสอบเครื่องอบRotor ทำให้งานออกFinal ไม่ต่อเนื่อง(-108) A Line Final",
      "problem_zh": "Marker报警，停线检查Rotor烘干机，导致A线Final出件中断（-108件）。",
      "plan": 361,
      "actual": 253,
      "impact": -108
    },
    {
      "date": "2026-08-20",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "11:00-12:00",
      "problem_th": "เสายึด Sensor เครื่องใส่Stator หัก (หัวหน้างานแก้ไขแล้ว)",
      "problem_zh": "定子安装机传感器固定柱断裂（组长已修复）。",
      "plan": 433,
      "actual": 388,
      "impact": -45
    },
    {
      "date": "2026-08-20",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "08:00-09:00",
      "problem_th": "เปลี่ยนหัวขัน bolt mug cover b รูด (-20) แก้ไขแล้ว",
      "problem_zh": "更换B型螺栓盖帽拧紧头，已修复（-20）。",
      "plan": 470,
      "actual": 450,
      "impact": -20
    },
    {
      "date": "2026-08-20",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "09:00-10:00",
      "problem_th": "conveyor ช่วง ตู้เชื่อม robot โซ่ติดราง ต้องหยุดไลน์แก้ไข (-50) แก้ไขแล้ว",
      "problem_zh": "输送线在机器人焊接柜段链条卡轨，需停线处理（-50件），已修复。",
      "plan": 470,
      "actual": 420,
      "impact": -50
    },
    {
      "date": "2026-08-20",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "10:00-11:00",
      "problem_th": "หยุดแก้ไขเปลี่ยนหัวขัน MUF COVER B รูด (-25) แก้ไขแล้ว /ติดตาม",
      "problem_zh": "停线更换MUF COVER B拧紧头，滑牙(-25)，已修复/跟进中。",
      "plan": 390,
      "actual": 365,
      "impact": -25
    },
    {
      "date": "2026-08-20",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "08:00-09:00",
      "problem_th": "งานไม่มี stock ในช่วงแรกเนื่องจากเครื่องอบ Rotor เสีย",
      "problem_zh": "前期因Rotor烘干机故障，导致无库存作业。",
      "plan": 444,
      "actual": 359,
      "impact": -85
    },
    {
      "date": "2026-08-20",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "09:00-10:00",
      "problem_th": "งานติด GAP มาไม่ต่อเนื่อง-33 (Pro1 เข้าจัดทรงหน้างานยังมีออกบ้างบางจังหวะ)",
      "problem_zh": "作业卡GAP，来料不连续-33（Pro1进料整形工位，现场仍有偶发跳出）",
      "plan": 444,
      "actual": 410,
      "impact": -34
    },
    {
      "date": "2026-08-20",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "11:00-12:00",
      "problem_th": "งานติด Air gap ออกเป็นระยะ จัดทรงแล้วยังไม่หาย",
      "problem_zh": "Air gap装配作业出现间歇性不良，调整形状后仍未解决。",
      "plan": 444,
      "actual": 414,
      "impact": -30
    }
  ]
};
window.__HISTORY__ = [
  {
    "date": "2026-08-20",
    "lines": {
      "C-Shaft Body A": 79.0,
      "Cylinder Honing": 61.6,
      "C-Shft Pin B": 87.9,
      "Welding A line": 50.4,
      "Motor H-Series": 99.2,
      "Motor S-Series": 91.1,
      "Motor F-Series": 76.4,
      "Motor WL": 0.0,
      "Rod Pispin": 30.2,
      "Frame Honing FL": 96.3,
      "Press C-Shaft": 77.0,
      "Piston honing FL": 91.8,
      "Welding B line": 94.6,
      "Piston Grinding": 89.5,
      "C-Shaft Pin C": 0.0,
      "Motor AC": 95.5,
      "Rotor B Line": 88.8,
      "Rotor D  Line": 100.1,
      "Final B Line": 97.1,
      "Rotor A line": 66.7,
      "Final D line": 96.3,
      "Water Line": 65.0,
      "Final A line": 68.6,
      "Rotor C  line": 94.4,
      "C-Shaft Body C": 0.0,
      "Final C line": 92.3,
      "Welding C line": 98.2,
      "Inspection B": 71.1,
      "Inspection D": 0.2,
      "C-Shaft Body B": 48.6,
      "Motor CL": 1.1,
      "Inspection A": 70.1,
      "Inspection C": 70.9,
      "C-Shaft Pin A": 58.7,
      "Welding D line": 87.8,
      "True B": 27.7
    }
  }
];
