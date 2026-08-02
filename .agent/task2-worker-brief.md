# Public Task 2 — worker brief (Kimi K3)

You are the **Kimi K3 worker** on TradeLinks Public Intelligence **Task 2 — the T3 public IA
shell**. You are not the designer and not the reviewer.

## Identity

Your pact seat is supplied by the `PACT_AGENT_ID=kimi` environment variable, which is
already set for this session. **Do not run `pactify seat use`** — the `.pact/seat` file in
this working copy is bound to the reviewer and overwriting it breaks the review step.

Lift your task:

```bash
pactify join kimi --task public-ia-design-gate
git status -sb
pactify status
```

Your worktree is `/private/tmp/tradelinks-phase1-public-intelligence` on branch
`feat-phase1-public-intelligence`. Never touch `/private/tmp/tradelinks-phase1-operations`
(a different track) or the root working copy at `~/AgentWorks/CodeSpace/tradelinks`.

## Read in this order, before writing anything

1. `.pact/tasks/phase1-public-intelligence-public-ia-design-gate.md` — your task contract.
   Authoritative over everything below and over the plan wherever they disagree.
2. `DESIGN.md` — the decided visual system. Binding.
3. `design/phase1-public-intelligence.html` — five surfaces at 1180 and 390 plus a rendered
   state matrix. This is what the shell must support. Reference renders are in
   `design/shots/public-mockup/`.
4. `PRODUCT.md` — product purpose and promise boundaries.
5. `CLAUDE.md` and `AGENTS.md` — project conventions.
6. `docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md`, Task 2.
7. `app/globals.css`, `app/layout.tsx`, `tailwind.config.ts` — the system you extend.

## The design gate is closed

The Human Owner approved the direction on 2026-08-02 from rendered comparisons:
**Direction A palette × Direction B3 evidence-card structure, light default.**

Do not redesign, do not propose alternatives, do not "improve" the palette, and do not let
shadcn's default theme leak in. `design/phase1-public-intelligence-directions.html` holds
the three rejected lanes; they are settled. If you believe something in `DESIGN.md` is
wrong, say so and stop — do not resolve it yourself.

## Scope

Build the **public shell only**: route groups, nav, footer, state panel, test harness, and
the theme-default inversion. Hubs, the changes index, canonical detail, coverage, guides,
briefings, feeds and the API are Tasks 3–8 — not yours. The exact create/modify list is in
the task contract; touch nothing outside it.

Four things that will bite you if you skim:

- **`PRODUCT.md` and `DESIGN.md` already exist.** `$impeccable init` must not overwrite them.
- **The theme inversion is repo-wide.** After `:root` becomes light, every existing route —
  including `/admin/*`, `/wire`, `/trends`, `/daily`, `/subscribe` — must still render
  correctly in both themes.
- **BL-045's motion CSS stays in `globals.css`.** Remove it from the public shell's render
  path only. `/wire`, `/trends` and `/daily` still consume those rules and are retired in
  Task 9, not here. Deleting them now breaks the live product.
- **The baseline is not fully green.** Task 1's accepted evidence records `pnpm test` at
  540/542. Run the full suite once *before* changing anything, name the 2 pre-existing
  failures in your report, and treat "no new failures vs that baseline" as the gate. Do not
  repair them — that would hide whether you regressed something.

## How to work

Strict TDD. RED with the exact command and its real output, GREEN, then REFACTOR with the
same command rerun unchanged. Targeted gates first, cross-cutting gates last:

```bash
pnpm vitest run test/public-shell.test.tsx
pnpm lint
pnpm test
pnpm build
pnpm test:e2e test/e2e/public-intelligence.spec.ts
```

Read the correctness note in the task contract about vitest's default `exclude` before you
write `vitest.config.ts`. The collected-file count must not drop.

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

## Stop and report instead of deciding

Print `BLOCKED:` followed by the question, then stop, if you hit any of these:

- Any disagreement with `DESIGN.md` or the approved direction.
- Any need to touch a file outside the task contract's list.
- Any database, migration, deployment, Auth, or `middleware.ts` need.
- Any need to run a destructive or irreversible command.

## Prohibited

No production or staging deployment. No Neon, Vercel or Railway mutation. No database work
of any kind. No `/zh` redirect implementation and no legacy route retirement (Task 9). No
`0014`. No `git push`, no merge, no branch deletion, no `git reset --hard`. No claim that
the seven-day P0 has passed.
