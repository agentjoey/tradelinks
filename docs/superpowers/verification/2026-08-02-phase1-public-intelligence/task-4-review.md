# Task 4 review — canonical-changes-experience

Reviewer: Claude Opus 5, pact seat `claude`. Worker: Kimi K3, seat `kimi`.
Verdict: **accepted, round 2.**

## Round 1 — one blocking finding

**B1, cursor helpers duplicated.** `encodeCursor` / `decodeCursor` were re-stated verbatim in
`search.ts` because they are module-private in `query.ts`, which was outside the task's scope
list. That conflict is precisely the contract's stop condition; the worker had escalated
correctly twice in Task 3 and was upheld both times, and this was the third such moment.

Blocking, not pedantry: Task 7 builds `/api/v1/changes` and owns the public cursor contract.
Two copies of a wire format drift, and drift here makes web pagination and API pagination
disagree — a direct violation of the invariant that every channel reads the same canonical
version. A cross-compat test proves agreement today, not after Task 7 edits one copy.

**Fixed in round 2**, verified by the reviewer rather than read from evidence: the diff to
`query.ts` is exactly two `export` keywords and nothing else; `search.ts` imports both and
contains zero `Buffer.from` calls. One implementation, wire format untouched.

## A criticism the reviewer withdrew

Round 1 also raised N1: that reporting "632 passed / 0 test failures / 639 collected"
overstated stability while separately disclosing five Neon connection drops.

**The worker's number was correct.** After stabilising the environment the reviewer
reproduced 632 passed / 7 skipped / 639 collected, 63/64 files, only
`test/foundation-backfill.test.ts` failing — byte-identical to the worker's figure. The
non-determinism was the reviewer's own doing (see below). N1 was formally downgraded in the
fix-round dispatch to a single request: note in the report that DB-backed suites were
environment-sensitive during this task. No numbers were changed.

Recorded deliberately. An unfair criticism left standing teaches a worker that reporting
true numbers invites suspicion, and it corrupts the baseline every later task is read
against.

## Environment failure, orchestrator-caused

The flakiness was introduced by the reviewer when provisioning this worktree's `.env`.

- **Symptom**: non-deterministic `PrismaClientInitializationError` hitting different test
  files on every run.
- **Cause**: Neon compute auto-suspends; parallel vitest workers connecting during wake fail
  without a connect timeout.
- **First attempt made it worse**: adding `pgbouncer=true`, `connection_limit=1` and
  `pool_timeout` together. `connection_limit=1` deadlocks against this project's interactive
  transactions — a transaction holds the only connection while its inner queries need
  another — converting random failures into deterministic hangs.
- **Actual fix**: `connect_timeout=30` on both URLs, and warming the compute with
  `pnpm exec prisma migrate status` before a run. Nothing else.
- **Verification**: the four DB-heavy suites ran 59/59 three consecutive times; the full
  suite then produced the stable baseline above.

The lesson is the one the workers are held to: isolate one variable before changing another.

## Reproduced by the reviewer

| Claim | Result |
|---|---|
| `pnpm lint` | ✅ exit 0 |
| four DB suites | ✅ 4 files, 85 tests passed |
| `pnpm build` | ✅ compiled, all routes emitted |
| `query.ts` change is export-only | ✅ diff is two `export` keywords |
| duplicate codec removed | ✅ zero `Buffer.from` in `search.ts` |
| no `app/(public)/changes/loading.tsx` | ✅ absent — the soft-404 trap was avoided |
| screenshots | ✅ 12 files, 12 unique sha256, real content |

## Design conformance

Checked on rendered output, not source. `/changes` matches Surface 3: Verified default,
scope switcher, native GET `FilterBar` that works without JavaScript, coverage strip,
`IntelligenceCard` reused rather than duplicated, evidence ordered primary-then-secondary
with hostnames and dates, correction notices in prose, experimental demand held below a rule
with the full non-promise copy including "not evidence that an opportunity exists".

## Accepted as recorded

- Search ships unindexed; the row count is disclosed and the index is deferred to Task 8,
  which owns performance. Not presented as the plan's indexed search.
- No `Track this change` entry point — `/onboarding` belongs to Private Relevance.
- The cross-task P2 about `app/not-found.tsx` content is routed to the orchestrator, not
  waived by the worker.

## Carried forward

The dead-link debt from Task 3 is unchanged and still binds: Task 8 must run a site-wide
internal-link integrity crawl that fails on any non-200 internal link, and Task 9 must not
proceed while any public-page internal link returns 404. `/changes` now exists, which
retires one of the four; `/guides`, `/briefings` and `/api/v1/changes` remain.
