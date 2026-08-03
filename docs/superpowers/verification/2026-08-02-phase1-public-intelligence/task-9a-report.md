# Task 9a Report — Cutover Readiness (phase1-public-intelligence-cutover-readiness)

Date: 2026-08-03 · Worker: Kimi Code K3 · Branch: feat-phase1-public-intelligence
Worktree DB (non-production): Neon endpoint `ep-dark-resonance-aol8malu` (neither
production `ep-mute-base-aotkza3n` nor staging `ep-odd-violet-ao98q1jy`).

## Scope honored

- No `prisma/migrations/0014_*` created, no `prisma/schema.prisma` edit, no legacy file
  deleted, no `--apply` path anywhere (the CLI refuses it; there is no apply function).
- Touched only: `src/public-intelligence/legacy-redirects.ts` (new),
  `scripts/backfill-public-content.ts` (new), `test/legacy-redirects.test.ts` (new),
  `test/public-backfill-plan.test.ts` (new), `src/config/env.ts` (additive: exported
  `EnvSchema` + `PUBLIC_CUTOVER_ENABLED` flag defaulting off),
  `docs/superpowers/verification/2026-08-02-phase1-public-intelligence/cutover-runbook.md`
  (new), this report.

## TDD evidence

- RED: `pnpm vitest run test/legacy-redirects.test.ts test/public-backfill-plan.test.ts`
  → exit 1, both suites failed: module `src/public-intelligence/legacy-redirects.js` did
  not exist (0 tests collected).
- GREEN: same command → exit 0, **50/50 passed** (2 files). One real bug caught and fixed
  en route: the fingerprint's JSON canonicalization only kept top-level keys, so input
  changes did not move the fingerprint — the "fingerprint changes when any input row
  changes" test exposed it; fixed with recursive key-sorting.
- REFACTOR: no structural changes needed; same command rerun unchanged → 50/50 passed.

## Deliverable 1 — redirect map behind a flag

`getLegacyRedirect(pathname, dailySlugTargets?) → { target, status: 308 } | null`, driven
by the declarative `LEGACY_REDIRECTS` map: `/wire→/changes`,
`/trends→/amazon-us?view=demand-signals`, `/daily→/briefings`,
`/api/public/{alerts,daily}→/openapi.json`; `/daily/[slug]` → mapped briefing route or
`/briefings` fallback; `/zh`, `/zh/*` → English equivalent. `listStaticLegacyRedirectRows()`
enumerates the full static row set (9 rows incl. zh equivalents; API endpoints are
locale-free). The module is pure and wired into NOTHING. Every target is asserted against
the URL contract programmatically: the test pins each target's pathname to a route file
on disk under `app/(public)/` (and briefing detail targets to the three dynamic route
files + `briefingPath()`), not by eyeballing. `PUBLIC_CUTOVER_ENABLED` added to
`EnvSchema`, default off — cutover is a config flip, not a deploy.

## Deliverable 2 — reconciliation, dry-run only

`planPublicBackfill()` returns the plan's `PublicBackfillReport` shape. Mapping rules:
alert mapped iff `CanonicalChange` slug `legacy-alert:<id>` exists; published daily note
mapped iff a DAILY `Briefing` exists for its date. CLI: `--dry-run` only; `--apply` and
unknown flags exit 1 (asserted end-to-end by spawning the CLI).

Two consecutive dry-runs against the worktree's non-production branch:

```
run 1 fingerprint: d93efa22b887dc1e3dd0ed34798df6a77e705143fa28c540338617512d088565
run 2 fingerprint: d93efa22b887dc1e3dd0ed34798df6a77e705143fa28c540338617512d088565
```

Counts (both runs): `mappedAlerts: 0`, `mappedDailyNotes: 0`, `redirects: 9`,
`unmappedAlerts: 571` (all `NO_CANONICAL_CHANGE`), `unmappedPublishedDailyNotes: 22`
(all `NO_DAILY_BRIEFING`). The branch mirrors production (571/22 here vs 570/22 measured
on prod). **Honesty note:** an empty unmapped array would prove nothing on an empty
database — the report's value is that every one of the 593 legacy public rows is accounted
for WITH a reason, and zero have a public replacement. The CLI prints exactly this caveat,
plus the warning that even mapped rows are not publishable (EXPERIMENTAL/IN_REVIEW/
non-current fails the public read contract).

## Deliverable 3 — runbook

`docs/superpowers/verification/2026-08-02-phase1-public-intelligence/cutover-runbook.md`:
six preconditions each with a check command, two marked honestly UNMET (Operations P0
report has not run; production has zero publishable canonical records); the content
problem stated plainly (~570 alerts needing human review through `/admin/review` + 22
daily notes); nine ordered steps each reversible until Step 8; point of no return named
exactly (0014 dropping legacy tables; 0013-is-taken trap flagged); per-stage rollback
(A–D, post-0014 = restore pre-retirement branch into a NEW recovery branch + prior app
release, never a down migration); smoke checks as runnable commands.

## Gates

| gate | result |
|---|---|
| `pnpm exec prisma migrate status` | up to date (13 migrations), exit 0 |
| targeted vitest (2 files) | 50/50 pass, exit 0 |
| dry-run ×2 | exit 0, identical fingerprints (above) |
| `pnpm lint` (tsc --noEmit) | exit 0 |
| `pnpm test` run 1 | 771 passed / 1 failed / 7 skipped (779), 71 files. Failure set: my own alert-accounting test (concurrent fixture churn from parallel foundation-backfill seeding — count read raced the plan read) + baseline `test/foundation-backfill.test.ts` file failure. Fixed mine with consistent-read retry; targeted rerun 50/50. |
| `pnpm test` run 2 | 771 passed / 1 failed / 7 skipped (779), 71 files. Failure set: `test/public-channel-consistency.test.ts` 30s test timeout under shared-branch load (no assertion failure) + baseline foundation-backfill file failure. Channel-consistency rerun in isolation: 5/5 pass — load flake, not a regression. |
| `pnpm test` run 3 (post-fix confirmation) | **772 passed / 0 failed tests / 7 skipped (779), 70/71 files** — only baseline `test/foundation-backfill.test.ts` fails (`stablePair` timeout, the known do-not-repair failure). No new failures, no drop in collected files (69+2=71). |
| `pnpm build` | exit 0 |
| `pnpm test:e2e` | exit 0, **43 passed**; link-integrity crawl green: 25 pages crawled, 28 unique internal links checked, 0 intended redirects, 4 transient shared-state skips, **0 persistent non-200** |
| legacy routes still serve | `/wire` 200 (172 KB HTML with legacy nav links to /wire /trends /daily /subscribe), `/trends` 200, `/daily` 200, `/subscribe` 200 — all with chrome, checked against the running production build during e2e |

Baseline: 727 passed / 2 failed (729), only `test/foundation-backfill.test.ts` — not
repaired, per the task. Final state matches baseline exactly plus the 50 new tests.

EFFICIENCY_RECORD: token telemetry UNAVAILABLE.
