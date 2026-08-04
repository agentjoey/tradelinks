# Public Intelligence Task 10 — Make the Test Suite Deterministic

## Context

The full suite reports a different answer depending on when you ask it. Across Tasks 5–9a the
same underlying problem has surfaced five times, each time in a different victim:

| Task | Manifestation |
|---|---|
| 5 | `refreshCapabilityReadiness` recomputes the whole `CoverageCapability` table mid-run and flips another suite's fixtures |
| 6 | a parallel suite's FK-safe cleanup deletes a row between Prisma's relation fetches |
| 7 | orphaned fixtures from killed runs accumulate until a query exceeds its timeout |
| 8 | three of six full runs flake; mitigated test-side |
| 9a | the reconciliation test that exists to be cutover evidence fails under load, passes 13/13 isolated |

Each was individually reasonable to work around. Together they mean **the suite is not a
trustworthy gate**. Task 9's preconditions include a seven-day stability report; a green week
proves nothing when the failure set is nondeterministic.

This task makes the suite deterministic. It is a prerequisite for any P0 measurement and for
Task 9b.

Worktree: `/Users/xtation/AgentWorks/worktrees/tradelinks-phase1-public-intelligence`.

## Models

- Worker: **Kimi Code, `kimi-code/k3`** (pact role `kimi-k3-worker`).
- Reviewer: **Claude Code, `claude-opus-5`**, fresh context.

A worker never self-accepts.

## The diagnosis — start from here, do not rediscover it

Vitest runs test files in parallel. Every DB-backed file targets **one shared Neon branch**.

The reason the obvious fix does not work: tests call the **real** read functions —
`listPublicChanges`, `getHub`, `getCoverageMatrix`, `planPublicBackfill`. Those functions
legitimately see every row in the table. You cannot scope them to a run prefix without changing
product code, and product code must not learn about tests.

So the only real options are **data isolation** or **serialization**. Both are legitimate; pick
with evidence.

**Option A — schema per worker.** Give each vitest worker its own Postgres schema via
`?schema=` on the connection string, migrated once and reused across runs. True isolation,
parallelism preserved. Costs: first-run migration of N schemas, some branch storage, and
`prisma migrate deploy` must target each schema.

**Option B — serialize only the globally-dependent files.** Use vitest projects: pure-logic
tests stay parallel; files whose assertions depend on whole-table state run in a
single-threaded project. Simpler, no infrastructure change. Cost: the serialized set includes
the slowest files — `foundation-backfill` alone runs ~294 s — so measure before committing.

**Option C — something better.** If you find one, argue it on the same terms.

I am not mandating a mechanism. I am mandating the outcome and the constraints below.

## What you must deliver

1. **Determinism, proven.** Run the full suite **five consecutive times** and show that the
   failure set is **byte-identical** every time. The expected set is the two known
   `foundation-backfill` endpoint-allowlist failures and nothing else. Five identical runs is
   the acceptance bar; three is not enough to distinguish "fixed" from "lucky".

2. **A stated runtime budget.** Report wall-clock for the full suite before and after. If your
   mechanism makes it materially slower, say by how much and why that trade is worth it. A
   correct suite that nobody runs is not an improvement.

3. **An orphan safety net.** Killed runs leave fixtures behind — 91 orphaned canonical changes
   had to be removed manually during Task 7 review. Provide a documented, prefix-scoped cleanup
   the next person can run, and make the suite fail loudly rather than silently slowly when
   orphans exceed a threshold.

4. **A written convention** at
   `docs/superpowers/verification/2026-08-02-phase1-public-intelligence/test-isolation.md`:
   what a new DB-backed test may and may not assume, how to add one safely, and what the
   mechanism guarantees. Written so a future task does not reintroduce the problem by accident.

5. **Retire the workarounds you can.** The anchored `Inconsistent query result` retries in
   `public-feeds` and `public-channel-consistency`, and any snapshot/restore that isolation
   makes redundant, should be removed — or explicitly kept, with the reason. Do not leave dead
   scaffolding that implies a hazard which no longer exists.

## Constraints

- **No product-code change.** Nothing under `src/**` that ships may learn about tests.
  `refreshCapabilityReadiness` keeps its whole-table semantics — that is what it is for.
- **No weakening of assertions.** If a test currently proves something, it still proves it
  afterwards. Making a test pass by asking it less is a regression disguised as a fix.
- **No new retries** beyond what already exists, and preferably fewer.
- `vitest.config.ts`, `playwright.config.ts` and every test file are **in scope** for this task
  specifically. This is the one task where touching them is the point.
- `.env` stays untouched. If your mechanism needs a connection-string variant, derive it in
  test setup from the existing value.

## Scope

In scope: `vitest.config.ts`, `playwright.config.ts`, any file under `test/**`, plus new files
under `test/` for shared setup, plus the convention document, plus a cleanup script under
`scripts/` if you build one.

Out of scope: everything under `src/**`, `app/**`, `prisma/**`, `middleware.ts`, `.env`, and
any Pact or cloud configuration.

## Gates

```bash
cd /Users/xtation/AgentWorks/worktrees/tradelinks-phase1-public-intelligence
set -a && . ./.env && set +a
pnpm exec prisma migrate status
pnpm lint
pnpm test          # five times, failure sets shown for all five
pnpm build
pnpm test:e2e
```

Baseline before your change: **two known `foundation-backfill` failures**, everything else
green — but the *set* varies run to run, which is the whole problem.

## Evidence

All five full-suite failure sets verbatim, before/after wall-clock, the mechanism chosen with
the reasoning against the alternatives, which workarounds you removed and which you kept and
why, the orphan-cleanup procedure, `EFFICIENCY_RECORD`. Keep Pact evidence under 4 KB and link
`.superpowers/sdd/2026-07-23-tradelinks-phase1-public-intelligence/task-10-report.md`.

If five identical runs is not achievable, **say so plainly with the residual failure named**
rather than presenting four-of-five as success. A known, characterised, reproducible remaining
flake is a far better outcome than a claimed fix that quietly is not one.

## Stop and report instead of deciding

Print `BLOCKED:` and stop. Six of your escalations have been upheld.

- Any need to touch product code under `src/**` or `app/**`.
- Any need for a migration, schema change, or `.env` edit.
- Any mechanism that would require weakening an existing assertion.
- Any destructive or irreversible command against a database you did not create.

## Prohibited

No production or staging deployment. No Neon branch deletion or reset. No migration. No
`git push`, no merge, no `git reset --hard`. No `pactify seat use`. No claim that the suite is
deterministic without five identical runs to show for it.

---

## Worker substitution — 2026-08-04

**The engineering is complete and independently verified. What remains is bookkeeping.**

Kimi K3 finished the work and achieved five identical full-suite runs, then exhausted its
provider quota (HTTP 403) before it could commit or checkpoint. The pact task was left
`in_progress` with the work uncommitted in the worktree.

The Human Owner approved a substitute worker on 2026-08-04: **OpenCode,
`deepseek/deepseek-v4-pro`** (pact role `worker-ds`, seat `opencode`) — the same pairing that
delivered Public Task 1. This is a bounded substitution for this task only. It is **not**
standing authorization to change worker models, consistent with the precedent recorded after
Foundation Task 8's Kimi quota exhaustion.

`pactify` has no reassign verb, so the original `test-isolation` task was cancelled and
re-assigned to `opencode`. The cancel event in the ledger, plus this section, are the record of
why the owner changed. Kimi K3 remains the author of the engineering.

### Reviewer verification already completed, before the substitution

The reviewer ran the acceptance bar independently on the uncommitted working tree:

- **Five consecutive full-suite runs, byte-identical every time**:
  `Test Files 1 failed | 71 passed (72)`, `Tests 2 failed | 778 passed (780)`, the only
  failures being the two known `foundation-backfill` endpoint-allowlist refusals.
- **No weakened assertions**: `expect(` added 6, removed 1.
- **Dead scaffolding removed**: 31 retry/`Inconsistent query result` lines deleted, 1 added.
- **Product code untouched**: the diff is `vitest.config.ts`, files under `test/**`, a new
  `scripts/cleanup-test-orphans.ts`, and the convention document.
- Mechanism: one Postgres schema per vitest worker, provisioned by `test/global-setup.ts` and
  selected by `test/setup-db-schema.ts`. True isolation with parallelism preserved.

### The substitute worker's job — and its boundary

Commit exactly what is in the working tree and write the checkpoint evidence. **Do not modify
the implementation.** If you believe something is wrong with it, say so and stop; do not fix
it. A substitute finishing another worker's task must not silently become its co-author.

The five-run result above is the reviewer's own measurement and may be cited as such. Cite
Kimi K3 as the implementation author in the evidence.

### Task id note

`pactify cancel` excludes an id from state permanently — re-assigning the same id is logged but
never reappears. The successor task is therefore **`deterministic-test-suite`**, carrying this
same spec. `test-isolation` remains in the log as the cancelled original.
