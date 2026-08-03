# Task 7 Report — Anonymous API v1, OpenAPI, Fingerprint, Agent Skill (public-api-and-skill)

Worker: Kimi Code (kimi-code/k3) · Reviewer: Claude Opus 5 (fresh context) · Date: 2026-08-03
Contract: `.pact/tasks/phase1-public-intelligence-public-api-and-skill.md`

## Scope delivered

| Route | Behaviour |
|---|---|
| `GET /api/v1/changes` | Filtered/paginated list, strict 400s, signed cursor, ETag/304 |
| `GET /api/v1/changes/[slug]` | One canonical record; 404 NOT_FOUND for unknown/unpublished |
| `GET /api/v1/coverage` | The coverage matrix (worst-first), standard envelope |
| `GET /api/v1/briefings` | Published briefings only (empty on this branch — none published) |
| `GET /api/v1/fingerprint` | Cheap content-state probe (one count + one top-row read) |
| `GET /openapi.json` | OpenAPI 3.1.0, info.version 1.0.0 |
| `/agent/tradelinks/SKILL.md` | Static file from `public/agent/tradelinks/SKILL.md`, version 1.0.0 |

### Files (all inside the scope list)

- `src/public-intelligence/api.ts` — `encodeApiCursor`/`decodeApiCursor` (HMAC-SHA256,
  `timingSafeEqual`, payload `{publishedAt,id,filtersHash}`), `apiError`, `apiHeaders`,
  strict param parsing, five handlers behind `withErrorEnvelope`, `openApiDocument()`.
- `app/api/v1/changes/route.ts`, `app/api/v1/changes/[slug]/route.ts`,
  `app/api/v1/coverage/route.ts`, `app/api/v1/briefings/route.ts`,
  `app/api/v1/fingerprint/route.ts`, `app/openapi.json/route.ts` — thin wrappers.
  All routes verified registered in `.next/app-path-routes-manifest.json` (plain `[slug]`
  segment; no `[param].ext` anywhere).
- `public/agent/tradelinks/SKILL.md` — v1.0.0; the six mandated agent instructions.
- `src/config/env.ts` — additive: `PUBLIC_API_CURSOR_SECRET: z.string().optional()`.
- `.env.example` — additive: placeholder `PUBLIC_API_CURSOR_SECRET=""` with generation
  instructions. `.env` untouched.
- `test/public-api-v1.test.ts` (28 tests), `test/public-agent-skill.test.ts` (8 tests).
- No accepted-contract file was modified (`git status` proves it): the API consumes
  `searchPublicChanges` / `getPublicChangeBySlug` / `getCoverageMatrix` /
  `listPublishedBriefings` / `listPublicChanges` and the `query.ts` cursor helpers.

## Why two cursor schemes legitimately coexist (one sentence, per contract)

The web cursor (`query.ts` encode/decodeCursor) is an unsigned internal page-through
token whose format is cached into first-party page links, while the API cursor is a
public, versioned, HMAC-signed token that pins the filter set so a leaked or replayed
cursor cannot silently page someone else's filtered result set — unifying them would
either expose the unsigned format publicly or invalidate every cached web link, so
`api.ts` translates between the two at the read-layer boundary instead.

## The invariant — asserted over the RENDERED JSON

Same discipline Task 6 pinned for XML: `test/public-api-v1.test.ts` seeds real published
versions, serializes them with `serializeCanonicalVersion`, and asserts the rendered
JSON body's `versionId`, `fingerprint` and `permalink` are byte-identical to the
serializer's output — on both the list route and the detail route. `api.ts` contains no
Prisma import, no query shape of its own, and no record-fingerprint recomputation; the
page-level fingerprint is an aggregate OF the serializer's per-record fingerprints
(changes), the accepted briefings' stable identity fields, or a stable capability-state
projection (coverage) — which is also what the ETag derives from, never serialized bytes.

## Fail closed

No secret → `encodeApiCursor`/`decodeApiCursor` throw `CursorSecretUnavailableError` →
deterministic `500 CURSOR_NOT_CONFIGURED`, never an unsigned cursor. The secret is read
at call time; tests inject their own 32-byte in-process value (pass on a clean
checkout). Tests: first page that must ISSUE a cursor → 500; a presented cursor that
cannot be verified → 500.

## TDD — RED / GREEN / REFACTOR (exact commands, exit codes)

- RED: `pnpm vitest run test/public-api-v1.test.ts test/public-agent-skill.test.ts`
  → both suites FAIL, "Failed to load url ../app/api/v1/changes/route.js … Does the
  file exist?" (routes, api.ts, Skill absent). 2 failed files, 0 tests collected.
- GREEN (same command + `test/public-channel-consistency.test.ts`): 35 passed (3 files).
  Two test-side fixes during GREEN (both mine, not product): fail-closed test must force
  cursor issuance (`limit=1` — a single-page result legitimately needs no signature), and
  the accepted read layer issues `nextCursor` whenever a page is full, so a total that is
  a multiple of limit ends in one trailing empty page (test now documents this).
- REFACTOR (Impeccable fixes below, same command rerun unchanged): 36 passed.

## Gates (final code)

- `pnpm exec prisma migrate status` — up to date (compute warmed first, per contract).
- Targeted: `pnpm vitest run test/public-api-v1.test.ts test/public-agent-skill.test.ts
  test/public-channel-consistency.test.ts` → **36 passed**.
- `pnpm lint` (tsc --noEmit) → clean, exit 0.
- `pnpm build` → exit 0; all 7 routes in the manifest.
- `pnpm test:e2e` → **42 passed** (desktop+mobile chromium), on the final build.
- Full suite TWICE (final code), failure sets shown:
  - Run E: **715 passed / 3 failed (718)** — `foundation-backfill` ×2 (baseline, by
    design) + `public-seo.test.ts > sitemap eligibility` 5000 ms timeout.
  - Run F: **710 passed / 1 failed / 7 skipped (718)** — `foundation-backfill`
    (suite-level, same file, by design) + the same `public-seo` timeout.

### The public-seo sitemap timeout is pre-existing, not caused by this change — evidence

- Pristine tree (`git stash -u` of ALL task-7 files), full suite: sample 1 = exact
  baseline 685/687 (only foundation-backfill); sample 2 = 684/687 with the SAME
  public-seo timeout. The flake occurs with and without my files.
- Standalone, the test passes at **4886 ms against a 5000 ms budget** — 2.3% headroom;
  it does real DB queries inside `app/sitemap.ts` and any parallel-suite load tips it.
- My fixtures cannot interfere structurally: near-past reviewedAt (older than every
  other suite's seeds), q/slug-scoped assertions, run-scoped ids, FK-safe cleanup
  (verified 0 leftovers on the branch). Fixture/query slimming and parallel seeding were
  applied anyway; they fixed a REAL interference I initially caused in
  `public-read-model`'s determinism test (far-future reviewedAt rows entering its
  unfiltered top-5 — fixed by moving my seeds to the near past; green since).
- The durable fixes (raise the test's timeout, or vitest config, or sitemap perf) all
  live in files outside this task's scope list; flagged for the orchestrator, not
  silently worked around. Collected files went 66 → 68 (no drop).

## curl -i captures (production build, `next start` :3124)

- `GET /api/v1/changes` (bare curl, no browser headers) → **200**,
  `content-type: application/json; charset=utf-8`,
  `cache-control: public, s-maxage=900, stale-while-revalidate=3600`,
  `etag: "9009adfc…a8cc"` (== body `fingerprint`), `last-modified` present;
  20 items (default limit), `page.nextCursor` present.
- 304 round-trip: `If-None-Match: "9009adfc…a8cc"` → **304**, `size_download=0`
  (verified EMPTY body), validators still sent. Detail route 304 likewise.
- `GET /api/v1/changes/{slug}` (real slug) → **200**; envelope `fingerprint` ==
  record `fingerprint`; permalink `https://tradelinks.us/changes/{slug}`.
- Unknown slug → **404** `{"apiVersion":"1.0","error":{"code":"NOT_FOUND",…}}`.
- Cursor: issued at `?limit=1`; replay same filters different limit → **200** (limit is
  pagination, not a filter); replay with `&q=…` added → **400 INVALID_CURSOR**;
  `cursor=garbage` → **400 INVALID_CURSOR**; forged-signature cursor → 400 (unit test).
- `?limit=0` / `?limit=101` / `?limit=abc` → **400 INVALID_LIMIT** (never clamped);
  `?pool=bogus` → **400 INVALID_FILTER**; `q` >120 chars → **400 INVALID_FILTER**.
- `GET /api/v1/coverage` → **200**, 10 rows (amazon-us UNAVAILABLE, demand EXPERIMENTAL,
  rest MONITORED). `GET /api/v1/briefings` → **200**, empty list (no published briefings
  on this branch). `GET /api/v1/fingerprint` → **200**, `data.totalRecords` present.
- `GET /openapi.json` → **200**, openapi 3.1.0, version 1.0.0, exactly the five v1
  paths; `SellerProfile|PersonalAction|RelevanceAssessment` absent (also test-asserted).
- `GET /agent/tradelinks/SKILL.md` → **200** `text/markdown`.

## Internal-link audit (this task retires the last dead link)

`/api/v1/changes` was the last public-page internal link returning 404 (linked from
`PublicFooter.tsx`); it now returns **200**. Full audit against the production build:

- 200: `/`, `/changes`, `/changes/{slug}` (real), `/us`, `/shopify-us`, `/categories`,
  `/categories/pet-supplies`, `/topics`, `/topics/import-customs`, `/guides`,
  `/briefings`, `/coverage`, `/subscribe`, `/feeds/changes.xml`, `/feeds/briefings.xml`,
  `/feeds/platforms/amazon-us.xml`, `/feeds/categories/pet-supplies.xml`,
  `/api/v1/changes`, `/api/v1/coverage`, `/api/v1/briefings`, `/api/v1/fingerprint`,
  `/openapi.json`, `/agent/tradelinks/SKILL.md`.
- 308 (intentional): `/feed.xml` → `/feeds/changes.xml` (Task 6).
- **404 by accepted design: `/amazon-us`.** The primary nav (`PublicNav.tsx`) and a home
  hub card link it statically, but the hub renders only while its capability is
  MONITORED+ with non-empty known gaps (Task 3's accepted gating); on this branch
  `platform:amazon-us` is UNAVAILABLE, so the route 404s and the sitemap already
  excludes it. Not in this task's scope (`app/(public)/**` do-not-touch) — flagged
  plainly: Task 8's site-wide link crawl will see it, and Task 9's cutover gate ("no
  public-page internal link returns 404") needs the Amazon capability at MONITORED+ or a
  nav/card change decided by then.

## Impeccable critique + audit (scoped: JSON endpoints; no UI findings)

- Detector `detect.mjs --json src/public-intelligence/api.ts app/api/v1 app/openapi.json`
  → zero findings. Dual assessment (A: contract/design, B: live evidence): **no P0/P1**;
  B passed all 9 live checks.
- Fixed in-pass: P2 `INTERNAL_ERROR` was unreachable — all handlers now wrapped
  (`withErrorEnvelope`), unit-pinned; P3 OpenAPI per-status descriptions collapsed —
  merged; P3 `q` silent truncation vs `maxLength` — strict 400; P3 fingerprint probe
  pool undocumented — documented; P3 SKILL.md pagination-termination rule added.
- Accepted trade-offs recorded in the critique record (cursor field naming blessed by
  the contract's payload table; ETag-only conditionals; env-var name in the
  CURSOR_NOT_CONFIGURED message; `Number()` coercion of `limit=1e2`).
- Records: `.impeccable/critique/2026-08-03T04-35-00Z__src-public-intelligence-api-ts.md`,
  `.impeccable/audit/2026-08-03T04-35-00Z__api-v1-json-endpoints.md`.

## Rollback notes

All changes are additive except two additive keys (`env.ts`, `.env.example`). Rollback =
delete the new files and revert the two one-key additions. No migration, no schema
change, no cloud config, no shared-table refresh function touched. Fixtures run-scoped
(`testapi-*`), cleaned FK-safe (0 leftovers verified).

## Not verified / plainly stated

- No live DB-outage 500 was triggered; the INTERNAL_ERROR fallback is unit-pinned only.
- CDN behaviour of `s-maxage` behind Vercel — no deployment made or permitted; the
  header contract is asserted, not the edge.
- The public-seo sitemap timeout intermittently fails full-suite runs on the pristine
  tree too (see evidence above); not repaired (out of scope).
- `/api/v1/briefings` with actual published briefings — none exist on this branch;
  shape and published-only filtering are test-asserted via `listPublishedBriefings`.
- Token telemetry: UNAVAILABLE (not exposed by this harness).

## EFFICIENCY_RECORD

- Decisive pristine-tree experiment (stash → full suite → pop) settled causation of the
  seo flake in one run instead of re-running my tree until green — and its second sample
  caught the flake ON the pristine tree, exonerating the change with certainty.
- Impeccable Assessments A ∥ B launched in one AgentSwarm message; Assessment B reused
  the same production server as the contract's curl captures.
- Full-suite runs overlapped the production build where safe (vitest ↔ build), per
  Task 6's scheduling lesson; e2e ran strictly sequentially against the shared branch.
- One real cross-suite interference (far-future reviewedAt fixtures) was fixed
  structurally — near-past dates + q-scoped isolation — not by retrying until green.
