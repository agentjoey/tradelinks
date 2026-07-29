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

## GREEN (targeted gate — rework v1)

```bash
pnpm db:validate                    # exit 0, schema valid
pnpm exec prisma migrate status     # 13 migrations, up to date (0013_phase1_public_content)
pnpm vitest run test/public-read-model.test.ts test/public-channel-consistency.test.ts test/canonical-publish.test.ts
pnpm lint                           # exit 0
git diff --check                    # clean
```

GATE_EXIT=0

### Test Results

- `test/public-read-model.test.ts`: 36 tests passed
  - verified listing excludes non-public versions (3 — presence + absence)
  - monitored listing (2 — presence + absence)
  - slug lookup returns null for non-public states (4)
  - serializer visibility invariants (4)
  - serialized output omissions and ordering (9)
  - fingerprint determinism (4)
  - pagination and limits (4)
  - PUBLIC_CACHE contract (3)
  - new schema constraints exercised (1)
  - legacy Alert exclusion (1)
  - correctionHistory filters DRAFT versions (1)

- `test/public-channel-consistency.test.ts`: 5 tests passed
  - all projections share versionId, fingerprint, permalink
  - fingerprint matches SHA-256 of id|version|updatedAt

- `test/canonical-publish.test.ts`: 22 tests passed (no regression)

Total targeted: 3 files / 63 tests passed.

## Full Suite

```bash
pnpm test   # 59 files, 540/542 passed (2 pre-existing backfill refusals on unapproved endpoint)
pnpm build  # Next.js 14.2.35 compiled successfully, 18/18 static pages, type check passed
```

The 2 failures in `foundation-backfill.test.ts` are pre-existing — the backfill module's `isApprovedApplyTarget()` rejects non-approved database endpoints. Not caused by this task.

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
- `test/public-read-model.test.ts` — 36 tests (visibility, serialization, legacy Alert exclusion, DRAFT correction filter)
- `test/public-channel-consistency.test.ts` — 5 tests (channel contract)
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
worker_runs: 2
reviewer_runs: 1
targeted_gate_runs: 3
full_gate_runs: 1
wall_clock_minutes: ~120
budget_result: PASS
verification_record: docs/superpowers/verification/2026-07-29-phase1-public-task1-efficiency.md
```
