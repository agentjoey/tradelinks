# Sprint 001

Goal:      搭建数据摄取基础设施——爬虫框架 + Postgres schema + Phase1 源接入 + AI 粗筛管道跑通
Period:    2026-06-03 ~ 2026-06-17
Version:   v0.2.0
Assignee:  claude

## Tasks

### T1: Postgres Schema 设计与初始化 [HIGH] [claude]
**Status:** 🔲 Todo
**Epic:** EP-001
**Acceptance:**
- [ ] `prisma/schema.prisma` 包含 Source / Item / Alert / TrendSnapshot / User 五张核心表
- [ ] `pnpm db:migrate` 无报错，`pnpm db:studio` 可打开
- [ ] Item 表有 `region[]` + `platform[]` + `category` + `publishedAt` + `urgencyScore` 字段
- [ ] trigram GIN 索引建立（title + summary 字段）
- [ ] 时序视图 `trend_daily_snapshots` 建立

### T2: 爬虫框架搭建（RSS + Fetch + Playwright + BullMQ） [HIGH] [claude]
**Status:** 🔲 Todo
**Epic:** EP-001
**Acceptance:**
- [ ] `src/workers/crawler.ts` 实现三种 adapter：RssAdapter / FetchAdapter / PlaywrightAdapter
- [ ] BullMQ 队列 `crawl-queue` 可接受 `{ sourceId, url, adapter }` job
- [ ] 每个 Source 可配置 `cronSchedule`（如 `0 */2 * * *` 每 2 小时一次）
- [ ] 失败自动重试 3 次，超时 30s
- [ ] `pnpm worker` 启动无报错，日志输出 job 处理结果

### T3: Phase 1 信息源接入（25 个核心源） [HIGH] [claude]
**Status:** 🔲 Todo
**Epic:** EP-001
**Acceptance:**
- [ ] `src/config/sources.ts` 包含 Phase 1 的 25 个源（见 docs/specs/sources.md S1 列）
- [ ] 每个源有 `id / name / url / adapter / frequency / language / region[] / category` 字段
- [ ] 跑 `pnpm worker` 后 24h 内，`items` 表有来自各区域的真实数据
- [ ] 图片代理 `/api/img-proxy` 实现（绕过 X/Twitter 媒体封锁）

### T4: AI 粗筛 + 翻译管道（DeepSeek V3.2） [HIGH] [claude]
**Status:** 🔲 Todo
**Epic:** EP-002
**Acceptance:**
- [ ] `src/workers/processor.ts` 实现粗筛：过滤广告/无关内容
- [ ] 非英文内容（ZH/PT/ES/AR/ID/TH）自动翻译为英文 `title_en` + `summary_en`
- [ ] 每条 item 输出 `category`（6 类之一）+ `region[]`（1-N 个区域标签）
- [ ] DeepSeek 调用 token 消耗有日志记录（方便监控成本）
- [ ] 7天 LLM 成本 < ¥100（参照 AIHOT 基准）

### T5: 去重 / 事件聚类 v1 [MED] [claude]
**Status:** 🔲 Todo
**Epic:** EP-002
**Acceptance:**
- [ ] 标题 trigram 相似度 > 0.75 的 item 自动标记 `isDuplicate=true`
- [ ] 同一事件多源来源合并为一个 Alert，保留 `sourceUrls[]`
- [ ] 已验证：同一天对同一政策变更的 3 条不同来源被正确聚类

## Superpowers Checkpoints
| Skill | 触发条件 | 本 Sprint |
|-------|---------|---------|
| brainstorming | Schema 设计前 / 爬虫架构前 | ❌ 待触发 |
| verification-before-completion | Task Done 前 | ❌ 待触发 |
| systematic-debugging | 发现 Bug 时 | N/A |

## Sprint 回顾
**Done:** — ｜ **Deferred:** — → Sprint 002
