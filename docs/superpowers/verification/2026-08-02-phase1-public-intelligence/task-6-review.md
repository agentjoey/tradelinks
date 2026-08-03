# Task 6 review — canonical-feeds

Reviewer: Claude Opus 5, pact seat `claude`. Worker: Kimi K3, seat `kimi`.
Verdict: **accepted, round 2** (one escalation, ruled and implemented).

## Reproduced by the reviewer

| Claim | Result |
|---|---|
| `pnpm lint` | ✅ exit 0 |
| feeds + channel consistency | ✅ 2 files, 24 tests passed |
| Full suite, run 1 | ✅ 685 passed / 2 failed (687), 65/66 files |
| Full suite, run 2 | ✅ identical — only the 2 known `foundation-backfill` baseline failures |
| `feeds.ts` has no query of its own | ✅ zero `prisma.*`, zero hash computation |
| Scope | ✅ only `test/public-feeds.test.ts` among test files; no accepted contract touched |

## The invariant is pinned where it had to be

This was the point of the task. `test/public-channel-consistency.test.ts` asserts the
one-canonical-version rule over **projection objects**. A feed rendered through a parallel
formatting path would leave those tests green while the real XML drifted — the suite would
then be asserting a guarantee it no longer provides.

The implementation closes that:

- `feeds.ts` imports `searchPublicChanges`, `listPublishedBriefings` and `PUBLIC_CACHE`, and
  contains no Prisma call and no fingerprint computation of its own.
- `test/public-feeds.test.ts:283` asserts over the **parsed XML nodes** that `link` equals
  `record.permalink` and `category[domain="fingerprint"]` equals `record.fingerprint`, by
  `toBe` equality against the serializer's output — not substring containment.
- The hostile fixture `Cats & "Dogs" <Deluxe> '26 Sale` plus a `\x0B` control character
  round-trips a real `DOMParser`, so escaping is proven rather than assumed.

## Escalation — a plan defect, correctly found

The plan prescribed `app/feeds/platforms/[platform].xml/route.ts`. Next.js cannot serve that:
`next/dist/server/app-render/get-segment-param.js` treats a segment as dynamic only when it
both starts with `[` and ends with `]`, so `[platform].xml` registers as a static segment
matching its own literal name. The reviewer confirmed this in framework source.

The worker probed empirically before escalating — including the telling case that
`/feeds/platforms/%5Bplatform%5D.xml` returns 200 — then deleted its probes and left the tree
clean. The amendment (`[platform]/route.ts`, require and strip the `.xml` suffix, validate
against the enum, 404 otherwise) was granted exactly as proposed, and preserves the external
URL contract with no config change. A `next.config.mjs` or `middleware.ts` rewrite was
explicitly refused.

Recorded so **Task 7 does not copy the `[param].ext` file-map pattern for `/api/v1/...`**.

## Accepted: the narrow retry

`test/public-feeds.test.ts` adds `withDbRetry`. It is anchored to the exact string
`Inconsistent query result` and rethrows everything else immediately; four attempts with
backoff; documented reasoning. Curated public rows are never hard-deleted in production, so
this is an artifact of parallel suites sharing one database branch, not a product defect. Same
pattern the Foundation backfill test already uses. No product code retries.

## Structural debt — shared-branch parallel suites have now bitten twice

| Task | Race | Disposition |
|---|---|---|
| 5 | `refreshCapabilityReadiness` recomputes the whole `CoverageCapability` table and flipped `public-hubs` fixtures | Fixed: susceptibility removed, global mutation snapshot/restored |
| 6 | A parallel suite's FK-safe cleanup deleted a row mid-query | Worked around with the narrow retry; **root cause remains** |

Task 6's run-1 victim was Task 1's `test/public-read-model.test.ts`, which was correctly left
untouched as out of scope — so that instance is still latent.

This is a test-architecture problem, not a worker mistake: many suites mutate one shared Neon
branch concurrently. Tasks 7–9 will keep adding DB-backed tests to the same branch. It should
be addressed deliberately rather than absorbed one victim at a time — either per-suite data
isolation, or a documented convention that every suite's fixtures are invisible to every other
suite's queries. Flagged here rather than fixed, because a real fix is its own piece of work.

## Correction to the Task 5 review

That review stated that `/guides` and `/briefings` retired two dead internal links and that
`/api/v1/changes` was the only one remaining. That was incomplete: `PublicFooter` and the home
page had been linking `/feeds/changes.xml` and `/feeds/briefings.xml` since Task 2, so three
were dead, not one.

Task 6 retires both feed links. **`/api/v1/changes` is now genuinely the last one**, and
Task 7 owns it. The Task 3 requirements still bind: Task 8 owes a site-wide internal-link
integrity crawl failing on any non-200 internal link, and Task 9 must not cut over while any
public-page internal link returns 404.

## Cutover note carried forward

`/feed.xml` now 308s to `/feeds/changes.xml`. Legacy RSS subscribers move from Wire alerts to
canonical changes the moment this branch deploys. Task 9's cutover checklist owns announcing
that; it is recorded in the worker's report.

`app/sitemap.ts` was deliberately left untouched — feeds are subscription endpoints, not crawl
targets. Justified in the report and accepted.
