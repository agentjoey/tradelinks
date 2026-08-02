# Task 3 review — readiness-gated-hubs

Reviewer: Claude Opus 5, pact seat `claude`. Worker: Kimi K3, seat `kimi`.
Reviewed range: `825ed18..HEAD` on `feat-phase1-public-intelligence`.
Verdict: **accepted, round 1.**

## Reproduced by the reviewer, not read from evidence

| Claim | Result |
|---|---|
| `pnpm lint` | ✅ exit 0 |
| targeted (`public-hubs` + `public-seo` + `public-shell`) | ✅ 3 files, 53 tests passed |
| `pnpm test` full, real database | ✅ 62 files, **606 passed / 2 failed (608)** — only the two known baseline failures |
| `pnpm build` | ✅ compiled, all routes emitted |
| 36 screenshots distinct | ✅ 36 files, 36 unique sha256 |
| sitemap excludes unbuilt routes | ✅ no `/changes`, `/guides`, `/briefings` entries |
| demo/test data cleaned | ✅ see "false alarm" below |

## The two escalations

Both were correct. Stopping to ask was the right outcome in each case, and it is the
behaviour that was missing in Task 2 round 1.

**Escalation 1 — home wiring breaks accepted Task 2 tests.** Ruled Option A: Home stays
wired to the real read model; the specimen home was fabricated content and PRODUCT.md
forbids shipping it. Scope extended to exactly three tests, with a condition.

*Condition verified.* The re-aimed `shows readiness as literal words with evidence inline`
renders two `IntelligenceCard`s against hardcoded fixture records and asserts the literal
words `Verified` and `Monitored` plus two inline `Evidence` blocks and their summaries. It
has no database dependence and cannot pass vacuously. The invariant still fails loudly if
someone encodes readiness by colour alone. Condition met properly, not nominally.

**Escalation 2 — soft-404 on gated hubs.** The worker isolated it cleanly: with
`app/(public)/loading.tsx` present, a below-Monitored hub returns HTTP 200 with
`NEXT_NOT_FOUND` inline; with it removed, 404. Ruled: delete the file. A soft-200 tells
search engines a gated hub exists and is healthy, which is the exact dishonesty the product
exists to avoid; the file was also the inherited BL-045 legacy-home skeleton and matched no
Phase 1 surface.

*Condition verified.* `test/e2e/public-hubs.spec.ts` asserts real Playwright navigation
status — below-Monitored category → 404, unsupported topic → 404, `/amazon-us` → 200 with
content — and sets/restores capability readiness around the run. It additionally encodes
owner decision 4 by asserting the incomplete-coverage warning appears above the changes
list. This will fail loudly if a `loading.tsx` is ever reintroduced above a gated route.

## False alarm the reviewer raised and then cleared

Mid-review I found 12 `testhub-<runId>-*` `CanonicalChange` rows on the shared branch and
was about to record a hygiene failure. They were created by **the reviewer's own in-flight
`pnpm test` run**. After it finished: `CanonicalChange` 0, `EvidenceRecord` 0,
`CoverageCapability` exactly the 10 contract keys, zero `test`-prefixed rows anywhere. The
worker's cleanup claim is accurate.

Recorded because the first check was also wrong in a way worth remembering: it filtered on
`id LIKE 'test-%'`, but these fixtures carry the prefix on `slug` while `id` is a CUID. A
prefix check must match the column the fixture actually prefixes.

## Design conformance

Checked against the approved gate, on the rendered final build, not on source:

- Amazon US hub leads with "What we can and cannot see here" **above** the changes list —
  owner decision 4 honoured.
- Every Monitored card states its own limit in prose, not a bare badge.
- Demand context is labelled `EXPERIMENTAL` and states it "cannot support a bestseller
  claim, a launch recommendation, or a market-size estimate".
- Known coverage gaps are present and non-empty on every capability; the coverage matrix is
  worst-first; `LAST CONTENT REVIEW — NEVER REVIEWED SINCE SEEDING` is shown rather than
  hidden.
- Readiness renders as a literal word everywhere; the coverage page carries a full glossary
  of all five states.
- No horizontal overflow at 390px.

## Accepted debt, tracked not waived

**Dead internal links on public pages.** `app/(public)/` links to four routes that do not
exist yet: `/changes` (Task 4), `/guides` and `/briefings` (Task 5), `/api/v1/changes`
(Task 7). Three of them arrived with `PublicNav` in Task 2 and the reviewer did not check
for dead links then — that is a reviewer miss, recorded here rather than charged to Task 3.

Not blocking, because: the branch is not deployed, public cutover is Task 9, the sitemap
does not lead crawlers to them, and building those routes is explicitly outside Task 3.

**It must not survive on reputation.** Two hard requirements follow from this:

1. Task 8 (SEO/performance) must include a site-wide internal-link integrity crawl that
   fails on any internal link returning a non-200, not merely a sitemap crawl.
2. Task 9 (production cutover) must not proceed while any internal link on a public page
   returns 404. This is a precondition, not a checklist nicety.

**Per-surface loading skeletons** are now owed by Tasks 4 and 5, since the group-level
`loading.tsx` was removed. A `loading.tsx` must never again sit above a readiness-gated
route. The worker recorded this; it is restated here so it survives context loss.

## Not re-litigated

Design direction, palette, theme default, URL contract, topic vocabulary, and the Amazon-at-
Monitored ruling are settled by the 2026-08-02 owner gate.
