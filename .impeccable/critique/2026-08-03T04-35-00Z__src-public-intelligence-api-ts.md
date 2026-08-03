# Impeccable critique — src/public-intelligence/api.ts (Task 7, anonymous API v1)

Date: 2026-08-03T04-35Z · Scope (per pact contract): JSON-endpoint correctness, headers,
error states, contract clarity. No visual surface exists; no UI findings invented.
Detector: `detect.mjs --json src/public-intelligence/api.ts app/api/v1 app/openapi.json`
→ exit 0, zero findings (`[]`).

## Format

Dual independent assessments, launched in parallel:
- **Assessment A** — contract/design review against the pact contract and the accepted
  read layer (query/search/serialize/cache/coverage/briefings verified unmodified via git).
- **Assessment B** — deterministic + live evidence against the production build
  (`next start`, http://127.0.0.1:3124): all 9 assigned checks PASS (statuses, content
  types, cache-control, ETag == quoted body fingerprint on all 5 JSON routes, 304 with
  verified zero-length body ×4, INVALID_LIMIT/INVALID_FILTER/INVALID_CURSOR/NOT_FOUND
  live, cursor round-trip live, permalink/fingerprint/versionId present and consistent,
  OpenAPI free of private schema names, SKILL.md endpoint parity).

## Heuristic totals (Assessment A)

correctness **pass** · headers/cache design **pass** · error states **concern→fixed** ·
contract clarity **concern→fixed** · privacy boundary **pass**. No P0/P1 found.

## Fixed in-pass

- **P2 — INTERNAL_ERROR was declared but unreachable; unexpected failures escaped the
  error envelope.** Fixed: every handler now goes through `withErrorEnvelope`
  (api.ts) — unexpected throws answer `500 INTERNAL_ERROR` in the documented envelope;
  the fail-closed secret case keeps `CURSOR_NOT_CONFIGURED`. Unit-pinned in
  test/public-api-v1.test.ts. OpenAPI now documents INTERNAL_ERROR on every path.
- **P3 — OpenAPI 400 descriptions collapsed to the last code** (keyed by status).
  Fixed: `errorResponses` merges codes per status (`Error envelope — one of: …`).
- **P3 — OpenAPI declared `q maxLength: 120` but the server silently truncated.**
  Fixed: `q` over 120 chars is now a strict `400 INVALID_FILTER`, consistent with the
  API's deterministic philosophy; test added.
- **P3 — /api/v1/fingerprint pool semantics undocumented.** Fixed: OpenAPI description
  states the probe observes the whole public stream (MONITORED and VERIFIED).
- **P3 — SKILL.md gave no pagination-termination rule.** Fixed: page until
  `nextCursor` is null; a full final page can be followed by one trailing empty page.

## Accepted trade-offs (recorded, not fixed)

- Cursor payload field `publishedAt` carries the record's public ordering timestamp
  (reviewedAt) — the contract's payload table `{publishedAt,id,filtersHash}` blesses
  the name; the cursor is opaque and signed; header comment in api.ts explains it.
- `If-Modified-Since` is not honored (ETag-only conditionals) — contract requires ETag;
  adding a second conditional mechanism would invent policy.
- The `CURSOR_NOT_CONFIGURED` message names the env var to anonymous clients —
  operationally deliberate (misconfiguration must be diagnosable), leaks no value.
- `limit=1e2`-style coercion is accepted by `Number()` — harmless, undocumented.
- No live DB-outage 500 trigger was exercised; the wrapper is unit-pinned instead.

Trend: first run for this slug.
