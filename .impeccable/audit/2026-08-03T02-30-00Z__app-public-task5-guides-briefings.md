# Impeccable Audit — Task 5 Guides & Briefings surfaces

Target: `app/(public)/guides`, `app/(public)/briefings`, `app/(public)/ReportCard.tsx`,
`src/public-intelligence/{guides,briefings}.ts` (Task 5, 2026-08-03)
Evidence: CLI detector (exit 0, zero findings on all 7 in-scope UI files, probe-verified),
browser overlay pass (agent-10), 12 final screenshots at 390/768/1440 × light/dark
(`design/shots/public-task5/`, all status 200, 0px horizontal overflow, 12/12 distinct
sha256), code inspection, DESIGN.md contrast table.

## Audit Health Score — 19/20 (Excellent)

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 4 | Literal readiness words; one h1/page; clean heading order; skip link; focus ring; breadcrumb `aria-current` names the period |
| 2 | Performance | 4 | Server components only; zero new client JS; no images; CSS transitions only, 150–250ms |
| 3 | Responsive design | 4 | 0px overflow at 390 script-verified on both surfaces × both themes; touch targets bumped to the Task 4 pattern |
| 4 | Theming | 4 | Semantic tokens only; dark theme verified in shots; no hard-coded colors in new files |
| 5 | Implementation integrity | 3 | Coherent inherited system; minor isolated issues fixed in-pass (see below) |

## Implementation Integrity Verdict

PASS. The surfaces express the accepted product system: IntelligenceCard anatomy,
ReadinessBadge, StatePanel vocabulary, token palette — nothing invented. CLI detector
clean; overlay findings were out-of-scope files (PublicNav 9px ticker, PublicFooter
caps tagline) or adjudicated false positives (cream background = documented `--c-bg`;
`nested-cards` = the accepted Monitored limit prose note; `text-occlusion` = the
overlay's own label).

## Issues found and fixed in this pass

- **[P1] Error→empty conflation** (`guides/page.tsx`, `briefings/page.tsx`): a read
  failure would have rendered the honest-absence copy — the product's most
  trust-loaded sentence under its falsest condition. Now renders
  `StatePanel state="error"`; absence copy only after a successful zero-row query.
- **[P2] Count-only briefing summaries** (`briefings.ts`): index cards counted
  ("2 Verified, 1 Monitored") without naming a subject. Summaries now lead with up to
  two pinned entry titles.
- **[P3] Duplicated facts** (`ReportCard.tsx`): published date in badge note + meta
  strip; fingerprint re-explained; breadcrumb terminal named kind not period. All
  deduplicated.
- **[P3] Touch targets ~34px** (`guides/page.tsx` CTAs): bumped to `py-2.5 sm:py-1.5`
  (Task 4 pattern, ~44px at mobile).
- **[P3] Empty per-record fingerprint** (`briefings.ts` pinned serializer): now the
  same sha256 scheme as the canonical serializer — no placeholder values.
- **[P3] `as any` readiness casts** (3 pages): DTOs now type readiness as
  `ReadinessLevel`; casts removed.

## Kept with rationale (P2)

- **No prev/next period navigation**: archive length is one period in Phase 1;
  prev/next against a non-existent archive would manufacture affordances that 404.
- **GuideBody inline-markdown subset**: guide detail is unreachable while zero guides
  are published; the corpus validator constrains the format and first publish is a
  human review event that owns the rendering check.

## Positive findings

- Honest-absence state teaches the trust model and never renders under failure.
- Fingerprint is a first-class, visible audit element.
- Density varies with readiness exactly per DESIGN.md; Monitored limit is prose,
  never a badge.
- All four status gates behave: unknown guide slug, out-of-range week, unpublished
  period, below-threshold daily → real 404s (curl-verified on the production build).
