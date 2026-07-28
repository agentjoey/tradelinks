# TradeLinks — System Architecture

> Last updated: 2026-07-28 · v0.12.0 + Phase 1 Foundation (staging only)

## Overview

TradeLinks 当前线上仍运行**数据摄取 → AI 处理 → 精选分发**的 legacy 管道；Phase 1 Foundation 在同一 schema 中以 additive、forward-only 方式加入来源契约、采集账本、规范化情报、结构化证据、不可变版本与 coverage readiness。Public Intelligence 和 Private Relevance 尚未切换读写路径。

## Implementation Status

| Layer | Repository state | Production state |
|-------|------------------|------------------|
| Legacy Wire / Radar / Daily | Preserved for current traffic | Live |
| Phase 1 Foundation | Complete; 8/8 Pact tasks accepted; Draft PR #3 | Vercel/Neon staging only; production unchanged |
| Public Intelligence | Detailed plan only | Not started |
| Private Relevance | Detailed plan only | Not started |
| Operations / cost cutover | Detailed plan only | Not started |

Foundation validation used the approved non-production Neon branch. Migrations `0011` and `0012`, legacy backfill apply/replay, 426 tests, and the production build passed there. The migrations are now also applied on Neon staging and commit `91a7d25` is live on a protected Vercel staging Preview; staging backfill remains dry-run only and production is unchanged.

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
│  STORAGE LAYER (PostgreSQL 16 on Neon)                          │
│                                                                 │
│  sources          — source registry (25 active / 16 disabled)   │
│  items            — all ingested items (trigram GIN; url canon.) │
│  alerts           — classified + scored alert objects           │
│  trend_snapshots  — time-series: region × category × date rank  │
│  trend_signals    — cross-region diffusion signals              │
│  source_health_snapshots — daily per-source health (monitoring) │
│  pipeline_runs/source_checks — explicit run + per-source outcome │
│  EvidenceCluster/Member — deterministic evidence grouping       │
│  CanonicalChange/Version — immutable canonical intelligence     │
│  EvidenceRecord — role/authority/access/review provenance       │
│  CoverageCapability/CapabilitySource — truthful promise ceiling │
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
│    /admin/review  — canonical version/evidence review desk      │
│    /admin/sources — source health + coverage readiness          │
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

## Phase 1 Intelligence Foundation (accepted, additive, not deployed)

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

Implementation also includes:

- `PipelineRun` and `SourceCheck`, which distinguish successful-empty checks from failures and make replay/idempotency explicit.
- typed market/platform/stage/signal/category/risk/policy dimensions rather than overloading the legacy `Category` enum.
- deterministic clustering and classification with manual-review thresholds and gold fixtures.
- a conservative legacy backfill: generated versions are `EXPERIMENTAL`, `IN_REVIEW`, non-current, and all inherited evidence is `SECONDARY_CONTEXT`.
- `CoverageCapability` seeding and one-way degradation to `STALE`; source recovery never silently promotes a capability without human review.

Migration `0012_phase1_publication_review_fields` (task 6, additive and
forward-only — `0011` is never edited or replayed) adds two nullable review
facts to `CanonicalChangeVersion` that `0011` could not represent:

- `classificationConfidence Float?` — the real classifier confidence persisted
  on classification-created drafts. Never inferred from readiness and never
  synthesized for display; null renders as "unavailable".
- `rejectionReason String?` — the explicit, non-blank reason required and
  persisted when a draft is rejected (with `reviewedAt`/`reviewedBy`).

Both columns are nullable so the additive migration does not rewrite or
invalidate pre-existing rows. Rollback of `0012` is a code/read-path rollback
that leaves the nullable columns in place; never run a down migration.

**Rollback checkpoint (forward-only).** Pre-migration checkpoint branch:
`phase1-foundation-pre-migration` (`br-plain-shadow-aoknpdf3`, project
`steep-bird-11404641`, parent `production`, expires 2026-07-30T12:00:00Z).
Procedure: stop new writers, route readers back to the pre-cutover public
release, **retain the additive tables**, compare row counts/content hashes, and
ship a **forward corrective migration**. The static pre-migration checkpoint is
the branch's **creation-time snapshot** (`2026-07-23T11:28:15Z`), not the
branch's current mutable head, which has since received migrations and test
writes. Investigation restores create a **new branch** from that historical
point (or from the untouched production parent as appropriate); never overwrite
production in place.

**Accepted verification snapshot (2026-07-28).** Repeated backfill dry-runs produced fingerprint `7b91ebd2cf2a6179c42c7f67af964cc3ae38318e96b3a1b905a87880c7ec5332`, all five pending-write counters were zero after apply/replay, and 18 legacy Alerts were explicitly rejected as `SOURCE_NOT_FOUND`. The integrated gate passed Prisma validation, TypeScript, 53 test files / 426 tests, and the Next.js production build. See `docs/superpowers/verification/2026-07-28-tradelinks-phase1-foundation-verification.md`.
