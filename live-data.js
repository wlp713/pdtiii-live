/* ═══════════════════════════════════════════════════════════
   live-data.js — 由 tools/ 下脚本定时写入（不要手改，会被覆盖）
   - attendance: 每日各车间出勤（来源: 美的云盘 GAT Attendance）
   - problems:   线体问题点（来源: 桌面Excel, 每2小时同步）
   - __HISTORY__: 每日17:00达成率快照 (来源: data.json, 趋势分析用)
   最后写入: 2026-08-25 14:40:20
   ═══════════════════════════════════════════════════════════ */
window.__LIVE_DATA__ = {
  "attendance": null,
  "problems": [
    {
      "date": "2026-08-25",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "time": "11:00-12:00",
      "problem_th": "เครื่องเย็บเสียทำไห้ไลน์หยุดงานNGออกจำนวนมากงานออกไม่ต่อเนื่อง S-series",
      "problem_zh": "设备故障导致S系列线体停机，NG品大量流出，作业连续性中断。",
      "plan": 186,
      "actual": 64,
      "impact": -122
    },
    {
      "date": "2026-08-25",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "08:00-09:00",
      "problem_th": "ซ้อมงานที่ออกจาก m coil (มีwipท้ายไลค์ทำให้งานออกต่อเนื่อง H-series",
      "problem_zh": "M coil下线作业练习（线尾有WIP，H系列可连续出件）",
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
      "problem_th": "ซ้อมงานที่ออกจากเครื่องm coilทำให้งานออกไม่ต่อเนื่อง H-series",
      "problem_zh": "H系列m coil出料卡滞，导致作业连续性中断。",
      "plan": 168,
      "actual": 139,
      "impact": -29
    },
    {
      "date": "2026-08-25",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "11:00-12:00",
      "problem_th": "ซ้อมงานที่ออกจากเครื่องm coilทำให้งานออกไม่ต่อเนื่อง H-series",
      "problem_zh": "H系列m coil出料碰伤，导致作业连续性中断。",
      "plan": 168,
      "actual": 113,
      "impact": -55
    },
    {
      "date": "2026-08-25",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "13:00-14:00",
      "problem_th": "ซ้อมงานที่ออกจากเครื่องm coilทำให้งานออกไม่ต่อเนื่อง",
      "problem_zh": "M coil出料口作业不熟练，导致产出不连续。",
      "plan": 168,
      "actual": 93,
      "impact": -75
    },
    {
      "date": "2026-08-25",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "08:00-09:00",
      "problem_th": "เครื่องเพรสท้ายไลรันออโต้ไม่ได้แก้ไข20นาที หยุดเครื่องเพรสท้ายไลเพื่อถอดตัวนับยอดไปติดที่เครื่องเช็คไฟทำให้ไม่มียอดออกท้ายไล",
      "problem_zh": "末线自动压机故障未修复，停机20分钟。为拆计数器装到检电测机，末线压机停机，导致末线无产量输出。",
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
      "problem_th": "PEและIP เข้าแก้ไขหมุดยกประเต็งเครื่อง test run (-20) ผลกระทบ Rotor Line  Piston.รุ่นSZ40F1E-9KBL. งานไม่ตรงกลุ่ม แก้ไขเบื้องต้นเปลี่ยนกลุ่มCRANKCASE. และขอPiston.ให้ตรงกับกลุ่มงาน ทำให้ลดอุณหภูมิ Rotor ไม่ทัน งานทะยอยออก Final",
      "problem_zh": "PE和IP已介入处理test run（-20）碰焊抬升销问题，影响Rotor Line Piston，型号SZ40F1E-9KBL。工件与工位不匹配，初步对策为更换CRANKCASE工位，并要求Piston与工位对应，导致Rotor降温来不及，工件陆续流出至Final。",
      "plan": 430,
      "actual": 364,
      "impact": -66
    },
    {
      "date": "2026-08-25",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "11:00-12:00",
      "problem_th": "PE เข้าแก้ไขเครื่องอบ Rotor ช๊อตงาน",
      "problem_zh": "PE进入维修Rotor烘干机，导致停线。",
      "plan": 430,
      "actual": 415,
      "impact": -15
    },
    {
      "date": "2026-08-25",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "13:00-14:00",
      "problem_th": "เปลี่ยนรุ่นการผลิต 2 ครั้ง",
      "problem_zh": "生产换型2次。",
      "plan": 430,
      "actual": 230,
      "impact": -200
    },
    {
      "date": "2026-08-25",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "8:00-9:00",
      "problem_th": "(-40) งานรั่ว DV= 22 set(-22) เครื่อง Test Run หัวที่ 1 ปลั๊กไม่ตรง ทำให้เครื่อง Alarm บ่อย (-20) ตั้งระดับใหม่แล้ว B-Line Final",
      "problem_zh": "(-40) 泄漏工件 DV=22台(-22) 1号头Test Run时插头不对位，导致设备频繁报警(-20) 已重新设定级别，B线Final",
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
      "problem_th": "(-14) งานรั่ว DV= 30 set(-30) B-Line Final",
      "problem_zh": "(-14) 泄漏作业 DV=30 设定(-30) B线最终检查",
      "plan": 390,
      "actual": 376,
      "impact": -14
    },
    {
      "date": "2026-08-25",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "11:00-12:00",
      "problem_th": "(-47) เครื่อง TDC ไม่อ่านค่าบ่อย งานทะยอยเข้าตู้ Coolling ลดอุณหภูมิไม่ทัน งานจึงมาไม่ต่อเนื่อง (-25) ไลน์ Conveyer ดับ เนื่องจากเบรคเกอร์ทริป (-25) B-Line Final",
      "problem_zh": "(-47) TDC设备读数频繁失效，工件陆续进入冷却柜，降温来不及，导致供料不连续。\n(-25) Conveyer线断电，因断路器跳闸。\n(-25) B线Final工位。",
      "plan": 470,
      "actual": 423,
      "impact": -47
    },
    {
      "date": "2026-08-25",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "13:00-14:00",
      "problem_th": "(-33) ลิฟท์หัวไลน์ไม่ทำงาน เนื่องจาก sensor ไม่ on",
      "problem_zh": "线头升降机不动作，因传感器未触发。",
      "plan": 470,
      "actual": 437,
      "impact": -33
    },
    {
      "date": "2026-08-25",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "11:00-12:00",
      "problem_th": "เครื่องความต้านทานเสีย ทำให้งานมาไม่ต่อเนื่อง stock หมด-18 (PE แก้ไขแล้ว)",
      "problem_zh": "电阻测试仪故障，导致作业不连续，库存耗尽-18（PE已修复）。",
      "plan": 444,
      "actual": 425,
      "impact": -19
    },
    {
      "date": "2026-08-25",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "13:00-14:00",
      "problem_th": "ต่อเนื่องจาก ชม.4 stock บนไลน์หมด",
      "problem_zh": "继4点班后，线上库存耗尽。",
      "plan": 444,
      "actual": 428,
      "impact": -16
    }
  ],
  "problems_top": [
    {
      "name": "生产换型2次。",
      "name_th": "เปลี่ยนรุ่นการผลิต 2 ครั้ง",
      "lines": [
        "PRO2·A"
      ],
      "times": [
        "13:00-14:00"
      ],
      "count": 1,
      "total_impact": -200
    },
    {
      "name": "M coil出料口作业不熟练，导致产出不连续。",
      "name_th": "ซ้อมงานที่ออกจากเครื่องm coilทำให้งานออกไม่ต่อเนื่อง",
      "lines": [
        "RPO1·H系列"
      ],
      "times": [
        "08:00-09:00",
        "10:00-11:00",
        "11:00-12:00",
        "13:00-14:00"
      ],
      "count": 4,
      "total_impact": -152
    },
    {
      "name": "设备故障导致S系列线体停机，NG品大量流出，作业连续性中断。",
      "name_th": "เครื่องเย็บเสียทำไห้ไลน์หยุดงานNGออกจำนวนมากงานออกไม่ต่อเนื่อง S-series",
      "lines": [
        "RPO1·S系列"
      ],
      "times": [
        "11:00-12:00"
      ],
      "count": 1,
      "total_impact": -122
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
      "target": 430,
      "actual": 364,
      "rate": 84.7
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
      "PRO2·A": 84.7,
      "PRO2·B": 91.5,
      "PRO2·C": 99.8
    }
  }
];
