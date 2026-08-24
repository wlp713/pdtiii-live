/* ═══════════════════════════════════════════════════════════
   live-data.js — 由 tools/ 下脚本定时写入（不要手改，会被覆盖）
   - attendance: 每日各车间出勤（来源: 美的云盘 GAT Attendance）
   - problems:   线体问题点（来源: 桌面Excel, 每2小时同步）
   - __HISTORY__: 每日17:00达成率快照 (来源: data.json, 趋势分析用)
   最后写入: 2026-08-24 14:05:12
   ═══════════════════════════════════════════════════════════ */
window.__LIVE_DATA__ = {
  "attendance": null,
  "problems": [
    {
      "date": "2026-08-24",
      "ws": "RPO1",
      "series": "S系列",
      "line": "RPO1·S系列",
      "time": "11:00-12:00",
      "problem_th": "เปลี่ยนรุ่นเข้าL2",
      "problem_zh": "切换型号进入L2线。",
      "plan": 186,
      "actual": 66,
      "impact": -120
    },
    {
      "date": "2026-08-24",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "08:00-09:00",
      "problem_th": "เครื่องm coil ใช้งานไม่ได้กำลังแก้ไข H-series",
      "problem_zh": "H系列m线圈设备故障，正在修复中。",
      "plan": 168,
      "actual": 0,
      "impact": -168
    },
    {
      "date": "2026-08-24",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "10:00-11:00",
      "problem_th": "สลับเบครทำให้งานออกต่อเนื่อง H-series",
      "problem_zh": "H系列换型（换模具）导致作业连续性中断。",
      "plan": 168,
      "actual": 200,
      "impact": 32
    },
    {
      "date": "2026-08-24",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "11:00-12:00",
      "problem_th": "คิ้มหัวสไปร์ติดแก้ไข15นาที",
      "problem_zh": "碰焊头卡滞，修复耗时15分钟。",
      "plan": 168,
      "actual": 123,
      "impact": -45
    },
    {
      "date": "2026-08-24",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "08:00-09:00",
      "problem_th": "เครื่องM-Coilรันออโต้ไม่ได้ เครื่องเย็บตัวจับเชือกไม่ทำงานทำให้งานออกไม่ต่อเนื่อง",
      "problem_zh": "M-Coil设备无法自动运行，捆扎带夹持装置不动作，导致作业中断不连续。",
      "plan": 141,
      "actual": 39,
      "impact": -102
    },
    {
      "date": "2026-08-24",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "10:00-11:00",
      "problem_th": "เครื่องเย็บเย็บขั้นตอนสุดท้ายแล้วไม่เกี่ยวเชือก",
      "problem_zh": "最后一道缝纫工序未穿线。",
      "plan": 141,
      "actual": 84,
      "impact": -57
    },
    {
      "date": "2026-08-24",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "11:00-12:00",
      "problem_th": "เครื่องเย็บลวดตัดเชือกขาดทำใก้งานออกไม่ต่อเนื่อง",
      "problem_zh": "焊丝切断机切绳断裂，导致作业产出不连续。",
      "plan": 141,
      "actual": 86,
      "impact": -55
    },
    {
      "date": "2026-08-24",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "08:00-09:00",
      "problem_th": "เริ่มงาน PE เข้าแก้ไข pop up ยกประเต็งก่อนเข้าตู้เชื่อมใช้งานไม่ได้ (-20) ปรับเซ็ต Robot แก้ไของศา pipe",
      "problem_zh": "PE上班后处理报警：碰焊抬升机构在进入焊接箱前无法动作（-20），已调整机器人设定修复管路角度。",
      "plan": 430,
      "actual": 387,
      "impact": -43
    },
    {
      "date": "2026-08-24",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "09:00-10:00",
      "problem_th": "เครื่องเช็ค KV Alarm บ่อย (-10) PE เข้าตรวจสอบและแก้ไข stopper จุดเชื่อม D Pipe",
      "problem_zh": "KV检测机频繁报警(-10)，PE已介入检查并修复D管焊接点挡块。",
      "plan": 430,
      "actual": 406,
      "impact": -24
    },
    {
      "date": "2026-08-24",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "10:00-11:00",
      "problem_th": "เครื่อง test run สายลมอุดตันและปลั๊กไฟรวน PE เข้าแก้ไข 10:25-10:40",
      "problem_zh": "试运行设备气管堵塞，电源插头接触不良，PE 10:25-10:40 进行维修。",
      "plan": 360,
      "actual": 308,
      "impact": -52
    },
    {
      "date": "2026-08-24",
      "ws": "PRO2",
      "series": "A",
      "line": "PRO2·A",
      "time": "11:00-12:00",
      "problem_th": "เครื่อง test run ปลั๊กไฟรวน PE เข้าแก้ไข (-20) เครื่องเช็ค KV Alarm บ่อย",
      "problem_zh": "试运行设备电源插头接触不良，PE线接入异常（-20），设备KV报警频繁。",
      "plan": 430,
      "actual": 372,
      "impact": -58
    },
    {
      "date": "2026-08-24",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "8:00-9:00",
      "problem_th": "(-127) พนักงานประจำจุดลาจัดพนักงานเสริม งานจึงออกไม่ต่อเนื่อง(-80) เริ่มงานปรับเซ็ทตู้เชื่อม งานทะยอยออก ไม่ได้ตัดงานกอง(-47) B-Line Final",
      "problem_zh": "(-127) 缺人，临时工顶岗，作业不连续。\n(-80) 开班调整焊机设定，工件陆续产出，未积压。\n(-47) B线终检工位。",
      "plan": 470,
      "actual": 353,
      "impact": -117
    },
    {
      "date": "2026-08-24",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "9:00-10:00",
      "problem_th": "(-145) QA หยุดไลน์อบรมพนักวานจุดเช็คเก้ (-65) เปลี่ยนรุ่น KE90HME-YBL(SCP#T) KE90HME-YCL(SCER#T) ปรับเซ็ทเครื่องจักร (-80) B-Line Final",
      "problem_zh": "(-145) QA停线培训检查点员工 (-65) 换型KE90HME-YBL(SCP#T) KE90HME-YCL(SCER#T)，调整设备设定 (-80) B线终检",
      "plan": 470,
      "actual": 325,
      "impact": -145
    },
    {
      "date": "2026-08-24",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "10:00-11:00",
      "problem_th": "(-52) เปลี่ยนรุ่น KE90HME-YCL(SCER#T) PZ99HMC-KCL(SRT#T) ปรับเซ็ทเครื่องจักร(-52) B-Line Final",
      "problem_zh": "(-52) 换型 KE90HME-YCL(SCER#T) → PZ99HMC-KCL(SRT#T)，调整设备设定(-52) B线终检工位。",
      "plan": 390,
      "actual": 338,
      "impact": -52
    },
    {
      "date": "2026-08-24",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "11:00-12:00",
      "problem_th": "(-87) ปรับไฟเชื่อม pipe cover b ใหม่(-50) เครื่องเช็คความต้านทาน Alarm บ่อย (-37) Cal. ปลั๊กใหม่แล้ว",
      "problem_zh": "(-87) 重新调整pipe cover B的焊接电流设定(-50) 电阻检测机频繁报警(-37) 已重新校准插头",
      "plan": 470,
      "actual": 383,
      "impact": -87
    },
    {
      "date": "2026-08-24",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "08:00-09:00",
      "problem_th": "งานติด gap (นำ stock เข้าประกอบช่วย)",
      "problem_zh": "作业卡滞（协助将库存件投入组装）",
      "plan": 444,
      "actual": 443,
      "impact": -1
    },
    {
      "date": "2026-08-24",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "09:00-10:00",
      "problem_th": "lift หัวไลน์โซ่ตก -35 (PE แก้ไขแล้ว)",
      "problem_zh": "升降机链条头脱落 -35线（PE已修复）",
      "plan": 444,
      "actual": 409,
      "impact": -35
    }
  ],
  "problems_top": [
    {
      "name": "H系列m线圈设备故障，正在修复中。",
      "name_th": "เครื่องm coil ใช้งานไม่ได้กำลังแก้ไข H-series",
      "lines": [
        "RPO1·H系列",
        "RPO1·F系列"
      ],
      "times": [
        "08:00-09:00"
      ],
      "count": 2,
      "total_impact": -270
    },
    {
      "name": "(-145) QA停线培训检查点员工 (-65) 换型KE90HME-YBL(SCP#T) KE90HME-YCL(SCER#T)，调整设备设定 (-80) B线终检",
      "name_th": "(-145) QA หยุดไลน์อบรมพนักวานจุดเช็คเก้ (-65) เปลี่ยนรุ่น KE90HME-YBL(SCP#T) KE90HME-YCL(SCER#T) ปรับเซ็ทเครื่องจักร (-8",
      "lines": [
        "PRO2·B"
      ],
      "times": [
        "9:00-10:00",
        "10:00-11:00"
      ],
      "count": 2,
      "total_impact": -197
    },
    {
      "name": "切换型号进入L2线。",
      "name_th": "เปลี่ยนรุ่นเข้าL2",
      "lines": [
        "RPO1·S系列"
      ],
      "times": [
        "11:00-12:00"
      ],
      "count": 1,
      "total_impact": -120
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
  }
];
