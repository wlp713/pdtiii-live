/* ═══════════════════════════════════════════════════════════
   live-data.js — 由 tools/ 下脚本定时写入（不要手改，会被覆盖）
   - attendance: 每日各车间出勤（来源: 美的云盘 GAT Attendance）
   - problems:   线体问题点（来源: 桌面Excel, 每2小时同步）
   - __HISTORY__: 每日17:00达成率快照 (来源: data.json, 趋势分析用)
   全量历史归档: history/YYYY-MM-DD.json (产量/UPH/问题点/出勤/达成率)
   最后写入: 2026-09-02 17:10:07
   ═══════════════════════════════════════════════════════════ */
window.__LIVE_DATA__ = {
  "attendance": null,
  "problems": [
    {
      "date": "2026-09-02",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "time": "08:00-09:00",
      "problem_th": "เครื่อง INSERT S-coil จานหมุนไม่ตรงทำให้เวบาINSERT แท่งทำให้แท่งง้อ/จานไม่กลับตำแหน่ง PE กำลังแก้ไขตั้งแต่ 08:20น. S -series",
      "problem_zh": "INSERT S-coil机转盘定位不准，导致INSERT杆件时杆件弯曲/转盘不复位。PE自08:20起正在处理。S系列。",
      "plan": 169,
      "actual": 132,
      "impact": -37,
      "shift": "day"
    },
    {
      "date": "2026-09-02",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "time": "09:00-09:50",
      "problem_th": "เครื่อง INSERT S-coil จานหมุนไม่ตรงทำให้เวบาINSERT แท่งทำให้แท่งง้อ/จานไม่กลับตำแหน่ง PE กำลังแก้ไขตั้งแต่ 08:20น.ยังใช้งานไม่ได้ S-series",
      "problem_zh": "INSERT S-coil设备转盘定位不准，导致INSERT杆件时杆件弯曲/转盘无法复位。PE自08:20起正在修复，目前仍无法正常使用。S-series受影响。",
      "plan": 150,
      "actual": 106,
      "impact": -44,
      "shift": "day"
    },
    {
      "date": "2026-09-02",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "time": "10:00-11:00",
      "problem_th": "เครื่อง INSERT S-coil  ยังใช้งานไม่ได้",
      "problem_zh": "INSERT S-coil 设备仍无法使用。",
      "plan": 169,
      "actual": 81,
      "impact": -88,
      "shift": "day"
    },
    {
      "date": "2026-09-02",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "08:00-09:00",
      "problem_th": "สกอร์บอร์ดให้นับยอด หยุด08:00-08:35 รางจุด M Coil ไม่ปล่อยงาน หยุด 08:00-08:34 เครื่อง Slot ตัวโหลดงานไม่ทำงาน หยุด08:00-08:45 เครื่องเย็บฮีตเตอ์ไม่ร้อน หยุด08:00-08:25 F-series",
      "problem_zh": "看板计数，08:00-08:35停机，M点Coil轨道不放料；08:00-08:34停机，Slot机加载机构不动作；08:00-08:45停机，加热器缝焊机不加热；08:00-08:25停机，F系列。",
      "plan": 141,
      "actual": 56,
      "impact": -85,
      "shift": "day"
    },
    {
      "date": "2026-09-02",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "10:00-11:00",
      "problem_th": "เครื่อง Winding  S Coil ไม่ตรงตำแหน่ง หยุด09:12 -10:35 เครื่องเย็บ ฮิตตอร์ขาดหยุด10:58 กำลังแก้ไข F-series",
      "problem_zh": "Winding S Coil定位偏移，09:12-10:35停机；缝焊机加热器损坏，10:58停机，正在修复F系列。",
      "plan": 141,
      "actual": 90,
      "impact": -51,
      "shift": "day"
    },
    {
      "date": "2026-09-02",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "11:00-12:00",
      "problem_th": "เครื่องเย็บNO2 ฮิตตอร์ขาดหยุด10:58 - 11:54 F-series",
      "problem_zh": "NO2缝焊机加热器故障，停机10:58-11:54，F系列。",
      "plan": 141,
      "actual": 66,
      "impact": -75,
      "shift": "day"
    },
    {
      "date": "2026-09-02",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "08:00-09:00",
      "problem_th": "pipe รุ่น S-series จัดทรงยาก หัวหน้าเข้า Support(-47) เครื่องอบ Rotor น้ำหยด(ระหว่างรอ P/E ตัดงานกองก่อนหยอดRotor) ทำให้งานออกFinal ไม่ต่อเนื่อง(-30) IP เข้าแก้ไขเครื่องปรับเซ็ตจิก ขัน Cover B ให้ตรงตำแหน่ง(-30) A Line Final",
      "problem_zh": "S系列管路整形困难，班长支援(-47)。Rotor烘干机滴水（等待P/E期间积压工件未投Rotor），导致Final出件不连续(-30)。IP介入调整定位夹具，将Cover B拧紧至正确位置(-30)。A线Final。",
      "plan": 431,
      "actual": 324,
      "impact": -107,
      "shift": "day"
    },
    {
      "date": "2026-09-02",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "09:00-10:00",
      "problem_th": "ราง Conveyor จุดใส่ Low ประเต็งติดขัด (PE เข้าแก้ไขแล้ว)(-28) เครื่อง TDC ไม่อ่านค่า งานทยอยเข้าตู้ Cooling ต้องหยุดรออุณหภูมิ(-40) A Line Final",
      "problem_zh": "Conveyor轨道Low工位碰焊卡滞（PE已处理）（-28）；TDC设备读不到数值，工件陆续进入Cooling柜，需停机等待温度（-40）；A线Final。",
      "plan": 431,
      "actual": 363,
      "impact": -68,
      "shift": "day"
    },
    {
      "date": "2026-09-02",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "10:00-11:00",
      "problem_th": "เครื่องเช็ค KV&MΩ Alarm บ่อย (IP กำลังเข้าตรวจสอบ)(-59) A Line Final",
      "problem_zh": "KV&MΩ检测机频繁报警（IP正在排查中）（-59）A线最终检测工位",
      "plan": 359,
      "actual": 300,
      "impact": -59,
      "shift": "day"
    },
    {
      "date": "2026-09-02",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "11:00-12:00",
      "problem_th": "เครื่องเช็ค KV&MΩ Alarm บ่อย line Out ต่อเนื่อง(IP และคนจีนกำลังเข้าแก้ไข)",
      "problem_zh": "KV&MΩ检测机频繁报警，Out线连续报警（IP及中方人员正在处理中）。",
      "plan": 431,
      "actual": 367,
      "impact": -64,
      "shift": "day"
    },
    {
      "date": "2026-09-02",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "08:00-09:00",
      "problem_th": "เปลี่ยนรุ่น2ครั้ง",
      "problem_zh": "换型2次。",
      "plan": 444,
      "actual": 402,
      "impact": -42,
      "shift": "day"
    },
    {
      "date": "2026-09-02",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "09:00-10:00",
      "problem_th": "เครื่องความต้านทาน ALARM ค่าไม่นิ่งบ่อย",
      "problem_zh": "电阻检测设备频繁报警，阻值读数不稳定。",
      "plan": 444,
      "actual": 427,
      "impact": -17,
      "shift": "day"
    },
    {
      "date": "2026-09-02",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "10:00-11:00",
      "problem_th": "เปลี่ยนรุ่น1ครั้ง-30 Pe เข้าแก้ไขเครื่องความต้านทาน-51(แก้ไขแล้วยังไม่หาย)",
      "problem_zh": "换型1次-30台，电阻测试机-51故障维修（已修但未恢复）",
      "plan": 370,
      "actual": 289,
      "impact": -81,
      "shift": "day"
    },
    {
      "date": "2026-09-02",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "11:00-12:00",
      "problem_th": "เครื่องความต้านทานเสีย ใช้งานไม่ได้ pe หยุดเครื่องแก้ไข",
      "problem_zh": "电阻检测设备故障，无法使用，PE线导致设备停机维修。",
      "plan": 444,
      "actual": 184,
      "impact": -260,
      "shift": "day"
    }
  ],
  "problems_top": [
    {
      "name": "电阻检测设备故障，无法使用，PE线导致设备停机维修。",
      "name_th": "เครื่องความต้านทานเสีย ใช้งานไม่ได้ pe หยุดเครื่องแก้ไข",
      "lines": [
        "PRO2·C"
      ],
      "times": [
        "09:00-10:00",
        "10:00-11:00",
        "11:00-12:00"
      ],
      "count": 3,
      "total_impact": -358
    },
    {
      "name": "INSERT S-coil 设备仍无法使用。",
      "name_th": "เครื่อง INSERT S-coil  ยังใช้งานไม่ได้",
      "lines": [
        "RPO1·S系列"
      ],
      "times": [
        "08:00-09:00",
        "09:00-09:50",
        "10:00-11:00"
      ],
      "count": 3,
      "total_impact": -169
    },
    {
      "name": "NO2缝焊机加热器故障，停机10:58-11:54，F系列。",
      "name_th": "เครื่องเย็บNO2 ฮิตตอร์ขาดหยุด10:58 - 11:54 F-series",
      "lines": [
        "RPO1·F系列"
      ],
      "times": [
        "10:00-11:00",
        "11:00-12:00"
      ],
      "count": 2,
      "total_impact": -126
    }
  ],
  "first_hour": [
    {
      "date": "2026-09-02",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "target": 141,
      "actual": 56,
      "rate": 39.7
    },
    {
      "date": "2026-09-02",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "target": 168,
      "actual": 187,
      "rate": 111.3
    },
    {
      "date": "2026-09-02",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "target": 169,
      "actual": 132,
      "rate": 78.1
    },
    {
      "date": "2026-09-02",
      "ws": "RPO1",
      "series": "WL系列",
      "line": "RPO1·WL系列",
      "target": 150,
      "actual": 166,
      "rate": 110.7
    },
    {
      "date": "2026-09-02",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "target": 431,
      "actual": 324,
      "rate": 75.2
    },
    {
      "date": "2026-09-02",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "target": 444,
      "actual": 402,
      "rate": 90.5
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
      "PRO2·C": 90.5
    }
  }
];
