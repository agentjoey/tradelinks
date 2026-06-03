# Sprint 001

Goal:      搭建数据摄取基础设施——爬虫框架 + Postgres schema + Phase1 源接入 + AI 粗筛管道跑通
Period:    2026-06-03 ~ 2026-06-17
Version:   v0.2.0
Assignee:  claude

## Tasks

### T1: Postgres Schema 设计与初始化 [HIGH] [claude]
**Status:** ✅ Done
**Epic:** EP-001
**Acceptance:**
- [x] `prisma/schema.prisma` 含 Source/Item/Cluster/Alert/TrendSnapshot/TrendSignal/User/KeywordWatch 8 表 + 7 枚举
- [x] `pnpm db:validate` 通过（`The schema at prisma/schema.prisma is valid 🚀`）；`pnpm db:gen` 生成 Client v6.19.3。真 `migrate deploy` 待 Railway（本地无 docker/psql，已在 deployment.md 注明）
- [x] Item 表含 `regions[]` + `platforms[]` + `category` + `publishedAt` + `urgencyScore`
- [x] trigram GIN 索引：`prisma/migrations/0002_trgm/migration.sql`（pg_trgm + title/titleEn GIN）
- [x] 时序表 `trend_snapshots`（+ `trend_signals` 跨区扩散）已建模；offline 迁移 `0001_init/migration.sql`（200 行）已生成

### T2: 爬虫框架搭建（TS adapters + BullMQ） [HIGH] [claude]
**Status:** ✅ Done
**Epic:** EP-001
**架构:** 见 ADR-002（混合 polyglot：TS 管 RSS/简单 fetch，Python/Scrapling 管反爬源）
**Acceptance:**
- [x] RssAdapter + FetchAdapter；**实测** `worker:run-once --source=A02` 从 Shopify changelog 解析 1508 条，字段完整
- [x] scrapling/JSON 源经 `scrape-queue` 转发（`crawler.ts` routeToScrape；`buildAdapter` 返回 null）
- [x] BullMQ `crawl-queue` 消费 `{ sourceId, url, adapter }`（zod `CrawlJobSchema` 校验）
- [x] 每源可配 `frequencyCron`（`scheduler.ts` repeatable job）
- [x] 重试 3 次 + 指数退避(2s/8s/32s)，fetch 超时 30s；连续失败≥5 自动禁用源
- [x] **被封检测** `src/adapters/blocked.ts`（Cloudflare/captcha/access-denied/异常短）→ 6 单测全过；blocked→scrape-queue 已实现
- [x] `pnpm test` 11 passed，`pnpm lint`(tsc) 0 error

### T6: Python Scraper 服务（Scrapling + FastAPI） [HIGH] [claude]
**Status:** 🔲 Todo
**Epic:** EP-001
**架构:** 见 ADR-002
**Acceptance:**
- [ ] `scraper-py/` FastAPI 服务，暴露 `POST /scrape { sourceId, url, mode }`
- [ ] 集成 Scrapling `StealthyFetcher(solve_cloudflare=True)` 抓反爬源
- [ ] 验证可抓到：TikTok Creative Center(D07) + Amazon BSR US(D02) + Shopee SG(D08，Phase1.5 先验证可达)
- [ ] 启用 Scrapling 自适应模式（Smart Element Tracking / auto-save），改版后选择器可自愈
- [ ] pytrends（Google Trends D01）收纳进本服务，暴露 `POST /trends`
- [ ] 抓取结果经 Redis 队列回写 Node `crawl-queue`，schema 与 TS adapter 输出一致
- [ ] Dockerfile 基于 Scrapling 官方镜像（含 Chromium），可在 Railway 部署

### T3: Phase 1 信息源接入（25 个核心源） [HIGH] [claude]
**Status:** 🔄 In Progress（配置+ingest 完成；DB 入库与 img-proxy 待验证/后续）
**Epic:** EP-001
**Acceptance:**
- [x] `src/config/sources.ts` 含 25 个 S1 源（B/D/F/A 类，与 docs/specs/sources.md 一致）
- [x] 每源有 `id/name/url/adapter/frequencyCron/language/regions[]/platforms[]/categoryHint` 字段
- [x] `src/workers/ingest.ts` 实现 upsert（url unique=去重L1）+ 转 process-queue
- [~] DB 真入库待 Railway Postgres（本地无 psql/docker）
- [~] img-proxy 推迟至 Sprint 003（需 Next.js，IMPL-PLAN 已注明）
- [!] 修正：F01 Marketplace Pulse 无公开 RSS（/feed 全 404，已实测）→ 改 fetch adapter，选择器待线上验证
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
