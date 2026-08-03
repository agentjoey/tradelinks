# Impeccable Audit — Public Surfaces, Task 8 Release Gate

- **Date**: 2026-08-03T06:30:00Z
- **Scope**: `app/(public)/**`, `app/layout.tsx`, `app/sitemap.ts`, `app/robots.ts` — Phase 1 public surfaces after Task 8 (JSON-LD structured data + robots/sitemap policy). Surfaces from Tasks 2–7 were previously accepted; this audit separates Task 8 regressions from pre-existing accepted state.
- **Method**: read-only code audit + screenshot evidence in `design/shots/public-task8/` (desktop 1440×900, mobile 390×844, both themes, no-JS and reduced-motion variants). No servers started, no test suites run, no database touched.
- **Measured facts cited from the Task 8 browser verification run** (production build): CLS on change detail = 0 (PerformanceObserver layout-shift); zero non-same-origin requests on any captured surface; keyboard tab-through reached 24/30 focusable on home and 21/22 on change detail (remainder hidden-at-viewport controls); reduced-motion emulation shows zero running CSS animations; h1 + full textual content present with JavaScript disabled on home / change-detail / coverage (body text 1.6–3.5k chars).
- **Mechanical detector**: `node ~/.agents/skills/impeccable/scripts/detect.mjs --json` over all nine Task 8-changed UI files → **`[]` (zero findings)**.

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | Sub-44px touch targets in filter chips, nav links, theme toggle (24px WCAG 2.2 AA floor is met; 44px comfort target is not) |
| 2 | Performance | 4 | CLS 0, zero third-party requests, self-hosted variable fonts, no images on public surfaces |
| 3 | Responsive Design | 3 | No horizontal scroll at 390px (screenshot-verified); dense chip rows and inline anchors under 44px |
| 4 | Theming | 4 | Full semantic-token usage; both themes screenshot-verified on all surfaces; detector found no hard-coded colors |
| 5 | Implementation Integrity | 4 | Detector: zero findings. Readiness never color-alone; JSON-LD mirrors rendered records exactly; no liveness theatre |
| **Total** | | **18/20** | **Excellent (minor polish)** |

## Implementation Integrity Verdict

**Pass.** The implementation expresses a coherent, product-specific system — an evidence desk, not a interchangeable marketing template. Verified evidence:

- The bundled detector over all nine Task 8-changed UI files returned zero deterministic findings (`[]`). No placeholder copy, no lorem, no decorative gradients, no emoji-as-icon, no hard-coded hex colors.
- Task 8's JSON-LD (`app/(public)/JsonLd.tsx`, `changes/[slug]/page.tsx:35-60`) contains **no rating, review, or readiness fields** — readiness is a coverage statement about TradeLinks, deliberately absent from structured data, exactly as the file header states and as PRODUCT.md promise boundaries require.
- Every BreadcrumbList mirrors the visual breadcrumb on the same page, verified pairwise: `amazon-us/page.tsx:105` vs `:106-112`, `topics/[topic]/page.tsx:46` vs `:47-53`, `guides/[slug]/page.tsx:136-141` vs `:143-156`, `ReportCard.tsx:78-82` vs `:85-100`, `changes/[slug]/page.tsx:51-57` vs `:130-143`. Structured data claims nothing the page does not render.
- Robots policy (`app/robots.ts`) is deliberate and documented: `/api/v1/` and `/openapi.json` explicitly allowed (public machine surfaces exist for agent consumption), everything else under `/api` disallowed; longest-match semantics noted in the file comment.
- Sitemap (`app/sitemap.ts`) re-states the Task 1 visibility gate in its change query (`isCurrent` / `PUBLISHED` / reviewed / `MONITORED|VERIFIED`), excludes drafts and empty periods, gates the `/guides` index on at least one published guide, and bounds the change read with a 4.5s budget that degrades to serving without change entries rather than failing.
- Readiness is rendered as a literal word everywhere (`ReadinessBadge` text, "Verified first" sort comment `page.tsx:98`), never encoded by colour alone — survives greyscale and print per DESIGN.md.

No false positives to call out: the detector returned an empty set.

## Executive Summary

- Audit Health Score: **18/20** (Excellent — minor polish)
- Issues found: **0 P0 · 0 P1 · 2 P2 · 4 P3**
- **No Task 8 regressions at blocker or major severity.** The only Task 8-introduced issue is a P2: JSON-LD serialization does not escape `<`, so a `</script>` sequence in a record field would break document parsing (data is editor-reviewed, so real-world probability is low, but the safe pattern is one line).
- All other findings are pre-existing accepted state from Tasks 2–7 / legacy shell: sub-44px touch targets, legacy hreflang and OpenGraph inheritance from the root layout, consent-banner landmark semantics, numeric z-index vs the semantic scale.
- Top issues:
  1. [P2] JSON-LD `<` escaping missing (Task 8, new code)
  2. [P2] Touch targets < 44px in filter chips, nav, theme toggle (pre-existing)
  3. [P3] Root-layout hreflang `zh-Hans` leaks onto English-only public pages (pre-existing)
- Recommended next steps: apply the P2 hardening before flip; batch the P3 metadata hygiene into the legacy-shell cleanup that already owns `app/layout.tsx`.

## Detailed Findings by Severity

### P0 — Blocking

None.

### P1 — Major

None.

### P2 — Minor

- **[P2] JSON-LD injected without `<` escaping**
  - **Location**: `app/(public)/JsonLd.tsx:16-23`; same pattern inline at `app/(public)/changes/[slug]/page.tsx:125-128`
  - **Category**: Implementation Integrity / robustness
  - **Task 8 regression?** **Yes** — this component is new in Task 8.
  - **Impact**: `JSON.stringify` does not escape `<`. A `</script>` sequence inside a title, summary, or breadcrumb name would terminate the script element early and break the HTML parse (potential markup injection). All JSON-LD content is editor-reviewed before publication, so the probability is low — but the titles originate from scraped source material and the fix is trivial.
  - **WCAG/Standard**: HTML script-element end-tag rule (WHATWG HTML §4.12.1.3)
  - **Recommendation**: serialize with `JSON.stringify(data).replace(/</g, "\\u003c")` in both call sites (centralize in `JsonLd` and have the change-detail page use the component or a shared `serializeJsonLd` helper).
  - **Suggested command**: `$impeccable harden`

- **[P2] Interactive targets below 44×44px on dense control rows**
  - **Location**: `app/(public)/topics/[topic]/page.tsx:66-88` (risk-filter chips, `px-2.5 py-1 text-meta` ≈ 26px tall); `app/(public)/us/page.tsx:215-222` (topic chips, same pattern); `app/components/ThemeToggle.tsx:23` (34×34px); mobile nav links `app/(public)/PublicNav.tsx:53` (`py-2` ≈ 32px)
  - **Category**: Accessibility / Responsive
  - **Task 8 regression?** No — pre-existing accepted surfaces (Tasks 2–5).
  - **Impact**: Motor-impaired and mobile users get smaller hit areas on exactly the controls used for filtering and theme switching. WCAG 2.2 AA (2.5.8, 24×24 CSS px minimum, inline links exempt) is technically met; the 44px comfort floor used by the audit checklist is not.
  - **WCAG/Standard**: WCAG 2.2 §2.5.8 met; WCAG 2.1 AAA §2.5.5 (44px) not met
  - **Recommendation**: raise chip vertical padding to reach ≥ 40px (`py-2`), wrap ThemeToggle hit area to 44px with padding while keeping the 34px visual box.
  - **Suggested command**: `$impeccable adapt`

### P3 — Polish

- **[P3] Legacy hreflang leaks onto English-only public pages**
  - **Location**: `app/layout.tsx:33,39-42` (`alternatesFor` emits `languages: { en, "zh-Hans", "x-default" }`); public pages override only `canonical`, so root `alternates.languages` merges down onto e.g. `/changes/[slug]`
  - **Category**: Implementation Integrity / SEO
  - **Task 8 regression?** No — root layout is legacy, untouched by Task 8.
  - **Impact**: Public pages emit `hreflang="zh-Hans"` pointing at `/zh/...` URLs that 308-redirect per DESIGN.md §Language. Search engines ignore hreflang that resolves to a redirect, so it is crawl noise, not an indexing error — but it contradicts the English-only Phase 1 IA.
  - **Recommendation**: scope the zh alternates to the legacy route group, or set `alternates.languages: null`-equivalent per public page until the full-locale milestone.
  - **Suggested command**: `$impeccable adapt`

- **[P3] Root OpenGraph copy contradicts Phase 1 positioning in link previews**
  - **Location**: `app/layout.tsx:43-48` — `openGraph.description: "Global cross-border e-commerce alerts & trend signals."`, inherited by every public page that does not set its own `openGraph` (none do)
  - **Category**: Implementation Integrity
  - **Task 8 regression?** No — pre-existing.
  - **Impact**: Shared/social previews of public pages describe a "global, real-time, 6-region" product; Phase 1 is US-only and explicitly does not promise real-time. Erodes the positioning the pages themselves state.
  - **Recommendation**: align root `openGraph` (and root `description`/`title`, which any un-meted public route would inherit) with the Phase 1 US-market positioning.
  - **Suggested command**: `$impeccable clarify`

- **[P3] Consent banner has no landmark role or accessible name**
  - **Location**: `app/components/Analytics.tsx:60`
  - **Category**: Accessibility
  - **Task 8 regression?** No — pre-existing legacy component.
  - **Impact**: The banner is keyboard-reachable and its buttons are labeled by their text, so this is not a failure — but screen-reader users get no region context ("cookie consent") when focus lands inside it.
  - **Recommendation**: add `role="region"` + `aria-label="Cookie consent"` to the container.
  - **Suggested command**: `$impeccable adapt`

- **[P3] Numeric z-index values vs DESIGN.md semantic scale**
  - **Location**: `app/layout.tsx:75` (`z-10`), `app/components/Analytics.tsx:60` (`z-40`), `app/globals.css:106` (skip link `z-index: 50`)
  - **Category**: Theming / Implementation Integrity
  - **Task 8 regression?** No — pre-existing.
  - **Impact**: DESIGN.md §Layout prescribes a semantic scale (`dropdown → sticky → modal-backdrop → modal → toast → tooltip`); bare numerics work today but invite stacking drift as overlays are added.
  - **Recommendation**: map the three usages onto the semantic scale (skip link → `tooltip`-tier, consent → `toast`-tier).
  - **Suggested command**: `$impeccable polish`

## Patterns & Systemic Issues

- No systemic drift detected. The single recurring theme is **legacy-shell inheritance** (`app/layout.tsx` metadata + `Analytics`): the Phase 1 route group is clean, but it sits under a root layout that still speaks the old global/real-time product language (hreflang, OpenGraph, consent z-index). One cleanup pass over the root shell would retire three of four P3s.
- Touch-target sizing is a repeated (2 component families) but bounded pattern, not a systemic miss.

## Verified non-issues (checked, deliberately not reported as findings)

- **Global `0.01ms` reduced-motion kill** (`app/globals.css:91-96`): the audit checklist flags this pattern when it destroys useful feedback. Here every public-surface transition is a 150–250ms *colour* transition; state (readiness, correction, absence) is never carried by motion. Measured reduced-motion run shows zero running animations. The kill is the correct reduced-motion alternative in this context. The legacy named-animation kill list (`globals.css:172-176`) covers legacy classes not rendered by the public IA.
- **Skip link**: first tab stop, visually hidden until focused, targets `<main id="main">` — confirmed in `app/(public)/layout.tsx:24-30` and `globals.css:102-118`; keyboard tab-through measured 24/30 and 21/22 with the remainder hidden-at-viewport controls.
- **One h1 per page**: grep-verified across all 16 public page/component files — exactly one h1 each, order h1→h2 never skips (ReportCard h3 sits under a briefing entries h2).
- **No-JS usefulness**: JSON-LD is a server-rendered inert script; share degrades to the visible permalink (`ShareButton.tsx:17-21`); risk filters are plain links. Screenshots `home-desktop-light-nojs`, `change-detail-desktop-light-nojs`, `coverage-desktop-light-nojs` show full content.
- **390px overflow**: `change-detail-mobile-light` and `coverage-mobile-dark` screenshots show no horizontal page scroll; long URLs use `[overflow-wrap:anywhere]` (`changes/[slug]/page.tsx:240`).
- **Consent-gated third-party**: zero non-same-origin requests measured; `Analytics.loadGtag` runs only after explicit accept.
- **`force-dynamic` + `revalidate` pairing on public pages**: looks contradictory but is documented in-file as belt-and-braces; pages are dynamic via the cookie-reading shell, `revalidate` records intended ISR cadence. Not a defect.
- **Sitemap legacy entries** (`/wire`, `/trends`, `/daily`, zh variants): intentional — legacy surfaces still serve live traffic until the migration gate passes (PRODUCT.md §Current Delivery State).

## Positive Findings

- Task 8's JSON-LD is the cleanest possible interpretation of the promise boundaries: no readiness/rating/review fields, every claim traceable to the rendered record, breadcrumbs mirrored exactly.
- Robots + sitemap policy is argued in-file against RFC 9309 longest-match semantics; the sitemap re-states the visibility gate instead of trusting callers, and degrades under a time budget instead of failing.
- Contrast-verified semantic token palette used throughout; both themes screenshot-verified on every surface; readiness never colour-alone.
- Honest-absence states (`StatePanel`, `EmptySlice`) teach the surface instead of padding volume — visible in the no-JS home screenshot ("No authorized Seller Central policy channel" note).
- CLS 0 with skeleton-free server rendering; self-hosted variable fonts via `next/font`; no images on public surfaces.
- Consent banner buttons already meet 44px (`min-h-[44px]`) — the one place the comfort floor is met; replicate that pattern for the chips.

## Recommended Actions

1. **[P2] `$impeccable harden`**: escape `<` as `\u003c` in JSON-LD serialization (`JsonLd.tsx`, `changes/[slug]/page.tsx`) — the only Task 8-introduced fix.
2. **[P2] `$impeccable adapt`**: raise filter-chip / theme-toggle hit areas toward 44px (`topics/[topic]/page.tsx`, `us/page.tsx`, `ThemeToggle.tsx`, `PublicNav.tsx`).
3. **[P3] `$impeccable adapt`**: scope legacy zh hreflang alternates away from the English-only public IA (`app/layout.tsx`).
4. **[P3] `$impeccable clarify`**: realign root OpenGraph/title/description with Phase 1 US-market positioning (`app/layout.tsx`).
5. **[P3] `$impeccable adapt`**: add `role="region"` + `aria-label` to the consent banner (`Analytics.tsx`).
6. **[P3] `$impeccable polish`**: map numeric z-index usages onto the semantic scale — final sweep after the above.

> You can ask me to run these one at a time, all at once, or in any order you prefer.
>
> Re-run `$impeccable audit` after fixes to see your score improve.
