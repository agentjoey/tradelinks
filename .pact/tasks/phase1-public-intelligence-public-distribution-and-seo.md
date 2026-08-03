# Public Intelligence Task 8 — Public Telegram, SEO, and the Link Debt

## Context

Implement Task 8 from `docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md`,
plus three debts this task owns because they are SEO- and link-shaped.

Tasks 1–7 are accepted. After this task the public product should be complete and provably
sound: every internal link resolves, every indexable page is indexable, and distribution is
evidence-safe. Task 9 is the cutover and depends on that being true.

Worktree: `/Users/xtation/AgentWorks/worktrees/tradelinks-phase1-public-intelligence`.

## Models

- Worker: **Kimi Code, `kimi-code/k3`** (pact role `kimi-k3-worker`).
- Reviewer: **Claude Code, `claude-opus-5`**, fresh context.

A worker never self-accepts.

## Two scope corrections to the plan — read first

**1. `middleware.ts` is OUT of scope.** The plan lists it as "Modify" without saying why. It
currently carries Neon Auth session refresh, the GET-probe normalization that Foundation Task 6
needed a full rework round to get right, and locale routing. None of this task's work needs it:
sitemap, robots and metadata are their own files, and `/zh` redirects belong to Task 9. If you
find a genuine need, **escalate** — do not edit it.

**2. `src/push/*` is live production code.** `channel-push.ts` runs the BL-039 channel push
against the real Telegram channel. Your changes to `channel-select.ts`, `channel-render.ts` and
`send.ts` must be **strictly additive**: the legacy selection and rendering path stays
byte-identical in behaviour, its existing tests stay green untouched, and the public path is a
separate entry point. Adding a parameter with a default that changes legacy behaviour is not
additive.

## The three debts this task closes

### Debt 1 — `platform:amazon-us` is mis-graded, and the nav links a 404

`src/canonicalize/coverage.ts` grades `platform:amazon-us` as `UNAVAILABLE`, so
`canRenderHub` returns false and `/amazon-us` returns 404 — while `PublicNav` links it
statically on every public page.

The grade is wrong on its own terms. That same entry lists four working public sources
(`AMZ-ANNOUNCEMENTS`, `AMZ-PRICING-PAGE`, F01, F11) and known gaps reading "public
announcements and pricing-page diffs only". The coverage page's own published glossary says
*Unavailable: no lawful public route to the authoritative source* and *Monitored: published and
watched, but not confirmed to that standard*. Amazon US has a lawful public route; it cannot
reach the authoritative page. That is Monitored.

Owner decision 4 of 2026-08-02, the approved mockup, and that glossary all agree.

**Fix**: regrade `platform:amazon-us` to `MONITORED`. Keep every `knownGaps` entry **verbatim**
— they are the honesty, and they do not change. Keep a hard ceiling so it can never reach
`VERIFIED` while the authoritative channel is login-walled. Re-seed so the stored capability
matches. Assert in a test that the ceiling holds even if every source is healthy.

Do not change any other capability's grade.

### Debt 2 — `test/public-seo.test.ts` has a 5000 ms budget it cannot hold

Measured by the reviewer: 5008/5010/5008 ms on three standalone runs against a polluted
database; after the database was cleaned, 3957 ms standalone but still failing under full-suite
load. The budget is too tight for a remote Neon query and has been since Task 3 created it.

Fix it properly rather than by raising the number alone: reduce what the assertion has to fetch,
or scope the query, and then set a budget with real headroom. State the measured margin in your
report.

### Debt 3 — the site-wide internal-link integrity crawl, owed since Task 3

Every public page's internal links must resolve. This has been asserted by inspection three
times and never proved.

Build it as an e2e spec, `test/e2e/public-link-integrity.spec.ts`: start from `/`, walk every
public route in the URL contract, collect every internal `href`, and assert each returns **200**
or an **intended** redirect status. A 404 fails the suite and names the page and link.

It must catch the `/amazon-us` case if Debt 1 regresses. Verify that by temporarily breaking it
locally, confirming the crawl fails, then restoring — and say in your report that you did.

Known state going in: `/api/v1/changes` now serves 200 after Task 7; `/amazon-us` is the only
known remaining 404 and Debt 1 fixes it. The crawl must **prove** the final count is zero rather
than anyone asserting it.

## Public Telegram

Sends only `VERIFIED`, current versions with `urgency >= 70`. Once per version per channel —
idempotent against the existing `ChannelPush` tracking. Message carries title, concise public
impact, readiness, effective date, and the canonical permalink. It never sends personal impact,
relevance, or actions, and never a draft, rejected, non-current or below-Monitored record.

Reuse the accepted read layer. Same invariant as Tasks 6 and 7: no new query shape, no
recomputed fingerprint, and the permalink in the message is the serializer's.

## Sitemap, robots, metadata

**Sitemap** includes: public hubs at Monitored or better, supported recurring topics, published
canonical changes, published guides, published briefings. It excludes: filter URLs, draft
guides, empty briefing periods, below-Monitored hubs, and anything private.

The plan's example assertion hard-codes `pet-supplies` as excluded. **All six category
capabilities are currently `MONITORED`, so that assertion would fail.** Seed a below-Monitored
capability in the test and assert its hub is absent — do not hard-code a category name.

**Robots** allows public pages; disallows `/admin`, `/auth`, `/my`, `/onboarding/preview`, and
non-public API paths. Task 7 shipped `/api/v1` and `/openapi.json` as deliberately public
machine surfaces — decide whether each should be crawlable and **justify the choice in your
report**. Blocking the whole of `/api` without thinking is how a public API becomes invisible to
the agents it was built for.

**Metadata**: canonical URLs, unique per-page descriptions, and `Article` / `BreadcrumbList`
JSON-LD carrying no claim the record does not support. Readiness must not be rendered as a
quality or endorsement signal in structured data.

## Scope

Create or modify only:

- `src/public-intelligence/telegram.ts`
- `src/push/channel-select.ts`, `src/push/channel-render.ts`, `src/push/send.ts` — additive only
- `src/canonicalize/coverage.ts` — Debt 1, the one capability grade plus its ceiling
- `src/workers/seed-sources.ts` — only if re-seeding the regraded capability requires it
- `app/sitemap.ts`, `app/robots.ts`, `app/layout.tsx`
- `test/public-telegram.test.ts`
- `test/public-seo.test.ts` — Debt 2
- `test/e2e/public-link-integrity.spec.ts` — Debt 3
- this Pact task's report/evidence metadata

Do not touch: `middleware.ts`, `src/public-intelligence/{types,query,serialize,cache,coverage,search,guides,briefings,feeds,api}.ts`
(accepted contracts — consume them), `app/(public)/**` except as required by a metadata change
you can justify, `app/(legacy)/**`, `app/admin/**`, `app/api/**`, `app/feeds/**`, Auth, Prisma
schema or migrations, `.env`, `vitest.config.ts`, `playwright.config.ts`, earlier tasks' tests,
or cloud configuration.

## Standing rules

- Any test invoking a function that recomputes or refreshes **all** rows of a shared table must
  snapshot and restore it. `refreshCapabilityReadiness` is the known instance.
- Parallel suites share one Neon branch. A retry anchored to the exact string
  `Inconsistent query result` is acceptable in test code only, never in product code.
- **Clean your fixtures.** Interrupted runs have polluted this branch before; 91 orphaned
  canonical changes had to be removed manually. Use run-scoped prefixes and FK-safe teardown,
  and verify counts at the end.

## Gates

```bash
cd /Users/xtation/AgentWorks/worktrees/tradelinks-phase1-public-intelligence
set -a && . ./.env && set +a
pnpm exec prisma migrate status          # warms the Neon compute; do this first
pnpm vitest run test/public-telegram.test.ts test/public-seo.test.ts
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Baseline: **716 passed / 2 failed (718)**, 67/68 files, only `test/foundation-backfill.test.ts`
failing (endpoint allowlist, by design). Do not repair it. No new failures, no drop in collected
files. Run the full suite **twice** and show both failure sets.

Strict TDD: RED with real output, GREEN, REFACTOR with the same command rerun unchanged.

Then Impeccable `critique` and `audit`.

## Browser verification — the plan's requirement, and it is the point of this task

From the **final build after all fixes**, inspect at 1440×900 and 390×844: home, `/us`,
`/amazon-us`, `/shopify-us`, one category hub, `/changes`, one change detail, `/guides`,
`/briefings`, `/coverage`. Both themes.

Verify and state explicitly: keyboard navigation reaches every interactive control; reduced
motion is honoured; content is present with JavaScript disabled; evidence blocks cause no layout
shift; no request goes to a worker endpoint.

Screenshots into `design/shots/public-task8/`, sha256-distinct, real content.

## Evidence

RED/GREEN/REFACTOR with exact commands and exit codes, files changed, the measured `public-seo`
margin, the link-crawl result with the exact count of internal links checked and non-200s found,
confirmation that you broke and restored `/amazon-us` to prove the crawl catches it, your robots
decision for `/api/v1` and `/openapi.json` with reasoning, browser evidence paths, Impeccable
record paths, rollback notes, `EFFICIENCY_RECORD`. Keep Pact evidence under 4 KB and link
`.superpowers/sdd/2026-07-23-tradelinks-phase1-public-intelligence/task-8-report.md`.

Report unavailable token telemetry as `UNAVAILABLE`. State plainly anything you could not verify.

## Stop and report instead of deciding

Print `BLOCKED:` and stop. Five of your escalations have been upheld; the one scope question you
resolved alone was sent back.

- Any need to touch `middleware.ts` or any file outside the scope list.
- Any need for a migration or schema change.
- Any change to `src/push/*` that is not strictly additive.
- Any capability grade other than `platform:amazon-us`.
- Any destructive or irreversible command.

## Prohibited

No production or staging deployment. No Neon, Vercel or Railway mutation. No migration. No
legacy route retirement, no `/zh` redirect work, no `0014` — those are Task 9. No real Telegram
send: the public channel path must be exercised against a fake sender in tests. No `git push`,
no merge, no `git reset --hard`. No `pactify seat use`. No claim that the seven-day P0 has
passed.
