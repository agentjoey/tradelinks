# Phase 1 Foundation — Task 7: Coverage and Readiness Transitions

Owner: `kimi`  
Reviewer: `claude`  
Orchestrator: `codex` (coordination only; no implementation or task acceptance)  
Plan source: Task 7 in `docs/superpowers/plans/2026-07-23-tradelinks-phase1-foundation.md`

## 目标 / Goal

Seed the explicit US/Amazon/Shopify/category coverage capabilities, compute readiness from source checks without exceeding reviewed ceilings, transition stale capabilities when required sources miss SLA, and expose promises/gaps/capability links on the existing admin sources surface.

## 改文件 / Files

Only these files are in scope:

- Create `src/canonicalize/coverage.ts`
- Modify `src/workers/seed-sources.ts`
- Modify `src/monitoring/health.ts`
- Create `test/coverage-readiness.test.ts`
- Modify `app/admin/sources/page.tsx`

Do not modify Prisma, source-contract definitions, auth, routes, global tokens, deployment configuration, or production schedules/data.

## 契约 / Contract

Produce:

- `recomputeCapabilityReadiness(capabilityId: string, now: Date): Promise<ReadinessLevel>`
- `seedPhase1Coverage(): Promise<void>`

Seed exactly these capability keys:

- `market:us`
- `platform:amazon-us`
- `platform:shopify-us`
- `category:consumer-electronics`
- `category:pet-supplies`
- `category:beauty-personal-care`
- `category:toys-childrens-products`
- `category:home-kitchen`
- `category:apparel-accessories`
- `demand:amazon-bsr`

Amazon policy starts `UNAVAILABLE`, Amazon BSR `EXPERIMENTAL`, Shopify and US market no higher than `MONITORED`, and no initial category above `MONITORED`. Every category has linked sources and non-empty known gaps. Stale required sources lower capability readiness, but automated checks never promote above the reviewed ceiling.

## Frontend workflow

The existing admin-sources enhancement is at least T2. Kimi must apply the repository frontend workflow, use `/skill:impeccable critique app/admin/sources/page.tsx` and `/skill:impeccable audit app/admin/sources/page.tsx`, cover loading/empty/error/success/stale/permission states as applicable, preserve tokens and reduced-motion behavior, fix findings, and capture a browser screenshot from the final local build. Any scope/risk expansion triggers re-tiering; the owner may not self-waive gates.

## RED-GREEN-REFACTOR evidence

The Pact checkpoint must include commands, exit codes, and readiness transition evidence for all three phases.

### RED

Run the plan's exact RED command before implementation:

`pnpm vitest run test/coverage-readiness.test.ts test/health.test.ts`

Record the expected failure because coverage-driven transitions are absent.

### GREEN

Implement the smallest seed/recompute/admin visibility path and run the plan's exact GREEN command:

`pnpm vitest run test/coverage-readiness.test.ts test/health.test.ts && pnpm lint`

Record transition tests, health regression tests, and TypeScript passing.

### REFACTOR

Deduplicate readiness aggregation without changing reviewed ceilings or known gaps, rerun the exact GREEN command unchanged, and record stable outcomes.

## 自审 / Self-review

Before checkpointing, Kimi must inspect exact capability keys, source links, known gaps, ceiling rules, stale timing, clock determinism, idempotent seed behavior, admin state clarity/a11y, bounded files, and unrelated diff noise.

## 安全边界 / Safety

No deployment, production seeding, production health run, database migration, schedule change, or production database mutation is authorized. Tests and browser checks use fixture/mock or clearly non-production data.

## 验收 / Acceptance

Review dimension: **correctness**.

In a new reviewer session, Claude independently reruns the machine gate, checks every initial capability and ceiling, forces stale and healthy cases, and confirms admin visibility matches stored readiness without overstating coverage. Auto-promotion above a reviewed ceiling or an empty known-gaps list blocks acceptance.

verify: pnpm vitest run test/coverage-readiness.test.ts test/health.test.ts && pnpm lint
