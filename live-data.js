/* ═══════════════════════════════════════════════════════════
   live-data.js — 由 tools/ 下脚本定时写入（不要手改，会被覆盖）
   - attendance: 每日各车间出勤（来源: 美的云盘 GAT Attendance）
   - problems:   线体问题点（来源: 桌面Excel, 每2小时同步）
   - __HISTORY__: 每日17:00达成率快照 (来源: data.json, 趋势分析用)
   全量历史归档: history/YYYY-MM-DD.json (产量/UPH/问题点/出勤/达成率)
   最后写入: 2026-09-01 17:10:04
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
      "problem_th": "เครื่อง Slot ยังใช้งานไม่ได้กำลังแก้ไข งานออกไม่ต่อเนื่อง S-series",
      "problem_zh": "Slot机（Slot Machine）仍无法使用，正在修复中，S系列产出不连续。",
      "plan": 150,
      "actual": 112,
      "impact": -38,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "time": "10:00-11:00",
      "problem_th": "เครื่อง Slot ยังใช้งานไม่ได้กำลังแก้ไข เปลี่ยนอะไหล่ใหม่อยู่ S-series",
      "problem_zh": "Slot机（Slot Machine）仍无法使用，正在更换新备件进行修复，S系列。",
      "plan": 169,
      "actual": 102,
      "impact": -67,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "time": "11:00-12:00",
      "problem_th": "เครื่อง Slot ยังใช้งานไม่ได้กำลังแก้ไข",
      "problem_zh": "Slot机还不能用，正在修。",
      "plan": 169,
      "actual": 93,
      "impact": -76,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "RPO1",
      "series": "WL系列",
      "line": "RPO1·WL系列",
      "time": "11:00-12:00",
      "problem_th": "เครื่องSlot no.2 กระบอกสูบแตกpeแก้ใข 30 นาที WL",
      "problem_zh": "Slot No.2 气缸破裂，维修30分钟，WL（工时损失）。",
      "plan": 150,
      "actual": 128,
      "impact": -22,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "RPO1",
      "series": "WL系列",
      "line": "RPO1·WL系列",
      "time": "13:00-14:00",
      "problem_th": "มีStockรอเช็คไฟฟ้า ทำให้งานออกต่อเนื่อง เครื่องSlot no.3น็อตตัวประกอบFlimขาดpeกำลังแก้ WL",
      "problem_zh": "有库存待检电气，作业可连续产出。Slot No.3机台组装Flim的螺母缺失，PE正在处理中。",
      "plan": 150,
      "actual": 393,
      "impact": 243,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "RPO1",
      "series": "WL系列",
      "line": "RPO1·WL系列",
      "time": "14:00-14:50",
      "problem_th": "เครื่องSlot no.3น็อตตัวประกอบFlimขาดpeกำลังแก้",
      "problem_zh": "Slot No.3 设备，Flim 组装工位螺栓缺失，PE 正在修复中。",
      "plan": 144,
      "actual": 36,
      "impact": -108,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "08:00-09:00",
      "problem_th": "เครื่องขัดไม่ทำงานหยุด 08:00-08:50 Slot ยิงออกมาไม่ครบ หยุด 08:24 กำลังแก้ไข เครื่อง เช็คไฟไม่อ่านค่าหยุด 08:26 กำลังแก้ไข F-series",
      "problem_zh": "抛光机不工作，停机08:00-08:50；Slot射出件数不足，08:24停机，正在处理；设备检查时读不到数值，08:26停机，正在处理。F系列。",
      "plan": 141,
      "actual": 82,
      "impact": -59,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "10:00-11:00",
      "problem_th": "Slot ยิงออกมาไม่ครบ หยุด 08:24 กำลังแก้ไข นำพนักงานไปช่วย WL / รื้อNG F-series",
      "problem_zh": "Slot 射出件数不足，08:24停机，正在修复。调员工支援WL线/返工F系列NG品。",
      "plan": 141,
      "actual": 0,
      "impact": -141,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "11:00-12:00",
      "problem_th": "Slot ยิงออกมาไม่ครบ หยุด 08:24 กำลังแก้ไข นำพนักงานไปช่วย WL / รื้อNG สลับเบรค 6 คน F-series",
      "problem_zh": "Slot 射出件数不足，08:24停机，正在修复。抽调6名员工支援WL线/返工NG件，轮换休息，F系列。",
      "plan": 141,
      "actual": 0,
      "impact": -141,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "13:00-14:00",
      "problem_th": "Slot ยิงออกมาไม่ครบ หยุด 08:24 กำลังแก้ไข นำพนักงานไปช่วย WL /  H / ขัดภายใน / Rework",
      "problem_zh": "Slot 射出件数不足，08:24停机，正在修复。已调员工支援WL/H/内壁打磨/Rework。",
      "plan": 141,
      "actual": 0,
      "impact": -141,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "08:00-09:00",
      "problem_th": "พนักงานไม่ครบจุดการทำงาน (หัวหน้าเข้า Support)(-42) เครื่อง Test run ทำงานไม่เสถียร(หัวหน้างาน,IP เข้าแก้ไขแล้ว)(-40) A Line Final",
      "problem_zh": "1. 作业岗位缺员（组长已支援）（-42）\n2. Test run设备运行不稳定（组长、IP已介入处理）（-40）\n3. A线最终组装工序",
      "plan": 431,
      "actual": 349,
      "impact": -82,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "09:00-10:00",
      "problem_th": "air gap check ยาก (-66) A Line Final",
      "problem_zh": "A Line Final工位空气间隙检查困难（-66），作业难度大。",
      "plan": 431,
      "actual": 365,
      "impact": -66,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "10:00-11:00",
      "problem_th": "งานรุ่น EA 50 FMF -UZEL                         ROD สวม Piston แล้ว ฝืดงานออกไม่ต่อเนื่อง (ip pro.4 เข้าตรวจสอบ)(-58) A Line Final",
      "problem_zh": "EA 50 FMF -UZEL 机型：ROD 套入 Piston 后卡滞，作业输出不连续（IP Pro.4 已介入检查）（-58）A Line Final",
      "plan": 359,
      "actual": 301,
      "impact": -58,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "11:00-12:00",
      "problem_th": "KV Line Out  ออกต่อเนื่องงาน(ip,คนจีน เข้าตรวจสอบ)",
      "problem_zh": "KV Line Out 连续出件（IP/中方人员进入检查）",
      "plan": 431,
      "actual": 364,
      "impact": -67,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "08:00-09:00",
      "problem_th": "งานระบายตู้เชื่อม robot ไม่ทัน เนื่องจากจอด เสีย 1 ตู้ ,แก้ไขรอยเชื่อม 1 ตู้",
      "problem_zh": "机器人焊接柜来不及排出，因1台停机故障，1台在修复焊接缺陷。",
      "plan": 470,
      "actual": 400,
      "impact": -70,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "13:00-14:00",
      "problem_th": "รองานจาก rotor line เปลี่ยนรุ่น 2 ครั้ง H/E ต้องเปลี่ยนปะเต็ง",
      "problem_zh": "等待转子线换型2次，热交换器需更换碰焊。",
      "plan": 470,
      "actual": 204,
      "impact": -266,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "14:00-15:00",
      "problem_th": "เปลี่ยนรุ่น H/E ปรับเซ็ตค่าเครื่องจักร",
      "problem_zh": "更换H/E型号，调整设定设备参数。",
      "plan": 470,
      "actual": 319,
      "impact": -151,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "09:00-10:00",
      "problem_th": "เปลี่ยนรุ่น1ครั้ง-30 งานจาก Rotor line มาไม่ต่อเนื่อง stock บนไลน์หมด",
      "problem_zh": "换型1次，Rotor线来料30件不连续，线上库存耗尽。",
      "plan": 444,
      "actual": 369,
      "impact": -75,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "10:00-11:00",
      "problem_th": "เนื่องจากเปลี่ยนรุ่น งานRotor line มาไม่ต่อเนื่อง-72(เร่งทำ stock ใหม่)",
      "problem_zh": "因换型，Rotor线来料不连续-72（正赶制新库存）。",
      "plan": 370,
      "actual": 298,
      "impact": -72,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "11:00-12:00",
      "problem_th": "รุ่น AW6 เครื่อง tast run ทำงานไม่เสถียร",
      "problem_zh": "AW6型号，试运行设备工作不稳定。",
      "plan": 444,
      "actual": 414,
      "impact": -30,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "13:00-14:00",
      "problem_th": "เปลี่ยนรุ่น1ครั้ง",
      "problem_zh": "更换型号1次。",
      "plan": 444,
      "actual": 410,
      "impact": -34,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "14:00-15:00",
      "problem_th": "PE เข้าแก้ไขเครื่องขัน D-COVER ที่ Rotor line งานมาไม่ต่อเนื่อง-48 (แก้ไขแล้ว)",
      "problem_zh": "PE已处理Rotor线D-COVER拧紧机故障，导致作业中断48分钟（已修复）。",
      "plan": 444,
      "actual": 396,
      "impact": -48,
      "shift": "day"
    },
    {
      "date": "2026-09-01",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "15:00-16:00",
      "problem_th": "เปลี่ยนรุ่น1ครั้ง-30 เครื่องขัน D-COVER Rotor line ติดขัดทำงานไม่เสถียร แก้ไขยังไม่หาย-42 (รอ PE เข้าแก้ไขอีกครั้ง)",
      "problem_zh": "换型1次-30台，D-COVER拧紧机在Rotor线卡滞、运行不稳定，修复未果-42（待PE再次介入处理）。",
      "plan": 370,
      "actual": 298,
      "impact": -72,
      "shift": "day"
    }
  ],
  "problems_top": [
    {
      "name": "Slot 射出件数不足，08:24停机，正在修复。调员工支援WL线/返工F系列NG品。",
      "name_th": "Slot ยิงออกมาไม่ครบ หยุด 08:24 กำลังแก้ไข นำพนักงานไปช่วย WL / รื้อNG F-series",
      "lines": [
        "RPO1·F系列"
      ],
      "times": [
        "08:00-09:00",
        "10:00-11:00",
        "11:00-12:00",
        "13:00-14:00"
      ],
      "count": 4,
      "total_impact": -482
    },
    {
      "name": "等待转子线换型2次，热交换器需更换碰焊。",
      "name_th": "รองานจาก rotor line เปลี่ยนรุ่น 2 ครั้ง H/E ต้องเปลี่ยนปะเต็ง",
      "lines": [
        "PRO2·B"
      ],
      "times": [
        "13:00-14:00",
        "14:00-15:00"
      ],
      "count": 2,
      "total_impact": -417
    },
    {
      "name": "Slot机还不能用，正在修。",
      "name_th": "เครื่อง Slot ยังใช้งานไม่ได้กำลังแก้ไข",
      "lines": [
        "RPO1·S系列"
      ],
      "times": [
        "09:00-09:50",
        "10:00-11:00",
        "11:00-12:00"
      ],
      "count": 3,
      "total_impact": -181
    }
  ],
  "first_hour": [
    {
      "date": "2026-09-01",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "target": 141,
      "actual": 82,
      "rate": 58.2
    },
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
      "series": "A",
      "line": "PRO2·A",
      "target": 431,
      "actual": 349,
      "rate": 81.0
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
    },
    "first_hour": {
      "RPO1·F系列": 58.2,
      "RPO1·H系列": 110.1,
      "RPO1·S系列": 110.7,
      "RPO1·WL系列": 124.7,
      "PRO2·A": 81.0,
      "PRO2·B": 85.1,
      "PRO2·C": 64.9
    }
  }
];
