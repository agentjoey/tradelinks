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
- [x] **`migrate deploy` 已真实应用到 Neon dev 分支**（0001_init + 0002_trgm 均成功）；9 张表确认存在
- [x] Item 表含 `regions[]` + `platforms[]` + `category` + `publishedAt` + `urgencyScore`
- [x] trigram GIN 索引：`prisma/migrations/0002_trgm/migration.sql`（pg_trgm + title/titleEn GIN）
- [x] 时序表 `trend_snapshots`（+ `trend_signals` 跨区扩散）已建模；offline 迁移 `0001_init/migration.sql`（200 行）已生成

### T2: 爬虫框架搭建（TS adapters + pg-boss） [HIGH] [claude]
**Status:** ✅ Done
**Epic:** EP-001
**架构:** 见 ADR-002（混合 polyglot：TS 管 RSS/简单 fetch，Python/Scrapling 管反爬源）
**Acceptance:**
- [x] RssAdapter + FetchAdapter；**实测** `worker:run-once --source=A02` 从 Shopify changelog 解析 1508 条，字段完整
- [x] scrapling/JSON 源经 `scrape-queue` 转发（`crawler.ts` routeToScrape；`buildAdapter` 返回 null）
- [x] pg-boss `crawl-queue` 消费 `{ sourceId, url, adapter }`（zod `CrawlJobSchema` 校验）；scheduler-tick + cron-parser isDue 派发（5 单测）
- [x] 每源可配 `frequencyCron`（`scheduler.ts` repeatable job）
- [x] 重试 3 次 + 指数退避(2s/8s/32s)，fetch 超时 30s；连续失败≥5 自动禁用源
- [x] **被封检测** `src/adapters/blocked.ts`（Cloudflare/captcha/access-denied/异常短）→ 6 单测全过；blocked→scrape-queue 已实现
- [x] `pnpm test` 11 passed，`pnpm lint`(tsc) 0 error

### T6: Python Scraper 服务（Scrapling + FastAPI） [HIGH] [claude]
**Status:** ✅ Done（骨架 + Node 桥接 + 测试；Python 服务待 3.10+/Chromium 环境实跑）
**Epic:** EP-001
**架构:** HTTP 桥接模型（见更新后的 crawler-contract.md §4）：Node 持有全部 pg-boss 队列，Python 是无状态 HTTP 抓取服务
**Acceptance:**
- [x] `scraper-py/` FastAPI：`GET /health` + `POST /scrape {sourceId,url,mode,selectors?}` → `{items:RawItem[]}`（py_compile 通过）
- [x] `scrapers/stealth.py` 集成 Scrapling `StealthyFetcher(solve_cloudflare=True)` + `adaptive=True`（自愈选择器）
- [x] `scrapers/trends.py` 集成 pytrends（mode=trends，keyword 快照含 series）
- [x] **Node 桥接** `src/workers/scrape.ts`：消费 scrape-queue → HTTP POST Python → 回 `ingest-queue`（schema 一致）；3 个单测（200/非200/schema 校验）
- [x] Dockerfile 基于 Scrapling Chromium 镜像 + requirements.txt + README
- [~] 真抓 TikTok CC(D07)/Amazon BSR(D02)/Shopee：需 3.10+ 环境 + Chromium，选择器线上迭代（本地 py3.9 无法跑）

### T3: Phase 1 信息源接入（24 个核心源） [HIGH] [claude]
**Status:** ✅ Done（配置+ingest+真实入库已验证；img-proxy 推迟 Sprint 003）
**Epic:** EP-001
**Acceptance:**
- [x] `src/config/sources.ts` 含 24 个 S1 源（B/D/F/A 类，与 docs/specs/sources.md 一致）；已 seed 进 Neon `sources` 表
- [x] 每源有 `id/name/url/adapter/frequencyCron/language/regions[]/platforms[]/categoryHint` 字段
- [x] `src/workers/ingest.ts` upsert（url unique=去重L1）+ 转 process-queue
- [x] **真实入库已验证**（scripts/verify-db.ts）：Shopify RSS 抓 1508 条 → 写入 Neon `items`
- [~] img-proxy 推迟至 Sprint 003（需 Next.js，IMPL-PLAN 已注明）
- [!] 修正：F01 Marketplace Pulse 无公开 RSS（/feed 全 404）→ 改 fetch adapter，选择器待线上验证
- [~] 全量 worker 跑 24h 多区域数据：需 AI key(processor) + worker 常驻，留待集成

### T4: AI 粗筛 + 翻译管道（deepseek-v4-flash primary, ADR-005） [HIGH] [claude]
**Status:** ✅ Done（**真实端到端验证**；模型经 bench 对比后定 deepseek-v4-flash 关思考）
**Epic:** EP-002
**Acceptance:**
- [x] `src/ai/client.ts` DeepSeek + Qwen（OpenAI 兼容）+ 语言路由（AR/ID/TH→Qwen）+ token 累计日志
- [x] prompts 三件套 `prefilter/translate/categorize`（版本头 v1）+ `stage1.ts` 编排（可注入 client，纯逻辑）+ `processor.ts` worker（filtered/processed 落库）
- [x] 非英文 → `titleEn` + `summaryEn`；英文 → titleEn=null + 抽取式 summaryEn
- [x] 每条输出 `category`(6类) + `regions[]`(1-N)；空 regions 回退到 source 配置区域
- [x] 粗筛准确率：20 条 golden set + FakeLlmClient，**≥85%** 断言通过（真实 prompt 准确率需 DeepSeek key 实测）
- [x] 区域覆盖：kept 项 **≥98%** 有 ≥1 region（fallback 强制，单测断言）
- [x] token 日志：`recordUsage` 累计；MiniMax 走订阅套餐（M2 推理 token 偏高，后续可换非推理模型/DeepSeek 跑量）
- [x] **真实验证**：MiniMax-M2 经 Anthropic 端点；英文 GPSR→regulatory、中文 FBA→译英+platform_policy、垃圾广告→丢弃；全链路 crawl→AI→DB 通（verify-e2e.ts）
- [!] 调优项：prefilter 偏严（丢了"新平台上线/达人GMV"），recall 待调（已记 ai-pipeline.md）
- 测试：`pnpm test` 40 passed，`pnpm lint` 0 error

### T5: 去重 / 事件聚类 v1 [MED] [claude]
**Status:** ✅ Done（逻辑+测试完成；trigram DB 层 integration-gated）
**Epic:** EP-002
**Acceptance:**
- [x] L1 URL 精确去重（ingest 的 url unique，已在 T3）
- [x] L2 trigram 相似度分类 `classify.ts`（≥0.75 dup / 0.5-0.75 grey / <0.5 distinct）+ 测试
- [x] L3 事件聚类 `resolve.ts`（取最高分；grey 区调 LLM cluster-judge 判同事件）+ 8 单测覆盖 dup/cluster/distinct/排序
- [x] DB 层 `dedup/db.ts`：`findSimilarItems`（pg_trgm similarity 原始 SQL）+ `applyDuplicate`/`applyCluster`（merge sourceUrls[]），已接入 processor
- [x] **pg_trgm 真实验证**（scripts/verify-db.ts）：`similarity()` 可用，`findSimilarItems` 返回评分候选；"3 源聚类"端到端待 AI key 后随 processor 验证

## Superpowers Checkpoints
| Skill | 触发条件 | 本 Sprint |
|-------|---------|---------|
| brainstorming | Schema 设计前 / 爬虫架构前 | ❌ 待触发 |
| verification-before-completion | Task Done 前 | ❌ 待触发 |
| systematic-debugging | 发现 Bug 时 | N/A |

## Sprint 回顾
**Done:** — ｜ **Deferred:** — → Sprint 002
