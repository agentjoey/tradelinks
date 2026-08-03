# Public Intelligence Task 6 — Canonical Scoped Feeds

## Context

Implement Task 6 from `docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md`.

Tasks 1–5 are accepted. This task replaces the legacy alert feed with canonical, scoped RSS
and is the first surface where the project's "every channel reads the same canonical version"
invariant becomes externally observable.

Worktree: `/Users/xtation/AgentWorks/worktrees/tradelinks-phase1-public-intelligence`.
Never write anything irreplaceable under `/private/tmp`.

## Models

- Worker: **Kimi Code, `kimi-code/k3`** (pact role `kimi-k3-worker`).
- Reviewer: **Claude Code, `claude-opus-5`**, fresh context.

A worker never self-accepts.

## The invariant this task must actually enforce

`test/public-channel-consistency.test.ts` already asserts that web, feed, API, briefing and
Telegram projections share a `versionId`, `fingerprint` and canonical permalink. It asserts
that over **projection objects**, not over rendered XML.

If you render the feed through a parallel formatting path, those tests keep passing while the
real XML drifts. That would make the suite say "channels agree" when they do not.

So:

- `renderPublicFeed` consumes `serializeCanonicalVersion` output. It does not re-read the
  database with its own query shape and does not recompute a fingerprint.
- Add assertions over the **rendered XML string** that the `versionId`, `fingerprint` and
  permalink present in the XML are byte-identical to the ones the serializer produced for the
  same record. Not "contains a fingerprint" — the same one.
- If you find yourself formatting a field the serializer already formats, stop and reuse it.

## Feed contract

Four feeds plus a redirect:

| Route | Scope |
|---|---|
| `/feeds/changes.xml` | Verified-pool canonical changes |
| `/feeds/platforms/[platform].xml` | that platform only |
| `/feeds/categories/[category].xml` | that category only |
| `/feeds/briefings.xml` | published briefings |
| `/feed.xml` | **308** to `/feeds/changes.xml` |

Each item carries: title, the concise public summary, market, platform, product categories,
readiness, published and effective dates, the canonical permalink as `<link>`, the **version
ID as `<guid>`** (`isPermaLink="false"`), and evidence links.

Hard rules:

- **Maximum 50 items** per feed.
- **Normalized summaries only.** Never third-party full text — the evidence records carry
  normalized summaries precisely so feeds can quote without republishing licensed content.
- **No private fields.** No `profileId`, no relevance score, no seller profile data, no draft,
  rejected, non-current or below-Monitored record. A scoped feed excludes unrelated records
  rather than including and hiding them.
- **Cache headers from `PUBLIC_CACHE`.** Do not invent a second caching policy.
- An unknown platform or category scope returns **404**, not an empty feed. An empty feed for
  a scope that exists is fine and correct.

## XML correctness — the classic failure

Hand-built XML strings break on the first title containing `&`, `<`, `>`, `"` or `'`, and on
control characters that survive scraping. A feed that fails to parse is worse than no feed:
readers silently drop it.

- Escape all five XML entities in every interpolated value, including titles, summaries,
  source names and URLs.
- Emit a correct XML declaration and content type (`application/rss+xml; charset=utf-8`).
- **Test with a real parser.** Assert the output parses, not merely that it contains
  substrings. Include a fixture whose title contains `&`, `<`, a straight quote and an
  apostrophe, and assert it round-trips.

## `/feed.xml` is cutover-adjacent

`app/feed.xml/route.ts` currently serves legacy Wire alerts via `getAlerts`. Replacing it with
a 308 changes what existing RSS subscribers receive. That is correct at cutover and this
branch is undeployed, so implement it — but state plainly in your report that legacy RSS
subscribers move from Wire alerts to canonical changes the moment this branch deploys, so
Task 9's cutover checklist owns announcing it.

Do not touch anything else under `app/(legacy)/`.

## Scope

Create or modify only:

- `src/public-intelligence/feeds.ts`
- `app/feeds/changes.xml/route.ts`
- `app/feeds/platforms/[platform].xml/route.ts`
- `app/feeds/categories/[category].xml/route.ts`
- `app/feeds/briefings.xml/route.ts`
- `app/feed.xml/route.ts` (replace with the 308)
- `app/sitemap.ts` (only if feeds belong in it — justify either way in the report)
- `test/public-feeds.test.ts`
- this Pact task's report/evidence metadata

Do not touch: `src/public-intelligence/{types,query,serialize,cache,coverage,search,guides,briefings}.ts`
(accepted contracts — consume them), `app/(public)/**`, `app/(legacy)/**`, `app/admin/**`,
`middleware.ts`, Auth, Prisma schema or migrations, `vitest.config.ts`, `playwright.config.ts`,
earlier tasks' tests, or cloud configuration.

## Standing rule from Task 5

Any test invoking a function that recomputes or refreshes **all** rows of a shared table must
snapshot and restore that table, and no fixture may depend on shared state such a function can
rewrite. `refreshCapabilityReadiness` is the known instance. Keep your fixtures run-scoped and
clean them in FK-safe order.

## Gates

```bash
cd /Users/xtation/AgentWorks/worktrees/tradelinks-phase1-public-intelligence
set -a && . ./.env && set +a
pnpm exec prisma migrate status          # warms the Neon compute; do this first
pnpm vitest run test/public-feeds.test.ts test/public-channel-consistency.test.ts
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Baseline: **666 passed / 2 failed (668)**, 64/65 files, only `test/foundation-backfill.test.ts`
failing (endpoint allowlist, by design). Do not repair it. No new failures, no drop in
collected files.

Run the full suite **twice** and show both failure sets. Passing once is not evidence against
a race.

Strict TDD: RED with real output, GREEN, REFACTOR with the same command rerun unchanged.

Then Impeccable `critique` and `audit` — note that these are XML endpoints, not visual
surfaces, so scope the review to what applies (correctness, headers, error states) and say so
rather than inventing UI findings.

No screenshots are required for XML routes. Instead, capture the actual `curl -i` output for
each of the five routes into your report: status, content type, cache headers, item count.

## Evidence

RED/GREEN/REFACTOR with exact commands and exit codes, files changed, the `curl -i` captures,
confirmation that rendered XML parses and that its versionId/fingerprint/permalink are
byte-identical to the serializer's, Impeccable record paths, rollback notes,
`EFFICIENCY_RECORD`. Keep Pact evidence under 4 KB and link
`.superpowers/sdd/2026-07-23-tradelinks-phase1-public-intelligence/task-6-report.md`.

Report unavailable token telemetry as `UNAVAILABLE`. State plainly anything you could not
verify.

## Stop and report instead of deciding

Print `BLOCKED:` and stop. Three of your escalations across Tasks 3 and 5 were upheld; the one
scope question you resolved alone in Task 4 was sent back. Escalating is the cheaper path.

- Any need to touch a file outside the scope list.
- Any need for a migration or schema change.
- Any disagreement with an accepted contract.
- Any destructive or irreversible command.

## Prohibited

No production or staging deployment. No Neon, Vercel or Railway mutation. No migration. No
legacy route retirement beyond the `/feed.xml` redirect this task owns, no `/zh` work, no
`0014`. No `git push`, no merge, no `git reset --hard`. No `pactify seat use`. No claim that
the seven-day P0 has passed.

## Amendment — the two dynamic feed routes (granted 2026-08-03)

Granted after the worker escalated a fourth time. The plan prescribes file paths that Next.js
cannot serve, and the worker proved it empirically before asking.

Verified independently at source: `next/dist/server/app-render/get-segment-param.js` treats a
segment as dynamic only when `segment.startsWith("[") && segment.endsWith("]")`. A folder named
`[platform].xml` ends in `.xml`, so it registers as a **static** segment matching only its own
literal name. There is no implementation that satisfies both the prescribed filenames and the
prescribed URLs. This is a plan defect.

Amended file list — these replace the two `[platform].xml` / `[category].xml` entries:

- `app/feeds/platforms/[platform]/route.ts`
- `app/feeds/categories/[category]/route.ts`

The external URL contract is unchanged and remains binding:

| Request | Expected |
|---|---|
| `/feeds/platforms/amazon-us.xml` | 200, Amazon US scope |
| `/feeds/platforms/amazon-us` | **404** — the `.xml` suffix is required |
| `/feeds/platforms/not-a-platform.xml` | **404** — unknown scope, not an empty feed |
| `/feeds/categories/pet-supplies.xml` | 200, that category |
| `/feeds/categories/pet-supplies` | **404** |

Dynamic segments match dot-containing values, so the handler receives
`params.platform === "amazon-us.xml"`. Require the suffix, strip it, validate the remainder
against the known platform/category enum, and 404 on anything else. Assert all five rows above
as real HTTP statuses in the tests.

`/feeds/changes.xml` and `/feeds/briefings.xml` stay as literal static folders — those are not
affected.

**Not authorised**: a `next.config.mjs` rewrite, a `middleware.ts` rewrite, or dropping the
`.xml` suffix from the public URL. The amended paths need no config change at all, which is why
they are the right answer.

Record in your report that the plan's file map was wrong here and why, so Task 7 does not copy
the same pattern for `/api/v1/...` routes.
