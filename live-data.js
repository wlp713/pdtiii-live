/* ═══════════════════════════════════════════════════════════
   live-data.js — 由 tools/ 下脚本定时写入（不要手改，会被覆盖）
   - attendance: 每日各车间出勤（来源: 美的云盘 GAT Attendance）
   - problems:   线体问题点（来源: 桌面Excel, 每2小时同步）
   - __HISTORY__: 每日17:00达成率快照 (来源: data.json, 趋势分析用)
   最后写入: 2026-09-03 15:10:20
   ═══════════════════════════════════════════════════════════ */
window.__LIVE_DATA__ = {
  "attendance": null,
  "problems": [
    {
      "date": "2026-09-03",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "time": "10:00-11:00",
      "problem_th": "งานNG ออกจำนวนมาก S-series",
      "problem_zh": "S系列NG件大量流出。",
      "plan": 169,
      "actual": 115,
      "impact": -54,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "time": "11:00-12:00",
      "problem_th": "งานNG ออกต่อเนื่อง S-series",
      "problem_zh": "S系列NG件连续流出。",
      "plan": 169,
      "actual": 131,
      "impact": -38,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "time": "13:00-14:00",
      "problem_th": "เครื่องเย็บNo.2 ไม่เสถียร เย็บงานไม่หมด PE/IP กำลังแก้ไข งานออกไม่ต่อเนื่อง S-series",
      "problem_zh": "2号缝焊机不稳定，焊接不完整，PE/IP正在修复中，S系列产出不连续。",
      "plan": 169,
      "actual": 81,
      "impact": -88,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "08:00-09:00",
      "problem_th": "เครื่องเย็บNO2 ฮีตเตอร์ขาด หยุด08:00 กำลังแก้ไข F-series",
      "problem_zh": "NO2碰焊机加热器损坏，08:00停机，正在修复F系列。",
      "plan": 141,
      "actual": 146,
      "impact": 5,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "10:00-11:00",
      "problem_th": "M Coil Winding NO 4-5 ลวดรั้งกันข้างใน หยุด 09:36 PEกำลังแก้ไข F-series",
      "problem_zh": "M线圈绕线机4-5号线材在内部互相拉扯卡滞，09:36停机，PE正在修复F系列。",
      "plan": 141,
      "actual": 132,
      "impact": -9,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "11:00-12:00",
      "problem_th": "Insert M Coil ทำลวดขาด หยุด 11:39กำลังแก้ไข F-series",
      "problem_zh": "Insert M Coil 断线，11:39停机，正在修复F系列。",
      "plan": 141,
      "actual": 106,
      "impact": -35,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "13:00-14:00",
      "problem_th": ": Insert M Coil ทำลวดขาด หยุด 11:39กำลังแก้ไข นำพนักงานไปช่วย ขัดภายใน / H / Rework Stator",
      "problem_zh": "Insert M Coil工位焊丝断裂，11:39停机，正在修复。已调员工支援内部打磨/H线/Rework定子。",
      "plan": 141,
      "actual": 13,
      "impact": -128,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "08:00-09:00",
      "problem_th": "พนักงานไม่มาทำงาน 4 คน -10 stopper จุดเช็คเก้ไม่ทำงาน -15 PE แก้ไขแล้ว เครื่องเช็ค KV Alarm - 25 นำงานเก่าเข้าผลิต ติดตามการทำงานของเครื่อง A Line Final",
      "problem_zh": "缺勤4人 -10 stopper；检具点失效 -15 PE已修复；KV检测机报警 -25 将旧工件投入生产，跟进A线Final设备运行。",
      "plan": 431,
      "actual": 382,
      "impact": -49,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "09:00-10:00",
      "problem_th": "เครื่องเช็ค KV Alarm - 17 นำงานเก่าเข้าผลิต ติดตามการทำงานของเครื่อง A Line Final",
      "problem_zh": "KV检测机报警 - 17，混入旧工件生产，跟进A线终检设备运行情况。",
      "plan": 431,
      "actual": 414,
      "impact": -17,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "10:00-11:00",
      "problem_th": "Air gap NG A Line Final",
      "problem_zh": "Air gap NG A Line Final",
      "plan": 359,
      "actual": 263,
      "impact": -96,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "11:00-12:00",
      "problem_th": "จากปัญหางาน Air gap ทำให้ต้องสลับเบรค",
      "problem_zh": "因气隙问题导致需切换制动器。",
      "plan": 431,
      "actual": 156,
      "impact": -275,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "08:00-09:00",
      "problem_th": "รองานจาก rotor line ผลกระทบจากงาน air gap line out",
      "problem_zh": "等待转子线来料，受气隙线停产影响。",
      "plan": 470,
      "actual": 426,
      "impact": -44,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "09:00-10:00",
      "problem_th": "air gap line out ต่อเนื่อง (-56) ลวดเชื่อมพันกัน ตัดแล้วใส่ใหม่ (-31) แก้ไขแล้ว",
      "problem_zh": "气隙线连续报警（-56），焊丝缠绕打结，已剪断并更换新焊丝（-31），已修复。",
      "plan": 470,
      "actual": 383,
      "impact": -87,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "10:00-11:00",
      "problem_th": "air gap line out (-39) dv leak line out (-10) เปลี่ยนรุ่นตามแผน FZ75HMH-JYBL EZ65H1X-UQCL ปรับเซ็ตค่าเครื่องจักร",
      "problem_zh": "air gap线外（-39），dv泄漏线外（-10）。按计划换型FZ75HMH-JYBL、EZ65H1X-UQCL，调整设定设备参数。",
      "plan": 390,
      "actual": 261,
      "impact": -129,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "11:00-12:00",
      "problem_th": "dv leak line out",
      "problem_zh": "dv leak line out",
      "plan": 470,
      "actual": 461,
      "impact": -9,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "13:00-14:00",
      "problem_th": "รองานจาก rotor line ผลกระทบจาก เครื่องวาง MUF COVER A ไม่ตรง ทำให้งานขาดความต่อเนื่อง",
      "problem_zh": "待料于转子线，受MUF COVER A放置机定位不准影响，作业连续性中断。",
      "plan": 470,
      "actual": 444,
      "impact": -26,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "08:00-09:00",
      "problem_th": "เครื่องมาร์ค sales ไม่ทำงาน-30 (แก้ไขแล้ว) งานออกค่าเมคกาโอม เครื่องเช็คซ้ำบ่อย-36 (แจ้ง QA แล้วรอตรวจสอบ)",
      "problem_zh": "1. 打标机（Sales）不工作-30号机（已修复），作业需做兆欧表绝缘电阻检测。\n2. 复检机频繁报警-36号机（已通知QA，待检查确认）。",
      "plan": 443,
      "actual": 377,
      "impact": -66,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "10:00-11:00",
      "problem_th": "เปลี่ยนรุ่น1ครั้ง จาก A series > E SERIES",
      "problem_zh": "换型1次，从A系列改为E系列。",
      "plan": 379,
      "actual": 306,
      "impact": -73,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "11:00-12:00",
      "problem_th": "งาน gap ยาก-40 งานมาไม่ต่อเนื่อง ตู้ coolling ทำงานติดขัด-70 (PE กำลังแก้ไข)",
      "problem_zh": "作业gap难-40，来料不连续；冷却柜运行卡滞-70（PE正在修复中）。",
      "plan": 444,
      "actual": 334,
      "impact": -110,
      "shift": "day"
    },
    {
      "date": "2026-09-03",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "13:00-14:00",
      "problem_th": "ต่อเนื่องจาก ตู้ coolling ติดขัด ทำให้ stock ระหว่างไลน์หมด-40 งาน gap ยากงานออกไม่ต่อเนื่อง-70 (IP เข้าตรวจสอบหน้างานและPRO1 ส่งพนักงานมากระแทกยังไม่ดีขึ้น)",
      "problem_zh": "冷却柜卡滞，导致线间库存耗尽-40件；作业间隙大，产出不连续-70件（IP已到现场检查，PRO1派员敲击处理，未见好转）。",
      "plan": 444,
      "actual": 334,
      "impact": -110,
      "shift": "day"
    }
  ],
  "problems_top": [
    {
      "name": "因气隙问题导致需切换制动器。",
      "name_th": "จากปัญหางาน Air gap ทำให้ต้องสลับเบรค",
      "lines": [
        "PRO2·A"
      ],
      "times": [
        "10:00-11:00",
        "11:00-12:00"
      ],
      "count": 2,
      "total_impact": -371
    },
    {
      "name": "作业gap难-40，来料不连续；冷却柜运行卡滞-70（PE正在修复中）。",
      "name_th": "งาน gap ยาก-40 งานมาไม่ต่อเนื่อง ตู้ coolling ทำงานติดขัด-70 (PE กำลังแก้ไข)",
      "lines": [
        "PRO2·C"
      ],
      "times": [
        "11:00-12:00",
        "13:00-14:00"
      ],
      "count": 2,
      "total_impact": -220
    },
    {
      "name": "Insert M Coil工位焊丝断裂，11:39停机，正在修复。已调员工支援内部打磨/H线/Rework定子。",
      "name_th": ": Insert M Coil ทำลวดขาด หยุด 11:39กำลังแก้ไข นำพนักงานไปช่วย ขัดภายใน / H / Rework Stator",
      "lines": [
        "RPO1·F系列"
      ],
      "times": [
        "11:00-12:00",
        "13:00-14:00"
      ],
      "count": 2,
      "total_impact": -163
    }
  ],
  "first_hour": [
    {
      "date": "2026-09-03",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "target": 141,
      "actual": 146,
      "rate": 103.5
    },
    {
      "date": "2026-09-03",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "target": 168,
      "actual": 187,
      "rate": 111.3
    },
    {
      "date": "2026-09-03",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "target": 169,
      "actual": 192,
      "rate": 113.6
    },
    {
      "date": "2026-09-03",
      "ws": "RPO1",
      "series": "WL系列",
      "line": "RPO1·WL系列",
      "target": 150,
      "actual": 183,
      "rate": 122.0
    },
    {
      "date": "2026-09-03",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "target": 431,
      "actual": 382,
      "rate": 88.6
    },
    {
      "date": "2026-09-03",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "target": 470,
      "actual": 426,
      "rate": 90.6
    },
    {
      "date": "2026-09-03",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "target": 443,
      "actual": 377,
      "rate": 85.1
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
    "lines": {
      "Final A line": 80.7,
      "Final B Line": 86.2,
      "Final C line": 80.5,
      "Final D line": 98.8,
      "Motor H-Series": 101.7,
      "Motor S-Series": 59.8,
      "Motor F-Series": 7.8,
      "Motor WL": 111.9,
      "Inspection A": 49.7,
      "Inspection B": 61.0,
      "Inspection C": 77.9,
      "Inspection D": 17.5
    }
  },
  {
    "date": "2026-09-02",
    "lines": {
      "Final A line": 88.5,
      "Final B Line": 92.3,
      "Final C line": 71.4,
      "Final D line": 91.7,
      "Motor H-Series": 102.0,
      "Motor S-Series": 31.7,
      "Motor F-Series": 81.0,
      "Motor WL": 80.5,
      "Inspection A": 61.1,
      "Inspection B": 65.0,
      "Inspection C": 85.6,
      "Inspection D": 19.5,
      "C-Shaft Body A": 77.3,
      "C-Shaft Body B": 66.0,
      "C-Shaft Pin A": 71.4,
      "C-Shaft Pin C": 0.0,
      "C-Shft Pin B": 17.4,
      "Cylinder Honing": 105.8,
      "Frame Honing FL": 95.5,
      "Piston Grinding": 93.0,
      "Piston honing FL": 83.4,
      "Press C-Shaft": 79.1,
      "Rod Pispin": 73.6,
      "Water Line": 76.0,
      "Motor AC": 2.8,
      "Motor CL": 99.1,
      "Rotor A line": 51.3,
      "Rotor B Line": 94.6,
      "Rotor C line": 68.2,
      "Rotor D Line": 99.4,
      "Welding A line": 70.8,
      "Welding B line": 83.1,
      "Welding C line": 65.3,
      "Welding D line": 80.9
    },
    "first_hour": {
      "RPO1·F系列": 39.7,
      "RPO1·H系列": 111.3,
      "RPO1·S系列": 78.1,
      "RPO1·WL系列": 110.7,
      "PRO2·A": 75.2,
      "PRO2·B": 93.8,
      "PRO2·C": 90.5
    }
  },
  {
    "date": "2026-09-03",
    "first_hour": {
      "RPO1·F系列": 103.5,
      "RPO1·H系列": 111.3,
      "RPO1·S系列": 113.6,
      "RPO1·WL系列": 122.0,
      "PRO2·A": 88.6,
      "PRO2·B": 90.6,
      "PRO2·C": 85.1
    }
  }
];
