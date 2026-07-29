# Phase 1 Operations Task 4 — Reliability Health and Cost Guardrails

Read first: `.superpowers/sdd/2026-07-23-tradelinks-phase1-operations-cost/task-4-brief.md`. It is the requirements source for exact files, interfaces, examples, commands, and definition of done.

## Context and binding constraints

- This task depends on accepted Task 3 and consumes persisted source checks, pipeline runs, source SLA, parsed-count history, briefing qualification, and existing channel/transactional alert paths.
- TDD is mandatory: add failure-class and hard-cap tests first, record the expected RED, then implement minimum GREEN behavior.
- Implement and register finite `health` and `cost-report` handlers while preserving the accepted exact `JobResult` contract. Export the brief's `evaluateOperationalHealth(now)` and `evaluateCostGuardrail(input)` interfaces.
- Detect exactly `GLOBAL_GAP`, `SOURCE_STALE`, `CONTENT_COLLAPSE`, and `BRIEFING_ABSENT`. Successful-empty is healthy unless the collapse baseline applies. A network/fetch failure is never reclassified as content collapse.
- Content collapse requires at least four of the previous seven successful checks and their parsed-count median at least five, with the current successful parse empty. Source stale begins strictly after its own SLA. A global gap uses the maximum SLA of the affected source group.
- Operational alert idempotency key is exactly `${code}:${subjectId}:${utcHour}`. Integrate with existing Telegram operational delivery without exposing tokens, broadcasting seller alerts, or creating a new product promise.
- Cost decisions preserve official-source collection and health checks. Above $40 trigger review; above $50 suppress exactly Experimental demand and model enrichment. Do not suppress official collection.
- Worker and reviewer must not read `.env*` or credential values and must use credential-free dependency injection. No schema, migration, cloud mutation, deployment, UI, or public-route changes.
- Full implementation report: `.superpowers/sdd/2026-07-23-tradelinks-phase1-operations-cost/task-4-report.md`. Include status, RED/GREEN evidence, files, commits, self-review, concerns, and `EFFICIENCY_RECORD`; use `UNAVAILABLE` for unavailable token fields.

## Verification

- Targeted RED/GREEN: `pnpm vitest run test/health-check.test.ts test/cost-guardrail.test.ts test/health.test.ts test/channel-select.test.ts`
- Type gate: `pnpm lint`
- Reviewer must provide separate spec-compliance and code-quality verdicts and inspect the full task diff.

## Efficiency

- Risk class: STANDARD.
- Warning: 10,000,000 gross tokens. Hard stop: 15,000,000 gross tokens.
- One fresh OpenCode worker session using `deepseek/deepseek-v4-pro`; one fresh independent Claude Code reviewer using `claude-opus-5`.
- Checkpoint evidence is at most 4 KB and points to the report rather than embedding raw logs. Worker cannot self-accept.
