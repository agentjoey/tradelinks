# Public Intelligence Task 5 — Guides and Briefings

## Context

Implement Task 5 from `docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md`.

Tasks 1–4 are accepted. You have the read contract, the public shell, the hub layer, and
the canonical changes experience. This task adds the evergreen guide corpus and the
weekly/monthly/conditional-daily briefing surfaces.

`DESIGN.md` is binding. There is no mockup surface for guides or briefings — the approved
mockup covers home, hub, changes, detail and coverage. Derive these two surfaces from the
established system: `IntelligenceCard` anatomy, readiness as a literal word, evidence inline
with its conclusion, non-empty known gaps, honest absence over manufactured volume. Do not
invent a new visual language.

## The worktree moved

This branch is now checked out at `/Users/xtation/AgentWorks/worktrees/tradelinks-phase1-public-intelligence`.
The previous `/private/tmp` location was deleted by macOS temp cleanup on 2026-08-03. Do not
recreate anything under `/private/tmp`, and do not put irreplaceable output there.

## Models

- Worker: **Kimi Code, `kimi-code/k3`** (pact role `kimi-k3-worker`).
- Reviewer: **Claude Code, `claude-opus-5`** (pact role `claude-opus5-reviewer`), fresh context.

A worker never self-accepts. If the worker model is unavailable, stop and get owner approval.

## Owner decisions

**Decision 5 — conditional daily threshold. Approved as the plan recommends:** a daily
briefing requires at least three qualified changes including at least one Verified.
Otherwise `generateBriefing` returns `NO_QUALIFIED_CONTENT` and **no route is created** —
not an empty page, not a "nothing today" stub with a URL. Absence is more trustworthy than
manufactured volume.

**Guides are drafted but never published in Phase 1.** The Human Owner ruled on 2026-08-03
that the nine-guide corpus is authored as drafts only. This is the single most important
constraint in this task; read the next section before writing a word of guide content.

## Guides: drafted, structurally complete, and unpublishable by construction

You are writing US regulatory guidance. You cannot verify a citation resolves, you are not a
compliance reviewer, and `PRODUCT.md` says *persisted or unavailable, never invented* and
forbids legal advice. Guides are the most authoritative-looking surface the product has. A
plausible-but-wrong CFR reference on a public page would discredit every honest thing the
other four tasks built.

So the corpus ships **locked**:

- Every guide's frontmatter carries `readiness: EXPERIMENTAL`, `reviewedBy: null`,
  `lastReviewedAt: null`, `draftedBy: "kimi-code/k3"`, `draftedAt: <ISO date>`, and
  `citationsVerified: false`.
- `publishGuide` **must throw** for any guide with `citationsVerified: false`, a null
  `reviewedBy`, a null `lastReviewedAt`, fewer than two official source records, or
  readiness below `MONITORED`. Test each refusal separately.
- `/guides` lists only published guides. In Phase 1 that set is empty, so the index renders
  the honest-absence state: say that the corpus is drafted and awaiting human review, name
  how many drafts exist, and do not link to them. `/guides/[slug]` returns **404** for every
  draft.
- No draft is imported into the `Guide` table by default. `scripts/seed-phase1-guides.ts`
  validates by default (`--check`) and requires an explicit `--import` flag that still
  refuses anything failing the publish gate.

Citation discipline for the draft bodies:

- Cite only instruments you can name exactly — a CFR part or section, a Federal Register
  document number, a named agency policy statement. Never invent a document number, a
  docket, a date, or a URL.
- Where you would need a specific figure, threshold, deadline or dollar amount that you
  cannot source precisely, write the placeholder `[UNVERIFIED — confirm at source]` inline
  rather than a number. A visible gap is correct; a confident wrong number is not.
- The `Evidence and limits` section of every guide states plainly that the draft is
  machine-authored, uncited claims are marked, and nothing in it is legal advice.

Structure per the plan: nine Markdown files under `content/guides/`, 900–1,800 English words
each, sections `Who this is for`, `What changes the decision`, `US requirements`,
`Amazon US`, `Shopify US`, `Evidence and limits`, `Review history`. Frontmatter validated for
slug, title, summary, market, platforms, categories, risk attributes, Policy Topics,
readiness, review fields, and at least two official source records.

Adjust the plan's corpus test accordingly: `missingLaunchCategories` refers to **draft**
coverage of the six launch categories, and a separate assertion must confirm that **zero**
guides in the corpus pass the publish gate. Both must be true simultaneously.

## Briefings: consume Operations through the Foundation table, not its code

The plan says weekly must consume the accepted Operations shadow-qualification run and
preserve its ordered version IDs and fingerprint. Operations lives on
`feat-phase1-operations`, a different track that is off limits — do not merge it, do not
import from it, do not read or modify its worktree.

You do not need to. Track A's `qualifyWeeklyBriefing` writes its result to `PipelineRun`,
which is a Foundation model present on this branch: `jobType: BRIEFING`, `scopeKey`,
`scheduledFor`, `status`, `outputFingerprint`, and `metadata Json?` carrying the ordered
version IDs. Consume that row and nothing else.

- Read the finished `PipelineRun` for the period's `scopeKey`. Pin `BriefingEntry` rows to
  the exact ordered version IDs in its metadata and carry `outputFingerprint` onto the
  briefing.
- If no finished qualification run exists for a period, the weekly briefing is **not
  generated** — return `NO_QUALIFIED_CONTENT`. Do not fall back to computing your own
  ordering; that would silently diverge from what Operations qualified, and the two would
  disagree once Track A merges.
- Treat the `PipelineRun` shape as an integration contract. Assert it in a test against a
  seeded row so the coupling is explicit and breaks loudly if it changes.

Weekly is Monday–Sunday UTC and is the primary report. Monthly is calendar month UTC. Every
`BriefingEntry` pins a version ID; a correction produces a new fingerprint and a new review
event rather than editing a published briefing.

## The loading-skeleton trap, again

`/guides/[slug]`, `/briefings/weekly/[year]/[week]`, `/briefings/monthly/[year]/[month]` and
`/briefings/daily/[date]` all return real 404s for unknown, unpublished or below-threshold
periods. A route-group `loading.tsx` above any of them flushes the shell before `notFound()`
runs and turns those into soft 200s — the bug Task 3 removed and locked.

Do not add `app/(public)/guides/loading.tsx` or `app/(public)/briefings/loading.tsx`. Use a
`<Suspense>` boundary inside a page around the list only. Add real-status assertions to
`test/e2e/public-briefings.spec.ts` for: an unknown guide slug → 404, an out-of-range week →
404, a below-threshold daily date → 404, and a valid period → 200.

## Scope

Create or modify only:

- `src/public-intelligence/guides.ts`
- `src/public-intelligence/briefings.ts`
- `scripts/seed-phase1-guides.ts`
- nine files under `content/guides/`
- `app/(public)/ReportCard.tsx`
- `app/(public)/guides/page.tsx`
- `app/(public)/guides/[slug]/page.tsx`
- `app/(public)/briefings/page.tsx`
- `app/(public)/briefings/weekly/[year]/[week]/page.tsx`
- `app/(public)/briefings/monthly/[year]/[month]/page.tsx`
- `app/(public)/briefings/daily/[date]/page.tsx`
- `app/sitemap.ts` (modify — published briefings only; no draft guides, no empty periods)
- `test/guides-briefings.test.ts`
- `test/e2e/public-briefings.spec.ts`
- this Pact task's report/evidence metadata

Do not touch: `src/public-intelligence/{types,query,serialize,cache,coverage,search}.ts`
(accepted contracts — consume them), `app/(legacy)/**`, `app/admin/**`, `middleware.ts`,
Auth, Prisma schema or migrations, `vitest.config.ts`, `playwright.config.ts`, earlier
tasks' e2e specs, or cloud configuration.

## Gates

```bash
cd /Users/xtation/AgentWorks/worktrees/tradelinks-phase1-public-intelligence
set -a && . ./.env && set +a
pnpm exec prisma migrate status          # warms the Neon compute; do this first
pnpm tsx scripts/seed-phase1-guides.ts --check
pnpm vitest run test/guides-briefings.test.ts test/daily-note.test.ts
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Baseline: **632 passed / 7 skipped / 639 collected**, 63/64 files, only
`test/foundation-backfill.test.ts` failing (endpoint allowlist, by design). Do not repair it.
Your gate is no new failures against that baseline and no drop in collected files.

DB-backed suites are environment-sensitive; warm the compute first. Do not add retries, do
not change `.env`.

Strict TDD: RED with real command output, GREEN, REFACTOR with the same command rerun
unchanged.

Then Impeccable `critique` and `audit`, records under `.impeccable/`. Fix every P0 and P1.

Final-build screenshots after all fixes into `design/shots/public-task5/`: `/guides` (its
honest-absence state) and one valid briefing period, at 390, 768 and 1440 in both themes.
Real rendered content; no byte-identical duplicates.

## Evidence

RED/GREEN/REFACTOR with exact commands and exit codes, files changed, the guide word counts
and how many drafts exist, explicit confirmation that zero guides pass the publish gate,
browser evidence paths, Impeccable record paths, rollback notes, `EFFICIENCY_RECORD`. Keep
Pact evidence under 4 KB and link
`.superpowers/sdd/2026-07-23-tradelinks-phase1-public-intelligence/task-5-report.md`.

Report unavailable token telemetry as `UNAVAILABLE`. State plainly anything you could not
verify — especially any citation you were unsure of. A disclosed gap is accepted; an
overstated claim is not.

## Stop and report instead of deciding

Print `BLOCKED:` and stop. Task 3's two escalations were both upheld; Task 4's unescalated
scope decision was sent back. Escalating is the cheaper path.

- Any need to touch a file outside the scope list.
- Any need for a migration or schema change.
- Any need to import from, read, or modify the `feat-phase1-operations` track.
- Any temptation to publish a guide, or to fill `reviewedBy` with any value.
- Any destructive or irreversible command.

## Prohibited

No production or staging deployment. No Neon, Vercel or Railway mutation. No migration. No
`/zh` redirect work, no legacy retirement, no `0014`. No `git push`, no merge, no
`git reset --hard`. No `pactify seat use` — identity comes from `PACT_AGENT_ID`. No claim
that the seven-day P0 has passed. No published guide.

## Scope extension — the cross-suite readiness race (granted 2026-08-03)

Granted after the worker escalated a third time rather than guessing. The reviewer
reproduced the failure independently: two consecutive full runs produced **identical**
failure sets — 2 known foundation-backfill baseline failures plus
`public-hubs > getHub content` ×3 and `coverage-readiness > seedPhase1Coverage` ×1. It is
deterministic, not flaky, and the worker's root cause is correct.

`refreshCapabilityReadiness(now)` forwards straight to `recomputeAllCapabilityReadiness(now)`
— an unscoped write across the shared `CoverageCapability` table. `public-hubs` fixtures are
capabilities with overdue sources, so a concurrent global recompute flips them to STALE and
`getHub` returns null. The hazard has existed since Task 3; adding a 65th file only
reshuffled worker scheduling so the overlap became certain.

You may modify **`test/public-hubs.test.tsx`** and **`test/coverage-readiness.test.ts`**, for
this fix only:

1. **Primary — remove the susceptibility.** Give `public-hubs` capability fixtures sources
   that are not overdue at the fixture clock, so a global recompute cannot flip them. A
   fixture that only passes while nobody recomputes readiness is fragile by construction.
   Where a test genuinely needs an overdue/STALE capability, it must assert that state
   directly rather than depend on it surviving a parallel run.
2. **Secondary — contain the global mutation.** The `refreshCapabilityReadiness` describe in
   `coverage-readiness.test.ts` must snapshot every capability's readiness before it runs and
   restore them afterwards, in a `try`/`finally` so a failure still restores.
3. Leave a comment in both places naming the hazard, so a later task does not reintroduce it.

**Explicitly NOT authorised**: serialising DB suites in `vitest.config.ts`. The full suite
already takes ~285s; serialising would cost many minutes on every run and would hide a local
fragility behind a global penalty. Do not set `fileParallelism: false` or cap pool threads.

Do not change any product code for this. No `src/**` edit is in scope, and
`refreshCapabilityReadiness` itself keeps its global semantics — that is what it is for.

**Standing rule for Tasks 6–9**, state it in your report: any test invoking a function that
recomputes or refreshes *all* rows of a shared table must snapshot and restore that table, and
no fixture may depend on shared state that such a function can rewrite.

After the fix, run the full suite **twice** and show both failure sets. Passing once is not
evidence against a race.
