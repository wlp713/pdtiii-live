/* ═══════════════════════════════════════════════════════════
   live-data.js — 由 tools/ 下脚本定时写入（不要手改，会被覆盖）
   - attendance: 每日各车间出勤（来源: 美的云盘 GAT Attendance）
   - problems:   线体问题点（来源: 桌面Excel, 每2小时同步）
   - __HISTORY__: 每日17:00达成率快照 (来源: data.json, 趋势分析用)
   最后写入: 2026-08-21 11:05:09
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
      "problem_zh": "DV泄漏检查点开工时，放行按钮损坏（08:00-08:20）（-100）已修复。机器人焊接柜工件来不及排出，首段未切割，人员不足（-20），已安排支援人员。",
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
      "problem_zh": "前期-36工位卡滞GAP问题（Pro1派人到线体前整理，IP团队进场检查）。",
      "plan": 444,
      "actual": 408,
      "impact": -36
    }
  ]
};

window.__HISTORY__ = [
  {
    "date": "2026-08-21",
    "lines": {
      "C-Shaft Body A": 90.7,
      "Cylinder Honing": 97.6,
      "C-Shft Pin B": 91.2,
      "Welding A line": 81.6,
      "Motor H-Series": 71.8,
      "Motor S-Series": 95.3,
      "Motor F-Series": 28.5,
      "Motor WL": 0.0,
      "Rod Pispin": 21.2,
      "Frame Honing FL": 69.3,
      "Press C-Shaft": 53.9,
      "Piston honing FL": 81.0,
      "Welding B line": 77.6,
      "Piston Grinding": 84.6,
      "C-Shaft Pin C": 0.0,
      "Motor AC": 23.2,
      "Rotor B Line": 90.2,
      "Rotor D  Line": 92.3,
      "Final B Line": 88.5,
      "Rotor A line": 83.0,
      "Final D line": 86.6,
      "Water Line": 56.4,
      "Final A line": 86.6,
      "Rotor C  line": 94.2,
      "C-Shaft Body C": 0.0,
      "Final C line": 94.7,
      "Welding C line": 90.6,
      "Inspection B": 71.9,
      "Inspection D": 0.0,
      "C-Shaft Body B": 40.3,
      "Motor CL": 0.0,
      "Inspection A": 61.8,
      "Inspection C": 60.5,
      "C-Shaft Pin A": 44.8,
      "Welding D line": 29.8,
      "True B": 27.7,
      "Final D  Line": 88.3,
      "Final B LinShaft Pin A": 44.8
    }
  }
];
