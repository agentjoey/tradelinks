# Track B handoff prompt — Public Intelligence continuation

Copy everything below into a fresh orchestrator-agent session.

---

You are taking over TradeLinks Track B: Phase 1 Public Intelligence development. Continue from accepted Public Task 1 and prepare/execute Task 2 only after the Human Owner's T3 design approval. Use Pactify and the repository efficiency policy. Do not touch production traffic or Track A cloud state.

## Repository and worktree

- Repository: `/Users/xtation/AgentWorks/CodeSpace/tradelinks`
- Required isolated worktree: `/private/tmp/tradelinks-phase1-public-intelligence`
- Branch: `feat-phase1-public-intelligence`
- Expected handoff revision: `e6022a417e301921a686e4cfb73a68468e395f54`
- GitHub status at handoff: this branch has no remote branch yet; do not push without confirming owner authorization.
- Pact feature: `phase1-public-intelligence`
- Accepted task: `public-content-schema` (Public Task 1)
- Next task: Public Task 2, `Pass the T3 Public IA Design Gate`

Start with:

```bash
cd /private/tmp/tradelinks-phase1-public-intelligence
git status -sb
git pull --ff-only        # only after an upstream exists and the worktree is clean
cat AGENTS.md
cat CLAUDE.md
cat .agent/CURRENT.md
cat /Users/xtation/AgentWorks/CodeSpace/tradelinks/.agent/HANDOFF.md
cat docs/superpowers/specs/2026-07-23-tradelinks-phase-1-product-structure-design.md
cat docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md
cat /Users/xtation/AgentWorks/CodeSpace/tradelinks/docs/superpowers/plans/2026-07-28-tradelinks-development-efficiency-optimization.md
cat /Users/xtation/AgentWorks/CodeSpace/tradelinks/.agent/handoffs/2026-08-02-track-b-public-intelligence-handoff.md
pactify status
pactify validate
```

The root handoff and efficiency files above are not present in the Public feature worktree, so keep using their absolute paths until they are deliberately integrated. Use `rg --files` and `rg` before naming or changing paths. Do not assume the historical plan's migration numbering: Task 1 correctly created forward-only `0013_phase1_public_content`; the later retirement migration is `0014`.

## Verified baseline

- Public Task 1 is accepted by Claude Opus 5.
- Public Task 1 final revision is `e6022a4`.
- The Task 1 branch/worktree was clean at handoff.
- Task 1 added the canonical public DTO/read contract and additive public-content schema; it did not add routes or expose production traffic.
- Task 1 verification covered 76 targeted DB-backed tests, lint, full suite, and production build as recorded in Pact/report evidence.
- Operations Task 5 is active on a different worktree, but its original 72-hour window was invalidated after the first real Cron exposed a non-deterministic scheduled-slot key. Track A must correct and restart that window. Public development may proceed against fixtures/non-production branches, but production exposure remains blocked by the corrected Operations gate, seven-day P0 report, and Public Task 9.

## Task 2 hard gate

Task 2 is Tier 3 under `AGENTS.md`, `CLAUDE.md`, and `/Users/xtation/AgentWorks/FRONTEND-DESIGN-WORKFLOW.md`. Do not downgrade or waive it.

Before UI implementation:

1. Read the frontend workflow and the full Impeccable skill.
2. Create a Pact task for exactly Public Plan Task 2; do not plan Tasks 3–9 into the same task.
3. Initialize/refresh `PRODUCT.md` and `DESIGN.md` from the approved product spec.
4. Produce the inspectable mockup `design/phase1-public-intelligence.html` and a complete state matrix.
5. Present the following for Human Owner approval:
   - T3 Brief and primary user/task;
   - public navigation and URL contract;
   - English-only launch and `/zh` redirect behavior;
   - evidence/readiness/coverage presentation;
   - official shadcn registry/style choice;
   - responsive, accessible, both-theme state matrix.
6. Stop before UI product code until the owner explicitly approves this design gate.

After approval, use strict TDD and the four-stage frontend workflow. Use shadcn for components, preserve semantic tokens, cover loading/empty/error/success/stale/permission/disabled states, and require final-build browser screenshots at mobile/mid/desktop in both themes. No failing review or verification finding may be silently waived.

## Model and review policy

- Recommended continuation worker: OpenCode `deepseek/deepseek-v4-pro`, matching Public Task 1.
- Independent reviewer: Claude Code `claude-opus-5`, fresh context.
- For T3, implementation owner cannot review or verify its own UI.
- If either model is unavailable, stop and obtain explicit owner approval before substitution.
- Use one fresh worker context and one fresh reviewer context; keep Pact evidence under 4 KB and point to detailed reports.

## Scope boundaries

- Do not deploy to production or modify Railway, Neon production, Vercel production, GitHub `production`, Auth production, Telegram, or production environment variables.
- Any Task 2 database use must be absent unless the exact plan requires it; Task 2 is a frontend/design shell task.
- Do not start Public Task 9, legacy redirects, old-table retirement, or migration `0014`.
- Do not claim the seven-day P0 passed.
- Do not modify Track A's `/private/tmp/tradelinks-phase1-operations` worktree.
- Preserve unrelated dirty files in the root worktree.

## Completion and continuation

For Task 2, record RED/GREEN/REFACTOR, exact files, verification commands/results, browser evidence, owner approval, independent review, rollback, and `EFFICIENCY_RECORD`. The worker cannot self-accept. After Task 2 is accepted, recommend the next smallest Public task; Tasks 3–8 may continue while P0 data accumulates, but Task 9 remains blocked by all prior Public tasks plus a passing seven-day P0 report.

---
