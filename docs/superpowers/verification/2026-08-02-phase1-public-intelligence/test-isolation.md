# Test Isolation Convention (Task 10)

**Status: binding for every DB-backed test from 2026-08-03 on.** Written so a
future task does not reintroduce shared-branch races by accident.

## The mechanism

Each vitest worker gets its own Postgres schema on the shared Neon dev
branch: `vitest_w<N>` where N = `VITEST_POOL_ID`, the 1-based pool slot
(pool size 9, `TEST_WORKER_COUNT` in `test/db-isolation.ts`). Do NOT switch
this to `VITEST_WORKER_ID`: that counter increments every time vitest
recycles a worker process and quickly exceeds the pool size (learned the
hard way — a full run failed 64/64 suites on worker id 29).

- `test/global-setup.ts` (vitest `globalSetup`, once per run): creates any
  missing `vitest_w<N>` schema and brings it to the migrations on disk.
- `test/setup-db-schema.ts` (vitest `setupFiles`, before every test file's
  imports): rewrites `DATABASE_URL`/`DIRECT_URL` in-place, adding
  `?schema=vitest_w<N>`. Every `PrismaClient` constructed afterwards — the
  `src/db/client.ts` singleton and per-file clients alike — talks only to
  that worker's schema. **No product code knows this exists.**
- `vitest.config.ts`: `maxWorkers: 9`, `minWorkers: 1`, registers the two
  files above.

What this guarantees:

- **No cross-file concurrency.** A vitest worker runs one test file at a
  time, so within a schema there is never a concurrent writer. Whole-table
  reads (`listPublicChanges`, `getCoverageMatrix`, `planPublicBackfill`),
  whole-table recomputes (`refreshCapabilityReadiness`), and FK-safe
  teardowns cannot interleave across files.
- Files sharing a worker run **sequentially** in the same schema: a file can
  see rows an *earlier* file left behind, but nothing changes under it
  mid-query.
- `public` is no longer touched by vitest at all. Playwright e2e still runs
  against `public` via `pnpm start`; never run e2e concurrently with vitest
  against the same branch.

## Rules for a new DB-backed test

1. **Nothing new to configure.** Import prisma as today
   (`new PrismaClient()` or `../src/db/client.js`). The schema is selected
   before your file's imports run.
2. **Seed what you assert on.** Your schema starts empty except for what
   earlier files on the same worker left behind (they clean up after
   themselves; treat anything else as absent). If a test needs the Phase 1
   contract rows, seed them like `coverage-readiness` does — never assume
   the branch's real data is visible. Whole-table assertions over an empty
   schema are vacuous: seed a fixture set that forces every outcome you
   assert (see `public-backfill-plan` for the pattern).
3. **Run-scope every fixture id** (`<prefix>-${Date.now()}-${random}` with a
   prefix unique to your file) and **delete in FK-safe order in `afterAll`**.
   Register a NEW prefix in `scripts/lib/test-orphans.ts`
   (`DISTINCTIVE_TOKENS`) so the orphan guard and cleanup see it.
4. **No retries for cross-suite phenomena.** "Inconsistent query result",
   "unknown capability" mid-recompute, fingerprint churn between consecutive
   plans — these were shared-branch races and cannot occur in a worker
   schema. If you see one, it is a real bug: fail, don't retry. (Neon
   cold-start connection retries in `src/db/client.ts` are unrelated and
   stay.)
5. **Whole-table mutation is allowed but must be restored.** Sequentially
   shared schemas mean a later file reads what you leave. If your test
   invokes a recompute/refresh of ALL rows (e.g.
   `refreshCapabilityReadiness`), snapshot and restore in `finally`
   (`coverage-readiness` is the template).
6. **One vitest run at a time per branch.** Two concurrent runs share the
   same `vitest_w<N>` pool and would race exactly like the old world.

## Provisioning internals (why it looks like this)

- Deploys run from a **rewritten copy** of `prisma/` under
  `node_modules/.cache/test-isolation/`: migrations 0002/0003 reference the
  pg_trgm opclass `gin_trgm_ops` unqualified, which only resolves in
  `public`; recreating the opclass needs superuser (Neon roles don't have
  it). The copy qualifies it as `public.gin_trgm_ops`. Migration directory
  names are unchanged, so `_prisma_migrations` stays compatible. The repo's
  own migrations are never modified.
- vitest `minWorkers` defaults to `maxWorkers`, which conflicts with the
  worker cap on filtered (single-file) runs — hence `minWorkers: 1`.
- `prisma migrate deploy` takes a **database-wide advisory lock** — deploys
  are serialized in `global-setup.ts`, and they go through the **direct**
  endpoint: a failed deploy through the Neon pooler leaks the session-level
  advisory lock into a pooled backend and blocks every later deploy
  (symptom: `Timed out trying to acquire a postgres advisory lock
  (SELECT pg_advisory_lock(72707369))`; remedy:
  `SELECT pg_advisory_unlock(72707369)` from any session routed to the
  holding backend).
- Provisioning is idempotent (applied-migration count vs disk). First
  provision costs ~60 s per schema, one time; steady-state runs pay only a
  few catalogue queries. A schema with a failed-migration record is dropped
  and rebuilt automatically (pool schemas hold test data only).

## Orphan safety net

Killed runs leave fixtures behind (Task 7: 91 orphaned canonical changes
removed by hand; Task 10: 12 more found in `public` from the pre-isolation
era).

- **Guard:** `test/orphan-guard.test.ts` runs in every suite and fails
  loudly when prefix-matched rows older than 2 h exceed **100** across all
  `vitest_w*` schemas + `public`. The age filter keeps the current run's
  fixtures out of the count.
- **Remediation:**
  ```bash
  pnpm tsx scripts/cleanup-test-orphans.ts --include-public          # dry run
  pnpm tsx scripts/cleanup-test-orphans.ts --include-public --apply  # delete
  ```
  Prefix-scoped, FK-safe order, dry-run by default, age-filtered
  (`--older-than-hours`, default 2) so a running suite's fixtures are never
  touched. See `scripts/lib/test-orphans.ts` for the prefix list — extend it
  when you add a fixture prefix.

## Retired scaffolding (do not re-add)

- `withDbRetry` ("Inconsistent query result" retry) in `public-feeds` and
  `public-api-v1`; the inline equivalent in `public-channel-consistency`.
- The "unknown capability" retry around `refreshCapabilityReadiness` in
  `coverage-readiness` (snapshot/restore **kept** — see rule 5).
- `readConsistentAlertState` polling in `public-backfill-plan` (replaced by
  seeded fixtures + unconditional assertions).
- `stablePair` polling and `expectApplyAndReplayWithRetry` in
  `foundation-backfill` (replaced by `planStablePair` / single-attempt
  apply+replay on a quiet schema).
