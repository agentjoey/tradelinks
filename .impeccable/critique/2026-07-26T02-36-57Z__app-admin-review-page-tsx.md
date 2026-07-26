---
target: app/admin/review/page.tsx
total_score: 30
p0_count: 0
p1_count: 0
timestamp: 2026-07-26T02-36-57Z
slug: app-admin-review-page-tsx
---
# Critique — app/admin/review/page.tsx (Task 6 canonical review surface)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Pending/done/error all announced via aria-live; no skeleton but mutations are short |
| 2 | Match System / Real World | 3 | Domain codes (PRIMARY_OFFICIAL, VERIFIED) are the project's canonical vocabulary; labels state consequences plainly |
| 3 | User Control and Freedom | 3 | Publication is immutable by design; the correction path is the forward-only "undo" and is clearly labeled |
| 4 | Consistency and Standards | 4 | Reuses TradeLinks tokens and admin vocabulary throughout; one control per invariant path |
| 5 | Error Prevention | 4 | Publish blocked by invariants with visible reasons; rejection/correction reasons validated client- and server-side |
| 6 | Recognition Rather Than Recall | 3 | All constraints, diffs, and evidence visible; blocker text rendered on-page, not only in tooltips |
| 7 | Flexibility and Efficiency | 2 | No keyboard accelerators or bulk review; queue is strictly one-draft-at-a-time |
| 8 | Aesthetic and Minimalist Design | 3 | Dense but purposeful; ticker metadata rows border on noise |
| 9 | Error Recovery | 3 | Plain-language recovery copy preserves context; "NETWORK_ERROR" code prefix leaks jargon |
| 10 | Help and Documentation | 2 | Intro paragraph explains immutability; no per-control contextual help beyond labels |
| **Total** | | **30/40** | **Good — address weak areas, solid foundation** |

## Anti-Patterns Verdict

**LLM assessment**: Does not read as AI-generated. No gradient text, no side-stripe accents, no glass, no hero-metric template, no identical card grid. The section-label ticker style is the project's existing admin register, used consistently; density is earned (intelligence-desk brief), not decorative. The italic display accent in the h1 matches the existing site pattern.

**Deterministic scan**: `detect.mjs --json app/admin/review/page.tsx app/admin/review/review-controls.tsx` → exit 0, zero findings. No detector issues to reconcile; no false positives.

**Visual overlays**: not available — no browser-automation tool is exposed in this session, so no live-server injection was attempted. Fallback signal: source-level review plus deterministic scan; browser evidence is deferred to the pact final-build verification on the production build.

## Overall Impression

A restrained, high-density review desk that puts constraints and evidence in front of the action exactly as the approved Brief (Task6-T3-r3) demands. The single biggest opportunity is tightening small-text contrast and labeling so the 9–10px metadata layer stays legible in both themes.

## What's Working

- **Constraints-first hierarchy with consequences adjacent**: publication constraints lead the card, immutable version history sits directly above the controls — the editor sees basis and consequences at the moment of decision.
- **Persisted-or-unavailable data contract**: null `classificationConfidence` renders as "unavailable — recorded before confidence persistence", never as an invented score; rejection/correction reasons are required, persisted, and shown in history.
- **Error prevention and recovery**: invariant blockers are visible on the page (not only on the disabled button's tooltip), reasons are double-validated, and failure copy states that nothing was written and how to recover.

## Priority Issues

- **[P2] Small-text contrast risk on the metadata layer**: 9–10px uppercase labels in `text-faint`/`text-muted` (section h3s, evidence ticker rows, inline "Effective"/"Template" labels) may fall under 4.5:1 in one or both themes. Why: small text gets no large-text exemption; editors scanning provenance shouldn't squint. Fix: bump the faintest 9px labels to `text-muted`, or raise token lightness for `--c-faint` on these surfaces. Suggested command: $impeccable audit
- **[P2] Touch targets below 44px on mobile/intermediate widths**: action buttons are `py-1.5` at 10px text (~28–30px tall). Why: the Brief requires responsive mobile/intermediate layouts; a wrong tap here has immutable consequences. Fix: increase vertical padding at small breakpoints (e.g. `sm:py-1.5 py-2.5`). Suggested command: $impeccable adapt
- **[P3] Disabled publish button's tooltip is keyboard-inaccessible**: `title` on a disabled button is unreachable by keyboard and touch. Mitigated because blockers also render as a visible paragraph — keep it that way; no change strictly required. Suggested command: $impeccable polish
- **[P3] No explicit focus-visible styling on buttons**: inputs get `focus:border-signal/50`; buttons rely on the UA default outline. A consistent focus-visible ring would match the token system. Suggested command: $impeccable polish

## Persona Red Flags

**Alex (Power User)**: No keyboard shortcuts and no bulk path — a 20-draft queue is 20 sequential card reviews. Acceptable for the immutable-publication stakes, but the lack of any accelerator (e.g. focus-first-control, jump-to-next-draft) is felt. No forced onboarding; blockers are scannable.

**Sam (Accessibility-Dependent)**: Native buttons/inputs/fieldsets with programmatic labels — good. Red flags: 9–10px `text-faint` labels risk failing contrast; the disabled publish button's explanation lives in an unreachable `title` (mitigated by the on-page blocker paragraph); `role="alert"` inside `aria-live="polite"` is redundant but harmless.

**Riley (Stress Tester)**: Empty queue state teaches; zero-evidence drafts show an explicit VERIFIED-block warning; null dates render as "unavailable". Long titles/summaries wrap (`leading-snug`, `max-w-[72ch]`). Correction with blank template is disallowed client-side and explained — no silent failure path found in source.

## Minor Observations

- Diff uses strikethrough on every before-value including IDs/dates; readable, but a two-column before/after layout at desktop would scan faster.
- `◆ The Desk` kicker duplicates the site-wide admin chrome pattern; fine, but it plus the italic h1 accent is the page's only decoration — keep it that way.
- `aria-busy={pending}` is set on the controls container; consider also disabling the reason textareas' labels association check — labels are correctly `htmlFor`-bound, no issue.

## Questions to Consider

- Should the queue offer a "next draft" keyboard path once the queue routinely exceeds a handful of items?
- Would a two-column diff (before | after) at desktop widths reduce mis-reads on long summaries?
