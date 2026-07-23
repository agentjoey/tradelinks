# Phase 1 Foundation — Task 5: Gold-Tested Canonicalization

Owner: `kimi`  
Reviewer: `claude`  
Orchestrator: `codex` (coordination only; no implementation or task acceptance)  
Plan source: Task 5 in `docs/superpowers/plans/2026-07-23-tradelinks-phase1-foundation.md`

## 目标 / Goal

Deliver deterministic-first fingerprinting, clustering, and typed classification backed by merge, non-merge, and ambiguity gold fixtures. Official identifiers dominate; incompatible market/platform/date facts prevent unsafe merges; uncertain classification always routes to review.

## 改文件 / Files

Only these files are in scope:

- Create `src/canonicalize/fingerprint.ts`
- Create `src/canonicalize/cluster.ts`
- Create `src/canonicalize/classify.ts`
- Modify `src/dedup/resolve.ts`
- Modify `src/ai/prompts/categorize.ts`
- Create `test/canonical-cluster.test.ts`
- Create `test/canonical-classify.test.ts`
- Create `test/fixtures/canonical/merge.json`
- Create `test/fixtures/canonical/separate.json`
- Create `test/fixtures/canonical/classification.json`

Do not modify publication, admin UI, Prisma, source collection, deployment configuration, or production data.

## 契约 / Contract

Produce:

- `candidateFingerprint(item: SourceItemFacts): string`
- `decideCluster(input: ClusterInput): Promise<ClusterDecision>`
- `classifyChange(input: ClusterFacts): Promise<ClassificationDecision>`

`ClassificationDecision` is `{ signalType; productCategories; riskAttributes; policyTopics; market; platforms; operatingStages; confidence; evidenceItemIds; requiresReview }`.

Use official event/recall/rule IDs first. Fallback comparison requires compatible market, platform, and effective-date windows before trigram/model assistance. Confidence below `0.80`, ambiguous operating-stage impact, incompatible categories, unsupported dates, or missing evidence item IDs must set `requiresReview: true`.

## RED-GREEN-REFACTOR evidence

The Pact checkpoint must include commands, exit codes, gold-pair totals, and concise output evidence for all three phases.

### RED

Run the plan's exact RED command before implementation:

`pnpm vitest run test/canonical-cluster.test.ts test/canonical-classify.test.ts`

Record the expected missing modules/fixtures failure.

### GREEN

Implement the smallest deterministic-first decision path and run the plan's exact GREEN command:

`pnpm vitest run test/canonical-cluster.test.ts test/canonical-classify.test.ts test/dedup.test.ts`

Record 100% correct merge/separate gold pairs and every ambiguous classification routed to review.

### REFACTOR

Remove duplicated normalization/model branches, keep deterministic guards ahead of probabilistic comparison, and rerun the exact GREEN command unchanged. Record unchanged gold outcomes.

## 自审 / Self-review

Before checkpointing, Kimi must inspect fingerprint stability, official-ID precedence, false-merge guards, date/market/platform compatibility, the `0.80` threshold, evidence references, prompt/type agreement, fixture clarity, bounded files, and unrelated diff noise.

## 安全边界 / Safety

No deployment, live model call, production canonicalization run, database migration, or production database mutation is authorized. Tests must use deterministic fixtures/mocks.

## 验收 / Acceptance

Review dimension: **correctness**.

In a new reviewer session, Claude independently reruns the machine gate, samples both merge and separate fixtures, checks ambiguous and missing-evidence cases, and confirms no low-confidence classification can auto-publish. Any gold regression or non-deterministic fixture blocks acceptance.

verify: pnpm vitest run test/canonical-cluster.test.ts test/canonical-classify.test.ts test/dedup.test.ts
