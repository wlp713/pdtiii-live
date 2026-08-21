/* ═══════════════════════════════════════════════════════════
   live-data.js — 由 tools/ 下脚本定时写入（不要手改，会被覆盖）
   - attendance: 每日各车间出勤（来源: 美的云盘 GAT Attendance）
   - problems:   线体问题点（来源: 桌面Excel, 每2小时同步）
   - __HISTORY__: 每日17:00达成率快照 (来源: data.json, 趋势分析用)
   最后写入: 2026-08-21 12:05:05
   ═══════════════════════════════════════════════════════════ */
window.__LIVE_DATA__ = {
  "attendance": null,
  "problems": [
    {
      "date": "2026-08-21",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "08:00-09:00",
      "problem_th": "เปิด Slot - ตรวจสอบยกลงเรต เครื่องเย็บเช็อกหลุดบ่อย F-series",
      "problem_zh": "开启Slot工位 - 检查升降下降速率，F系列缝焊机焊丝脱落频繁。",
      "plan": 141,
      "actual": 78,
      "impact": -63
    },
    {
      "date": "2026-08-21",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "08:00-09:00",
      "problem_th": "เริ่มงานจุดเช็ครั่ว DV ปุ่มกดปล่อยงานชำรุด (08:00-08:20) (-100) แก้ไขแล้ว งานระบายตู้เชื่อม robot ไม่ทัน ไม่ได้ตัดลงช่วงแรก เรื่องพนักงานไม่พอ (-20) ได้พนักงาน support แล้ว",
      "problem_zh": "DV泄漏检查点开工，放行按钮损坏（08:00-08:20），扣100分，已修复。机器人焊接柜工件来不及排出，初期未及时切割，因人员不足扣20分，现已安排支援人员。",
      "plan": 470,
      "actual": 350,
      "impact": -120
    },
    {
      "date": "2026-08-21",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "08:00-09:00",
      "problem_th": "งานติด GAP ในช่วงแรก-36 (Pro1 ส่งพนักงานมาจัดทรงหน้าไลน์,ทีมงาน ip เข้าตรวจสอบ)",
      "problem_zh": "前期36工位卡滞GAP问题（Pro1派员到线体前整理，IP团队进场检查）。",
      "plan": 444,
      "actual": 408,
      "impact": -36
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
      "C-Shaft Body A": 88.7,
      "Cylinder Honing": 84.9,
      "C-Shft Pin B": 91.6,
      "Welding A line": 92.6,
      "Motor H-Series": 55.0,
      "Motor S-Series": 93.0,
      "Motor F-Series": 16.7,
      "Motor WL": 0.0,
      "Rod Pispin": 27.2,
      "Frame Honing FL": 101.8,
      "Press C-Shaft": 82.8,
      "Piston honing FL": 87.9,
      "Welding B line": 89.6,
      "Piston Grinding": 86.3,
      "C-Shaft Pin C": 0.0,
      "Motor AC": 46.4,
      "Rotor B Line": 89.0,
      "Rotor D  Line": 87.6,
      "Final B Line": 90.8,
      "Rotor A line": 65.7,
      "Final D line": 86.0,
      "Water Line": 67.4,
      "Final A line": 59.9,
      "Rotor C  line": 96.0,
      "C-Shaft Body C": 0.0,
      "Final C line": 96.2,
      "Welding C line": 88.7,
      "Inspection B": 71.7,
      "Inspection D": 0.0,
      "C-Shaft Body B": 43.9,
      "Motor CL": 0.0,
      "Inspection A": 53.7,
      "Inspection C": 58.3,
      "C-Shaft Pin A": 55.9,
      "Welding D line": 19.3,
      "True B": 27.7,
      "Final D  Line": 88.3
    }
  }
];
