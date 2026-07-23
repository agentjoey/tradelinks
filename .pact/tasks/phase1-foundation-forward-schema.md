# Phase 1 Foundation — Task 2: Forward-Only Intelligence Schema

Owner: `kimi`  
Reviewer: `claude`  
Orchestrator: `codex` (coordination only; no implementation or task acceptance)  
Plan source: Task 2 in `docs/superpowers/plans/2026-07-23-tradelinks-phase1-foundation.md`

## 目标 / Goal

Add the Phase 1 enums, additive intelligence models, relations, and forward migration while preserving every legacy table. Prove that a canonical change cannot have two current versions and document the new content chain and forward-only rollback checkpoint.

## 改文件 / Files

Only these files are in scope:

- Modify `prisma/schema.prisma`
- Create `prisma/migrations/0011_phase1_intelligence_foundation/migration.sql`
- Create or modify `test/canonical-publish.test.ts` only for the schema-contract coverage owned by this task
- Modify `docs/architecture.md`

Do not edit runtime writers, public routes, unrelated migrations, deployment configuration, or generated Prisma client files.

## 契约 / Contract

Use the exact enum and model names, fields, relations, defaults, and uniqueness constraints in the plan's Data Model Contract. Produce Prisma clients for:

- `pipelineRun`
- `sourceCheck`
- `evidenceCluster`
- `canonicalChange`
- `canonicalChangeVersion`
- `evidenceRecord`
- `coverageCapability`

The SQL must create `CanonicalChangeVersion_one_current` as a partial unique index on `canonicalChangeId WHERE isCurrent = true`. Extend `Source` only with the planned additive contract fields, retain `adapter` and `frequencyCron`, and do not drop or rename legacy structures.

## RED-GREEN-REFACTOR evidence

The Pact checkpoint must include commands, exit codes, migration target identity without credentials, and concise output evidence.

### RED

Run the plan's exact RED command before schema implementation:

`pnpm db:validate && pnpm vitest run test/canonical-publish.test.ts`

Record that the old schema may validate but the canonical schema test fails because the models/constraint are absent.

### GREEN

The plan originally required a protected, isolated Neon branch. On 2026-07-23,
Neon rejected branch protection because this account has zero protected-branch
quota. The user explicitly approved a controlled unprotected-branch exception.
Use only the already-created branch with this non-secret identity:

- project: `steep-bird-11404641` (`tradelinks`)
- parent: `br-autumn-smoke-aof5n7pe` (`production`)
- branch: `br-plain-shadow-aoknpdf3` (`phase1-foundation-pre-migration`)
- expiry: `2026-07-30T12:00:00Z`

Before every migration or database-backed test, assert the project, parent,
branch name, branch ID, `protected: false`, non-default status, and expiry from
Neon metadata. Neon also rejected an explicit suspend interval on this account;
the branch therefore uses the account default (`suspend_timeout_seconds: 0` in
Neon metadata). Do not create another branch, print connection strings, or write
credentials to a repository or report. Point both Prisma URLs only at this
isolated branch through process-scoped environment variables, run `pnpm db:gen`,
and generate the additive migration.

Then run the plan's exact GREEN commands, combined as the machine gate:

`pnpm db:validate && pnpm exec prisma migrate status && pnpm vitest run test/canonical-publish.test.ts`

Record validation success, up-to-date isolated-branch migration status, and the partial-uniqueness test passing.

### REFACTOR

Compare Prisma and SQL field-by-field, remove accidental drift, verify the migration remains additive, and rerun the exact GREEN command unchanged. Record stable results and unchanged legacy row counts.

## 自审 / Self-review

Before checkpointing, Kimi must review the diff for exact model/type names, relation symmetry, array/default/nullability correctness, the one-current partial index, migration ordering, unchanged legacy tables, architecture accuracy, bounded files, and absence of secrets or generated artifacts.

## 安全边界 / Safety

No deployment or production database mutation is authorized. The user-approved
cloud scope is limited to using the exact unprotected isolated branch identified
above; its creation is already complete. Never run a down migration,
`migrate reset`, a destructive SQL statement, overwrite production, or persist
database credentials. If the exact project, parent, branch ID, name, non-default
status, and expiry cannot be proven, stop before any migration/write and report
the blocker.

## 验收 / Acceptance

Review dimension: **correctness**.

In a new reviewer session, Claude independently inspects Prisma versus SQL,
verifies the exact controlled-exception branch identity and expiry, reruns the
machine gate, confirms the migration is additive and forward-only, and checks
the rollback documentation preserves additive tables and restores only into a
new investigation branch.

verify: pnpm db:validate && pnpm exec prisma migrate status && pnpm vitest run test/canonical-publish.test.ts
