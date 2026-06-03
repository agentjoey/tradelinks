# TradeLinks — Deployment Guide

> Last updated: 2026-06-03 v0.1.0

## Stack Overview

| Service | Provider | Tier |
|---------|----------|------|
| Frontend + API routes | Vercel | Hobby → Pro when traffic grows |
| Workers (BullMQ) | Railway | Starter ($5/mo) |
| PostgreSQL 16 | Railway | Starter (1GB) |
| Redis | Railway | Starter |

## Environment Variables

```bash
# Database
DATABASE_URL=postgresql://...

# Redis
REDIS_URL=redis://...

# AI
DEEPSEEK_API_KEY=...
QWEN_API_KEY=...         # Alibaba Cloud, for AR/ID/TH/PT fallback

# Email
RESEND_API_KEY=...
FROM_EMAIL=alerts@tradelinks.io

# Push
TELEGRAM_BOT_TOKEN=...
SLACK_SIGNING_SECRET=...

# Auth
NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://tradelinks.io

# Payments
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...

# App
NEXT_PUBLIC_APP_URL=https://tradelinks.io
```

## Deploy Commands

```bash
# Frontend (auto-deploys via Vercel git integration)
git push origin main

# Workers
railway up   # from tradelinks-mvp/

# DB migrations
pnpm db:migrate:prod
```

## First Deploy Checklist

- [ ] Railway: provision PostgreSQL + Redis + Worker service
- [ ] Vercel: connect repo, set env vars
- [ ] Run `pnpm db:migrate:prod`
- [ ] Seed sources: `pnpm db:seed:sources`
- [ ] Start worker: verify BullMQ queue connects
- [ ] Test crawl: `pnpm worker:run-once --source=F01`
- [ ] Verify items appear in Prisma Studio
