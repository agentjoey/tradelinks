# Phase 1 Foundation — Task 3: Explicit Source Contracts

Owner: `kimi`  
Reviewer: `claude`  
Orchestrator: `codex` (coordination only; no implementation or task acceptance)  
Plan source: Task 3 in `docs/superpowers/plans/2026-07-23-tradelinks-phase1-foundation.md`

## 目标 / Goal

Replace the implicit source registry with validated Phase 1 source contracts, truthful readiness/SLA/degradation/user-promise fields, structured fetch outcomes, and immutable parser fixtures before any source is schedulable.

## 改文件 / Files

Only these files are in scope:

- Create `src/domain/intelligence/source-contract.ts`
- Create `src/config/phase1-sources.ts`
- Modify `src/config/sources.ts`
- Modify `src/adapters/types.ts`
- Modify `src/adapters/index.ts`
- Create `test/source-registry.test.ts`
- Create fixture files only under `test/fixtures/sources/`

Do not modify ingest persistence, Prisma, UI, schedulers outside the registry exports, deployment configuration, or live cloud source settings.

## 契约 / Contract

Produce:

- `SourceContractSchema`
- `PHASE1_SOURCES`
- `FetchOutcome = { kind: "success"; items: RawItem[]; httpStatus: number; contentHash: string } | { kind: "blocked" | "failed"; code: string; retryable: boolean; httpStatus?: number }`

Consume `MarketCode`, `PlatformCode`, `ProductCategory`, `ReadinessLevel`, and `AuthorityLevel`. Implement every row and exact official allowlist in the plan's Source Readiness Matrix, including official CPSC/FDA/FTC/FCC/FSIS/APHIS, Shopify, Amazon announcement/page-diff, secondary context, and Experimental BSR boundaries. Explicitly disable every out-of-scope ID listed by the plan. A successful empty response remains `success`; blocked/failed outcomes preserve code and retryability. No active parser may lack an immutable fixture.

Use the enum sources already produced by accepted tasks: import runtime
`MarketCode`, `PlatformCode`, and `AuthorityLevel` from `@prisma/client`, and
reuse `ProductCategory` / `ReadinessLevel` plus their exhaustive value lists
from `src/domain/intelligence/taxonomy.ts`. Do not declare mirrored enum
constants or alternate string-union types in this task.

## RED-GREEN-REFACTOR evidence

The Pact checkpoint must include commands, exit codes, and concise output/snapshot evidence for all three phases.

### RED

Run the plan's exact RED command before implementation:

`pnpm vitest run test/source-registry.test.ts`

Record the expected missing `PHASE1_SOURCES`/`FetchOutcome` failure.

### GREEN

Implement the smallest complete registry/adapter contract and run the plan's exact GREEN command:

`pnpm vitest run test/source-registry.test.ts test/adapters.test.ts test/json-adapter.test.ts test/blocked.test.ts`

Record parser normalization, successful-empty semantics, and blocked/failed retryability passing.

### REFACTOR

Deduplicate registry constants without weakening per-source promises, validate every enabled source against fixtures, and rerun the exact GREEN command unchanged. Record stable snapshots and no semantic drift.

## 自审 / Self-review

Before checkpointing, Kimi must compare every registry entry against the source matrix and official allowlist, verify unsupported IDs are disabled/`UNAVAILABLE`, verify secondary/Experimental sources cannot claim official completeness, check fixture immutability and licensing/access fields, inspect only bounded files, and remove unrelated changes.

## 安全边界 / Safety

No deployment, production schedule enablement, cloud configuration, live scraper execution, database migration, or production database mutation is authorized.
Do not make network requests to any allowlisted source while implementing or
testing this task. Build immutable fixtures from the repository's existing
parser contracts and publicly documented response shapes; all parser tests must
remain offline and deterministic.

## 验收 / Acceptance

Review dimension: **maintainability**.

In a new reviewer session, Claude independently reruns the machine gate and checks that schema validation, explicit promises, typed failure semantics, fixtures, and the registry's single-source-of-truth structure are readable and consistent with the plan. A source without a fixture or truthful degradation contract blocks acceptance.

verify: pnpm vitest run test/source-registry.test.ts test/adapters.test.ts test/json-adapter.test.ts test/blocked.test.ts
