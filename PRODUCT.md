# Product

## Register

product

## Platform

web

## Users

The primary user is an authenticated TradeLinks administrator/editor reviewing canonical intelligence before publication. They work at a desk, in a focused, verification-oriented state of mind: every publication is immutable, so the cost of a mistake is a permanent public record that can only be corrected forward. They review version differences, source readiness, structured evidence, effective-date provenance, classification confidence, and the action template before publishing, correcting, or rejecting a canonical change.

## Product Purpose

TradeLinks turns scattered regulatory, platform, and market signals into canonical, deduplicated intelligence that cross-border sellers can trust. The admin review surface exists so that nothing reaches publication without an editor who has seen the evidence and the consequences. Success means Verified publication is impossible without reviewed `PRIMARY_OFFICIAL` evidence, every rejection carries an explicit persisted reason, corrections preserve the full version history, and the reviewer can inspect every field used downstream before acting.

## Positioning

The intelligence desk where publication is a deliberate, evidence-backed act: the reviewer always sees the basis and the consequences before anything becomes immutable.

## Brand Personality

Restrained, precise, high-density. An intelligence desk, not a marketing site: quiet surfaces, exact data, no decoration competing with the record. Voice is factual and unambiguous — labels say what a control does and what it costs.

## Anti-references

- Consumer news or social feeds: infinite scroll, engagement chrome, emotional framing.
- Generic SaaS dashboards: hero metrics, decorative charts, gradient accents, rounded card grids.
- Over-decorated "AI" tooling: glass panels, decorative motion, invented affordances for standard review tasks.

## Design Principles

- Evidence before action: immutable version history and `PRIMARY_OFFICIAL` evidence sit adjacent to the publication control so the basis and the consequences are visible at the moment of decision.
- Persisted or unavailable, never invented: only persisted `classificationConfidence` and `rejectionReason` render; older null values show as clearly unavailable, never as a synthesized score or reason.
- One invariant-checked path: publication, correction, rejection, and template review each have exactly one control with explicit requirements and consequences.
- Familiar product vocabulary: reuse the existing TradeLinks tokens and admin primitives; state feedback only, CSS-first motion with a `prefers-reduced-motion` fallback.
- Reference qualities: GitHub Review's inspectable diffs and history, Stripe Dashboard's risk/action clarity, Linear's focused information density.

## Accessibility & Inclusion

WCAG AA as the floor: keyboard-operable review controls with visible focus, authenticated access reveals no review data to unauthenticated or unauthorized visitors, all motion limited to state feedback with a `prefers-reduced-motion` fallback, and both existing themes supported across mobile, intermediate, and desktop widths.
