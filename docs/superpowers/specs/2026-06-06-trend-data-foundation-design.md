# Trend data foundation (BL-028 Phase ①) — design spec

> Date: 2026-06-06 · Status: draft (for review) · Scope: data foundation only (no prediction yet)
> Backlog: BL-028 Phase ① — see Obsidian `P026-TradeLinks/Backlog-待办`.

## Why now (the foundation gap)

BL-028's end goal is **historical aggregation → trend tracking → trend prediction** — the PRD's
core moat (cross-region viral diffusion). Prediction is a function of **data volume × time**:
you cannot back-fill history you never stored. So the foundation must be laid **now, while data
is small and cheap to reshape**, even though prediction itself is months away.

**The blocking gap:** the trends worker calls `replaceSignals()` every run
(`src/workers/trends.ts:54` → `src/trends/db.ts`), which **deletes and rewrites the entire
`TrendSignal` table daily**. Diffusion history is destroyed every 24h. Today we keep:

- ✅ `TrendSnapshot` — daily per (date, region, keyword) metrics, history **kept** (unique key).
- ❌ `TrendSignal` — current state only, history **destroyed** by `replaceSignals`.
- ❌ No **outcome capture** — we never record whether a predicted spread actually happened, so
  there is no ground truth to ever train or even evaluate a predictor against.
- ❌ No **retention policy** and no **time-series access layer** (rollup views/query helpers).

This spec fixes the foundation. It explicitly does **not** build dashboards (Phase ②) or a
predictive model (Phase ③).

## Phased framing (so scope is unambiguous)

| Phase | Theme | This spec? |
|---|---|---|
| **①** | **Preserve history + capture outcomes + access layer** | ✅ yes |
| ② | Trend-tracking UI (trajectories, momentum, signal log) | ❌ later |
| ③ | Predictive model (forecast spread, confidence) using ①'s accumulated data | ❌ later |

## Phase ① deliverables

### A. Preserve diffusion-signal history

Stop destroying signal history. Keep the *live* board fast, but append an immutable daily record.

- Keep `TrendSignal` as the **current-state** table (the Radar still reads it; `replaceSignals`
  stays for that surface).
- **New** `TrendSignalSnapshot` — one immutable row per emitted signal per day:

```prisma
model TrendSignalSnapshot {
  id           String   @id @default(cuid())
  date         DateTime @db.Date
  keyword      String
  originRegion Region
  spreadingTo  Region[]
  confidence   Float
  signalBasis  String
  createdAt    DateTime @default(now())

  @@unique([date, keyword, originRegion])   // idempotent re-runs same day
  @@index([keyword, date])
  @@map("trend_signal_snapshots")
}
```

- Worker change (`runTrendsIngest`): after computing `signals`, **both** `replaceSignals()`
  (live) **and** `recordSignalHistory(signals, date)` (append, upsert on unique key).

### B. Outcome capture (prediction-readiness)

The single most important foundation piece: to ever *predict*, we must record what each signal
*predicted* and later observe what *happened*. Capture the prediction now; evaluate later (Phase ②).

```prisma
model SignalOutcome {
  id            String    @id @default(cuid())
  signalDate    DateTime  @db.Date          // when we predicted
  keyword       String
  originRegion  Region
  targetRegion  Region                       // one row per predicted target
  baselineScore Float                         // target-region score at prediction time
  status        String    @default("pending") // pending | confirmed | expired
  materializedAt DateTime?                     // when target actually moved (Phase ② fills)
  observedSlope Float?                         // target-region slope at materialization
  createdAt     DateTime  @default(now())

  @@unique([signalDate, keyword, targetRegion])
  @@index([status])
  @@map("signal_outcomes")
}
```

Phase ① only **opens** outcome rows (`status:"pending"`) when a signal is emitted, recording the
baseline. A future evaluation job (Phase ②) scans later `TrendSnapshot`s in `targetRegion` and
flips rows to `confirmed` (with `observedSlope`) or `expired`. That accumulated hit/miss set is
the **training + backtest data** for Phase ③.

### C. Time-series access layer

Add typed query helpers in `src/trends/db.ts` (and, if cleaner, a Postgres view in the migration):

- `keywordTimeseries(keyword, region?, sinceDays)` → snapshots over time (trajectory).
- `signalHistory(keyword?, sinceDays)` → confidence trajectory from `TrendSignalSnapshot`.
- `categoryMomentum(sinceDays)` → aggregate movement per category.

Optional SQL view `trend_keyword_timeseries` (join snapshots by date) if query reuse warrants it.

### D. Retention policy (document now, enforce later)

Write the policy into `docs/specs/data-model.md` (and/or a short ADR):

- `TrendSnapshot`, `TrendSignalSnapshot`, `SignalOutcome`, `Alert` → **keep indefinitely**
  (small, append-only, they *are* the historical asset). Never prune.
- `Item` raw rows → candidate for pruning after N days (large, noisy); processed/published
  provenance retained. **Actual prune job deferred** to a later ticket — Phase ① just documents
  the intent so nothing is pruned by accident in the meantime.

## Implementation map

| Piece | Where | Notes |
|---|---|---|
| schema | `prisma/schema.prisma` + migration `0005…` (or `0006…` after daily-notes) | 2 new tables; additive, prod-safe |
| history write | `src/trends/db.ts` `recordSignalHistory()` | append/upsert on unique key |
| outcome open | `src/trends/db.ts` `openSignalOutcomes()` | row per (signal, targetRegion) |
| worker wiring | `src/workers/trends.ts` | call both after diffusion, keep `replaceSignals` |
| access layer | `src/trends/db.ts` query helpers (+ optional view) | for Phase ② UI to consume |
| docs | `docs/specs/data-model.md` | retention policy + new tables |

## Testing / acceptance (TDD)

- `recordSignalHistory` is **idempotent per day** (re-run same date → no dup, upserts).
- A diffusion signal **opens `SignalOutcome` rows** (one per predicted target) with baseline.
- `keywordTimeseries` returns ordered points; empty for unknown keyword.
- Worker still updates the live `TrendSignal` board (no regression to the Radar).
- `pnpm lint` + `pnpm build` clean; migration applies on the Neon dev branch.

## Non-goals (explicitly Phase ②/③)

- No outcome **evaluation** job (the thing that flips pending → confirmed). Phase ②.
- No trend-tracking **UI/dashboards**. Phase ②.
- No **predictive model**, scoring, or forecasting. Phase ③.
- No item-pruning job (policy documented only).

## Sequencing note

Land this **before/alongside** turning on more trend inputs — every day it's not in place is a
day of diffusion history permanently lost. Low effort (2 additive tables + a few functions),
high long-term leverage. Once it's running and accumulating, Phase ② (tracking UI) and Phase ③
(prediction) have real data to stand on.
