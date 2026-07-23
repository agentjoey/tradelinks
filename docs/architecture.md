# TradeLinks — System Architecture

> Last updated: 2026-06-05 v0.7.0

## Overview

TradeLinks 是一个**数据摄取 → AI 处理 → 精选分发**的 3 层管道系统，加上 Web 前端和多渠道推送。

```
┌─────────────────────────────────────────────────────────────────┐
│  INGESTION LAYER (polyglot — see ADR-002)                       │
│                                                                 │
│  Node/TS worker (pg-boss crawl-queue; scheduler-tick fan-out):  │
│    RSS Adapter │ Fetch Adapter  — simple sources (~50%)         │
│    blocked-detection → route hard sources to scrape-queue       │
│                                                                 │
│  Python Scraper Service (Scrapling + FastAPI):                  │
│    StealthyFetcher — Amazon BSR (anti-bot). SERIALIZED: one     │
│      Chromium at a time (global lock) + worker batchSize=1;     │
│      disable_resources + --disable-dev-shm-usage; cf-solve OFF  │
│    Smart Element Tracking — self-healing selectors on redesign  │
│    pytrends — Google Trends (trends-tick worker, not scheduler) │
│    results → pg-boss ingest-queue (same schema as TS adapters)  │
│    503 + 1-line log on failure (no traceback flood)             │
└────────────────────────┬────────────────────────────────────────┘
                         │ raw items
┌────────────────────────▼────────────────────────────────────────┐
│  AI PROCESSING LAYER                                            │
│                                                                 │
│  [Stage 1 — Bulk / Cheap]  (deepseek-v4-flash, ADR-005)         │
│  pre-filter spam → translate → categorize                       │
│                  → tag region[] + platform[] + category         │
│  Qwen-Plus:      fallback for AR/ID/TH/PT small-lang docs       │
│                                                                 │
│  Dedup/Cluster:  trigram GIN similarity > 0.75 → mark dup       │
│                  same-event multi-source → merge into Alert     │
│                                                                 │
│  [Stage 2 — Quality / Scoring]  (MiniMax-M2, Anthropic-compat)  │
│                   urgency×impact score (0-5)                    │
│                   → generate EN summary + recommendation note   │
│                                                                 │
│  Human review queue: urgencyScore ≥ PUSH_THRESHOLD → editor     │
│                                                                 │
│  ⑂ Bestseller fork: scrapling BSR sources (D02–D06, D30–D34)   │
│    SKIP this layer — stored as terminal `processed`, tagged     │
│    region/platform/category, feed the Radar board (not Wire)    │
└────────────────────────┬────────────────────────────────────────┘
                         │ processed items / alerts / trends
┌────────────────────────▼────────────────────────────────────────┐
│  STORAGE LAYER (PostgreSQL 16 on Railway)                       │
│                                                                 │
│  sources          — source registry (25 active / 16 disabled)   │
│  items            — all ingested items (trigram GIN; url canon.) │
│  alerts           — classified + scored alert objects           │
│  trend_snapshots  — time-series: region × category × date rank  │
│  trend_signals    — cross-region diffusion signals              │
│  source_health_snapshots — daily per-source health (monitoring) │
│  users            — auth + subscription tiers                   │
│  keyword_watches  — user-defined keyword monitors               │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────────┐
│  DISTRIBUTION LAYER                                             │
│                                                                 │
│  Website (Vercel / Next.js)                                     │
│    /          — Wire: alert timeline (region/category filter)   │
│    /trends    — Radar: Bestsellers board + diffusion signals    │
│    /admin/review  — editor review queue (≥ threshold alerts)    │
│    /admin/sources — source-health dashboard (monitoring)        │
│    /api/public/* — REST API                                     │
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

| Component | Host | Notes (ADR-003) |
|-----------|------|-------|
| Next.js app | Vercel | serverless |
| Node worker + Python Scraper | Railway | always-on services |
| PostgreSQL 16 | **Neon** | serverless, scale-to-zero, built-in PgBouncer pooler, DB branching, pg_trgm |
| Queue | **pg-boss on Neon** | no Redis (ADR-004); `pgboss` schema; uses DIRECT_URL |
| Images proxy | `/api/img-proxy` | Vercel edge function |

**Connection wiring:** runtime (Vercel + Railway workers) → Neon **pooled** `DATABASE_URL`;
`prisma migrate` → Neon **direct** `DIRECT_URL`. Local dev/test → Neon dev branch.
pg-boss pins `sslmode=verify-full` on its connection (silences the `pg` v9 deprecation).

## Queues & Scheduling (pg-boss)

One queue per stage: `crawl · scrape · ingest · process · score · trends-tick · source-health-tick`.
A per-minute `scheduler-tick` fans out crawl jobs (cron-parser `isDue()` per source).
Daily schedules: trends-tick `0 2 * * *`, source-health-tick `30 2 * * *`.

**Retention (storage guard):** completed jobs are deleted after **30 min**
(`retentionMinutes: 30`, `deleteAfterMinutes: 30`, maintenance every 5 min), and the
scrape queue runs `batchSize: 1`. Without this, ingest jobs (which carry the full
scraped items array as JSONB) bloated pg-boss to ~300 MB and nearly filled Neon's
0.5 GB. See operations.md.

## Monitoring & Source Health

`src/monitoring/health.ts` computes a **0–100 health score** per source =
reachability(40) + cadence(20) + productivity(20) + quality(20), mapped to a tier:
🟢 Healthy / 🟡 Degraded / 🔴 Unhealthy / 💀 Silent (active but 0 items — the
"200 OK but empty" detector) / ⏸ Disabled. Bestseller sources are judged on volume
(they bypass AI). `getSourceHealth()` is a single aggregate query (no writes).

- **`/admin/sources`** renders it live, worst-first, with sub-score bars + 7-day sparkline.
- **`source-health-tick`** (daily) writes a `source_health_snapshots` row per source
  and Telegram-pings any source that newly crosses into 🔴/💀 (baseline-only on first run).

## Dedup / URL canonicalization

`normalizeUrl()` (used by `urlHash` and the stored `item.url`) drops tracking params and
**canonicalizes Amazon `/dp/<ASIN>`** (any TLD) — the per-crawl `/ref=…/<session-id>`
suffix otherwise defeats dedup and re-stores the same products every crawl.

## Phase 1 Intelligence Foundation (additive, 2026-07-23)

Migration `0011_phase1_intelligence_foundation` adds the forward-only canonical
content chain alongside the legacy tables above (nothing dropped or renamed).
During the cutover both chains coexist; legacy writers/readers are untouched.

```
Source → Item → EvidenceCluster → CanonicalChange → CanonicalChangeVersion
                                           └────→ EvidenceRecord
SourceCheck and PipelineRun record checks independently from new-item volume.
```

- `CanonicalChangeVersion` rows are immutable versions; publication advances by
  creating a new current version, never by editing in place. The partial unique
  index `"CanonicalChangeVersion_one_current"` on
  `"CanonicalChangeVersion"("canonicalChangeId") WHERE "isCurrent" = true`
  guarantees a canonical change has **at most one current version** (enforced in
  `test/canonical-publish.test.ts`; raw SQL, like 0002's trigram indexes, because
  the Prisma datamodel cannot express partial indexes).
- `Source` gains additive contract fields (`authorityLevel`, `readiness`,
  `freshnessSlaMinutes`, `fetchMethod`, `degradationPolicy`, `userPromise`,
  `readinessReason`, `lastReviewedAt`) — all nullable so legacy rows are
  untouched. `adapter` and `frequencyCron` stay until the operations cutover
  because the existing worker still consumes them.
- `CoverageCapability`/`CapabilitySource` record what TradeLinks can truthfully
  promise per market/platform/category, and which sources back each promise.

**Rollback checkpoint (forward-only).** Pre-migration checkpoint branch:
`phase1-foundation-pre-migration` (`br-plain-shadow-aoknpdf3`, project
`steep-bird-11404641`, parent `production`, expires 2026-07-30T12:00:00Z).
Procedure: stop new writers, route readers back to the pre-cutover public
release, **retain the additive tables**, compare row counts/content hashes, and
ship a **forward corrective migration**. Restore the checkpoint branch only into
a **new branch** for investigation; never overwrite production in place.
