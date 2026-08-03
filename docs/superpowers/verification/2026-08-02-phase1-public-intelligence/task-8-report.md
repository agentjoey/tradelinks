# Task 8 Report — Public Telegram, SEO, and the Link Debt (public-distribution-and-seo)

Worker: Kimi Code (kimi-code/k3) · Reviewer: Claude Opus 5 (fresh context) · Date: 2026-08-03
Contract: `.pact/tasks/phase1-public-intelligence-public-distribution-and-seo.md`

## Scope corrections honoured

1. **`middleware.ts` untouched** — nothing in this task needed it. `git status` proves it.
2. **`src/push/*` untouched entirely** — the public Telegram path is a separate entry point
   (`src/public-intelligence/telegram.ts`) that *consumes* `channel-db.ts` helpers and
   `send.ts` types/`sendToChannel` unchanged. Legacy selection/rendering behaviour is
   byte-identical because the code is byte-identical; legacy suites
   (`channel-select`, `channel-render`, `push`, `public-channel-consistency`) green
   untouched (53/53). This is strictly stronger than "additive".

## Debt 1 — platform:amazon-us regraded to MONITORED

- `src/canonicalize/coverage.ts`: seed readiness `UNAVAILABLE` → `MONITORED`; every
  `knownGaps` entry **verbatim** (untouched). New `CAPABILITY_HARD_CEILINGS`
  (`platform:amazon-us: MONITORED`) + `clampToHardCeiling`, enforced inside
  `recomputeCapabilityReadiness` — so the ceiling holds even against an erroneous stored
  raise, and automation can still only lower. STALE is transitional and never clamped.
- Re-seed path: `seedPhase1Coverage` now syncs a stored grade to the seed's reviewed
  ceiling ONLY when the row was never human-reviewed (`lastReviewedAt` epoch sentinel)
  and is not carrying an automated STALE transition. Human reviews and STALE rows always
  survive re-seeding (the pre-existing "never rewrites a stored readiness" test still
  passes unchanged in behaviour).
- Branch DB re-seeded: stored `platform:amazon-us` is now `MONITORED`; the other nine
  capabilities unchanged (verified by direct query).
- Ceiling test (`test/coverage-readiness.test.ts`): with all four contract sources
  healthy and inside SLA, recompute keeps MONITORED, and a stored VERIFIED is clamped
  back to MONITORED and persisted. Snapshot/restore on the shared row and its sources.
- **Earlier-task test touched (forced consequence, stated plainly):**
  `test/coverage-readiness.test.ts` asserted the old mis-grade
  (`expect(amazon.readiness).toBe("UNAVAILABLE")`). Owner decision 4 / this contract
  mandate the regrade, so that one assertion was updated to MONITORED and the two new
  tests (re-seed lift, hard ceiling) were added there — the only suite whose fixtures
  can exercise the ceiling against real source health.

## Debt 2 — public-seo budget fixed at the root

- Root cause: the sitemap test made real Neon round trips
  (`prisma.briefing.findMany`, `prisma.canonicalChangeVersion.findMany`, the latter
  inside sitemap.ts's own 4.5 s budget race). Polluted branch → 5008/5010/5008 ms vs the
  5000 ms default; clean branch → 3957 ms standalone, still failing under suite load.
- Fix: `test/public-seo.test.ts` now mocks `../src/db/client.js` (honouring the
  `editorialStatus` filter so draft-exclusion regressions still surface) — zero network
  I/O, deterministic. NOT a budget-raise.
- **Measured margin**: 175 / 178 / 208 ms over three standalone runs (whole file),
  ~440 ms wall including transform/setup. The sitemap test carries an explicit
  10 000 ms budget → slowest measured run uses 2.1 % of it (~48× headroom). Under the
  full-suite run it finished in 269 ms (see gates below).
- The pet-supplies hard-code is gone: exclusion is asserted against a synthetic
  test-seeded `category:fixture-below-monitored` (UNAVAILABLE), immune to production
  grades; `platform:amazon-us` (MONITORED in the mock) is asserted INCLUDED.

## Debt 3 — site-wide internal-link integrity crawl

- `test/e2e/public-link-integrity.spec.ts`: seeds three run-scoped VERIFIED changes
  sharing IMPORT_CUSTOMS (so the topic page and every `/changes/<slug>` link resolve),
  crawls from the ten static contract routes, collects every internal href on every
  reachable page, and checks each one: 200, or 3xx-with-Location (intended redirect).
  Anything else fails the suite naming the page and the link. Desktop project only
  (the link graph is viewport-independent); the mobile project neither seeds nor runs.
- Parallel-suite hardening (learned the expensive way): no guide/briefing fixtures —
  a published guide broke `public-briefings.spec.ts`'s honest-absence assertion on the
  shared branch, and other suites' ephemeral fixture links 404'd mid-crawl when their
  afterAll ran. The crawl now fails a link only when the linking page STILL links it
  AND it still does not resolve on a delayed recheck — transient shared-state skips
  are counted and printed. A genuinely broken STATIC link (PublicNav → `/amazon-us`)
  never clears that bar, so the Debt 1 regression case is still caught.
- **Final result (final build, standalone): pages crawled: 24; unique internal links
  checked: 28; intended redirects: 0; non-200/non-redirect: 0** — the zero is the
  crawl's own printed count, not anyone's assertion. (Full-suite e2e numbers in the
  Gates section.)
- **Break/restore proof performed**: I set the stored `platform:amazon-us` readiness
  to UNAVAILABLE on the branch, re-ran the crawl, and it FAILED naming exactly
  `page /amazon-us returned 404`; restored MONITORED and re-ran green. (Re-done after
  the hardening change — exact outputs in the Gates section.)

## Public Telegram (`src/public-intelligence/telegram.ts`)

- `selectPublicTelegramChanges`: `searchPublicChanges({ pool: "verified" })` — the
  accepted read model, no new query shape — then urgency ≥ 70 and not-already-pushed.
  Optional scope filters use the read model's own vocabulary (used by tests to isolate
  fixtures via `q`).
- `renderPublicTelegramMessage`: title, concise public impact (`generalImpact`),
  readiness, effective date, and the serializer's own permalink — HTML-escaped. Never
  personal impact/relevance (the DTO carries none) and never actions
  (`generalActionTemplate` deliberately unrendered; test pins its absence).
- `runPublicTelegramPush`: gated on Telegram env unless a sender is injected; resolves
  the channel id (BL-040 normalization), sends with the permalink as the tappable link
  preview, records `ChannelPush` rows (`itemType: canonical-change`,
  `itemId: canonical:<versionId>`) — once per version per channel; failed sends are not
  recorded and retry next run. Tests use a fake sender only; no real send is possible.
- `test/public-telegram.test.ts` (6 tests): gate matrix (below-urgency, MONITORED, DRAFT,
  non-current, unreviewed all excluded), limit + already-pushed, render content/escaping,
  idempotent re-run (0 re-sends), per-channel idempotency scope, failure-not-tracked
  retry. Run-scoped fixtures, FK-safe teardown with a zero-residue assertion.

## Sitemap, robots, metadata

- `app/sitemap.ts`: added published guides via the accepted read layer
  (`listPublishedGuides` — drafts cannot leak); the `/guides` index becomes a crawl
  target only while ≥ 1 guide is published (honest-absence preserved; test asserts both
  states). Everything else (Monitored+ hubs, supported topics, published changes,
  published briefing periods, no filter URLs) was already the Task 3–5 behaviour and is
  now pinned by the rewritten `public-seo` suite.
- **Earlier-task test touched (forced consequence, stated plainly):**
  `test/guides-briefings.test.ts` asserted "no guides in sitemap" — the Task 5
  locked-corpus rule this task's contract explicitly supersedes ("Sitemap includes:
  published guides"). The one assertion was updated to pin the new rule with run-scoped
  PUBLISHED/DRAFT guide fixtures (published in, draft out, index present).
- `app/robots.ts`: allows `/`; **explicitly allows `/api/v1/` and `/openapi.json`**;
  disallows `/admin`, `/auth`, `/my`, `/onboarding/preview`, and the rest of `/api`.
  Justification: Task 7 shipped `/api/v1` and `/openapi.json` as deliberately public
  machine surfaces built for agent consumption — a public API that robots.txt hides is
  invisible to the consumers it exists for; both are read-only, cache-controlled, and
  carry the same visibility gate as the pages. RFC 9309 longest-match makes
  `Allow: /api/v1/` beat `Disallow: /api` for exactly the public prefix, so heavy/private
  endpoints (`/api/img-proxy`, auth callbacks, internal routes) stay disallowed.
- Metadata: change detail already had canonical/unique description; added
  `buildChangeJsonLd` (Article + BreadcrumbList) rendered as an inert server-side
  `<script type="application/ld+json">` — no readiness anywhere in structured data
  (pinned by test: no rating fields, no readiness claim, no "VERIFIED" string), so
  readiness can never read as a quality/endorsement signal. New shared
  `app/(public)/JsonLd.tsx` (`JsonLd`, `breadcrumbJsonLd`, `articleJsonLd`) wired into
  the five hub pages (BreadcrumbList mirroring each visual breadcrumb), guide detail
  (Article + BreadcrumbList), and `BriefingPeriodView` (Article + BreadcrumbList —
  covers weekly/monthly/daily). Zero layout shift (inert script), present with JS off.
- `app/layout.tsx`: unchanged — root metadata already provides canonical/languages via
  `x-tl-path`; no change was needed.

## Gates

All from the worktree root with `set -a && . ./.env && set +a`. Compute warmed first with
`pnpm exec prisma migrate status` → "Database schema is up to date!".

- RED `pnpm vitest run test/coverage-readiness.test.ts` → 3 failed / 14 passed (new
  regrade + re-seed + ceiling assertions failing against the old code). GREEN after the
  coverage.ts change, same command → 17/17. REFACTOR: none needed; rerun unchanged.
- RED `pnpm vitest run test/public-seo.test.ts` → 3 failed / 4 passed (guides-in-sitemap,
  robots allow-list, JSON-LD builder missing). GREEN after sitemap/robots/JSON-LD → 7/7.
- RED `pnpm vitest run test/public-telegram.test.ts` → collection error (module absent).
  GREEN after telegram.ts → 6/6 (one mid-course fix: the fixture helper serialized
  ineligible rows; teardown verified zero residue before the rerun).
- Targeted gate `pnpm vitest run test/public-telegram.test.ts test/public-seo.test.ts`
  → 13/13 (exit 0).
- Legacy push regression: `pnpm vitest run test/channel-select.test.ts
  test/channel-render.test.ts test/push.test.ts test/public-channel-consistency.test.ts`
  → 53/53, and `git status src/push/` empty (byte-untouched).
- `pnpm lint` → clean (exit 0), final tree.
- `pnpm build` → exit 0 (twice; second build is the final tree after the Impeccable
  fixes and is the build all browser/e2e evidence below comes from).

### Full suite, run twice (required) — then two confirmation runs

Baseline: 716 passed / 2 failed (718), only `test/foundation-backfill.test.ts`
(endpoint allowlist, by design — not repaired).

- Run 1: **727 passed / 2 failed (729), 69 files** — failure set: exactly the 2 baseline
  `foundation-backfill` tests. (+11 tests = 6 telegram + 3 seo + 2 coverage; +1 file.)
- Run 2: 721 passed / 1 failed / 7 skipped — failure set: `foundation-backfill` (flaked
  into its "stable plan pair" timeout, skipping its remaining 7) PLUS one cross-suite
  race in `test/public-read-model.test.ts` ("repeat query without cursor returns same
  order" — reads the UNSCOPED verified pool while a parallel suite's far-future-dated
  fixtures landed between its two queries).
- Mitigations (test-code only): my telegram fixtures now carry a fixed PAST reviewedAt
  (they isolate via the q-filter and never need top-N placement, so they can no longer
  disturb unscoped-pool order windows), and the coverage-readiness refresh-all
  integration test retries on the exact `unknown capability` string — the standing
  rule's test-only race-retry pattern (a parallel suite deleting its own fixture
  mid-refresh; impossible in production where curated capabilities are never deleted).
- Run 3: 726 passed / 3 failed — failure set: 2 baseline `foundation-backfill` + the
  coverage-readiness refresh race (the run that motivated the retry guard).
- Run 4 (after mitigations): **727 passed / 2 failed (729), 68/69 files passed** —
  failure set: exactly the 2 baseline `foundation-backfill` tests.
- Run 5: 726 / 3 — baseline pair + one `Inconsistent query result` race in
  `test/public-channel-consistency.test.ts` (a parallel suite's FK-safe cleanup
  deleted a row between Prisma's relation fetches). Wrapped with the standing-rule
  retry on that exact string (test code only, same pattern as public-feeds).
- Run 6 (final tree, after the Impeccable fixes and all race guards):
  **727 passed / 2 failed (729), 68/69 files** — failure set: exactly the 2 baseline
  `foundation-backfill` tests.

No new persistent failures; no drop in collected files (69 ≥ 68). The three flake
appearances (runs 2, 3, 5) are pre-existing shared-branch races in code paths this
task did not touch; each was mitigated test-side under the standing rule and none
reappeared in the final run.

### E2E

`pnpm test:e2e` (final build, all four specs, both projects): **43 passed, 1 skipped**
(the mobile duplicate of the viewport-independent crawl), exit 0. Crawl line:
`pages crawled: 25; unique internal links checked: 28; intended redirects: 0;
transient shared-state skips: 4; persistent non-200/non-redirect: 0` (the 4 transient
skips were concurrent suites' fixture links, correctly reclassified; standalone green
run: 24 pages / 28 links / 0). Break/restore proof on the final spec: with
`platform:amazon-us` forced UNAVAILABLE the crawl fails naming
`/amazon-us → 404 (static contract route)`; restored to MONITORED → green, 0
persistent. Branch verified clean afterwards: amazon-us MONITORED, the other nine
capabilities unchanged, zero `testpt-`/`tlshots-`/`e2elinks-` residue.

## Browser verification

Final production build (`pnpm build` exit 0 after all fixes), served with
`pnpm start` on :3100, driven by a throwaway Playwright script (run from the
worktree, deleted after; fixtures run-scoped `tlshots-*`, zero residue asserted).

Ten surfaces — home, `/us`, `/amazon-us`, `/shopify-us`, `/categories/pet-supplies`,
`/changes`, one change detail, `/guides`, `/briefings`, `/coverage` — captured at
1440×900 and 390×844 in both themes: 44 PNGs in `design/shots/public-task8/`,
all sha256-distinct (verified: 44 unique hashes / 44 files), real seeded content
(a VERIFIED canonical change with reviewed primary-official evidence).

Stated explicitly:

- **Keyboard**: tab-through reaches every visible interactive control — home 24/24
  visible focusable reached, change detail 21/21 (the remaining DOM matches are
  hidden-at-viewport controls, e.g. the mobile tab bar at desktop widths).
- **Reduced motion**: with `prefers-reduced-motion: reduce` emulated, zero running
  CSS animations on the home masthead (all public transitions are colour-only).
- **JS disabled**: full textual content present on home, change detail and
  `/coverage` (h1 + 1.6–3.5k chars of body text; JSON-LD is server-rendered too).
- **No layout shift from evidence blocks**: CLS = 0.000 on the change detail
  (PerformanceObserver over load + 1.5 s settle).
- **No worker-endpoint requests**: zero non-same-origin requests across all 44
  captured navigations — analytics is consent-gated and never fired.

## Impeccable critique + audit

- Critique: `.impeccable/critique/2026-08-03T06-30-00Z__public-surfaces-task8.md` —
  34/40 (Good), 0 blockers. Two majors: legacy OG/description copy in the root layout
  contradicting Phase 1 positioning (**fixed** — `app/layout.tsx`, in scope), and the
  `/zh` sitemap entries / missing 308s (**deferred — Task 9 owns the `/zh` cutover;
  this contract prohibits `/zh` work**). The minors (GuideCard → `/guides` index
  link, /changes filter density, consent-banner semantics) are pre-existing accepted
  state, recorded in the record.
- Audit: `.impeccable/audit/2026-08-03T06-30-00Z__public-surfaces-task8.md` — 18/20
  (Excellent), 0 blockers; detector `[]` over the nine changed UI files. The one
  Task 8-attributable finding (unescaped `<` in JSON-LD script bodies) is **fixed**
  (`<`-escaping in `JsonLd.tsx` and the change-detail page).
- Post-fix verification: `pnpm lint` clean, full suite run 5, rebuild, e2e rerun.

## Rollback notes

All changes are code + branch-DB data only (no deployment, no migration, no production
mutation). Rollback = revert the commit; the branch capability row can be restored to
UNAVAILABLE with one update if ever needed, though the contract says MONITORED is the
correct grade. `src/push/*`, `middleware.ts`, Prisma schema, `.env`, `vitest.config.ts`,
`playwright.config.ts` untouched.

## EFFICIENCY_RECORD

- One explore subagent mapped the whole public link graph + e2e conventions in a
  single pass instead of ~10 in-thread file reads.
- Impeccable critique and audit launched as parallel subagents while the e2e gate
  ran; their two Task 8-attributable findings were fixed in one batch, then
  rebuild + rerun.
- Full-suite runs overlapped builds (vitest ↔ next build do not share the DB);
  e2e ran strictly sequentially against the shared branch per the Task 6 lesson.
- Cross-suite race fixes are test-side and pattern-matched to the standing rule
  (retry on exact strings) rather than product hardening.
- Token telemetry: UNAVAILABLE (not exposed by this harness).

## What I could not verify

- The `public-seo` margin under true CI parallelism is approximated by the
  full-suite runs (246 ms observed under load there vs the 10 000 ms budget).
- The seven-day P0 stability claim is NOT made (prohibited; Task 9 territory).
