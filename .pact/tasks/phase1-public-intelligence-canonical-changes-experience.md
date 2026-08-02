# Public Intelligence Task 4 — Canonical Changes Experience

## Context

Implement Task 4 from `docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md`.

Tasks 1–3 are accepted. You have the public read contract
(`src/public-intelligence/{types,query,serialize,cache}.ts`), the public shell
(`app/(public)/layout.tsx`, `PublicNav`, `PublicFooter`, `StatePanel`, `components/ui/`),
and the hub layer (`coverage.ts`, `IntelligenceCard`, `ReadinessBadge`, `CoveragePanel`,
nine routes).

This task builds `/changes` (the searchable index) and `/changes/[slug]` (the canonical
permalink page that RSS, the API and Telegram will all point at). It does not build guides
or briefings (Task 5), feeds (Task 6), or the API (Task 7).

`DESIGN.md` and `design/phase1-public-intelligence.html` are binding. Your targets in the
mockup are **Surface 3 (`/changes`)** and **Surface 4 (`/changes/[slug]`)**. Match them.
Reuse `IntelligenceCard` rather than inventing a second card.

## Models

- Worker: **Kimi Code, `kimi-code/k3`** (pact role `kimi-k3-worker`).
- Reviewer: **Claude Code, `claude-opus-5`** (pact role `claude-opus5-reviewer`), fresh context.

A worker never self-accepts. If the worker model is unavailable, stop and get owner approval.

## Three plan corrections — read before you start

**1. The opaque cursor helper already exists.** The plan says it is "from Task 7". It is not:
Task 1 shipped `encodeCursor` / `decodeCursor` in `src/public-intelligence/query.ts`, with
tests for page-through, `nextCursor` null on the final page, undecodable-cursor rejection,
and non-integer limit rejection. **Reuse them.** Do not build a second cursor scheme and do
not wait for Task 7.

**2. Search ships unindexed in Phase 1, deliberately.** The plan says search uses
"PostgreSQL full-text/trigram indexes". No such index exists on `CanonicalChangeVersion` —
the only `pg_trgm` GIN indexes in this repo are on `items` from migration 0002. Adding one
means a migration, and migrations are out of scope for this task.

The decision, recorded so it is not mistaken for an oversight: Phase 1 ships search without
a dedicated index. Canonical changes are curated and low-volume (hundreds, not millions), so
a scan is acceptable at this size. **Task 8 owns performance** and adds the index when
measured numbers justify it.

You must therefore:
- Implement search correctly but without assuming an index exists.
- Record the current published-version row count in your evidence.
- State in your report that the index is deferred to Task 8, with the row count that
  justified deferring.

Do not add a migration. Do not silently claim the plan's indexed search was implemented.

**3. `Track this change` is not shipped.** The plan points it at `/onboarding?change=[id]`.
`/onboarding` is defined only in the Private Relevance plan and does not exist. The Human
Owner already ruled the identical case for `Track this category` on 2026-08-02: omit the
entry point rather than ship a 404 on a public indexable page. The same ruling applies here.
Do not substitute `/subscribe` and do not build a placeholder route.

## The loading-skeleton trap — read this twice

Task 3 removed `app/(public)/loading.tsx` because a route-group `loading.tsx` flushes the
shell before `notFound()` runs, turning every gated 404 into a soft-200. That fix is locked
by `test/e2e/public-hubs.spec.ts`.

`/changes/[slug]` is gated the same way: an unpublished or unknown slug must return a real
404. **A `loading.tsx` at `app/(public)/changes/` would cover `[slug]` as a child segment and
reintroduce exactly that bug.**

So: do **not** add `app/(public)/changes/loading.tsx`. If `/changes` needs a loading state —
and per `DESIGN.md` §States it does — use a `<Suspense>` boundary **inside**
`app/(public)/changes/page.tsx`, wrapping only the results list, with a skeleton that
preserves the page's heading structure. The page shell renders immediately; only the list
suspends. `/changes/[slug]` gets no loading boundary above it at all.

Add a test that a nonexistent slug returns a real 404, in the e2e spec, so this cannot
regress.

## Scope

Create or modify only:

- `src/public-intelligence/search.ts`
- `app/(public)/FilterBar.tsx`
- `app/(public)/ShareButton.tsx`
- `app/(public)/EvidenceList.tsx`
- `app/(public)/changes/page.tsx`
- `app/(public)/changes/[slug]/page.tsx`
- `app/sitemap.ts` (modify — published canonical changes become sitemap entries)
- `test/public-search.test.ts`
- `test/canonical-change-page.test.tsx`
- `test/e2e/public-changes.spec.ts` (new — status gate for unknown slugs)
- this Pact task's report/evidence metadata

Do not touch: `src/public-intelligence/{types,query,serialize,cache}.ts` (accepted Task 1
contract — consume it), `coverage.ts`, `app/(legacy)/**`, `app/admin/**`, `middleware.ts`,
Auth, Prisma schema or migrations, `vitest.config.ts`, `playwright.config.ts`, Task 2's
`test/e2e/public-intelligence.spec.ts`, Task 3's `test/e2e/public-hubs.spec.ts`, or cloud
configuration.

## Behaviour contract

**Default pool is Verified.** `parsePublicSearchParams` returns `pool: "verified"` for an
absent, empty, unknown or hostile value. An invalid filter never widens the result set and
never leaks drafts, rejected records, non-current versions, or below-Monitored content.

**Allowed filters**: `pool`, `signal`, `platform`, `category`, `from`, `to`, `q`, `cursor`.
Anything else is ignored, not echoed back into the page, and never reaches a query.

**`pool=experimental-demand`** reads the separate demand repository and always renders the
boundary copy. It never merges into the canonical stream and never claims a bestseller, a
launch recommendation, or a market-size estimate.

**Evidence order on the detail page is stable**: `PRIMARY_OFFICIAL`, then
`SUPPORTING_OFFICIAL`, then `SECONDARY_CONTEXT`. Inaccessible and disallowed evidence is
labelled as such, per the mockup, rather than omitted.

**The detail page shows**, per Surface 4 of the mockup: readiness, version and current
status, published and effective dates, last review, authority, what changed, who it hits,
the reviewed action template **only** when the record has reviewed primary-official evidence
and a reviewed action template, full evidence, correction history with every prior version
addressable, and a "what this does not tell you" boundary block.

**Canonical URL excludes filters.** `ShareButton` shares only `record.permalink` — no query
string, no tracking parameters. Use `navigator.share({ title, url })` when available and
copy the permalink otherwise.

**An unknown or unpublished slug returns a real HTTP 404** and is absent from the sitemap.

## Gates

```bash
set -a && . ./.env && set +a
pnpm vitest run test/public-search.test.ts test/canonical-change-page.test.tsx
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Baseline: **606 passed / 2 failed (608)** measured 2026-08-02. The 2 failures are
`test/foundation-backfill.test.ts` endpoint-allowlist refusals — by design. Do not repair
them. Your gate is no new failures against that baseline, and the collected-file count must
not drop.

Strict TDD: RED with real command output, GREEN, REFACTOR with the same command rerun
unchanged.

Then Impeccable `critique` and `audit`, records under `.impeccable/`. Fix every P0 and P1;
you may not waive your own finding.

Final-build screenshots after all fixes into `design/shots/public-task4/`: `/changes` and
`/changes/[slug]` at 390, 768 and 1440 in both themes. Real rendered content — an error
boundary is not evidence a route works, and two byte-identical files are not two pieces of
evidence.

Clean up any seeded data on the non-production branch and say so in your evidence.

## Evidence

RED/GREEN/REFACTOR with exact commands and exit codes, files changed, the published-version
row count that justified deferring the search index, browser evidence paths, Impeccable
record paths, rollback notes, `EFFICIENCY_RECORD`. Keep Pact evidence under 4 KB and link
`.superpowers/sdd/2026-07-23-tradelinks-phase1-public-intelligence/task-4-report.md`.

Report unavailable token telemetry as `UNAVAILABLE`. State plainly anything you could not
verify and why — a disclosed gap is accepted, an overstated claim is not.

## Stop and report instead of deciding

Print `BLOCKED:` and stop. Both Task 3 escalations were correct and both were ruled in your
favour; escalating is not a failure.

- Any need to touch a file outside the scope list.
- Any need for a migration or schema change.
- Any disagreement with `DESIGN.md` or the approved mockup.
- Any need for a route that does not exist yet.
- Any destructive or irreversible command.

## Prohibited

No production or staging deployment. No Neon, Vercel or Railway mutation. No migration. No
`/zh` redirect work and no legacy retirement (Task 9). No `git push`, no merge, no
`git reset --hard`. No `pactify seat use` — identity comes from `PACT_AGENT_ID`. No claim
that the seven-day P0 has passed.
