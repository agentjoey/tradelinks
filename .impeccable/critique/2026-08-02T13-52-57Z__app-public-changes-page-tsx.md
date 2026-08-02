---
target: app/(public)/changes/page.tsx (+[slug])
total_score: 32
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
timestamp: 2026-08-02T13-52-57Z
slug: app-public-changes-page-tsx
---
# Critique — /changes index + /changes/[slug] detail (Task 4)

Method: dual-agent (A: agent-0 design review · B: agent-1 detector+browser evidence)

## Design Health Score — 32/40 (Good)

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Coverage strip + structure-preserving skeletons excellent; active scope state was invisible to AT (fixed: aria-current) |
| 2 | Match System / Real World | 3 | Plain-language readiness throughout; "monitored-or-verified" jargon (fixed) |
| 3 | User Control and Freedom | 3 | GET-form filters, Clear filters, shareable URLs |
| 4 | Consistency and Standards | 3 | Card anatomy holds; legacy off-shell 404 page (cross-task debt) |
| 5 | Error Prevention | 3 | Hostile params fail safe to Verified |
| 6 | Recognition Rather Than Recall | 4 | Filters echo values, literal readiness words, countdowns |
| 7 | Flexibility and Efficiency | 3 | Keyboard-complete, no-JS filtering works |
| 8 | Aesthetic and Minimalist Design | 4 | Restrained; colour strictly semantic |
| 9 | Error Recognition and Recovery | 3 | Real 404 + exemplary empty states; 404 page content is legacy |
| 10 | Help and Documentation | 3 | Help embedded where needed (excludes copy, held-apart, boundary block) |

## Design Specificity Verdict

Genuinely authored for an evidence-traceable public record — evidence-inline card anatomy, held-apart experimental section with the non-promise restated in prose, coverage status strip, forward-only correction copy. No generic template makes these choices. Detector: 0 findings on all five in-scope files (exit 0, also with config/inline-ignores/design-system disabled) — previously approved false-positive patterns (.ticker, paper token, in-card note, em-dash) correctly non-firing.

## What's Working

- The empty state: "an absence, not a gap in this filter" + three calibrated exits (Include Monitored / Clear filters / See what we watch).
- Evidence access honesty at row level: login-walled sources render INACCESSIBLE, unlinked, never dressed up as retrievable.
- Focus and no-JS discipline: skip link first focusable stop, visible 2px signal focus ring everywhere, plain GET form, readiness never colour-only.

## Priority Issues (with dispositions)

- [P1] aria-pressed on scope Links (invalid ARIA; active scope unannounced) — FIXED: aria-current="page" on the active scope link; e2e + unit assertions updated.
- [P1] /changes heading order skipped h1→h3 (WCAG 1.3.1) — FIXED: sr-only h2 "Matching changes" leads the results section; card h3s now sit under it.
- [P1] Monitored permalink stated no limit (bare badge; DESIGN.md §Card anatomy) — FIXED: MONITORED_LIMIT_NOTE bordered prose under the facts strip; test added.
- [P2] "View vN" links are self-anchors — KEPT with rationale: anchors are the addressability mechanism the contract requires; real versioned snapshots (?v=N) are Task 7 API territory — the Task 1 serializer asserts isCurrent, so public old-version rendering is out of scope.
- [P2] 404 page is the legacy off-shell "wire" page — CROSS-TASK DEBT, not waived: app/not-found.tsx is outside this task's file scope; the contract's requirement (real 404 status) is met and e2e-locked. Orchestrator visibility requested (also flagged by Tasks 2/3).
- [P2] Filter/scope touch targets ~32px at 390px — FIXED: py-2.5 on mobile, sm:py-1.5 on desktop.
- [P2] "SHOWING N monitored-or-verified changes" jargon — FIXED: "N changes · Monitored included".
- [P3] Permalink mid-word break-all in the aside — FIXED: break-words + overflow-wrap:anywhere.
- [P2] Demo seed hard-coded GOVERNMENT_OFFICIAL authority — FIXED: evidence authority now comes from the source row; re-seeded.

## Persona Red Flags

- Jordan: Monitored permalink previously carried no caveat (fixed); 404 gives no path back to /changes (cross-task).
- Sam: active scope previously unannounced (fixed); heading skip fixed. Focus rings, skip link, literal readiness words, labelled controls pass.
- Riley: ?pool=draft coerces silently to Verified (safe default, contract-mandated); unknown slug real 404.

## Minor Observations

- Role vocabulary differs by surface ("Primary" on cards vs "Primary official" in EvidenceList) — the long form is pinned by the plan's test; recorded, deliberate.
- Experimental demand rows render raw untruncated Amazon titles — honest data, accepted.
- Tab-1-lands-on-BODY in headless Chromium; no tabindex in the codebase — harness artefact, skip link is first focusable (e2e-locked by Task 2).

## Questions to Consider

1. When Task 7 ships versioned snapshots, should #vN anchors upgrade to ?v=N URLs?
2. Should the sitemap/index disclose the 4.5s degradation budget anywhere public?
3. Does the 404 page belong to Task 9 (legacy retirement) or an earlier shell task?
