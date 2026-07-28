# Phase 1 Operations Task 2 — Resumable Collection and Canonicalization Batches

Read first: `.superpowers/sdd/2026-07-23-tradelinks-phase1-operations-cost/task-2-brief.md`. It is the requirements source for exact files, interfaces, examples, commands, and definition of done.

## Context and binding constraints

- This is Operations Task 2 and depends on accepted Task 1 runtime primitives.
- Implement against Task 1's accepted exact contract. `collectBatch` and `canonicalizeBatch` return a complete `JobResult` whose `runId` is the real persisted `PipelineRun.id`; per-source partial failures return honest attempted/succeeded/failed/itemCount values instead of throwing through the dispatcher. Register the three collection jobs and canonicalize job with the finite registry so the CLI path is executable.
- Source-level retry is owned by the batch and remains maximum three attempts. Configure the registered dispatcher handlers to one job-level attempt so retries do not multiply (for example, 3 source attempts becoming 12 job attempts).
- Use TDD: add the false-success and same-slot replay tests first, run the specified RED, then implement minimum GREEN behavior.
- `collectBatch(group, args)` uses enabled `PHASE1_SOURCES`, persists one idempotent `PipelineRun`, skips sources already successful in that same scheduled slot, and records each source only after fetch/parse or scraper completion.
- A failed source does not poison other sources. Concurrency is bounded to five. Retry only structured retryable failures, maximum three attempts. Never retry `robots_denied`, `license_denied`, schema/fixture validation failures, or other invariant errors.
- Scraper requests retain the 120-second timeout. The finite path calls the scraper directly and exits; it must not require an enqueued pg-boss scrape job to become successful.
- Preserve currently deployed legacy queue entry points until Operations Task 5; refactor shared finite functions rather than deleting the old scheduler in this task.
- `canonicalizeBatch(args)` processes at most 200 observations lacking an `EvidenceClusterMember`, uses existing fingerprint/cluster/classification contracts, and is replay-idempotent. Do not publish versions or add Task 3 behavior.
- No schema, migration, backfill, cloud configuration, deployment, UI, or public-route changes.
- Never read `.env*`, secret files, process credential values, or external secret directories. Worker and reviewer verification must use credential-free unit tests and dependency injection. The Codex orchestrator alone runs the combined Neon staging integration gate after checkpoint, with unique test data and cleanup, and records only the redacted command/result summary in Pact evidence.
- Keep the public two-argument batch signatures and add injected factories/adapters for credential-free tests; do not replace production collection, scraper, ledger, or canonicalization code with test-only implementations.
- The production source fetch path must reuse the existing source registry plus `buildAdapter`/`toFetchOutcome` and the existing `callScraper` 120-second bridge. Do not maintain parallel RSS/JSON/HTML parser implementations in `collect-batch.ts`; every enabled selected Phase 1 source must resolve to its real source config or fail closed as an invariant.
- Structured outcomes drive retry: `{ kind: "failed", retryable: true }` is retried up to three attempts, while blocked, robots/license denial, validation/schema/fixture failures, and `{ retryable: false }` are recorded after one attempt. Tests must return structured outcomes (not only throw) and assert exact call counts plus preservation of the machine outcome code.
- The returned result summarizes the persisted run, not only work performed by the current replay invocation. Successful checks with `itemCount === 0` produce `SUCCEEDED_EMPTY`; a same-slot replay that fetches nothing preserves the prior run status, item count, and cumulative check counts. A rejected ledger write cannot disappear through `Promise.allSettled` without incrementing failure or surfacing an invariant.
- `canonicalizeBatch` requires a credential-free injected factory and a dedicated `test/canonicalize-batch.test.ts`. Cover the 200-orphan cap, exact replay no-op, no version/publication writes, and use of the existing `decideCluster` contract (official-id/date/platform/title guards) before creating or joining clusters. Keep the public `canonicalizeBatch(args)` signature.

## Verification

RED/GREEN task gate:

Worker/reviewer credential-free gate:

`pnpm vitest run test/collect-batch.test.ts test/canonicalize-batch.test.ts test/job-lock.test.ts test/job-retry.test.ts`

Orchestrator-only Neon staging gate after checkpoint:

`pnpm vitest run test/collect-batch.test.ts test/canonicalize-batch.test.ts test/collection-run.test.ts test/scrape-bridge.test.ts test/canonical-cluster.test.ts`

Type gate:

`pnpm lint`

## Efficiency and handoff

- Risk class: high-risk cross-cutting collection runtime.
- Warning budget: 20,000,000 gross tokens. Hard budget: 30,000,000 gross tokens.
- Use one fresh worker run for Task 2. Stop scope expansion at warning; at hard stop checkpoint and pause.
- Pact checkpoint evidence is at most 4 KB and contains paths plus command/result summaries, not raw logs.
- Write the full implementation report to `.superpowers/sdd/2026-07-23-tradelinks-phase1-operations-cost/task-2-report.md` with: status, RED evidence, GREEN evidence, files, commit, self-review, concerns, and an `EFFICIENCY_RECORD`. Use `UNAVAILABLE` for token fields the provider does not expose; never invent values.
- Worker cannot self-accept. Reviewer must give separate spec-compliance and code-quality verdicts.
