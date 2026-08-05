# Track A handoff prompt — Production observation and Operations Task 5

Copy everything below into a fresh orchestrator-agent session.

---

You are taking over TradeLinks Track A: production observation and completion of Operations Task 5. Work as the orchestrator and evidence owner. Do not broaden scope.

## Repository and worktree

- Repository: `/Users/xtation/AgentWorks/CodeSpace/tradelinks`
- Required isolated worktree: `/private/tmp/tradelinks-phase1-operations`
- Branch: `feat-phase1-operations`
- Expected handoff revision: `34e7fbf3796031229d47b40176820d4d7babf44f`
- Pact task: feature `phase1-operations`, task `railway-cutover`
- Task state at handoff: `awaiting_review`, intentionally unaccepted

Start with:

```bash
cd /private/tmp/tradelinks-phase1-operations
git status -sb
git pull --ff-only        # only if clean
cat AGENTS.md
cat CLAUDE.md
cat .agent/CURRENT.md
cat .pact/tasks/phase1-operations-railway-cutover.md
cat docs/superpowers/plans/2026-07-23-tradelinks-phase1-operations-cost.md
cat docs/operations/phase1-runbook.md
cat .agent/private/phase1-operations-cutover.md
pactify status
pactify validate
```

Treat `.agent/private/phase1-operations-cutover.md` and live cloud queries as the current production source of truth. Root-worktree `.agent/CURRENT.md` and `.agent/HANDOFF.md` predate the production Cron activation and are stale for current cloud state.

## Current production checkpoint

- Eight finite Railway jobs run fixed revision `34e7fbf3796031229d47b40176820d4d7babf44f`.
- Reviewed UTC Cron schedules were enabled at `2026-08-02T00:59:24Z`.
- The original observation start was `2026-08-02T00:59:24Z`, but it is not currently eligible for final Task 5 evidence because the first real Cron exposed the unstable-slot blocker below. A replacement 72-hour window must start after the blocker is fixed, reviewed, deployed, and rechecked.
- The seven-day P0 evidence window is separate and cannot be certified before 168 real hours.
- Legacy Railway worker is stopped and unscheduled but retained for rollback.
- Scraper is serverless-sleep enabled; sleeping is healthy, not a failure.
- Auto-deploy is disabled for all Railway services.
- Telegram controlled delivery and durable idempotency replay already passed. Never print or record the bot token, destination value, connection strings, or environment-variable values.
- GitHub/Vercel production traffic has not been switched.

## Handoff blocker discovered after activation

The first real health Cron was scheduled for `2026-08-02T01:35:00Z`, started a few minutes late, and exited successfully:

- Railway log completion: `2026-08-02T01:39:28Z`
- `PipelineRun`: `cmsb4u2250000qq116ixvks3a`
- result: `SUCCEEDED_EMPTY`, exit `0`
- persisted `scheduledFor`: `2026-08-02T01:39:23.349Z`
- persisted `startedAt`: `2026-08-02T01:39:24.244Z`

This proves the real Cron runs, but also proves its durable slot is wrong. `scripts/run-job.ts` defaults `scheduledFor` to `new Date()` when `--scheduled-for` is absent, while every production start command is `pnpm job --name <job>` with no fixed slot argument. `src/jobs/run.ts` and the job handlers use that value in the advisory-lock key and `PipelineRun` unique tuple. Railway officially documents that Cron execution can be delayed by a few minutes, and its documented system-variable list contains no scheduled-trigger timestamp. Therefore a replay/retrigger does not reliably reuse the planned slot key.

Official references:

- `https://docs.railway.com/cron-jobs`
- `https://docs.railway.com/variables/reference`

Treat this as a Task 5 blocker, not as a passing observation window. Do not accept the original 72-hour start or delete rollback topology. The successor must use systematic debugging and strict TDD to define one deterministic scheduled-slot derivation for all eight fixed schedules, prove delayed starts and same-slot replays reuse the same lock/run key, obtain fresh Claude Opus 5 review, deploy the correction to all eight services at one revision, verify manual fixed-slot replay plus the first real Cron, and only then record a new 72-hour start/end.

Do not guess a Railway environment variable or silently round timestamps. The regression must cover each cadence family: hourly, every four hours, every twelve hours, daily, and weekly; it must also fail closed outside an explicitly allowed trigger window.

## Immediate observation work

Use only redacted, read-only checks unless a documented rollback condition occurs. Reuse the private GraphQL and database-gate files under `.agent/private/`; do not paste secrets into commands or logs.

Expected first-cycle slots after activation:

| Job | First expected UTC slot |
|---|---|
| health | 2026-08-02T01:35:00Z |
| collect-slow | 2026-08-02T02:41:00Z |
| collect-fast | 2026-08-02T04:07:00Z |
| cost-report | 2026-08-02T04:15:00Z |
| canonicalize | 2026-08-02T04:17:00Z |
| publish | 2026-08-02T04:47:00Z |
| collect-standard | 2026-08-02T12:23:00Z |
| public-briefing | 2026-08-03T03:10:00Z |

For every expected slot, verify and record:

1. Railway created exactly one Cron deployment for the expected service and fixed revision.
2. The deployment reached a terminal state and the job log contains one terminal `JobResult`.
3. The corresponding `PipelineRun` uses the correct `(jobType, scopeKey, scheduledFor)` slot and is not duplicated.
4. `SourceCheck` counts/outcomes reconcile for collection jobs; successful-empty is valid.
5. No stale `RUNNING` row or granted advisory lock remains after completion.
6. Health/cost alerts are durably deduplicated; no secret value is read or logged.
7. The scraper returns to `SLEEPING` after scraper-backed collection.
8. Runtime and projected cost remain within the documented guardrails.

Update only the gitignored evidence files while the timed gate is in progress:

- `.agent/private/phase1-operations-cutover.md`
- `.superpowers/sdd/2026-07-23-tradelinks-phase1-operations-cost/task-5-report.md`
- `.superpowers/sdd/2026-07-23-tradelinks-phase1-operations-cost/progress.md`

Do not repeatedly poll full logs. Use scoped deployment/status queries, wait at least 60 seconds between non-terminal polls, and record concise evidence pointers.

## Mandatory rollback condition

If any expected slot is missed or duplicated, a global gap is unobserved, the legacy worker overlaps Cron, or an invariant/lock remains unresolved:

1. Stop and preserve evidence.
2. Disable all eight Cron schedules.
3. Confirm no active finite job, unfinished `PipelineRun`, or advisory lock remains.
4. Resume the prior worker only after that zero-active-work check.
5. Do not delete or rewrite production history.
6. Report the exact failed slot, deployment, redacted log tail, database evidence, and rollback state to the owner.

## 72-hour completion sequence

Do not accept Task 5 merely because time elapsed. Use the replacement window timestamps recorded only after the scheduled-slot blocker is fixed:

1. Generate a redacted 72-hour inventory of expected vs actual slots, duplicates, gaps, terminal states, source outcomes, alert delivery, scraper sleep, and cost.
2. Re-run the no-unfinished-run/no-lock checks and verify the legacy worker never ran.
3. Ask a fresh Claude Code reviewer pinned to `claude-opus-5` for an independent checkpoint verdict. The reviewer must not access `.env*`, Railway variables, tokens, connection strings, or the private record; give only redacted evidence.
4. Only after the reviewer signs off on the elapsed evidence, dispatch a fresh OpenCode worker pinned to `deepseek/deepseek-v4-pro` to remove pg-boss, the persistent worker command, and the exact retired files listed in the plan. The worker cannot touch cloud state or accept its own task.
5. Run the exact repository gates from the plan, including the formerly intentional RED `test/production-runtime.test.ts`, `pnpm why pg-boss`, dead-contract `rg`, finite dry-runs, lint, full tests, and production build.
6. Delete the stopped Railway legacy service only after repository cleanup and final evidence are independently accepted.
7. Obtain a fresh final Claude Opus 5 spec-compliance and code-quality review; then accept and merge Task 5 through Pactify.

Keep the seven-day P0 certification separate. Do not switch GitHub `production`, Vercel production traffic, or Public Intelligence routes in this task.

## Model and authority boundaries

- Cloud inspection/mutation: orchestrator only.
- Repository cleanup worker: OpenCode `deepseek/deepseek-v4-pro`.
- Independent reviewer: Claude Code `claude-opus-5`.
- Any provider/model substitution requires explicit Human Owner approval and a recorded bounded exception.
- Never edit `.pact/STATE.yml` manually. A worker never self-accepts.

End every update with: current UTC time, observation elapsed/remaining, last verified slot, next expected slot, rollback status, and whether Task 5 remains unaccepted.

---
