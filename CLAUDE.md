# TradeLinks — Claude Code Context

## ⭐ Session 启动（每次必执行）
```bash
git pull
cat .agent/CURRENT.md
```

## Project Overview
TradeLinks 正在从跨境电商信号/趋势站翻新为帮助卖家进入并运营美国市场的情报工具。Phase 1 由公开、可索引、证据可追溯的 **Public Intelligence** 与 Seller Profile 驱动的 **Private Relevance** 组成；首发平台为 Amazon US 和 Shopify US。
**Location:** /Users/xtation/AgentWorks/CodeSpace/tradelinks
**GitHub:**   agentjoey/tradelinks
**Live:**     https://tradelinks-mvp.vercel.app (Vercel) · worker runs on Railway/local
**Version:**  v0.12.0 + Phase 1 Foundation（Draft PR #3，staging only）

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
| AI (existing pipeline) | MiniMax / DeepSeek OpenAI-compatible clients; model selection is environment-configured |
| AI (fallback bulk) | DeepSeek — translation, pre-filter, categorize |
| AI (fallback small-lang) | Qwen-Plus — AR/ID/TH |
| Scraping | Playwright (JS-heavy) + fetch (RSS/JSON) |
| Email | Resend |
| Push | Telegram Bot API + Slack Webhooks |
| Auth | Neon Auth / Better Auth + Google OAuth; `ADMIN_EMAILS` allowlist for admin surfaces |
| Payment | Not implemented; Phase 1 Plus is a later `$5–15/month` product decision |
| Hosting | Vercel (frontend) + Railway (Node+Python workers) + Neon (Postgres+queue) — ADR-003/004 |

## Key Implementation Details
- **Phase 1 Foundation:** `Source → Item → EvidenceCluster → CanonicalChange → CanonicalChangeVersion`, with structured `EvidenceRecord`, `PipelineRun` / `SourceCheck`, and `CoverageCapability`.
- **Publication invariant:** Verified publication requires reviewed `PRIMARY_OFFICIAL` evidence; action recommendations additionally require a reviewed action template. Corrections create a new immutable version.
- **Current release boundary:** Foundation is accepted in Draft PR #3 and deployed only to protected Vercel/Neon staging. Staging backfill remains dry-run only; production, Public Intelligence, Seller Profile, Private Relevance, Railway Cron cutover, and the 7-day P0 soak remain later work.
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
- **Environments (dev / staging / production):**
  | Git branch | Vercel | Neon branch | Purpose |
  |------------|--------|-------------|---------|
  | `main` | Preview / local dev | `dev` | integration; local `pnpm dev` / scripts |
  | `staging` | staging project | `staging` | pre-prod verification; auto-promoted from `main` |
  | `production` | production project | `production` | live site; promoted from `staging` via PR |
  - **Local default:** `.env` points to Neon `dev`. `pnpm dev`, `pnpm worker`, and scripts are safe by default.
  - **Deliberate operations:**
    - Staging: `pnpm db:migrate:staging` or `dotenv -e .env.staging -- ...`
    - Production: `pnpm db:migrate:prod` or `dotenv -e .env.production -- ...`
  - **Railway** remains production-only; there is no hosted dev/staging worker/scraper (run locally on demand).
  - **Dev defaults** have destructive switches OFF: `X_ENABLED=false`, `CHANNEL_PUSH_ENABLED=false`, `TRANSLATE_ENABLED=false`, `DAILY_NOTE_AUTOPUBLISH=false`. Enable individually when testing the full pipeline.
  - **Workflow:** push to `main` → GitHub Action fast-forwards `staging` → Vercel staging project deploys → verify → PR/merge `staging` into `production` → Vercel production project deploys.
- Sources with login walls (Amazon SC, Temu) captured via secondary media sources only — never scrape authenticated sessions

## Dev Commands
```bash
pnpm dev                 # start Next.js dev server (port 3000)
pnpm worker              # start pg-boss worker process (scheduler+crawl+ingest+process)
pnpm db:gen              # generate Prisma Client
pnpm db:validate         # validate schema without applying migrations
pnpm db:migrate          # run Prisma migrations against Neon dev (uses .env)
pnpm db:migrate:staging  # run Prisma migrations against Neon staging (uses .env.staging)
pnpm db:migrate:prod     # run Prisma migrations against Neon production (uses .env.production)
pnpm db:studio           # open Prisma Studio
pnpm lint                # TypeScript noEmit
pnpm test                # vitest; Foundation DB suites require an approved non-production Neon branch
pnpm build               # Prisma generate + Next.js production build
./scripts/release.sh patch|minor|major
```

`scripts/backfill-phase1-foundation.ts --apply` has an in-code endpoint allowlist and must only run against the specifically approved isolated Neon endpoint. There is no force override. Never run it against production.

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

## Phase 1 execution state

- Foundation plan: `docs/superpowers/plans/2026-07-23-tradelinks-phase1-foundation.md` — complete, 8/8 Pact tasks accepted.
- Verification: `docs/superpowers/verification/2026-07-28-tradelinks-phase1-foundation-verification.md`.
- Next plan: `docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md`.
- Private relevance and operations/cost plans remain planned, not implemented.
- P0 is not achieved until the new pipeline and public surfaces complete a continuous seven-day stability run.

<!-- pact:begin (managed by pactify — edit outside this block) -->
# pact protocol

This repo uses the **pact protocol** (v1). Seats (who does what) are listed in
`.pact/PROJECT.md` and `.pact/STATE.yml`.

**Your identity — bind it to this working copy first.** Your seat is resolved
from `PACT_AGENT_ID` (env), else the untracked `.pact/seat` file. Set the
file once per working copy:
```bash
pactify seat use <your-seat-id>   # from the roster in .pact/PROJECT.md
```
For concurrent seats in the same repo, use a separate git worktree per seat.

**Primary — MCP:** the `pact` MCP server is wired into your config. Use its tools
(projects / status / join / assign / checkpoint / accept / changes / merge / validate) and
resources (`pact://state`, `pact://log`). Cold start: call `status`, then `join`
(registers your seat and checks out your feature branch). Every action tool takes an
optional `project` (a name from `projects`) to act on another registered repo without
restarting — default is this repo.

**Fallback — shell** (if MCP is unavailable):
```bash
pactify seat use <your-seat-id>   # if not already bound
pactify join --roles <your-roles>
```
then `pactify help` for the verbs.

**The two rules:** a worker cannot self-accept (only the task's reviewer accepts); a
feature cannot merge until all its tasks are accepted.
<!-- pact:end -->
