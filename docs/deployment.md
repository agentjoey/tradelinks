# TradeLinks — Deployment Guide

> Last updated: 2026-06-04 v0.5.x | Infra: ADR-003/004 (Neon + Railway + Vercel, no Redis)

## Stack Overview

| Service | Provider | What runs there |
|---------|----------|-----------------|
| Next.js app (Wire / Radar / Desk / API / RSS) | **Vercel** | read-only frontend + API + admin (server actions) |
| Node worker (pg-boss) + Python Scraper (FastAPI) | **Railway** | crawl → AI → dedup → score → write alerts; trends |
| PostgreSQL 16 (data + pg-boss queue) | **Neon** | shared DB; Vercel reads, worker writes |

**Split:** Vercel only reads/serves; all ingestion/AI happens on Railway. They
share Neon. Deploying Vercel does NOT deploy the worker (separate `railway up`).

## Deploy to Vercel (Next.js app)

1. Import `agentjoey/tradelinks-mvp` into Vercel (framework auto-detected: Next.js).
2. Build command is pinned in `vercel.json`: `prisma generate && next build`
   (Prisma client must be generated at build — verified locally).
3. Set Environment Variables (Production):
   - `DATABASE_URL` — Neon **pooled** url; append `&connection_limit=1` for
     serverless functions (each lambda holds its own tiny pool).
   - `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`/`SLACK_WEBHOOK_URL` — only if you
     want approve-on-Desk to push (server action calls dispatchPush). Optional.
   - (The app does NOT need AI keys — classification/scoring run on the worker.)
4. Deploy. Pages are `force-dynamic` (live from Neon); the Prisma client has a
   cold-start retry wrapper so Neon scale-to-zero won't surface as 500s.
5. `.vercelignore` trims scraper-py/.agent/docs/test from the upload.

> Auth on `/admin/review` is not yet implemented (Sprint 005) — protect it via
> Vercel password protection or deploy behind a preview-only URL until then.

## Environment Variables

```bash
# Postgres (Neon) — TWO urls required
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/tradelinks?sslmode=require&pgbouncer=true
DIRECT_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/tradelinks?sslmode=require  # also used by pg-boss

# AI
DEEPSEEK_API_KEY=...
QWEN_API_KEY=...

# Python scraper service
SCRAPER_SERVICE_URL=https://tradelinks-scraper.up.railway.app

# (Sprint 003+) Email / Push / Auth / Stripe
RESEND_API_KEY=...
TELEGRAM_BOT_TOKEN=...
SLACK_SIGNING_SECRET=...
NEXTAUTH_SECRET=...
STRIPE_SECRET_KEY=...
```

## Neon Setup

1. Create Neon project → DB `tradelinks`.
2. Copy **pooled** connection string (host has `-pooler`) → `DATABASE_URL`.
3. Copy **direct** connection string (no `-pooler`) → `DIRECT_URL`.
4. Create a `dev` branch for local development / integration tests.
5. `pg_trgm` is enabled by migration `0002_trgm` (Neon allows the extension).

## Deploy Steps

```bash
# 1. Migrations (uses DIRECT_URL)
pnpm db:migrate            # prisma migrate deploy

# 2. Seed sources
pnpm db:seed:sources       # (to be added) loads src/config/sources.ts

# 3. Frontend (auto via Vercel git integration)
git push origin main

# 4. Workers (Railway)
railway up                 # Node worker service
# Python scraper service deploys from scraper-py/ (Sprint 001 T6)
```

## First Deploy Checklist

- [ ] Neon: project + `tradelinks` db + `dev` branch; capture pooled + direct URLs
- [ ] Railway: Node worker service + Python scraper service; set env vars
- [ ] Vercel: connect repo, set env vars (pooled `DATABASE_URL`)
- [ ] `pnpm db:migrate` against Neon (runs 0001_init + 0002_trgm)
- [ ] `pnpm worker:run-once --source=A02` → rows appear in Neon (Prisma Studio)
- [ ] Start worker → pg-boss creates `pgboss` schema; logs "workers online"
