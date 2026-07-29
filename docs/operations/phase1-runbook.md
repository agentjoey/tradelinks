# Phase 1 Operations Runbook — Railway Cron Cutover

> Status on 2026-07-30: Phase A prepared; production schedules are not yet enabled. The legacy Railway worker and pg-boss files remain intact until the 72-hour checkpoint passes.

## Fixed production topology

All eight cron services use the same repository revision, no public domain, no health check, and no restart after exit code 0. Cron expressions are UTC.

| Railway service | Cron | Start command | Maximum duration |
|---|---|---|---:|
| `tradelinks-collect-fast` | `7 */4 * * *` | `pnpm job --name collect-fast` | 15m |
| `tradelinks-collect-standard` | `23 */12 * * *` | `pnpm job --name collect-standard` | 20m |
| `tradelinks-collect-slow` | `41 2 * * *` | `pnpm job --name collect-slow` | 20m |
| `tradelinks-canonicalize` | `17 */4 * * *` | `pnpm job --name canonicalize` | 15m |
| `tradelinks-publish` | `47 */4 * * *` | `pnpm job --name publish` | 10m |
| `tradelinks-public-briefing` | `10 3 * * 1` | `pnpm job --name public-briefing` | 20m |
| `tradelinks-health` | `35 * * * *` | `pnpm job --name health` | 5m |
| `tradelinks-cost-report` | `15 4 * * *` | `pnpm job --name cost-report` | 5m |

Required shared variables include the existing production application variables plus `RAILWAY_PROJECTED_MONTHLY_COSTS_JSON`, a non-secret JSON object whose values are finite non-negative projected monthly USD costs by component. Do not place variable values in git, Pact evidence, logs, or this runbook.

The Python scraper remains a private HTTP service and must be configured to scale to zero while idle. It wakes only for collection work; collection must degrade to a recorded retryable source failure when the scraper is asleep or unavailable.

## Pre-cutover checklist

1. Record redacted Railway project, environment, service, deployment, and previous worker revision identifiers in the gitignored private operations record. Never record variable values.
2. Confirm Neon checkpoint branch `phase1-operations-pre-cron` exists from the production parent.
3. Deploy the same application revision to all eight cron services with schedules disabled.
4. Configure each exact start command, maximum duration, and UTC schedule from the table; disable restart after exit 0.
5. Set the scraper to scale to zero while idle.
6. Pause the old worker. Do not enable any cron schedule until its process is stopped and no active run or advisory lock remains.
7. Manually trigger three distinct finite slots. For each slot, capture the deployment/run identifier and its `PipelineRun` row. Replaying the same slot must reuse the same `[jobType, scopeKey, scheduledFor]` key.
8. Enable the schedules only after all three probes terminate successfully and the keys are stable.

## 72-hour checkpoint

Keep the old worker paused and recoverable throughout the observation window. For every expected slot, record the Railway execution and matching `PipelineRun` identity. The checkpoint passes only when the complete 72-hour window has:

- no missing expected slot;
- no duplicate `[jobType, scopeKey, scheduledFor]` tuple;
- no run left `RUNNING` beyond its maximum duration;
- no concurrent legacy worker execution;
- health and hard-cap alerts delivered through the durable operations ledger;
- scraper idle periods consistent with scale-to-zero;
- projected monthly core spend at or below $50.

Until this checkpoint passes, `test/production-runtime.test.ts` is intentionally RED and the repository retains pg-boss, the persistent worker script, queue schemas, and retired runtime files.

## Rollback during the observation window

On any global gap, duplicate slot, or unsafe overlap:

1. Disable all eight cron schedules.
2. Confirm no `PipelineRun` remains `RUNNING` for the affected slot and no finite process still holds the job advisory lock.
3. Redeploy/resume the recorded prior worker revision and scale it to its previous value.
4. Confirm the old worker is healthy before scheduling another cron trial.
5. Preserve all `PipelineRun`, `SourceCheck`, canonical history, Railway logs, and incident evidence; do not delete or rewrite them.

After the 72-hour checkpoint and removal commit, rollback is forward-only to the last known-good finite-job revision. Do not reintroduce pg-boss.

## Repository removal gate

Only after the 72-hour evidence is independently accepted:

```bash
pnpm vitest run test/production-runtime.test.ts
pnpm why pg-boss
rg -n 'pg-boss|new PgBoss|boss\.(work|schedule|send)' src package.json
pnpm job --name collect-fast --dry-run
pnpm job --name health --dry-run
pnpm lint
pnpm build
```

Expected: the topology test passes, pg-boss has no dependency path, the `rg` command has no output, both probes exit 0, and lint/build succeed. Only then delete the paused Railway worker and commit the repository removals listed in the Phase 1 Operations plan.
