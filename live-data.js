/* ═══════════════════════════════════════════════════════════
   live-data.js — 由 tools/ 下脚本定时写入（不要手改，会被覆盖）
   - attendance: 每日各车间出勤（来源: 美的云盘 GAT Attendance）
   - problems:   线体问题点（来源: 桌面Excel, 每2小时同步）
   - __HISTORY__: 每日17:00达成率快照 (来源: data.json, 趋势分析用)
   最后写入: 2026-09-01 10:20:04
   ═══════════════════════════════════════════════════════════ */
window.__LIVE_DATA__ = {
  "attendance": null,
  "problems": [
    {
      "date": "2026-09-01",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "time": "09:00-09:50",
      "problem_th": "เครื่อง Slot ยังใช้งานไม่ได้กำลังแก้ไข งานออกไม่ต่อเนื่อง",
      "problem_zh": "Slot机（Slot Machine）仍无法使用，正在维修中，导致作业产出不连续。",
      "plan": 150,
      "actual": 112,
      "impact": -38,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "08:00-09:00",
      "problem_th": "งานระบายตู้เชื่อม robot ไม่ทัน เนื่องจากจอด เสีย 1 ตู้ ,แก้ไขรอยเชื่อม 1 ตู้",
      "problem_zh": "机器人焊接柜来不及排出：1台故障停机，1台返修焊痕。",
      "plan": 470,
      "actual": 400,
      "impact": -70,
      "shift": "day"
    }
  ],
  "problems_top": [
    {
      "name": "机器人焊接柜来不及排出：1台故障停机，1台返修焊痕。",
      "name_th": "งานระบายตู้เชื่อม robot ไม่ทัน เนื่องจากจอด เสีย 1 ตู้ ,แก้ไขรอยเชื่อม 1 ตู้",
      "lines": [
        "PRO2·B"
      ],
      "times": [
        "08:00-09:00"
      ],
      "count": 1,
      "total_impact": -70
    },
    {
      "name": "Slot机（Slot Machine）仍无法使用，正在维修中，导致作业产出不连续。",
      "name_th": "เครื่อง Slot ยังใช้งานไม่ได้กำลังแก้ไข งานออกไม่ต่อเนื่อง",
      "lines": [
        "RPO1·S系列"
      ],
      "times": [
        "09:00-09:50"
      ],
      "count": 1,
      "total_impact": -38
    }
  ],
  "first_hour": [
    {
      "date": "2026-09-01",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "target": 168,
      "actual": 185,
      "rate": 110.1
    },
    {
      "date": "2026-09-01",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "target": 169,
      "actual": 187,
      "rate": 110.7
    },
    {
      "date": "2026-09-01",
      "ws": "RPO1",
      "series": "WL系列",
      "line": "RPO1·WL系列",
      "target": 150,
      "actual": 187,
      "rate": 124.7
    },
    {
      "date": "2026-09-01",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "target": 470,
      "actual": 400,
      "rate": 85.1
    },
    {
      "date": "2026-09-01",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "target": 444,
      "actual": 288,
      "rate": 64.9
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
    }
  },
  {
    "date": "2026-08-28",
    "lines": {
      "Final A line": 93.5,
      "Final B Line": 86.2,
      "Final C line": 91.4,
      "Final D line": 100.4,
      "Motor H-Series": 87.4,
      "Motor S-Series": 87.3,
      "Motor F-Series": 0.0,
      "Motor WL": 138.2,
      "Inspection A": 72.0,
      "Inspection B": 75.8,
      "Inspection C": 77.3,
      "Inspection D": 1.1
    }
  },
  {
    "date": "2026-08-29",
    "lines": {
      "Final A line": 77.2,
      "Final B Line": 71.8,
      "Final C line": 0.0,
      "Final D line": 0.0,
      "Motor H-Series": 0.0,
      "Motor S-Series": 0.0,
      "Motor F-Series": 0.0,
      "Motor WL": 0.0,
      "Inspection A": 31.2,
      "Inspection B": 77.4,
      "Inspection C": 71.0,
      "Inspection D": 0.0
    }
  },
  {
    "date": "2026-08-30",
    "lines": {
      "Final A line": 0.0,
      "Final B Line": 0.1,
      "Final C line": 0.0,
      "Final D line": 0.0,
      "Motor H-Series": 0.0,
      "Motor S-Series": 0.0,
      "Motor F-Series": 0.0,
      "Motor WL": 0.0,
      "Inspection A": 46.8,
      "Inspection B": 15.5,
      "Inspection C": 69.7,
      "Inspection D": 0.0
    }
  },
  {
    "date": "2026-09-01",
    "first_hour": {
      "RPO1·H系列": 110.1,
      "RPO1·S系列": 110.7,
      "RPO1·WL系列": 124.7,
      "PRO2·B": 85.1,
      "PRO2·C": 64.9
    }
  }
];
