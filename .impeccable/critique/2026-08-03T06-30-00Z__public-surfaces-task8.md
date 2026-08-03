---
target: "app/(public) — Phase 1 public surfaces, release gate after Task 8"
slug: app-public
total_score: 34
max_score: 40
na_heuristics: ""
p0_count: 0
p1_count: 2
p2_count: 2
p3_count: 1
timestamp: "2026-08-03T06:30:00Z"
method: "dual-agent (A: agent-3 · B: agent-4)"
---

# Impeccable Critique — TradeLinks Phase 1 Public Surfaces (Task 8 release gate)

Method: dual-agent (A: agent-3 · B: agent-4)

Object: the ten Phase 1 public surfaces as shipped after Task 8 (home, `/us`, `/amazon-us`, `/shopify-us`, `/categories/[category]`, `/changes`, `/changes/[slug]`, `/guides`, `/briefings`, `/coverage`). Evidence: 15 of 44 production-build screenshots in `design/shots/public-task8/` (every surface ≥1, both viewports on 5 surfaces, both themes on 3, plus no-JS and reduced-motion variants), full read of `app/(public)/**`, plus `middleware.ts`, `app/layout.tsx`, `app/robots.ts`, `app/sitemap.ts`. Scope rule: palette, card anatomy, light-default theme and other DESIGN.md decisions are DECIDED — findings note deviations from them, not objections to them.

## Design Health Score — 34/40 (Good)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Coverage strips (last check, SLA, overdue, gaps) on every hub/index — exemplary for the category |
| 2 | Match System / Real World | 3 | Limit prose is excellent plain language, but ticker jargon ("SLA 8h", "FINGERPRINT", "pool") assumes desk fluency a first-timer lacks |
| 3 | User Control and Freedom | 3 | Clear-filters and back affordances fine; "View v1" on change detail anchors to itself — a dead affordance promising a version snapshot that doesn't exist |
| 4 | Consistency and Standards | 3 | Card anatomy rigorous, but `GuideCard` links to `/guides` instead of the guide slug; per-slice `EmptySlice` diverges from `StatePanel`; two parallel JSON-LD builders |
| 5 | Error Prevention | 4 | Verified-by-default pool; Monitored behind explicit selection; restricted evidence labeled not linked; unknown query params dropped |
| 6 | Recognition Rather Than Recall | 4 | Readiness always the literal word; "How to read this page" glossary on /coverage |
| 7 | Flexibility and Efficiency | 3 | RSS, API v1, permalinks — appropriate for a read-only surface; scored, not n/a |
| 8 | Aesthetic and Minimalist Design | 4 | True quiet-desk discipline; zero decorative color; token semantics hold in both themes |
| 9 | Error Recovery | 3 | Error/stale/cached-copy states exist in code (`role="alert"`, "Showing the last published copy") but no screenshot exercises them — code-based score |
| 10 | Help and Documentation | 3 | Embedded help (coverage glossary, "What this does not tell you") is strong, but readiness badges don't link to any explainer of the readiness model |
| **Total** | | **34/40** | **Good** |

## Design Specificity Verdict

**LLM assessment:** Authored for TradeLinks, not category-interchangeable. The evidence card (readiness word → Fraunces title → bolded impact line → inline primary evidence → version footer) is a genuine design object that could only belong to an evidence-traceability product; the Monitored-limit prose ("We cannot verify this. Amazon's official policy pages require a seller login…") turns a promise boundary into a first-class visual element. Coverage-as-content (SLA counters, overdue sources, known-gaps lists on the marketing-facing home page) is a decision no generic insights-dashboard template makes. Weakest specificity: hub "Where to look" cards and category chips are the most generic moments; the filter bar is standard SaaS chrome.

**Deterministic scan (Assessment B):** `detect.mjs --json "app/(public)"` ran clean — exit 0, zero findings, zero suppressions in play, tree walk verified (nonexistent-path control produces a warning; the real run did not). No false positives to flag. Manual deterministic checks confirmed: JSON-LD renders only as inert `<script type="application/ld+json">` (no visible DOM leak) in `JsonLd.tsx` and `changes/[slug]/page.tsx`; zero `<img>` tags anywhere in `app/(public)` (no alt-text exposure); skip link first in DOM in `layout.tsx`; aria-label/aria-current/aria-busy usage healthy; `robots.ts` and `sitemap.ts` present and policy-complete.

**Visual overlays:** not available — live-server overlay injection was out of scope for this run (no servers permitted). Fallback signal: pre-captured production screenshots reviewed statically by Assessment A.

## Overall Impression

The surface delivers the "quiet intelligence desk" register convincingly — the honesty model is structural, not a copywriting pose. What doesn't work: the distribution metadata still sells the old real-time/trend-signal product, and the `/changes` filter wall hides the intelligence behind chrome on mobile. The single biggest opportunity is closing the gap between what link previews promise and what the pages deliver — the product's first trust moment happens before the page loads.

## What's Working

1. **The Monitored-limit prose pattern.** `MONITORED_LIMIT_NOTE` states what cannot be done in a full sentence, in an urgent-bordered block, exactly per DESIGN.md. It converts a coverage weakness into the strongest trust signal on the page.
2. **Absence/failure distinction in code.** Briefings distinguishes a read failure ("this is a read failure, not an absence") from a true zero-result absence; the sitemap restates the visibility gate in its where-clause. This is "persisted or unavailable, never invented" as UI.
3. **Accessibility plumbing verified, not claimed.** Skip link first tab stop with visible focus; global 2px signal `:focus-visible`; sr-only labels on every filter control; readiness never color-only; reduced-motion blanket; no-JS screenshot is pixel-equivalent content. The DESIGN.md floor genuinely holds — corroborated independently by Assessment B's greps.

## Priority Issues

1. **[P1 / major] Every public page inherits legacy OpenGraph/Twitter copy: "Real-time regulatory… alerts across 6 regions" / "Global cross-border e-commerce alerts & trend signals"** (`app/layout.tsx:30-50`; no page in `app/(public)` sets `openGraph`).
   - Why it matters: social/search previews for the entire Phase 1 IA promise real-time and trend signals — both explicitly disclaimed by PRODUCT.md promise boundaries and DESIGN.md's rejection of the liveness metaphor. The first trust moment contradicts the product.
   - Classification: **pre-existing root copy, but a Task 8 scope gap** — the SEO/distribution task shipped JSON-LD and canonicals while leaving the most visible distribution metadata contradicting the product promise.
   - Fix: set per-surface (or public-layout-level) `openGraph`/`twitter` from the same title/description pairs already authored.
   - Suggested command: `$impeccable clarify`.

2. **[P1 / major] `/zh` 308 redirects from DESIGN.md §Language are not implemented, and the Task 8 sitemap still lists `/zh` URLs at full priority.** `middleware.ts:41-45` still *rewrites* `/zh`; `app/sitemap.ts:35-38` emits en+zh entries for `/`, `/wire`, `/trends`, `/daily`.
   - Why it matters: DESIGN.md records permanent 308s to English equivalents as decided; the sitemap actively tells crawlers the zh variants are canonical peers, splitting index equity against the decided language policy.
   - Classification: pre-existing middleware; **Task 8 regression-by-perpetuation** in the sitemap it edited. Direct deviation from a DESIGN.md decision.
   - Fix: implement the 308s (or formally amend DESIGN.md) and drop zh alternates from the sitemap.
   - Suggested command: `$impeccable harden`.

3. **[P2 / minor] `GuideCard` titles link to `/guides` instead of `/guides/{slug}`** (`app/(public)/IntelligenceCard.tsx:264`), used on all hub and topic pages.
   - Why it matters: latent today (zero published guides), but the moment a guide publishes, every hub's guide card dead-ends at the index — breaking the citability promise on the newest content type.
   - Classification: **pre-existing** (Task 6/7 era), not Task 8.
   - Fix: `href={`/guides/${guide.slug}`}`.
   - Suggested command: `$impeccable polish`.

4. **[P2 / minor] `/changes` decision-point overload, acute at 390px.** ~10 controls (3 scope tabs + 3 selects + 2 date inputs + search + Apply) before the first card; the first mobile viewport contains zero intelligence.
   - Why it matters: fails the cognitive-load "minimal choices ≤4" item; Casey scrolls a full viewport of filter chrome before any answer.
   - Classification: **pre-existing**; DESIGN.md's structural-responsive rule is honored — the load, not the structure, is the issue.
   - Fix: collapse the filter row behind a "Filters" disclosure showing active-filter chips; keep the GET form so no-JS still works.
   - Suggested command: `$impeccable distill`.

5. **[P3 / nit] Consent banner has no dialog semantics and sits last in tab order** (`app/components/Analytics.tsx:60`), overlaying card-title regions at 390px.
   - Why it matters: keyboard/screen-reader users traverse the whole page before reaching Accept/Decline; mobile users face a decision they didn't come for.
   - Classification: **pre-existing** BL-045 legacy, not Task 8.
   - Fix: `role="dialog"`/`aria-label`, earlier tab order or non-modal positioning on Phase 1 surfaces.
   - Suggested command: `$impeccable harden`.

## Cognitive Load

Moderate overall (low on reading surfaces). Fails **minimal choices ≤4** on `/changes` (~10 controls at one decision point; on 390px the entire first viewport is filter chrome). Borderline **chunking** on home's "Where to look" band (3 hub cards + 6 category chips = 9 destinations). Passes progressive disclosure (Experimental demand behind "Show experimental demand →", Monitored behind an explicit tab with an "Expert view" warning), working memory (readiness vocabulary identical everywhere), grouping, one-thing-at-a-time on change detail.

## Emotional Journey

Landing promise → immediate telemetry → Verified card with primary evidence inline, one click from the claim. The peak is the change detail's closing "What this does not tell you" panel — reassurance exactly at the highest-stakes moment, ending the page (peak-end aligned). Main valley: the home coverage strip reading "0 / 32 within SLA, 32 OVERDUE" as the first data a newcomer sees — honest, but context-free it reads as "this desk is currently failing." Second valley: Guides and Briefings both being honest absences at launch risks reading as an empty product.

## Persona Red Flags

**Jordan (first-timer from search, judging "is this rule real"):** Change detail itself is strong (readiness word, authority, reviewed date, primary evidence inline). Red flags: (a) the link preview that brought him says "real-time alerts / trend signals" — trust mismatch before arrival (P1 #1); (b) "View v1" in correction history anchors to the row he's already reading — dead affordance; (c) nothing on the card explains "Monitored vs Verified" unless he navigates to /coverage — the badge word is not a link to the glossary.

**Casey (distracted mobile, 390px):** (a) full viewport of filter chrome on /changes before any answer (P2 #4); (b) consent banner overlays card titles until dismissed (P3 #5); (c) the 8-item nav is horizontally scrollable — "Coverage" (the trust page) is off the right edge with no visible affordance that more items exist.

**Sam (keyboard/SR/contrast):** Mostly well served — skip link, aria-current, sr-only labels, literal readiness words, verified contrast. Red flags: (a) `CoveragePanel` and the changes status strip use `role="status"` (live region) on static content with both a verbose sr-only summary and visible text — risk of double/unprompted announcement; `role="group"` fits better (`app/(public)/CoveragePanel.tsx:28-33`); (b) consent banner lacks dialog semantics and is last in tab order; (c) the inert "EN" text in the nav (`PublicNav.tsx:62`) resembles a language control; (d) external evidence links give no indication they leave the site.

## Minor Observations

- Change detail defines its own `buildChangeJsonLd` inline instead of reusing `articleJsonLd` from `JsonLd.tsx` — two sources of truth for the same Article shape. (Task 8-introduced duplication.)
- All JSON-LD uses raw `JSON.stringify` into `dangerouslySetInnerHTML` without escaping `</script>` — data is editor-reviewed so risk is low, but `.replace(/</g, "\\u003c")` closes an HTML-breakout class. (Task 8-introduced pattern.)
- Hub pages mix empty-state idioms: `StatePanel` dashed card for changes vs plain faint `<p>` (`EmptySlice`) for federal/guides slices — two visual weights for the same concept.
- Footer "API v1" link drops a human into raw JSON; fine for agents, odd for a reading surface's footer.
- Skip link uses `z-index: 50` and banner `z-40` — arbitrary values against DESIGN.md's semantic z-index scale (legacy, cosmetic).
- Home hub card renders the first known gap as a bare `text-urgent` sentence fragment, inconsistent with hub pages' "— " gap lists.
- Theme toggle is a dead button with JS disabled (acceptable — light default, content unaffected).
- Screenshots show seeded demo data (evidence host `example.com`, "32/32 overdue") — judged the design, not the fixture content.

## Questions to Consider

1. When 32 of 32 sources are overdue, is per-page red telemetry still the honest choice — or is there a threshold where honesty demands a page-level "we are behind, conclusions may lag" statement instead of counters a first-timer can't interpret?
2. The Verified card opens evidence inline, but the evidence is a link out to a Federal Register page a seller can't parse. Does "evidence before action" need one more rung — a "what to look for on that page" pointer — before evidence is truly usable rather than merely present?
3. Honest absence is the product's signature, but at launch both Guides and Briefings are absences. Is a deliberate "first publish" moment planned — and if not, when does radical honesty about emptiness start reading as an empty product?
