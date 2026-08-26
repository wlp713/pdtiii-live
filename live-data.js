/* ═══════════════════════════════════════════════════════════
   live-data.js — 由 tools/ 下脚本定时写入（不要手改，会被覆盖）
   - attendance: 每日各车间出勤（来源: 美的云盘 GAT Attendance）
   - problems:   线体问题点（来源: 桌面Excel, 每2小时同步）
   - __HISTORY__: 每日17:00达成率快照 (来源: data.json, 趋势分析用)
   最后写入: 2026-08-26 10:10:11
   ═══════════════════════════════════════════════════════════ */
window.__LIVE_DATA__ = {
  "attendance": null,
  "problems": [
    {
      "date": "2026-08-26",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "08:00-09:00",
      "problem_th": "มีstock wip ท้ายทำให้งานออกต่อเนื่อง H-series",
      "problem_zh": "H系列尾端有WIP库存，保证作业连续产出。",
      "plan": 168,
      "actual": 198,
      "impact": 30
    },
    {
      "date": "2026-08-26",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "08:00-09:00",
      "problem_th": "เครื่องเช็คไฟนับงานNGด้วยยอดไม่ตรงกับ สกอร์บอร์ด เครื่องM Coil Winding สปิงขาด หยุด08:00-08:47 F-series",
      "problem_zh": "M线绕线机NG计数与看板不一致，弹簧断裂，停机08:00-08:47，F系列。",
      "plan": 141,
      "actual": 130,
      "impact": -11
    },
    {
      "date": "2026-08-26",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "08:00-09:00",
      "problem_th": "เริ่มงานตู้เชื่อมใช้งานได้ 4 ตู้ ทะยอยตัดงานกองรอเชื่อม (-22) ผลกระทบ Rotor Line เครื่องมือMicro jig.สำหรับวัดค่าCrankcase.สึกหรอ ส่งผลกระทบทำให้การวัดค่าชิ้นงานไม่ดี ส่งผลกระทบทำให้เกิดงานNG IPเข้าตรวจสอบ ระหว่างรอ Final นำคอมขึ้นเชื่อม(-120) เครื่องเช็ค KV Alarm บ่อย ยกลง 20 set",
      "problem_zh": "焊接柜启动4台可用，逐步切割积压待焊件（-22件），影响Rotor线。Micro jig量具（测Crankcase用）磨损，导致测量不准，产生NG件，IP介入检查。等待Final期间，将压缩机上焊接（-120件），KV检测机频繁报警，已下架20套。",
      "plan": 417,
      "actual": 288,
      "impact": -129
    },
    {
      "date": "2026-08-26",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "8:00-9:00",
      "problem_th": "(-55) นำงานเร่งส่งรุ่น SZ40F1E-9KBL ขึ้นเชื่อม และตัดงานที่ผลิตลง ต้องปรับเซ็ทตู้เชื่อม",
      "problem_zh": "(-55) 紧急订单SZ40F1E-9KBL需优先焊接，减少常规产量，必须调整焊机设定。",
      "plan": 470,
      "actual": 415,
      "impact": -55
    },
    {
      "date": "2026-08-26",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "08:00-09:00",
      "problem_th": "งานรั่ว DV เครื่องเช็คซ้ำบ่อย",
      "problem_zh": "DV工序作业泄漏，设备频繁复检。",
      "plan": 444,
      "actual": 420,
      "impact": -24
    }
  ],
  "problems_top": [
    {
      "name": "焊接柜启动4台可用，逐步切割积压待焊件（-22件），影响Rotor线。Micro jig量具（测Crankcase用）磨损，导致测量不准，产生NG件，IP介入检查。等待Final期间，将压缩机上焊接（-120件），KV检测机频繁报警，已下架",
      "name_th": "เริ่มงานตู้เชื่อมใช้งานได้ 4 ตู้ ทะยอยตัดงานกองรอเชื่อม (-22) ผลกระทบ Rotor Line เครื่องมือMicro jig.สำหรับวัดค่าCrankca",
      "lines": [
        "PRO2·A"
      ],
      "times": [
        "08:00-09:00"
      ],
      "count": 1,
      "total_impact": -129
    },
    {
      "name": "(-55) 紧急订单SZ40F1E-9KBL需优先焊接，减少常规产量，必须调整焊机设定。",
      "name_th": "(-55) นำงานเร่งส่งรุ่น SZ40F1E-9KBL ขึ้นเชื่อม และตัดงานที่ผลิตลง ต้องปรับเซ็ทตู้เชื่อม",
      "lines": [
        "PRO2·B"
      ],
      "times": [
        "8:00-9:00"
      ],
      "count": 1,
      "total_impact": -55
    },
    {
      "name": "H系列尾端有WIP库存，保证作业连续产出。",
      "name_th": "มีstock wip ท้ายทำให้งานออกต่อเนื่อง H-series",
      "lines": [
        "RPO1·H系列"
      ],
      "times": [
        "08:00-09:00"
      ],
      "count": 1,
      "total_impact": 30
    }
  ],
  "first_hour": [
    {
      "date": "2026-08-26",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "target": 141,
      "actual": 130,
      "rate": 92.2
    },
    {
      "date": "2026-08-26",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "target": 168,
      "actual": 198,
      "rate": 117.9
    },
    {
      "date": "2026-08-26",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "target": 186,
      "actual": 186,
      "rate": 100.0
    },
    {
      "date": "2026-08-26",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "target": 417,
      "actual": 288,
      "rate": 69.1
    },
    {
      "date": "2026-08-26",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "target": 470,
      "actual": 415,
      "rate": 88.3
    },
    {
      "date": "2026-08-26",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "target": 444,
      "actual": 420,
      "rate": 94.6
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
    },
    "first_hour": {
      "RPO1·F系列": 114.9,
      "RPO1·H系列": 104.2,
      "RPO1·S系列": 91.9,
      "PRO2·A": 84.7,
      "PRO2·B": 91.5,
      "PRO2·C": 99.8
    }
  },
  {
    "date": "2026-08-26",
    "first_hour": {
      "RPO1·F系列": 92.2,
      "RPO1·H系列": 117.9,
      "RPO1·S系列": 100.0,
      "PRO2·A": 69.1,
      "PRO2·B": 88.3,
      "PRO2·C": 94.6
    }
  }
];
