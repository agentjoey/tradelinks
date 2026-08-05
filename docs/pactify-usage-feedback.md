# Pactify Usage Feedback — TradeLinks Phase 1 Foundation

Date: 2026-07-28

Project: TradeLinks

Pactify version reported locally: `dev (none, unknown)`

Feature: `phase1-foundation`

Agents: Codex 5.6 Sol orchestrator, Kimi Code worker, Claude Code reviewer

Related TradeLinks documents: `docs/superpowers/plans/2026-07-28-tradelinks-development-efficiency-optimization.md` and `.agent/HANDOFF.md`.

## Executive Summary

Pactify successfully enforced independent worker/reviewer ownership, serialized dependencies, durable checkpoints, and an auditable acceptance ledger across eight Foundation tasks. Those controls caught real correctness and migration-safety defects.

The same run exposed a severe orchestration-efficiency problem. The Codex implementation window processed 357,436,652 tokens; 97.80% of the gross total was cached input. The dominant causes were unscoped state/log reads, evidence embedded directly in the ledger, generic escalation messages, repeated recovery diagnosis, and absence of a complete per-model/per-role usage report.

This feedback recommends keeping Pactify's review protocol while making status, evidence, escalation, telemetry, and budget enforcement first-class product capabilities.

## What Worked Well

1. **Independent acceptance was real.** Kimi never self-accepted; Claude accepted all eight tasks and requested changes twice on the backfill.
2. **Dependencies prevented premature work.** Foundation tasks stayed serial and later tasks did not begin before their dependencies were accepted.
3. **The ledger preserved attribution.** The Task 8 Kimi quota failure and bounded Codex fallback remained visible.
4. **Checkpoint evidence enabled reconstruction.** RED/GREEN/REFACTOR commands, branch identity, migration state, and safety boundaries were recoverable after interruptions.
5. **Review produced material value.** It caught shared-cluster loss, endpoint-allowlist weakness, fingerprint/replay races, fixture contamination, an orphan change, and inaccurate milestone evidence.
6. **Branch isolation held.** No production database mutation occurred during Foundation development.

## Measured Run Characteristics

Current repository measurements:

| Artifact | Size |
|---|---:|
| `.pact/STATE.yml` | 29,479 bytes |
| `.pact/log.jsonl` | 78,794 bytes |
| `.pact/orchestrate/streams/*.log` | 56,504 bytes |
| Combined | 164,777 bytes |

Ledger measurements:

| Event | Count |
|---|---:|
| Total events | 82 |
| Checkpoints | 10 |
| Accepts | 8 |
| Changes requested | 2 |
| Escalations | 11 |
| Events carrying inline evidence | 15 |
| Inline evidence payload | 46,701 characters |

Codex Foundation implementation usage:

| Metric | Value |
|---|---:|
| Gross tokens | 357,436,652 |
| Input tokens | 357,069,493 |
| Cached input | 349,572,352 |
| Uncached input | 7,497,141 |
| Output | 367,159 |
| Input cache-hit ratio | 97.90% |

T6 Immutable Publication and T8 Legacy Backfill consumed 68.91% of the Codex total. T6–T8 consumed 80.62%.

## Findings and Requested Changes

### P0: Scoped Status and Log Reads

**Observed:** `pactify status` renders the complete projected state, including full evidence. The MCP/resource path likewise offers no task/feature/tail contract in the project instructions. Recovery repeatedly reintroduced accepted-task history into the orchestrator context.

**Requested CLI/API:**

```text
pactify status --feature <feature> [--task <task>] [--active-only] [--summary]
pactify log --feature <feature> [--task <task>] [--tail <n>] [--since <event-id|timestamp>]
```

Equivalent MCP parameters should exist. `--summary` must omit inline evidence and return status, dependency, owner, reviewer, last event, last failure, and evidence reference.

**Acceptance:** A task-scoped summary remains below 8 KB on the current TradeLinks ledger and does not include evidence belonging to another accepted task.

### P0: Diagnostic Escalations

**Observed:** Eleven escalation records used generic reasons such as `iteration limit exceeded`, frequently with an empty task id. Precise runner failures such as `signal: killed`, provider quota exhaustion, or `exit status 1` existed elsewhere and required a new investigation.

**Requested escalation contract:**

```json
{
  "feature": "phase1-foundation",
  "task": "legacy-backfill",
  "seat": "kimi",
  "kind": "kimi-cli",
  "attempt": 3,
  "limit": 3,
  "last_fail": "provider returned HTTP 403 quota exhaustion",
  "last_exit": 1,
  "last_output_tail": "bounded redacted tail",
  "suggested_action": "renew quota or request an approved fallback"
}
```

**Acceptance:** The escalation is actionable without reading full state, full log, or stream history; secret values are redacted.

### P0: Complete Usage Telemetry and Budgets

**Observed:** The current Pactify source describes `.pact/orchestrate/tokens.json`, but no token store exists for the Foundation run. Kimi and Claude totals therefore cannot be reconstructed. Parsing only `input_tokens + output_tokens` also misses provider cache-read/cache-write fields when those fields are reported separately.

**Requested telemetry:**

- Persist per feature/task/seat/model/run.
- Preserve input, cached input, cache creation/write, output, reasoning output, cost, wall time, exit, and retry reason independently.
- Record failed/killed runs as well as successful runs.
- Write atomically to the main project stream directory, not an ephemeral sandbox.
- Expose `pactify usage --feature ... --task ... --json`.
- Support warning and hard budgets that pause orchestration before launching another agent run.

**Acceptance:** A fixture run containing one worker retry and one reviewer run produces a three-run report whose sum matches the provider events and survives sandbox cleanup.

### P1: Evidence References Instead of Full Projection

**Observed:** Inline evidence accounts for 46,701 characters in the current ledger. Once projected into `STATE.yml`, accepted-task history is repeatedly returned even when only one task is active.

**Requested:** Store detailed evidence in `.pact/evidence/<feature>/<task>/<event-id>.md` or another immutable content-addressed record. The event contains a digest, bounded summary, path/URI, verification result, and commit.

**Acceptance:** Default status output contains at most 4 KB of summary evidence per active task; full evidence remains auditable by explicit read.

### P1: Failure Limits Before Global Iteration Exhaustion

**Observed:** Rapid runner failures can consume the global iteration budget and surface as a generic iteration-limit problem instead of the real per-seat failure.

**Requested:** Evaluate provider/auth/runner failure thresholds before the global iteration limit and apply exponential backoff. Do not relaunch an authentication/quota failure until external state changes or the owner approves a fallback.

**Acceptance:** Three identical immediate provider failures produce one diagnostic escalation with three attempts, not dozens of launches or an empty-task iteration-limit event.

### P1: Efficient Long-Running Command Handling

**Observed:** Remote Neon tests took 161–511 seconds. Root orchestration repeatedly polled running commands, causing full-context model turns despite no new information.

**Requested:** Runner-owned waiting and heartbeat events that do not invoke the orchestrator model. Surface only output deltas, completion, timeout, or approval needs.

**Acceptance:** A ten-minute silent fixture command produces bounded heartbeat telemetry and one final model-visible completion event.

### P1: Durable Compact Handoffs

**Observed:** Recovery depended on reading full task evidence and stream tails. There is no enforced handoff size or schema.

**Requested:** Generate a compact handoff at pause/escalation containing current task, commit/diff, exact failure, commands already run, external-state dependencies, next command, budget use, and prohibited actions.

**Acceptance:** A new agent can resume the fixture task using a handoff below 12 KB without reading another task's evidence.

## Suggested Delivery Order

1. Diagnostic escalation payloads.
2. Scoped `status` and `log` reads.
3. Complete token telemetry and hard budgets.
4. Evidence references and compact projections.
5. Runner-owned waiting/heartbeats.
6. Generated handoff records.

The first three changes directly address the TradeLinks failure mode and should precede another long multi-task orchestration run.

## Reproduction and Verification Commands

Run in the TradeLinks repository:

```bash
wc -c .pact/STATE.yml .pact/log.jsonl .pact/orchestrate/streams/*.log
jq -s '{
  events: length,
  evidence_events: ([.[] | select(.payload.evidence != null)] | length),
  evidence_bytes: ([.[] | select(.payload.evidence != null) | (.payload.evidence | length)] | add // 0),
  escalations: ([.[] | select(.event_type == "escalate")] | length),
  checkpoints: ([.[] | select(.event_type == "checkpoint")] | length),
  accepts: ([.[] | select(.event_type == "accept")] | length),
  changes_requested: ([.[] | select(.event_type == "changes_requested")] | length)
}' .pact/log.jsonl
```

Do not attach `.env` files, database URLs, provider credentials, cookies, or unredacted tool output to a public issue.

## Product Impact

Pactify's governance ROI was positive: independent review prevented unsafe or inaccurate migration results. Its orchestration-token efficiency was poor. The desired outcome is not fewer gates; it is the same gates with smaller state, precise failures, bounded evidence, measurable budgets, and no model involvement while a process is merely waiting.
