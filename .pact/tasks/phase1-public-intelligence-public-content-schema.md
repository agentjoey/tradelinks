# Public Intelligence Task 1 — Public Content Schema and Canonical Read Model

## Context

Implement Task 1 from `docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md`. Foundation and Operations Tasks 1–2 are already present on the base commit. This task creates the additive public-content schema and the single server-only public read contract used by later pages, feeds, APIs, reports, and Telegram work.

The historical plan calls this migration `0012_phase1_public_content`, but the repository already contains `0012_phase1_publication_review_fields`. The authoritative path for this task is therefore:

- `prisma/migrations/0013_phase1_public_content/migration.sql`

Never edit or replay an existing migration. The later retirement migration will be `0014`.

## Scope

Modify or create only:

- `prisma/schema.prisma`
- `prisma/migrations/0013_phase1_public_content/migration.sql`
- `src/public-intelligence/types.ts`
- `src/public-intelligence/query.ts`
- `src/public-intelligence/serialize.ts`
- `src/public-intelligence/cache.ts`
- `test/public-read-model.test.ts`
- `test/public-channel-consistency.test.ts`
- `docs/superpowers/verification/2026-07-29-phase1-public-task1-efficiency.md`
- `.agent/CURRENT.md` only for a concise task status update
- this Pact task/report/evidence metadata

Do not change public routes, UI, navigation, feeds, APIs, Telegram, Auth, workers, cloud configuration, staging, or production. Do not deploy.

## Data Model Contract

Add the plan's additive public-content models and enum exactly, while wiring all required reverse relations in the existing models:

- `BriefingKind { WEEKLY MONTHLY DAILY }`
- `Guide`
- `GuideEvidence`
- `Briefing`
- `BriefingEntry`
- `LegacyRedirect`

Use the exact fields, defaults, arrays, uniqueness constraints, and relations from the plan's `Public Data Model` section. Preserve every existing model and migration. The migration must contain no `DROP`, rename, destructive data rewrite, or change to existing enum members.

## Public Read Contract

Create the exact public DTO shape from the plan:

- `CanonicalPublicRecord`
- `PublicFilters`
- `PublicPage`
- `VersionWithEvidence`
- `getPublicChangeBySlug(slug: string): Promise<CanonicalPublicRecord | null>`
- `listPublicChanges(filters: PublicFilters): Promise<PublicPage>`
- `serializeCanonicalVersion(version: VersionWithEvidence): CanonicalPublicRecord`
- `PUBLIC_CACHE`

The query path is server-only and reads `CanonicalChangeVersion`, never `Alert` or `DailyNote`. A public canonical version must satisfy all of:

- `isCurrent = true`
- `editorialStatus = PUBLISHED`
- `reviewedAt` is non-null
- readiness is `MONITORED` or `VERIFIED`
- `pool: "verified"` returns only `VERIFIED`
- the explicit monitored pool may return `MONITORED` and `VERIFIED`, never `EXPERIMENTAL`, `UNAVAILABLE`, or `STALE`

Use deterministic ordering and bounded limits. Reject invalid limits rather than silently issuing an unbounded query. Experimental demand remains a separate future query and never serializes as `CanonicalPublicRecord`.

The serializer must enforce the visibility invariant itself, not trust callers. It must:

- produce `https://tradelinks.us/changes/<slug>` permalinks;
- derive one deterministic SHA-256 fingerprint from the current version identity/version/update timestamp;
- include only normalized evidence summaries and public provenance fields;
- exclude evidence excerpts, license-restricted full text, prompts, reviewer identities/email, credentials, private identity, and drafts;
- order evidence and correction history deterministically;
- include correction history without exposing unpublished version bodies.

`PUBLIC_CACHE` must encode the plan's current Task 1 cache facts: live changes revalidate after 900 seconds; canonical change after 3600 seconds; tags are deterministic and include `changes`, plus `change:<id>` for a detail record.

## TDD and Behavior Evidence

Strict RED → GREEN → REFACTOR is mandatory. Write tests first and record the observed failure caused by the missing read model/schema. Tests must name the production mutation they catch and assert observable returned records, Prisma query results, or serialization output—not mock call counts.

Minimum cases:

1. verified listing excludes drafts, non-current versions, unreviewed versions, monitored versions, stale versions, and legacy Alerts;
2. monitored listing includes only reviewed current `MONITORED|VERIFIED` versions;
3. slug lookup returns null for every non-public state;
4. serializer rejects unpublished/unreviewed/non-current/out-of-pool input;
5. output omits excerpt, reviewedBy, actionTemplateReviewedBy, credentials, and unpublished version bodies;
6. evidence/correction ordering and fingerprint/permalink are deterministic;
7. changing public version identity/version/update timestamp changes the fingerprint;
8. test-local web/feed/API projections consume the serializer's fingerprint and permalink unchanged, establishing the future channel contract without adding placeholder production channel modules;
9. invalid limits fail closed and pagination/order are stable;
10. new schema constraints and reverse relations are exercised on the isolated database branch.

Use run-scoped fixture IDs and FK-safe cleanup. Tests may write only test-prefixed rows on the supplied temporary Neon branch.

## Migration Safety

The orchestrator created temporary Neon branch `phase1-public-pre-migration` (`br-plain-truth-ao4ndjrm`) in project `steep-bird-11404641`, derived from production. Existing migrations `0011` and `0012` were applied there before implementation. The worker process receives `DATABASE_URL` and `DIRECT_URL` for this branch only; never print or persist them.

Before applying `0013`, assert branch id/name/parent/default/protected state without printing credentials. Apply via `prisma migrate deploy`, validate schema/status, and compare migration SQL with the Prisma model. Production, staging, and their connection strings are forbidden.

Rollback is forward-only: code rollback leaves additive public tables present; data investigation creates or preserves an isolated branch; never run a down migration and never overwrite production.

## Exact Gates

RED first:

```bash
pnpm vitest run test/public-read-model.test.ts test/public-channel-consistency.test.ts
```

GREEN/reviewer gate:

```bash
pnpm db:validate
pnpm exec prisma migrate status
pnpm vitest run test/public-read-model.test.ts test/public-channel-consistency.test.ts test/canonical-publish.test.ts
pnpm lint
git diff --check
```

Because this is a schema/migration task, run the full suite and build once only after the targeted gate is green:

```bash
pnpm test
pnpm build
```

## Pact and Efficiency Contract

- owner seat: `opencode`, role `worker-ds`, model `deepseek/deepseek-v4-pro`
- reviewer seat: `claude`, role `claude-opus5-reviewer`, model `claude-opus-5`
- risk class: `HIGH_RISK`
- warning: 20,000,000 gross tokens
- hard stop: 30,000,000 gross tokens
- one worker session and one reviewer session; at most three review rounds
- one command launch per long gate; poll no more often than once per 60 seconds
- checkpoint evidence at most 4 KB; detailed evidence lives in the report/verification file
- if provider token fields are unavailable, record `UNAVAILABLE`; never invent totals

Write the compact implementation report to:

`.superpowers/sdd/2026-07-23-tradelinks-phase1-public-intelligence/task-1-report.md`

It must include RED, GREEN, REFACTOR, migration branch identity, exact commands/results, commit(s), changed-file scope, self-review, concerns, and this record:

```text
EFFICIENCY_RECORD
feature: phase1-public-intelligence
task: public-content-schema
risk_class: HIGH_RISK
orchestrator_model: gpt-5.6-sol
worker_model: deepseek/deepseek-v4-pro
reviewer_model: claude-opus-5
gross_tokens: <integer or UNAVAILABLE>
cached_input_tokens: <integer or UNAVAILABLE>
uncached_input_tokens: <integer or UNAVAILABLE>
output_tokens: <integer or UNAVAILABLE>
worker_runs: <integer>
reviewer_runs: <integer>
targeted_gate_runs: <integer>
full_gate_runs: <integer>
wall_clock_minutes: <integer>
budget_result: PASS|WARNING|WAIVER
verification_record: docs/superpowers/verification/2026-07-29-phase1-public-task1-efficiency.md
```

Checkpoint only after committing all task files. Return `DONE`, commit SHAs, one-line gate summary, and concerns. The worker must never accept its own task.

Create the named verification record as a concise, repository-tracked summary of the branch identity, RED/GREEN commands, migration result, scope, rollback checkpoint, and final `EFFICIENCY_RECORD`. Keep raw logs out of Pact state.

## Definition of Done

All later public channels have one immutable DTO and one visibility policy; the additive `0013` migration is proven on the named non-production branch; exact targeted/full gates pass; no legacy/public/private state leaks into the DTO; an independent Claude Opus 5 reviewer accepts the committed task; no deployment or production mutation occurs.
