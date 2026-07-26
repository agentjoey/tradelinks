---
target: app/admin/sources/page.tsx
total_score: 28
p0_count: 0
p1_count: 0
timestamp: 2026-07-26T04-44-52Z
slug: app-admin-sources-page-tsx
---
# Critique: app/admin/sources/page.tsx (1px-rail correction + coverage capabilities)

Method: dual-agent (A: agent-0 design review · B: agent-1 detector scan)

## 1px side-rail rule — SATISFIED

The repository rule (CLAUDE.md 设计约束: 无 >1px 侧边色条; tier = chip + 1px 细边框)
and the Impeccable absolute ban on side-stripe borders >1px are both satisfied by
the corrected page. Both assessments independently verified:

- `page.tsx` Row rail: `absolute left-0 top-0 h-full w-px ${TIER_BAR[h.tier]}` (exactly 1px)
- `page.tsx` CapabilityCard rail: `absolute left-0 top-0 h-full w-px ${READINESS_BAR[cap.readiness]}` (exactly 1px)
- Deterministic grep for `w-[2px]`/`w-[3px]`/`border-l-2/4/8`/`border-l-[`: zero matches in the file and across `app/admin/`.

The earlier session's treatment of a 3px rail as an acceptable house-pattern
exception was invalid and is not carried forward; the correction to `w-px` is the
final state, with no compensating thicker border or additional rail.

## Design Health Score — 28/40 at assessment (Good) → P1s fixed this run

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Score, tier, reasons, timestamps, spark, overdue flags, tier counts, as-of clock. |
| 2 | Match System / Real World | 3 | "silent"/"degraded" map well; R/C/P/Q decode via tooltip+sr-only; "urg" is insider shorthand. |
| 3 | User Control and Freedom | 3 | FIXED this run: header tier counts are now anchor links to tier sections. Read-only by design. |
| 4 | Consistency and Standards | 2→3 | FIXED this run: emoji tier badges replaced with plain-word labels — the page now applies its own one-encoding-per-state rule to both state systems. |
| 5 | Error Prevention | 3 | Read-only; coverage query failure contained with explicit blast-radius copy. |
| 6 | Recognition Rather Than Recall | 3 | FIXED this run: sparkline has sr-only data; capability chips carry sr-only SLA. |
| 7 | Flexibility and Efficiency | 3 | Worst-first + `#src-<id>` anchor cross-links; no filter for 50+ sources (deferred). |
| 8 | Aesthetic and Minimalist Design | 3 | Density on-register; contract prose is spec-mandated visibility (see deferrals). |
| 9 | Error Recognition and Recovery | 2 | Diagnosis excellent (reasons line); recovery absent by design — remediation is worker-side. |
| 10 | Help and Documentation | 2 | Lede carries the mental model; subscore names in tooltips/sr-only. |
| **Total** | | **28/40** | **Good** |

## Anti-Patterns Verdict

LLM assessment (A): not slop — earned familiarity with house patterns (1px token
rails, ticker meta rows, vertical lists, worst-first triage). The one glaring
self-contradiction — emoji tier badges (🟢/💀/⏸) coexisting with the file's own
comment banning platform-dependent emoji color — was FIXED this run: tier badges
are plain words (TIER_LABEL), matching the readiness badges. The emoji TIER_BADGE
export stays in src/monitoring/health.ts for the Telegram worker message, its
legitimate consumer.

Deterministic scan (B): `detect.mjs --json app/admin/sources/page.tsx` → exit 0,
0 findings, 0 rules triggered. No false positives to adjudicate.

Visual overlays: unavailable — no browser-automation tool in this session and the
page is auth-gated (Neon Auth, no credentials). Fallback signal: CLI detector +
source-level review. Final-build browser screenshots are captured separately via
the static-render harness (design/shots/task7-sources/) as task evidence.

## What's Working

1. Honest failure containment: coverage query failure degrades to an explicit scoped note naming the blast radius; empty state names the remediation ("Run the worker boot seed").
2. Triaged IA at both levels: READINESS_RANK/TIER_RANK worst-first; capability → source anchor links close the loop between the two views.
3. Above-average a11y craft: sr-only subscores and sparkline data, aria-hidden decorative bars, semantic h1→h2→h3, :focus-visible outline, AA-fixed faint token.

## Priority Issues (fixed this run unless noted)

- [P1] Emoji tier badges violated the page's own encoding rule → FIXED: page-local TIER_LABEL plain words in row badge, header counts, and section headers; TIER_BADGE import removed (worker Telegram message untouched).
- [P1] Sparkline misrepresented zero-item days (`Math.max(6, …)` stub) → FIXED: zero days render a 1px baseline tick; sr-only "Items per day, last 7 days: …" added; bars aria-hidden.
- [P2] Sub-bars value-blind → FIXED: zero-value subscore fills use bg-urgent.
- [P2] No view freshness on a force-dynamic dashboard → FIXED: "as of HH:MM UTC" in header meta.
- [P2] Header tier counts were plain spans → FIXED: anchor links to `#tier-<tier>` sections (sections got ids + scroll-mt).
- [P2] Capability chip SLA keyboard-unreachable (title-only) → FIXED: sr-only SLA text inside the link.
- [P3] knownGaps hand-bullets read aloud by screen readers → FIXED: `·` wrapped in aria-hidden span.
- [P3] "0m ago" → FIXED: "just now" floor in ago()/lastAt.
- Deferred (documented): contract prose inline per row — promise/degradation/capability links are the pact spec's mandated visibility for this task; collapsing them would hide the required surface. Read-only recovery affordances (logs/re-run links) are worker-side, out of task scope. 9–10px meta text is pre-existing house density. getSourceHealth() is deliberately unguarded: if the primary health query fails the whole surface is down and scoped containment is meaningless (route error boundary is the deliberate path).

## Persona Red Flags

Alex (power user): FIXED — tier counts now jump to sections; as-of clock lets him judge the page's own staleness. Remaining: no filter/search for 50+ sources (deferred, pre-existing IA).
Sam (accessibility): FIXED — emoji badge noise gone, sparkline and SLA no longer title-only, hand-bullets aria-hidden. Remaining: 9–10px meta text (house density, 5.2:1 contrast), hover-only underline cue on capability chips.

## Minor Observations

- Sparkline title remains mouse-only by design; the sr-only text now carries the data.
- Sub grid splits R alone / C·P·Q — matches the 40/20/20/20 weights; noted as intentional.
- force-dynamic + server-render, zero client JS, reduced-motion unaffected (no animation added).

## Questions to Consider

1. When everything is healthy, should the page say "all clear" explicitly? (Deferred — a success-summary state is a house-wide dashboard decision, not task scope.)
2. A disabled-by-choice source scores 0/100 — does the dashboard measure health or punish configuration? (Pre-existing scoring semantics, out of scope.)
3. Should coverage become its own surface? (Deferred — single dashboard is the current house IA.)
