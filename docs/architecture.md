# TradeLinks — System Architecture

> Last updated: 2026-06-03 v0.1.0

## Overview

TradeLinks 是一个**数据摄取 → AI 处理 → 精选分发**的 3 层管道系统，加上 Web 前端和多渠道推送。

```
┌─────────────────────────────────────────────────────────────────┐
│  INGESTION LAYER                                                │
│  RSS Adapter │ Fetch Adapter │ Playwright Adapter               │
│  BullMQ crawl-queue (Redis) — per-source cron schedule          │
└────────────────────────┬────────────────────────────────────────┘
                         │ raw items
┌────────────────────────▼────────────────────────────────────────┐
│  AI PROCESSING LAYER                                            │
│                                                                 │
│  [Stage 1 — Bulk / Cheap]                                       │
│  DeepSeek V3.2:  pre-filter spam → translate → categorize       │
│                  → tag region[] + platform[] + category         │
│  Qwen-Plus:      fallback for AR/ID/TH/PT small-lang docs       │
│                                                                 │
│  Dedup/Cluster:  trigram GIN similarity > 0.75 → mark dup       │
│                  same-event multi-source → merge into Alert     │
│                                                                 │
│  [Stage 2 — Quality / Scoring]                                  │
│  DeepSeek V4 Pro: urgency×impact score (0-5)                    │
│                   → generate EN summary + recommendation note   │
│                   → trend signal: slope + confidence            │
│                                                                 │
│  Human review queue: urgencyScore ≥ 4 alerts → editor verify   │
└────────────────────────┬────────────────────────────────────────┘
                         │ processed items / alerts / trends
┌────────────────────────▼────────────────────────────────────────┐
│  STORAGE LAYER (PostgreSQL 16 on Railway)                       │
│                                                                 │
│  sources          — source registry (58 sources, Phase1=25)     │
│  items            — all ingested items (trigram GIN index)      │
│  alerts           — classified + scored alert objects           │
│  trend_snapshots  — time-series: region × category × date rank  │
│  trend_signals    — cross-region diffusion signals              │
│  users / subs     — auth + subscription tiers                   │
│  keyword_watches  — user-defined keyword monitors               │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│  DISTRIBUTION LAYER                                             │
│                                                                 │
│  Website (Vercel / Next.js)                                     │
│    /          — alert timeline (region/category/platform filter)│
│    /trends    — trend dashboard + diffusion map                 │
│    /daily     — daily digest archive                            │
│    /api/public/* — REST API (OpenAPI 3.1)                       │
│                                                                 │
│  Push (urgencyScore ≥ 4 → immediate)                            │
│    Telegram Bot API + Slack Webhooks + Email (Resend)           │
│    Routing: user subscription filters (region × platform × cat) │
│                                                                 │
│  Scheduled (daily 00:00 UTC = 08:00 BJT)                        │
│    Daily digest generation (5-section EN) → bulk email          │
│                                                                 │
│  RSS Feed: /feed.xml                                            │
│  Agent Skill: /api/skill/                                       │
└─────────────────────────────────────────────────────────────────┘
```

## Data Model (Core Tables)

```sql
-- Source registry
sources: id, name, url, adapter (rss|fetch|playwright),
         frequency_cron, language, regions[], platforms[],
         category_hint, is_active, last_crawled_at

-- Raw + processed items
items: id (cuid), source_id, url, title, title_en,
       summary_en, published_at, crawled_at,
       regions[] (north-america|europe|southeast-asia|middle-east|
                  latin-america|australia-nz),
       platforms[], category (regulatory|platform-policy|logistics|
                              trend|industry|tip),
       urgency_score (0.0-5.0), impact_scope (text),
       recommendation (text), is_duplicate, cluster_id,
       raw_content (jsonb)

-- Merged alert objects
alerts: id, cluster_id, title, summary, urgency_score,
        regions[], platforms[], category, affected_skus[],
        action_required (text), source_urls[], is_published,
        published_at, reviewed_by

-- Time-series trend snapshots
trend_snapshots: id, date, region, category, keyword,
                 rank_amazon_bsr, trends_score_google,
                 tiktok_mention_count, signal_strength (0-1)

-- Cross-region diffusion signals
trend_signals: id, keyword, origin_region, spreading_to[],
               confidence (0-1), first_seen_at, signal_basis (text)
```

## Trend Diffusion Algorithm (v1)

Three-source consensus rule:
```
IF google_trends_slope[region_A] > 0.3 (7-day normalized)
AND amazon_bsr_rank_delta[region_A] < -500 (rising)
AND tiktok_mentions[region_A, 7d] > threshold
→ mark region_A as "active"

FOR each other region_B NOT active:
  IF region_A active AND region_B shows early signal (any 1 source)
  → emit trend_signal { origin: A, spreading_to: [B], confidence: 0.4-0.7 }
```

## Alert Push Routing

```
alert.urgency_score
  ≥ 4.0  → immediate push (Telegram + Slack + Email)
           filter: users subscribed to alert.regions[] ∩ alert.platforms[]
  2-3.9  → daily digest bucket
  < 2.0  → website-only (not pushed)
```

## Hosting & Infra

| Component | Host | Notes |
|-----------|------|-------|
| Next.js app | Vercel | serverless |
| Workers (BullMQ) | Railway | always-on service |
| PostgreSQL 16 | Railway | 1 GB starter |
| Redis | Railway | BullMQ queue backend |
| Images proxy | `/api/img-proxy` | Vercel edge function |
