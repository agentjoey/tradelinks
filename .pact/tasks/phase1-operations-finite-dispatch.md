# Phase 1 Operations Task 1 — Finite Dispatch, Locks, and Retry

Read first: `.superpowers/sdd/2026-07-23-tradelinks-phase1-operations-cost/task-1-brief.md`. It is the requirements source for exact files, interfaces, examples, commands, and definition of done.

## Context and binding constraints

- This is Operations Task 1. It establishes finite runtime primitives consumed by Task 2.
- Preserve the plan's exact `JobName`, `JobArgs`, `JobResult`, status, and exit-code contract.
- Use TDD: create the specified tests, run them and record the expected RED caused by missing modules, then implement the minimum GREEN behavior and refactor only while green.
- A pooled Prisma/Neon connection must not use session advisory lock acquire/unlock calls that can land on different connections. Hold a transaction-scoped PostgreSQL advisory lock for the full callback lifetime, or otherwise prove acquire/callback/release share one connection. Automatic release on thrown callbacks is required.
- The `health --dry-run` command must perform no writes and emit exactly one JSON `JobResult`. A future job without a non-dry-run handler fails closed; do not invent Task 3–4 behavior.
- Production retry delays are 1s, 4s, and 16s. Tests inject their delay implementation. Non-retryable failures stop after the first attempt.
- No schema, migration, backfill, cloud configuration, deployment, UI, or public-route changes.
- Do not remove pg-boss or persistent workers; retirement belongs to Operations Task 5.
- Do not expose `.env.local` or credentials. DB tests run only against the provided Neon staging branch and must use unique test data with cleanup.

## Verification

RED and GREEN task gate:

`node --env-file=.env.local ./node_modules/vitest/vitest.mjs run test/job-lock.test.ts test/job-retry.test.ts`

CLI gate:

`node --env-file=.env.local ./node_modules/tsx/dist/cli.mjs scripts/run-job.ts --name health --dry-run`

Type gate:

`pnpm lint`

## Efficiency and handoff

- Risk class: high-risk runtime/concurrency.
- Warning budget: 20,000,000 gross tokens. Hard budget: 30,000,000 gross tokens.
- Use one worker run. Stop scope expansion at warning; at hard stop checkpoint and pause.
- Pact checkpoint evidence is at most 4 KB and contains paths plus command/result summaries, not raw logs.
- Write the full implementation report to `.superpowers/sdd/2026-07-23-tradelinks-phase1-operations-cost/task-1-report.md` with: status, RED evidence, GREEN evidence, files, commit, self-review, concerns, and an `EFFICIENCY_RECORD`. Use `UNAVAILABLE` for token fields the provider does not expose; never invent values.
- Worker cannot self-accept. Reviewer must give separate spec-compliance and code-quality verdicts.

