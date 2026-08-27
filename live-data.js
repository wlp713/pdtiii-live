/* ═══════════════════════════════════════════════════════════
   live-data.js — 由 tools/ 下脚本定时写入（不要手改，会被覆盖）
   - attendance: 每日各车间出勤（来源: 美的云盘 GAT Attendance）
   - problems:   线体问题点（来源: 桌面Excel, 每2小时同步）
   - __HISTORY__: 每日17:00达成率快照 (来源: data.json, 趋势分析用)
   最后写入: 2026-08-27 11:00:11
   ═══════════════════════════════════════════════════════════ */
window.__LIVE_DATA__ = {
  "attendance": null,
  "problems": [
    {
      "date": "2026-08-27",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "08:00-09:00",
      "problem_th": "มีstock wip ท้ายทำให้งานออกต่อเนื่อง H-series",
      "problem_zh": "H系列尾端有WIP库存，可保证作业连续产出。",
      "plan": 168,
      "actual": 172,
      "impact": 4
    },
    {
      "date": "2026-08-27",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "09:00-10:00",
      "problem_th": "เครื่องจักร",
      "problem_zh": "设备",
      "plan": 144,
      "actual": 128,
      "impact": -16
    },
    {
      "date": "2026-08-27",
      "ws": "RPO1",
      "series": "WL系列",
      "line": "RPO1·WL系列",
      "time": "09:00-10:00",
      "problem_th": "Stock Wip มีน้อยทำให้งานออกไม่ต่อเนื่อง",
      "problem_zh": "WIP库存不足，导致生产不连续。",
      "plan": 145,
      "actual": 113,
      "impact": -32
    },
    {
      "date": "2026-08-27",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "08:00-09:00",
      "problem_th": "ปืนเชื่อม D Pipe สายไฟหลุด ได้ทำการแก้ไขแล้ว (-21) ประเต็งหล่นขัดลิฟต์จุดเช็ค thrust gap PEเข้าแก้ไขแล้ว (-30) งานติด Air gap เช็คยาก (-50) ผลกระทบ Rotor Line งานฝืดและสดุดทำให้ทะยอยออกตู้ Cooling",
      "problem_zh": "碰焊机D Pipe焊枪电线脱落，已修复（-21）。碰焊件掉落卡住升降机，thrust gap检查点PE已处理（-30）。Air gap装配检查困难（-50）。影响Rotor Line作业卡滞、停顿，导致冷却柜产出断续。",
      "plan": 430,
      "actual": 299,
      "impact": -131
    },
    {
      "date": "2026-08-27",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "09:00-10:00",
      "problem_th": "งานติด Air gap เช็คยาก (-90) ผลกระทบ Rotor Line งานฝืดและสดุดทำให้ Rotor ลดอุณหภูมิไม่ทัน งานทะยอยออกตู้ Cooling (-80) Final Line ทะยอยนำคอมขึ้นเชื่อม 200 set",
      "problem_zh": "Air gap装配作业检查困难（-90），导致Rotor线作业不畅、出现停顿，转子降温不及时，冷却柜出料延迟（-80），最终线体只能分批将压缩机送上碰焊，共200台。",
      "plan": 430,
      "actual": 260,
      "impact": -170
    },
    {
      "date": "2026-08-27",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "8:00-9:00",
      "problem_th": "(-129) พนักงานใหม่เข้าจุด (-30) ติดตามเร่งสกิลความเร็ว งานรั่ว DV Line Out ออกต่อเนื่อง ส่งผลกระทบ (-100) B-Line Final",
      "problem_zh": "(-129) 新员工到岗(-30)，持续跟进加速技能熟练度。DV线体下线工件泄漏问题连续发生，影响(-100) B线最终组装。",
      "plan": 470,
      "actual": 341,
      "impact": -129
    },
    {
      "date": "2026-08-27",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "9:00-10:00",
      "problem_th": "(-69) งานรั่ว DV ยังทะยอยออก ซึ่งเป็นงานก่อนส่องไฟเช็ควาล์ว ส่งผลกระทบ (-69) ห้องวาล์วทำการส่องไฟเช็ควาล์วก่อนเข้าประกอบหน้าไลน์",
      "problem_zh": "(-69) DV泄漏件仍在陆续流出，属阀检前检漏工序的工件，导致(-69)阀室在进线组装前需先做检漏确认。",
      "plan": 470,
      "actual": 401,
      "impact": -69
    }
  ],
  "problems_top": [
    {
      "name": "Air gap装配作业检查困难（-90），导致Rotor线作业不畅、出现停顿，转子降温不及时，冷却柜出料延迟（-80），最终线体只能分批将压缩机送上碰焊，共200台。",
      "name_th": "งานติด Air gap เช็คยาก (-90) ผลกระทบ Rotor Line งานฝืดและสดุดทำให้ Rotor ลดอุณหภูมิไม่ทัน งานทะยอยออกตู้ Cooling (-80) F",
      "lines": [
        "PRO2·A"
      ],
      "times": [
        "09:00-10:00"
      ],
      "count": 1,
      "total_impact": -170
    },
    {
      "name": "碰焊机D Pipe焊枪电线脱落，已修复（-21）。碰焊件掉落卡住升降机，thrust gap检查点PE已处理（-30）。Air gap装配检查困难（-50）。影响Rotor Line作业卡滞、停顿，导致冷却柜产出断续。",
      "name_th": "ปืนเชื่อม D Pipe สายไฟหลุด ได้ทำการแก้ไขแล้ว (-21) ประเต็งหล่นขัดลิฟต์จุดเช็ค thrust gap PEเข้าแก้ไขแล้ว (-30) งานติด Ai",
      "lines": [
        "PRO2·A"
      ],
      "times": [
        "08:00-09:00"
      ],
      "count": 1,
      "total_impact": -131
    },
    {
      "name": "(-129) 新员工到岗(-30)，持续跟进加速技能熟练度。DV线体下线工件泄漏问题连续发生，影响(-100) B线最终组装。",
      "name_th": "(-129) พนักงานใหม่เข้าจุด (-30) ติดตามเร่งสกิลความเร็ว งานรั่ว DV Line Out ออกต่อเนื่อง ส่งผลกระทบ (-100) B-Line Final",
      "lines": [
        "PRO2·B"
      ],
      "times": [
        "8:00-9:00"
      ],
      "count": 1,
      "total_impact": -129
    }
  ],
  "first_hour": [
    {
      "date": "2026-08-27",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "target": 168,
      "actual": 172,
      "rate": 102.4
    },
    {
      "date": "2026-08-27",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "target": 150,
      "actual": 166,
      "rate": 110.7
    },
    {
      "date": "2026-08-27",
      "ws": "RPO1",
      "series": "WL系列",
      "line": "RPO1·WL系列",
      "target": 145,
      "actual": 191,
      "rate": 131.7
    },
    {
      "date": "2026-08-27",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "target": 430,
      "actual": 299,
      "rate": 69.5
    },
    {
      "date": "2026-08-27",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "target": 470,
      "actual": 341,
      "rate": 72.6
    },
    {
      "date": "2026-08-27",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "target": 444,
      "actual": 444,
      "rate": 100.0
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
  },
  {
    "date": "2026-08-21",
    "lines": {
      "C-Shaft Body A": 85.2,
      "Cylinder Honing": 85.1,
      "C-Shft Pin B": 88.7,
      "Welding A line": 97.8,
      "Motor H-Series": 56.9,
      "Motor S-Series": 74.3,
      "Motor F-Series": 7.7,
      "Motor WL": 0.0,
      "Rod Pispin": 29.7,
      "Frame Honing FL": 108.2,
      "Press C-Shaft": 85.3,
      "Piston honing FL": 87.9,
      "Welding B line": 93.4,
      "Piston Grinding": 94.1,
      "C-Shaft Pin C": 0.0,
      "Motor AC": 95.6,
      "Rotor B Line": 82.0,
      "Rotor D  Line": 92.0,
      "Final B Line": 83.9,
      "Rotor A line": 83.7,
      "Final D line": 89.1,
      "Water Line": 71.9,
      "Final A line": 75.3,
      "C-Shaft Body C": 0.0,
      "Final C line": 98.1,
      "Welding C line": 94.2,
      "Inspection B": 70.0,
      "Inspection D": 0.0,
      "C-Shaft Body B": 51.0,
      "Motor CL": 0.0,
      "Inspection A": 62.0,
      "Inspection C": 57.3,
      "C-Shaft Pin A": 60.5,
      "Welding D line": 21.2,
      "True B": 27.7,
      "Final D  Line": 88.3,
      "Rotor C  line": 98.0
    }
  },
  {
    "date": "2026-08-24",
    "lines": {
      "C-Shaft Body A": 70.7,
      "Cylinder Honing": 77.9,
      "C-Shft Pin B": 87.8,
      "Welding A line": 100.0,
      "Motor H-Series": 96.5,
      "Motor S-Series": 67.2,
      "Motor F-Series": 55.0,
      "Motor WL": 1.0,
      "Rod Pispin": 29.1,
      "Frame Honing FL": 63.9,
      "Press C-Shaft": 77.8,
      "Piston honing FL": 84.5,
      "Welding B line": 62.5,
      "Piston Grinding": 78.4,
      "C-Shaft Pin C": 0.0,
      "Rotor B Line": 64.7,
      "Rotor D  Line": 102.6,
      "Final B Line": 81.5,
      "Final D line": 97.4,
      "Water Line": 79.2,
      "Final A line": 88.5,
      "C-Shaft Body C": 0.0,
      "Final C line": 97.3,
      "Welding C line": 58.5,
      "Inspection B": 62.8,
      "Inspection D": 0.0,
      "C-Shaft Body B": 63.8,
      "Motor CL": 24.4,
      "Inspection A": 61.3,
      "Inspection C": 64.1,
      "C-Shaft Pin A": 41.3,
      "Welding D line": 131.6,
      "True B": 27.7,
      "Final D  Line": 88.3,
      "Rotor C  line": 93.0,
      "Motor AC": 102.2,
      "Rotor A line": 93.9
    }
  },
  {
    "date": "2026-08-25",
    "lines": {
      "C-Shaft Body A": 70.9,
      "Cylinder Honing": 86.7,
      "C-Shft Pin B": 70.6,
      "Welding A line": 87.6,
      "Motor H-Series": 71.3,
      "Motor S-Series": 72.5,
      "Motor F-Series": 97.5,
      "Motor WL": 0.0,
      "Rod Pispin": 28.5,
      "Frame Honing FL": 79.1,
      "Press C-Shaft": 96.1,
      "Piston honing FL": 102.6,
      "Welding B line": 76.8,
      "Piston Grinding": 78.4,
      "C-Shaft Pin C": 0.0,
      "Rotor B Line": 92.1,
      "Rotor D  Line": 67.4,
      "Final B Line": 91.3,
      "Final D line": 74.7,
      "Water Line": 81.9,
      "Final A line": 88.3,
      "C-Shaft Body C": 0.0,
      "Final C line": 93.3,
      "Welding C line": 93.2,
      "Inspection B": 84.2,
      "Inspection D": 0.0,
      "C-Shaft Body B": 69.0,
      "Motor CL": 0.0,
      "Inspection A": 70.9,
      "Inspection C": 60.1,
      "C-Shaft Pin A": 50.6,
      "Welding D line": 80.3,
      "True B": 27.7,
      "Final D  Line": 88.3,
      "Motor AC": 104.4,
      "Rotor A line": 113.6,
      "True C  line": 93.0,
      "Final  D  Line": 93.6,
      "Rotor C  line": 86.7
    }
  },
  {
    "date": "2026-08-26",
    "lines": {
      "Final A line": 91.7,
      "Final B Line": 80.6,
      "Final C line": 91.4,
      "Final D line": 82.2,
      "Motor H-Series": 103.6,
      "Motor S-Series": 109.2,
      "Motor F-Series": 117.3,
      "Motor WL": 0.0,
      "Inspection A": 88.9,
      "Inspection B": 86.1,
      "Inspection C": 50.7,
      "Inspection D": 0.0
    },
    "first_hour": {
      "PRO2·A": 67.0,
      "PRO2·B": 88.3,
      "PRO2·C": 94.6,
      "RPO1·F系列": 92.2,
      "RPO1·H系列": 117.9,
      "RPO1·S系列": 100.0
    }
  },
  {
    "date": "2026-08-27",
    "first_hour": {
      "RPO1·H系列": 102.4,
      "RPO1·S系列": 110.7,
      "RPO1·WL系列": 131.7,
      "PRO2·A": 69.5,
      "PRO2·B": 72.6,
      "PRO2·C": 100.0
    }
  }
];
