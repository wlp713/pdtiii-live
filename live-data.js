/* ═══════════════════════════════════════════════════════════
   live-data.js — 由 tools/ 下脚本定时写入（不要手改，会被覆盖）
   - attendance: 每日各车间出勤（来源: 美的云盘 GAT Attendance）
   - problems:   线体问题点（来源: 桌面Excel, 每2小时同步）
   - __HISTORY__: 每日17:00达成率快照 (来源: data.json, 趋势分析用)
   最后写入: 2026-08-21 17:05:16
   ═══════════════════════════════════════════════════════════ */
window.__LIVE_DATA__ = {
  "attendance": null,
  "problems": [
    {
      "date": "2026-08-21",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "time": "11:00-12:00",
      "problem_th": "เปลี่ยนรุ่นหัวไลน์FZ35L02>FZ35L01 /สายหลีดBK41440010 ไม่สามารถใช้ได้เปียกน้ำ ไลน์หยุดคลิ้ม-ท้ายไลน์ ทำStock s-coil ยกลงรถ นำงานReward มาทำงานออกไม่ต่อเนื่อง S-series",
      "problem_zh": "换线：机头型号FZ35L02→FZ35L01，BK41440010送料线（สายหลีด）沾水后无法使用，导致线体停机。线头至线尾需做S型线圈库存，吊装上下车。返工件（Reward）投入生产，产出不连续，S系列受影响。",
      "plan": 186,
      "actual": 113,
      "impact": -73
    },
    {
      "date": "2026-08-21",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "time": "13:00-14:00",
      "problem_th": "รอสายหลีด15นาทีนำงานRewarมาทำงานออกไม่ต่อเนื่อ S-series",
      "problem_zh": "等待送料线15分钟，拿Rewar工件来生产，产出不连续，S系列。",
      "plan": 186,
      "actual": 121,
      "impact": -65
    },
    {
      "date": "2026-08-21",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "08:00-09:00",
      "problem_th": "คนจีนได้ทำการทดสอบฟิล์ม ที่เครื่อง In sert M-coil ทำให้งานออกไม่ต่อเนื่อง H-series",
      "problem_zh": "中国人在In sert M-coil机台测试薄膜，导致H-series作业不连续。",
      "plan": 168,
      "actual": 131,
      "impact": -37
    },
    {
      "date": "2026-08-21",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "09:00-09:50",
      "problem_th": "ทดสอบฟิล์มหัวไลน์ ไม่มี wip M-coil งานออกท้ายไปลน์ช้า และไม่ต่อเนื่อง H-series",
      "problem_zh": "线头测试膜片，无M-coil在制品，线尾出件慢且不连续，H系列。",
      "plan": 144,
      "actual": 103,
      "impact": -41
    },
    {
      "date": "2026-08-21",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "10:00-11:00",
      "problem_th": "เปลี่ยนรุ่นการผลิต EZ80H1Y  งานบนไลน์ไม่มี รองานจากจุด M-coil และยังมีการทดสอบ ฟิล์ม1เครื่อง งานออกช้า H-series",
      "problem_zh": "生产换型EZ80H1Y，线上无在制，等待M-coil来料。另需测试1台薄膜机，出件慢，影响H系列产出。",
      "plan": 168,
      "actual": 73,
      "impact": -95
    },
    {
      "date": "2026-08-21",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "11:00-12:00",
      "problem_th": "เปลี่ยนรุ่นการผลิต จุด S-coil และปรับเซ็ตเครื่องจักร รองานออกท้ายไลน์",
      "problem_zh": "换型生产，调整S-coil位置并重新设定设备参数，等待线尾出件。",
      "plan": 168,
      "actual": 0,
      "impact": -168
    },
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
      "problem_zh": "DV泄漏检查点开工，放行按钮损坏（08:00-08:20）（-100）已修复。机器人焊接柜工件来不及排出，初期未切割，人员不足（-20），已安排支援人员。",
      "plan": 470,
      "actual": 350,
      "impact": -120
    },
    {
      "date": "2026-08-21",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "11:00-12:00",
      "problem_th": "รองานจากตู้ cooling ทำความเย็นไม่ทัน ผลกระทบจากเครื่อง TDC ไม่อ่านค่า ยกงานลง (-31) ติดตาม",
      "problem_zh": "等待冷却柜制冷不及时，受TDC设备读不到数值影响，工件下线(-31)，持续跟进。",
      "plan": 470,
      "actual": 439,
      "impact": -31
    },
    {
      "date": "2026-08-21",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "13:00-14:00",
      "problem_th": ". : -10 หัวขัน bolt muf cover b ลงไม่ตรง ทำให้เครื่อง alarm (-10) แก้ไขปรับเซ็ตตำแหน่งใหม่",
      "problem_zh": ". : -10 螺栓MUF盖板B拧入不正，导致设备报警(-10)，已重新调整位置设定。",
      "plan": null,
      "actual": null,
      "impact": null
    },
    {
      "date": "2026-08-21",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "08:00-09:00",
      "problem_th": "งานติด GAP ในช่วงแรก-36 (Pro1 ส่งพนักงานมาจัดทรงหน้าไลน์,ทีมงาน ip เข้าตรวจสอบ)",
      "problem_zh": "前期-36工位卡滞GAP问题（Pro1派员到线体前整理，IP团队进场检查）。",
      "plan": 444,
      "actual": 408,
      "impact": -36
    },
    {
      "date": "2026-08-21",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "10:00-11:00",
      "problem_th": "ตู้ coolling ติดขัด นำ stock เข้าประกอบ(PE กำลังเข้าแก้ไข)",
      "problem_zh": "冷却柜卡滞，库存件流入组装（PE正在处理中）。",
      "plan": 370,
      "actual": 397,
      "impact": 27
    },
    {
      "date": "2026-08-21",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "14:00-15:00",
      "problem_th": "งานติด GAP ทำให้ stock หมด",
      "problem_zh": "作业卡在GAP工序，导致库存耗尽。",
      "plan": 444,
      "actual": 433,
      "impact": -11
    }
  ],
  "problems_top": [
    {
      "name": "生产换型EZ80H1Y，线上无在制，等待M-coil来料。另需测试1台薄膜机，出件慢，影响H系列产出。",
      "name_th": "เปลี่ยนรุ่นการผลิต EZ80H1Y  งานบนไลน์ไม่มี รองานจากจุด M-coil และยังมีการทดสอบ ฟิล์ม1เครื่อง งานออกช้า H-series",
      "lines": [
        "RPO1·H系列"
      ],
      "times": [
        "08:00-09:00",
        "09:00-09:50",
        "10:00-11:00"
      ],
      "count": 3,
      "total_impact": -173
    },
    {
      "name": "换型生产，调整S-coil位置并重新设定设备参数，等待线尾出件。",
      "name_th": "เปลี่ยนรุ่นการผลิต จุด S-coil และปรับเซ็ตเครื่องจักร รองานออกท้ายไลน์",
      "lines": [
        "RPO1·H系列"
      ],
      "times": [
        "11:00-12:00"
      ],
      "count": 1,
      "total_impact": -168
    },
    {
      "name": "换线：机头型号FZ35L02→FZ35L01，BK41440010送料线（สายหลีด）沾水后无法使用，导致线体停机。线头至线尾需做S型线圈库存，吊装上下车。返工件（Reward）投入生产，产出不连续，S系列受影响。",
      "name_th": "เปลี่ยนรุ่นหัวไลน์FZ35L02>FZ35L01 /สายหลีดBK41440010 ไม่สามารถใช้ได้เปียกน้ำ ไลน์หยุดคลิ้ม-ท้ายไลน์ ทำStock s-coil ยกลงร",
      "lines": [
        "RPO1·S系列"
      ],
      "times": [
        "11:00-12:00",
        "13:00-14:00"
      ],
      "count": 2,
      "total_impact": -138
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
