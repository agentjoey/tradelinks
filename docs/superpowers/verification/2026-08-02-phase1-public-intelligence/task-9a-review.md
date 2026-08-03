# Task 9a review — cutover-readiness

Reviewer: Claude Opus 5, pact seat `claude`. Worker: Kimi K3, seat `kimi`.
Verdict: **accepted, round 1** — with a hard caveat on the suite, below.

This task was the reversible half of the plan's Task 9, by Human Owner direction on
2026-08-03. The review's first question was not "do the gates pass" but **"did anything
irreversible get built, or any button left that someone could press by accident."**

## Nothing irreversible exists — verified, not assumed

| Check | Result |
|---|---|
| `prisma/migrations/0014*` or any `retire` migration | **none** |
| `prisma/**` modified | **no** |
| Files deleted | **zero** |
| `--apply` path | exists **only** as a refusal that names Task 9b |
| `PUBLIC_CUTOVER_ENABLED` default | off — requires an explicit `true`/`1` |
| Redirect module wired into a route, middleware or config | **nowhere** |
| Diff | exactly the 6 in-scope files |

`--apply` was invoked directly and refused with a message naming what it would have written
and which task owns it.

## Verified behaviour

- **Fingerprint stability**: two consecutive dry-runs produced the identical
  `d93efa22…088565`.
- **Reconciliation honesty**: `mappedAlerts: 0`, `unmappedAlerts: 571`,
  `unmappedPublishedDailyNotes: 22`, every row with a reason. Crucially the machine output
  itself carries the interpretation: *"unmapped rows are a pre-condition failure for cutover,
  not a bug in this report … even MAPPED rows are not publishable content … Cutover today
  replaces a working site with an empty one."* The next person to run this script sees that
  without reading any document.
- **Reconciliation correctness**: `test/public-backfill-plan.test.ts` passes **13/13 on three
  consecutive isolated runs**.

## The runbook is the real deliverable

Written for someone who is not the author and may arrive months later. It names the audience
and the 2am constraint, flags the `0013`-is-taken naming trap before the reader can fall into
it, gives every precondition a copy-pasteable check with expected output, and marks P3
(Operations P0 report) and P4 (publishable records) **⛔ UNMET** rather than leaving them
implied.

§2 states the thing that matters without softening it:

> **Cutting over today replaces a working site with an empty one.** … This is weeks of
> editorial work, not a deploy step. Budget for it or do not cut over.

Steps are reversible through Step 7; Step 8 is marked as the point of no return (migration
`0014`), with per-stage rollback and Stage D being restore-from-Neon-branch into a *new*
recovery branch — never a down migration.

## The caveat: the suite is no longer a reliable gate

The worker reported a final full suite of 772 passed / 0 failed. I could not reproduce that.
Two consecutive reviewer runs gave **different** failure sets:

- run 1 — `public-read-model` (repeat-query order), 771 passed
- run 2 — `public-backfill-plan` (alert accounting), `public-read-model` ×2

Task 9a's own test passes deterministically in isolation, so this is not its defect. It is the
shared-branch race, now on its **fifth** distinct manifestation across Tasks 5–9a. What is new
and worse: it now intermittently fails the reconciliation test that exists specifically to be
the evidence for a cutover decision.

Accepted anyway, because blocking 9a would charge one task for a debt five tasks created, and
its deliverables are verified independently of the suite. But the consequence must be stated
plainly rather than filed:

**The full suite is currently not a trustworthy gate, and no cutover decision should rest on
it until it is.** The plan's Task 9 preconditions include a seven-day stability report; a
seven-day green run means nothing if the suite's failure set is nondeterministic.

## Carried forward — now blocking, not merely flagged

The shared-branch test isolation work must happen before any further public-intelligence task
and before any P0 measurement. Five manifestations:

| Task | Failure |
|---|---|
| 5 | `refreshCapabilityReadiness` recomputes a whole shared table mid-run |
| 6 | a parallel suite's FK-safe cleanup deletes a row mid-query |
| 7 | accumulated orphan fixtures push a query past its timeout |
| 8 | three of six full runs flake, mitigated test-side |
| 9a | the reconciliation evidence test fails under load, passes 3/3 isolated |

Each was individually reasonable to work around. Together they mean the suite reports a
different answer depending on when you ask it.
