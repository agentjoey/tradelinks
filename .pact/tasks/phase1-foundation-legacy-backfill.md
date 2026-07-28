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

## Orchestrator handoff — test isolation and replay hard gate (2026-07-26)

The exact GREEN order applies the real isolated-branch backfill before the test suite. Tests must never delete or rewrite pre-existing `legacy-alert:*`, `legacy-cluster:*`, or `legacy-alert-cluster:*` canonical rows. Give every test fixture an explicit run-scoped id (including Alert/Cluster/Item/Source), assert its exact `legacy-alert:<fixture-alert-id>` slug, and clean only those exact fixture-derived canonical and legacy ids in FK-safe order.

Planning and replay must be incremental and auditable: exclude alerts whose exact `legacy-alert:<id>` change already exists from proposed insert counts while keeping the source-snapshot fingerprint stable. The first apply counts must equal that dry-run's proposed counts; the same fingerprint replay must return zero new clusters/changes/versions/evidence without deleting existing rows. Preserve the plan's `rejectedRows` in the apply report. A dry-run after apply may show zero remaining proposals but must retain the same legacy-input fingerprint.

Remove all nondeterminism: an orphan cluster fingerprint must be derived from the legacy alert id, never `randomUUID()` or time. `sourceItems`, `clusters`, and rejection accounting must describe rows actually converted or explicitly rejected, not unrelated table-wide counts.

The apply safety check must positively match the approved isolated endpoint `ep-proud-dream-aotwdl52` (pooler or direct host). Merely rejecting the known production endpoint is insufficient proof of isolation. There is no force override.

Reviewer Claude Opus 5 must treat any broad test cleanup, unstable proposal identity, lost rejection report, dry-run/apply count mismatch, or non-allowlisted apply target as blocking.

Do not weaken the count assertion to `>= 1`, fixture-only counts, or direct-row existence. `planFoundationBackfill()` must load the exact existing `legacy-alert:<id>` slugs and omit those alerts from the proposal before reporting counts. Tests must retain full equality for `sourceItems`, `clusters`, `canonicalChanges`, `versions`, and `evidenceRecords` between a dry-run and its first apply, then assert all five are zero on replay with the same fingerprint. Pre-existing canonical rows remain untouched. Remove diagnostic scripts such as `scripts/check-counts.ts` and `scripts/time-backfill-plan.ts` before any gate or checkpoint.

Do not modify `package.json`, add Vitest configuration, or disable file parallelism. The full suite legitimately mutates isolated test rows concurrently. In `foundation-backfill.test.ts`, wait for two consecutive equal full-snapshot fingerprints before asserting unchanged-input stability; for the apply test, if `applyFoundationBackfill` rejects with the specified fingerprint-mismatch error because another suite committed between plan and apply, obtain a new stable plan and retry within a bounded timeout. Assert strict five-count equality for the successful full plan/apply pair and five zeros on its replay with the same fingerprint. Never suppress fingerprint mismatch or filter assertions to fixture-only counts.

## Orchestrator handoff — bounded bulk apply hard gate (2026-07-26)

The URL-to-legacy-Item recovery expands the eligible set from a handful of linked alerts to hundreds of production-shaped rows. Do not solve the resulting interactive-transaction timeout by only increasing `timeout`, by opening one transaction per proposal, or by weakening the count assertions. Replace the O(number of proposals) read/create loop with one bounded transaction and deterministic ids plus layered bulk writes in dependency order: `EvidenceCluster`, `EvidenceClusterMember`, `CanonicalChange`, `CanonicalChangeVersion`, then `EvidenceRecord`. Prisma `createMany` with `skipDuplicates` is preferred; raw SQL is not required. A modest timeout increase may be used only as a secondary cold-start guard after the operation count is bounded.

Dry-run `clusters` must count only EvidenceClusters missing at plan time, including when multiple proposals share a legacy cluster fingerprint. Apply must report the actual inserted row counts from the bulk operations so the first uncontended apply remains strictly equal to the dry-run for all five counters and replay remains five zeros. Existing fingerprints/slugs and their rows must remain untouched.

For every proposal, EvidenceCluster membership must be the deterministic union of the legacy Cluster's Item ids and every recovered evidence `sourceItemId` discovered by exact source-URL-to-Item matching. This is required for orphan alerts whose evidence is recoverable from the Item registry even though `Alert.clusterId` is null. Deduplicate and sort member ids before fingerprint-independent bulk insertion; all member roles remain `SECONDARY_CONTEXT`.

## Orchestrator continuation directive — resume, do not redesign (2026-07-26)

This task already has partial untracked implementations in all three scoped files. Read `src/canonicalize/backfill.ts`, `scripts/backfill-phase1-foundation.ts`, and `test/foundation-backfill.test.ts` before proposing any design or writing code. Preserve the established external report shape and naming: `CanonicalChange.slug = legacy-alert:<alertId>`; a linked legacy Cluster uses `EvidenceCluster.fingerprint = legacy-cluster:<clusterId>`; an orphan alert uses `EvidenceCluster.fingerprint = legacy-alert-cluster:<alertId>`. Fix the current duplicate `select` property, replace only the sequential apply path with bounded bulk writes, add missing-cluster-aware dry-run counts, union recovered Item ids into cluster membership, and add bounded stable-plan/apply retry helpers to the existing tests. Do not restart RED, replace these files wholesale, invent fallback Source rows, or reinterpret `sourceItems`; it remains the distinct `sourceItemId` count in the still-pending proposals, so excluding already-converted alerts makes replay zero.

## Orchestrator correction gate — required before any further verification (2026-07-26)

The current bulk draft is not yet reviewable. Make these corrections before running another gate:

1. Supply stable hash-derived `id` values for every newly inserted `EvidenceCluster`, `CanonicalChange`, `CanonicalChangeVersion`, and `EvidenceRecord`. Existing rows discovered through unique fingerprints/slugs keep and propagate their actual stored ids. Do not rely on generated CUID defaults for new backfill rows.
2. Enforce the approved endpoint inside `applyFoundationBackfill()` itself so direct callers cannot bypass safety. Accept only hosts beginning exactly `ep-proud-dream-aotwdl52.` or `ep-proud-dream-aotwdl52-pooler.`; substring matches are forbidden. The CLI check remains defense in depth.
3. Change the test retry helper to return the actual successful `{ plan, applied }` pair. Compare all five counters and rejected rows against that returned plan, not a stale initial plan. Replay the successful fingerprint immediately and assert five zeros; fingerprint mismatch may restart the bounded pair, but no mismatch or assertion may be suppressed.
4. Query the orphan `legacy-alert-cluster:<fixture-alert-id>` after apply and assert that recovered `ITEM_ID` exists as an `EvidenceClusterMember` with `SECONDARY_CONTEXT`.
5. Remove the duplicate step comment and prove there are no diagnostic scripts.

The modified task spec is an orchestrator-owned handoff record. Leave it present and unstaged; do not revert or include it in the worker checkpoint. Do not update `.agent/CURRENT.md`, checkpoint, or start the integrated gate until all five corrections are visible in the scoped files and the exact Task 8 test passes.

## Final bounded rework directive — no redesign (2026-07-26)

Resume the current files and make only this test-structure correction; do not add APIs, redesign fingerprinting, run diagnostics, or discuss alternatives. In `foundation-backfill.test.ts`, set one `fixturePlan` in `beforeAll` after cleanup/seed and reuse it for the fixture mapping, evidence, and rejection assertions. Add `stablePair()` that repeatedly calls `planFoundationBackfill()` and returns `{ first, second }` only from the exact iteration where the two consecutive fingerprints match. Each of the two fingerprint tests calls `stablePair()` once and compares only that returned pair. `applyWithRetry()` starts from `stablePair().second`, retries only the specified fingerprint mismatch, and returns the successful `{ plan, applied }`. Keep run-scoped URLs and the orphan member assertion. Then run lint, the exact Task 8 file once, and the full integrated gate once. No repeated exploratory tests.
