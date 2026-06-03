# Sprint 004

Goal:      趋势看板 + 跨区扩散信号 v1 + Telegram/Slack 即时推送 + Phase 1.5 源扩展（35 个新源）
Period:    2026-07-15 ~ 2026-08-05
Version:   v0.5.0
Assignee:  claude

## Tasks

### T1: 趋势时序摄取（Google Trends + Amazon BSR） [HIGH] [claude]
**Status:** 🔲 Todo
**Epic:** EP-004
**Acceptance:**
- [ ] `trend_snapshots` 表每日快照：region × keyword × google_score + amazon_bsr_rank
- [ ] pytrends 集成（通过 Python 脚本或 Node HTTP）每日跑 50 个种子关键词，6 大区各一份
- [ ] Amazon BSR 各站点（US/UK/DE/AU）每 4h 快照 top-100，存 rank_delta（对比昨日）
- [ ] TikTok Creative Center 每日抓取 trending products，存 tiktok_mention_count

### T2: 跨区扩散信号 v1 [HIGH] [claude]
**Status:** 🔲 Todo
**Epic:** EP-004
**Acceptance:**
- [ ] `src/ai/diffusion.ts` 实现三源共振判断规则（见 docs/architecture.md Trend Diffusion 节）
- [ ] 输出 `trend_signals` 行：origin_region + spreading_to[] + confidence + signal_basis
- [ ] 验证用例：2026 年某品类在美/英起量后，信号在 2-4 周后出现在 SEA/ME 数据中
- [ ] `/trends` 页面展示：上升品类卡片（带扩散箭头图示）+ 置信度百分比

### T3: Telegram + Slack 即时推送 [HIGH] [claude]
**Status:** 🔲 Todo
**Epic:** EP-005
**Acceptance:**
- [ ] urgencyScore ≥ 4 的 alert approve 后 → 30 秒内推送到用户订阅的 Telegram/Slack
- [ ] Telegram 消息格式：`🚨 [URGENT] {region} {category} - {title}\n{summary}\n{url}`
- [ ] Slack Block Kit 格式，含 region/category 标签
- [ ] 用户可在设置页配置 Telegram chat_id + Slack webhook URL
- [ ] 推送失败重试 3 次，失败后写入 `push_failures` 表

### T4: Phase 1.5 信息源扩展（35 个新源） [HIGH] [claude]
**Status:** 🔲 Todo
**Epic:** EP-001
**Acceptance:**
- [ ] `src/config/sources.ts` 新增 S2 列全部 35 个源（见 docs/specs/sources.md）
- [ ] 各区域关键新源验证：Shopee / Lazada / Mercado Libre / TikTok Shop SEA / SASO / 亿邦/36氪
- [ ] 多语种管道验证：ID/TH/PT/AR 内容正确路由到 Qwen-Plus 并输出英文摘要
- [ ] 新源接入后 48h 内，各区域均有新 items 入库

## Superpowers Checkpoints
| Skill | 触发条件 | 本 Sprint |
|-------|---------|---------|
| brainstorming | 扩散算法设计前 | ❌ 待触发 |
| verification-before-completion | Task Done 前 | ❌ 待触发 |
| systematic-debugging | 发现 Bug 时 | N/A |

## Sprint 回顾
**Done:** — ｜ **Deferred:** — → Sprint 005
