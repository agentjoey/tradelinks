# Task 4 Report — Canonical Changes Experience (canonical-changes-experience)

Worker: Kimi Code (kimi-code/k3) · Reviewer: Claude Opus 5 (fresh context) · Date: 2026-08-02
Contract: `.pact/tasks/phase1-public-intelligence-canonical-changes-experience.md`

## Scope delivered

`/changes` (searchable index, Verified default) and `/changes/[slug]` (canonical permalink) per Surfaces 3/4 of the approved mockup:

- `src/public-intelligence/search.ts` — `parsePublicSearchParams` (safe-default filter vocabulary), `searchPublicChanges` (unindexed Phase 1 scan), `getPublicChangeDetail` (access labels, action-template gate, full published version history), `listExperimentalDemand` + `getDemandCapabilityContext` (the separate demand repository, `product_snapshots`).
- `app/(public)/FilterBar.tsx` — plain GET form (works with JS disabled); native selects/inputs over `signal`, `platform`, `category`, `from`, `to`, `q`.
- `app/(public)/ShareButton.tsx` — `canonicalSharePayload` = `{title, url: permalink}` only; `navigator.share` with clipboard fallback.
- `app/(public)/EvidenceList.tsx` — stable role order (Primary official → Supporting official → Secondary context); RESTRICTED→"Inaccessible — requires seller login, not retrievable", UNAVAILABLE→"Disallowed — terms prohibit automated access", labelled never omitted, never linked.
- `app/(public)/changes/page.tsx` — shell renders immediately; **Suspense inside the page around the results list only** (the loading-skeleton trap; no `loading.tsx` at this segment, asserted in e2e). Scope switcher (`aria-current`), expert-view note, coverage strip, IntelligenceCard reuse, empty state that teaches, demand section held apart with the boundary copy always rendered.
- `app/(public)/changes/[slug]/page.tsx` — facts strip, What changed / Who it hits / Reviewed action template (only with reviewed primary-official evidence AND a reviewed template) / Evidence / Correction history with every published version addressable (`#vN`) / "What this does not tell you" boundary block / aside with permalink, version, readiness, topics, categories, markets, ShareButton. No `Track this change` (owner ruling 2026-08-02; `/onboarding` does not exist). Unknown/unpublished/below-Monitored slug → real 404.
- `app/sitemap.ts` — `/changes` + visibility-gated change permalinks via one lightweight slug-only query with a documented 4.5s degradation budget.
- Tests: `test/public-search.test.ts` (17), `test/canonical-change-page.test.tsx` (14), `test/e2e/public-changes.spec.ts` (4 × 2 projects).

## Three plan corrections honoured

1. **Cursor helper**: `encodeCursor`/`decodeCursor` are exported from query.ts (reviewer-authorised export, round 2 — one implementation, one wire format, so web pagination and the Task 7 API cannot drift) and imported by search.ts. Cross-compatibility stays pinned by tests (a `listPublicChanges` cursor pages `searchPublicChanges`; round-trip decode assertions). No second cursor scheme.
2. **Unindexed search, deliberately**: no `pg_trgm`/FTS index on `CanonicalChangeVersion` (only `items` from migration 0002 has one); no migration added. `q` is a case-insensitive `contains` scan over title/summary. **Published-version row count justifying deferral: 0 current published rows on the non-production branch** (4 during demo, cleaned); canonical changes are curated and low-volume (hundreds, not millions), so a scan is acceptable. **Task 8 owns the index** when measured numbers justify it.
3. **No `Track this change`**: omitted per the owner ruling; no `/subscribe` substitution, no placeholder route. Machine-access links (API v1/RSS) also omitted from the aside (Tasks 6/7 routes don't exist yet — Task 3's dead-link P0 lesson).

## RED / GREEN / REFACTOR (exact commands, exit codes)

- **RED**: `set -a && . ./.env && set +a && pnpm vitest run test/public-search.test.ts test/canonical-change-page.test.tsx` → exit 1 (`Failed to load url ../src/public-intelligence/search.js`; page modules absent; 2 files failed, no tests collected).
- **GREEN**: same command → exit 0, **29/29**. Test-side selector fixes during GREEN (regex collisions: "PUBLISHED" vs "Published versions…", /next/i vs seeded titles, heading-role queries).
- **REFACTOR**: same command rerun unchanged → exit 0. Post-Impeccable refactor (aria-current, sr-only h2, Monitored limit note, version history, touch targets, copy) rerun: exit 0, **31/31**; `pnpm lint` (tsc --noEmit) exit 0 after every change.

## Gates (final, after all fixes)

| Gate | Command | Result |
|---|---|---|
| Targeted | `pnpm vitest run test/public-search.test.ts test/canonical-change-page.test.tsx` | exit 0 — **31/31** |
| Lint | `pnpm lint` | exit 0 |
| Full suite | `pnpm test` | exit 1 — **632 passed / 0 test failures / 7 skipped (639 collected = baseline 608 + 31 new, count not dropped)**; only `test/foundation-backfill.test.ts` fails (file-level; standalone it reproduces exactly the 2 known endpoint-allowlist refusals — the baseline, unrepaired by design). Across four clean-branch full runs the failure set never contained a real regression: two runs flaked random DB suites on Neon connect timeouts, and every one of those tests passed on isolated rerun (55/55 and the exact 2 public-read-model tests), proving transient infra, not code. |
| Build | `pnpm build` | exit 0 — Next 14.2.35; `/changes` + `/changes/[slug]` emitted dynamic |
| E2E | `E2E_PORT=4602 pnpm test:e2e` | exit 0 — **24/24** (incl. `public-changes.spec.ts`: real 404 for unknown slug, no `loading.tsx` above `[slug]`, 200 index + permalink render) |

Sitemap regression note: the first sitemap implementation (listPublicChanges count+page loop, ~7s cold on Neon) timed out public-seo.test.ts's 5s default. Fixed in scope with a single slug-only visibility-gated query (~3.5s cold, ~200ms warm) + 4.5s degradation budget (sitemap serves without change entries rather than hanging; retry on next request). public-seo untouched and green; my own sitemap test pins inclusion/exclusion.

## Impeccable (records persisted)

- `critique`: `.impeccable/critique/2026-08-02T13-52-57Z__app-public-changes-page-tsx.md` — dual-agent (A: agent-0 design review; B: agent-1 detector+browser). **32/40 (Good)**. First run for slug, no trend.
- `audit`: `.impeccable/audit/2026-08-02T13-56-00Z__app-public-task4-changes.md` — **18/20 (Excellent)**.
- **P0 ×0. P1 ×3, all fixed** (no waivers): (1) invalid `aria-pressed` on scope links → `aria-current="page"`; (2) h1→h3 heading skip on /changes → sr-only h2 "Matching changes"; (3) Monitored permalink showed a bare badge → `MONITORED_LIMIT_NOTE` prose block + test.
- Also fixed: mobile touch targets ~32px→~44px (py-2.5/sm:py-1.5), "monitored-or-verified" jargon → "N changes · Monitored included", permalink `break-all`→`break-words`, demo-seed authority hard-code.
- **P2 kept with rationale**: "View vN" self-anchors are the contract's addressability mechanism; versioned public snapshots are Task 7 territory (Task 1 serializer asserts isCurrent).
- **P2 cross-task, not waived**: the 404 page content is the legacy off-shell "wire" page (`app/not-found.tsx`, out of scope). Real 404 status is correct and e2e-locked. Also flagged by Tasks 2/3 — orchestrator visibility requested (Task 9 or scope extension).
- Detector: exit 0 on all five in-scope files, including with config/inline-ignores/design-system disabled. No findings to adjudicate.

## Browser evidence

`design/shots/public-task4/` — **12 PNGs, all sha256-distinct, all status 200, zero horizontal overflow** (script-verified): `/changes` and `/changes/[slug]` × 390/768/1440 × light/dark, final build after all fixes, real seeded content (consent overlay dismissed as a user would). Server `next start` :4601 stopped after the pass.

## Demo data disclosure and cleanup

Non-production branch seeded with run-scoped `task4demo-*` rows (4 published changes, 7 versions, 6 sources + items/clusters/evidence incl. 1 RESTRICTED) mirroring the approved mockup; `demand:amazon-bsr` temporarily EXPERIMENTAL; linked sources' `lastOkAt` refreshed for the strip. Prestore snapshot at `/tmp/task4-prestore.json`. **Cleanup verified: 0 leftover demo rows; all 10 capabilities and linked sources restored to pre-demo values** (`scripts/task4-demo-*.tmp.ts`, deleted after use along with `scripts/task4-shots.tmp.mts`).

## Design decisions recorded

- Filter parse: invalid values dropped (pool falls back to Verified); unknown params never survive into the filter object; an impossible date range narrows to empty, never widens. `from`/`to` filter on `effectiveAt` (the mockup's "Effective date" chip); undated records are excluded while a range is active — narrowing, never widening.
- Experimental demand reads `product_snapshots` (the demand repository) — one row per ASIN, most recent first — rendered only while `demand:amazon-bsr` is EXPERIMENTAL with non-empty gaps (Task 3's `toDemandContext` consumed unchanged). Demand rows carry rank/title/category/observed-date only: no recommendation fields exist in the shape (pinned by test).
- Detail `versionHistory` lists every published version (drafts excluded) with `#vN` anchors — fuller than the DTO's correction-only history, matching the mockup's v1 "First publication" row.
- `AUTHORITY` line derives from the first primary evidence's source name + authority level.

## Rollback notes

Fully additive except `app/sitemap.ts` (revert the two hunks). No schema/migration/env/cloud changes. Demo seed cleaned and prestore-restored. No push, no merge, no branch operations. Temp scripts deleted.

## Prohibited-items attestation

No production/staging deployment; no Neon/Vercel/Railway infra mutation (row-level demo seed on the authorised non-production branch, cleaned); no migration; no `/zh` work; no legacy retirement; no push/merge/reset; no `pactify seat use` (identity from `PACT_AGENT_ID`); no seven-day-P0 claim.

## Could-not-verify disclosures

- Token telemetry: **UNAVAILABLE** (no telemetry exposed to this worker).
- The Neon branch dropped connections five times during the session ("Can't reach database server", ~5s connect timeout, PrismaClientInitializationError), hitting a different random DB suite each time; every affected test passed on isolated rerun. Infra flake, not a code failure — disclosed, not hidden. DB-backed suites were observed to be environment-sensitive during this task; the suite figures in the gates table come from a run on the stabilised configuration (reviewer: `connect_timeout=30` on the Neon pooler, compute warmed with `prisma migrate status` — reproduced 632/7/639 byte-identical).
- Pagination "Next →" rendering is unit-tested (href carries cursor + filters) but not screenshot-verified (demo data had 4 records, one page).
- The 404 *content* (legacy page) is verified present in screenshots only via the e2e status gate, not visually — out of scope to change.

## EFFICIENCY_RECORD

```
feature: phase1-public-intelligence
task: canonical-changes-experience
risk_class: HIGH_RISK (T3 public IA surfaces)
orchestrator_model: claude-opus-5
worker_model: kimi-code/k3
reviewer_model: claude-opus-5
gross_tokens: UNAVAILABLE
cached_input_tokens: UNAVAILABLE
uncached_input_tokens: UNAVAILABLE
output_tokens: UNAVAILABLE
worker_runs: 1 (0 BLOCKED escalations)
reviewer_runs: 0 (pending)
targeted_gate_runs: 11
full_gate_runs: 6 full suites + 5 builds + 2 e2e
impeccable_runs: 1 critique (dual-agent) + 1 audit
blocked_escalations: 0
wall_clock_minutes: ~150
budget_result: PASS
```
