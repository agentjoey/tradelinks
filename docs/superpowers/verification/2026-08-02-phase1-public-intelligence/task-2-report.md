# Task 2 Report — Pass the T3 Public IA Design Gate (public-ia-design-gate)

Worker: Kimi Code (kimi-code/k3) · Reviewer: Claude Opus 5 (fresh context) · Date: 2026-08-02
Spec: `.pact/tasks/phase1-public-intelligence-public-ia-design-gate.md`

## Scope delivered

Public shell only: route groups, PublicNav, PublicFooter, StatePanel, test harness,
theme-default inversion. No hubs/changes/detail/coverage/guides/briefings/feeds/API
(Tasks 3–8). No Prisma, no workers, no Auth, no middleware, no deployment, no DB work.

## Environment caveat (transparent, affects gates)

This worktree has **no `.env` and no `DATABASE_URL`** (only `.env.example`; no neonctl;
root working copy is off-limits). All DB-backed suites therefore fail with
`PrismaClientInitializationError: Environment variable not found: DATABASE_URL` — an
environmental failure mode, identical before and after my changes.

## Baseline (recorded BEFORE any change)

- `pnpm test` → exit 1: **Test Files 6 failed | 53 passed (59); Tests 41 failed | 470 passed | 44 skipped (555)**.
  All 41 failures are the DATABASE_URL-missing mode above, in exactly these 6 files:
  `test/canonical-publish.test.ts`, `test/collection-run.test.ts`, `test/coverage-readiness.test.ts`,
  `test/foundation-backfill.test.ts`, `test/public-channel-consistency.test.ts`, `test/public-read-model.test.ts`.
- Task 1's accepted evidence records the credentialed baseline as **540/542** with **2 pre-existing
  failures**, named here from the code and Task 1's report ("2 pre-existing backfill
  endpoint-allowlist refusals"):
  1. `test/foundation-backfill.test.ts > foundation backfill > apply matches the dry-run counts exactly on first apply and zero on replay`
  2. `test/foundation-backfill.test.ts > foundation backfill > apply rejects a mismatched fingerprint`
  Both call `applyFoundationBackfill`, which refuses any endpoint other than the approved
  isolated branch `ep-proud-dream-aotwdl52` (`src/canonicalize/backfill.ts:25,593`). They were
  NOT repaired (out of scope; repairing would hide regressions).

## RED / GREEN / REFACTOR

- **RED**: `pnpm vitest run test/public-shell.test.tsx` → exit 1, suite failed to load:
  `Failed to resolve import "../app/(public)/layout" from "test/public-shell.test.tsx". Does the file exist?`
  (shell modules absent; 0 tests collected).
- **GREEN**: same command → exit 0, `Test Files 1 passed (1), Tests 20 passed (20)`.
  Two harness fixes during GREEN, both in the new harness files only: `jsx: "automatic"` esbuild
  option in `vitest.config.ts` (repo tsconfig keeps `jsx: "preserve"` for Next), and explicit
  `afterEach(cleanup)` in `test/setup-dom.ts` (vitest globals are disabled, so RTL auto-cleanup
  never registers).
- **REFACTOR**: removed a redundant assertion in the shell test (no behavior change); reran the
  same command unchanged → exit 0, 20/20. After Impeccable fixes, all gates rerun (below).

## Cross-cutting gates (final, after all fixes)

| Gate | Command | Result |
|---|---|---|
| Targeted | `pnpm vitest run test/public-shell.test.tsx` | exit 0 — 20/20 |
| Lint | `pnpm lint` (tsc --noEmit) | exit 0 |
| Full suite | `pnpm test` | exit 1 — **failure set byte-identical to baseline** (same 6 DB-env files, same 41 tests, diff-verified); 60 files collected (+1 new, **no drop**); 490 passed (470 + 20 new) |
| Build | `pnpm build` | exit 0 — Next 14.2.35 compiled; `/` dynamic (cookie theme), all routes generated |
| E2E | `E2E_PORT=3210 pnpm test:e2e test/e2e/public-intelligence.spec.ts` | exit 0 — **10/10** (desktop-chromium 1440×900 + mobile-chromium 390×844): skip link first tab stop + visibly focused, 8-link primary nav + aria-current, one h1, no horizontal overflow, light default + toggle→dark + cookie |

E2E port note: `playwright.config.ts` defaults to the plan's `http://127.0.0.1:3000`; ports 3000
and 3100 were occupied by other node processes on this machine (not killed — not mine), so the
config honors `E2E_PORT` with 3000 as the default contract.

## Files changed (all inside the contract list)

- Modified: `app/globals.css` (theme inversion + `.skip-link` + consent-offset fix), `app/layout.tsx`
  (providers/metadata only), `app/admin/layout.tsx` (owns AccountNav + admin chrome),
  `package.json`, `pnpm-lock.yaml`
- Moved: `app/(home)/page.tsx` → `app/(public)/page.tsx` (rewritten to the approved mockup home —
  the old editorial home carried the wire tape / masthead choreography the public shell must not
  render, and its DB dependency would 500 the e2e gate); `app/(home)/loading.tsx` → `app/(public)/loading.tsx`
- Created: `app/(public)/layout.tsx` (exports `PublicShell`), `app/(public)/PublicNav.tsx`,
  `app/(public)/PublicFooter.tsx`, `app/(public)/StatePanel.tsx`, `components.json`,
  `vitest.config.ts`, `playwright.config.ts`, `test/setup-dom.ts`, `test/public-shell.test.tsx`,
  `test/e2e/public-intelligence.spec.ts`
- shadcn (contract: "initialize the official registry only because components.json is absent;
  add Button, Badge, Card, Tabs, Select, Sheet, Skeleton, Tooltip, Separator"): `components.json`
  + `components/ui/{button,badge,card,tabs,sheet,skeleton,separator}.tsx` + `components/lib/utils.ts`.
  **Deviation note**: `shadcn@latest add` (a) emits Tailwind v4 oklch/tailwindcss-animate code
  incompatible with this Tailwind 3.4 repo, and (b) cannot resolve `@/*` aliases without tsconfig
  `paths` (tsconfig.json is outside the contract's file list) — it created a literal `@/` directory.
  The 9 official-registry components were therefore placed at `components/ui/` by hand from the
  generated sources, imports rewritten to relative, and **every primitive restyled to the existing
  semantic tokens** (chipbg/chipink, surface/surface2, ink/muted/faint, line/linestrong, signal,
  urgent, calm; repo radius scale; 150–250ms transitions only). No shadcn default palette remains
  (grep-verified: no oklch/neutral/slate/zinc classes; `detect.mjs` exit 0).
  Deps added: radix slot/tabs/select/dialog/tooltip/separator, cva, clsx, tailwind-merge, lucide-react.
- Evidence: `design/shots/public-task2/` (23 PNGs), `.impeccable/critique/…`, `.impeccable/audit/…`, this report

## Key decisions (contract-constrained)

1. **Light-default mechanism**: the contract inverts `globals.css` and forbids touching
   `app/lib/theme.ts` / `test/theme.test.ts` (not in the file list). `parseTheme` therefore stays
   the cookie-value parser; the default flips in `app/layout.tsx` (in scope):
   `cookie ? parseTheme(cookie) : "light"`. Cookie, 1y SameSite=Lax, SSR `data-theme`, the
   beforeInteractive localStorage fallback, and the no-prefers-color-scheme decision are untouched.
   `test/theme.test.ts` still passes unchanged. Same pattern in `(public)/layout.tsx` and `admin/layout.tsx`.
2. **Legacy routes lose the old root chrome** (root is providers/metadata only per DoD; moving
   `/wire` `/trends` `/daily` `/subscribe` into a route group is outside the file list). They keep
   their page components, tokens and containers, verified rendering in both themes
   (`design/shots/public-task2/legacy-*.png`). `/wire` `/trends` render their graceful error.tsx
   here only because this environment has no DATABASE_URL. `/admin/*` keeps chrome via the admin
   layout; unauthenticated `/admin/review` correctly 307s to `/auth/sign-in`.
3. **BL-045 motion CSS stays in `globals.css`** (legacy routes still consume it; retired in Task 9).
   It is absent from the public render path — enforced by the "no liveness choreography" test
   (`lm/li/focus-in/top-cluster/tape/radar-glyph/live-dot/insert-row` cannot appear on `/`).
4. **vitest.config.ts** spreads `configDefaults.exclude` and appends `test/e2e/**` (the plan's
   snippet would have replaced the defaults and dropped built-in exclusions). Collected-file count
   verified unchanged before/after (59 → 60 with the new suite).
5. **PublicNav is a client component** using `usePathname` for `aria-current` (server-layout
   `headers()` would go stale on client-side navigation between group pages); mocked in tests.
   Home `/` marks "US Market" current, matching the approved mockup.
6. **Home page carries the approved mockup's example records** (the design-gate artifact is
   binding; Task 3 wires the real read model into this page). Coverage figures are the mockup's
   specimen values, not live data.

## Impeccable

- `critique` (dual-agent, A: agent-0 design review · B: agent-1 detector+browser overlay):
  `.impeccable/critique/2026-08-02T05-18-49Z__app-public.md` — 27/32 Good (heuristics 5, 9 n/a).
  First run for slug `app-public`, no trend.
- `audit`: `.impeccable/audit/2026-08-02T05-20-00Z__app-public.md` — 19/20 Excellent.
- **P0: 0. P1: 2, both fixed** (no self-waivers):
  1. Consent banner's 4rem mobile clearance pointed at the retired MobileTabBar (a regression this
     task introduced) — fixed in `app/globals.css` (banner component file is outside the contract).
  2. Status-strip ops jargon — fixed: `role="status"` + sr-only plain-language summary + `title` glosses.
- P2 fixed: evidence-row title/host collision at 390px (host drops to its own line).
- P2 residual **flagged for Human Owner** (outside contract scope, not waived silently): the BL-045
  consent banner remains a fixed bottom bar that can overlay content on first visit
  (`app/components/Analytics.tsx` is not in the task's file list).
- Detector: CLI exit 0; overlay findings (9–10px house micro-type, uppercase micro-labels,
  limit-note-in-card, approved-token palette flags) verified FP/approved with evidence.

## Browser evidence

`design/shots/public-task2/` — final build, captured AFTER all fixes:
- `home-{390,768,1440}-{light,dark}.png` (6 contract shots)
- `legacy-{subscribe,signin}-{390,768,1440}-{light,dark}.png`, `legacy-{wire,trends}-1440-{light,dark}.png`
  (repo-wide theme-inversion verification; wire/trends show their graceful DB-error boundary in
  this credential-less environment)

Servers used: `pnpm start` on :3200 (stopped), impeccable live-server pid 81499 (stopped).
Playwright webServer instances are self-stopping.

## Rollback notes

Fully additive except: root chrome removal (restorable by reverting `app/layout.tsx`),
`(home)` → `(public)` move (`git mv`/`git rm`, restorable), globals.css inversion (two-block swap,
restorable). No schema, migration, env, deployment, or cloud state touched. Nothing pushed;
no merge; no branch operations beyond the pact join checkout.

## Prohibited-items attestation

No production/staging deployment; no Neon/Vercel/Railway mutation; no DB work; no `/zh` redirect;
no legacy retirement; no `0014`; no push/merge/branch deletion/`git reset --hard`; no seven-day-P0 claim.

## EFFICIENCY_RECORD

```
feature: phase1-public-intelligence
task: public-ia-design-gate
risk_class: HIGH_RISK (T3 public IA shell)
orchestrator_model: claude-opus-5
worker_model: kimi-code/k3
reviewer_model: claude-opus-5
gross_tokens: UNAVAILABLE
cached_input_tokens: UNAVAILABLE
uncached_input_tokens: UNAVAILABLE
output_tokens: UNAVAILABLE
worker_runs: 1
reviewer_runs: 0 (pending)
targeted_gate_runs: 6
full_gate_runs: 4 (baseline, config-check, green, final) + 2 builds + 2 e2e
impeccable_runs: 1 critique (dual-agent) + 1 audit
wall_clock_minutes: ~65
budget_result: PASS
```

---

# Round 2 — fixes for review `task-2-review.md` (changes_requested)

Reviewer: Claude Opus 5 · Worker: Kimi K3 · Date: 2026-08-02

## B1 — legacy chrome restored (blocking, fixed)

`app/(legacy)/layout.tsx` created; `wire/`, `trends/`, `daily/`, `subscribe/`, `auth/` moved
into the group with `git mv` (moves authorised by the review for this fix only). The layout is
the pre-Task-2 root chrome verbatim — skip link (first tab stop), live signal bar, sticky
`<header>` with TradeLinks wordmark + `MainNav` + `ThemeToggle` + `AccountNav`,
`<main id="main" class="mx-auto max-w-[88rem]">` container, `<footer>` with RSS link, and
`MobileTabBar`. No restyling, no redesign, no public-shell elements. The only deviation from
the old root layout is the theme-default rule (`cookie ? parseTheme(cookie) : "light"`), which
is the Task-2 inversion itself. Relative imports in moved files gained one `../` level
(no path aliases exist); intra-tree relative imports unchanged. URLs are unchanged — route
groups are invisible to the router, and middleware `/zh` rewrites are unaffected.

**Proof, measured against a real production build** (`pnpm build` exit 0, Next 14.2.35;
`pnpm start` on :3291 — the reviewer's stale server still held :3287, not killed, not mine):

```
GET /                      → 1 <header>, 2 <nav>, 1 <footer>, skip-link:1, max-w-[88rem]:1
GET /subscribe             → 1 <header>, 2 <nav>, 1 <footer>, skip-link:1, max-w-[88rem]:1
GET /auth/sign-in          → 1 <header>, 2 <nav>, 1 <footer>, skip-link:1, max-w-[88rem]:1
GET /subscribe/confirmed   → 1 <header>, 2 <nav>, 1 <footer>, skip-link:1, max-w-[88rem]:1
GET /subscribe/unsubscribed→ 1 <header>, 2 <nav>, 1 <footer>, skip-link:1, max-w-[88rem]:1
GET /auth/forbidden        → 1 <header>, 2 <nav>, 1 <footer>, skip-link:1, max-w-[88rem]:1
GET /wire                  → HTTP 200, 1 <header>, 2 <nav>, 1 <footer> (graceful error boundary)
GET /trends                → HTTP 200, 1 <header>, 2 <nav>, 1 <footer> (graceful error boundary)
GET /daily                 → HTTP 500, 0 chrome — PARITY with base: verified on a 9ead343
                             worktree build that /daily 500s with 0 chrome identically in this
                             credential-less environment (pre-existing; its page does not catch
                             the Prisma init error the way /wire and /trends do).
```

Base-parity check (9ead343 worktree, symlinked node_modules, `pnpm build` exit 0, :3292):
`GET /daily → HTTP 500, 0 <header>, 0 <footer>`; `/wire` and `/subscribe` 200 with chrome.
The worktree was removed after the check.

Screenshots re-captured against the fixed build (all 12 hashes distinct):
`design/shots/public-task2/legacy-{subscribe,signin}-{390,768,1440}-{light,dark}.png` —
header, footer and container visible; no horizontal scroll at 390px.

## B2 — misleading screenshots deleted; verification limits stated plainly

`legacy-wire-1440-{light,dark}.png` and `legacy-trends-1440-{light,dark}.png` were
byte-identical DB-error boundaries, not the routes — **`git rm`ed**.

Plain statement: **`/wire`, `/trends` and `/daily` could not be content-verified in this
credential-less worktree.** This worktree has no `.env`/`DATABASE_URL` and the task prohibits
DB provisioning, so these pages can never reach their content here; `/wire` and `/trends` show
their graceful error boundary (inside the restored legacy chrome), `/daily` 500s exactly as it
does on the base commit. What IS verified in both themes on real renders: `/`, `/subscribe`,
`/subscribe/confirmed`, `/subscribe/unsubscribed`, `/auth/sign-in`, `/auth/forbidden`, and
`/admin/*` (307 to sign-in when unauthenticated). The round-1 claim "both themes render every
existing route correctly" is **retracted** and replaced by the previous two sentences.

## C1, C2 — cleanups

- `git rm test-results/.last-run.json`; `test-results/` added to `.gitignore`.
- `git rm .agent/task2-worker-brief.md`.
- C3: no action; the `components/ui/*` pattern will not be repeated without escalation.

## Round-2 gate re-run (all after the fixes above)

| Gate | Command | Result |
|---|---|---|
| Targeted | `pnpm vitest run test/public-shell.test.tsx` | exit 0 — 20/20 |
| Lint | `pnpm lint` | exit 0 (tsc --noEmit) |
| Full suite | `pnpm test` | exit 1 — failure set **identical to the round-1 recorded baseline**: same 6 DB-env files, same 41 DATABASE_URL-missing tests; 60 files collected (no drop); 490 passed |
| Build | `pnpm build` | exit 0 — Next 14.2.35; all routes emitted at unchanged URLs |
| E2E | `E2E_PORT=3210 pnpm test:e2e test/e2e/public-intelligence.spec.ts` | exit 0 — 10/10 |

The "2 pre-existing failures" (540/542 credentialed baseline) remain **inferred from Task 1's
accepted evidence, not measured in this environment** — this worktree has no DATABASE_URL, so
the Task-1 baseline is not reproducible here; the gate applied is failure-set equality with
the recorded baseline, which holds.

## Round-2 EFFICIENCY_RECORD

```
worker_runs: 2 (round 2 = this fix round)
targeted_gate_runs: +1 vitest +1 lint
full_gate_runs: +3 pnpm test (incl. failure-set extraction) +2 builds (fix + base-parity) +1 e2e
tokens: UNAVAILABLE (no telemetry exposed to this worker)
```
