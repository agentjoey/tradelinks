# Phase 1 Foundation — Task 1: Taxonomy and Readiness Policy

Owner: `kimi`  
Reviewer: `claude`  
Orchestrator: `codex` (coordination only; no implementation or task acceptance)  
Plan source: Task 1 in `docs/superpowers/plans/2026-07-23-tradelinks-phase1-foundation.md`

## 目标 / Goal

Deliver the exhaustive Phase 1 intelligence taxonomy and pure readiness/publication policy. Signal Type, Product Category, and Risk Attribute remain independent, the six initial public categories are an explicit subset, and public/personalized/action gates match the approved plan.

## 改文件 / Files

Only these files are in scope:

- Create `src/domain/intelligence/taxonomy.ts`
- Create `src/domain/intelligence/readiness.ts`
- Create `test/intelligence-taxonomy.test.ts`
- Create `test/readiness-policy.test.ts`

Do not modify Prisma, UI, source configuration, deployment configuration, or any other file to satisfy this task.

## 契约 / Contract

Produce these exact interfaces:

- `parseProductCategory(value: string): ProductCategory | null`
- `categorySlug(category: ProductCategory): string`
- `canPublishPublic(readiness: ReadinessLevel): boolean`
- `canPersonalize(change: PublicationFacts): boolean`
- `canRecommendAction(change: PublicationFacts): boolean`

Use every enum value from the plan's Data Model Contract. Export `INITIAL_PUBLIC_CATEGORIES` containing exactly Consumer Electronics, Pet Supplies, Beauty & Personal Care, Toys & Children's Products, Home & Kitchen, and Apparel & Accessories. Labels/slugs must be exhaustive through `satisfies Record<...>` maps. Actions require `VERIFIED`, reviewed primary official evidence, and a reviewed action template.

## RED-GREEN-REFACTOR evidence

The Pact checkpoint must include commands, exit codes, and concise output evidence for all three phases.

### RED

Run the plan's exact RED command before implementation:

`pnpm vitest run test/intelligence-taxonomy.test.ts test/readiness-policy.test.ts`

Record the expected failure caused by the missing intelligence domain modules or missing contract—not unrelated debt.

### GREEN

Implement the smallest complete contract, then run the plan's exact GREEN command:

`pnpm vitest run test/intelligence-taxonomy.test.ts test/readiness-policy.test.ts && pnpm lint`

Record both test files passing and the TypeScript gate exiting 0.

### REFACTOR

Remove duplication, keep the policy pure, check exhaustive maps and naming against the plan, then rerun the exact GREEN command unchanged. Record that behavior and tests remain green.

## 自审 / Self-review

Before checkpointing, Kimi must review the diff for taxonomy completeness, dimension separation, exact public-category subset, null parsing of non-category values, pure readiness behavior, bounded files, and absence of unrelated formatting or generated changes.

## 安全边界 / Safety

No deployment, cloud configuration, database migration, database write, or production database mutation is authorized.

## 验收 / Acceptance

Review dimension: **maintainability**.

In a new reviewer session, Claude reviews from the spec, diff, and RED-GREEN-REFACTOR evidence; independently reruns the machine gate; confirms the exhaustive mappings make future enum omissions fail visibly; and confirms the owner did not touch out-of-scope files. The task is not accepted on prose-only evidence.

verify: pnpm vitest run test/intelligence-taxonomy.test.ts test/readiness-policy.test.ts && pnpm lint
