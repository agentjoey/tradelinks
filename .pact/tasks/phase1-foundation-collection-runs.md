# Phase 1 Foundation — Task 4: Idempotent Collection Runs

Owner: `kimi`  
Reviewer: `claude`  
Orchestrator: `codex` (coordination only; no implementation or task acceptance)  
Plan source: Task 4 in `docs/superpowers/plans/2026-07-23-tradelinks-phase1-foundation.md`

## 目标 / Goal

Persist diagnosable collection runs and per-source checks so retries reuse the scheduled run, successful-empty is distinct from failure, source freshness advances only on successful checks, and replay never duplicates items or counts.

## 改文件 / Files

Only these files are in scope:

- Create `src/collection/run.ts`
- Modify `src/workers/ingest.ts`
- Create `test/collection-run.test.ts`

Do not modify Prisma schema/migrations, source registry, public UI, deployment configuration, or production scheduler settings.

## 契约 / Contract

Produce:

- `beginRun(input: BeginRunInput & { scopeKey: string }): Promise<PipelineRun>`
- `recordSourceOutcome(runId: string, sourceId: string, outcome: FetchOutcome): Promise<SourceCheck>`
- `finishRun(runId: string): Promise<PipelineRun>`

Consume `FetchOutcome`, the Task 2 run/check Prisma models, and existing URL/hash item deduplication. `beginRun` upserts on `[jobType, scopeKey, scheduledFor]`; `recordSourceOutcome` upserts on `[runId, sourceId]`; `Source.lastOk` advances on `SUCCEEDED_EMPTY` and `SUCCEEDED_ITEMS` only; inserted counts change only after item transaction success.

## RED-GREEN-REFACTOR evidence

The Pact checkpoint must include commands, exit codes, and replay/count evidence for all three phases.

### RED

Run the plan's exact RED command before implementation:

`pnpm vitest run test/collection-run.test.ts`

Record the expected failure caused by missing run-ledger functions.

### GREEN

Implement the smallest transactional ledger and run the plan's exact GREEN command:

`pnpm vitest run test/collection-run.test.ts test/source-hash.test.ts test/gnews.test.ts`

Record stable run IDs, source-check IDs, item IDs, and counts across replay.

### REFACTOR

Reduce transaction/upsert duplication, make status derivation explicit, rerun the same batch twice, and rerun the exact GREEN command unchanged. Record unchanged externally observable results.

## 自审 / Self-review

Before checkpointing, Kimi must inspect transaction boundaries, uniqueness-key usage, success-empty behavior, blocked/failed freshness behavior, item-count timing, replay safety, error preservation, bounded files, and unrelated diff noise.

## 安全边界 / Safety

No deployment, production worker execution, production queue/schedule change, database migration, or production database mutation is authorized. Tests must use mocks/fixtures or a clearly non-production test database.

## 验收 / Acceptance

Review dimension: **correctness**.

In a new reviewer session, Claude independently reruns the machine gate, reviews concurrency/retry behavior, and confirms identical scheduled inputs are idempotent while distinct scheduled slots remain distinct. Any duplicate item, run, check, or count blocks acceptance.

verify: pnpm vitest run test/collection-run.test.ts test/source-hash.test.ts test/gnews.test.ts
