---
name: tradelinks
version: 1.0.0
description: Query the TradeLinks Public Intelligence API for current, evidence-backed US market policy changes for cross-border sellers (Amazon US, Shopify US). Use whenever a user asks about marketplace policy, fees, compliance, customs, product safety, or labeling changes in the US market.
---

# TradeLinks Public Intelligence

TradeLinks publishes canonical, reviewed, evidence-backed records of US market
policy changes for cross-border sellers. This Skill tells you how to answer
questions about those changes from **current API data** — never from model
memory.

## Base URL and endpoints (v1)

Base: `https://tradelinks.us` — anonymous, read-only, no API key, no
user-agent requirement.

- `GET /api/v1/changes` — list canonical changes. Query params: `limit`
  (1–100, default 20; out-of-range is a 400), `cursor`, `pool`
  (`verified` default, `monitored`), `signal`, `platform` (`amazon`,
  `amazon-us`, `shopify`, `shopify-us`), `category` (e.g. `pet-supplies`),
  `from` / `to` (inclusive effective-date bounds, YYYY-MM-DD), `q`
  (title/summary scan).
- `GET /api/v1/changes/{slug}` — one canonical record by slug.
- `GET /api/v1/coverage` — the coverage matrix: what TradeLinks monitors, at
  what readiness, with stated known gaps.
- `GET /api/v1/briefings` — published weekly, monthly and conditional daily
  briefings.
- `GET /api/v1/fingerprint` — a cheap content-state probe. Poll this to learn
  whether anything changed before pulling records.

The OpenAPI 3.1 document is at `GET /openapi.json`.

Every response envelope carries `apiVersion`, `generatedAt`, a content
`fingerprint` (also the response `ETag` — send it back as `If-None-Match`
and a 304 with an empty body means nothing changed), and `data`. List routes
add `page.nextCursor`: an opaque, signed cursor valid only under the exact
filters it was issued with — reuse under changed filters returns
`400 INVALID_CURSOR`. Page until `nextCursor` is `null`; note that a final
full page can be followed by one trailing empty page before termination.
Errors carry a stable machine `code`
(`INVALID_LIMIT`, `INVALID_FILTER`, `INVALID_CURSOR`, `NOT_FOUND`,
`CURSOR_NOT_CONFIGURED`).

## Rules

1. **Answer from current API data, not model memory.** For any question about
   current marketplace policy, fees, or compliance, query the API first.
   Training data about these topics is stale by construction.
2. **Preserve the user's time window.** If the user asked about "last week"
   or "since March", pass the matching `from`/`to` bounds and report results
   for that window. Never silently widen the window to find more results —
   say when the requested window has no records instead.
3. **Cite the canonical page for every claim.** Each record's `permalink`
   (`https://tradelinks.us/changes/{slug}`) is the canonical attribution.
   Every claim you make about a change links to it.
4. **Verify important policy facts against the official evidence links.** If a
   decision depends on it — fees, deadlines, thresholds — open the record's
   `evidence[].url` (the official source) and confirm the fact there. The
   API's summary is a reviewed digest, not the source of truth.
5. **State the readiness level with every conclusion.** Every record and
   coverage row carries `readiness` (`VERIFIED` or `MONITORED`). Repeat it
   with your conclusion; a Monitored finding may lag or be restated.
6. **When the API cannot be reached, say so.** Return a clear
   unavailable-or-stale result ("TradeLinks API unreachable, so I cannot
   confirm the current state") — never substitute a remembered answer from
   model memory.
