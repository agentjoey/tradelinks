---
target: app/admin/sources/page.tsx
total_score: 27
p0_count: 0
p1_count: 2
timestamp: 2026-07-26T04-27-48Z
slug: app-admin-sources-page-tsx
---
# Critique: app/admin/sources/page.tsx (coverage capabilities + per-source contracts)

Method: dual-agent (A: agent-0 design review · B: agent-1 detector scan)

## Design Health Score — 27/40 (Acceptable → fixes applied this run)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Freshness, overdue, tier, SLA on-surface; coverage failure degrades to scoped note. |
| 2 | Match System / Real World | 2 | "ok never ago", "no SLA", cryptic R/C/P/Q subscores. |
| 3 | User Control and Freedom | 3 | Read-only by design; no capability → source anchors. |
| 4 | Consistency and Standards | 2 | Badge-dot vs bar color contradiction; "never" vs sibling's "unavailable"; alphabetical vs worst-first. |
| 5 | Error Prevention | 4 | Read-only; coverage query failure contained ("rows below are unaffected"). |
| 6 | Recognition Rather Than Recall | 2 | Source names/SLAs tooltip-only; capability keys unexplained. |
| 7 | Flexibility and Efficiency | 2 | No deep links; STALE capabilities not surfaced first. |
| 8 | Aesthetic and Minimalist Design | 3 | Dense but disciplined; last-ok/SLA duplication is the main noise. |
| 9 | Error Recognition and Recovery | 3 | Scoped error note excellent; STALE lacks a stated remedy (by design: human re-review). |
| 10 | Help and Documentation | 2 | Intro documented only the score section, not the coverage section. |
| **Total** | | **27/40** | **Acceptable** |

## Anti-Patterns Verdict

LLM assessment: not slop — earned familiarity with house patterns (3px bar, ticker meta rows, vertical lists). Two "subtly-off" moments: READINESS_BADGE emoji dots (🔵 Monitored) contradicting READINESS_BAR (teal), and "ok never ago" broken English.

Deterministic scan (agent-1): `detect.mjs --json app/admin/sources/page.tsx` → exit 0, 0 findings, 0 rules triggered. No false positives to adjudicate.

Visual overlays: browser visualization unavailable — page is auth-gated (Neon Auth), no credentials in this environment. Fallback signal: source-level review + detector.

## What's Working

1. Contained failure semantics: coverage query failure degrades to an explicit scoped note instead of taking down the dashboard or inventing data.
2. Dual-coded overdue state: chips carry text-urgent AND literal "· overdue", derived by the same isSourceOverdue rule that drives readiness transitions — the dashboard cannot overstate coverage.
3. House-style fidelity: CapabilityCard mirrors Row's shell/meta rhythm/token usage.

## Priority Issues (all fixed in this run unless noted)

- [P1] Badge/bar color contradiction → FIXED: emoji dots dropped from READINESS_BADGE; plain word + token bar, one encoding per state. (Pre-existing TIER_BADGE emoji left as house pattern, out of task scope.)
- [P1] Title-attribute-only info → FIXED: capability chips are now anchor links to `#src-<id>` rows; R/C/P/Q subscores carry sr-only full names ("Reachability: 30 of 40").
- [P2] Duplication without cross-reference → FIXED: Row articles get `id="src-<id>"` + scroll-mt; chips link to them.
- [P2] "ok never ago" → FIXED: `lastAt()` helper renders "never"; chips render "no successful check".
- [P3] Capability ordering + hidden disabled sources → FIXED: getCoverageOverview sorts STALE → EXPERIMENTAL → MONITORED → VERIFIED → UNAVAILABLE; chips append "· disabled".
- [P3] Header lede described only the score section → FIXED: lede now introduces both views.
- [P3] Empty `<ul>` for empty knownGaps → FIXED: guarded.
- [P3] Card titles not headings → FIXED: capability key and source name are now h3 (h1 → h2 → h3).
- Deferred (documented, pre-existing house patterns out of task scope): TIER_BADGE emoji (💀 Silent tone), 9–10px meta text sizes, ⏸ dual meaning.

## Persona Red Flags

Alex (power user): no deep links/filters (anchors added this run); STALE buried alphabetically (fixed via worst-first sort); cross-correlation was manual find-in-page (fixed via anchor links).
Sam (accessibility): tooltip-only data (fixed for chips + subscores); emoji badge noise (fixed in new readiness badges; pre-existing tier badges kept); missing card headings (fixed with h3); 9–10px meta text (deferred, house density).

## Minor Observations

- Spark/Sub tooltips remain title-only for the sparkline (pre-existing pattern).
- `{s.overdue && " · overdue"}` chip text can get long; flex-wrap handles it.
- force-dynamic + server-render, zero client JS, prefers-reduced-motion unaffected.

## Questions to Consider

1. When a capability goes STALE, what is the editor supposed to do? (Answer in-domain: human re-review — automated checks never restore; the readiness model makes this explicit.)
2. What would be lost if every badge were plain text and the bar carried all color? (Readiness badges now are; tier badges remain a house-wide decision.)
3. Should coverage be its own surface rather than stacked with source rows? (Deferred — single dashboard is the current house IA.)
