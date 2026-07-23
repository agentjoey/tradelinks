# Phase 1 Foundation — Task 8: Conservative Legacy Backfill

Owner: `kimi`  
Reviewer: `claude`  
Orchestrator: `codex` (coordination only; no implementation or task acceptance)  
Plan source: Task 8 in `docs/superpowers/plans/2026-07-23-tradelinks-phase1-foundation.md`

## 目标 / Goal

Plan and apply an idempotent, auditable legacy Item/Cluster/Alert backfill without silently upgrading trust. Every eligible row is converted or rejected with a reason; backfilled drafts remain Experimental/In Review and never become current Published or Verified automatically.

## 改文件 / Files

Only these files are in scope:

- Create `src/canonicalize/backfill.ts`
- Create `scripts/backfill-phase1-foundation.ts`
- Create `test/foundation-backfill.test.ts`
- Modify `.agent/CURRENT.md` only after the integrated full verification gate succeeds

Do not modify schema/migrations, publication invariants, public routes, deployment configuration, or legacy rows outside the backfill transaction.

## 契约 / Contract

Produce:

- `planFoundationBackfill(): Promise<BackfillReport>`
- `applyFoundationBackfill(reportFingerprint: string): Promise<BackfillReport>`

`BackfillReport` contains `fingerprint`, `sourceItems`, `clusters`, `canonicalChanges`, `versions`, `evidenceRecords`, and `rejectedRows: Array<{ table: string; id: string; reason: string }>`.

Legacy `sourceUrls` become `SECONDARY_CONTEXT` unless they map to an enabled government/platform official Source and a reviewer later approves them. `--apply` requires the exact dry-run fingerprint. A repeated dry-run returns the same fingerprint; a second apply inserts zero additional records.

## RED-GREEN-REFACTOR evidence

The Pact checkpoint must include commands, exit codes, fingerprints/counts, rejected-reason classes, and replay evidence for all three phases.

### RED

Run the plan's exact RED command before implementation:

`pnpm vitest run test/foundation-backfill.test.ts`

Record the expected failure because the backfill module is absent.

### GREEN

The plan authorizes verification on a production-shaped branch, which for this task means only the isolated non-production Neon branch established by Task 2. Prove the URLs target that isolated branch, then run the plan's exact GREEN commands, combined as the machine gate:

`pnpm tsx scripts/backfill-phase1-foundation.ts --dry-run --output /tmp/tradelinks-foundation-backfill.json && pnpm tsx scripts/backfill-phase1-foundation.ts --apply --fingerprint "$(jq -r .fingerprint /tmp/tradelinks-foundation-backfill.json)" && pnpm vitest run test/foundation-backfill.test.ts`

Record equal dry-run/apply counts, reasoned rejections, passing tests, and a second apply inserting zero records.

### REFACTOR

Remove nondeterministic ordering/duplication, rerun dry-run twice, rerun apply to prove zero new inserts, and rerun the exact GREEN command unchanged. Record stable fingerprint and counts.

## Integrated milestone gate

Before modifying `.agent/CURRENT.md`, run the plan's Full Verification Gate in this exact order against non-production targets:

1. `pnpm db:validate`
2. `pnpm lint`
3. `pnpm test`
4. `pnpm build`
5. `pnpm tsx scripts/backfill-phase1-foundation.ts --dry-run`

Only then record migration `0011_phase1_intelligence_foundation`, the backfill fingerprint, rejected-row count, and that public cutover has not started.

## 自审 / Self-review

Before checkpointing, Kimi must inspect deterministic ordering/fingerprint inputs, trust downgrades, official-source mapping, current/published flags, rejection accounting, transactional replay, report accuracy, the conditional CURRENT update, bounded files, secrets, and unrelated diff noise.

## 安全边界 / Safety

No deployment or production database mutation is authorized. Apply is allowed only on the explicitly isolated non-production Neon branch; if isolation cannot be proven, run dry-run only and block the checkpoint. Never run a down migration, overwrite production, mutate published history, or enable public cutover.

## 验收 / Acceptance

Review dimension: **correctness**.

In a new reviewer session, Claude independently reruns the machine gate on the isolated target, compares dry-run/apply/replay results, samples rejected rows and legacy trust mappings, and confirms `.agent/CURRENT.md` was updated only after the integrated gate. Any silent drop, trust upgrade, non-deterministic fingerprint, or production target blocks acceptance.

verify: pnpm tsx scripts/backfill-phase1-foundation.ts --dry-run --output /tmp/tradelinks-foundation-backfill.json && pnpm tsx scripts/backfill-phase1-foundation.ts --apply --fingerprint "$(jq -r .fingerprint /tmp/tradelinks-foundation-backfill.json)" && pnpm vitest run test/foundation-backfill.test.ts
