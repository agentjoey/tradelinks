# Public Task 2 — Kimi K3 worker launch prompt

Launch with:

```bash
cd /private/tmp/tradelinks-phase1-public-intelligence
kimi -m kimi-code/k3
```

Then paste everything below the rule into a fresh session.

Prerequisite: `pactify assign public-ia-design-gate …` must have succeeded first. If
`pactify join kimi --task public-ia-design-gate` reports the task is unknown, stop — the
orchestrator has not assigned it yet.

---

You are the Kimi K3 worker on TradeLinks Public Intelligence **Task 2 — the T3 public IA
shell**. You are not the designer and not the reviewer.

## Bind your seat and lift the task

```bash
cd /private/tmp/tradelinks-phase1-public-intelligence
pactify seat use kimi
pactify join kimi --task public-ia-design-gate
git status -sb
pactify status
```

Your worktree is `/private/tmp/tradelinks-phase1-public-intelligence` on branch
`feat-phase1-public-intelligence`. Do not touch
`/private/tmp/tradelinks-phase1-operations` (Track A) or the root working copy.

## Read in this order, before writing anything

1. `.pact/tasks/phase1-public-intelligence-public-ia-design-gate.md` — your task contract.
   It is authoritative over anything below and over the plan where they disagree.
2. `DESIGN.md` — the decided visual system. Binding.
3. `design/phase1-public-intelligence.html` — open it in a browser. Five surfaces at 1180
   and 390, plus a rendered state matrix. This is what you are building the shell for.
4. `PRODUCT.md` — product purpose and promise boundaries.
5. `CLAUDE.md` and `AGENTS.md` — project conventions.
6. `docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md`, Task 2.
7. `app/globals.css`, `app/layout.tsx`, `tailwind.config.ts` — the system you are extending.

## The design gate is closed

The Human Owner approved the direction on 2026-08-02 from rendered comparisons:
**Direction A palette × Direction B3 evidence-card structure, light default.**

Do not redesign, do not propose alternatives, do not "improve" the palette, and do not
substitute shadcn's default theme. `design/phase1-public-intelligence-directions.html`
holds the three rejected lanes; they are settled. If you believe something in `DESIGN.md`
is wrong, raise it and stop — do not resolve it yourself.

## Scope

Build the **public shell only**: route groups, nav, footer, state panel, test harness,
theme-default inversion. Hubs, the changes index, canonical detail, coverage, guides,
briefings, feeds and the API are Tasks 3–8 — not yours. The exact create/modify list is in
the task contract; do not touch anything outside it.

Three things that will bite you if you skim:

- **`PRODUCT.md` and `DESIGN.md` already exist.** `$impeccable init` must not overwrite
  them.
- **The theme inversion is repo-wide.** After `:root` becomes light, every existing route —
  including `/admin/*` — must still render correctly in both themes.
- **BL-045's motion CSS stays in `globals.css`.** Remove it from the public shell's render
  path only. `/wire`, `/trends` and `/daily` still consume those rules and are retired in
  Task 9, not here. Deleting them now breaks the live product.

## How to work

Strict TDD: RED with the exact command and its output, GREEN, then REFACTOR with the same
command rerun unchanged. Targeted gates first, cross-cutting gates last:

```bash
pnpm vitest run test/public-shell.test.tsx
pnpm lint
pnpm test
pnpm build
pnpm test:e2e test/e2e/public-intelligence.spec.ts
```

The full existing suite (53 files) must stay green. Adding a `vitest.config.ts` that changes
which files get collected is a regression — read the correctness note in the task contract
about vitest's default `exclude` before you write that file.

Then run Impeccable `critique` and `audit` against the built shell and persist the records
under `.impeccable/`. Fix every P0 and P1. You may not waive your own finding.

Capture final-build screenshots at 390, 768 and 1440 in both themes, **after** all fixes,
into `design/shots/public-task2/`.

## Checkpoint

```bash
pactify checkpoint public-ia-design-gate --evidence "…"
```

Keep the evidence under 4 KB and link the detailed report at
`.superpowers/sdd/2026-07-23-tradelinks-phase1-public-intelligence/task-2-report.md`.
Record RED/GREEN/REFACTOR commands with exit codes, files changed, browser evidence paths,
Impeccable record paths, rollback notes, and `EFFICIENCY_RECORD`. Report unavailable token
telemetry as `UNAVAILABLE` — never estimate it as fact.

You cannot accept your own task. Claude Opus 5 reviews it in a fresh context.

## Stop and ask, do not decide

- Any disagreement with `DESIGN.md` or the approved direction.
- Any need to touch a file outside the task contract's list.
- Any database, migration, deployment, Auth, or `middleware.ts` need.
- The K3 model being unavailable — a provider failure is not authorization to substitute.

## Prohibited

No production or staging deployment. No Neon/Vercel/Railway mutation. No database work at
all. No `/zh` redirect implementation and no legacy route retirement (Task 9). No `0014`.
No push or merge without explicit Human Owner authorization. No claim that the seven-day P0
has passed.
