# Phase 1 Public Intelligence Task 1 — Verification Record

**Feature:** phase1-public-intelligence
**Task:** public-content-schema
**Date:** 2026-07-29
**Worker:** opencode (deepseek/deepseek-v4-pro)
**Reviewer:** claude (claude-opus-5)
**Risk Class:** HIGH_RISK

## Branch Identity

- Branch id:   `br-plain-truth-ao4ndjrm`
- Branch name: `phase1-public-pre-migration`
- Parent:      `br-autumn-smoke-aof5n7pe` (production)
- Default:     `false`
- Protected:   `false`
- Project:     `steep-bird-11404641`
- Compute endpoint: `ep-dark-resonance-aol8malu`

Migrations 0011 and 0012 were pre-applied on this isolated branch by the orchestrator.
DATABASE_URL/DIRECT_URL are process-scoped, never persisted.

## RED (before implementation)

```bash
pnpm vitest run test/public-read-model.test.ts test/public-channel-consistency.test.ts
```

Result: Test Files 2 failed (2), Tests 0. Failed to load `../src/public-intelligence/query.js` — read model absent.

## GREEN (targeted gate — rework v2)

```bash
pnpm db:validate                    # exit 0, schema valid
pnpm exec prisma migrate status     # 13 migrations, up to date (0013_phase1_public_content)
pnpm vitest run test/public-read-model.test.ts test/public-channel-consistency.test.ts test/canonical-publish.test.ts
pnpm lint                           # exit 0
git diff --check                    # clean
```

GATE_EXIT=0

### Test Results

- `test/public-read-model.test.ts`: 49 tests passed
  - verified listing excludes non-public versions (5 — presence + draft/notCurrent/unreviewed/monitored absence)
  - monitored listing (2 — presence + STALE absence)
  - slug lookup returns null for non-public states (4)
  - serializer visibility invariants (4)
  - serialized output omissions and ordering (9)
  - fingerprint determinism (4)
  - pagination, limits, and cursor round-trip (7 — invalid limits, undecodable cursor rejects, repeat-order stability, cursor page-through no-duplicates/no-gaps, nextCursor null on final page)
  - schema constraints and reverse relations exercised on branch (8 — Guide + 2 GuideEvidence create/read, @@unique([guideId,url]) reject, @@unique([guideId,position]) reject, Briefing + BriefingEntry create/read, @@unique([kind,periodKey]) reject, @@unique([briefingId,position]) reject, Source.guideEvidence reverse relation, CanonicalChangeVersion.briefingEntries reverse relation, LegacyRedirect write+read+default 308)
  - PUBLIC_CACHE contract (3)
  - legacy Alert exclusion (1)
  - correctionHistory filters DRAFT versions (1)

- `test/public-channel-consistency.test.ts`: 5 tests passed (runId-scoped)
  - all projections share versionId, fingerprint, permalink
  - fingerprint matches SHA-256 of id|version|updatedAt

- `test/canonical-publish.test.ts`: 22 tests passed (no regression)

Total targeted: 3 files / 76 tests passed (49+5+22).

## Full Suite

```bash
pnpm exec vitest run --exclude test/foundation-backfill.test.ts  # 58 files / 547 tests passed
pnpm vitest run test/foundation-backfill.test.ts                 # 6 passed / 2 endpoint-guard refusals
pnpm build                                                    # compiled; 18/18 static pages
```

The two isolated `foundation-backfill.test.ts` failures are the expected safety behavior of `isApprovedApplyTarget()`: the new Public migration branch is intentionally absent from the Foundation apply allowlist. The other 58 files and 547 tests pass. The endpoint guard was not weakened or extended for this task.

## Reviewer Incident and Recovery

During the final review, the reviewer passed the temporary branch's `DIRECT_URL` as Prisma's shadow database. Prisma reset and replayed that branch while a test process was running. This destroyed only the temporary branch state; production and staging were never connected or modified.

The orchestrator then reset `br-plain-truth-ao4ndjrm` from its exact parent `br-autumn-smoke-aof5n7pe`, discarded the incident state, and freshly replayed migrations `0011`, `0012`, and `0013`. Post-recovery evidence:

- `prisma migrate deploy`: all three pending migrations applied successfully;
- `prisma migrate status`: 13 migrations found, database up to date;
- targeted Task 1 gate: 76/76 passed;
- regression gate excluding the unrelated Foundation apply guard: 547/547 passed;
- `pnpm lint`, `git diff --check`, and `pnpm build`: exit 0.

## Migration

- `prisma/migrations/0013_phase1_public_content/migration.sql` — additive only
  - Creates enum `BriefingKind` (WEEKLY, MONTHLY, DAILY)
  - Creates 5 tables: Guide, GuideEvidence, Briefing, BriefingEntry, LegacyRedirect
  - Adds foreign keys (ON DELETE RESTRICT ON UPDATE CASCADE) and unique indexes
  - Removed spurious DROP INDEX lines for items_title_trgm/items_title_en_trgm (raw-SQL indexes from 0002)
  - No DROP, rename, or destructive changes
  - `_prisma_migrations` reconciled: old name `20260729115613_0013_phase1_public_content` → `0013_phase1_public_content`

## Scope

Files created/modified:
- `prisma/schema.prisma` — additive: BriefingKind enum + 5 models + reverse relations
- `prisma/migrations/0013_phase1_public_content/migration.sql` — additive migration
- `src/public-intelligence/types.ts` — CanonicalPublicRecord, PublicFilters, PublicPage, VersionWithEvidence (with exact Prisma enum types)
- `src/public-intelligence/query.ts` — getPublicChangeBySlug, listPublicChanges (cursor fail-closed)
- `src/public-intelligence/serialize.ts` — assertPublicVersion, serializeCanonicalVersion (hoisted ROLE_ORDER, DRAFT correction exclusion)
- `src/public-intelligence/cache.ts` — PUBLIC_CACHE
- `test/public-read-model.test.ts` — 49 tests (visibility, serialization, cursor pagination, schema constraints, reverse relations, legacy Alert exclusion, DRAFT correction filter)
- `test/public-channel-consistency.test.ts` — 5 tests (channel contract, runId-scoped)
- `docs/superpowers/verification/2026-07-29-phase1-public-task1-efficiency.md` — this file
- `.agent/CURRENT.md` — task status update

No public routes, UI, navigation, feeds, APIs, Telegram, Auth, workers, cloud configuration, staging, or production changes.

## Rollback

Forward-only: code rollback leaves additive public tables present. Never run a down migration. Never overwrite production.

## EFFICIENCY_RECORD

```
feature: phase1-public-intelligence
task: public-content-schema
risk_class: HIGH_RISK
orchestrator_model: gpt-5.6-sol
worker_model: deepseek/deepseek-v4-pro
reviewer_model: claude-opus-5
gross_tokens: UNAVAILABLE
cached_input_tokens: UNAVAILABLE
uncached_input_tokens: UNAVAILABLE
output_tokens: UNAVAILABLE
worker_runs: 3
reviewer_runs: 3
targeted_gate_runs: 7
full_gate_runs: 4
wall_clock_minutes: 95
budget_result: PASS
verification_record: docs/superpowers/verification/2026-07-29-phase1-public-task1-efficiency.md
```

Pactify and the providers did not expose token counters, so the numeric 20M/30M token thresholds cannot be certified exactly. `PASS` here records compliance with the measurable controls: three bounded worker runs, three independent reviewer runs, no model substitution, no scope expansion, and no production mutation. Two failed Claude ACP launch attempts occurred before any reviewer model session; switching the same Claude Opus 5 seat to CLI transport resolved the runner fault.
