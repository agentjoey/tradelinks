# BL-043 邮件订阅 + 每周跨境简报 — Design Spec

> Backlog: BL-043 · [[Backlog-待办#-now--next]]
> Date: 2026-06-09 · Status: draft（设计已确认，构建待 BL-042 数据积累后启动）
> 关联：Obsidian `P026-TradeLinks/Growth-增长方案.md`（英文滩头）· 内容依赖 BL-042

## 1. 背景与定位（Why）

增长阶段目标：**先做用户量、暂不抓付费率**，成本近零。最便宜的获客 = 把已在产的内容重新分发 + **就地把读者留成自有名单**。

- **"用户" = 邮件订阅数**（英文滩头的主承接口；Telegram 次选）。UV 是租来的，订阅是可反复触达、且日后变现的唯一入口。
- **承接口是整条漏斗的瓶颈** —— 没有它，所有渠道（X/Reddit/LinkedIn/FB）引来的流量全漏。本条就是把这个口建起来。
- 滩头已定 = **英文/全球卖家**；叙事 = "China→West 爆品早信号 + 砸利润的政策/物流/平台变动，比对手早"。

**现状盘点（已查证）**：Resend **尚未接**（`RESEND_API_KEY`/`FROM_EMAIL` 仅在 env，src 无发信代码）→ 本条需**从零建发信**。`app/lib/digest.ts`（`buildDigest`/`renderDigestText`）已存在但从未发出 → **政策段复用它**。

## 2. 目标与非目标

**目标**
- 站内**双重确认**邮件订阅口（首页 hero + Daily/Wire 文末 + `/subscribe`）。
- 每周一封**英文简报**：**Movers 为主（吃 BL-042）+ 本周政策/物流预警**。
- 自建名单（Prisma `Subscriber`），Resend 发信，全程合规（确认 + 退订）。

**非目标（本期不做）**
- 付费/分层、Resend Audiences 托管名单、中文简报（zh 留中文社区那一步）、一稿多投到社媒（= 候选 BL-044）、免费工具页（= 候选 BL-045）。
- 复杂模板系统 / A-B / 打开率追踪面板（后续）。

## 3. 已锁决策

| 项 | 决策 |
|---|---|
| 频率 | **每周一**（如 `0 14 * * 1` UTC，贴美欧工作周开端） |
| 内容 | **Movers 为主 + 政策预警** |
| 语言 | **仅英文** |
| 名单 | 自建 Prisma `Subscriber`（非 Resend Audiences） |
| 确认 | **双重确认**（double opt-in）+ 每封带退订链接 |
| 订阅口 | 首页 hero + Daily/Wire 文末 + `/subscribe` |

> 具体配置（确切排程时间、文案、hero 位置细节）**构建时再敲定**。

## 4. 数据模型

新增 Prisma `Subscriber` + migration `0009`：

| 字段 | 说明 |
|---|---|
| `id` | cuid |
| `email` | `@unique`，存前 lowercase/trim |
| `status` | `pending` / `confirmed` / `unsubscribed` |
| `confirmToken` | 确认用，随机；确认后保留以幂等 |
| `unsubToken` | 退订用，随机、长期有效 |
| `lang` | 默认 `"en"`（为未来留口） |
| `createdAt` / `confirmedAt` / `unsubscribedAt` | 时间戳 |

唯一键 `email`；重复 `POST` 同邮箱 → 复用行（pending 重发确认 / confirmed 直接成功）。

## 5. 双重确认流（Next route handlers，新建 `app/api/subscribe/*`）

- `POST /api/subscribe` `{email}` → 校验邮箱 + upsert `pending`（生成 token）+ 发确认邮件 → 返回 ok（**不泄露是否已存在**，防枚举）。
- `GET /api/subscribe/confirm?token=` → 置 `confirmed` + `confirmedAt` + 发欢迎信 → 跳转成功页。
- `GET /api/unsubscribe?token=` → 置 `unsubscribed` + `unsubscribedAt` → 跳转确认页。

轻量防滥用：`POST` 端按 IP 限流 + 基础邮箱格式校验。

## 6. 发信（新建 `src/email/resend.ts`）

- 包 Resend HTTP API：`sendEmail({to, subject, html, text})`。
- **Gating**：无 `RESEND_API_KEY` → 跳过 + log（同其它集成风格，零配置不报错）。
- 批量：周报群发用 Resend 批量/循环 + 基础节流（早期量小无压力）。

## 7. 每周 issue 组装（纯函数，TDD）

`composeWeeklyIssue({ movers, policyAlerts }) → { subject, html, text }`

- **Movers 段**：复用 BL-042 `getValidationHistories()` + `trendScoreV1()` 取 Top N 在动的品 + 一行"为什么"。
- **政策段**：本周已发布的 `regulatory` / `platform_policy` / `logistics` 预警，复用 `app/lib/digest.ts`。
- 每封注入**退订链接**（`unsubToken`）。subject line 由当周头条 mover/预警动态生成。
- Movers 薄时（BL-042 早期）→ 政策段独立撑起一封，issue 不空。

## 8. Worker + 排程

- 新队列 `QUEUES.newsletter = "newsletter-tick"`。
- 排程**每周一**（构建时定确切 UTC 时刻）。
- 流程：组装 issue → 取所有 `confirmed` 订阅 → 批量 `sendEmail` → log 发送量。
- Gating：无 Resend key 或无 confirmed 订阅 → no-op。

## 9. UI

- `<SubscribeForm/>` 客户端组件：邮箱输入 → `POST /api/subscribe` → 成功态（"check your inbox to confirm"）。英文文案。
- 放置：首页 hero 区、每篇 Daily/Wire 文末、独立 `/subscribe` 页 + confirm/unsubscribe 结果页。
- i18n：英文滩头，本组件英文文案；不接 zh（非目标）。

## 10. 依赖与时序

- **内容依赖 BL-042**：Movers 来自 BL-042 快照，需积累约 1 周才有意义。**BL-043 基建可与 BL-042 并行建**；首封正式 issue 等数据攒够 —— **每周节奏正好对得上**。BL-042 越早合并部署，积累越早。
- ⚠️ **ops 硬前置（要人工做，开工前提）**：Resend 后台验证发信**域名** + DNS 配 **SPF/DKIM**，`FROM_EMAIL` 换成线上域（如 `brief@tradelinks.agentjoey.ai`），否则进垃圾箱。spec 标为开工前提，不在代码内。

## 11. 测试策略（只纯函数 TDD）

- `composeWeeklyIssue`（有 movers / 无 movers 只政策 / 全空 的渲染）。
- token 生成 + 邮箱归一化/校验（纯函数）。
- 退订链接出现在每封 issue。
- 发信 wrapper / route handlers / worker 走集成/手测（DB + 外部 API，不单测）。

## 12. 风险 / Ops

- **可达性**：双重确认 + 退订 + 域名验证（§10）是不进垃圾箱的前提。
- **滥用**：`POST` 限流 + 邮箱校验；确认 token 防直接灌库。
- **Resend 免费额度**：早期量小无碍；放量再看分层。
- **隐私**：只存 email + 状态，退订即标记（不硬删，保留合规记录）。

## 13. 实施切分

单期可交付（一个 plan）。建议任务序：① `Subscriber` + migration 0009 → ② 纯函数(token/邮箱校验/composeWeeklyIssue) TDD → ③ `src/email/resend.ts` 发信 → ④ 三个 route handlers + 订阅 DB 层 → ⑤ `<SubscribeForm/>` + 放置 + 结果页 → ⑥ `newsletter-tick` worker + 排程 → ⑦ 手动脚本发一封测试 + 验收。**ops 域名验证为开工前提。**
