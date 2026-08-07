# Monitored limit note — presentation

```md
Workflow: 3.3
Task: MONITORED_LIMIT_NOTE 呈现优化 — 停止在每张列表卡片重复同一段 30 词免责声明
Role: Primary Agent (Claude Opus 5)
Tier / 理由: T2（有歧义，见下）
Canonical record: .agent/frontend-design/2026-08-07-monitored-limit-note.md
Branch / worktree: main（单 agent，无并发）
Mockup Gate: Required —— 见分级歧义，按更严的一侧执行
Review path: Human Owner 审阅 rendered mockup → 实现 → 浏览器截图实测
Human checkpoints: ① mockup 批准 ② 合并前走查
```

## 分级歧义（按规则写明，不自行降级）

- **读作 T1** 的理由：这是现有 surface 的文案/样式呈现修复，不新增交互、状态转换或数据契约。
- **读作 T3** 的理由：项目 CLAUDE.md 规定「全站视觉层 → 必为 T3」。改动落在 `IntelligenceCard`，它出现在首页、`/changes`、`/us`、`/amazon-us`、`/shopify-us`、`/categories/*` 全部公开页。
- **取 T2 并把 Mockup Gate 提为 Required**：规则要求歧义时取 T2；而把 gate 提到 T3 的强度（Human Owner 批准 rendered mockup 后才实现），使分级争议不影响实际证据强度。判断依据：改动不触及 token、字阶、配色或 chrome——那才是「视觉层」；这里改的是一个组件的内容呈现。**若 Human Owner 认为应判 T3，请直接指出，我按 T3 补齐 Brief 与 Verification Record。**

## 问题

`MONITORED_LIMIT_NOTE`（30 词）渲染在每一条 MONITORED 记录上，列表卡片与详情页皆是。而 readiness 继承源契约，`A02` 与 `B03` 均为 MONITORED，**当前 100% 记录命中**。

一个永不变化的信号不是信号。一页 20 条即同一段红框重复 20 次：读者第三次起不再阅读，而它本该在真正重要时被看见；整页也因此读起来像故障而非诚实。

卡片上**已经**有 `ReadinessBadge` 渲染字面词 `Monitored`，所以这段散文是叠加冗余。

## 方案

| 位置 | 现状 | 方案 |
|---|---|---|
| 列表卡片 | 每张卡整段红框 | 仅保留既有 readiness chip |
| 列表页头 | 无 | 一句话说明本页 readiness 含义，链到 `/coverage` |
| 详情页 | 整段红框 | **保留**——读者正要据此行动，警告必须在此出现 |

差异出现时信息量自动恢复：某条升到 VERIFIED 时，chip 的 `Verified`（calm 色、semibold）与 `Monitored`（faint）在同一列表中直接可辨。

## 状态矩阵（T2 必填）

| 状态 | 卡片 | 页头 | 详情页 |
|---|---|---|---|
| 全部 MONITORED（今日生产） | chip `Monitored` | 显示说明句 | 显示红框 |
| 混合 MONITORED + VERIFIED | 两种 chip 并存可辨 | 显示说明句 | 按各自 readiness |
| 全部 VERIFIED | chip `Verified` | **不显示**说明句 | 不显示红框 |
| 空列表 | 既有 StatePanel | 不显示 | — |
| VERIFIED 单条详情 | — | — | 不显示红框 |

## Mockup

`design/monitored-limit-note.html` · 截图 `design/shots/monitored-note/{light-1440,dark-1440,light-390}.png`

Token 逐字取自 `app/globals.css`，条目取自生产已发布的 3 条，不用示意内容。

**自查发现并已修的两处（在提交给 Human Owner 之前）：**

1. 页头说明句最初套用了 ticker 的大写+字距样式。30 个词大写三行比原来的红框更难读——把文字墙搬个位置还加重它，不是修复。改为正常句式大小写、faint 色、`max-width:68ch`。
2. 状态矩阵四列表格在窄屏撑宽整页。改为在自身容器内横向滚动，页面本身永不横滚。

**方法学更正：** headless Chrome 在 macOS 下最小视口为 500px，`--window-size=390` 只是把 500px 画面裁到 390 宽——我最初那张"390 截图"里的裁切是**假象**而非布局缺陷。实测 `scrollWidth == clientWidth`，无页面级溢出。真实 390 视图改用约束 body 宽度的方式取得。

**390 视图强化了论据**：手机上该免责声明占 5 行，每张卡片近一半是免责声明。

## 决定与证据

- ✅ **Mockup Gate：Human Owner 批准（2026-08-07）**
- ✅ 实现：`app/(public)/MonitoredPageNote.tsx`；`IntelligenceCard` 的 `limitNote` prop 整体移除；六个公开面接入页级说明；详情页不动。
- ✅ 门禁：`tsc --noEmit` exit 0；组件测试 7/7；全量 **1047 passed / 2 failed（foundation-backfill 端点白名单拒绝，设计如此）/ 2 skipped**；`next build` 成功。
- ✅ 最终 build 浏览器实测（非 mockup）：本地 `next start` 接生产库，`/changes` 页级说明 1 条、卡片红框 0 处；详情页红框与文案均保留（各 2 处，含 RSC payload）。截图 `design/shots/monitored-note/build/`。

### 真实 build 暴露、mockup 看不到的一处

`/changes` 上原本已有一条 `Expert view` 提示，只在 `pool === "monitored"` 时显示——**而那自 2026-08-06 起就是默认值**。它的三个前提同时过期：把默认视图称作"专家视图"是错的；结尾"read each entry's limit before acting"指向已被本次移除的每卡提示；位置上与新的页级说明重复。

已移除该条，并把钉住它的测试**改写为断言其消失**并说明原因，而非删除断言。

### 未做（明确记录）

`amazon-us` 原有的 hub 专属文案（"Amazon 官方政策页需要卖家登录……"）随每卡提示一并移除。该页顶部的 `AMZ_WARNING_PANEL`（owner 决策 4，"What we can and cannot see here"）**仍在**，且信息更完整——此前是面板 + chip + 每卡散文三重冗余。若 Human Owner 认为需要在该页保留更强的措辞，可单独提出。
