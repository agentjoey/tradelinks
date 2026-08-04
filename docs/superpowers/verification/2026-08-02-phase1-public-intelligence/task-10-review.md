# Task 10 review — deterministic-test-suite

Reviewer: Claude Opus 5, pact seat `claude`.
Implementation author: **Kimi Code, `kimi-code/k3`**.
Substitute committer: **OpenCode, `deepseek/deepseek-v4-pro`**, seat `opencode`.
Verdict: **accepted, round 1.**

## What this task was for

Across Tasks 5–9a the same root cause surfaced five times in five different victims — a whole
table recomputed mid-run, a parallel suite's cleanup deleting a row mid-query, orphaned fixtures
pushing a query past its timeout, three of six runs flaking, and finally the reconciliation test
that exists to be cutover evidence failing under load.

The suite reported a different answer depending on when you asked it. Task 9's preconditions
include a seven-day stability report; a green week proves nothing under those conditions.

## The acceptance bar, measured by the reviewer

Five consecutive full-suite runs on the uncommitted tree, **byte-identical every time**:

```
Test Files  1 failed | 71 passed (72)
Tests       2 failed | 778 passed (780)
```

The only failures are the two known `foundation-backfill` endpoint-allowlist refusals, which
are by design. Confirmed again on the committed tree: same numbers, `lint` exit 0, `build`
exit 0.

Five, not three, was deliberate. Task 8 flaked in three of six runs — a three-run sample could
easily have shown a clean sweep of a suite that was still broken.

## The two ways this could have been faked, and neither was

**Weakening assertions.** `expect(` added 6, removed 1. The one removal is accounted for in the
evidence: `public-backfill-plan` replaced a conditional check with a seeded deterministic
inventory asserting *both* mapped and unmapped outcomes, and made the fingerprint-stability test
unconditional. That is more proof, not less.

**Leaving dead scaffolding.** 31 retry/polling lines deleted against 1 added. The retired set is
larger than I knew about: besides the anchored `Inconsistent query result` retries in
`public-feeds`, `public-api-v1` and `public-channel-consistency`, it removed the "unknown
capability" retry in `coverage-readiness`, convergence polling in `public-backfill-plan`, and —
the ones I had not connected — `foundation-backfill`'s 240 s `stablePair` poll and 540 s
apply/replay loop. Those were Foundation-era defences against this same race. Snapshot/restore
was kept, correctly, because sequential same-worker files still need it.

## Mechanism

One Postgres schema per vitest worker (`vitest_w<N>`, pool of 9), provisioned by
`test/global-setup.ts` and selected per worker by `test/setup-db-schema.ts`. True isolation with
parallelism preserved — the option I sketched but did not mandate.

Product code is untouched: the diff is `vitest.config.ts`, files under `test/**`,
`scripts/cleanup-test-orphans.ts` with its library, and the convention document.

`refreshCapabilityReadiness` keeps its whole-table semantics, as required. The hazard was never
that function; it was many suites sharing one schema.

## Honest reporting of the cost

Wall clock went from 373–393 s to 446–557 s — 20–40% slower, from per-worker schema
provisioning. The worker reported this plainly rather than burying it.

The trade is right. A fast suite that returns a different answer each run has no value as a
gate; a slower deterministic one does. Stated here so nobody later "optimises" the isolation
away without understanding what it bought.

## The orphan guard is the right lesson from Task 7

`scripts/cleanup-test-orphans.ts` is prefix-scoped, FK-safe, dry-run by default. More
importantly, `test/orphan-guard.test.ts` **fails the suite when more than 100 stale fixtures
exist**, rather than letting the suite silently slow until a query times out — which is exactly
how the Task 7 incident presented.

## The substitution was handled correctly

Kimi K3 reached the acceptance bar and then exhausted its provider quota before it could commit,
leaving the work uncommitted. The Human Owner approved OpenCode as a bounded substitute for this
task only — not standing authorization, consistent with the precedent recorded after Foundation
Task 8.

The failure mode to guard against was a substitute quietly becoming co-author. It did not
happen: the commit contains no product code and no engineering change, its message names Kimi K3
as implementation author and itself as committer, and its single verification run matched the
reviewer's five-run measurement exactly.

Process notes for whoever hits this next: `pactify` has no reassign verb, and `pactify cancel`
excludes an id from state **permanently** — re-assigning the same id is logged but never
reappears. Hence the successor id `deterministic-test-suite`. Since `cancel` also takes no
reason, the substitution rationale lives in the task spec, which is the durable record.

## What this unblocks

The suite is now a trustworthy gate. A seven-day stability run can mean something. Task 9b —
the production cutover — remains blocked on its own preconditions, which the cutover runbook
marks honestly: the Operations P0 report has not run, and production still has zero publishable
canonical records.
