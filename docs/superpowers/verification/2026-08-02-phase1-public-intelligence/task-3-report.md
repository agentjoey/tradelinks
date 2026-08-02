# Task 3 Report — Readiness-Gated Hubs (readiness-gated-hubs)

Worker: Kimi Code (kimi-code/k3) · Reviewer: Claude Opus 5 (fresh context) · Date: 2026-08-02
Contract: `.pact/tasks/phase1-public-intelligence-readiness-gated-hubs.md` (incl. two orchestrator scope-extension rulings, both escalated by the worker and approved).

## Scope delivered

Hub layer per contract: `src/public-intelligence/coverage.ts` (readiness-gated `getHub`/`getTopicHub`/`getCoverageMatrix`/`listTopicSummaries`, `canRenderHub`, `toDemandContext`, risk→topic map), `ReadinessBadge`, `IntelligenceCard` (+`CompactChangeRow`, `GuideCard`, `MONITORED_LIMIT_NOTE`), `CoveragePanel`, routes `/us` `/amazon-us` `/shopify-us` `/categories` `/categories/[category]` `/topics` `/topics/[topic]` `/coverage`, home wired to the real read model, sitemap eligibility, `vitest.config.ts` dotenv line, tests `test/public-hubs.test.tsx` + `test/public-seo.test.ts` + `test/e2e/public-hubs.spec.ts`, and exactly three re-aimed tests in `test/public-shell.test.tsx` (ruling #1). `app/(public)/loading.tsx` deleted (ruling #2). No `Track this category` anywhere (owner ruling 2026-08-02).

## Two escalations (BLOCKED → ruled)

1. **public-shell.test.tsx home tests.** Wiring Home (async, real data) necessarily broke 3 accepted Task 2 tests asserting the specimen home; the file was outside scope. Orchestrator approved Option A: re-aim exactly those three tests, with the condition that the readiness-word/evidence-inline invariant stays loud. Per-test disposition:
   - `renders exactly one h1` — guarded one-h1 structure; now `render(await Home())`, same assertion, same guarantee.
   - `does not carry the BL-045 liveness choreography` — guarded absence of liveness classes; same assertion against the awaited wired Home.
   - `shows readiness as literal words with evidence inline` — guarded the DESIGN.md invariant (readiness never colour-only; evidence inline with its conclusion). Now asserted deterministically against `IntelligenceCard` fixtures (the component Home and every hub render): literal `Verified`/`Monitored` words and two inline evidence blocks. No DB dependence; fails loudly if the words or inline evidence are ever removed.
2. **Soft-404 on gated routes.** `(public)/loading.tsx` (Task 2 file, out of scope) forced a soft-200 with `NEXT_NOT_FOUND` inline on every gated 404 (A/B-verified, same build). Orchestrator approved deletion and required an e2e status gate: `test/e2e/public-hubs.spec.ts` asserts real HTTP status (below-Monitored category → 404, unsupported topic → 404, /amazon-us → 200 with content). **Load-bearing vs belt-and-braces (isolated by experiment):** the loading.tsx deletion alone carries the 404 status — verified by rebuilding without `force-dynamic` and without metadata `notFound()` and still getting real 404s. `force-dynamic` and `generateMetadata notFound()` are belt-and-braces (the latter also keeps a hub fallback title off the 404 page). **Owed by Tasks 4 and 5:** per-surface loading skeletons that preserve each surface's heading structure; a `loading.tsx` must never sit above a readiness-gated route.

## RED / GREEN / REFACTOR (exact commands, exit codes)

- **RED**: `set -a && . ./.env && set +a && pnpm vitest run test/public-hubs.test.tsx test/public-seo.test.ts` → exit 1. `Failed to resolve import "../src/public-intelligence/coverage.js"`; hub pages absent; sitemap/metadata/revalidate assertions failing (4 tests, both files).
- **GREEN**: same command → exit 0, **33/33**. Fixes during GREEN inside new files only: import-depth corrections, matrix test excluding its own deliberately-noncompliant fixture, multi-match assertions scoped.
- **REFACTOR**: same command rerun unchanged → exit 0, 33/33. Post-Impeccable refactor (slice de-dup, limit notes, home metadata, glossary) rerun: `pnpm vitest run test/public-hubs.test.tsx test/public-seo.test.ts test/public-shell.test.tsx` → exit 0, **53/53**.

## Gates (final, after all fixes)

| Gate | Command | Result |
|---|---|---|
| Targeted | `pnpm vitest run test/public-hubs.test.tsx test/public-seo.test.ts` | exit 0 — 33/33 |
| Lint | `pnpm lint` (tsc --noEmit) | exit 0 |
| Full suite | `pnpm test` (dotenv via setupFiles; **no manual export**, proving the config change) | exit 1 — **606 passed / 2 failed of 608**; failure set = the 2 known foundation-backfill endpoint-allowlist refusals only (baseline 573/575 + 33 new) |
| Build | `pnpm build` | exit 0 — Next 14.2.35; all nine new routes emitted (dynamic) |
| E2E | `E2E_PORT=4602 pnpm test:e2e test/e2e/public-intelligence.spec.ts test/e2e/public-hubs.spec.ts` | exit 0 — **16/16** (10 shell + 6 hub-status incl. real-404 lock) |

Concurrency hygiene (shared branch): run-scoped fixtures carry a compliant linked source and old fixed `reviewedAt` (2026-07-10, below every other suite's 2026-07-20), and the one deliberately noncompliant fixture self-deletes immediately — verified `public-hubs` + `coverage-readiness` together 44/44, and `public-hubs` + `public-read-model` together 78/78.

## Impeccable (records persisted)

- `critique`: `.impeccable/critique/2026-08-02T10-58-28Z__app-public-amazon-us-page-tsx.md` — dual-agent (A: agent-0 design review, B: agent-1 detector+browser). 25/40 (Acceptable). First run for slug, no trend.
- `audit`: `.impeccable/audit/2026-08-02T11-02-00Z__app-public-task3-hubs.md` — **18/20 (Excellent)**.
- **P0 ×1: dead links to unshipped Task 4–6 routes** (`/changes/*`, `/guides`, `/briefings`, feeds). Not fixable in Task 3's file scope (routes are Tasks 4/5/6; nav is the accepted Task 2 shell; the binding mockup ships these links). Recorded as cross-task debt, **not waived** — must be re-checked at Task 4 acceptance.
- **P1 ×2, both fixed:** (1) Monitored cards outside /amazon-us rendered a bare badge → every Monitored card now states the definitional limit sentence (`MONITORED_LIMIT_NOTE`), amazon-us keeps its persisted login-wall sentence; (2) home `<title>`/description were the old product ("Real-time … 6 regions") → `(public)/page.tsx` exports Phase 1 metadata. Also fixed: slice de-dup (one rendering per record per page), coverage glossary now defines all five readiness words, mobile coverage rows regained the "last check" label.
- **P1 flagged, outside scope, not waived:** legacy GA consent banner (`app/components/Analytics.tsx`) overlays content at 390px with an off-scale `z-40` — same finding Task 2 flagged to the Human Owner.
- Detector: CLI exit 0; overlay 26 findings verified false positives (approved `.ticker` micro-type, paper token, advisory em-dash rule; `nested-cards` = approved in-card coverage-limit note).

## Browser evidence

`design/shots/public-task3/` — **36 PNGs, all sha256-distinct, all status 200, zero horizontal overflow** (script-verified): `/amazon-us`, `/categories/home-kitchen`, `/coverage`, `/us`, `/`, `/topics/fees-payments` × 390/768/1440 × light/dark, final build **after** all fixes, real seeded content (consent overlay dismissed as a user would). Servers: `next start` :4601 (stopped), playwright webServers self-stopped.

## Demo data disclosure and cleanup

For Impeccable/screenshots the non-production branch was seeded with run-scoped (`task3demo-*`) demo rows (6 published changes + 1 guide + sources/items/clusters/evidence), six capabilities temporarily set to demo readiness (incl. `platform:amazon-us` MONITORED per the owner ruling) and linked sources given recent `lastOkAt`. Snapshot taken beforehand; **cleanup verified: 0 leftover demo rows, all 10 capabilities and 19 sources restored to pre-demo values.** Demo `reviewedAt` was fixed to 2026-07-10 so a full `pnpm test` stays green with demo data present (verified: run 6 = baseline-only failures). Scripts lived in `/tmp` (no repo files). The e2e spec's own save/restore of `platform:amazon-us`/`category:pet-supplies` readiness is best-effort under parallel browser projects; final state was set by the explicit cleanup restore.

## Design decisions recorded

- `RISK_TO_TOPIC` mapping (risk→closest explicit topic; exact label kept as `?risk=` filter): safety-like attributes → Product Safety & Recalls; `TOPICAL_COSMETIC`, `MEDICAL_CLAIM`, `TEXTILE_LABELING` → Labeling & Claims. Topic support: ≥3 published Monitored/Verified changes, or 1 published guide (risk-mapped) + 1 current published change.
- Hub eligibility is data-driven from `CoverageCapability` (a category hub exists iff its capability row exists and renders) — no parallel static list; `/categories`, `/topics` and the sitemap derive from the same source.
- Empty known-gaps on a renderable-readiness capability ⇒ hub hidden (a bug, not a clean bill of health). Seeded-never-reviewed (`lastReviewedAt` epoch) renders as "never reviewed", not a date.
- Platform hubs omit a separate "Platform considerations" section (the hub is the platform consideration; the plan's section list is written for category hubs); federal requirements on platform hubs are platform-less records by construction.
- Home briefing block queries the latest published briefing; absence renders honest copy (no fabricated Week-31 specimen remains).

## Rollback notes

Fully additive except: home rewrite (revert `app/(public)/page.tsx`), sitemap additions (revert `app/sitemap.ts`), loading.tsx deletion (restore from git), vitest setupFiles line (one-line revert), three re-aimed shell tests (revert file). No schema/migration/env/cloud changes. Demo seed cleaned and snapshot-restored. No push, no merge, no branch operations.

## Prohibited-items attestation

No production/staging deployment; no Neon/Vercel/Railway infra mutation (row-level demo seed on the authorised non-production branch, cleaned); no schema change; no `/zh` work; no legacy retirement; no `0014`; no push/merge/reset/branch deletion; no `pactify seat use`; no seven-day-P0 claim.

## Could-not-verify disclosures

- Token telemetry: **UNAVAILABLE** (no telemetry exposed to this worker).
- `/changes`, `/guides`, `/briefings`, feeds 404 by design at this stage (Tasks 4–6); card-title links therefore dead-end today (P0 cross-task debt, above).
- The consent-banner P1 is verified visually in screenshots but not fixable in scope.
- `categories/page.tsx` and `topics/page.tsx` index states for below-Monitored categories are covered by unit tests; screenshots capture the indices only incidentally (not in the contract's minimum set).

## EFFICIENCY_RECORD

```
feature: phase1-public-intelligence
task: readiness-gated-hubs
risk_class: HIGH_RISK (T3 public IA hubs)
orchestrator_model: claude-opus-5
worker_model: kimi-code/k3
reviewer_model: claude-opus-5
gross_tokens: UNAVAILABLE
cached_input_tokens: UNAVAILABLE
uncached_input_tokens: UNAVAILABLE
output_tokens: UNAVAILABLE
worker_runs: 1 (2 BLOCKED escalations, both ruled)
reviewer_runs: 0 (pending)
targeted_gate_runs: 6
full_gate_runs: 7 (incl. failure-set diffs) + 8 builds + 3 e2e
impeccable_runs: 1 critique (dual-agent) + 1 audit
blocked_escalations: 2 (both approved with conditions, both conditions implemented)
wall_clock_minutes: ~230
budget_result: PASS
```
