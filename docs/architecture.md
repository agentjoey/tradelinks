# TradeLinks — System Architecture

> Last updated: 2026-08-24 · v0.12.0 + Phase 1 Foundation + Operations + Public Intelligence（全部在 main 与 production）

## Overview

Phase 1 已经切换：Public Intelligence 的新公开面（`/changes`、各 platform/category hub、`/briefings`、feeds、OpenAPI）已是生产流量入口，legacy Wire/Radar/Daily 路由 308 到契约目标（完全可逆，见 `.agent/CURRENT.md` Task 9b）。Railway 八个 finite-job cron 服务（`collect-fast/standard/slow`、`canonicalize`、`publish`、`public-briefing`、`health`、`cost-report`）跑的是 `main` 分支，取代了原先 pg-boss + 常驻 worker 的拓扑；pg-boss 仍在仓库中但不再是生产路径的关键依赖。cluster → CanonicalChange 促成机制已上线并持续运行。Private Relevance 与 Seller Profile 尚未开始。

## Implementation Status

| Layer | Repository state | Production state |
|-------|------------------|------------------|
| Legacy Wire / Radar / Daily | Preserved, routes 308 to Public Intelligence equivalents | Redirected, not removed (rollback path) |
| Phase 1 Foundation | Complete; 8/8 Pact tasks accepted | Migrations `0011`/`0012` on production |
| Public Intelligence | Complete; 10/10 Pact tasks accepted | **Live** — cutover flag on, serving production traffic |
| Private Relevance | Detailed plan only | Not started |
| Operations / cost cutover | Finite-job topology complete; pact task `railway-cutover` still `awaiting_review` in the ledger despite the cron services already running on `main` in production — ledger needs reconciling, not a code gap | Railway cron topology is production, legacy pg-boss worker retired from the critical path |

Foundation validation used the approved non-production Neon branch before rollout. Public Intelligence and Operations were verified the same way, then rolled straight to production per owner decision to skip a separate staging soak (`.agent/CURRENT.md`, 2026-08-05). Migrations through `0014` are on production; see the per-migration notes below and the Operational Alerts section.

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
│  OperationalAlertState — per (code,subjectId) alert lifecycle,  │
│    24h cooldown + resolved-notice state (0014, see below)       │
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

### Phase 1 topology (live in production since 2026-08-05)

Eight short-lived Railway Cron services call `pnpm job --name <job>` and exit: `collect-fast`, `collect-standard`, `collect-slow`, `canonicalize`, `publish`, `public-briefing`, `health`, and `cost-report`. `PipelineRun` plus PostgreSQL advisory locks provide stable slot identity and prevent concurrent duplicate work. Exact schedules and rollback steps are in `docs/operations/phase1-runbook.md`.

The pact ledger still lists the `railway-cutover` task as `awaiting_review`, but the cron services have been running `main` in production since 2026-08-05 (`.agent/CURRENT.md`) — this is a ledger-reconciliation gap, not an unstarted cutover. `tradelinks-legacy-worker` (the old `next start`-based worker) is a dead, unstable service that carries no live pipeline traffic and is a deletion candidate, not a rollback path.

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

## Phase 1 Public Intelligence (accepted, merged to `main`, not on production)

Migration `0013_phase1_public_content` is additive and forward-only: five new
tables, zero destructive statements, nothing dropped or renamed. It sits beside
both the legacy tables and the `0011`/`0012` canonical chain.

> **Numbering trap.** The plan calls the *retirement* migration
> `0013_retire_wire_radar_daily`. `0013` is taken by this one. The retirement
> migration is **`0014`** and has not been written.
>
> **Retirement-set trap (found 2026-08-04).** The plan lists the retirement set as
> `alerts`, `daily_notes`, `items`, legacy `clusters`. **`items` must not be
> dropped.** `EvidenceClusterMember` holds a foreign key to it, `collect-batch`
> writes it through `insertItemsDeduped()`, and `canonicalize-batch` reads it to
> build the evidence chain — both jobs run in production. `items` is shared
> infrastructure the legacy product merely used first. `alerts` is also still
> read by the live BL-039 channel push (`src/push/channel-db.ts`,
> `src/workers/channel-push.ts`), which must be retired or repointed in the same
> release. See the cutover runbook §0.

```
CanonicalChangeVersion ──→ BriefingEntry ──→ Briefing
Guide ──→ GuideEvidence ──→ Source
LegacyRedirect (old path → new path, default 308)
```

- `Guide` / `GuideEvidence` — evergreen sourced guides. A guide is publishable
  only with at least two official source records, a non-null `reviewedBy` and
  `lastReviewedAt`, and readiness at `MONITORED` or better. The Phase 1 corpus
  is nine machine-authored **drafts** that fail every one of those gates by
  construction and therefore cannot render publicly.
- `Briefing` / `BriefingEntry` — weekly, monthly and conditional-daily reports.
  Each entry **pins a version id**, so a briefing is a stable snapshot rather
  than a live query. A correction produces a new fingerprint and review event;
  published briefings are never edited in place. Weekly consumes the Operations
  shadow-qualification run through `PipelineRun` (`jobType: BRIEFING`,
  `outputFingerprint`, ordered ids in `metadata`) — never by importing Track A
  code. No finished run means no weekly briefing, never a locally computed
  ordering.
- `LegacyRedirect` — old-path → new-path rows for the cutover, default status
  308. Written by Task 9b only; Task 9a ships the plan, not the rows.

### The public read contract

Every public surface — pages, RSS, API v1, briefings, Telegram — reads through
one serializer, and the invariant is enforced in `src/public-intelligence/query.ts`:

```
isCurrent AND editorialStatus = PUBLISHED AND reviewedAt IS NOT NULL
       AND readiness IN ('MONITORED','VERIFIED')
```

Nothing else is public. The Foundation backfill deliberately produces
`EXPERIMENTAL` / `IN_REVIEW` / non-current versions with `SECONDARY_CONTEXT`
evidence, so **backfilled rows are not publishable content** — only human
editorial review through `/admin/review` moves a version across that line.

Two consequences worth stating because they look like bugs and are not:

- A hub whose `CoverageCapability` is below `MONITORED` — including `STALE` from
  overdue sources — returns a **real 404**, not an empty page. A route-group
  `loading.tsx` above such a route would flush the shell before `notFound()` and
  turn that into a soft 200; `test/e2e/public-hubs.spec.ts` locks against it.
- With no data pipeline running, the public site is largely empty *by design*.
  That is the product refusing to imply coverage it does not have.

### Theme default

`app/globals.css` carries light values on `:root` and dark on
`[data-theme="dark"]` — inverted from the BL-045 arrangement. The `tl-theme`
cookie, SSR `data-theme` attribute and localStorage fallback are unchanged, and
`prefers-color-scheme` is deliberately not read.

### Test isolation

DB-backed suites run against one Postgres schema per vitest worker
(`vitest_w<N>`), provisioned by `test/global-setup.ts` and selected by
`test/setup-db-schema.ts`. Product code has no knowledge of tests;
`refreshCapabilityReadiness` keeps its whole-table semantics. Before this,
parallel suites sharing one schema produced five distinct nondeterministic
failures across Tasks 5–9a. See
`docs/superpowers/verification/2026-08-02-phase1-public-intelligence/test-isolation.md`.

### Rollback

Everything in this milestone is additive. A code rollback leaves the five new
tables in place — never run a down migration. Staging pre-migration checkpoint:
`staging-pre-0013-public-content` (`br-shy-band-aol21p63`, parent
`br-delicate-snow-aoi9sgtw`, expired 2026-08-18). `0013` was applied to
production on 2026-08-04 as part of the Public Intelligence cutover; the
pre-cutover production checkpoint is `phase1-public-pre-retirement`
(`br-damp-boat-aov1verm`, no expiry) per `.agent/CURRENT.md`.

## Operational Alerts (migration `0014`, on production 2026-08-24)

`OperationalAlertState` gives each `(code, subjectId)` operational alert (`SOURCE_STALE`, `CONTENT_COLLAPSE`, `GLOBAL_GAP`, `BRIEFING_ABSENT` from `health-check.ts`; `HARD_CAP` from `cost-report.ts`) persistent lifecycle state, replacing a dedup key that bucketed on the *current hour* — against an hourly job that key never matched a prior run, so an ongoing condition paged every single hour indefinitely (measured ~500 identical Telegram messages over three weeks for one unresolved `BRIEFING_ABSENT`).

- `record()` pages at most once per 24h while a condition stays active; a condition that clears and later recurs pages immediately as a new episode, not bound by the old episode's cooldown.
- `recordResolved()` sends a one-time "RESOLVED" notice when `SOURCE_STALE`/`CONTENT_COLLAPSE`/`GLOBAL_GAP` clear. `BRIEFING_ABSENT` is deliberately excluded — its `subjectId` is the Monday that started the missing week, which rolls forward regardless of whether the underlying cause was fixed, so diffing it would send a false all-clear every week.
- State only advances on a confirmed `"sent"` from the push adapter; `skipped`/`failed`/a thrown send leaves the row untouched so the next run retries naturally.
- `getBriefingStatus()` (the `BRIEFING_ABSENT` detector) only evaluates on Mondays by design — it is not a cooldown side-effect that the alert goes quiet Tuesday–Sunday even while the underlying briefing pipeline stays broken (see the periodKey/scopeKey mismatch noted in `docs/status/2026-08-18-product-status.md`).
