/* ═══════════════════════════════════════════════════════════
   live-data.js — 由 tools/ 下脚本定时写入（不要手改，会被覆盖）
   - attendance: 每日各车间出勤（来源: 美的云盘 GAT Attendance）
   - problems:   线体问题点（来源: 桌面Excel, 每2小时同步）
   - __HISTORY__: 每日17:00达成率快照 (来源: data.json, 趋势分析用)
   最后写入: 2026-08-28 15:40:20
   ═══════════════════════════════════════════════════════════ */
window.__LIVE_DATA__ = {
  "attendance": null,
  "problems": [
    {
      "date": "2026-08-28",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "08:00-09:00",
      "problem_th": "มีstock wip ท้ายทำให้งานออกต่อเนื่อง H-series",
      "problem_zh": "WIP库存不足，导致H系列产出连续性受影响。",
      "plan": 168,
      "actual": 175,
      "impact": 7
    },
    {
      "date": "2026-08-28",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "09:00-10:00",
      "problem_th": "เครื่องจักร H-series",
      "problem_zh": "H系列设备",
      "plan": 144,
      "actual": 145,
      "impact": 1
    },
    {
      "date": "2026-08-28",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "08:00-09:00",
      "problem_th": "ผลกระทบ Rotor Line งานรุ่น SZ59F1E-9YEL ฝืดและสะดุดออกอย่างต่อเนื่อง ทำให้งานทะยอยออกตู้ Cooling",
      "problem_zh": "Rotor Line 生产 SZ59F1E-9YEL 型号时，工件卡滞且连续停顿，导致 Cooling 柜出货延误。",
      "plan": 430,
      "actual": 375,
      "impact": -55
    },
    {
      "date": "2026-08-28",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "09:00-10:00",
      "problem_th": "ผลกระทบ Rotor Line เครื่องประกอบวาล์วออโต้ Bolt.ไม่ลงหัวหน้างานแก้ไขเเล้ว ทำให้งานทะยอยออกตู้ Cooling",
      "problem_zh": "Rotor Line 自动阀组装机螺栓拧不进去，主管已处理，导致冷却柜产品陆续流出。",
      "plan": 430,
      "actual": 369,
      "impact": -61
    },
    {
      "date": "2026-08-28",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "11:00-12:00",
      "problem_th": "งานติด Air gap เช็คยาก",
      "problem_zh": "Air gap装配作业，检查困难。",
      "plan": 430,
      "actual": 283,
      "impact": -147
    },
    {
      "date": "2026-08-28",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "14:00-15:00",
      "problem_th": "งานติด Air gap เช็คยาก",
      "problem_zh": "Air gap装配作业，检查困难。",
      "plan": 430,
      "actual": 393,
      "impact": -37
    },
    {
      "date": "2026-08-28",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "8:00-9:00",
      "problem_th": "(-28) เครื่องเช็คความต้านทาน Alarm บ่อย (-28) cal. ปลั๊กใหม่แล้ว B-Line Final",
      "problem_zh": "(-28) 绝缘电阻检测机频繁报警，已更换新插头并校准，B线最终检测工位。",
      "plan": 470,
      "actual": 442,
      "impact": -28
    },
    {
      "date": "2026-08-28",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "9:00-10:00",
      "problem_th": "(-36) ตู้เชื่อม #3 ใช้งานไม่ได้ทำให้งานระบายออกไม่ต่อเนื่อง (-20) ทะยอยตัดงานกองก่อนเชื่อม ลิฟท์หัวไลน์ Final ไม่ทำงาน (-20) หัวหน้างานแก้ไขแล้ว sensor ไม่ on B-Line Final",
      "problem_zh": "(-36) 焊接机#3故障，导致工件排出不连续\n(-20) 碰焊前工件堆积，需分批切割处理；Final线首端升降机不动作\n(-20) 班组长已处理，B线Final传感器不感应",
      "plan": 470,
      "actual": 434,
      "impact": -36
    },
    {
      "date": "2026-08-28",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "10:00-11:00",
      "problem_th": "(-34) งานติด Air Gab ทำให้งานมาไม่ต่อเนื่อง(-20) Pro.1 ส่งพนักงานมาจัดทรง Stator ก่อนเข้าประกอบแล้ว ตู้เชื่อม#3 ยังใช้งานไม่ได้ ทะยอยตัดงานก่อนเชื่อม(-20) B-Line Final",
      "problem_zh": "(-34) 装Air Gab作业导致来料不连续(-20) Pro.1已派员工在组装前整理Stator外形，碰焊柜#3仍无法使用，碰焊前需逐步切料(-20) B线终检",
      "plan": 390,
      "actual": 356,
      "impact": -34
    },
    {
      "date": "2026-08-28",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "11:00-12:00",
      "problem_th": "(-80) งานติด Air Gab ทำให้งานมาไม่ต่อเนื่อง(-40) Pro.1 ส่งพนักงานมาจัดทรง Stator ก่อนเข้าประกอบ ตู้เชื่อม#3 ยังใช้งานไม่ได้ ทะยอยตัดงานก่อนเชื่อม(-40) Line Final",
      "problem_zh": "(-80) 装Air Gab的作业导致来料不连续；(-40) Pro.1派员工整理Stator后再组装，碰焊柜#3仍无法使用，需在焊接前分批切割作业；(-40) Final线。",
      "plan": 470,
      "actual": 390,
      "impact": -80
    },
    {
      "date": "2026-08-28",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "13:00-14:00",
      "problem_th": "(-60) เครื่องเช็คความต้านทานAlramเนื่องจากหัวเช็คเข้าไม่ตรงทำการปรับระยะ (-25) ตู้เชื่อม#3 ยังใช้งานไม่ได้ ทะยอยตัดงานก่อนเชื่อม(-35) B-Line Final",
      "problem_zh": "(-60) 电阻检测机报警，检测头未对准，已调整间距。(-25) 3号焊机仍无法使用，先分批切料再焊接。(-35) B线最终工位。",
      "plan": 470,
      "actual": 410,
      "impact": -60
    },
    {
      "date": "2026-08-28",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "14:00-15:00",
      "problem_th": "(-70) ตู้เชื่อม#3 ยังใช้งานไม่ได้ ทะยอยตัดงานก่อนเชื่อม(-40) งานจาก Line Rotor มาไม่ต่อเนื่องตู้ Cooling ลดอุณหภูมิงานเย็นไม่ทัน",
      "problem_zh": "(-70) 碰焊机#3仍无法使用，焊接前作业需逐步裁减。\n(-40) Rotor线来料不连续，冷却柜降温来不及，工件冷却不足。",
      "plan": 470,
      "actual": 400,
      "impact": -70
    },
    {
      "date": "2026-08-28",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "08:00-09:00",
      "problem_th": "เครื่องขัน COVER B เสีย-74 ( PE หยุดเครื่องเพื่อแก้ไข) ระหว่างแก้ไขให้พนักงานช่วยขันแน่นแทนชั่วคราว",
      "problem_zh": "COVER B拧紧机故障-74（PE停机维修），维修期间临时安排员工手动拧紧。",
      "plan": 444,
      "actual": 370,
      "impact": -74
    },
    {
      "date": "2026-08-28",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "09:00-10:00",
      "problem_th": "ต่อเนื่องจาก ชม.1 แก้ไขเครื่องขัน COVER B-22 (แก้ไขแล้ว)",
      "problem_zh": "接1班，COVER B-22拧紧机已修复（修复完成）。",
      "plan": 444,
      "actual": 422,
      "impact": -22
    },
    {
      "date": "2026-08-28",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "14:00-15:00",
      "problem_th": "งานติด gap มาไม่ต่อเนื่อง stock ระหว่างไลน์น้อย",
      "problem_zh": "碰焊工序来料不连续，线边库存不足。",
      "plan": 444,
      "actual": 425,
      "impact": -19
    }
  ],
  "problems_top": [
    {
      "name": "Air gap装配作业，检查困难。",
      "name_th": "งานติด Air gap เช็คยาก",
      "lines": [
        "PRO2·A"
      ],
      "times": [
        "11:00-12:00",
        "14:00-15:00"
      ],
      "count": 2,
      "total_impact": -184
    },
    {
      "name": "(-80) 装Air Gab的作业导致来料不连续；(-40) Pro.1派员工整理Stator后再组装，碰焊柜#3仍无法使用，需在焊接前分批切割作业；(-40) Final线。",
      "name_th": "(-80) งานติด Air Gab ทำให้งานมาไม่ต่อเนื่อง(-40) Pro.1 ส่งพนักงานมาจัดทรง Stator ก่อนเข้าประกอบ ตู้เชื่อม#3 ยังใช้งานไม่",
      "lines": [
        "PRO2·B"
      ],
      "times": [
        "10:00-11:00",
        "11:00-12:00"
      ],
      "count": 2,
      "total_impact": -114
    },
    {
      "name": "COVER B拧紧机故障-74（PE停机维修），维修期间临时安排员工手动拧紧。",
      "name_th": "เครื่องขัน COVER B เสีย-74 ( PE หยุดเครื่องเพื่อแก้ไข) ระหว่างแก้ไขให้พนักงานช่วยขันแน่นแทนชั่วคราว",
      "lines": [
        "PRO2·C"
      ],
      "times": [
        "08:00-09:00",
        "09:00-10:00"
      ],
      "count": 2,
      "total_impact": -96
    }
  ],
  "first_hour": [
    {
      "date": "2026-08-28",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "target": 168,
      "actual": 175,
      "rate": 104.2
    },
    {
      "date": "2026-08-28",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "target": 150,
      "actual": 124,
      "rate": 82.7
    },
    {
      "date": "2026-08-28",
      "ws": "RPO1",
      "series": "WL系列",
      "line": "RPO1·WL系列",
      "target": 145,
      "actual": 236,
      "rate": 162.8
    },
    {
      "date": "2026-08-28",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "target": 430,
      "actual": 375,
      "rate": 87.2
    },
    {
      "date": "2026-08-28",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "target": 470,
      "actual": 442,
      "rate": 94.0
    },
    {
      "date": "2026-08-28",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "target": 444,
      "actual": 370,
      "rate": 83.3
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
    }
  },
  {
    "date": "2026-08-27",
    "lines": {
      "Final A line": 80.6,
      "Final B Line": 71.6,
      "Final C line": 97.1,
      "Final D line": 101.9,
      "Motor H-Series": 89.8,
      "Motor S-Series": 84.9,
      "Motor F-Series": 0.7,
      "Motor WL": 114.0,
      "Inspection A": 71.5,
      "Inspection B": 89.2,
      "Inspection C": 65.1,
      "Inspection D": 0.1
    },
    "first_hour": {
      "RPO1·H系列": 102.4,
      "RPO1·S系列": 110.7,
      "RPO1·WL系列": 131.7,
      "PRO2·A": 69.5,
      "PRO2·B": 72.6,
      "PRO2·C": 100.0
    }
  },
  {
    "date": "2026-08-28",
    "first_hour": {
      "RPO1·H系列": 104.2,
      "RPO1·S系列": 82.7,
      "RPO1·WL系列": 162.8,
      "PRO2·A": 87.2,
      "PRO2·B": 94.0,
      "PRO2·C": 83.3
    }
  }
];
