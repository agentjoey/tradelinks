---
target: app/admin/review/page.tsx
total_score: 31
p0_count: 0
p1_count: 0
timestamp: 2026-07-25T20-30-47Z
slug: app-admin-review-page-tsx
---
# Critique — app/admin/review/page.tsx (canonical review surface)

⚠️ DEGRADED: single-context (pact task spec `immutable-publication` designates Kimi K3 as sole implementation worker; delegating worker verification to sub-agents is contractually prohibited for this task, so Assessments A and B ran sequentially inline).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Pending/done/error/validation all surface via aria-live; after router.refresh() the card leaves the queue, so the done message unmounts — success is implicit |
| 2 | Match System / Real World | 3 | Domain enums (PRIMARY_OFFICIAL, MONITORED/VERIFIED) are the persisted vocabulary and are explained in the constraints panel |
| 3 | User Control and Freedom | 3 | No undo by design (immutable domain); correction is the forward path and is offered next to publish |
| 4 | Consistency and Standards | 4 | BL-045 semantic tokens and admin register throughout; single button/input vocabulary |
| 5 | Error Prevention | 4 | Required reasons validated client+server; publish disabled with visible blockers; duplicate-submit prevented via useTransition + disabled fieldsets |
| 6 | Recognition Rather Than Recall | 3 | Correction date/template inputs relied on placeholder/aria-label only (fixed this run: visible labels added) |
| 7 | Flexibility and Efficiency | 2 | No accelerators/bulk actions; acceptable — deliberate single-draft review is the product intent |
| 8 | Aesthetic and Minimalist Design | 3 | High density by design; identity eyebrow line is long but consistent with the desk register |
| 9 | Error Recovery | 4 | Errors name the unchanged state and the recovery path ("fix the cause and retry, or reject it with a reason"); NETWORK_ERROR states nothing was written |
| 10 | Help and Documentation | 2 | Page intro explains immutability; constraints self-document; no external help (fine for an internal desk) |
| **Total** | | **31/40** | **Good** |

## Anti-Patterns Verdict

**LLM assessment**: No AI-slop tells. No side rails >1px, no gradient text, no glass, no hero metrics, no identical card grid, no numbered-section scaffolding. Restrained intelligence-desk register; earned familiarity (GitHub-style diff, Stripe-style risk clarity).

**Deterministic scan**: `detect.mjs --json app/admin/review/page.tsx app/admin/review/review-controls.tsx` → `[]` (exit 0, zero findings).

**Visual overlays**: skipped — the surface requires an authenticated Neon Auth session plus seeded canonical drafts; no auth bypass is permitted by the task spec. Browser evidence is deferred to the final-build verification gate (permission-denial journey + Human Owner walkthrough on the same build).

## Overall Impression

The surface does the hard thing right: constraints first, evidence and immutable history adjacent to the action, consequences stated on every control. The biggest opportunity was small but real — the correction inputs were the weakest affordance on the page (placeholder-only labels, suppressed focus ring), and the changed-template correction path was non-actionable (fixed with TDD earlier in this session: the correcting reviewer is now recorded as the reviewer of the changed template).

## What's Working

- Constraints-first hierarchy with human-readable blockers; publish is disabled with the reasons visible in prose, not buried in a tooltip.
- Immutable version history sits directly above the controls — basis and consequences at the moment of decision, exactly the approved Brief's deliberate design choice.
- Data contract honesty: null `classificationConfidence` renders as "unavailable — recorded before confidence persistence"; nothing is synthesized.

## Priority Issues

- **[P2] Correction date/template inputs had no visible labels** — placeholder/aria-label only hurts recognition and disappears once typed. **Fixed**: visible `Effective` / `Template` labels with htmlFor wiring.
- **[P2] Text inputs suppressed the global focus ring** (`focus:outline-none`) with only a subtle border-color change — weak 2.4.7 focus-visible. **Fixed**: outline-none removed; global 2px signal focus ring applies, border change kept.
- **[P3] Done message unmounts on refresh** as the card leaves the queue. Acceptable: leaving the queue IS the success state. Waiver requested.
- **[P3] Disabled publish button tooltip** is unreliable across browsers; mitigated by the always-visible blocker paragraph. Waiver requested.
- **[P3] Correction cannot clear an effective date** (null = no change in the server contract). Known limitation; setting a date is the common case. Waiver requested.

## Persona Red Flags

- **Alex (power user)**: native keyboard operability throughout; no bulk publish — by design (immutable publication is a deliberate single act). No red flags beyond H7 score.
- **Sam (accessibility-dependent)**: the two P2s above were his blockers (labels, focus ring) — fixed. Status uses text + color, never color alone; aria-live announces validation/error/done; aria-busy marks in-flight.
- **Riley (stress tester)**: duplicate-submit prevented; blank reasons rejected client- and server-side; legacy Alert id fails explicitly as CANONICAL_DRAFT_NOT_FOUND without touching the Alert row (DB-tested).

## Minor Observations

- The identity eyebrow (signal · readiness · market · urgency · regions · version) approaches the density ceiling; acceptable in the desk register.
- `decoration-urgent/50` strikethrough on diff "before" values reads clearly in both themes.

## Questions to Consider

- Should a published correction surface a confirmation summary (what changed vs. the previous current version) before the card leaves the queue? Deferred — the version history on the next draft of the same change already shows it.
