/* ═══════════════════════════════════════════════════════════
   live-data.js — 由 tools/ 下脚本定时写入（不要手改，会被覆盖）
   - attendance: 每日各车间出勤（来源: 美的云盘 GAT Attendance）
   - problems:   线体问题点（来源: 桌面Excel, 每2小时同步）
   - __HISTORY__: 每日17:00达成率快照 (来源: data.json, 趋势分析用)
   最后写入: 2026-08-25 11:10:09
   ═══════════════════════════════════════════════════════════ */
window.__LIVE_DATA__ = {
  "attendance": null,
  "problems": [
    {
      "date": "2026-08-25",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "08:00-09:00",
      "problem_th": "ซ้อมงานที่ออกจาก m coil (มีwipท้ายไลค์ทำให้งานออกต่อเนื่อง H-series",
      "problem_zh": "M coil下线作业练习（线尾有WIP积压，导致H系列产品连续下线）",
      "plan": 168,
      "actual": 175,
      "impact": 7
    },
    {
      "date": "2026-08-25",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "10:00-11:00",
      "problem_th": "ซ้อมงานที่ออกจากเครื่องm coilทำให้งานออกไม่ต่อเนื่อง",
      "problem_zh": "M coil出料口作业不熟练，导致产出不连续。",
      "plan": 168,
      "actual": 139,
      "impact": -29
    },
    {
      "date": "2026-08-25",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "08:00-09:00",
      "problem_th": "เครื่องเพรสท้ายไลรันออโต้ไม่ได้แก้ไข20นาที หยุดเครื่องเพรสท้ายไลเพื่อถอดตัวนับยอดไปติดที่เครื่องเช็คไฟทำให้ไม่มียอดออกท้ายไล",
      "problem_zh": "末线压机自动运行无法修复，停机20分钟。为拆计数器装到检电设备上，末线压机停机，导致末线无产量输出。",
      "plan": 141,
      "actual": 162,
      "impact": 21
    },
    {
      "date": "2026-08-25",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "08:00-09:00",
      "problem_th": "A line Rotor line. Piston.รุ่นSZ40F1E-9KBL. งานไม่ตรงกลุ่ม แก้ไขเบื้องต้นเปลี่ยนกลุ่มCRANKCASE. และขอPiston.ให้ตรงกับกลุ่มงาน",
      "problem_zh": "Rotor线，Piston，型号SZ40F1E-9KBL。作业与组别不匹配，初步处理为更换CRANKCASE组别，并要求Piston与作业组别对应。",
      "plan": 433,
      "actual": 400,
      "impact": -33
    },
    {
      "date": "2026-08-25",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "8:00-9:00",
      "problem_th": "(-40) งานรั่ว DV= 22 set(-22) เครื่อง Test Run หัวที่ 1 ปลั๊กไม่ตรง ทำให้เครื่อง Alarm บ่อย (-20) ตั้งระดับใหม่แล้ว B-Line Final",
      "problem_zh": "(-40) 泄漏工件 DV=22 套(-22) 1号头Test Run时插头不对位，导致设备频繁报警(-20) 已重新设定等级，B线Final",
      "plan": 470,
      "actual": 430,
      "impact": -40
    },
    {
      "date": "2026-08-25",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "9:00-10:00",
      "problem_th": "(+1) B-Line Final",
      "problem_zh": "(+1) B-Line Final",
      "plan": 470,
      "actual": 471,
      "impact": 1
    },
    {
      "date": "2026-08-25",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "10:00-11:00",
      "problem_th": "(-14) งานรั่ว DV= 30 set",
      "problem_zh": "(-14) 工件泄漏，DV=30设定",
      "plan": 390,
      "actual": 376,
      "impact": -14
    }
  ],
  "problems_top": [
    {
      "name": "(-40) 泄漏工件 DV=22 套(-22) 1号头Test Run时插头不对位，导致设备频繁报警(-20) 已重新设定等级，B线Final",
      "name_th": "(-40) งานรั่ว DV= 22 set(-22) เครื่อง Test Run หัวที่ 1 ปลั๊กไม่ตรง ทำให้เครื่อง Alarm บ่อย (-20) ตั้งระดับใหม่แล้ว B-Li",
      "lines": [
        "PRO2·B"
      ],
      "times": [
        "8:00-9:00",
        "10:00-11:00"
      ],
      "count": 2,
      "total_impact": -54
    },
    {
      "name": "Rotor线，Piston，型号SZ40F1E-9KBL。作业与组别不匹配，初步处理为更换CRANKCASE组别，并要求Piston与作业组别对应。",
      "name_th": "A line Rotor line. Piston.รุ่นSZ40F1E-9KBL. งานไม่ตรงกลุ่ม แก้ไขเบื้องต้นเปลี่ยนกลุ่มCRANKCASE. และขอPiston.ให้ตรงกับกลุ",
      "lines": [
        "PRO2·A"
      ],
      "times": [
        "08:00-09:00"
      ],
      "count": 1,
      "total_impact": -33
    },
    {
      "name": "M coil出料口作业不熟练，导致产出不连续。",
      "name_th": "ซ้อมงานที่ออกจากเครื่องm coilทำให้งานออกไม่ต่อเนื่อง",
      "lines": [
        "RPO1·H系列"
      ],
      "times": [
        "08:00-09:00",
        "10:00-11:00"
      ],
      "count": 2,
      "total_impact": -22
    }
  ],
  "first_hour": [
    {
      "date": "2026-08-25",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "target": 141,
      "actual": 162,
      "rate": 114.9
    },
    {
      "date": "2026-08-25",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "target": 168,
      "actual": 175,
      "rate": 104.2
    },
    {
      "date": "2026-08-25",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "target": 186,
      "actual": 171,
      "rate": 91.9
    },
    {
      "date": "2026-08-25",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "target": 433,
      "actual": 400,
      "rate": 92.4
    },
    {
      "date": "2026-08-25",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "target": 470,
      "actual": 430,
      "rate": 91.5
    },
    {
      "date": "2026-08-25",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "target": 444,
      "actual": 443,
      "rate": 99.8
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
    "first_hour": {
      "RPO1·F系列": 114.9,
      "RPO1·H系列": 104.2,
      "RPO1·S系列": 91.9,
      "PRO2·A": 92.4,
      "PRO2·B": 91.5,
      "PRO2·C": 99.8
    }
  }
];
