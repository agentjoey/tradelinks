# Phase 1 Operations Task 3 — Publishing, Briefing, and Cache Invalidation

Read first: `.superpowers/sdd/2026-07-23-tradelinks-phase1-operations-cost/task-3-brief.md`. It is the requirements source for exact files, interfaces, examples, commands, and definition of done.

## Context and binding constraints

- This task depends on accepted Operations Tasks 1–2 and must use their exact `JobArgs`, `JobResult`, registry, dispatcher, and persisted `PipelineRun` contracts.
- Implement `publishBatch(args)` and `qualifyWeeklyBriefing(args)` with the public signatures from the brief and register `publish` plus `public-briefing` so the finite CLI path is executable.
- TDD is mandatory: add the specified tests, capture the expected RED caused by missing handlers, then implement minimum GREEN behavior.
- Publishing is bounded to 100 reviewed drafts and must call the accepted immutable publication API. Do not duplicate or weaken publication invariants. A reviewed action template remains required where the Foundation publication policy requires it.
- Cache invalidation is tag-scoped to `changes` and `coverage`, occurs only after affected publication work, and must be injected in credential-free tests. Do not add public pages or redesign routes in this task.
- P0 briefing is shadow-only: select the exact Monday–Sunday UTC window; qualify only current published versions allowed by Verified/Monitored readiness; order version IDs deterministically; persist `itemCount`, ordered IDs in `PipelineRun.metadata`, and a stable `outputFingerprint`; create no Briefing page, product email, or public record.
- A missing scheduled weekly run or zero qualified weekly entries produces `BRIEFING_ABSENT`, `BLOCKED`, and exit 2. Conditional daily absence remains `SUCCEEDED_EMPTY`; do not turn daily content into a promise.
- Replays for the same scheduled slot must be idempotent and return the persisted cumulative result/fingerprint rather than creating duplicate runs or alerts.
- Rework acceptance pin: persist `attempted`, `succeeded`, and `failed` in the publish `PipelineRun.metadata` and read those exact counts on replay; never derive a count from `status` or `itemCount`. A production-shaped regression must prove a first run that publishes two of three drafts and a replay that publishes the remaining draft finishes cumulatively as three succeeded, zero failed, `SUCCEEDED_ITEMS`, exit 0, without republishing the first two.
- Rework acceptance pin: the handler itself slices loaded reviewed drafts to 100 even if a dependency returns more; the cap test must return more than 100 from the fake dependency rather than implementing the slice inside the fake.
- Never read `.env*` or credential values. Worker and reviewer use dependency-injected, credential-free tests. No schema, migration, cloud configuration, deployment, UI, public-route, or legacy worker deletion belongs here.
- Full implementation report: `.superpowers/sdd/2026-07-23-tradelinks-phase1-operations-cost/task-3-report.md`. Include status, RED/GREEN evidence, files, commits, self-review, concerns, and `EFFICIENCY_RECORD`; use `UNAVAILABLE` for unavailable token fields.

## Verification

- Targeted RED/GREEN: `pnpm vitest run test/publish-job.test.ts test/briefing-job.test.ts`
- Regression: `pnpm vitest run test/canonical-publish.test.ts test/job-lock.test.ts test/job-retry.test.ts`
- Type gate: `pnpm lint`
- Reviewer must provide separate spec-compliance and code-quality verdicts and inspect the full task diff.

## Efficiency

- Risk class: HIGH_RISK (publication invariant).
- Warning: 20,000,000 gross tokens. Hard stop: 30,000,000 gross tokens.
- One fresh OpenCode worker session using `deepseek/deepseek-v4-pro`; one fresh independent Claude Code reviewer using `claude-opus-5`.
- Checkpoint evidence is at most 4 KB and points to the report rather than embedding raw logs. Worker cannot self-accept.
