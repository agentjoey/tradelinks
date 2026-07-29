# Phase 1 Public Intelligence Task 1 — Verification Record

**Feature:** phase1-public-intelligence
**Task:** public-content-schema
**Date:** 2026-07-29
**Worker:** opencode (deepseek/deepseek-v4-pro)
**Reviewer:** claude (claude-opus-5)
**Risk Class:** HIGH_RISK

## Branch Identity

- Isolated branch: ep-dark-resonance-aol8malu (Neon project steep-bird-11404641)
- Pre-loaded with migrations 0001–0012
- DATABASE_URL/DIRECT_URL process-scoped, never persisted

## RED

```bash
pnpm vitest run test/public-read-model.test.ts test/public-channel-consistency.test.ts
```

Result: Test Files 2 failed (2), Tests 0. Failed to load `../src/public-intelligence/query.js` — read model absent.

## GREEN (Targeted Gate)

```bash
pnpm db:validate                    # exit 0, schema valid
pnpm exec prisma migrate status     # 13 migrations, up to date
pnpm vitest run test/public-read-model.test.ts test/public-channel-consistency.test.ts test/canonical-publish.test.ts  # 61 tests passed
pnpm lint                           # exit 0
git diff --check                    # clean
```

### Test Results Detail

- `test/public-read-model.test.ts`: 34 tests passed
  - verified listing excludes non-public versions (3)
  - monitored listing (2)
  - slug lookup returns null for non-public states (4)
  - serializer visibility invariants (4)
  - serialized output omissions and ordering (9)
  - fingerprint determinism (4)
  - pagination and limits (4)
  - PUBLIC_CACHE contract (3)
  - new schema constraints exercised (1)

- `test/public-channel-consistency.test.ts`: 5 tests passed
  - all projections share versionId, fingerprint, permalink
  - fingerprint matches SHA-256 of id|version|updatedAt

- `test/canonical-publish.test.ts`: 22 tests passed (no regression)

GATE_EXIT=0

## Full Suite

```bash
pnpm test   # 59 files, 538/540 passed (2 pre-existing backfill refusals on unapproved endpoint)
pnpm build  # Next.js 14.2.35 compiled successfully, 18/18 static pages, type check passed
```

The 2 failures in `foundation-backfill.test.ts` are pre-existing — the backfill module rejects non-approved database endpoints. Not caused by this task.

## Migration

- `prisma/migrations/20260729115613_0013_phase1_public_content/migration.sql` — additive only
  - Creates enum `BriefingKind` (WEEKLY, MONTHLY, DAILY)
  - Creates tables: Guide, GuideEvidence, Briefing, BriefingEntry, LegacyRedirect
  - Adds foreign keys, unique indexes
  - Removed spurious DROP INDEX lines for items_title_trgm/items_title_en_trgm (raw-SQL indexes from 0002)
  - No DROP, rename, or destructive changes

## Scope

Files created/modified:
- `prisma/schema.prisma` — added BriefingKind enum + 5 models + reverse relations
- `prisma/migrations/20260729115613_0013_phase1_public_content/migration.sql` — additive migration
- `src/public-intelligence/types.ts` — CanonicalPublicRecord, PublicFilters, PublicPage, VersionWithEvidence
- `src/public-intelligence/query.ts` — getPublicChangeBySlug, listPublicChanges
- `src/public-intelligence/serialize.ts` — assertPublicVersion, serializeCanonicalVersion
- `src/public-intelligence/cache.ts` — PUBLIC_CACHE
- `test/public-read-model.test.ts` — 34 tests for visibility/serialization
- `test/public-channel-consistency.test.ts` — 5 tests for channel contract

No public routes, UI, navigation, feeds, APIs, Telegram, Auth, workers, cloud configuration, staging, or production changes.

## Rollback

Forward-only: code rollback leaves additive public tables present. Never run a down migration. Never overwrite production.

## EFFICIENCY_RECORD

See `.superpowers/sdd/2026-07-23-tradelinks-phase1-public-intelligence/task-1-report.md`
