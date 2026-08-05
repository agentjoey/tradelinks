# TradeLinks Agent Handoff

Date: 2026-07-28

Repository: `/Users/xtation/AgentWorks/CodeSpace/tradelinks`

Current milestone: Phase 1 Intelligence Foundation accepted and deployed to protected staging; Public Intelligence cutover has not started; production is unchanged.

## Read First

Read these files in order before taking an action:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `.agent/CURRENT.md`
4. `.agent/HANDOFF.md` (this file)
5. `docs/superpowers/specs/2026-07-23-tradelinks-phase-1-product-structure-design.md`
6. `docs/superpowers/plans/2026-07-23-tradelinks-phase1-foundation.md`
7. `docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md`
8. `docs/superpowers/plans/2026-07-23-tradelinks-phase1-operations-cost.md`
9. `docs/superpowers/plans/2026-07-23-tradelinks-phase1-private-relevance.md`
10. `docs/superpowers/plans/2026-07-28-tradelinks-development-efficiency-optimization.md`
11. `docs/pactify-usage-feedback.md`

Do not infer current behavior from old Wire/Radar/Daily documentation when the Phase 1 plan or current code says otherwise.

## Start-of-Session Checklist

```bash
git status -sb
git pull --ff-only          # only when the worktree is clean
cat .agent/CURRENT.md
cat .agent/HANDOFF.md
pactify validate
pactify status
```

Then bind the correct seat if this working copy is not already bound:

```bash
pactify seat use <seat-id>
pactify join --roles <roles>
```

Do not expose credentials or paste `.env` contents into logs or handoffs.

## Git and Release State

| Item | Current state |
|---|---|
| Local branch | `main` at `d89839f` |
| Local vs `origin/main` | ahead by 111 commits |
| `origin/main` | `5f620bc`; Foundation not merged |
| Feature branch | `feat-phase1-foundation` at `d89839f` |
| Staging branch | `origin/staging` at `d89839f` |
| Production branch | `origin/production` at `048d747` |
| Draft PR | [#3 — Phase 1 foundation: evidence-ready intelligence model](https://github.com/agentjoey/tradelinks/pull/3) |
| Working tree at handoff | clean |

Do not push local `main` to `origin/main`, merge PR #3, or promote staging to production without explicit Human Owner direction.

Pact reports all eight Foundation tasks as accepted but the feature remains `in_progress` because it has not been formally merged/shipped. Do not rewrite `.pact/STATE.yml` by hand to change that status.

## Agent Roster and Model Decisions

- Codex 5.6 Sol: orchestrator.
- Kimi Code: designated Foundation worker. The original default was K3; only Task 8 was explicitly changed to K2.7.
- Claude Code: independent reviewer. The owner changed the reviewer pin from Opus 4.8 to Opus 5 for subsequent Foundation reviews.
- A worker never self-accepts.
- Task 8 used a fresh Codex 5.6 Sol fallback worker only after Kimi K2.7 quota exhaustion and owner-approved recovery. Do not treat that as standing authorization for future model substitution.

Future task specs must state the exact worker/reviewer model. If the provider fails, stop and request owner approval before changing the worker or reviewer.

## Foundation Outcome

The accepted feature contains eight tasks:

1. Taxonomy and readiness policy.
2. Forward-only intelligence schema.
3. Source contracts and offline fixtures.
4. Collection run/source-check ledger.
5. Canonical clustering and classification.
6. Immutable publication, rejection, and forward correction.
7. Coverage readiness and admin visibility.
8. Deterministic legacy backfill.

Final integrated gate:

```bash
pnpm db:validate
pnpm lint
pnpm test
pnpm build
pnpm tsx scripts/backfill-phase1-foundation.ts --dry-run
```

Last accepted results:

- Prisma schema valid.
- TypeScript clean.
- 53 test files; 426/426 tests passed.
- Next.js production build succeeded; 18/18 static pages.
- Legacy backfill fingerprint `7b91ebd2cf2a6179c42c7f67af964cc3ae38318e96b3a1b905a87880c7ec5332` on the isolated verification branch.
- 552 legacy Alerts converted and 18 explicitly rejected as `SOURCE_NOT_FOUND`.
- Backfilled versions are `EXPERIMENTAL`, `IN_REVIEW`, non-current; inherited evidence is `SECONDARY_CONTEXT`.

Verification record: `docs/superpowers/verification/2026-07-28-tradelinks-phase1-foundation-verification.md`.

## Staging State

Stable protected URL:

```text
https://tradelinks-git-staging-agentjoeys-projects.vercel.app
```

Current code commit at the alias: `d89839f`.

Final docs-only Vercel deployment observed during handoff: `dpl_FuaiiwcyZLwdXXSmxytAhYWuQoUe`, status READY. Use the stable alias as the durable target; individual deployment IDs are historical observations.

Neon staging:

- branch: `br-delicate-snow-aoi9sgtw`
- endpoint: `ep-odd-violet-ao98q1jy`
- migration state: 12/12 up to date, including `0011` and `0012`
- pre-migration checkpoint: `br-orange-king-ao98kiew`, no compute, scheduled to expire `2026-08-04T12:00:00Z`

Staging branch-specific Preview variables point Database/Auth to staging. Resend, Telegram, X, channel push, translation, and Daily autopublish are disabled or isolated. Vercel Deployment Protection remains enabled.

Authenticated CLI smoke already passed for public pages, RSS, robots, sitemap, sign-in, session proxy, public API with browser User-Agent, and unauthenticated admin redirects. The latest error/500 scan was empty.

## Pending Staging Checks

The Human Owner still needs to complete one explicit staging journey with the production-shaped account:

1. Open the protected staging alias while signed into Vercel.
2. Complete Google OAuth sign-in.
3. Confirm authenticated `/admin/review` loads.
4. Confirm authenticated `/admin/sources` loads.
5. If OAuth fails, check that the staging/custom origin exists in Neon Auth `trusted_origins`; do not weaken CSRF or cookie settings.

Staging canonical backfill has not been applied. The last staging dry-run reported:

| Counter | Value |
|---|---:|
| sourceItems | 520 |
| clusters | 552 |
| canonicalChanges | 552 |
| versions | 552 |
| evidenceRecords | 555 |
| rejectedRows | 18 (`SOURCE_NOT_FOUND`) |

The current apply allowlist intentionally authorizes only the expired/isolated Foundation verification endpoint, not staging. Do not weaken it or apply to staging until a task explicitly requires the data, a fresh checkpoint exists, the exact endpoint is approved, and the owner authorizes apply.

## Production Boundary

- Production web traffic still uses the legacy Wire/Radar/Daily product.
- Production database has not received Foundation migrations `0011`/`0012` through this work.
- No Public Intelligence replacement route has been cut over.
- P0 has not passed; it requires seven consecutive production days meeting source SLA and global-gap checks.
- Google Ads, Plus payments, store connections, and the Phase 2 Operator Agent remain out of scope.

## Recommended Next Development Sequence

1. Complete the staging Google OAuth/admin human check.
2. Obtain owner decisions for the efficiency policy in `docs/superpowers/plans/2026-07-28-tradelinks-development-efficiency-optimization.md`.
3. Implement Operations Tasks 1–2: finite dispatch/locks/retry and resumable collection/canonicalization batches.
4. Start Public Intelligence Task 1: Public Content Schema and one canonical read model.
5. Complete Operations Tasks 3–5 before production exposure.
6. Pass the Public Intelligence T3 information-architecture owner gate.
7. Build Public Intelligence Tasks 3–8 against fixtures/staging.
8. Run the seven-day P0 burn-in.
9. After P0 passes, execute Public Intelligence Task 9 production cutover and legacy retirement.
10. Begin Private Relevance only after Foundation, Public Intelligence, and P0 are accepted.

Critical dependency:

```text
Foundation accepted
    ├── Operations Tasks 1–5 ──> seven-day P0 ──┐
    └── Public Tasks 1–8 ───────────────────────┤
                                                └── Public Task 9 cutover
                                                        └── Private Relevance
```

## Non-Negotiable Product Decisions

- Phase 1 market is the United States.
- Phase 1 platforms are Amazon US and Shopify US.
- Initial public hubs are Consumer Electronics, Pet Supplies, Beauty & Personal Care, Toys & Children's Products, Home & Kitchen, and Apparel & Accessories.
- Signal Type, Product Category, and Risk Attribute remain separate.
- Public policy/compliance conclusions require readiness and evidence gates.
- Experimental demand signals cannot claim a bestseller, launch recommendation, or guaranteed opportunity.
- Seller Profile is limited to operating stage, US market, platform, and at most two categories.
- Phase 1 does not connect stores or execute actions externally.
- Prisma migrations are forward-only and require a fresh Neon backup/branch checkpoint.
- Real-time behavior is not a product promise; prefer Railway Cron, finite workers, sleeping scraper, ISR, and cache.
- Validation-period core infrastructure target is approximately $25–50/month without paid proxies or commercial market data as a core dependency.

## Decisions That Still Need the Human Owner

1. Whether strict token hard stops become mandatory or remain report-only.
2. Exact model pin for future Kimi worker tasks; Task 8's K2.7 change was task-specific.
3. Whether the redesigned Phase 1 public IA is English-only with permanent `/zh` redirects, as the current Public Intelligence plan proposes.
4. Whether to merge PR #3 to `origin/main` before beginning the next feature.
5. When, and under which newly approved endpoint allowlist, staging canonical backfill may be applied.
6. Whether seller identity remains the application-owned Magic Link design in the Private Relevance plan or is replaced with a verified managed-provider design before Private Task 1.

## Safe Baseline Verification

For a clean checkout, preserve this order:

```bash
pnpm install
pnpm db:gen
pnpm test
pnpm lint
```

Run `pnpm build` for a release or cross-cutting gate. DB-backed Foundation tests require an explicitly approved non-production database target; do not point them at production. Always resolve and verify the Neon branch identity before a database write.

## Handoff Update Rule

Before another agent pauses or transfers ownership, update this file with:

- current branch and commit
- dirty files and ownership
- current Pact feature/task/status
- exact last passing and failing commands
- current staging/production boundary
- database branch/checkpoint identity and expiry
- token budget and waiver status
- next single executable action
- actions that remain prohibited without owner approval

Never record secrets, raw tokens, cookies, database passwords, or OAuth credentials.
