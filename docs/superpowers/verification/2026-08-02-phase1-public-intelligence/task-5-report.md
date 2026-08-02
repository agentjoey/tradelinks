# Task 5 Report — Guides and Briefings (guides-and-briefings)

Worker: Kimi Code (kimi-code/k3) · Reviewer: Claude Opus 5 (fresh context) · Date: 2026-08-03
Contract: `.pact/tasks/phase1-public-intelligence-guides-and-briefings.md`

## Scope delivered

The evergreen guide corpus (locked drafts) and the weekly/monthly/conditional-daily
briefing surfaces, per the contract. The two dominant constraints were honoured as the
spine of the implementation:

1. **The nine guides are drafts that can never publish.** Every guide carries
   `readiness: EXPERIMENTAL`, `reviewedBy: null`, `lastReviewedAt: null`,
   `draftedBy: kimi-code/k3`, `draftedAt: 2026-08-03`, `citationsVerified: false`.
   `publishGuide` throws on each gate condition separately
   (`GUIDE_CITATIONS_UNVERIFIED`, `GUIDE_REVIEWER_REQUIRED`, `GUIDE_REVIEW_DATE_REQUIRED`,
   `GUIDE_REQUIRES_OFFICIAL_SOURCES`, `GUIDE_READINESS_BELOW_MONITORED`), each refusal
   tested separately. `/guides` lists only published guides → in Phase 1 it renders the
   honest-absence state naming the draft count (9) and linking to nothing;
   `/guides/[slug]` returns a real 404 for every draft (e2e-locked). Nothing is imported
   into the `Guide` table by default; `scripts/seed-phase1-guides.ts` validates by default
   (`--check`, exit 0) and `--import` refused all 9 drafts (exit 1, 0 imported, 9 refused —
   verified; `guide` table row count unchanged by it).
2. **Briefings consume Track A through the Foundation `PipelineRun` table ONLY.**
   `generateBriefing` reads the finished `jobType: BRIEFING` run for the period's
   `scopeKey` (`weekly:2026-W31` form), pins `BriefingEntry` rows to the exact ordered
   version IDs in `metadata.changeVersionIds`, and carries `outputFingerprint` onto the
   briefing. No finished run → `NO_QUALIFIED_CONTENT`, no row, no route. Malformed
   metadata (missing IDs array, missing fingerprint, unknown pinned version) throws
   `BRIEFING_RUN_METADATA_INVALID` — the integration contract breaks loudly, asserted
   against seeded rows. No import from, read of, or merge with `feat-phase1-operations`
   (verified: no such import exists anywhere in the diff).

### Files (all inside the contract's scope list)

- `src/public-intelligence/guides.ts` — strict frontmatter parser (no YAML dep; subset
  fully specified in-file), `parseGuideFile`, `publishGateIssues`/`assertPublishable`,
  `validateGuideCorpus` (errors, missingLaunchCategories over **draft** coverage,
  invalidEvidence, publishableSlugs), `publishGuide` (gate enforced in code, not caller),
  `listPublishedGuides`/`getPublishedGuideBySlug` (PUBLISHED only).
- `src/public-intelligence/briefings.ts` — period parsers (ISO week 1-53, month 1-12,
  real dates only; hostile input → null), `briefingScopeKey`/`briefingPath`,
  `generateBriefing`, `publishBriefing` (one review event; republish throws),
  `getPublishedBriefing`/`listPublishedBriefings`. Daily threshold per Owner Decision 5:
  ≥3 qualified (Monitored|Verified) incl. ≥1 Verified, else `NO_QUALIFIED_CONTENT` and
  no route. Pinned versions serialize through a local mapper that deliberately omits the
  public visibility assertion — a briefing is a historical record and must keep rendering
  what Operations pinned even after a forward-only correction; the canonical gate still
  applies to the `/changes` pages the cards link to. Correction guard: a published
  briefing is never rewritten — regeneration throws `BRIEFING_ALREADY_PUBLISHED` (a
  correction is a new fingerprint and a new review event).
- `scripts/seed-phase1-guides.ts` — `--check` (default) / `--import`.
- `content/guides/` — nine drafts (word counts, body only): us-market-entry-basics 1704,
  amazon-us-selling-basics 1758, shopify-us-selling-basics 1710,
  consumer-electronics 1542, pet-supplies 1796, beauty-personal-care 1516,
  toys-childrens-products 1774, home-kitchen 1617, apparel-accessories 1797.
  All 900–1,800, all seven required sections, ≥2 official source records each
  (3–8 official per guide).
- `app/(public)/ReportCard.tsx` — ReportCard + shared BriefingPeriodView.
- `app/(public)/guides/page.tsx` — index; honest-absence with live draft count from the
  corpus; error state is distinct from absence (read failure renders
  `StatePanel state="error"`, never the absence copy).
- `app/(public)/guides/[slug]/page.tsx` — published guides only; everything else a real
  404. GuideBody renders the validated body subset (## sections, paragraphs, lists).
- `app/(public)/briefings/page.tsx` — index; same error-vs-absence separation.
- `app/(public)/briefings/weekly/[year]/[week]/page.tsx`, `monthly/[year]/[month]/page.tsx`,
  `daily/[date]/page.tsx` — strict period parsing; unknown/out-of-range/unpublished/
  below-threshold → real 404.
- `app/sitemap.ts` — `/briefings` index + PUBLISHED briefing periods only. No draft
  guides, no empty periods, `/guides` deliberately not a crawl target while zero guides
  are published.
- `test/guides-briefings.test.ts` (29 tests) — corpus lock (9 drafts, zero publishable,
  six launch categories covered as drafts), each publish refusal separately, happy-path
  publish to DB, PipelineRun integration contract (ordered pins, fingerprint, loud
  metadata failures, scope mismatch), daily threshold (3 cases), publish/correction
  guards, read path ordering, sitemap inclusion/exclusion.
- `test/e2e/public-briefings.spec.ts` (9 tests × 2 projects) — no `loading.tsx` above
  guides/briefings; unknown guide slug → 404; draft guide slug → 404; out-of-range week →
  404; below-threshold daily → 404; unpublished period → 404; `/guides` 200 with the
  honest-absence state; `/briefings` 200; valid seeded weekly period → 200 with pinned
  entry, evidence and fingerprint rendered.

**Zero guides pass the publish gate** — asserted by
`expect(report.publishableSlugs).toEqual([])` with `guideCount === 9`, and by a per-guide
loop calling `publishGuide` against the real corpus (each rejects with `^GUIDE_`).

## RED / GREEN / REFACTOR (exact commands, exit codes)

- **RED**: `set -a && . ./.env && set +a && pnpm vitest run test/guides-briefings.test.ts test/daily-note.test.ts`
  → vitest exit 1 (`Failed to load url ../src/public-intelligence/guides.js`; suite not
  collected; daily-note 16/16 passed).
- **GREEN**: same command → exit 0, **45/45** after modules + corpus + sitemap (one
  intermediate failure: `Briefing.bodyMarkdown` required — now generated deterministically
  from the summary and pinned entry titles).
- **REFACTOR**: same command rerun unchanged → exit 0, **45/45**. Post-Impeccable fixes
  (error-state separation, dedup, type hygiene) followed by the same command again → exit
  0, **45/45**; `pnpm lint` (tsc --noEmit) exit 0 after every change.
- Seed gate: `pnpm tsx scripts/seed-phase1-guides.ts --check` → exit 0 (corpus valid,
  0/9 publishable as expected). `--import` → exit 1 by design (0 imported, 9 refused).

## Gates (final, after all fixes)

| Gate | Command | Result |
|---|---|---|
| Warm compute | `pnpm exec prisma migrate status` | "Database schema is up to date!" |
| Seed check | `pnpm tsx scripts/seed-phase1-guides.ts --check` | exit 0 |
| Targeted | `pnpm vitest run test/guides-briefings.test.ts test/daily-note.test.ts` | exit 0 — 45/45 |
| Targeted (post-fixture-fix) | `pnpm vitest run test/guides-briefings.test.ts` | exit 0 — 29/29 |
| Lint | `pnpm lint` | exit 0 |
| Build | `pnpm build` | exit 0 — all six new routes emitted dynamic |
| E2E | `E2E_PORT=4606 pnpm test:e2e` | exit 0 — **42/42** (all nine Task 5 status assertions × 2 projects) |
| Full suite | `pnpm test` | exit 1 — 6 baseline-set failures in 6 consecutive runs → escalated; **resolved by scope extension, see below** |

## The cross-suite readiness race — escalation and resolution

**Escalation (upheld).** With `test/guides-briefings.test.ts` present, `pnpm test`
failed the same 4 tests beyond baseline in 6 of 6 consecutive full runs (668 collected
= baseline 639 + 29 new; 65 files = 64 + 1 — no drop): `public-hubs > getHub content`
×3 and `coverage-readiness > seedPhase1Coverage` ×1. Root cause: a pre-existing
cross-suite race — `coverage-readiness.test.ts`'s `refreshCapabilityReadiness` test
recomputes EVERY stored `CoverageCapability` row and persists STALE transitions;
`public-hubs`' "getHub content" fixture is a capability with an always-overdue source,
so an overlapping refresh flipped it to STALE and `getHub` returned null. The seed
invariant failed because it swept `startsWith: "category:"`, catching other suites'
run-scoped fixtures mid-creation/mid-deletion. Proof it was not my code: the baseline
file set (my suite excluded) ran clean today (637 passed / only foundation-backfill
failing); every failing suite passed in isolation; my suite never touches
`coverageCapability` and all its rows are run-scoped. Escalated with BLOCKED instead of
guessing; the reviewer reproduced the identical failure set twice and granted a scope
extension (contract §"Scope extension — the cross-suite readiness race").

**Fix (test files only, per the ruling; no `src/**` changes, no vitest.config change).**

1. PRIMARY — `test/public-hubs.test.tsx`: the "getHub content" capability's sources are
   no longer overdue at the recompute clock. `okSource` SLA 720→2880 (still ≥ the 360
   the min-SLA assertion reads); `overdueSource` `lastOkAt: null` →
   `2026-07-26T08:00:00Z` — not overdue at the refresh test's clock (2026-07-26T12:00Z),
   still long overdue at this file's fixture clock (2026-08-02T12:00Z), which is all the
   overdue-display assertions need. Hazard named in a comment.
2. SECONDARY — `test/coverage-readiness.test.ts`: the `refreshCapabilityReadiness`
   describe snapshots every capability's readiness before the global recompute and
   restores it in `finally` (`updateMany`, so rows a parallel suite deleted mid-run are
   skipped). The seed invariant now asserts the six Phase 1 contract keys
   (`key: { in: categoryKeys }`) instead of `startsWith: "category:"`. Hazard named in
   comments.
3. Explicitly not done (not authorised): `fileParallelism: false` / pool caps.

**Standing rule for Tasks 6–9** (recorded per the ruling): any test invoking a
function that recomputes or refreshes ALL rows of a shared table must snapshot and
restore that table (in `try`/`finally`), and no fixture may depend on shared state such
a function can rewrite.

**Verification.** Modified suites isolated: 44/44. Full suite TWICE after the fix —
see the gate table below; both runs must show only the 2 foundation-backfill baseline
failures.

## Gates (final, after race fix)

| Gate | Command | Result |
|---|---|---|
| Full suite run 1 | `pnpm test` | exit 1 — **666 passed / 2 failed (only `foundation-backfill`, the baseline), 668 collected, 64/65 files** |
| Full suite run 2 | `pnpm test` | exit 1 — **identical: 666 passed / 2 failed (only `foundation-backfill`), 668 collected, 64/65 files** |

## Impeccable (records persisted)

- `critique`: `.impeccable/critique/2026-08-02T18-23-34Z__app-public-guides-and-briefings-task5.md`
  — dual-agent (A: agent-9 design review; B: agent-10 detector+browser overlay).
  **32/40 (Good)**. First run for this slug, no trend.
- `audit`: `.impeccable/audit/2026-08-03T02-30-00Z__app-public-task5-guides-briefings.md`
  — **19/20 (Excellent)**.
- **P0 ×0. P1 ×1, fixed**: error→empty conflation on both indexes — a DB failure would
  have rendered the honest-absence copy ("we do not manufacture volume"), the one lie
  the product is forbidden from telling. Both indexes now render
  `StatePanel state="error"` on read failure; absence copy only after a successful
  zero-row query.
- Also fixed: count-only briefing summaries (now lead with up to two pinned entry
  titles), duplicated published-date/fingerprint/breadcrumb facts, breadcrumb
  `aria-current` naming the period, ~34px touch targets on /guides CTAs (now the Task 4
  `py-2.5 sm:py-1.5` pattern), empty per-record fingerprint on pinned versions (now the
  canonical sha256 scheme), `as any` readiness casts (DTOs type `ReadinessLevel`).
- **P2 kept with rationale**: no prev/next period navigation (archive length is one
  period; prev/next against a non-existent archive manufactures affordances that 404);
  GuideBody's markdown subset (unreachable while zero guides are published; first publish
  is a human review event that owns the rendering check).
- Detector: CLI exit 0 on all 7 in-scope UI files (probe-verified). Overlay findings were
  out-of-scope files (PublicNav 9px ticker, PublicFooter caps tagline) or adjudicated
  false positives (cream `--c-bg` documented token; `nested-cards` = accepted Monitored
  limit prose; `text-occlusion` = the overlay's own label). No detector-driven changes.

## Browser evidence

`design/shots/public-task5/` — **12 PNGs, all sha256-distinct, all status 200, zero
horizontal overflow** (script-verified): `/guides` (honest-absence state) and
`/briefings/weekly/2026/31` × 390/768/1440 × light/dark, final production build after all
fixes, real seeded demo content (consent overlay dismissed as a user would). Spot-checked
visually: absence copy + weighted primary CTA; subject-led summary, fingerprint meta
strip, Monitored limit prose, dark theme at 390.

## Demo data disclosure and cleanup

Non-production branch seeded with `task5demo-*` rows: 3 published changes (2 Verified,
1 Monitored) + sources/items/clusters/evidence, 1 BRIEFING PipelineRun for
`weekly:2026-W31`, 1 published Briefing + 3 pinned entries. Cleanup via
`scripts/task5-demo-cleanup.tmp.ts` (cleanup verified: `guideRows: 0, briefingRows: 0,
briefingRuns: 0, demoChanges: 0` — the Guide table holds zero non-test rows). Temp scripts
`scripts/task5-demo-{seed,cleanup}.tmp.ts` and `scripts/task5-shots.tmp.mjs` deleted after
use. Server `next start` :4605 stopped after the pass.

## Design decisions recorded

- `metadata.changeVersionIds` is the ordered-pin contract key (the plan's own test
  example); scope keys are `kind:periodKey`; period keys are `2026-W31` / `2026-07` /
  `2026-08-03`. All pinned by unit tests.
- "Finished" = `status SUCCEEDED_ITEMS` + `finishedAt != null`; `SUCCEEDED_EMPTY`,
  `RUNNING`, `FAILED`, `PARTIAL` → `NO_QUALIFIED_CONTENT`. Empty pins are impossible by
  construction (metadata must be a non-empty array).
- Daily threshold counts pinned versions whose persisted readiness is MONITORED|VERIFIED
  (≥3) with ≥1 VERIFIED — Decision 5's plain language.
- Draft briefings are mutable on regenerate (entries replaced); published briefings are
  immutable — regeneration throws, because a correction is a new fingerprint and a new
  review event, never an edit.
- Briefing readiness rolls up as VERIFIED only when every pinned entry is Verified,
  else MONITORED (weakest-entry rule, matching the card-level vocabulary).
- The corpus lives in `content/guides/` as Markdown with a strict frontmatter subset
  (scalars, inline arrays, one `sources:` block list) — no YAML dependency added.
- Guide evidence `Source` rows are find-or-create by URL at publish time (the happy path
  is exercised only by tests in Phase 1).

## Rollback notes

Fully additive except `app/sitemap.ts` (revert the briefing hunks). No schema/migration/
env/cloud changes. Demo seed cleaned. No push, no merge, no branch operations. Temp
scripts deleted. `/private/tmp` never used (worktree moved per contract).

## Prohibited-items attestation

No production/staging deployment; no Neon/Vercel/Railway infra mutation (row-level demo
seed on the authorised non-production branch, cleaned); no migration; no `/zh` work; no
legacy retirement; no `0014`; no push/merge/reset; no `pactify seat use` (identity from
`PACT_AGENT_ID`); no seven-day-P0 claim; **no published guide** — the Guide table holds
zero non-test rows; no guide was imported.

## Could-not-verify disclosures

- Token telemetry: **UNAVAILABLE** (no telemetry exposed to this worker).
- Guide citations: all nine drafts cite only instruments nameable exactly (CFR parts,
  U.S.C. sections, named statutes, named agency policy statements) at agency-root or
  stable eCFR URLs, but **no URL was fetched and no citation was verified against a live
  source** — that is exactly what `citationsVerified: false` records. Sub-drafters
  disclosed their uncertainty per file; specific figures they could not source precisely
  were replaced with the literal `[UNVERIFIED — confirm at source]` placeholder (counts
  per guide: market-entry 3, electronics 4, pet 5, home-kitchen 3, apparel several;
  beauty/shopify/amazon/toys used prose confirmation caveats for the few widely-published
  figures such as the CPSIA 100 ppm lead limit). A human review pass remains mandatory
  before any publication — by construction, not just by policy.
- The weekly 2026-W31 demo briefing used example.com evidence URLs (demo data, cleaned);
  it was never a real qualification output.

## EFFICIENCY_RECORD

- 9 guide drafts parallelized via one AgentSwarm call (9 subagents), each self-verifying
  word count and structure; zero rewrites needed after `--check`.
- Critique dual-agent (A ∥ B) in one message; demo seed + one server reused for critique
  browser evidence and final screenshots.
- public-hubs full-suite flake resolved by isolated rerun instead of blind re-runs.
