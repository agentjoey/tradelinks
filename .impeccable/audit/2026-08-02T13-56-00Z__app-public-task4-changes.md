# Audit — Task 4 canonical changes experience (/changes + /changes/[slug])

Target: `app/(public)/changes/page.tsx`, `app/(public)/changes/[slug]/page.tsx`, `FilterBar`, `EvidenceList`, `ShareButton`, `app/sitemap.ts` · Date: 2026-08-02 · Dual-agent critique record: `.impeccable/critique/2026-08-02T13-52-57Z__app-public-changes-page-tsx.md`.

## Audit Health Score — 18/20 (Excellent)

| # | Dimension | Score | Key Finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 3 | All critique P1s fixed (aria-current scope state, h1→h2→h3 order, Monitored limit prose); touch targets raised to ~44px on mobile. Tab-1-on-BODY observed in headless Chromium only — harness artefact, no tabindex anywhere; skip link is first focusable (Task 2 e2e lock). |
| 2 | Performance | 4 | SSR with a single Suspense island per list; zero images; page JS ≤ 1 kB over the shared 87 kB baseline; search is a deliberately unindexed scan (Phase 1 decision, Task 8 owns the index; 0 published rows on this branch today). |
| 3 | Responsive Design | 4 | 0px horizontal overflow at 390/768/1440 on both routes, both themes (script-verified, 12 shots); filters wrap structurally; aside stacks below content on mobile. |
| 4 | Theming | 4 | Semantic tokens only; both themes screenshot-verified; readiness never colour-only. |
| 5 | Implementation Integrity | 4 | Detector: 0 findings on all five in-scope files (exit 0, including with config/ignores/design-system disabled). Reuses the accepted IntelligenceCard/StatePanel/ReadinessBadge; no parallel component system. |

## Detailed Findings

- **[P2] Legacy off-shell 404 page** — `app/not-found.tsx` (out of scope). Real 404 status is correct and e2e-locked (`test/e2e/public-changes.spec.ts`), but the rendered page is the rejected "wire" design with no public shell and no path back to /changes. Cross-task debt, **not waived**; Tasks 2/3 flagged related instances. Suggested owner: Task 9 (legacy retirement) or an orchestrator-approved scope extension.
- **[P2] "View vN" correction-history links are self-anchors** — kept with rationale: anchors provide the contract's "every prior version addressable"; versioned public snapshots are Task 7 territory (the Task 1 serializer asserts isCurrent). Re-check at Task 7.
- **[P3] Evidence host keeps `www.` prefix** — matches the accepted IntelligenceCard behaviour; cosmetic only.

## Positive Findings

- Real 404 status with no loading boundary above [slug] — the loading-skeleton trap is avoided by construction and locked by an e2e status gate plus a file-absence assertion.
- Empty state teaches the surface; restricted evidence is labelled, never omitted, never linked.
- Filter state is a plain GET form — full workflow works with JavaScript disabled.
- Sitemap emits only visibility-gated permalinks, with a documented 4.5s degradation budget instead of a hang.

## Recommended Actions

1. [P2] Cross-task: route the legacy `app/not-found.tsx` shell debt to the orchestrator (Task 9 or scope extension).
2. [P2] `$impeccable polish` at Task 7 when versioned snapshots exist: upgrade #vN anchors to real version URLs.
