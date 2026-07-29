# Phase 1 Operations Task 4 — Reliability Health and Cost Guardrails

Read first: `.superpowers/sdd/2026-07-23-tradelinks-phase1-operations-cost/task-4-brief.md`. It is the requirements source for exact files, interfaces, examples, commands, and definition of done.

## Context and binding constraints

- This task depends on accepted Task 3 and consumes persisted source checks, pipeline runs, source SLA, parsed-count history, briefing qualification, and existing channel/transactional alert paths.
- TDD is mandatory: add failure-class and hard-cap tests first, record the expected RED, then implement minimum GREEN behavior.
- Implement and register finite `health` and `cost-report` handlers while preserving the accepted exact `JobResult` contract. Export the brief's `evaluateOperationalHealth(now)` and `evaluateCostGuardrail(input)` interfaces.
- Detect exactly `GLOBAL_GAP`, `SOURCE_STALE`, `CONTENT_COLLAPSE`, and `BRIEFING_ABSENT`. Successful-empty is healthy unless the collapse baseline applies. A network/fetch failure is never reclassified as content collapse.
- Content collapse requires at least four of the previous seven successful checks and their parsed-count median at least five, with the current successful parse empty. Source stale begins strictly after its own SLA. A global gap uses the maximum SLA of the affected source group.
- Operational alert idempotency key is exactly `${code}:${subjectId}:${utcHour}`. Integrate with existing Telegram operational delivery without exposing tokens, broadcasting seller alerts, or creating a new product promise.
- Rework acceptance pin: `utcHour` is a full UTC hour bucket containing date and hour, not `0..23`. Keep structured `code` and `subjectId` through rendering so colon-bearing subjects are not truncated.
- Rework acceptance pin: separate active detections from newly delivered alerts. A continuing incident remains in `detections`, keeps the health job non-empty/unhealthy, and is only delivery-deduplicated within its full UTC hour bucket.
- Rework acceptance pin: production alert delivery is durable across short-lived processes without a new schema. Use the existing `PipelineRun` uniqueness/metadata as the delivery ledger, call the existing Telegram `sendOpsAlert` path, and mark the alert ledger finished only after a real `sent` result. `skipped`/`failed` delivery remains retryable. Wire the same production adapter into briefing absence, health incidents, and hard-cap alerts; test injection remains credential-free.
- Cost decisions preserve official-source collection and health checks. Above $40 trigger review; above $50 suppress exactly Experimental demand and model enrichment. Do not suppress official collection.
- Rework acceptance pin: production cost input is a validated component breakdown from a non-secret Railway environment value documented for Task 5; missing/malformed input fails closed instead of evaluating as zero. Persist the breakdown and decision in the cost-report `PipelineRun`.
- Rework acceptance pin: persist suppression and consume it. The finite collection path must read the latest accepted cost decision and skip only Experimental demand sources at hard cap; official sources remain selected. Expose the same durable `model-enrichment` decision for model jobs, while documenting that Task 5 retires the current legacy model workers. Tests must prove the production-shaped consumer, not only the pure decision value.
- Use the exact plan boundaries: review only strictly above $40, hard-cap only strictly above $50, and content collapse is the current successful-empty check plus at least four previous successful checks whose median count is at least five. Do not add an extra productive-count condition.
- Worker and reviewer must not read `.env*` or credential values and must use credential-free dependency injection. No schema, migration, cloud mutation, deployment, UI, or public-route changes.
- Full implementation report: `.superpowers/sdd/2026-07-23-tradelinks-phase1-operations-cost/task-4-report.md`. Include status, RED/GREEN evidence, files, commits, self-review, concerns, and `EFFICIENCY_RECORD`; use `UNAVAILABLE` for unavailable token fields.

## Verification

- Targeted RED/GREEN: `pnpm vitest run test/health-check.test.ts test/cost-guardrail.test.ts test/health.test.ts test/channel-select.test.ts test/collect-batch.test.ts test/briefing-job.test.ts`
- Type gate: `pnpm lint`
- Reviewer must provide separate spec-compliance and code-quality verdicts and inspect the full task diff.

## Efficiency

- Risk class: STANDARD.
- Warning: 10,000,000 gross tokens. Hard stop: 15,000,000 gross tokens.
- One fresh OpenCode worker session using `deepseek/deepseek-v4-pro`; one fresh independent Claude Code reviewer using `claude-opus-5`.
- Checkpoint evidence is at most 4 KB and points to the report rather than embedding raw logs. Worker cannot self-accept.
