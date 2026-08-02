---
target: Phase 1 public intelligence hubs (/amazon-us, /categories/home-kitchen, /coverage, /us, /)
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-08-02T10-58-28Z
slug: app-public-amazon-us-page-tsx
---
# Critique — Phase 1 public intelligence hubs (/amazon-us, /categories/home-kitchen, /coverage, /us, /)

Method: dual-agent (A: agent-0 design review · B: agent-1 detector+browser evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Coverage strip, SLA, overdue flags excellent; stat meanings live in `title=` tooltips |
| 2 | Match System / Real World | 2 | "SLA", "coverage ceiling", "D03 disabled", "bot-gated" unexplained on hubs; only /coverage glosses states |
| 3 | User Control and Freedom | 2 | Card titles, "All →", and 3 of 8 nav items dead-end at 404 (unshipped Task 4–6 routes) |
| 4 | Consistency and Standards | 2 | Same Monitored record gets limit prose on /amazon-us but a bare badge elsewhere |
| 5 | Error Prevention | 2 | Links to unshipped routes in primary nav — preventable dead ends |
| 6 | Recognition Rather Than Recall | 3 | Readiness words literal everywhere; mobile coverage rows lost the "last check" label |
| 7 | Flexibility and Efficiency | 3 | Breadcrumbs, topic chips, compact rows good; RSS/briefing feed links 404 |
| 8 | Aesthetic and Minimalist Design | 3 | Restrained per token system; noise from duplicate records across slices + consent overlay |
| 9 | Error Recovery | 2 | 404 is generic; nothing states "Changes/Guides/Briefings are not published yet" |
| 10 | Help and Documentation | 3 | "How to read this page" panel good but omitted Verified/Monitored (fixed in this pass) |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict

**Grounded in the product — not category-interchangeable.** The evidence card (readiness word + countdown in mono, Fraunces title, bold category/platform in impact, teal PRIMARY markers, named corrections), the can-see/cannot-see warning panel, and the SLA/overdue strip could only belong to an evidence-traceable intelligence product. Dilution comes from legacy residue, not genericness: home `<title>` still says "Cross-Border Intelligence Wire", the old GA consent banner floats over the honesty panels, and three nav items promise surfaces that 404.

**Deterministic scan** (Assessment B): CLI detector on `app/(public)` exit 0, zero findings (token architecture — no font-family/inline styles in markup; sanity-checked the detector fires on synthetic violations). Browser overlay injection succeeded (live-server :8461, stopped): 26 findings across 3 routes — `undersized-ui-text`, `all-caps-body`, `cream-palette`, `em-dash-overuse` all verified false positives (approved house micro-type `.ticker` 9–10px uppercase mono, deliberate paper token `rgb(244,241,232)`, advisory-only em-dash rule). One finding not covered by an approved pattern: `nested-cards` ×2 on /amazon-us — verified to be the urgent coverage-limit note inside the evidence card, which IS the approved DESIGN.md §Card anatomy ("coverage-limit note … urgent, bordered, prose not badge"). False positive, documented.

**Browser measurements** (Assessment B): no horizontal overflow at 390px on any route/theme; h1 Fraunces 26px ✓; body Schibsted Grotesk ✓; mono IBM Plex Mono ✓; theme cookie light `rgb(244,241,232)` / dark `rgb(8,9,12)` ✓; `.ticker` amber on cream ≈ 5.3:1 AA ✓; console errors are Next RSC prefetches to unshipped Task 4–6 routes.

## Overall Impression

The honesty mechanics are real and land exactly as the mockup intends — the /amazon-us warning panel is the trust-forming peak. The surface is dragged down by staged-delivery residue (dead Task 4–6 links, old home metadata, consent overlay), not by design errors.

## What's Working

1. **Honesty mechanics are structural, not decorative** — ceiling note, three-part warning panel, urgent overdue stat with plain-language sr-only summary; Verified-light/Monitored-prose per DESIGN.md.
2. **Evidence card fidelity** — inline-open evidence, teal PRIMARY markers, named corrections, risk chips routing to filtered topics; readiness survives greyscale.
3. **/coverage worst-first matrix** — per-row gaps inline, overdue timestamps in the urgent token, genuinely structural mobile transformation (stacked rows, zero overflow).

## Priority Issues

- **[P0] Dead links to unshipped Task 4–6 routes** — /changes/*, /guides, /briefings, /feeds/briefings.xml 404 from nav, card titles, "All →", version-history links. *Why it matters:* tracing a conclusion is the core task; the trace route does not exist yet. *Disposition:* cannot be fixed inside Task 3's file scope — the routes belong to Tasks 4/5/6 and the nav to the accepted Task 2 shell; the binding mockup itself ships these links (staged delivery accepted at the design gate). Recorded as cross-task debt, NOT waived: it must be re-checked at Task 4 acceptance. *Fix owner:* Task 4 (/changes), Task 5 (/guides, /briefings), Task 6 (feeds).
- **[P1] Monitored cards outside /amazon-us rendered a bare badge** — `limitNoteFor()` fired only for `hub.slug === "amazon-us"`; home passed no limit note. DESIGN.md: "Never a bare badge, never omission." **FIXED this pass:** every Monitored card now states the definitional limit sentence ("We cannot verify this to the Verified standard — …"); amazon-us keeps its specific persisted login-wall sentence. *Suggested command:* none (fixed).
- **[P1] Legacy GA consent banner overlays Phase 1 content, worst at 390px** — `app/components/Analytics.tsx` fixed `z-40` bar covers the warning panel's "We cannot see" bullet until dismissed. *Disposition:* outside Task 3's file scope (same finding flagged to the Human Owner by Task 2's accepted review as P2 residual). Escalated again here as P1 with mobile evidence; NOT waived. *Fix owner:* Human Owner / shell task.
- **[P2] Home page metadata was the old product** — layout title "Cross-Border Intelligence Wire … Real-time … 6 regions" contradicts three Phase 1 decisions. **FIXED this pass:** `(public)/page.tsx` exports its own metadata matching the Phase 1 positioning.
- **[P2] Duplicate records across hub slices** — same change rendered as full card and compact row. **FIXED this pass:** slices exclude versionIds already shown in the changes window.

## Persona Red Flags

- **Casey (mobile, 390px):** consent banner occludes the warning-panel text on /amazon-us; coverage stacked rows compressed "SLA · date" without the "last check" label (label restored this pass).
- **Jordan (first-timer):** arrives via search to a tab titled "Cross-Border Intelligence Wire" (fixed), meets a cookie wall before content, finds MONITORED unexplained outside /coverage (glossary extended this pass).
- **Sam (keyboard/screen-reader):** good bones — skip link first tab stop and visibly focuses, 2px signal focus ring, readiness never colour-only, CoveragePanel sr-only summary. Red flags: stat explanations in `title=` only (sr-only summary mitigates); consent banner is last in tab order yet first visual demand.

## Minor Observations

- `/zh` returns 200 and legacy routes remain in sitemap — explicitly Task 9 scope ("No /zh redirect work"), recorded not acted.
- Dead BL-045 CSS (`.radar-glyph`, `.live-dot`, `.tape`) remains in globals.css — consumed by legacy routes until Task 9.
- `(public)/loading.tsx` was deleted under orchestrator ruling #2 (soft-404 fix); per-surface skeletons are owed by Tasks 4–5.

## Questions to Consider

1. Is a Monitored card's honesty a property of the data or of the page template — and which should the reader trust when they disagree? (Resolved this pass: the limit sentence is now definitional, driven by readiness, not by page slug.)
2. Three of eight nav items lead to 404: on a product whose premise is "never promise what you can't show," is an aspirational nav itself a promise violation? (For the orchestrator at Task 4 acceptance.)
3. The home `<title>` still sold "Real-time" — the one thing Phase 1 renounced. (Fixed at page level; layout-level old copy remains for the shell owner.)
