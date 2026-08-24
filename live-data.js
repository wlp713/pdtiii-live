/* ═══════════════════════════════════════════════════════════
   live-data.js — 由 tools/ 下脚本定时写入（不要手改，会被覆盖）
   - attendance: 每日各车间出勤（来源: 美的云盘 GAT Attendance）
   - problems:   线体问题点（来源: 桌面Excel, 每2小时同步）
   - __HISTORY__: 每日17:00达成率快照 (来源: data.json, 趋势分析用)
   最后写入: 2026-08-24 10:33:42
   ═══════════════════════════════════════════════════════════ */
window.__LIVE_DATA__ = {
  "attendance": null,
  "problems": [
    {
      "date": "2026-08-24",
      "ws": "RPO1",
      "series": "H系列",
      "line": "RPO1·H系列",
      "time": "08:00-09:00",
      "problem_th": "เครื่องm coil ใช้งานไม่ได้กำลังแก้ไข",
      "problem_zh": "M线圈设备无法使用，正在修复中。",
      "plan": 168,
      "actual": 0,
      "impact": -168
    },
    {
      "date": "2026-08-24",
      "ws": "RPO1",
      "series": "F系列",
      "line": "RPO1·F系列",
      "time": "08:00-09:00",
      "problem_th": "เครื่องM-Coilรันออโต้ไม่ได้ เครื่องเย็บตัวจับเชือกไม่ทำงานทำให้งานออกไม่ต่อเนื่อง",
      "problem_zh": "M-Coil设备无法自动运行，扎带固定机构不动作，导致作业中断不连续。",
      "plan": 141,
      "actual": 39,
      "impact": -102
    },
    {
      "date": "2026-08-24",
      "ws": "PRO2",
      "series": "B",
      "line": "PRO2·B",
      "time": "8:00-9:00",
      "problem_th": "(-127) พนักงานประจำจุดลาจัดพนักงานเสริม งานจึงออกไม่ต่อเนื่อง(-80) เริ่มงานปรับเซ็ทตู้เชื่อม งานทะยอยออก ไม่ได้ตัดงานกอง(-47) B-Line Final",
      "problem_zh": "(-127) 缺人，临时工顶岗，作业不连续。\n(-80) 开班调整焊机设定，工件陆续产出，未积压。\n(-47) B线最终组装。",
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
      "problem_th": "(-145) QA หยุดไลน์อบรมพนักวานจุดเช็คเก้ (-65) เปลี่ยนรุ่น KE90HME-YBL(SCP#T) KE90HME-YCL(SCER#T) ปรับเซ็ทเครื่องจักร",
      "problem_zh": "(-145) QA停线培训员工检查点作业 (-65) 换型KE90HME-YBL(SCP#T) KE90HME-YCL(SCER#T)，调整设备设定",
      "plan": 470,
      "actual": 325,
      "impact": -145
    },
    {
      "date": "2026-08-24",
      "ws": "PRO2",
      "series": "C",
      "line": "PRO2·C",
      "time": "08:00-09:00",
      "problem_th": "งานติด gap (นำ stock เข้าประกอบช่วย)",
      "problem_zh": "作业卡滞（协助将库存件送入组装）",
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
      "name": "M线圈设备无法使用，正在修复中。",
      "name_th": "เครื่องm coil ใช้งานไม่ได้กำลังแก้ไข",
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
      "name": "(-145) QA停线培训员工检查点作业 (-65) 换型KE90HME-YBL(SCP#T) KE90HME-YCL(SCER#T)，调整设备设定",
      "name_th": "(-145) QA หยุดไลน์อบรมพนักวานจุดเช็คเก้ (-65) เปลี่ยนรุ่น KE90HME-YBL(SCP#T) KE90HME-YCL(SCER#T) ปรับเซ็ทเครื่องจักร",
      "lines": [
        "PRO2·B"
      ],
      "times": [
        "9:00-10:00"
      ],
      "count": 1,
      "total_impact": -145
    },
    {
      "name": "(-127) 缺人，临时工顶岗，作业不连续。\n(-80) 开班调整焊机设定，工件陆续产出，未积压。\n(-47) B线最终组装。",
      "name_th": "(-127) พนักงานประจำจุดลาจัดพนักงานเสริม งานจึงออกไม่ต่อเนื่อง(-80) เริ่มงานปรับเซ็ทตู้เชื่อม งานทะยอยออก ไม่ได้ตัดงานกอง",
      "lines": [
        "PRO2·B"
      ],
      "times": [
        "8:00-9:00"
      ],
      "count": 1,
      "total_impact": -117
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
