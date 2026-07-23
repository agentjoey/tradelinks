# TradeLinks — Claude Code Context

## ⭐ Session 启动（每次必执行）
```bash
git pull
cat .agent/CURRENT.md
```

## Project Overview
TradeLinks 是全球跨境电商情报平台，聚焦**预警**（法规/平台政策/物流中断）和**趋势预测**（跨区爆品扩散信号），面向全球卖家、服务商和投研机构。  
**Location:** ~/Playground/claudecode/tradelinks-mvp  
**GitHub:**   agentjoey/tradelinks-mvp  
**Live:**     https://tradelinks-mvp.vercel.app (Vercel) · worker runs on Railway/local  
**Version:**  v0.12.0

**Technical docs:** [Architecture](docs/architecture.md) · [Deployment](docs/deployment.md) · [Operations](docs/operations.md) · [Sources](docs/specs/sources.md)

## Tech Stack
| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| API | Next.js Route Handlers |
| Queue/Workers | pg-boss on Neon Postgres (no Redis — ADR-004) |
| Scraping (TS) | RSS + fetch — simple sources (~50%) |
| Scraping (Python svc) | **Scrapling** (StealthyFetcher + self-healing selectors) for anti-bot sources (TikTok CC / Amazon BSR / Shopee) + pytrends — see ADR-002 |
| Database | PostgreSQL 16 + trigram GIN index + time-series views |
| AI (primary) | MiniMax-M2 via Anthropic endpoint (sk-cp- token-plan key) when MINIMAX_API_KEY set — all Stage-1; reasoning model |
| AI (fallback bulk) | DeepSeek V3.2 — translation, pre-filter, categorize |
| AI (fallback small-lang) | Qwen-Plus — AR/ID/TH |
| Scraping | Playwright (JS-heavy) + fetch (RSS/JSON) |
| Email | Resend |
| Push | Telegram Bot API + Slack Webhooks |
| Auth | NextAuth.js v5 |
| Payment | Stripe (USD, global) |
| Hosting | Vercel (frontend) + Railway (Node+Python workers) + Neon (Postgres+queue) — ADR-003/004 |

## Key Implementation Details
- Alert pipeline forks at classification: urgency×impact score ≥4 triggers immediate push; <4 queues to daily digest
- Trend diffusion: cross-region time-series alignment (Google Trends slope + Amazon BSR rank delta + TikTok CC mentions) — 3-source consensus required before marking a signal
- All items tagged with `region[]` + `platform[]` + `category` — push routing is subscription-filter based, never broadcast
- Crawler is polyglot (ADR-002): TS handles RSS/fetch; Python Scrapling service handles anti-bot sources + Google Trends, results returned via pg-boss ingest-queue with schema matching TS adapters
- Blocked-detection: HTTP 200 with captcha/Cloudflare body must NOT be naively retried — route to Python StealthyFetcher instead
- DeepSeek API requires `User-Agent: Mozilla/5.0` workaround for some fetch contexts
- Postgres trigram: `CREATE EXTENSION pg_trgm; CREATE INDEX ON items USING GIN (title gin_trgm_ops)`
- Neon needs TWO urls (ADR-003): `DATABASE_URL` (pooled, runtime) + `DIRECT_URL` (direct, migrations). Migrations can't run over the transaction pooler.
- pg-boss (queue) also uses `DIRECT_URL`, not the pooled url (ADR-004). It creates a `pgboss` schema on first start.
- Scheduling: pg-boss schedule is one-cron-per-queue, so a per-minute `scheduler-tick` fans out crawl jobs via cron-parser `isDue()` per source (not 25 separate schedules).
- **Environments:**
  - **Neon `dev` branch** is the local default; `.env` now points `DATABASE_URL`/`DIRECT_URL` to `dev`. Local `pnpm dev`, `pnpm worker`, and scripts write to dev by default.
  - **Neon `production` branch** is used by Vercel Production and Railway workers. Connecting to prod is a deliberate action via `.env.production`.
  - **Vercel Preview** (PR/branch deployments) should point to the Neon `dev` branch; set Preview-scope env vars in the Vercel Dashboard.
  - **Railway** remains production-only; there is no hosted dev worker/scraper (run them locally on demand).
  - Dev defaults have destructive switches OFF: `X_ENABLED=false`, `CHANNEL_PUSH_ENABLED=false`, `TRANSLATE_ENABLED=false`, `DAILY_NOTE_AUTOPUBLISH=false`. Enable individually when testing the full pipeline.
  - Production operations: `pnpm db:migrate:prod` or `dotenv -e .env.production -- pnpm tsx scripts/xxx.ts`.
- Sources with login walls (Amazon SC, Temu) captured via secondary media sources only — never scrape authenticated sessions

## Dev Commands
```bash
pnpm dev              # start Next.js dev server (port 3000)
pnpm worker           # start pg-boss worker process (scheduler+crawl+ingest+process)
pnpm db:migrate       # run Prisma migrations against Neon dev (uses .env)
pnpm db:migrate:prod  # run Prisma migrations against Neon production (uses .env.production)
pnpm db:studio        # open Prisma Studio
pnpm test             # vitest
./scripts/release.sh patch|minor|major
```

## 前端变更工作流（BL-045 起）
前端用户可见变更一律先调用 `frontend-harness` Skill（原 `frontend-harness-workflow.md` 现由该 Skill 内部管理，不再作为运行时直接引用来源）；本项目在通用流程基础上的补充约定：
- **分级**：T1 小改 / T2 功能 / T3 新页面或高风险（核心导航、品牌入口、全站视觉层 → 必为 T3）；命中多级取最高
- **流程**：brainstorm → spec（`docs/superpowers/specs/`）→ HTML mockup（`design/`，Chrome headless 截图迭代）→ plan（`docs/superpowers/plans/`）→ SDD 执行 → 验证记录（`docs/superpowers/verification/`）
- **SDD 执行惯例**：`.worktrees/<branch>` 隔离（`cp .env` + `pnpm install` + `pnpm db:gen` + 基线测试先行）；每任务 = 实现子代理 + spec/质量双审子代理；finding → 修复波 + 复审；全部任务后跑全分支终审；进度账本 `.superpowers/sdd/progress.md`（gitignored）
- **T3 硬门槛**：合并前 Human Owner 亲自走查关键旅程（五页/主题切换/移动端 tab/键盘/中文/reduced-motion）；合并后生产冒烟（路由 200、hreflang、feed.xml、关键标记在线）
- **设计约束**：无 >1px 侧边色条（tier = chip + 1px 细边框）；暗色默认、亮色可选（cookie `tl-theme`，禁 prefers-color-scheme）；新文案全走 `getDict()` 中英双写；动画必须有 reduced-motion 降级

## Release 后必做
1. `.agent/CURRENT.md`：补充 Version History 描述 + Last Updated
2. 更新 Current Sprint Summary
3. 如有 schema 变更：更新 `docs/architecture.md` 数据模型节
