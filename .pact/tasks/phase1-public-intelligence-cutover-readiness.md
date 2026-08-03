# Public Intelligence Task 9a — Cutover Readiness

## Context

Task 9 in the plan is the production cutover: permanent redirects, legacy retirement migration,
and deletion of ~50 legacy files. The Human Owner directed on 2026-08-03 that we build the
machinery and verify it, **without touching production**.

This task is the reversible half. Everything irreversible — the migration, the schema change,
the file deletions, the production deploy — is deliberately excluded and becomes Task 9b, which
runs only on an explicit decision.

Worktree: `/Users/xtation/AgentWorks/worktrees/tradelinks-phase1-public-intelligence`.

## Models

- Worker: **Kimi Code, `kimi-code/k3`** (pact role `kimi-k3-worker`).
- Reviewer: **Claude Code, `claude-opus-5`**, fresh context.

A worker never self-accepts.

## Why the split — and why you must not "just also do" the rest

`0014` drops the legacy models from `prisma.schema`. The moment that happens, every module
importing `prisma.alert`, `prisma.dailyNote` or `prisma.cluster` stops compiling, which forces
the ~50-file deletion in the same change. Those files currently serve **live production
traffic**: 570 alerts, 22 daily notes, 3,743 items.

So schema change, migration and deletion are one indivisible irreversible act. They are Task 9b.

**Do not** create `prisma/migrations/0014_*`, edit `prisma/schema.prisma`, or delete any legacy
file in this task. If you believe something here cannot be built without one of those,
**escalate**.

Note also: the plan names the retirement migration `0013_retire_wire_radar_daily`. `0013` is
taken by the public content schema. The retirement migration is **`0014`** when it is written.

## What production actually looks like — build for this reality

Read-only measurement of the production branch, 2026-08-03:

| | |
|---|---|
| `CanonicalChange` | **0** |
| `CanonicalChangeVersion` where `isCurrent` | **0** |
| Legacy `alerts` / `daily_notes` / `items` | 570 / 22 / 3,743 |

The public read contract requires `isCurrent`, `editorialStatus: PUBLISHED`, `reviewedAt` not
null, and readiness in `MONITORED|VERIFIED` (`query.ts:30-33`). **Zero production rows satisfy
it.** The Foundation backfill produces `EXPERIMENTAL` / `IN_REVIEW` / non-current versions with
`SECONDARY_CONTEXT` evidence, so it does not satisfy it either.

Your reconciliation must report this honestly rather than implying a cutover would show content.

## Scope

Create or modify only:

- `src/public-intelligence/legacy-redirects.ts`
- `scripts/backfill-public-content.ts`
- `test/legacy-redirects.test.ts`
- `test/public-backfill-plan.test.ts`
- `docs/superpowers/verification/2026-08-02-phase1-public-intelligence/cutover-runbook.md`
- `src/config/env.ts` — additive: one feature flag, see below
- this Pact task's report/evidence metadata

Do not touch: `prisma/**`, `middleware.ts`, `next.config.mjs`, `app/(legacy)/**`,
`app/(public)/**`, `app/api/**`, `src/alerts/**`, `src/daily/**`, `app/components/**`, any
accepted `src/public-intelligence/*` contract, `.env`, `vitest.config.ts`,
`playwright.config.ts`, earlier tasks' tests, or cloud configuration.

## 1 — The redirect map, behind a flag

`getLegacyRedirect(pathname: string): { target: string; status: 308 } | null`, driven by a
declarative map. Cover, at minimum:

| From | To |
|---|---|
| `/wire` | `/changes` |
| `/trends` | `/amazon-us?view=demand-signals` |
| `/daily` | `/briefings` |
| `/daily/[slug]` | the mapped briefing route, or `/briefings` when unmapped |
| `/zh`, `/zh/*` | the English equivalent |
| `/api/public/alerts`, `/api/public/daily` | `/openapi.json` |

Every target must be a route that exists today — assert that in the test by checking each
target against the URL contract, not by eyeballing it.

Add `PUBLIC_CUTOVER_ENABLED` to the `EnvSchema`, **defaulting to false**. The redirect module
is pure and fully tested; nothing wires it into a route in this task. Making cutover a config
flip rather than a code deploy is deliberate: it makes rollback instant and keeps this branch's
legacy routes working for verification.

## 2 — Reconciliation, dry-run only

`scripts/backfill-public-content.ts` implements `planPublicBackfill()` returning the plan's
`PublicBackfillReport` shape: `fingerprint`, `mappedAlerts`, `mappedDailyNotes`, `redirects`,
`unmappedAlerts`, `unmappedPublishedDailyNotes`.

Rules:

- **Dry-run is the only mode this task ships.** `applyPublicBackfill` may exist as an
  unreferenced export with tests, but the script's CLI must refuse to apply — no `--apply`
  flag at all in this task.
- Run it against the **non-production branch this worktree uses**. Never production, never
  staging. There is no endpoint allowlist to weaken; do not add one and do not remove the
  refusal.
- The fingerprint must be stable across repeated runs on unchanged input. Prove it by running
  twice and showing both.
- Every legacy row must either map or appear in an unmapped array **with a reason**. An empty
  unmapped array on a database with zero rows proves nothing — say so explicitly in your report
  rather than presenting it as a pass.

## 3 — The cutover runbook

`docs/superpowers/verification/2026-08-02-phase1-public-intelligence/cutover-runbook.md`, written
for whoever executes Task 9b — possibly not you and possibly months from now.

It must state, in this order:

1. **Preconditions**, each with how to check it. Include the plan's own list, and mark honestly
   which are currently unmet: the Operations P0 report has not run, and production has zero
   publishable canonical records.
2. **The content problem, stated plainly.** Cutting over today replaces a working site with an
   empty one. Publishable content requires human editorial review through `/admin/review`;
   nothing in the pipeline produces it automatically. Give the number of records that would
   need review.
3. The ordered execution steps, each individually reversible until the migration.
4. **The point of no return**, named exactly: `0014` dropping legacy tables. Everything before it
   is a config flip or a redeploy.
5. Rollback for each stage. After `0014`, rollback is restore-from-Neon-branch into a *new*
   recovery branch plus the prior app release — never a down migration.
6. The smoke checks that must pass after cutover, as runnable commands.

Write it as something a tired person can follow at 2am without inferring anything.

## Gates

```bash
cd /Users/xtation/AgentWorks/worktrees/tradelinks-phase1-public-intelligence
set -a && . ./.env && set +a
pnpm exec prisma migrate status
pnpm vitest run test/legacy-redirects.test.ts test/public-backfill-plan.test.ts
pnpm tsx scripts/backfill-public-content.ts --dry-run    # twice, same fingerprint
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Baseline: **727 passed / 2 failed (729)**, 68/69 files, only `test/foundation-backfill.test.ts`
failing. Do not repair it. No new failures, no drop in collected files. Run the full suite
**twice** and show both failure sets.

The legacy routes must still work at the end of this task — `/wire`, `/trends`, `/daily` and
`/subscribe` still return 200 with their chrome. Verify with the link-integrity crawl from Task
8, which must stay green.

Strict TDD: RED with real output, GREEN, REFACTOR with the same command rerun unchanged.

## Evidence

RED/GREEN/REFACTOR with exact commands and exit codes, files changed, both dry-run fingerprints,
the reconciliation counts with an explicit note on what an empty unmapped array does and does
not prove, confirmation that legacy routes still serve and the link crawl is green, rollback
notes, `EFFICIENCY_RECORD`. Keep Pact evidence under 4 KB and link
`.superpowers/sdd/2026-07-23-tradelinks-phase1-public-intelligence/task-9a-report.md`.

Report unavailable token telemetry as `UNAVAILABLE`.

## Stop and report instead of deciding

Print `BLOCKED:` and stop. Six of your escalations have been upheld.

- Any need to touch `prisma/**`, `middleware.ts`, `next.config.mjs`, or any legacy file.
- Any need to delete anything.
- Any need to apply a backfill rather than plan one.
- Any temptation to add an `--apply` path "for later".
- Any destructive or irreversible command.

## Prohibited

No production or staging deployment. No Neon, Vercel or Railway mutation. **No migration, no
schema change, no file deletion, no `--apply`.** No `git push`, no merge, no
`git reset --hard`. No `pactify seat use`. No claim that the seven-day P0 has passed or that
the product is ready to cut over.
