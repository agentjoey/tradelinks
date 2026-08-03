# Impeccable audit (scoped) — /api/v1 JSON endpoints, /openapi.json, /agent/tradelinks/SKILL.md

Date: 2026-08-03T04-35Z · Target: Task 7 machine contract surfaces.
a11y / responsive / motion / theming: **n/a** — no rendered HTML surface; nothing invented.

## What applies, verified live against the production build (http://127.0.0.1:3124)

- **Correctness:** all five v1 routes + /openapi.json + SKILL.md → 200. Envelope shape
  (`apiVersion`/`generatedAt`/`fingerprint`/`data`/`page`) exact; detail route returns
  the single record with envelope fingerprint == record fingerprint. Rendered JSON
  versionId/fingerprint/permalink byte-identical to the serializer is asserted over the
  response body in test/public-api-v1.test.ts.
- **Headers:** every JSON response carries `cache-control: public, s-maxage=900,
  stale-while-revalidate=3600` (PUBLIC_CACHE values only), `etag` equal to the quoted
  body fingerprint, and `last-modified` when data exists (briefings is an empty list on
  this branch — no last-modified, expected). Errors carry `cache-control: no-store`.
- **Conditional requests:** matching If-None-Match → 304 with verified zero-length body
  on list and detail routes; validators still sent.
- **Error states:** deterministic 400 INVALID_LIMIT (0, 101, non-integer), 400
  INVALID_FILTER (unknown pool/signal/platform/category, bad dates, q>120), 400
  INVALID_CURSOR (malformed, forged-signature, replayed-under-changed-filters), 404
  NOT_FOUND (unknown slug), 500 CURSOR_NOT_CONFIGURED (secret absent; fail closed —
  never an unsigned cursor), 500 INTERNAL_ERROR fallback envelope (unit-pinned).
- **Contract clarity:** OpenAPI 3.1.0, info.version 1.0.0 == SKILL.md version; SKILL.md
  endpoint set == OpenAPI paths (test-asserted); no SellerProfile/PersonalAction/
  RelevanceAssessment anywhere in the document or the Skill (test-asserted and grepped).
- **Non-browser clients:** bare curl (no browser headers) → 200 on every route; no UA
  gate on /api/v1 (middleware excludes api/; legacy /api/public/* untouched).
- **Perf note:** list page of 20 records ≈ 30 KB; responses are CDN-cacheable via
  s-maxage. Cold reads against a sleeping Neon branch take seconds; warm reads are
  sub-second. /api/v1/fingerprint is the cheap poll path by design.

## Anomalies (not defects)

- `/api/v1/changes/` (trailing slash) 308 → normalized by Next.js.
- `/openapi.json` and SKILL.md carry no ETag (static/dynamic-doc responses); the
  contract requires ETag on the API data routes, which all have it.
- Branch data note: `/api/v1/briefings` returns an empty list (no published briefings
  on the dev branch); list rows include earlier suites' fixture-shaped titles —
  environment data, not an API defect.
