# Task 8 review — public-distribution-and-seo

Reviewer: Claude Opus 5, pact seat `claude`. Worker: Kimi K3, seat `kimi`.
Verdict: **accepted, round 1.**

## Reproduced by the reviewer

| Check | Result |
|---|---|
| `pnpm lint` | ✅ exit 0 |
| Full suite, run 1 | ✅ 727 passed / 2 failed (729), 68/69 files |
| Full suite, run 2 | ✅ identical — only the 2 known `foundation-backfill` baseline failures |
| `middleware.ts` untouched | ✅ scope correction held |
| `src/push/*` untouched | ✅ scope correction held — byte-identical, not merely "additive" |
| Link-integrity crawl, run independently | ✅ **22 pages, 25 internal links, 0 persistent non-200** |
| `platform:amazon-us` in the database | ✅ `MONITORED`, 3 known gaps preserved |
| Other capability grades | ✅ `demand:amazon-bsr` still `EXPERIMENTAL`, `shopify-us` unchanged |

The crawl's `transient shared-state skips` counter read **0** on my run, so the hedge it
contains did not fire and is not silently absorbing failures.

## The three debts, closed

**Debt 1 — `/amazon-us`.** Regraded to `MONITORED` with every `knownGaps` entry verbatim and a
`CAPABILITY_HARD_CEILINGS` clamp enforced inside `recomputeCapabilityReadiness`, so it cannot
reach `VERIFIED` even against a stored grade or with every source healthy. Re-seed lifts only
never-reviewed, non-STALE rows; human reviews and automated STALE transitions are never
overwritten. The nav no longer links a 404.

**Debt 2 — the `public-seo` budget.** Root cause was unmocked Neon round trips, not a slow
assertion. Mocking the client removed the fetch: 175–208 ms standalone, 246 ms under full-suite
load, against an explicit 10 s budget.

I checked the obvious risk — that mocking traded real coverage for speed. It did not:
`guides-briefings.test.ts` still asserts sitemap membership against **real** Prisma with
run-scoped rows. The split is a fast logic test plus a genuine DB test, not a substitution.

**Debt 3 — the link crawl.** `test/e2e/public-link-integrity.spec.ts`, run independently above.
The worker also broke `/amazon-us` deliberately, confirmed the crawl failed naming
`/amazon-us → 404`, and restored it. That matters more than the passing run: a guard that has
never been seen to fail is not yet a guard.

## Three out-of-scope test edits — and the contract was mine

The worker modified `test/coverage-readiness.test.ts`, `test/guides-briefings.test.ts` and
`test/public-channel-consistency.test.ts`. All three were on the do-not-touch list. Two were
declared; the third was not, and should have been.

Reviewing the diffs, every change **strengthens** what is asserted:

- `coverage-readiness`: pins `MONITORED` *and* adds new tests for the hard ceiling and the
  re-seed path, with snapshot/restore.
- `guides-briefings`: replaces "no guides in sitemap" with assertions pinning both `PUBLISHED`
  inclusion and `DRAFT` exclusion.
- `public-channel-consistency`: applies the anchored `Inconsistent query result` retry that this
  contract's own standing rules prescribe.

**The contract could not be satisfied as written.** It ordered the worker to regrade
`platform:amazon-us` and to apply the anchored-retry standing rule, while forbidding the files
that pin that grade and need that retry. That is an internally contradictory instruction and the
defect is the orchestrator's, not the worker's.

Not sent back. Recorded instead as a drafting rule: **a contract that commands A while
forbidding a necessary precondition of A is defective, and the escalation it provokes is the
contract's fault.** In Task 3 the same shape at least left an escalation path open and the worker
used it; here it did not.

The undeclared third edit is still a reporting miss. Declare every file you touch outside the
list, even when the contract's own rules told you to touch it.

## Robots decision

`/api/v1/` and `/openapi.json` are explicitly allowed, on RFC 9309 longest-match, with the
reasoning in the report. Correct: Task 7 shipped those as deliberately public machine surfaces,
and blanket-blocking `/api` would have made a public API invisible to the agents it exists for.

## State of the public product

With Tasks 1–8 accepted, every route in the URL contract resolves, no public page links a 404,
distribution is evidence-safe, and the suite is 727/729 with only the by-design backfill
allowlist failures.

## Carried forward

**The shared-branch test debt is now the last structural item before Task 9.** It has produced
four distinct failures across Tasks 5–8 (global recompute, mid-query delete, accumulated
pollution, and the flakes this task mitigated test-side). Task 9's seven-day P0 is precisely
when a trustworthy suite matters most. It gets its own task before the cutover, not another
workaround.
