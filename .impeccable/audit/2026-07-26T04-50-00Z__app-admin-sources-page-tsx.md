---
target: app/admin/sources/page.tsx
total_score: 18
timestamp: 2026-07-26T04-50-00Z
slug: app-admin-sources-page-tsx
---
# Audit: app/admin/sources/page.tsx (post 1px-rail correction)

## Anti-Patterns Verdict — PASS

Deterministic scan: `detect.mjs --json app/admin/sources/page.tsx` → exit 0, `[]`
(0 findings, 0 rules triggered) on the corrected file.

**1px side-rail rule: SATISFIED.** Both accent rails are `absolute left-0 top-0
h-full w-px` (exactly 1px), token-colored (`bg-urgent`/`bg-signal`/`bg-calm`/`bg-muted`).
Repo rule (CLAUDE.md: 无 >1px 侧边色条) and the Impeccable absolute ban on
side-stripe borders >1px are both met. The prior session's "3px is an acceptable
house-pattern exception" statement is invalid and not carried forward. No
compensating thicker border or additional rail was added.

No gradient text, no glassmorphism, no hero-metric template, no identical card
grid, no numbered scaffolding. The single "◆ The Desk · Sources" kicker is the
house masthead voice, not an eyebrow-per-section reflex. Would a Linear/Stripe-
fluent admin trust it: yes — earned familiarity, platform-independent state
encoding (plain words + 1px token rail) in both state systems.

## Audit Health Score — 18/20 (Excellent)

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | sr-only data for subscores/sparkline/chip SLA, aria-hidden decoratives, semantic h1→h2→h3, :focus-visible ring; small chip touch targets (P3). |
| 2 | Performance | 4 | Server component, zero client JS, no animation added, 3 bounded queries (2 parallel), no images, no layout animation. |
| 3 | Responsive Design | 3 | flex-wrap meta rows, min-w-0 truncation, single-column flow; no fixed-width containers that break mobile. |
| 4 | Theming | 4 | Every color via tokens; all used tokens (bg/surface/surface2/ink/muted/faint/line/signal/urgent/calm) defined in BOTH dark and light themes; no hard-coded hex in the page. |
| 5 | Anti-Patterns | 4 | Detector 0 findings; 1px-rule compliant; platform-independent state encoding throughout. |
| **Total** | | **18/20** | **Excellent** |

## Contrast verification (source-computed)

- Dark `--c-faint` #7c8290 on surface: 5.2:1 (AA-fixed per globals.css comment) — 9–10px meta text passes AA for normal text.
- Dark `--c-urgent` rgb(255,90,77) on surface rgb(14,16,21): ≈5.9:1 — overdue/fails text passes.
- Light theme redefines every token to darker-on-paper values (faint rgb(111,106,92) ≈4.7:1) — no dark-only token leaks.

## Detailed Findings

- [P3] Capability chip links are 10px text — touch target < 44×44pt.
  Location: CapabilityCard source chips. Category: Responsive/A11y (WCAG 2.5.5 AAA-level target size; AA has no fixed minimum for inline links).
  Impact: mobile admins tap targets are small; dense desktop-first admin surface, pre-existing house density.
  Recommendation: acceptable for AA; if touched later, increase chip padding. Suggested command: $impeccable adapt.
- [P3] Sub/Spark `title` tooltips remain mouse-only, but sr-only equivalents now carry the same data — mitigated, noted for completeness.

No P0/P1/P2 findings.

## Patterns & Systemic Issues

None. Token discipline is uniform; the one historical inconsistency (emoji tier
badges vs plain-word readiness badges) was resolved in this pass.

## Positive Findings

- Full token purity in both themes; no hard-coded colors.
- Containment-minded error states with explicit blast-radius copy.
- Screen-reader parity for every visual encoding (subscores, sparkline, SLA, overdue, disabled).
- Zero client JS: force-dynamic server render; reduced-motion surface unaffected (no new animation).
- One-encoding-per-state rule now applied consistently to BOTH state systems (tier + readiness).

## Recommended Actions

No required actions. Optional polish only:

1. [P3] `$impeccable adapt`: chip touch-target padding if mobile admin use grows.
