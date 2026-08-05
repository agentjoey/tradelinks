# TradeLinks Track B Handoff — Phase 1 Public Intelligence

Date: 2026-08-02  
Scope: Public Intelligence continuation after accepted Task 1  
Production authority: none in this track

## Executive state

Public Intelligence Task 1 is accepted and complete on the isolated local branch `feat-phase1-public-intelligence` at `e6022a417e301921a686e4cfb73a68468e395f54`. The worktree is `/private/tmp/tradelinks-phase1-public-intelligence`. At handoff the worktree is clean, but the feature branch does not yet exist on GitHub.

The next deliverable is Public Task 2, the Tier 3 Public IA Design Gate. It is not an ordinary page-building task: the Human Owner must approve the design brief, URL/navigation contract, English-only behavior, readiness/evidence presentation, and shadcn style before UI product code begins.

Track A is independently handling the Railway production Cron cutover. Its first real Cron succeeded but exposed a non-deterministic scheduled-slot key, so the original 72-hour window is invalid and must restart after a reviewed correction. Track B may continue against fixtures and approved non-production resources while Track A repairs and reruns that gate. Track B must not inspect or mutate Track A cloud state.

## Read order

1. `AGENTS.md`
2. `CLAUDE.md`
3. `/Users/xtation/AgentWorks/FRONTEND-DESIGN-WORKFLOW.md`
4. `.agent/CURRENT.md`
5. `/Users/xtation/AgentWorks/CodeSpace/tradelinks/.agent/HANDOFF.md`
6. `/Users/xtation/AgentWorks/CodeSpace/tradelinks/.agent/handoffs/2026-08-02-track-b-public-intelligence-prompt.md`
7. `docs/superpowers/specs/2026-07-23-tradelinks-phase-1-product-structure-design.md`
8. `docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md`
9. `/Users/xtation/AgentWorks/CodeSpace/tradelinks/docs/superpowers/plans/2026-07-28-tradelinks-development-efficiency-optimization.md`
10. `.pact/tasks/phase1-public-intelligence-public-content-schema.md`
11. `.superpowers/sdd/2026-07-23-tradelinks-phase1-public-intelligence/task-1-report.md`
12. `.superpowers/sdd/2026-07-23-tradelinks-phase1-public-intelligence/progress.md`

The root-worktree handoff and efficiency documents above are local durable artifacts that are not present in the Public feature worktree, hence the absolute paths. `.agent/CURRENT.md` and the root `.agent/HANDOFF.md` contain useful architectural history but predate the current Track A production Cron activation. They are not the source of truth for current cloud state.

## Git and Pact state

| Item | State |
|---|---|
| Worktree | `/private/tmp/tradelinks-phase1-public-intelligence` |
| Branch | `feat-phase1-public-intelligence` |
| HEAD | `e6022a4` — `docs: finalize public task1 verification` |
| Remote branch | absent at handoff |
| Worktree | clean at handoff |
| Pact feature | `phase1-public-intelligence`, `in_progress` |
| Task 1 | `public-content-schema`, accepted |
| Task 2 | not yet created/assigned in Pact |
| Operations dependency | production exposure blocked until Operations/P0 gates; fixture development allowed |

Do not edit `.pact/STATE.yml` by hand. Use Pactify commands and preserve the rule that a worker cannot accept its own task.

## Task 1 delivered contract

Task 1 added:

- `prisma/migrations/0013_phase1_public_content/migration.sql`
- additive `Guide`, `GuideEvidence`, `Briefing`, `BriefingEntry`, `LegacyRedirect`, and `BriefingKind` schema contracts
- `src/public-intelligence/types.ts`
- `src/public-intelligence/query.ts`
- `src/public-intelligence/serialize.ts`
- `src/public-intelligence/cache.ts`
- `test/public-read-model.test.ts`
- `test/public-channel-consistency.test.ts`

Important correction: the public-content migration is `0013`, not the plan's historical `0012`, because `0012_phase1_publication_review_fields` already exists. The later destructive-retirement task must use `0014`; never edit, rename, or replay existing migrations.

The public contract exposes only reviewed, current, `PUBLISHED`, `MONITORED|VERIFIED` canonical versions. Experimental demand remains separate and must not serialize as a `CanonicalPublicRecord`. The serializer is the channel boundary for future pages, RSS, API, Telegram, and briefing consumers.

Task 1 was accepted after DB-backed schema/relation and cursor-pagination rework. Pact evidence records 76 targeted tests across public read/channel/canonical publication, plus lint, full suite, and production build. Do not re-run expensive DB-backed gates without a task-specific reason and an explicitly approved non-production branch.

## Next task: Public Task 2

Plan section: `docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md`, “Task 2: Pass the T3 Public IA Design Gate”.

Expected task files include:

- `PRODUCT.md`
- `DESIGN.md`
- `design/phase1-public-intelligence.html`
- `vitest.config.ts`
- `playwright.config.ts`
- `test/setup-dom.ts`
- `package.json`
- `pnpm-lock.yaml`
- `app/globals.css`
- `app/layout.tsx`
- `app/admin/layout.tsx`
- route-group move from `app/(home)/page.tsx` to `app/(public)/page.tsx`
- `app/(public)/layout.tsx`
- `app/(public)/PublicNav.tsx`
- `app/(public)/PublicFooter.tsx`
- `app/(public)/StatePanel.tsx`
- `test/public-shell.test.tsx`
- `test/e2e/public-intelligence.spec.ts`

These paths must be revalidated with `rg --files` before task creation because branch history may have changed.

### Required Human Owner design decisions

Do not begin UI implementation until the owner explicitly approves:

1. Primary user/task and the Tier 3 Brief.
2. Navigation: US Market, Amazon US, Shopify US, Categories, Changes, Guides, Briefings, Coverage.
3. Public URL contract and permanent-link strategy.
4. English-only launch and the handling of existing `/zh` routes.
5. How readiness, evidence, source dates, effective dates, correction history, and known coverage gaps remain visible.
6. Official shadcn registry/style selection.
7. Inspectable mockup and complete responsive/accessibility/state matrix.

### Frontend gates

- Apply the mandatory global frontend workflow and Tier 3 rules.
- Use Impeccable for context, shape, critique, audit, and polish.
- Use shadcn for components; do not invent a parallel component system.
- Preserve the project's semantic tokens and both themes.
- Cover loading, empty, error, success, validation, disabled, permission, stale, and degraded states where applicable.
- Require independent fresh-context review and a separate final-build browser verification.
- Capture final screenshots after all fixes at mobile, mid, and desktop widths in both themes.
- Fix every failed check or obtain an explicit Human Owner waiver; no agent may self-waive.

## Development and review model

Task 1 used:

- Orchestrator: Codex 5.6 Sol
- Worker: OpenCode `deepseek/deepseek-v4-pro`
- Reviewer: Claude Code `claude-opus-5`

Recommended continuation is the same worker/reviewer pairing. A provider failure is not standing authorization to substitute models; stop and obtain owner approval, then record the bounded substitution.

Use the efficiency plan:

- one fresh worker context;
- one fresh reviewer context;
- one task per Pact task;
- targeted TDD gates before full-suite/build gates;
- poll long commands no more often than once per 60 seconds;
- keep Pact evidence compact and link detailed reports;
- record unavailable token telemetry as `UNAVAILABLE`, never estimate it as fact.

## Dependencies and sequencing

```text
Public Task 1 accepted
        ↓
Public Task 2 T3 brief + owner approval + implementation + independent verification
        ↓
Public Tasks 3–8
        ↓                         Operations seven-day P0 pass
        └──────────────────────────────┬───────────────────────┘
                                       ↓
                              Public Task 9 production cutover
```

Task 2 is unblocked for design-gate preparation. Public Tasks 3–8 may be developed only after their stated dependencies are accepted. Public Task 9 remains blocked until Tasks 1–8 are accepted and the seven-day production P0 report passes.

## Prohibited actions

- No GitHub `production` update or Vercel production deployment.
- No Railway or Track A mutation.
- No Neon production migration, backfill, branching, or data writes.
- No legacy route/table retirement and no migration `0014`.
- No weakening Auth, evidence, readiness, cache, SEO, or accessibility gates.
- No public claim that Experimental demand is a bestseller or launch recommendation.
- No Plus, Ads integration, store connection, or Phase 2 Operator Agent work.
- No push, merge, or model substitution without the applicable owner authority.

## First session outcome

The first successor session should end with one of two honest states:

1. **Owner gate pending:** Task 2 Pact brief, PRODUCT/DESIGN context, mockup, URL/navigation proposal, and state matrix are ready for owner approval; no UI product code has started.
2. **Owner gate approved:** approval is recorded, the scoped TDD implementation has started under the required frontend workflow, and Track A/production remain untouched.

Do not report Task 2 complete until the final build, browser matrix, fresh Claude Opus 5 review, and Pact acceptance all pass.
