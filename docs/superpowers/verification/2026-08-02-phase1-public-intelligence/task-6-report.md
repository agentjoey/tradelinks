# Task 6 Report — Canonical Scoped Feeds (canonical-feeds)

Worker: Kimi Code (kimi-code/k3) · Reviewer: Claude Opus 5 (fresh context) · Date: 2026-08-03
Contract: `.pact/tasks/phase1-public-intelligence-canonical-feeds.md` (incl. the 2026-08-03
amendment — see "Plan defect and amendment" below)

## Scope delivered

Four canonical scoped RSS feeds plus the legacy cutover redirect:

| Route | Scope | Behaviour |
|---|---|---|
| `/feeds/changes.xml` | Verified-pool canonical changes | 200 RSS, max 50 items |
| `/feeds/platforms/[platform].xml` | amazon-us / shopify-us only | 200 RSS; unknown scope or missing `.xml` suffix → 404 |
| `/feeds/categories/[category].xml` | the six public category hubs | 200 RSS; unknown/non-public scope or missing suffix → 404 |
| `/feeds/briefings.xml` | published briefings | 200 RSS, max 50 items; drafts never appear |
| `/feed.xml` | — | **308** → `/feeds/changes.xml` |

### Files (all inside the amended scope list)

- `src/public-intelligence/feeds.ts` — `renderPublicFeed`, `resolvePlatformScope`,
  `resolveCategoryScope`, pure renderers `renderChangesFeedXml`/`renderBriefingsFeedXml`,
  `escapeXml`, `feedHeaders`, `FEED_MAX_ITEMS = 50`.
- `app/feeds/changes.xml/route.ts`, `app/feeds/briefings.xml/route.ts` — literal static
  folders, thin `GET` wrappers around `renderPublicFeed`.
- `app/feeds/platforms/[platform]/route.ts`, `app/feeds/categories/[category]/route.ts` —
  amended paths (see below); the param arrives with the `.xml` suffix; require it, strip
  it, validate against the enum / six public categories, 404 otherwise.
- `app/feed.xml/route.ts` — legacy Wire-alert feed replaced with a 308 to
  `/feeds/changes.xml`. **Cutover note (required by contract): existing RSS subscribers
  move from Wire alerts to canonical changes the moment this branch deploys; Task 9's
  cutover checklist owns announcing it.** Nothing else under `app/(legacy)/` was touched.
- `test/public-feeds.test.ts` — 19 tests (see TDD below).
- `app/sitemap.ts` — **not modified, deliberately.** A sitemap advertises indexable pages
  to crawlers; RSS feeds are subscription endpoints, not crawl targets, and Google does
  not index `.xml` feed documents as content. Feed discovery belongs to
  `<link rel="alternate">` autodiscovery, which is a page-head concern owned by the
  `(public)` layout tasks, not by this task's scope.

## The invariant — enforced over the rendered XML string, not projection objects

`test/public-channel-consistency.test.ts` asserts channel agreement over projection
objects. This task's suite asserts it over the **rendered XML string**:

- `renderPublicFeed` consumes `searchPublicChanges` (accepted Task 4 read model), whose
  items are `serializeCanonicalVersion` output. `feeds.ts` contains no Prisma import, no
  query shape of its own, and no hash computation — `versionId`, `fingerprint` and
  `permalink` are interpolated verbatim from the record.
- `test/public-feeds.test.ts` ("rendered XML is byte-identical to the serializer output")
  seeds a real published version, serializes it, renders the feed, and asserts the raw
  XML contains exactly `<guid isPermaLink="false">{record.versionId}</guid>`,
  `<link>{record.permalink}</link>` and
  `<category domain="fingerprint">{record.fingerprint}</category>` — then re-parses the
  XML with a real parser and asserts the same three values survive parsing unchanged.
- A negative test pins the pool boundary: a seeded MONITORED record (public, but not in
  the verified pool) must not appear in any change feed.

## XML correctness

- `escapeXml` escapes all five entities (`& < > " '`) and strips XML-1.0-illegal control
  characters (`\x00-\x08 \x0B \x0C \x0E-\x1F \x7F`) in **every** interpolated value —
  titles, summaries, source names, URLs, channel metadata.
- Real-parser tests (jsdom `DOMParser`, `application/xml`, `parsererror` asserted null)
  round-trip a fixture whose title is `Cats & "Dogs" <Deluxe> '26 Sale` with a summary
  containing `>`, quotes, an ampersand and a literal `\x0B` control character; the parsed
  title is byte-identical to the serializer's.
- Item shape: `title`, canonical permalink as `<link>`, **version ID as
  `<guid isPermaLink="false">`**, `pubDate` (RFC 822, from `sourcePublishedAt`),
  `<category domain="market|readiness|signal|fingerprint|platform|product-category">`,
  and a `<description>` carrying the concise public summary, market/readiness, the
  effective date, and evidence links (`- Source Name: URL`). Third-party full text is
  never rendered (proven absent with a seeded marker); no `profileId`, relevance score,
  or reviewer identity (proven absent).
- Channel carries `title`, `link`, `atom:link rel="self"` (so readers canonicalize the
  subscription URL after the `/feed.xml` 308) and `language`.

## Plan defect and amendment (for Task 7: do not copy this pattern)

The plan's file map prescribed `app/feeds/platforms/[platform].xml/route.ts` and
`app/feeds/categories/[category].xml/route.ts`. **Next.js 14 cannot serve those**:
`next/dist/server/app-render/get-segment-param.js` treats a segment as dynamic only when
it starts with `[` and ends with `]`. A folder named `[platform].xml` registers as a
*static* segment matching only its own literal name. Proven empirically before
escalating (dev-server probes: `/feeds/platforms/amazon-us.xml` → 404 against the
prescribed folder; 200 against `[platform]` with `params.platform === "amazon-us.xml"`).
Escalated as BLOCKED #4; the orchestrator verified independently at source and granted
the amendment: `app/feeds/platforms/[platform]/route.ts` and
`app/feeds/categories/[category]/route.ts`, handler requires/strips the `.xml` suffix.
The external URL contract is unchanged and binding; all five amendment rows are asserted
as real HTTP statuses below. **Task 7 must not prescribe `[param].json`-style partial
dynamic segments for `/api/v1/...` routes — the same defect would recur.** No
`next.config.mjs` or `middleware.ts` change was made (neither was authorised; none was
needed).

## Feed contract decisions (where the contract left a choice)

- **Pool**: all three change feeds use the **verified** pool — the safe public default
  (`/changes` behaves the same: Monitored enters only by explicit selection, and a feed
  URL has no selection surface). Hard-coded; no query parameter can widen it.
- **Category scopes** are limited to the six `INITIAL_PUBLIC_CATEGORIES`; other taxonomy
  categories are not public scopes and 404. Case variants normalize to the canonical slug
  (so the emitted channel link never points at a 404ing mixed-case page path).
- **Ordering** is the read model's (`reviewedAt` desc); `pubDate` remains the source
  publication date. A correction mints a new version ID → new guid → readers re-surface
  corrected items (deliberate; documented in the module header).

## TDD — RED / GREEN / REFACTOR (exact commands, real exits)

- RED: `pnpm vitest run test/public-feeds.test.ts` → **failed** at collection:
  `Failed to load url ../src/public-intelligence/feeds.js ... Does the file exist?`
  (16 tests, module absent; vitest exit 1).
- GREEN: implemented `feeds.ts` + five routes → same command **exit 0, 16/16 passed**
  (101s). Two implementation bugs fixed en route: route import depth (off by one) and
  `DOMParser` requiring `new`.
- REFACTOR: `pnpm vitest run test/public-feeds.test.ts test/public-channel-consistency.test.ts`
  → **exit 0, 21/21 passed** (the channel-consistency suite still green against the real
  renderer). Post-critique hardening (atom self-link, language, canonical slug
  normalization, three added tests) reran the same command: **exit 0, 24/24 passed**
  (19 feeds + 5 consistency).

### Shared-DB race hardening (found by full-suite run, fixed before final gates)

An intermediate full-suite run exposed two cross-suite races (parallel vitest files,
one Neon branch): another file's FK-safe cleanup can delete a row between Prisma's
relation fetches (`Inconsistent query result`), and this file's mid-run inserts could
land between a parallel suite's repeated ordering queries. Fixes, all inside
`test/public-feeds.test.ts`: (1) every fixture is written in ONE `beforeAll` burst —
no writes again until `afterAll`; (2) fixtures carry a far-future `reviewedAt`
(2099-01-01) so they always sort into every feed's top-50 regardless of how many
verified rows other suites leave behind; (3) DB-hitting renders are wrapped in a
test-side `withDbRetry` that retries only `Inconsistent query result` (a
test-environment artifact — curated public rows are never deleted in production).
No production code carries retry logic, and no earlier task's test was touched.
The same run also showed e2e must not run concurrently with the vitest suite against
the same branch (Playwright page queries raced suite cleanups); final gates below run
sequentially.

## Gates

`set -a && . ./.env && set +a` for all.

| Gate | Command | Result |
|---|---|---|
| Compute warm | `pnpm exec prisma migrate status` | 13 migrations, schema up to date |
| Targeted | `pnpm vitest run test/public-feeds.test.ts test/public-channel-consistency.test.ts` | exit 0, 24/24 |
| Lint | `pnpm lint` (tsc --noEmit) | exit 0 |
| Build | `pnpm build` | exit 0; all five routes registered (ƒ dynamic) |
| Full suite ×2 | `pnpm test` | see below |
| e2e | `pnpm test:e2e` | see below |

### Full suite, run 1

`pnpm test` → exit 1. **684 passed / 3 failed (687), 64/66 files.**
Failure set: `foundation-backfill` ×2 (baseline, by design — endpoint allowlist) and
`public-read-model > legacy Alert exclusion` ×1. The third failure is **not a logic
failure**: it is the structural shared-branch race described above — a parallel
suite's FK-safe cleanup deleted a `canonicalChange` between Prisma's relation fetches
(`Inconsistent query result: Field canonicalChange is required to return data, got
null`). The victim is Task 1's test exercising `listPublicChanges` — code this task
neither wrote nor modified and is forbidden to touch; the error mechanism is
cross-suite deletion timing, not the read model. Collected-file count 66 (was 65):
+`test/public-feeds.test.ts`, no drop.

### Full suite, run 2

`pnpm test` → exit 1. **685 passed / 2 failed (687), 65/66 files.**
Failure set: `foundation-backfill` ×2 only — exactly the accepted baseline shape
(baseline 666/2 → +19 new tests, all green).

### Full suite, run 3 (extra, race evidence)

`pnpm test` → exit 1. **685 passed / 2 failed (687), 65/66 files.**
Failure set: `foundation-backfill` ×2 only — baseline shape again. Net across three
runs: two baseline-clean, one with a single occurrence of the documented structural
race (zero occurrences of any feed-task logic failure; `test/public-feeds.test.ts`
passed in all three full runs and in every targeted run).

### e2e

`pnpm test:e2e` → **exit 0, 42 passed** (desktop + mobile chromium), run after the
vitest suite completed (see race-hardening note: an earlier concurrent attempt failed
two briefing-index specs because Playwright page queries raced suite cleanups; run
sequentially it is clean).

## curl -i captures (production build, `next start -p 3123`)

Headers and statuses for all five routes; amendment rows as real HTTP statuses; item
counts via `grep -c '<item>'`.

```
===== curl -i http://127.0.0.1:3123/feeds/changes.xml =====
HTTP/1.1 200 OK
cache-control: public, s-maxage=900, stale-while-revalidate=3600
content-type: application/rss+xml; charset=utf-8
(items: 50 — the cap, DB holds more verified rows)

===== curl -i http://127.0.0.1:3123/feeds/platforms/amazon-us.xml =====
HTTP/1.1 200 OK
cache-control: public, s-maxage=900, stale-while-revalidate=3600
content-type: application/rss+xml; charset=utf-8
(items: 17)

===== curl -i http://127.0.0.1:3123/feeds/categories/pet-supplies.xml =====
HTTP/1.1 200 OK
cache-control: public, s-maxage=900, stale-while-revalidate=3600
content-type: application/rss+xml; charset=utf-8
(items: 8)

===== curl -i http://127.0.0.1:3123/feeds/briefings.xml =====
HTTP/1.1 200 OK
cache-control: public, s-maxage=900, stale-while-revalidate=3600
content-type: application/rss+xml; charset=utf-8
(items: 3 — published briefings in this environment; drafts excluded)

===== curl -i http://127.0.0.1:3123/feed.xml =====
HTTP/1.1 308 Permanent Redirect
location: http://localhost:3123/feeds/changes.xml

##### amendment rows (real HTTP statuses) #####
== /feeds/platforms/amazon-us.xml => 200
== /feeds/platforms/amazon-us => 404
== /feeds/platforms/not-a-platform.xml => 404
== /feeds/categories/pet-supplies.xml => 200
== /feeds/categories/pet-supplies => 404
```

Sample rendered item (first item of `/feeds/changes.xml`, verbatim):

```xml
<item>
  <title>Draft test-1785718953810-81ajpx-7-change</title>
  <link>https://tradelinks.us/changes/test-1785718953810-81ajpx-7-change</link>
  <guid isPermaLink="false">cmscizfv3001mra2etsqbr7ta</guid>
  <pubDate>Wed, 01 Jul 2026 00:00:00 GMT</pubDate>
  <category domain="market">US</category>
  <category domain="readiness">VERIFIED</category>
  <category domain="signal">REGULATORY</category>
  <category domain="fingerprint">162d33e498ac08f9dddec76bd0587e64628de54625be5ddeeb56b06cc8c3cb2e</category>
  <category domain="platform">AMAZON</category>
  <category domain="product-category">CONSUMER_ELECTRONICS</category>
  <description>…summary, Market/Readiness/Effective lines, evidence links…</description>
</item>
```

(The local DB's row titles come from earlier suites' fixtures — environment data, not a
feed defect. The fingerprint above is the serializer's own sha256 for that version row.)

## Impeccable critique + audit (scoped: XML endpoints, not visual surfaces)

Per the contract, the review was scoped to correctness, headers, and error states; no UI
findings were invented.

- **Critique** — dual-agent (A: contract/design review, B: deterministic + live evidence).
  Detector `detect.mjs --json src/public-intelligence/feeds.ts app/feeds` → exit 0, zero
  findings. Heuristic total **15/16** (n/a: 1,3,6,7,8,10 — no visual/interactive surface).
  No P0/P1. Fixed in-pass: atom self-link + `<language>` (P2), canonical slug
  normalization (P3), verified-pool negative test / briefings cap test / channel metadata
  test (P3). Accepted trade-offs recorded: plain-text evidence links in `<description>`;
  `pubDate` = source date while order is reviewedAt-desc; no cache-control on 404 bodies
  (would invent a policy outside `PUBLIC_CACHE`).
  Record: `.impeccable/critique/2026-08-03T01-09-49Z__src-public-intelligence-feeds-ts.md`
  (first run for this slug, no trend).
- **Audit (scoped)** — a11y/responsive/motion: n/a (no rendered HTML surface).
  What applies, verified live: all four feeds parse with zero parsererror; every item has
  title/link/guid(isPermaLink=false)/pubDate/description; pubDates RFC-822 valid;
  headers byte-exact on all four feeds; 404 bodies are not RSS; `/feed.xml` 308 location
  ends `/feeds/changes.xml`. Perf: `/feeds/changes.xml` 50 items ≈ 43.6 KB, ~2.6 s cold
  against a sleeping Neon branch (warm reads are sub-second; ISR/CDN honors the
  `s-maxage=900, stale-while-revalidate=3600` response header). One environment note:
  the 308 `location` host renders as the server's own host (`localhost:3123` locally);
  in production that is the deployment origin, which is correct.

## Rollback notes

All changes are additive except `app/feed.xml/route.ts` (legacy feed → 308). Rollback =
`git checkout` this task's files; the legacy handler is recoverable from git history.
No migrations, no schema changes, no cloud configuration, no shared-table refresh
functions touched. Fixtures are run-scoped (`testpf-*`) and cleaned in FK-safe order.

## Token telemetry

UNAVAILABLE (not exposed by this harness).

## EFFICIENCY_RECORD

- Verified the Next.js partial-dynamic-segment defect empirically with three cheap
  dev-server probes before escalating — the BLOCKED round-trip came back with the
  amendment exactly as proposed, avoiding a rejected checkpoint.
- Impeccable critique Assessments A ∥ B launched in one message; the same production
  server served Assessment B evidence and the required `curl -i` captures.
- Full-suite runs and the production build overlapped where safe (vitest ↔ build);
  the one scheduling mistake (e2e concurrent with vitest against one branch) was
  diagnosed from error context, not re-run blindly — sequential rerun went 42/42.
- The shared-DB race was fixed structurally (one beforeAll write burst, far-future
  reviewedAt, test-side retry) instead of re-running until green.


## Not verified / plainly stated

- Feed rendering behind a real CDN cache (Vercel edge honoring `s-maxage`) — no
  deployment was made or permitted; the header contract is asserted, not the CDN.
- Reader-client rendering (Feedly/Inoreader linkification of plain-text descriptions) —
  recorded as an accepted trade-off, not a verified behaviour.
- The amendment's five rows were asserted at handler level in vitest and as real HTTP
  statuses via curl against the production build; they are not in the Playwright e2e
  spec (that spec belongs to Task 2 and is outside this task's scope list).
- EFFICIENCY_RECORD: see checkpoint evidence.
