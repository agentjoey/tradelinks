# Task 5 review — guides-and-briefings

Reviewer: Claude Opus 5, pact seat `claude`. Worker: Kimi K3, seat `kimi`.
Verdict: **accepted, round 2** (one escalation, ruled and implemented).

This was the highest-risk task in Phase 1: nine machine-authored US compliance guides on the
most authority-shaped surface the product has. The review weighted citation integrity and
publishability far above gate numbers.

## Reproduced by the reviewer

| Claim | Result |
|---|---|
| Full suite, run 1 | ✅ 666 passed / 2 failed (668), 64/65 files |
| Full suite, run 2 | ✅ identical — only the 2 known `foundation-backfill` baseline failures |
| `--check` | ✅ exit 0, 9 valid drafts, 0 publishable |
| `--import` | ✅ **9 refused, 0 imported**, four gate codes each |
| Scope | ✅ no `vitest.config.ts` change, no unauthorised `src/**`, zero Track A references, no new `loading.tsx` |
| Live `/guides` | ✅ 200, honest-absence copy, **zero** links to drafts |
| Live `/guides/<draft-slug>` | ✅ real 404 |
| Live `/briefings/weekly/2026/54` | ✅ 404 (invalid week) |
| Live `/briefings/daily/2026-08-01` | ✅ 404 (below threshold, no route) |

Ran twice deliberately. The ruling told the worker that passing once is not evidence against
a race; the same standard binds the reviewer.

## Citation integrity — the reason this task existed

Read `toys-childrens-products-us-requirements.md` in full and checked every regulatory claim:

CPSIA 2008 amending the CPSA · third-party testing by CPSC-accepted laboratories · CPC
contents and the duty to furnish it · tracking labels · 100 ppm total lead in accessible
substrate with a separate lower limit for surface coatings · 0.1 % phthalate limit across
eight listed phthalates · 16 CFR Part 1250 incorporating ASTM F963 · 16 CFR Part 1501 small
parts and its test cylinder · FHSA cautionary labelling for small parts, balloons, small
balls and marbles · 16 CFR Part 1263 implementing Reese's Law · the §15(b) reporting duty.

**Every checkable citation is accurate.** The hedging is placed correctly: CFR part numbers,
which are stable and verifiable, are stated plainly; numeric thresholds, which drift, carry
an explicit confirm-at-source caveat. All cited hosts across the corpus are genuine
authorities — ecfr.gov, cpsc.gov, cbp.gov, fda.gov, ftc.gov, fcc.gov, phmsa.dot.gov,
hts.usitc.gov, oehha.ca.gov, plus platform and standards bodies. No invented domain, no
invented document number.

**Accepted deviation.** The contract said to write the literal
`[UNVERIFIED — confirm at source]` placeholder in place of any figure that could not be
sourced precisely. For the well-established figures (100 ppm, 0.1 %) the worker wrote the
number with an explicit prose caveat instead, and disclosed the choice. Accepted: the figures
are correct, the caveat is unambiguous, the corpus cannot publish, and suppressing correct
numbers would cost a future human reviewer utility without buying honesty.

## Unpublishable by construction, verified mechanically

All nine drafts carry `readiness: EXPERIMENTAL`, `reviewedBy: null`, `lastReviewedAt: null`,
`draftedBy: kimi-code/k3`, `citationsVerified: false`. `publishGuide` refuses on each
condition separately with a distinct code, each separately tested. `--import` refused all
nine. The `Guide` table holds zero non-test rows.

This is the point of the owner's ruling: the guarantee is a mechanical fact, not a promise.
A future slip cannot publish them.

The `/guides` copy earns its place — *"Every draft carries unverified citations and no
reviewer sign-off, so none of them is listed or linked here. That is deliberate: we do not
publish authority we cannot stand behind."*

## The escalation, and what it exposed

The worker stopped rather than checkpoint a red gate. Its root cause was correct and the
hazard was **not its own**: `refreshCapabilityReadiness` forwards to
`recomputeAllCapabilityReadiness`, an unscoped write across the shared `CoverageCapability`
table, which flipped `public-hubs` fixtures to STALE mid-run. The reviewer reproduced it —
two consecutive full runs with byte-identical six-failure sets — and confirmed the mechanism
in source.

**The hazard has existed since Task 3.** The reviewer's Task 3 full-suite run was green
because the file count had not yet reshuffled worker scheduling into the overlap. A green
suite accepted a latent race; that is a reviewer miss, not a worker one.

Scope extension granted for the two accepted-task test files, with the fix required to remove
the *susceptibility* (fixtures no longer overdue at the recompute clock) and *contain* the
global mutation (snapshot/restore in `try`/`finally`). Serialising DB suites in
`vitest.config.ts` was explicitly refused: it would pay a multi-minute penalty on every run
to hide a local fragility and would not stop the next task writing an equally fragile fixture.

**Standing rule, now recorded for Tasks 6–9**: any test invoking a function that recomputes or
refreshes *all* rows of a shared table must snapshot and restore that table, and no fixture
may depend on shared state such a function can rewrite.

## Reviewer errors this round

Three quick checks produced wrong conclusions before being corrected:

- Word counts flagged as out of range — `wc -w` counts frontmatter and punctuation tokens; the
  validator counts only tokens containing a letter or digit, and enforces the range at
  `guides.ts:387`. All nine are in range.
- The same miscount was read as an inaccuracy in the worker's reported range. It was not.
- Earlier in the session, a `paste`-mangled pipeline suggested Task 5 had failed to register
  in Pact. It had.

Recorded because the pattern matters more than any one instance: verify the check before
believing its result.

## Carried forward

`/guides` and `/briefings` now exist, retiring two more dead internal links. **`/api/v1/changes`
remains** (Task 7). The Task 3 requirements still bind: Task 8 owes a site-wide internal-link
integrity crawl that fails on any non-200 internal link, and Task 9 must not cut over while
any public-page internal link returns 404.

Per-surface loading skeletons remain owed by whichever task owns each surface. No
`loading.tsx` may sit above a readiness-gated route.
