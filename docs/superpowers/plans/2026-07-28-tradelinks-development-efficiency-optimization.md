# TradeLinks Development Efficiency Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve TradeLinks' TDD, independent review, frontend, security, migration, and rollback gates while reducing Codex orchestration token consumption by at least 60% and preventing another unbounded task from consuming the weekly quota.

**Architecture:** Treat efficiency as an enforced delivery contract, not a writing-style preference. Every Pact task declares a risk class and token budget, runs in a fresh execution context, writes a compact handoff, and stops automatically when telemetry reaches the hard limit; repository scripts verify the budget record before checkpoint and acceptance. Upstream Pactify improvements provide scoped status/log reads, diagnostic escalations, compact evidence references, and model/role/task usage telemetry.

**Tech Stack:** Pactify v1 protocol, Codex/Kimi/Claude headless runners, Node.js 20, TypeScript/JavaScript repository scripts, Vitest, GitHub Actions, existing `.agent/` and `.pact/` records.

**Execution status:** Plan only. The strict budget gate, checker script, templates, and entry-point changes described below are not implemented or active. Human Owner approval is required before Task 1.

Related documents: `docs/pactify-usage-feedback.md` and `.agent/HANDOFF.md`.

## Global Constraints

- Do not weaken TDD, independent reviewer, frontend Tier gates, Auth/security review, forward-only Prisma migration, Neon branch/checkpoint, or rollback requirements to save tokens.
- Workers never self-accept; a fresh independent reviewer remains mandatory.
- No product code, database, deployment, or cloud configuration is changed by adopting the documentation policy alone.
- Token totals must distinguish gross processed tokens, cached input, uncached input, output, model, role, task, and run count. Missing telemetry is reported as missing; it is never replaced with an invented exact number.
- A hard budget breach pauses the task. Only a Human Owner waiver containing a reason and a new numeric ceiling may resume it.
- Long-running commands continue in their existing process/session; agents do not restart a command merely because it has not produced output.
- Full-suite verification remains mandatory at feature release and whenever the task specification explicitly classifies the change as cross-cutting, Auth, schema, migration, backfill, publication, or production-cutover risk.

---

## Baseline and Root Cause

The Phase 1 Intelligence Foundation implementation window consumed exactly 357,436,652 Codex gross tokens. Of those, 349,572,352 were cached input, a 97.90% input cache-hit ratio. Only 367,159 were output tokens. T6 Immutable Publication and T8 Legacy Backfill consumed 68.91% together; T6–T8 consumed 80.62%.

This establishes the root cause: repeated processing of a growing orchestrator context, full Pact state/log/evidence reads, low-information polling, large high-risk tasks, generic escalation records, and repeated milestone gates. Model verbosity and frontend workflow contributed, but cannot explain a run in which 97.80% of the gross total was cached input and the largest task was a non-frontend backfill.

Evidence sources:

- Codex rollout: `/Users/xtation/.codex/sessions/2026/07/23/rollout-2026-07-23T17-08-55-019f8e3c-2929-7530-9d35-df1cab5c5923.jsonl`
- Pact ledger: `.pact/log.jsonl`
- Foundation verification: `docs/superpowers/verification/2026-07-28-tradelinks-phase1-foundation-verification.md`

## Budget Contract

| Task class | Examples | Warning | Hard stop | Fresh-equivalent ceiling |
|---|---|---:|---:|---:|
| Standard | domain types, pure transforms, scoped API/query work | 10M gross | 15M gross | 500K uncached input + output |
| High risk | T3 UI, Auth, schema, migration, backfill, publication invariant | 20M gross | 30M gross | 1M uncached input + output |
| Feature | one independently releasable Pact feature | 120M gross | 150M gross | 5M uncached input + output |

At the warning threshold, the orchestrator must stop scope expansion, summarize current evidence, and choose one of: finish the bounded gate, split the task, or request owner direction. At the hard stop, it may only collect a final read-only status, write the handoff, and request a Human Owner waiver.

An approved waiver has this exact record shape:

```text
EFFICIENCY_WAIVER
feature: <feature-id>
task: <task-id>
previous_limit: <integer gross tokens>
new_limit: <integer gross tokens>
reason: <one bounded reason>
approved_by: <owner identity>
approved_at: <ISO-8601 timestamp>
```

## Execution Contract

1. One Pact task equals one fresh worker session and one fresh reviewer session.
2. The root Codex task keeps only the current task brief, last checkpoint, current diff summary, current failure, and next action. It does not ingest full historical streams unless investigating a specific contradiction.
3. Each handoff is at most 12 KB and uses the template created by Task 1 below.
4. Checkpoint evidence is at most 4 KB. Larger test logs, screenshots, and verification records live under `docs/superpowers/verification/`; the Pact event stores a path, result summary, commit, and exact verification command.
5. `pactify status` and log reads must be scoped to the current feature/task as soon as Pactify supports that contract. Until then, shell filtering is used and the unfiltered output is not pasted into the model context.
6. A long command gets one launch and bounded polling no more frequently than once per 60 seconds. Unchanged polls are not narrated or copied into durable evidence.
7. Targeted RED/GREEN tests run during implementation. The reviewer reruns the exact task gate once. A full suite runs once at the feature release gate unless the risk classification requires it earlier.
8. A provider authentication, quota, or runner failure stops that seat. Model/provider substitution requires owner approval and is recorded in the checkpoint.

## Required Efficiency Record

Every task checkpoint and acceptance must include:

```text
EFFICIENCY_RECORD
feature: <feature-id>
task: <task-id>
risk_class: STANDARD|HIGH_RISK
orchestrator_model: <model>
worker_model: <model>
reviewer_model: <model>
gross_tokens: <integer>
cached_input_tokens: <integer or UNAVAILABLE>
uncached_input_tokens: <integer or UNAVAILABLE>
output_tokens: <integer or UNAVAILABLE>
worker_runs: <integer>
reviewer_runs: <integer>
targeted_gate_runs: <integer>
full_gate_runs: <integer>
wall_clock_minutes: <integer>
budget_result: PASS|WARNING|WAIVER
verification_record: <repository path>
```

`UNAVAILABLE` is valid only when the provider did not expose the field. It blocks claims about the exact all-agent total but does not block an otherwise valid task.

### Task 1: Adopt the Repository Execution Policy and Handoff Template

**Files:**

- Create: `.agent/EXECUTION-POLICY.md`
- Create: `.agent/templates/TASK-HANDOFF.md`
- Modify: `AGENTS.md` outside the Pact-managed block
- Modify: `CLAUDE.md` outside the Pact-managed block
- Modify: `.agent/CURRENT.md`

**Interfaces:**

- Consumes: the Budget Contract, Execution Contract, waiver shape, and efficiency record in this plan.
- Produces: the authoritative runtime policy that every orchestrator, worker, and reviewer reads before joining a future Pact task.

- [ ] **Step 1: Write the policy and template**

  Copy the numeric budgets and exact record shapes from this plan. State that product and safety gates remain unchanged.

- [ ] **Step 2: Add entry-point requirements**

  Add one short instruction outside each managed Pact block: read `.agent/EXECUTION-POLICY.md` before starting or reviewing a Pact task and write `.agent/templates/TASK-HANDOFF.md` before pausing or switching agents.

- [ ] **Step 3: Verify discoverability and exact values**

  Run:

  ```bash
  rg -n "EXECUTION-POLICY|TASK-HANDOFF|15M|30M|150M|EFFICIENCY_RECORD" AGENTS.md CLAUDE.md .agent
  ```

  Expected: both entry files point to the policy; all three hard limits and the efficiency record exist exactly once in the policy/template source of truth.

- [ ] **Step 4: Commit**

  ```bash
  git add AGENTS.md CLAUDE.md .agent/EXECUTION-POLICY.md .agent/templates/TASK-HANDOFF.md .agent/CURRENT.md
  git commit -m "docs: enforce agent execution efficiency policy"
  ```

**Done when:** A new agent can discover the budgets and produce a valid handoff without reading this plan.

### Task 2: Add a Fail-Closed Pact Budget Checker

**Files:**

- Create: `scripts/check-pact-budget.mjs`
- Create: `test/pact-budget.test.ts`
- Modify: `package.json`

**Interfaces:**

- Consumes: `.pact/orchestrate/tokens.json` with `tasks[taskId].tokens` and `tasks[taskId].runs`.
- Produces: `pnpm efficiency:check -- --task <id> --warning <n> --hard <n>` with exit 0 below warning, exit 10 at warning, exit 20 at hard stop, and exit 30 when telemetry is absent or malformed.

- [ ] **Step 1: Write failing tests for all four exits**

  Fixtures must cover below-warning, warning, hard-stop, and missing-telemetry cases. Tests use a temporary directory and never read the live `.pact` store.

- [ ] **Step 2: Verify RED**

  ```bash
  pnpm vitest run test/pact-budget.test.ts
  ```

  Expected: FAIL because `scripts/check-pact-budget.mjs` does not exist.

- [ ] **Step 3: Implement the minimal checker**

  Parse only integer task tokens/runs; reject negative, missing, non-integer, or reversed limits. Print one JSON result containing task, tokens, runs, warning, hard, and status.

- [ ] **Step 4: Add the package command**

  Add:

  ```json
  "efficiency:check": "node scripts/check-pact-budget.mjs"
  ```

- [ ] **Step 5: Verify GREEN and type safety**

  ```bash
  pnpm vitest run test/pact-budget.test.ts
  pnpm lint
  ```

  Expected: all budget tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit**

  ```bash
  git add scripts/check-pact-budget.mjs test/pact-budget.test.ts package.json
  git commit -m "chore: add fail-closed pact token budget gate"
  ```

**Done when:** A missing token store cannot silently pass, and an over-budget task returns the documented non-zero exit.

### Task 3: Put Efficiency Evidence into Every Future Pact Task

**Files:**

- Create: `.agent/templates/PACT-TASK-EFFICIENCY.md`
- Modify when generating the next feature:
  - `.pact/tasks/phase1-public-intelligence-public-content-schema.md`
  - `.pact/tasks/phase1-public-intelligence-public-ia-design-gate.md`
  - `.pact/tasks/phase1-public-intelligence-hubs.md`
  - `.pact/tasks/phase1-public-intelligence-changes.md`
  - `.pact/tasks/phase1-public-intelligence-guides-briefings.md`
  - `.pact/tasks/phase1-public-intelligence-feeds.md`
  - `.pact/tasks/phase1-public-intelligence-api-agent-skill.md`
  - `.pact/tasks/phase1-public-intelligence-telegram-seo.md`
  - `.pact/tasks/phase1-public-intelligence-cutover.md`
- Modify: `.agent/CURRENT.md`

**Interfaces:**

- Consumes: `.agent/EXECUTION-POLICY.md` and `pnpm efficiency:check`.
- Produces: task specs that declare `risk_class`, warning/hard values, token check command, handoff path, targeted gate, full-gate rule, and efficiency record acceptance clause.

- [ ] **Step 1: Create the reusable task-spec block**

  Include all required fields and state that budget failure cannot be waived by worker or reviewer.

- [ ] **Step 2: Apply it to the next Public Intelligence Pact feature before assignment**

  Standard tasks use 10M/15M; T3, schema, migration, Auth, backfill, and cutover tasks use 20M/30M.

- [ ] **Step 3: Inspect the generated task graph**

  ```bash
  rg -n "risk_class|warning_tokens|hard_tokens|efficiency:check|EFFICIENCY_RECORD" .pact/tasks | rg "phase1-public-intelligence-"
  pactify validate
  ```

  Expected: every generated task contains one complete efficiency block and Pact validation passes.

- [ ] **Step 4: Commit**

  ```bash
  git add .agent/templates/PACT-TASK-EFFICIENCY.md .pact/tasks .agent/CURRENT.md
  git commit -m "chore: budget Public Intelligence pact tasks"
  ```

**Done when:** Pact assignment cannot start without an explicit numeric budget and verification command.

### Task 4: Pilot the Policy on Public Intelligence Task 1

**Files:**

- Create: `docs/superpowers/verification/2026-07-28-phase1-public-task1-efficiency.md`
- Modify: `.agent/CURRENT.md`

**Interfaces:**

- Consumes: the accepted Task 1 implementation/review evidence and its telemetry.
- Produces: the first comparable efficiency report and a go/no-go decision for the rest of Public Intelligence.

- [ ] **Step 1: Capture start counters before worker launch**

  Record the exact Codex cumulative boundary, Pact task token count, model pins, commit, and start time.

- [ ] **Step 2: Run the standard 10M warning / 15M hard gate**

  Do not grant a waiver during the pilot. If the hard limit is reached, split the task and document the split.

- [ ] **Step 3: Record finish counters and causes**

  Separate implementation, review, retry, gate, and orchestration usage. Record all missing provider fields as `UNAVAILABLE`.

- [ ] **Step 4: Certify the pilot**

  ```bash
  pnpm efficiency:check -- --task public-content-schema --warning 10000000 --hard 15000000
  pactify validate
  git diff --check
  ```

  Expected: budget checker exit 0, Pact valid, and no whitespace errors.

- [ ] **Step 5: Commit**

  ```bash
  git add docs/superpowers/verification/2026-07-28-phase1-public-task1-efficiency.md .agent/CURRENT.md
  git commit -m "docs: certify Public Intelligence efficiency pilot"
  ```

**Done when:** Task 1 is accepted within budget and the report identifies implementation, review, and orchestration costs separately.

## Monitoring and Governance

- `.agent/CURRENT.md` lists the current feature/task budget, current usage, last check time, and waiver status.
- Each accepted feature publishes a summary with median task tokens, maximum task tokens, cache-hit ratio, rework count, full-gate count, and wall-clock time.
- A feature exceeding 120M triggers an owner review before another task starts; exceeding 150M is a hard stop.
- Missing `.pact/orchestrate/tokens.json` blocks automated continuation until the telemetry problem is fixed or the owner authorizes a documented manual counter source.
- No reviewer may accept a checkpoint whose `EFFICIENCY_RECORD` is absent, internally inconsistent, or over the hard limit without the exact owner waiver.

## Verification Gate

```bash
pnpm vitest run test/pact-budget.test.ts
pnpm lint
pnpm efficiency:check -- --task public-content-schema --warning 10000000 --hard 15000000
pactify validate
git diff --check
```

## Completion Definition

- Runtime policy and handoff template are discoverable from every agent entry point.
- Budget checking fails closed when telemetry is missing and returns distinct warning/hard exits.
- Every next-feature task has a numeric budget before assignment.
- Public Intelligence Task 1 is completed with a full efficiency record below 15M gross Codex tokens.
- The policy preserves all product and safety gates and requires explicit owner waivers.

## Owner Decisions Before Execution

1. Approve strict hard-stop enforcement rather than report-only warnings.
2. Approve the 10M/15M standard, 20M/30M high-risk, and 120M/150M feature thresholds.
3. Approve fail-closed behavior when model/provider telemetry is missing.
4. Decide whether upstream Pactify changes are developed in the Pactify repository before or in parallel with the TradeLinks pilot.
