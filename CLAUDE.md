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
**Version:**  v0.1.0

**Technical docs:** [Architecture](docs/architecture.md) · [Deployment](docs/deployment.md) · [Operations](docs/operations.md) · [Sources](docs/specs/sources.md)

## Tech Stack
| Layer | Tech |
|-------|------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| API | Next.js Route Handlers |
| Workers | BullMQ + Redis (crawl/process jobs) |
| Database | PostgreSQL 16 + trigram GIN index + time-series views |
| AI (bulk) | DeepSeek V3.2 — translation, pre-filter, categorize |
| AI (score) | DeepSeek V4 Pro — urgency scoring, trend signal, summaries |
| AI (multilingual fallback) | Qwen-Plus — AR/ID/TH/PT small-lang docs |
| Scraping | Playwright (JS-heavy) + fetch (RSS/JSON) |
| Email | Resend |
| Push | Telegram Bot API + Slack Webhooks |
| Auth | NextAuth.js v5 |
| Payment | Stripe (USD, global) |
| Hosting | Vercel (frontend) + Railway (workers + Postgres + Redis) |

## Key Implementation Details
- Alert pipeline forks at classification: urgency×impact score ≥4 triggers immediate push; <4 queues to daily digest
- Trend diffusion: cross-region time-series alignment (Google Trends slope + Amazon BSR rank delta + TikTok CC mentions) — 3-source consensus required before marking a signal
- All items tagged with `region[]` + `platform[]` + `category` — push routing is subscription-filter based, never broadcast
- DeepSeek API requires `User-Agent: Mozilla/5.0` workaround for some fetch contexts
- Postgres trigram: `CREATE EXTENSION pg_trgm; CREATE INDEX ON items USING GIN (title gin_trgm_ops)`
- Sources with login walls (Amazon SC, Temu) captured via secondary media sources only — never scrape authenticated sessions

## Dev Commands
```bash
pnpm dev          # start Next.js dev server (port 3000)
pnpm worker       # start BullMQ worker process
pnpm db:migrate   # run Prisma migrations
pnpm db:studio    # open Prisma Studio
pnpm test         # vitest
./scripts/release.sh patch|minor|major
```

## Release 后必做
1. `.agent/CURRENT.md`：补充 Version History 描述 + Last Updated
2. 更新 Current Sprint Summary
3. 如有 schema 变更：更新 `docs/architecture.md` 数据模型节
