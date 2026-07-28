# Phase 1 Operations Task 1 — Finite Dispatch, Locks, and Retry

Read first: `.superpowers/sdd/2026-07-23-tradelinks-phase1-operations-cost/task-1-brief.md`. It is the requirements source for exact files, interfaces, examples, commands, and definition of done.

## Context and binding constraints

- This is Operations Task 1. It establishes finite runtime primitives consumed by Task 2.
- Preserve the plan's exact `JobName`, `JobArgs`, `JobResult`, status, and exit-code contract.
- The exact contract is:

```ts
export type JobName = "collect-fast" | "collect-standard" | "collect-slow" | "canonicalize" | "publish" | "public-briefing" | "health" | "cost-report";
export type JobArgs = { scheduledFor: Date; runnerVersion: string; dryRun: boolean };
export type JobResult = { runId: string; status: "SUCCEEDED_EMPTY" | "SUCCEEDED_ITEMS" | "PARTIAL" | "FAILED" | "BLOCKED"; attempted: number; succeeded: number; failed: number; itemCount: number; exitCode: 0 | 1 | 2 };
```

  Exit 0 is completed (including empty), exit 1 means retryable units remain, and exit 2 is lock/config/schema/invariant operator action. Keep the public `runJob(name, args)` signature; do not add a separate dry-run option or alternate status vocabulary.
- Use TDD: create the specified tests, run them and record the expected RED caused by missing modules, then implement the minimum GREEN behavior and refactor only while green.
- A pooled Prisma/Neon connection must not use session advisory lock acquire/unlock calls that can land on different connections. Hold a transaction-scoped PostgreSQL advisory lock for the full callback lifetime, or otherwise prove acquire/callback/release share one connection. Automatic release on thrown callbacks is required.
- The `health --dry-run` command must perform no writes and emit exactly one JSON `JobResult`. A future job without a non-dry-run handler fails closed; do not invent Task 3–4 behavior.
- Production retry delays are 1s, 4s, and 16s. Tests inject their delay implementation. Non-retryable failures stop after the first attempt.
- No schema, migration, backfill, cloud configuration, deployment, UI, or public-route changes.
- Do not remove pg-boss or persistent workers; retirement belongs to Operations Task 5.
- Never read `.env*`, secret files, process credential values, or external secret directories. Worker and reviewer verification must be dependency-injected and credential-free. The Codex orchestrator alone runs the real Neon staging integration gate after checkpoint, using unique test data with cleanup, and records only the redacted command/result summary in Pact evidence.
- The credential-free lock suite must not instantiate the real Prisma client. Keep the public two-argument `withJobLock(key, fn)` contract and add an internal/exported factory or mockable transaction adapter for deterministic unit tests. A separate integration test may be environment-gated so it skips with no `DATABASE_URL` and runs only under the orchestrator's staging gate.
- Rework must exercise the production Prisma adapter through a mocked transaction boundary (query result, callback lifetime, rollback/release, and transaction options), not replace it with an in-memory lock implementation. The transaction timeout must exceed the plan's longest 20-minute Railway job maximum so the lock cannot expire while a supported callback is still running.
- Build the lock key only from typed slot identity (`name` plus canonical `scheduledFor`), not `Object.values`, delimiter-joined arbitrary values, or property insertion order. Tests must cover reordered/non-slot input and delimiter-like values.
- Make the 1s/4s/16s production retry ladder explicit and test its exact delay values. Registered runnable jobs must not silently default to a single attempt.
- Populate every field required by the exact `JobResult` contract on every return path. Remove the out-of-scope `opencode.json` schema addition in the rework commit.
- Current checkpoint `c671cf3` is not compliant until independently disproved or fixed: `types.ts` and `run.ts` still use the alternate `Record<string, unknown>` args, alternate status/timestamp/result fields, and a third `opts` parameter; `MAX_JOB_DURATION_MS` remains 300,000 ms despite the plan's 20-minute jobs and the explicit greater-than-20-minute requirement; its fake Prisma stores acquired keys in a shared instance set, so one concurrent transaction's `finally` can release another transaction's lock; and no assertion inspects the transaction timeout options. Reviewer must verify these exact points before accepting.
- Current checkpoint `e44592f` must also preserve the Task 2 handler contract: registry `run`/`dryRun` handlers return the exact `JobResult`, and `runJob` returns that result unchanged after lock/retry so a real `PipelineRun.runId` is never replaced by a random dispatcher id. Retryable exhaustion maps to `FAILED` with exit 1; invariant/non-retryable failure maps to exit 2. If the dispatcher derives success from counts, `itemCount === 0` is `SUCCEEDED_EMPTY` even when sources were attempted; nonzero items with no failures is `SUCCEEDED_ITEMS`. Add focused tests for all three cases.

## Verification

RED and GREEN task gate:

`pnpm vitest run test/job-lock.test.ts test/job-retry.test.ts`

CLI gate:

`pnpm job --name health --dry-run`

Type gate:

`pnpm lint`

## Efficiency and handoff

- Risk class: high-risk runtime/concurrency.
- Warning budget: 20,000,000 gross tokens. Hard budget: 30,000,000 gross tokens.
- Use one worker run. Stop scope expansion at warning; at hard stop checkpoint and pause.
- Pact checkpoint evidence is at most 4 KB and contains paths plus command/result summaries, not raw logs.
- Write the full implementation report to `.superpowers/sdd/2026-07-23-tradelinks-phase1-operations-cost/task-1-report.md` with: status, RED evidence, GREEN evidence, files, commit, self-review, concerns, and an `EFFICIENCY_RECORD`. Use `UNAVAILABLE` for token fields the provider does not expose; never invent values.
- Worker cannot self-accept. Reviewer must give separate spec-compliance and code-quality verdicts.
