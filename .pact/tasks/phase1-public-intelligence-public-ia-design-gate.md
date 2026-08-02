# Public Intelligence Task 2 — Pass the T3 Public IA Design Gate

## Context

Implement Task 2 from `docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md`.
Task 1 (`public-content-schema`) is accepted and present on the base commit; it added the
additive public-content schema (`0013_phase1_public_content`) and the server-only public
read contract. It added no routes and no UI.

This task builds the **public shell only** — route groups, navigation, footer, state panel,
the test harness, and the theme-default inversion. It does not build hubs, the changes
index, canonical detail pages, coverage, guides, briefings, feeds, or the API. Those are
Tasks 3–8.

**The design gate is already passed.** Do not reopen it, redesign, or substitute your own
visual direction. The approved artifacts below are binding.

## Approved design gate (Human Owner, 2026-08-02)

Decisions recorded before any product code:

| # | Decision | Approved |
|---|---|---|
| 1 | Language | English-only launch; existing `/zh` routes get permanent 308 redirects to their English equivalents. Translation data is retained, not deleted. |
| 2 | URL contract | The plan's Public URL Contract verbatim, canonical base `https://tradelinks.us`. Slugs never encode readiness or category. |
| 3 | Visual direction | **Direction A palette × Direction B3 evidence-card structure**, chosen from rendered comparison. Light is the default theme. |
| 8 | Topic vocabulary | Import & Customs, Product Safety & Recalls, Labeling & Claims, Fees & Payments, Privacy & Consumer Protection, Listing & Account Health. |

Decisions 4 (Amazon hub availability), 5 (daily threshold), 6 (API abuse posture) and
7 (retirement timing) belong to Tasks 3, 5, 7 and 9. Do not pre-empt them.

Binding artifacts, produced and owner-approved before this task was assigned:

- `DESIGN.md` — the decided system. Read it first; it is the contract, not a suggestion.
- `design/phase1-public-intelligence.html` — five surfaces × desktop/mobile + a rendered
  state matrix. Open it and match it.
- `design/phase1-public-intelligence-directions.html` + `design/shots/direction-probe/` —
  the rejected lanes, kept so the direction is not relitigated.
- `design/shots/public-mockup/` — 12 reference renders (6 surfaces × light/dark).

```yaml
tier: T3
primary_user: "Global English-speaking seller entering or operating in the US"
primary_task: "Find a credible change, understand why it matters, inspect evidence, and track it"
navigation: ["US Market", "Amazon US", "Shopify US", "Categories", "Changes", "Guides", "Briefings", "Coverage"]
trust_requirements: ["readiness always visible", "primary evidence one click away", "dates explicit", "coverage gaps explicit"]
prohibited: ["bestseller promise", "legal advice", "fake real-time status", "Ads placement", "private data"]
```

## Models

- Worker: **Kimi Code, `kimi-code/k3`** (pact role `kimi-k3-worker`).
- Reviewer: **Claude Code, `claude-opus-5`** (pact role `claude-opus5-reviewer`), fresh context.
- Orchestrator: Claude Code, `claude-opus-5`.

A worker never self-accepts. If the worker model is unavailable, stop and obtain explicit
Human Owner approval before substituting — a provider failure is not standing authorization.

## Scope

Paths were revalidated on the base commit. `PRODUCT.md`, `DESIGN.md` and the mockup already
exist — **do not overwrite them**; `$impeccable init` must not clobber `PRODUCT.md`.
`components.json`, `vitest.config.ts`, `playwright.config.ts` and `test/setup-dom.ts` are
genuinely absent and are created by this task.

Create or modify only:

- `app/globals.css` — invert the theme default (see below)
- `app/layout.tsx` — reduce to providers/metadata only
- `app/admin/layout.tsx` — takes ownership of `AccountNav`
- move `app/(home)/page.tsx` → `app/(public)/page.tsx` (keep `loading.tsx` with it)
- `app/(public)/layout.tsx`
- `app/(public)/PublicNav.tsx`
- `app/(public)/PublicFooter.tsx`
- `app/(public)/StatePanel.tsx`
- `components.json` (shadcn, official registry)
- `vitest.config.ts`
- `playwright.config.ts`
- `test/setup-dom.ts`
- `package.json`, `pnpm-lock.yaml`
- `test/public-shell.test.tsx`
- `test/e2e/public-intelligence.spec.ts`
- this Pact task's report/evidence metadata

Do not touch: Prisma schema or migrations, `src/public-intelligence/*`, workers, Auth,
`middleware.ts`, cloud configuration, staging, or production. Do not build Task 3–8 pages.

## Theme default inversion

`app/globals.css` currently declares dark values on `:root` and light values on
`[data-theme="light"]`. Invert it:

- `:root` carries the light values and `color-scheme: light`.
- `[data-theme="dark"]` carries the dark values and `color-scheme: dark`.

Leave untouched: the `tl-theme` cookie, its 1-year `SameSite=Lax` attributes, the SSR
`data-theme` attribute on `<html>`, the `beforeInteractive` localStorage fallback script,
and the deliberate decision not to read `prefers-color-scheme`.

Every existing page must still render correctly in both themes after the inversion. The
admin surfaces are in scope for that check even though this task does not restyle them.

## Motion removal

The Phase 1 public shell does **not** carry BL-045's liveness choreography. Remove from the
public shell's render path: the masthead entrance (`.lm` / `.li` / `.focus-in` /
`.top-cluster` stagger), the wire tape (`.tape*`), the radar sweep glyph (`.radar-glyph`),
the live blip (`.live-dot`), and the fresh-insert row animation (`.insert-row`).

Keep the CSS definitions in `globals.css` while legacy `/wire`, `/trends` and `/daily`
routes still consume them — those routes are retired in Task 9, not here. Deleting the rules
now breaks the live product.

What the public shell keeps: 150–250 ms CSS state transitions, skeleton-to-content
crossfade, and a `prefers-reduced-motion: reduce` alternative for every one.

## Test harness

```bash
pnpm add --save-dev --save-exact \
  @playwright/test@1.61.1 \
  @testing-library/jest-dom@6.9.1 \
  @testing-library/react@16.3.0 \
  jsdom@26.1.0
pnpm exec playwright install chromium
```

Add `"test:e2e": "playwright test"` to `package.json`.

**Correctness note on the plan's `vitest.config.ts` snippet.** The repository currently has
no `vitest.config.ts`; the 53 existing test files run on vitest's defaults. Setting
`exclude: ["test/e2e/**", "node_modules/**"]` *replaces* vitest's default exclude list
rather than extending it, which drops the built-in `dist`, `.cache`, `.git`, `.idea` and
`.output` exclusions. Preserve them explicitly, e.g. by spreading
`configDefaults.exclude` from `vitest/config` and appending `test/e2e/**`.

`vitest.config.ts` uses jsdom for `**/*.test.tsx` and loads `test/setup-dom.ts`.
`playwright.config.ts` targets `test/e2e`, base URL `http://127.0.0.1:3000`, projects
`desktop-chromium` (1440×900) and `mobile-chromium` (390×844), and starts `pnpm start`
after a production build.

**Baseline is not fully green.** Task 1's accepted evidence records `pnpm test` at
540/542 passing with 2 pre-existing failures on this branch. Before you change anything,
run the full suite once, record the exact names of those 2 failures, and put them in your
report. Your gate is *no new failures relative to that recorded baseline* — not "542/542".
Do not "fix" the 2 pre-existing failures; they are out of scope and silently repairing them
hides whether your change regressed something.

Adding a vitest config that changes which files are collected is a regression, not a
passing gate: the collected-file count must not drop.

## shadcn

Initialize the official registry only because `components.json` is absent. Add Button,
Badge, Card, Tabs, Select, Sheet, Skeleton, Tooltip, Separator. Restyle them with the
existing semantic tokens; shadcn's default palette must not leak in. Do not invent a
parallel component system, and do not add React Bits or anime.js.

## Definition of done

- Root `layout.tsx` is providers/metadata only; public and admin navigation never render
  together; `AccountNav` lives in the admin layout.
- `PublicShell` renders skip link → `PublicNav` → `<main id="main">` → `PublicFooter`.
- Light is the default theme and both themes render every existing route correctly.
- `StatePanel` covers loading, empty, error, stale and restricted per `DESIGN.md`, with
  skeletons that preserve heading structure.
- One `<h1>` per page; skip link is the first tab stop and visibly focuses; mobile nav is
  operable; no horizontal scroll at 390px.
- No `border-left`/`border-right` above 1px anywhere in the diff.

## Gates

Targeted first, then the cross-cutting gates:

```bash
pnpm vitest run test/public-shell.test.tsx
pnpm lint
pnpm test
pnpm build
pnpm test:e2e test/e2e/public-intelligence.spec.ts
```

Then Impeccable `critique` and `audit` against the built shell, with records persisted under
`.impeccable/`. Every P0/P1 finding is fixed or carries an explicit Human Owner waiver — no
agent may waive its own finding.

Final-build browser screenshots at 390, 768 and 1440 in both themes, captured **after** all
fixes, stored under `design/shots/public-task2/`.

## Evidence

Record RED/GREEN/REFACTOR with the exact commands and their exit codes, the files changed,
browser evidence paths, the Impeccable record paths, rollback notes, and `EFFICIENCY_RECORD`.
Keep Pact evidence under 4 KB and link the detailed report at
`.superpowers/sdd/2026-07-23-tradelinks-phase1-public-intelligence/task-2-report.md`.

Report unavailable token telemetry as `UNAVAILABLE`; never estimate it as fact.

## Prohibited

- No production or staging deployment; no Vercel, Railway, Neon production mutation.
- No database work of any kind — this is a frontend shell task.
- No legacy route retirement, no `/zh` redirect implementation (that is Task 9), no `0014`.
- No weakening of Auth, evidence, readiness, cache, SEO or accessibility gates.
- No push or merge without explicit Human Owner authorization.
- No claim that the seven-day P0 has passed.
