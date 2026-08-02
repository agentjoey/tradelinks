# Audit — Phase 1 public intelligence hubs (/amazon-us, /categories/home-kitchen, /coverage, /us, /)

Date: 2026-08-02 · Target: `app/(public)/**` (production build, live at 127.0.0.1:4601 with seeded demo data) · Method: dual-agent critique evidence (Assessment B measurements) + parent verification commands.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Skip link first tab stop + visibly focused; readiness never colour-only; heading order clean; sr-only summary on CoveragePanel. Gap: stat glosses in `title=` only; consent banner last-in-tab-order yet first visual demand (out of scope file) |
| 2 | Performance | 4 | No page-load choreography by design; 150–250ms transitions only; zero webfont additions; RSC prefetches to unshipped routes 404 (staged delivery, Task 4–6) |
| 3 | Responsive Design | 3 | Zero horizontal overflow at 390px on all routes both themes; coverage table becomes stacked rows; nav scrolls internally. Gap: topic/risk chips ~28px tall, below the 44px touch ideal (house density, BL-045 register) |
| 4 | Theming | 4 | No hard-coded colors in any new TSX (grep-verified); full semantic-token usage; light/dark verified (`rgb(244,241,232)` / `rgb(8,9,12)`); no shadcn default palette leakage |
| 5 | Implementation Integrity | 4 | Detector CLI exit 0; overlay findings verified as approved-pattern false positives; the one structural flag (`nested-cards`) is the approved DESIGN.md §Card anatomy coverage-limit note |
| **Total** | | **18/20** | **Excellent** |

## Implementation Integrity Verdict

**Pass.** The implementation expresses the product-specific system coherently: evidence card anatomy, readiness-word mechanics, coverage strip and worst-first matrix all derive from the binding DESIGN.md and mockup, not from generic UI fashion. Deterministic scan: `detect.mjs --json app/(public)` exit 0 (0 findings; sanity-checked the detector fires on synthetic violations). Overlay (live-server :8461, injected, stopped): 26 findings, of which `undersized-ui-text`/`all-caps-body`/`cream-palette`/`em-dash-overuse` are verified false positives (approved `.ticker` micro-type, deliberate paper token, advisory rule) and `nested-cards` ×2 on /amazon-us is the approved in-card coverage-limit note. Fonts verified computed: Fraunces h1 (26px), Schibsted Grotesk body, IBM Plex Mono for dates/readiness/counters.

## Executive Summary

- Audit Health Score: **18/20 (Excellent)**
- Issues: P0 ×1 (dead Task 4–6 route links — cross-task debt, not waivable in Task 3 scope), P1 ×1 (consent banner overlay — out-of-scope file, escalated), P2 ×2 (touch-target density, `title=`-only stat glosses)
- Top issues and dispositions below; all in-scope findings were fixed in the same pass as the critique fixes.

## Detailed Findings by Severity

- **[P0] Links to unshipped routes** — Location: accepted Task 2 `PublicNav`, `IntelligenceCard` titles, hub "All →", version-history links. Category: Implementation Integrity. Impact: reader's trace-the-conclusion task dead-ends at 404 (console shows RSC prefetch 404s to /changes, /guides, /briefings). Recommendation: ship Task 4/5/6 routes; re-check at Task 4 acceptance. Not fixed in Task 3 — out of file scope; the binding mockup ships these links (staged delivery). NOT waived.
- **[P1] Consent banner overlays content at 390px** — Location: `app/components/Analytics.tsx` (out of Task 3 scope). Category: Accessibility / Responsive. Impact: covers the warning panel's "We cannot see" bullet until dismissed; `z-40` sits outside the semantic z scale. Recommendation: reserve bottom clearance or relocate consent; scope z to the semantic scale. Escalated to Human Owner (Task 2 flagged the same as P2 residual). NOT waived.
- **[P2] Stat glosses live in `title=` attributes** — Location: `CoveragePanel.tsx`. Category: Accessibility. Impact: keyboard users and most screen readers can't reach tooltip text. Mitigation shipped: full plain-language `sr-only` summary inside `role="status"`. Recommendation: none further for Task 3; Task 4 should prefer inline glosses where space allows.
- **[P2] Topic/risk chips below 44px touch target** — Location: `IntelligenceCard.tsx`, hub pages, topics page. Category: Responsive. Impact: thumb targeting on mobile is harder for the small chips. Recommendation: consider `min-h-[36px]` on chip links in a future polish pass; house density is deliberate (BL-045 register), so recorded as P2 not P1.

## Patterns & Systemic Issues

None systemic. Token discipline is uniform (zero hard-coded colors); readiness-word pattern applied consistently after the limit-note fix; no duplicated component systems.

## Positive Findings

- `prefers-reduced-motion` honored globally (globals.css), transitions capped at 150–250ms; no liveness choreography anywhere in the public render path (test-enforced).
- Heading order never skips a level on all five routes (browser-verified); one h1 per page (e2e-enforced).
- Mobile coverage table is a structural transformation, not a squeezed table.
- Readiness is literal text everywhere — survives greyscale/print, matching DESIGN.md's non-negotiable.

## Recommended Actions

1. **[P0]** Task 4: ship `/changes` + detail routes (kills the dead card-title/version-history links); Task 5: `/guides`, `/briefings`; Task 6: feeds.
2. **[P1]** Human Owner: consent banner placement/z-index (`app/components/Analytics.tsx`).
3. **[P2]** `$impeccable polish`: chip touch-target minimums; inline stat glosses where space allows.
