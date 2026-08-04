# Task 10 Report — Make the Test Suite Deterministic (test-isolation)

Worker: Kimi Code, `kimi-code/k3` (pact seat kimi) · Reviewer: Claude Opus 5

## Mechanism chosen: Option A — one Postgres schema per vitest worker

`vitest_w<N>`, N = `VITEST_WORKER_ID`, pool of 8 on the shared Neon dev
branch. `test/global-setup.ts` provisions (create + migrate, idempotent);
`test/setup-db-schema.ts` rewrites `DATABASE_URL`/`DIRECT_URL` with
`?schema=vitest_w<N>` before any PrismaClient is constructed. No product
code changed; `refreshCapabilityReadiness` keeps whole-table semantics.

**Why not Option B (serialize globally-dependent files):** the 15 DB-backed
files sum to ~1,290 s of serial runtime in the baseline (foundation-backfill
~300 s, guides-briefings ~225 s alone) vs ~380 s parallel wall-clock.
Serializing only the 5 "truly global" files does not even fix the problem:
the"Inconsistent query result" class is caused by ANY file's FK-safe
teardown racing ANY other file's whole-table relation fetch, so the serial
set would have to be all 15 DB files — a ~3–4× slowdown. A correct suite
nobody runs is not an improvement; Option A preserves parallelism fully.

**Provisioning subtleties found (documented in the convention doc):**

1. Migrations 0002/0003 create GIN indexes with unqualified
   `gin_trgm_ops`; the opclass lives in `public` (extension is a per-database
   singleton), the migrate engine runs with search_path=<target schema>, and
   `CREATE OPERATOR CLASS` needs superuser (Neon roles don't have it).
   Resolution: deploy from a rewritten copy of `prisma/` under
   `node_modules/.cache/test-isolation/` with ` gin_trgm_ops` →
   ` public.gin_trgm_ops`; migration names unchanged, repo migrations
   untouched, no product schema change, no new migration files.
2. `prisma migrate deploy` takes a database-wide advisory lock → deploys
   serialized; must use the direct endpoint — a failed deploy through the
   pooler leaked `pg_advisory_lock(72707369)` into a pooled backend and
   blocked all later deploys (released via `pg_advisory_unlock`).
3. vitest `minWorkers` defaults to `maxWorkers` and conflicts with
   single-file filtered runs → `minWorkers: 1`.

First provision: ~60 s × 8 schemas, one time. Steady state: a few catalogue
queries per run.

## Workarounds retired vs kept

Retired (hazard no longer exists):

- `withDbRetry` "Inconsistent query result" retry — `public-feeds` (helper +
  12 call sites), `public-api-v1` (helper + 12 call sites), inline loop in
  `public-channel-consistency`. Cross-suite mid-query deletion is impossible
  in a per-worker schema.
- "unknown capability" 4-attempt retry around `refreshCapabilityReadiness`
  in `coverage-readiness`.
- `readConsistentAlertState` convergence polling in `public-backfill-plan`.
- `stablePair` 240 s polling and `expectApplyAndReplayWithRetry` 540 s loop
  in `foundation-backfill` → `planStablePair` (two plans, must agree on a
  quiet schema) + single-attempt apply/replay. All assertions unchanged.

Kept, with reason:

- Snapshot/restore blocks in `coverage-readiness` (3 single-row + 1
  whole-table). Files sharing a worker schema run sequentially; a later
  file's whole-table reads (e.g. public-hubs' matrix assertions) must not
  observe this file's mutations. Comments updated to say so.
- Fixture diplomacy (q=runId scoping, near-past/far-future reviewedAt
  windows): harmless under isolation and still robust against same-schema
  leftovers; stale "parallel suite / shared branch" comments rewritten.

## Assertion-strength audit (no weakening)

- `public-backfill-plan`: previously proved accounting over the live branch
  inventory; on an empty worker schema that would be vacuous. Now seeds a
  deterministic legacy inventory (1 mapped + 1 unmapped alert, 1 mapped + 1
  unmapped published daily note) and keeps every accounting equality, PLUS
  new presence assertions forcing both outcomes. The fingerprint-stability
  test lost its inventory guard and is now unconditional (stronger).
- `foundation-backfill`: same assertions on plan/apply/replay; the two known
  endpoint-allowlist failures still fail for the same reason (refusal thrown
  before any write — `isApprovedApplyTarget` parses hostname only, so
  `?schema=` is inert).
- All other files: assertions byte-identical except removal of retry
  wrappers around the same calls.

## Orphan safety net

- `scripts/lib/test-orphans.ts`: shared prefix list + FK-safe delete steps +
  counting. `scripts/cleanup-test-orphans.ts`: dry-run default, `--apply`,
  `--schema`, `--older-than-hours` (default 2 h), refuses non-test schemas.
- `test/orphan-guard.test.ts`: fails the suite when prefix-matched rows
  older than 2 h exceed 100 across all `vitest_w*` + `public`.
- Applied to the branch: 12 pre-isolation orphans deleted from `public`
  (8 PipelineRun, 1 alert, 3 sources, ~14 h old); 0 remaining.

## Convention

`docs/superpowers/verification/2026-08-02-phase1-public-intelligence/test-isolation.md`
— mechanism, guarantees, rules for new DB-backed tests, provisioning
internals, orphan procedure, retired-scaffolding list.

## Determinism evidence

Baseline (before): run 1 = 373 s, failures {foundation-backfill suite-level
(stablePair timeout), public-shell "Inconsistent query result"}; run 2 =
393 s, failures {foundation-backfill suite-level, public-read-model
"repeat query without cursor returns same order"}. Different sets — the
problem statement, reproduced.

After: TBD (5 runs)

## Wall-clock

TBD

## EFFICIENCY_RECORD

TBD
