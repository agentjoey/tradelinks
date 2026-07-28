# TradeLinks — Deployment Guide

> Last updated: 2026-07-28 · v0.12.0 + Phase 1 Foundation | Infra: ADR-003/004 (Neon + Railway + Vercel, no Redis)

> **Foundation release boundary:** commit `91a7d25` is deployed to protected Vercel
> staging Preview and Neon staging has migrations `0011` and `0012`. The staging
> backfill is dry-run only. Production remains unchanged. Before production rollout,
> create a fresh Neon production checkpoint, apply migrations forward, rerun the
> dry-run/rejection audit, and obtain a separate deployment approval. Never use a down
> migration for rollback.

## Stack Overview

| Service | Provider | What runs there |
|---------|----------|-----------------|
| Next.js app (Wire / Radar / Desk / API / RSS) | **Vercel** | read-only frontend + API + admin (server actions) |
| Node worker (pg-boss) + Python Scraper (FastAPI) | **Railway** | crawl → AI → dedup → score → write alerts; trends |
| PostgreSQL 16 (data + pg-boss queue) | **Neon** | shared DB; Vercel reads, worker writes |

**Split:** Vercel only reads/serves; all ingestion/AI happens on Railway. They
share Neon. Deploying Vercel does NOT deploy the worker (separate `railway up`).

## Git / Vercel / Neon branch mapping

| Git branch | Vercel project | Neon branch | Purpose |
|------------|----------------|-------------|---------|
| `main` | `tradelinks-mvp` (Preview) | `dev` | integration branch; local dev + PR previews |
| `staging` | `tradelinks-mvp-staging` (Production) | `staging` | pre-prod verification; auto-promoted from `main` |
| `production` | `tradelinks-mvp-production` (Production) | `production` | live site; promoted from `staging` via PR |

**Promotion flow:**
1. Developer pushes to `main`.
2. GitHub Action `.github/workflows/promote-main-to-staging.yml` fast-forwards `staging` to `main`.
3. Vercel `tradelinks-mvp-staging` deploys `staging` branch.
4. Verify on staging.
5. Create PR from `staging` → `production`; merge to release.
6. Vercel `tradelinks-mvp-production` deploys `production` branch.

## Deploy to Vercel

We use **two Vercel projects** so that `staging` gets a stable production-like
deployment (its own domain, production build pipeline, and environment variables)
rather than being mixed into the generic "Preview" tier.

### 1. Production project (`tradelinks-mvp-production`)

1. Create a new Vercel project and import `agentjoey/tradelinks`.
2. Settings → Git → **Production Branch** = `production`.
3. Build command: `prisma generate && next build` (same as `vercel.json`).
4. Environment Variables (Production scope only):
   - `DATABASE_URL` → Neon **production** branch pooled URL; append `&connection_limit=1`.
   - `NEON_AUTH_BASE_URL` → production branch auth URL.
   - Other app-only vars (Telegram/Slack push tokens are optional).
5. Add custom domain (e.g. `tradelinks-mvp.vercel.app` or your own domain).

### 2. Staging project (`tradelinks-mvp-staging`)

1. Create another Vercel project and import the same repo.
2. Settings → Git → **Production Branch** = `staging`.
3. Build command: `prisma generate && next build`.
4. Environment Variables (Production scope only):
   - `DATABASE_URL` → Neon **staging** branch pooled URL; append `&connection_limit=1`.
   - `NEON_AUTH_BASE_URL` → staging branch auth URL.
   - `NEXT_PUBLIC_GA_ID` → use a staging GA property or leave empty.
5. Add custom domain (e.g. `staging.tradelinks-mvp.vercel.app`).

### 3. Preview / dev project (`tradelinks-mvp`)

This is the original project. It now treats `main` and all other branches as
**Preview** deployments.

1. Settings → Git → **Production Branch** = `production` (so `main` never deploys
   to this project's Production slot; it becomes a Preview).
2. Environment Variables:
   - **Preview** scope: `DATABASE_URL` → Neon **dev** branch pooled URL.
   - **Development** scope: `DATABASE_URL` → Neon **dev** branch pooled URL.
3. Keep this project for local `vercel dev` and PR previews.

> If you prefer to retire the old project and create a third "dev" project, you
> can, but it is not required — Preview deployments are sufficient for dev/PR
> verification.

## Environment Variables

```bash
# Postgres (Neon) — TWO urls required
#   DATABASE_URL = pooled (host contains "-pooler"), used by Next.js + worker runtime
#   DIRECT_URL   = direct (no "-pooler"), used by Prisma migrations + pg-boss
DATABASE_URL=postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/tradelinks?sslmode=require&pgbouncer=true&connection_limit=1
DIRECT_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/tradelinks?sslmode=require

# AI
DEEPSEEK_API_KEY=...
QWEN_API_KEY=...

# Python scraper service
SCRAPER_SERVICE_URL=http://scraper.railway.internal:8000

# Email / Push / Auth
RESEND_API_KEY=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...
SLACK_SIGNING_SECRET=...
NEON_AUTH_BASE_URL=...
NEON_AUTH_COOKIE_SECRET=...
ADMIN_EMAILS=editor@example.com

# Safety switches — dev defaults OFF; staging/production defaults ON
X_ENABLED=false
CHANNEL_PUSH_ENABLED=false
TRANSLATE_ENABLED=false
DAILY_NOTE_AUTOPUBLISH=false
```

Local env files:
- `.env` → Neon `dev`
- `.env.staging` → Neon `staging`
- `.env.production` → Neon `production`

## Neon Setup

1. Create Neon project → DB `neondb`.
2. Copy **pooled** connection string (host has `-pooler`) → `DATABASE_URL`.
3. Copy **direct** connection string (no `-pooler`) → `DIRECT_URL`.
4. Create branches from `production`:
   - `dev` — local development / PR previews.
   - `staging` — pre-prod verification.
5. After creating `dev` and `staging`, immediately truncate the copied pg-boss
   state so a worker started against them doesn't replay production cron schedules:
   ```sql
   TRUNCATE pgboss.schedule; TRUNCATE pgboss.job; TRUNCATE pgboss.archive;
   ```
6. `pg_trgm` is enabled by migration `0002_trgm` (Neon allows the extension).

## Migration workflow (three-stage)

1. **Develop against dev:**
   ```bash
   pnpm db:migrate:dev   # create/apply migrations on Neon dev branch
   pnpm dev              # smoke-test the app
   pnpm worker           # smoke-test the worker (dev switches default OFF)
   ```
2. **Deploy to staging:**
   ```bash
   git push origin main  # GitHub Action promotes main → staging
   pnpm db:migrate:staging   # apply migrations to Neon staging
   ```
3. **Release to production:**
   - Create PR `staging` → `production`, review, merge.
   - `pnpm db:migrate:prod`  # apply migrations to Neon production

Each `db:migrate:*` command loads the correct env file so there is no risk of
accidentally pointing at the wrong branch.

## Deploy Steps

```bash
# 1. Local development / PR verification against dev
pnpm db:migrate:dev
pnpm dev
pnpm test

# 2. Push to main → auto-promotes to staging via GitHub Action
#    (triggers Vercel staging project deploy)
git push origin main

# 3. Apply migrations to staging (after GitHub Action completes)
pnpm db:migrate:staging

# 4. Verify on staging URL

# 5. Promote staging → production
#    Create PR in GitHub: staging → production, merge

# 6. Apply migrations to production (before or after Vercel deploy)
pnpm db:migrate:prod

# 7. Workers (Railway) — deploy after production schema is ready
railway up                 # Node worker service
# Python scraper service deploys from scraper-py/
```

## First Deploy Checklist

- [ ] Neon: project + `neondb` + `production` branch + `staging` branch + `dev` branch
- [ ] Capture pooled + direct URLs for all three branches into `.env`, `.env.staging`, `.env.production`
- [ ] Truncate `pgboss.schedule/job/archive` on `dev` and `staging`
- [ ] Railway: Node worker service + Python scraper service; set env vars
- [ ] Vercel: create `tradelinks-mvp-staging` and `tradelinks-mvp-production` projects
- [ ] Vercel: configure Production Branches (`staging` / `production`) and env vars
- [ ] GitHub: ensure `staging` and `production` branches exist
- [ ] GitHub Action `.github/workflows/promote-main-to-staging.yml` enabled
- [ ] `pnpm db:migrate:prod` against Neon production only after reviewing the complete forward migration set and taking a fresh checkpoint
- [ ] `pnpm worker:run-once --source=A02` → rows appear in Neon (Prisma Studio)
- [ ] Start worker → pg-boss creates `pgboss` schema; logs "workers online"
