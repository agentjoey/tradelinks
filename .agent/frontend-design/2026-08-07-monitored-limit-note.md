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

## 决定与证据

- 待 mockup 批准后回填。
