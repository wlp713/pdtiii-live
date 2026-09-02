# 生产实时看板（PDTIII Live Dashboard）开发 SOP

> 版本：v1.0 | 日期：2026-08-25 | 作者：万李鹏 + AI辅助开发

---

## 一、项目概述

### 1.1 产品定位
泰国冰压工厂生产实时看板，用于监控8条主要产线（Final A/B/C/D + Motor H/S/F/WL）的产出达成、UPH效率、停滞告警、问题点分析。

### 1.2 技术栈
| 层级 | 技术 | 说明 |
|------|------|------|
| 前端 | 纯HTML + CSS + JS（单文件） | 无框架依赖，零构建 |
| 图表 | Canvas 2D 原生绘制 | 无Chart.js/D3等第三方库 |
| 数据（本地） | data.json + live-data.js | 静态文件，由脚本定时更新 |
| 数据（线上） | Firebase Realtime DB | 云端同步，GitHub Pages用 |
| 部署 | GitHub Pages | https://wlp713.github.io/pdtiii-live/ |
| 数据同步 | Python脚本 + Node.js脚本 | 从Excel/MLS系统抓取数据写入 |

### 1.3 文件结构
```
pdtiii-live/
├── index.html          # 主页面（全部前端代码，约6000行）
├── live-data.js        # 数据文件（__LIVE_DATA__ + __HISTORY__）
├── data.json           # 备用数据源（本地模式）
├── history/            # 每日17:00快照归档
│   ├── index.json      # 日期列表
│   └── 2026-08-25.json # 单日快照
├── tools/              # 数据同步工具
│   ├── extract_data.py # 从Excel提取数据 → 写入 live-data.js
│   └── save_daily_history.py # 每日17:00归档
└── SOP_生产看板开发手册.md  # 本文档
```

---

## 二、核心架构

### 2.1 数据流

```
Excel/MLS系统 → Python脚本提取 → live-data.js (window.__LIVE_DATA__)
                                        ↓
                              index.html 读取并渲染
                                        ↓
                              浏览器每10秒刷新一次
```

### 2.2 数据结构

#### live-data.js 格式
```javascript
window.__LIVE_DATA__ = {
  // 实时线体数据（每10分钟由extract_data.py更新）
  "lines": [
    {
      "name": "Final A line",
      "actual": 2919,      // 实际产量
      "plan": 3297,        // 计划产量（实时累计目标）
      "target": 3297,      // 日目标
      "cb": -378,          // 差异 = actual - plan
      "eff": 88.5,         // 达成率% = actual / plan * 100
      "status": "RUNNING", // RUNNING / STALLED / OFF
      "stalled": false,
      "cum": 2919,         // 累计产量
      "pushed": "2026-08-25 09:00:00"  // 最后推送时间
    }
    // ... 其他线体
  ],
  // 首小时达成（8-9点，由Excel填写后同步）
  "first_hour": [
    {"line": "Final A line", "target": 430, "actual": 364, "rate": 84.6},
    // ...
  ],
  // 问题点Top3（每小时自动聚合）
  "problems_top": [
    {
      "line": "Final B Line",
      "problem": "换型3次+开班调机",
      "problem_zh": "换型3次+开班调机",
      "problem_th": "เปลี่ยนแบบ 3 ครั้ง",
      "impact": 321,       // 影响台数
      "count": 3,          // 发生次数
      "times": ["08:30", "09:15", "10:00"]  // 发生时段
    }
  ],
  // 每小时产量快照（用于分段柱状图）
  "hourly": {
    "Final A line": [
      {"h": 8, "actual": 364, "plan": 430},
      {"h": 9, "actual": 728, "plan": 860},
      // ...
    ]
  },
  "updatedAt": "2026-08-25 09:00:00",
  "source": "extract"
};

// 历史数据（每日17:00快照，用于趋势图）
window.__HISTORY__ = [
  {
    "date": "2026-08-20",
    "lines": {
      "Final A line": 69.2,
      "Final B Line": 97.1,
      // ... 各线体当日最终达成率
    },
    "first_hour": {
      "Final A line": 85.3,
      // ... 各线体首小时达成率
    },
    "problems": [...]  // 当日问题点
  },
  // ...
];
```

### 2.3 前端渲染逻辑

1. **数据加载**：页面加载时 fetch live-data.js（线上走Firebase）
2. **表格渲染**：`renderTable()` → 按UPH排序 → 8条主要线体
3. **KPI计算**：`renderKPIs()` → 运行线体数/平均效率/达成数/Final产量/Motor产量
4. **图表绘制**：`drawBar()` 小时产量柱状图 + `drawEff()` UPPH达成率柱状图
5. **趋势分析**：`drawTrend()` 从 __HISTORY__ 读取近14天数据 → sparkline卡片
6. **停滞检测**：`trackStallStart()` 追踪actual变化 → 分级告警（黄<15min/橙15-30min/红≥30min）
7. **问题点嵌入**：`renderProblems()` → 在主表格每行下方嵌入问题明细

---

## 三、功能模块清单

### 3.1 已实现功能

| # | 模块 | 功能 | 数据源 |
|---|------|------|--------|
| 1 | 实时看板 | 8条线体产量/达成率/UPH/状态 | live-data.js |
| 2 | 小时产量图 | 分段柱状图（实际vs目标） | hourly快照 |
| 3 | UPPH达成率 | 人效柱状图（需填人数） | headOf() localStorage |
| 4 | 停滞告警 | 分级闪烁 + 系统通知 | actual变化追踪 |
| 5 | 历史统计 | 周/月对比 + 站擂排名 | histStore localStorage |
| 6 | 趋势分析 | 14天达成率sparkline卡片 | __HISTORY__ |
| 7 | 首小时达成 | 8-9点达成率排名/趋势 | first_hour |
| 8 | 问题点Top3 | AI语义聚合 + 嵌入行下方 | problems_top |
| 9 | 出勤管理 | 录入/展示/跨端同步 | localStorage + Firebase |
| 10 | 日期回看 | 历史任意日全量看板 | history/*.json |
| 11 | 中英切换 | 全局i18n | I18N对象 |
| 12 | 计划停产 | Motor WL灰色标注 | PLANNED_OFF配置 |
| 13 | 作战模式 | 紧凑布局+底部扩展模块 | CSS battle-mode |

### 3.2 待开发功能

| # | 模块 | 功能描述 | 优先级 |
|---|------|---------|--------|
| 1 | **对话框录入** | 用户发消息/图片给AI → AI提取数据 → 写入系统 | 🔴 高 |
| 2 | **文件夹自动取数** | 监控指定文件夹 → 自动读取Excel → 更新数据 | 🟡 中 |
| 3 | **自动通报** | 定时生成文字通报 → 发送到美信群 | 🟡 中 |
| 4 | **异常预警推送** | 达成率<80%自动推送告警 | 🟢 低 |

---

## 四、对话框录入数据功能（核心需求）

### 4.1 功能描述

用户在美信（MX）对话框中发送消息或图片给AI助手，AI自动提取数据并写入当日看板系统。

### 4.2 交互流程

```
用户（美信对话）
  │
  ├─ 发送文字消息：
  │   "Final A 实际364 目标430，Motor H 实际175 目标169"
  │
  ├─ 发送图片：
  │   [看板截图] / [Excel截图] / [手写记录照片]
  │
  ↓
AI助手（OpenClaw）
  │
  ├─ 1. 识别消息类型（文字/图片）
  ├─ 2. 提取数据（正则/OCR/视觉识别）
  ├─ 3. 校验数据格式
  ├─ 4. 写入 live-data.js（或调用API更新Firebase）
  ├─ 5. 回复确认：✅ 已录入 Final A: 364/430 (84.6%)
  │
  ↓
看板自动刷新（10秒内生效）
```

### 4.3 支持的数据格式

#### 文字消息格式（灵活匹配）
```
# 格式1：线体名 + 实际/目标
Final A 实际364 目标430
Motor H 175/169

# 格式2：简写
A:364/430 H:175/169 S:167/187

# 格式3：首小时达成
首小时: A 84.6% B 91.2% C 96.4% D 76.9%

# 格式4：问题点录入
Final B 换型3次 损失321台
Motor F 故障7分钟 损失50台

# 格式5：出勤录入
今日出勤: PRO1 应到50 实到48 PRO2 应到60 实到55
```

#### 图片识别
- **看板截图**：OCR提取所有线体的实际/计划/达成率
- **Excel截图**：识别表格结构，提取对应列数据
- **手写记录**：AI视觉识别 → 结构化数据

### 4.4 技术实现方案

#### 方案A：通过Firebase API直接写入（推荐）
```python
# AI助手侧的写入脚本
import requests
import json

def update_dashboard_data(data_dict):
    """
    data_dict 格式:
    {
        "lines": [
            {"name": "Final A line", "actual": 364, "plan": 430},
            ...
        ],
        "first_hour": [
            {"line": "Final A line", "target": 430, "actual": 364, "rate": 84.6},
            ...
        ],
        "problems": [
            {"line": "Final B Line", "problem": "换型3次", "impact": 321},
            ...
        ]
    }
    """
    # 更新Firebase
    firebase_url = "https://dm111-e8a7d-default-rtdb.firebaseio.com/pdtiii.json"
    requests.patch(firebase_url, json=data_dict)
    
    # 同步更新本地 live-data.js（如果在本机）
    update_live_data_js(data_dict)

def update_live_data_js(data_dict):
    """更新 live-data.js 文件"""
    # 读取现有文件 → 合并新数据 → 写回
    pass
```

#### 方案B：写入Excel → 由extract脚本同步
```python
# AI助手将数据写入指定Excel → extract_data.py 定时读取
def write_to_excel(data_dict, sheet="今日实时"):
    import openpyxl
    wb = openpyxl.load_workbook("dashboard_data.xlsx")
    ws = wb[sheet]
    for item in data_dict["lines"]:
        # 找到对应行 → 写入actual/plan
        pass
    wb.save("dashboard_data.xlsx")
```

### 4.5 AI提示词模板

```
你是生产看板数据录入助手。用户会发送产线数据，你需要：

1. 识别线体名称（支持简写）：
   - Final A / A线 / A → "Final A line"
   - Motor H / H系列 / H → "Motor H-Series"
   - Motor WL / WL → "Motor WL"

2. 提取数值：
   - "实际364 目标430" → actual=364, plan=430
   - "364/430" → actual=364, plan=430
   - "达成率84.6%" → eff=84.6

3. 计算缺失值：
   - eff = actual / plan * 100
   - cb = actual - plan

4. 回复确认格式：
   ✅ 已录入 8/25 Day
   Final A: 364/430 (84.6%) ▼
   Motor H: 175/169 (103.5%) ▲
   共录入 2 条线体数据

5. 如果数据异常（达成率>150%或<10%），提醒用户确认。
```

---

## 五、文件夹自动取数功能（未来）

### 5.1 功能描述
监控指定文件夹中的Excel文件，自动读取最新数据并更新看板。

### 5.2 设计方案
```
指定文件夹（如 \\server\production\daily\）
  │
  ├─ 2026-08-25_产出.xlsx    ← 每日产出报表
  ├─ 2026-08-25_出勤.xlsx    ← 每日出勤表
  ├─ 2026-08-25_问题点.xlsx  ← 每日问题记录
  │
  ↓
Python监控脚本（watchdog库）
  │
  ├─ 检测新文件/文件修改
  ├─ 读取Excel指定Sheet/列
  ├─ 转换为标准格式
  ├─ 写入 live-data.js / Firebase
  └─ 记录日志
```

### 5.3 配置模板
```json
{
  "watch_folder": "\\\\server\\production\\daily\\",
  "file_pattern": "{date}_产出.xlsx",
  "sheet_name": "汇总",
  "column_mapping": {
    "line_name": "A",
    "actual": "C",
    "plan": "D",
    "status": "E"
  },
  "update_interval_minutes": 10,
  "target_system": "firebase"
}
```

---

## 六、已知Bug与待修复项

### 6.1 当前Bug

| # | 严重度 | 描述 | 位置 | 状态 |
|---|--------|------|------|------|
| 1 | 🔴 高 | 日期切换按钮点一次后点不动 | index.html 历史回看模块 | 待修复 |
| 2 | 🟡 中 | 线下明细表与模块挤在一起 | CSS布局 extra-modules | 待修复 |
| 3 | 🟡 中 | MLS导出脚本超时（.el-range-input等待30s） | export_detail2.js | 待修复 |
| 4 | 🟢 低 | 定时任务isolated session偶尔提前退出 | cron job配置 | 待排查 |

### 6.2 修复方向

**Bug #1 日期切换**：
- 可能原因：日期按钮的click事件被模态框overlay拦截
- 检查：`histDatePick` input的change事件是否正确绑定
- 建议：在模态框内用stopPropagation防止事件冒泡

**Bug #2 布局挤压**：
- 可能原因：`extra-modules` 的 `flex: 0 0 34%` 高度不够
- 建议：将线下明细表（mod-problems）的 `margin-top` 增加，或减少其 `flex-basis`

---

## 七、部署与运维

### 7.1 本地开发
```bash
# 1. 启动本地服务器（不能用file://打开）
cd C:\Users\19777\Desktop\pdtiii-live
python -m http.server 8080

# 2. 浏览器打开
http://localhost:8080
```

### 7.2 线上部署
```bash
# GitHub Pages 自动部署
git add .
git commit -m "update dashboard"
git push origin main
# 自动触发 GitHub Pages 部署
# 访问: https://wlp713.github.io/pdtiii-live/
```

### 7.3 数据同步脚本

#### extract_data.py（每10分钟运行）
```bash
# 从Excel提取数据 → 写入 live-data.js
$env:PYTHONIOENCODING="utf-8"
py tools/extract_data.py
```

#### save_daily_history.py（每日17:00运行）
```bash
# 归档当日快照 → history/YYYY-MM-DD.json
py tools/save_daily_history.py
```

### 7.4 定时任务配置
| 任务 | 频率 | 脚本 | 说明 |
|------|------|------|------|
| 数据提取 | 每10分钟 | extract_data.py | 从Excel→live-data.js |
| 每日归档 | 17:00 | save_daily_history.py | 快照→history/ |
| 看板通报 | 9/11/14/17点 | cron job | 截图+文字→美信发送 |

---

## 八、开发规范

### 8.1 代码风格
- 单文件架构，所有CSS在`<style>`内，所有JS在`<script>`内
- 变量命名：camelCase（JS）、kebab-case（CSS class）
- 注释：关键逻辑用 `// ★` 标记修改原因和日期
- 版本标记：`// 2026-08-25 fix: xxx` 格式

### 8.2 数据更新规范
1. **不要直接修改 index.html 中的数据**
2. 所有数据通过 live-data.js 注入
3. 修改数据格式时同步更新 extract_data.py
4. 历史数据一旦归档不可修改

### 8.3 测试清单
- [ ] 本地 http://localhost:8080 能正常加载
- [ ] 线上 GitHub Pages 能正常访问
- [ ] 数据每10分钟自动刷新
- [ ] 停滞告警正常触发
- [ ] 趋势图显示近14天数据
- [ ] 首小时达成数据正确
- [ ] 中英切换正常
- [ ] 作战模式布局正常

---

## 九、联系方式

- 项目负责人：万李鹏（lipeng.wan）
- 开发协助：OpenClaw AI助手
- 数据源：现场Excel + MLS系统
- 部署平台：GitHub Pages + Firebase

---

*本文档由AI辅助生成，如有更新请同步修改版本号。*
