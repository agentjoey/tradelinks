---
target: app/(public)/guides + app/(public)/briefings + ReportCard (Task 5)
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 1
timestamp: 2026-08-02T18-23-34Z
slug: app-public-guides-and-briefings-task5
---
# Impeccable Critique — Task 5 Guides & Briefings surfaces

Method: dual-agent (A: agent-9 design review · B: agent-10 detector+browser)
Target: `app/(public)/guides`, `app/(public)/briefings`, `app/(public)/ReportCard.tsx` (Task 5)
Live evidence: http://127.0.0.1:4605 — /guides (honest absence), /briefings, /briefings/weekly/2026/31, 390/768/1440 × light/dark.

## Design Health Score — 32/40 (Good)

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 4 | Literal readiness words, dates, fingerprint, entry counts |
| 2 | Match system / real world | 3 | Ops jargon in public copy ("Operations qualification run", "pinned") |
| 3 | User control and freedom | 3 | No prev/next period navigation |
| 4 | Consistency and standards | 4 | Card anatomy, badge, meta strip reused identically |
| 5 | Error prevention | 3 | Errors were silently converted to empty states (fixed) |
| 6 | Recognition rather than recall | 3 | Breadcrumb terminal named kind, not period (fixed) |
| 7 | Flexibility and efficiency | 3 | Read surfaces; no subscription affordance on page |
| 8 | Aesthetic and minimalist | 3 | Published date rendered twice; absence taught twice |
| 9 | Error recovery | 3 | Undermined by error→empty conflation (fixed) |
| 10 | Help and documentation | 4 | The model is taught inline at every decision point |

## Design Specificity Verdict

Grounded in this product, not category-interchangeable. The copy could exist nowhere
else ("9 guides are drafted and awaiting human review… we do not publish authority we
cannot stand behind"). The visual language is entirely inherited, as the contract
demands — the absence of novelty is the design achievement. The one slip: internal
ops vocabulary in public copy.

Deterministic scan (Assessment B): CLI detector exit 0, zero findings on all 7 in-scope
files (probe-verified the detector fires). Browser overlay findings were all in
out-of-scope or accepted files (9px nav ticker PublicNav.tsx:37, all-caps footer
tagline PublicFooter.tsx:11, cream page background = documented --c-bg token) or
false positives (text-occlusion flagged the overlay's own label; nested-cards flagged
the accepted Monitored limit prose note at IntelligenceCard.tsx:173; the 10px
0.625rem chips match the accepted IntelligenceCard vocabulary). No detector-driven
changes.

## Priority Issues

- **P1 — Errors rendered as honest absence** (`listPublishedBriefings().catch(() => [])`,
  `listPublishedGuides().catch(() => [])`). A database failure would have printed
  "we do not manufacture volume" — the one lie the product is forbidden from telling.
  FIXED: both indexes now render `StatePanel state="error"` on read failure; the
  absence copy only renders after a successful zero-row query.
- **P2 — Briefing index card counted instead of describing.** FIXED (partial): the
  generated summary now leads with up to two headline change titles before the counts.
- **P2 — No period-to-period navigation.** KEPT with rationale: archive length is one
  period in Phase 1; adding prev/next against a non-existent archive invents affordances
  that would 404. Revisit when the archive grows.
- **P3 — Duplicated facts / double teaching.** FIXED: published date dropped from the
  badge note (meta strip keeps it); explainer trimmed; breadcrumb terminal now carries
  the period key; primary CTA on /guides visually weighted.
- **P3 — Latent guide-body renderer risk** (inline markdown would render literally).
  KEPT with rationale: guide detail is unreachable in Phase 1 (zero published guides);
  the corpus format is validated by `validateGuideCorpus` and the first publish requires
  human review, which owns the rendering check.

## Persona Red Flags

- Jordan (first-timer): "Operations qualification run" means nothing; index now leads
  with subjects. "See what we watch" is insider framing — primary CTA now weighted.
- Sam (accessibility): breadcrumb `aria-current` now names the period; literal readiness
  words and heading order verified clean.
- Casey (mobile 390px): no horizontal scroll anywhere; header stack trimmed (badge note
  and explainer deduplicated) so first card arrives sooner.

## What's Working

1. The honest-absence state on /guides teaches the entire trust model in one card.
2. The fingerprint is a visible design element — evidence-traceability made tangible.
3. Density varies with readiness exactly as designed; the Monitored limit is prose.

## Questions to Consider

1. Can a reader do anything with the fingerprint, or is it the performance of evidence?
2. If the "9 drafted" counter never moves for six months, does it build anticipation or
   document institutional failure — does it need a staleness policy?
3. At what archive length does a weekly cadence become an implicit liveness promise?
