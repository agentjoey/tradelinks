# Task 7 review — public-api-and-skill

Reviewer: Claude Opus 5, pact seat `claude`. Worker: Kimi K3, seat `kimi`.
Verdict: **accepted, round 1.**

## Verified live, on a real production build

Every contract claim was checked against a running server rather than read from the worker's
`curl` captures.

| Check | Result |
|---|---|
| `curl` with no browser headers | 200 — no UA gate on `/api/v1` |
| `ETag` | present, `"d313cf60…"`, fingerprint-shaped |
| `If-None-Match` round-trip | **304** |
| 304 response body | **0 bytes** |
| `limit=0` / `limit=101` | **400** each — deterministic rejection, not a silent clamp |
| Forged cursor | **400**, `"code":"INVALID_CURSOR"` |
| `/openapi.json` | 200 |
| `SellerProfile` / `PersonalAction` / `RelevanceAssessment` in OpenAPI | **0 occurrences** |
| `/agent/tradelinks/SKILL.md` | 200 |
| `pnpm lint` | exit 0 |
| Targeted (api + skill + channel consistency) | 3 files, 36 tests passed |

## The cursor collision was handled correctly

The plan's Interfaces line claims Task 7 *produces* `encodeCursor` and `decodeCursor`. Those
already existed in `query.ts`, and Task 4 was sent back for duplicating exactly them.

Verified: `query.ts` untouched; the new helpers are named `encodeApiCursor` / `decodeApiCursor`
and live in `api.ts`; the API cursor translates into the web cursor at the read-layer boundary
rather than replacing it. Two schemes, two contracts, one implementation each — which is the
distinction Task 4's rework established.

Scope was clean: only the authorized files, with `.env` and `app/api/public/**` untouched.

## The sitemap failure — the worker's characterization was wrong, but so was mine to expect otherwise

The worker reported `public-seo.test.ts` as a pre-existing **flake** that "passes standalone at
4886ms of its 5000ms budget".

Reviewer measurement: it failed **three standalone runs out of three**, at 5008/5010/5008 ms.
Deterministic, not flaky. And it had **passed** in both full-suite runs at Task 6 acceptance,
so "pre-existing" did not hold on the timeline either.

Root cause was neither Task 7 nor a flake: the shared Neon branch had accumulated **91 orphaned
canonical changes**, plus 91 test sources and 91 test items, from interrupted runs. The sitemap
query enumerates them. A material share of that pollution is the reviewer's own — `pkill -f
vitest` was used twice during connection-parameter debugging, and a killed suite never runs its
`afterAll`.

Cleaned under owner authorisation, prefix-scoped, in one transaction, with before/after counts
reconciled per table. `CoverageCapability` (10) and legacy `alerts` (571) were confirmed
untouched. The first attempt failed on an `items_sourceId_fkey` RESTRICT and rolled back whole —
no half-cleaned state.

After cleanup the test went from **always failing** to **passing at 3957 ms standalone but still
failing under full-suite load**. The 5000 ms budget remains too tight for a remote Neon query.
That fragility dates from Task 3 and is now unmasked rather than introduced.

**Routed to Task 8**, which owns SEO and performance and therefore owns this test.

## `/amazon-us` returns 404 — a real defect, not Task 7's

The worker flagged that the nav statically links `/amazon-us` while the route 404s, and
correctly left it alone as out of scope. Investigating further, the cause is a mis-grading in
the coverage contract:

`src/canonicalize/coverage.ts` grades `platform:amazon-us` as `UNAVAILABLE`, yet the same entry
lists four working public sources (`AMZ-ANNOUNCEMENTS`, `AMZ-PRICING-PAGE`, F01, F11) and known
gaps that read "public announcements and pricing-page diffs only".

By the coverage page's own published glossary — *Unavailable: no lawful public route to the
authoritative source*; *Monitored: published and watched, but not confirmed to that standard* —
Amazon US is **Monitored**. There is a lawful public route; it just cannot reach the
authoritative page.

Three independent sources agree: owner decision 4 of 2026-08-02 ("publish at Monitored with the
warning above the fold"), the approved mockup, and the glossary the product itself publishes.

**Routed to Task 8** with the required fix: regrade to `MONITORED`, keep every known gap
verbatim, keep a hard ceiling below `VERIFIED`. Surfaced to the Human Owner before ruling,
because it changes what the public coverage page says about Amazon.

## Carried forward into Task 8

1. Regrade `platform:amazon-us` to `MONITORED` with gaps and ceiling intact.
2. Fix `public-seo.test.ts`'s 5000 ms budget — it is an SEO test and Task 8 owns SEO.
3. The site-wide internal-link integrity crawl owed since Task 3, failing on any non-200
   internal link. With `/api/v1/changes` now serving 200, `/amazon-us` is the only known
   remaining 404 — the crawl must prove that rather than anyone asserting it.
4. The structural debt logged in the Task 6 review: parallel suites share one Neon branch and
   have now produced three distinct failures (Task 5 global recompute, Task 6 mid-query delete,
   Task 7 accumulated-pollution timeout). Isolation or an enforced cross-suite invisibility
   convention, not another workaround.
