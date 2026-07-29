# Phase 1 Operations Task 5 — Railway Cron Production Cutover

Read first: `.superpowers/sdd/2026-07-23-tradelinks-phase1-operations-cost/task-5-brief.md`. It is the requirements source for exact files, interfaces, commands, checkpoints, and definition of done.

## Context and binding constraints

- This task depends on accepted Operations Tasks 1–4. It is a production cutover task and remains unaccepted until the exact 72-hour evidence requirement is satisfied.
- TDD is mandatory for repository behavior: first add `test/production-runtime.test.ts` and record its RED against the old worker/pg-boss topology, then make the minimum repository changes that pass it.
- Codex is the only seat authorized to inspect or mutate Railway/Neon/Vercel state. Worker and reviewer must never read `.env*`, tokens, Railway variable values, connection strings, or private operations records. The worker implements repository code/tests/docs only and records which orchestrator-only cloud checks remain.
- Before cloud mutation, Codex records redacted Railway service/deployment identities in a private gitignored operations record and creates the plan-named Neon branch checkpoint. No secret value may enter Pact evidence, git, stdout, or the worker/reviewer context.
- Configure the eight exact UTC cron services/start commands/durations from the plan, scale the scraper to zero, disable restart after exit 0, and pause the old worker before enabling cron. Never allow the old worker and cron schedules to run concurrently.
- Manually trigger three slots and confirm stable `PipelineRun` keys before enabling schedules. Keep the old worker paused and recoverable for 72 hours.
- Do not remove pg-boss, the persistent worker script, retired runtime files, or the paused Railway worker until 72 hours of production evidence proves no missed/duplicate slot and the reviewer has evidence for that checkpoint.
- If the 72-hour window is incomplete, checkpoint the repository/cloud preparation honestly and leave the Pact task awaiting final evidence; do not accept or merge it.
- Current Phase-A checkpoint (before schedules): keep `pg-boss`, the `worker` script, queue schemas, and every listed legacy runtime file intact. Add and record the intentionally RED `test/production-runtime.test.ts`, update only the runbook/architecture/Railway documentation needed to execute and roll back the cutover, and report all cloud/72-hour gates as pending. Do not move queue schemas, repair TypeScript for a future deletion, remove dependencies, or make the topology test GREEN until Codex records the completed 72-hour window.
- Rollback is mandatory: any global gap or duplicate slot in the first 72 hours disables cron, confirms no active advisory lock/run, then resumes the prior worker revision. After final removal, rollback is forward-only to the last known-good finite job revision.
- Update the exact docs/files in the brief and write the full report to `.superpowers/sdd/2026-07-23-tradelinks-phase1-operations-cost/task-5-report.md` with RED/GREEN, cloud evidence references, rollback state, commits, self-review, concerns, and `EFFICIENCY_RECORD` using `UNAVAILABLE` for missing telemetry.

## Verification

- Repository gate: `pnpm vitest run test/production-runtime.test.ts`
- Dependency/topology gate: `pnpm why pg-boss` and `rg -n 'pg-boss|new PgBoss|boss\.(work|schedule|send)' src package.json`
- Finite probes: `pnpm job --name collect-fast --dry-run` and `pnpm job --name health --dry-run`
- Type/build gates: `pnpm lint` and `pnpm build`
- Cloud behavior probe: three manual finite slots followed by the real 72-hour no-gap/no-duplicate observation window.
- Reviewer must provide separate spec-compliance and code-quality verdicts and compare redacted cloud evidence to the plan without accessing credentials.

## Efficiency

- Risk class: HIGH_RISK (production cutover).
- Warning: 20,000,000 gross tokens. Hard stop: 30,000,000 gross tokens.
- One fresh OpenCode worker session using `deepseek/deepseek-v4-pro`; one fresh independent Claude Code reviewer using `claude-opus-5` after orchestrator-only cloud preparation.
- Checkpoint evidence is at most 4 KB and points to repository/private evidence paths. Worker cannot self-accept.
