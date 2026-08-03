---
target: canonical scoped RSS feeds (XML endpoints)
total_score: 15
max_score: 16
na_heuristics: 1,3,6,7,8,10
p0_count: 0
p1_count: 0
timestamp: 2026-08-03T01-09-49Z
slug: src-public-intelligence-feeds-ts
---
# Critique: canonical scoped RSS feeds (XML endpoints — no visual surface)

Method: dual-agent (A: agent-0 · B: agent-1)

Scope note (per pact contract): these are XML routes, not visual surfaces. The review is
scoped to contract correctness, XML correctness, HTTP headers, and error states. Visual,
a11y-tree, motion, and responsive heuristics are not applicable and were not invented.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | n/a | No user-facing status surface; HTTP status codes are the mechanism (covered under #9) |
| 2 | Match System / Real World | 4 | Valid RSS 2.0, RFC-822 dates, guid/isPermaLink idiom, atom self-link + language added post-critique |
| 3 | User Control and Freedom | n/a | Read-only GET surface |
| 4 | Consistency and Standards | 3 | One header policy/escaping primitive/renderer; minor platform-vs-category case-policy asymmetry remains |
| 5 | Error Prevention | 4 | Renderer-side 50-cap, universal escaping + control-char stripping, hard-coded verified pool, canonical slug normalization added post-critique |
| 6 | Recognition Rather Than Recall | n/a | No interaction |
| 7 | Flexibility and Efficiency | n/a | Fixed-scope endpoints by design |
| 8 | Aesthetic and Minimalist | n/a | No visual surface |
| 9 | Error Recovery | 4 | Unknown scope and missing suffix are real 404s (never empty feeds); legacy URL is a 308 |
| 10 | Help and Documentation | n/a | No doc contract in scope |
| **Total** | | **15/16** | **Excellent (94%)** |

n/a heuristics: 1, 3, 6, 7, 8, 10. Applicable maximum 16.

## Contract compliance (Assessment A, item by item)

1. Consumes serializer output via the accepted read model — COMPLIANT. renderPublicFeed calls
   searchPublicChanges (items are serializeCanonicalVersion output); no own query shape, no
   fingerprint recomputation; byte-identity pinned over the rendered XML string in tests.
2. Escaping/parser — COMPLIANT. All five entities escaped, XML-1.0-illegal control chars
   stripped, every interpolated value passes escapeXml; tests parse with jsdom DOMParser and
   round-trip a hostile title (& < " ' plus a control char).
3. Max 50 / no full text / no private fields — COMPLIANT. Cap enforced in the pure renderer,
   not only the query; full-text marker proven absent; profileId/relevanceScore/reviewer
   identity absent.
4. Headers from PUBLIC_CACHE only — COMPLIANT. public, s-maxage=900, stale-while-revalidate=3600
   derived from PUBLIC_CACHE; content type exact.
5. 404 semantics — COMPLIANT. Suffix required; unknown platform/category 404s; non-public
   categories 404; empty existing scope is valid zero-item XML.
6. Item fields — COMPLIANT. All required fields present (verified by parser assertions).
7. /feed.xml 308 — COMPLIANT.
8. Verified pool — COMPLIANT (hard-coded; negative test added post-critique seeds a MONITORED
   record and asserts absence).

## Deterministic scan (Assessment B)

`detect.mjs --json src/public-intelligence/feeds.ts app/feeds` → exit 0, `[]` — target in
scope (.ts scannable), zero findings. Live evidence: all 4 feeds parse with zero parsererror,
RFC-822 pubDates valid on all items, per-item required elements present, headers exact on all
4, all error-state statuses correct, 404 bodies are not RSS.

## Priority issues

No P0/P1. Found and FIXED in this pass:
- [P2] Missing RSS channel furniture (atom:link rel=self, language) — fixed; self link is how
  readers canonicalize the subscription URL after the /feed.xml 308.
- [P3] Case-variant category slug emitted a non-canonical channel link — fixed by normalizing
  to categorySlug(category).
- [P3] Test gaps: verified-pool exclusion now pinned by a negative MONITORED test; briefings
  50-cap test added; channel metadata (title/link/self/language) test added.

Accepted trade-offs (not fixed, recorded):
- Evidence links are plain text inside <description> (readers may not linkify). URLs are
  present per contract; HTML/CDATA descriptions would change the wire shape beyond the contract.
- pubDate reflects sourcePublishedAt while order is reviewedAt-desc — deliberate (pubDate is
  the source event date); corrections mint a new guid so readers re-surface corrected items.
- 404 bodies carry no cache-control (adding one would invent a caching policy outside PUBLIC_CACHE).
- toRfc822 has no invalid-date guard (unreachable: serializer emits Date#toISOString()).

## Minor observations

- /feed.xml Location host renders as the server host (localhost in local captures); correct
  origin-relative behavior in production.
- briefings.xml on the local DB is a valid zero-item feed (no published briefings seeded in
  that environment) — contract-correct for an existing scope.
