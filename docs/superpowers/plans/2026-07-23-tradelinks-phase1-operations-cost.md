# TradeLinks Phase 1 Operations and Cost Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore reliable collection and publishing with short-lived Railway Cron jobs, a sleep-capable scraper, explicit run/retry state, cached public reads, and a seven-day P0 burn-in that stays inside a $25–50/month validation budget.

**Architecture:** Railway Cron invokes bounded TypeScript job entry points that take a PostgreSQL advisory lock, resume idempotently through `PipelineRun`/`SourceCheck`, retry only failed units, and exit. The current always-on pg-boss scheduler and five-minute polling loop leave the production path; the Python scraper remains an on-demand HTTP dependency that can scale to zero. Public requests read published canonical versions through Next.js ISR/cache and never wake a worker.

**Tech Stack:** Node.js 20, TypeScript 5, Prisma 6.2, PostgreSQL/Neon, Railway Cron, Railway Serverless, Next.js 14 ISR/cache tags, Vitest, existing Python Scrapling service, Telegram operational alerts.

## Global Constraints

- This operations plan depends on Foundation Tasks 1–7 and their `PipelineRun`, `SourceCheck`, Source SLA, readiness, and canonical publication contracts.
- Production must not run pg-boss five-minute fallback polling or an always-on scheduler.
- No product promise depends on real-time collection; fastest official sources refresh every four hours.
- A low-frequency source is healthy after a successful empty check; it does not need to publish an item every day.
- Public pages must remain available from cached historical content when collection is degraded.
- P0 requires seven consecutive production days with no unobserved global collection gap beyond the configured SLA.
- Validation-period core infrastructure target is $25–50/month, with hard monthly guardrails described below.
- No paid proxy or commercial market-data feed is a core dependency.
- Cloud changes are executed only in the later operations task after explicit Human Owner approval; this planning session changes no cloud resources.

---

## Delivery Boundary

### Goals

- Replace the persistent production worker/scheduler with finite, observable, idempotent jobs.
- Preserve useful retry, dedup, batch, and scraper behavior without keeping pg-boss polling alive.
- Detect fetch failure, content collapse, global schedule gaps, stale sources, and briefing absence.
- Produce auditable P0 evidence for seven continuous days.
- Enforce monthly caps before adding faster schedules or more model calls.

### Non-goals

- Minute-level alerts, guaranteed daily reports, automatic external remediation, paid proxies, commercial demand feeds, multi-region failover, Plus delivery cadence, or Phase 2 agents.
- Changing public IA or seller-facing features.
- Applying Railway, Neon, Vercel, or Resend settings during the planning session.

### Dependency and release position

```text
Foundation schema + source contracts
        ↓
Operations short-lived jobs
        ↓
7-day P0 burn-in
        ↓
Public Intelligence launch
        ↓
Private Relevance launch
```

Public implementation may be developed against fixtures during burn-in, but no redesigned product is exposed to production traffic before P0 passes.

## Current Operations Gap

| Existing path | Current behavior | Required replacement |
|---|---|---|
| `src/queue/queues.ts` | pg-boss maintenance at 15 minutes and fallback polling at 300 seconds | No production queue connection; finite job dispatch and advisory locks |
| `src/workers/index.ts` | Long-lived process registers workers and schedules | `scripts/run-job.ts` runs one named batch and exits |
| `src/workers/scheduler.ts` | pg-boss cron fan-out | Railway Cron schedules, stored run slots, and idempotent job handlers |
| `src/workers/crawler.ts` | Scrapling source can be marked successful when scrape was merely queued | Source success only after parsed fetch outcome is stored |
| `src/workers/scrape.ts` | One-item batches and 120-second calls to a separate service | Bounded batch of five, request timeout, retryable per-source check, sleeping scraper |
| `src/monitoring/health.ts` | Health relies on last item/last crawl and source score | SLA checks, successful-empty checks, collapse baseline, global gaps, downstream absence |
| `docs/railway-setup.md` | Describes current worker/scraper setup | Exact cron services, exit semantics, variables, rollback, and cost caps |
| Dynamic public routes | Database work on each request | ISR/cache tags over published canonical read models |

## Cost Guardrail

Monthly validation caps are product constraints. The cost report fails when projected spend crosses a cap:

| Component | Monthly cap | Enforcement |
|---|---:|---|
| Neon compute and storage | $19 | No five-minute polling; inspect compute-active hours and storage weekly |
| Railway cron job runtime | $8 | Maximum bounded duration per run; no idle worker service |
| Railway sleeping scraper | $7 | Five-item batches, request only for allowlisted sources, scale-to-zero enabled |
| Model classification/writing | $10 | Token/call ledger, deterministic filters first, no model call on unchanged content |
| Resend operational/product email during P0 | $3 | Operational alerts only; private weekly mail starts after P0 |
| Vercel | $0 | Stay within existing free allocation; ISR limits origin reads |
| Contingency | $3 | Alerts at 80% of the total |
| **Total** | **$50** | Freeze non-critical jobs at projected spend above $50 |

The preferred operating point is $25–40. A projected total above $40 triggers review; above $50 automatically suppresses Experimental demand jobs and model-assisted enrichment while preserving official-source collection and health checks.

## File Map

### Create

- `src/jobs/types.ts` — job names, arguments, results, and exit codes.
- `src/jobs/registry.ts` — exact job-to-handler registry.
- `src/jobs/lock.ts` — PostgreSQL advisory lock lifecycle.
- `src/jobs/retry.ts` — bounded unit retry with deterministic backoff.
- `src/jobs/collect-batch.ts` — collect a registry group and persist source outcomes.
- `src/jobs/canonicalize-batch.ts` — cluster/classify unchanged observations only once.
- `src/jobs/publish-batch.ts` — publish reviewed drafts and invalidate cache tags.
- `src/jobs/briefing-batch.ts` — public briefing generation and absence state.
- `src/jobs/health-check.ts` — global gaps, SLAs, collapse, and readiness checks.
- `src/jobs/cost-report.ts` — projected monthly component costs and guardrail decisions.
- `src/jobs/run.ts` — finite dispatcher.
- `scripts/run-job.ts` — command-line entry.
- `scripts/verify-p0-burn-in.ts` — seven-day acceptance report.
- `test/job-lock.test.ts`
- `test/job-retry.test.ts`
- `test/collect-batch.test.ts`
- `test/health-check.test.ts`
- `test/cost-guardrail.test.ts`
- `test/p0-burn-in.test.ts`
- `docs/operations/phase1-runbook.md`
- `docs/operations/phase1-p0-evidence.md`

### Modify

- `package.json` — finite job scripts and removal of pg-boss production scripts after cutover.
- `src/workers/crawler.ts` — store success only after adapter/scraper completion.
- `src/workers/scrape.ts` — bounded batch and source-level result.
- `src/monitoring/health.ts` — delegate to the new health evaluator.
- `src/email/transactional.ts` — operational alert idempotency key.
- `app/lib/home-data.ts` — use canonical cached readers after the public plan supplies them.
- `docs/railway-setup.md` — exact Railway service topology and commands.
- `docs/architecture.md` — runtime topology.
- `.agent/CURRENT.md` — P0 timestamps/evidence only after seven days pass.

### Retire after checkpoint

- `src/queue/queues.ts`
- `src/queue/schemas.ts`
- `src/workers/index.ts`
- `src/workers/scheduler.ts`
- `src/workers/run-once.ts`
- `src/workers/processor.ts`
- `src/workers/scoring.ts`
- `src/workers/health.ts`
- `src/workers/trends.ts`
- `src/workers/x.ts`
- `src/workers/radar-review.ts`
- `src/workers/translate.ts`
- `src/workers/daily-note.ts`
- `test/scheduler.test.ts`

The files are deleted only after the cron path completes 72 hours without a missed or duplicate slot and rollback evidence is recorded. The `pg-boss` package is removed in the same accepted task.

## Job Contract

```ts
export type JobName =
  | "collect-fast"
  | "collect-standard"
  | "collect-slow"
  | "canonicalize"
  | "publish"
  | "public-briefing"
  | "health"
  | "cost-report";

export type JobArgs = {
  scheduledFor: Date;
  runnerVersion: string;
  dryRun: boolean;
};

export type JobResult = {
  runId: string;
  status: "SUCCEEDED_EMPTY" | "SUCCEEDED_ITEMS" | "PARTIAL" | "FAILED" | "BLOCKED";
  attempted: number;
  succeeded: number;
  failed: number;
  itemCount: number;
  exitCode: 0 | 1 | 2;
};
```

Exit `0` means the scheduled unit completed, including successful-empty. Exit `1` means retryable units remain and the next invocation resumes them. Exit `2` means configuration, schema, lock, or invariant failure requires operator action.

## Railway Cron Schedule

Each row is a separate Railway Cron service using the same repository image. Cron expressions are UTC:

| Service | Cron | Start command | Maximum duration |
|---|---|---|---:|
| `tradelinks-collect-fast` | `7 */4 * * *` | `pnpm job --name collect-fast` | 15m |
| `tradelinks-collect-standard` | `23 */12 * * *` | `pnpm job --name collect-standard` | 20m |
| `tradelinks-collect-slow` | `41 2 * * *` | `pnpm job --name collect-slow` | 20m |
| `tradelinks-canonicalize` | `17 */4 * * *` | `pnpm job --name canonicalize` | 15m |
| `tradelinks-publish` | `47 */4 * * *` | `pnpm job --name publish` | 10m |
| `tradelinks-public-briefing` | `10 3 * * 1` | `pnpm job --name public-briefing` | 20m |
| `tradelinks-health` | `35 * * * *` | `pnpm job --name health` | 5m |
| `tradelinks-cost-report` | `15 4 * * *` | `pnpm job --name cost-report` | 5m |

`collect-fast` contains four-to-six-hour official feeds; `collect-standard` contains twelve-hour official/secondary feeds and Amazon BSR; `collect-slow` contains 24-hour allowlisted page-change probes. Experimental demand collection is the first group disabled by cost or source health. Health is hourly because a short database check does not keep Neon awake between invocations.

## Pactify Execution Contract

Use feature id `phase1-operations`. The foundation feature must be accepted first:

```bash
PACT_AGENT_ID=codex pactify plan \
  --feature phase1-operations \
  --planner-kind codex-cli \
  "Execute docs/superpowers/plans/2026-07-23-tradelinks-phase1-operations-cost.md exactly after phase1-foundation is accepted. One plan task per Pactify task; assign every implementation task to kimi and every review to claude; keep dependencies serial."
pactify plan apply phase1-operations
```

Codex 5.6 Sol orchestrates, Kimi Code K3 implements, and Claude Code Opus 5 reviews in a fresh independent session, following the owner's 2026-07-28 reviewer-model decision. Set task dependencies so runtime Tasks 1–4 precede cloud Task 5, and Task 6 cannot start until seven real production days exist. The Kimi worker cannot accept its Pactify task or serve as its independent burn-in verifier.

### Task 1: Implement Finite Dispatch, Locks, and Retry

**Files:**

- Create: `src/jobs/types.ts`
- Create: `src/jobs/registry.ts`
- Create: `src/jobs/lock.ts`
- Create: `src/jobs/retry.ts`
- Create: `src/jobs/run.ts`
- Create: `scripts/run-job.ts`
- Modify: `package.json`
- Test: `test/job-lock.test.ts`
- Test: `test/job-retry.test.ts`

**Interfaces:**

- Produces: `runJob(name: JobName, args: JobArgs): Promise<JobResult>`, `withJobLock<T>(key: string, fn: () => Promise<T>): Promise<T | "LOCKED">`, `retryUnit<T>(input: RetryInput<T>): Promise<RetryResult<T>>`.
- Consumes: `PipelineRun` idempotency and the exact Job Contract.

- [ ] **Step 1: Write concurrency and retry failures**

```ts
it("allows only one run for a job slot", async () => {
  const first = withJobLock("collect-fast:2026-07-23T08", deferredWork);
  await expect(withJobLock("collect-fast:2026-07-23T08", deferredWork))
    .resolves.toBe("LOCKED");
  releaseDeferredWork();
  await first;
});

it("stops after three retryable attempts", async () => {
  const result = await retryUnit({ maxAttempts: 3, baseDelayMs: 1, execute: alwaysRetryableFailure });
  expect(result.attempts).toBe(3);
  expect(result.status).toBe("EXHAUSTED");
});
```

- [ ] **Step 2: Confirm the dispatcher does not exist**

Run: `pnpm vitest run test/job-lock.test.ts test/job-retry.test.ts`

Expected: FAIL because job modules are absent.

- [ ] **Step 3: Implement bounded execution**

```ts
export async function withJobLock<T>(key: string, fn: () => Promise<T>) {
  const lockId = bigintFromStableHash(key);
  const acquired = await prisma.$queryRaw<Array<{ locked: boolean }>>`
    SELECT pg_try_advisory_lock(${lockId}) AS locked
  `;
  if (!acquired[0]?.locked) return "LOCKED" as const;
  try {
    return await fn();
  } finally {
    await prisma.$queryRaw`SELECT pg_advisory_unlock(${lockId})`;
  }
}
```

Use delays `1s`, `4s`, and `16s` in production and injectable delays in tests. A non-retryable invariant failure stops immediately. Add package command:

```json
{
  "scripts": {
    "job": "tsx scripts/run-job.ts"
  }
}
```

- [ ] **Step 4: Verify exits and concurrency**

Run: `pnpm vitest run test/job-lock.test.ts test/job-retry.test.ts && pnpm job --name health --dry-run`

Expected: tests PASS; dry-run prints one JSON `JobResult`, exits 0, and performs no writes.

- [ ] **Step 5: Commit runtime primitives**

```bash
git add src/jobs scripts/run-job.ts package.json test/job-lock.test.ts test/job-retry.test.ts
git commit -m "feat: add finite job dispatcher"
```

**Definition of done:** Jobs have stable names, one slot cannot overlap, retry is bounded and observable, and every process exits.

### Task 2: Convert Collection and Canonicalization to Resumable Batches

**Files:**

- Create: `src/jobs/collect-batch.ts`
- Create: `src/jobs/canonicalize-batch.ts`
- Modify: `src/workers/crawler.ts`
- Modify: `src/workers/scrape.ts`
- Modify: `src/workers/ingest.ts`
- Test: `test/collect-batch.test.ts`
- Modify: `test/scrape-bridge.test.ts`

**Interfaces:**

- Produces: `collectBatch(group: CollectionGroup, args: JobArgs): Promise<JobResult>`, `canonicalizeBatch(args: JobArgs): Promise<JobResult>`.
- Consumes: `PHASE1_SOURCES`, `FetchOutcome`, run/source-check APIs, cluster/classification APIs.

- [ ] **Step 1: Reproduce false success and retry replay**

```ts
it("does not mark a scrape successful before the scraper response", async () => {
  scraper.defer();
  const pending = collectBatch("FAST", args);
  expect(await latestSourceCheck("AMZ-ANNOUNCEMENTS")).toBeNull();
  scraper.resolve(successFixture);
  await pending;
  expect(await latestSourceCheck("AMZ-ANNOUNCEMENTS")).toMatchObject({ status: "SUCCEEDED_ITEMS" });
});

it("retries only failed sources on the same slot", async () => {
  await collectBatch("FAST", args);
  await collectBatch("FAST", args);
  expect(fetchCount("B03")).toBe(1);
  expect(fetchCount("US-CPSC-RECALLS")).toBe(2);
});
```

- [ ] **Step 2: Confirm current crawler marks queueing as success**

Run: `pnpm vitest run test/collect-batch.test.ts test/scrape-bridge.test.ts`

Expected: new test FAILS before the worker rewrite.

- [ ] **Step 3: Implement source-level finite batches**

```ts
const pendingSources = await sourcesWithoutSuccessfulCheck(run.id, sourceIds);
const outcomes = await mapWithConcurrency(pendingSources, 5, async (source) => {
  const outcome = await retryUnit({ maxAttempts: 3, execute: () => fetchSource(source) });
  return recordSourceOutcome(run.id, source.id, outcomeToFetchOutcome(outcome));
});
```

Set scraper batch size to five and keep a 120-second per-request timeout. Do not retry `robots_denied`, `license_denied`, or validation errors. Canonicalization selects observations with no `EvidenceClusterMember`, bounded to 200 items per run.

- [ ] **Step 4: Verify idempotent batch replay**

Run: `pnpm vitest run test/collect-batch.test.ts test/collection-run.test.ts test/scrape-bridge.test.ts test/canonical-cluster.test.ts`

Expected: PASS; source success occurs after fetch/parse, and replay changes no successful unit.

- [ ] **Step 5: Commit batch conversion**

```bash
git add src/jobs/collect-batch.ts src/jobs/canonicalize-batch.ts src/workers/crawler.ts src/workers/scrape.ts src/workers/ingest.ts test/collect-batch.test.ts test/scrape-bridge.test.ts
git commit -m "feat: run collection in resumable batches"
```

**Definition of done:** A failed source does not poison the batch, successful sources are not re-fetched on replay, and the scraper sleeps between cron invocations.

### Task 3: Add Publishing, Briefing, and Cache Invalidation Jobs

**Files:**

- Create: `src/jobs/publish-batch.ts`
- Create: `src/jobs/briefing-batch.ts`
- Modify: `src/jobs/registry.ts`
- Test: `test/publish-job.test.ts`
- Test: `test/briefing-job.test.ts`

**Interfaces:**

- Produces: `publishBatch(args: JobArgs): Promise<JobResult>`, `qualifyWeeklyBriefing(args: JobArgs): Promise<JobResult>`.
- Consumes: reviewed canonical draft publication API and current published canonical versions; Public Task 5 later consumes the same qualification output to persist a Briefing.

- [ ] **Step 1: Define no-op and absence behavior**

```ts
it("succeeds empty when no reviewed draft is publishable", async () => {
  expect(await publishBatch(args)).toMatchObject({ status: "SUCCEEDED_EMPTY", exitCode: 0 });
});

it("records briefing absence when the weekly window has no qualified content", async () => {
  expect(await qualifyWeeklyBriefing(args)).toMatchObject({ status: "BLOCKED", exitCode: 2 });
  expect(await loadOperationalAlert("BRIEFING_ABSENT")).toBeTruthy();
});
```

- [ ] **Step 2: Confirm downstream jobs are not represented**

Run: `pnpm vitest run test/publish-job.test.ts test/briefing-job.test.ts`

Expected: FAIL because the job handlers are missing.

- [ ] **Step 3: Implement bounded publisher contracts**

```ts
for (const draft of reviewedDrafts.slice(0, 100)) {
  await publishCanonicalDraft(draft.id, draft.reviewedBy!);
}
revalidateTag("changes");
revalidateTag("coverage");
```

During P0, the briefing job runs in shadow mode: it selects the Monday–Sunday UTC window, applies the Verified/Monitored publication filters, stores `itemCount`, ordered version IDs in `metadata`, and a stable `outputFingerprint` on the `PipelineRun`, but creates no public page or email. A missing scheduled weekly shadow run or zero qualified weekly entries emits `BRIEFING_ABSENT` and fails P0. Public Task 5 later persists a reviewed Briefing from the same ordered version IDs. Conditional daily absence is always a successful empty result.

- [ ] **Step 4: Verify cache invalidation and absence alerts**

Run: `pnpm vitest run test/publish-job.test.ts test/briefing-job.test.ts`

Expected: PASS; only affected tags invalidate, and weekly/daily absence semantics differ.

- [ ] **Step 5: Commit downstream jobs**

```bash
git add src/jobs/publish-batch.ts src/jobs/briefing-batch.ts src/jobs/registry.ts test/publish-job.test.ts test/briefing-job.test.ts
git commit -m "feat: schedule canonical publishing"
```

**Definition of done:** Reviewed changes publish in bounded batches, cache invalidation is tag-scoped, and forced daily content is impossible.

### Task 4: Detect SLA, Collapse, Global Gaps, and Cost Breaches

**Files:**

- Create: `src/jobs/health-check.ts`
- Create: `src/jobs/cost-report.ts`
- Modify: `src/monitoring/health.ts`
- Modify: `src/email/transactional.ts`
- Test: `test/health-check.test.ts`
- Test: `test/cost-guardrail.test.ts`

**Interfaces:**

- Produces: `evaluateOperationalHealth(now: Date): Promise<HealthReport>`, `evaluateCostGuardrail(input: CostInputs): CostDecision`.
- Consumes: source checks, pipeline runs, source SLA, historical parsed-count median, briefing/delivery rows, channel push idempotency.

- [ ] **Step 1: Encode all failure classes**

```ts
it.each([
  ["GLOBAL_GAP", globalGapFixture],
  ["SOURCE_STALE", staleSourceFixture],
  ["CONTENT_COLLAPSE", collapseFixture],
  ["BRIEFING_ABSENT", missingBriefingFixture],
])("emits %s once per incident window", async (code, fixture) => {
  await seedHealthFixture(fixture);
  await evaluateOperationalHealth(now);
  await evaluateOperationalHealth(now);
  expect(await countAlerts(code)).toBe(1);
});

it("suppresses experimental jobs above the monthly cap", () => {
  expect(evaluateCostGuardrail({ projectedTotalUsd: 51 })).toMatchObject({
    level: "HARD_CAP",
    suppress: ["experimental-demand", "model-enrichment"],
  });
});
```

- [ ] **Step 2: Confirm current health does not cover all classes**

Run: `pnpm vitest run test/health-check.test.ts test/cost-guardrail.test.ts test/health.test.ts`

Expected: new tests FAIL.

- [ ] **Step 3: Implement explicit thresholds**

```ts
const contentCollapsed =
  previousSevenSuccessfulChecks.length >= 4
  && current.status === "SUCCEEDED_EMPTY"
  && median(previousSevenSuccessfulChecks.map((check) => check.itemCount)) >= 5;
```

A global gap exists when no successful collect run covers a source group within that group's maximum SLA. Source Stale starts strictly after its SLA. Content collapse requires a successful parse plus the baseline rule above, so a network failure is not misclassified. Operational alert idempotency key is `${code}:${subjectId}:${utcHour}`.

- [ ] **Step 4: Verify reports and suppression**

Run: `pnpm vitest run test/health-check.test.ts test/cost-guardrail.test.ts test/health.test.ts test/channel-select.test.ts`

Expected: PASS; each incident emits once, official collection remains enabled at the hard cap, and only Experimental/model work is suppressed.

- [ ] **Step 5: Commit health and cost controls**

```bash
git add src/jobs/health-check.ts src/jobs/cost-report.ts src/monitoring/health.ts src/email/transactional.ts test/health-check.test.ts test/cost-guardrail.test.ts
git commit -m "feat: enforce phase1 reliability guardrails"
```

**Definition of done:** Every P0 failure is observable, alert delivery is idempotent, and budget pressure cannot disable critical official-source checks.

### Task 5: Cut Production to Railway Cron and Sleeping Services

**Files:**

- Modify: `docs/railway-setup.md`
- Create: `docs/operations/phase1-runbook.md`
- Modify: `docs/architecture.md`
- Modify: `package.json`
- Delete after 72-hour checkpoint: `src/queue/queues.ts`
- Delete after 72-hour checkpoint: `src/queue/schemas.ts`
- Delete after 72-hour checkpoint: `src/workers/index.ts`
- Delete after 72-hour checkpoint: `src/workers/scheduler.ts`
- Delete after 72-hour checkpoint: `src/workers/run-once.ts`
- Delete after 72-hour checkpoint: `src/workers/processor.ts`
- Delete after 72-hour checkpoint: `src/workers/scoring.ts`
- Delete after 72-hour checkpoint: `src/workers/health.ts`
- Delete after 72-hour checkpoint: `src/workers/trends.ts`
- Delete after 72-hour checkpoint: `src/workers/x.ts`
- Delete after 72-hour checkpoint: `src/workers/radar-review.ts`
- Delete after 72-hour checkpoint: `src/workers/translate.ts`
- Delete after 72-hour checkpoint: `src/workers/daily-note.ts`
- Delete after 72-hour checkpoint: `test/scheduler.test.ts`
- Test: `test/production-runtime.test.ts`

**Interfaces:**

- Produces: documented Railway services from the schedule table and a build-time assertion that production has no persistent worker command.
- Consumes: Tasks 1–4 accepted job commands.

- [ ] **Step 1: Add a production-topology failure**

```ts
it("has no persistent production worker script or pg-boss dependency", () => {
  const pkg = loadPackageJson();
  expect(pkg.dependencies?.["pg-boss"]).toBeUndefined();
  expect(pkg.scripts?.worker).toBeUndefined();
  expect(pkg.scripts?.job).toBe("tsx scripts/run-job.ts");
});
```

- [ ] **Step 2: Verify the old topology is still present**

Run: `pnpm vitest run test/production-runtime.test.ts`

Expected: FAIL because `pg-boss` and the persistent worker script exist.

- [ ] **Step 3: Create services with Human Owner approval**

Before any change, export Railway service variables and deployment identifiers to the private operations record, create the Neon branch `phase1-operations-pre-cron`, and deploy the same application revision to all cron services. Configure the exact schedule/start commands in this plan, set health service and scraper scale-to-zero, and set each cron service to no restart after exit code 0.

Keep the old worker service paused but recoverable for 72 hours. Do not let it run concurrently with cron. Run three manually triggered slots and verify stable `PipelineRun` keys before enabling schedules.

- [ ] **Step 4: Pass the 72-hour checkpoint and remove polling**

Run:

```bash
pnpm vitest run test/production-runtime.test.ts
pnpm why pg-boss
pnpm job --name collect-fast --dry-run
pnpm job --name health --dry-run
```

Expected: test PASS, `pnpm why pg-boss` reports no dependency, both dry runs exit 0, and production evidence shows no missed/duplicate slot for 72 hours. Remove the paused worker only after that evidence is signed off.

Run:

```bash
rg -n 'pg-boss|new PgBoss|boss\.(work|schedule|send)' src package.json
```

Expected: no output. The retained `src/workers/crawler.ts`, `src/workers/scrape.ts`, and `src/workers/ingest.ts` export finite functions called by `src/jobs/collect-batch.ts`; they register no worker or schedule.

- [ ] **Step 5: Commit topology and runbook**

```bash
git add package.json pnpm-lock.yaml test/production-runtime.test.ts docs/railway-setup.md docs/operations/phase1-runbook.md docs/architecture.md
git add -u src/queue src/workers/index.ts src/workers/scheduler.ts src/workers/run-once.ts src/workers/processor.ts src/workers/scoring.ts src/workers/health.ts src/workers/trends.ts src/workers/x.ts src/workers/radar-review.ts src/workers/translate.ts src/workers/daily-note.ts test/scheduler.test.ts
git commit -m "ops: move collection to railway cron"
```

**Definition of done:** No production process polls at five minutes, all cron jobs exit, the scraper sleeps, rollback topology is documented, and 72-hour cron evidence exists.

### Task 6: Run and Certify the Seven-Day P0 Burn-In

**Files:**

- Create: `scripts/verify-p0-burn-in.ts`
- Test: `test/p0-burn-in.test.ts`
- Create: `docs/operations/phase1-p0-evidence.md`
- Modify: `.agent/CURRENT.md`

**Interfaces:**

- Produces: `verifyP0BurnIn(input: { from: Date; to: Date }): Promise<P0Report>`.
- Consumes: seven days of production runs/checks, briefing status, health incidents, cost reports, and capability readiness.

- [ ] **Step 1: Define the complete pass/fail report**

```ts
it("fails a window with one unobserved global gap", async () => {
  const report = await verifyP0BurnIn(await seedSevenDays({ globalGapHours: [61] }));
  expect(report.pass).toBe(false);
  expect(report.failures).toContainEqual(expect.objectContaining({ code: "GLOBAL_GAP" }));
});

it("passes successful-empty low-frequency sources", async () => {
  const report = await verifyP0BurnIn(await seedSevenDays({ lowFrequencyItems: 0, checksSuccessful: true }));
  expect(report.failures).not.toContainEqual(expect.objectContaining({ code: "SOURCE_EMPTY" }));
});
```

- [ ] **Step 2: Confirm no seven-day verifier exists**

Run: `pnpm vitest run test/p0-burn-in.test.ts`

Expected: FAIL because the verifier is absent.

- [ ] **Step 3: Implement immutable evidence output**

```ts
type P0Report = {
  window: { from: string; to: string };
  runnerVersions: string[];
  pass: boolean;
  sourceSlaResults: Array<{ sourceId: string; checks: number; longestGapMinutes: number; pass: boolean }>;
  globalGaps: Array<{ group: string; from: string; to: string }>;
  contentCollapses: Array<{ sourceId: string; detectedAt: string; resolvedAt: string | null }>;
  briefingAbsences: Array<{ period: string; kind: string }>;
  projectedMonthlyCostUsd: number;
  failures: Array<{ code: string; subject: string; evidence: string }>;
  fingerprint: string;
};
```

Pass requires a continuous 168-hour window, no global gap beyond any source-group SLA, every enabled source checked within its own SLA, all collapse/fetch incidents observed and resolved or deliberately lowered to Stale, exactly one successful scheduled weekly shadow-briefing qualification in the window, and projected core spend at or below $50.

- [ ] **Step 4: Execute after seven real days**

Run:

```bash
pnpm tsx scripts/verify-p0-burn-in.ts \
  --latest-complete-window \
  --output docs/operations/phase1-p0-evidence.md
pnpm vitest run test/p0-burn-in.test.ts
```

`--latest-complete-window` selects the most recent fully elapsed 168-hour UTC window ending at the current whole hour and writes the exact `from`/`to` timestamps into the report. Expected: script exits 0 only when `pass: true`, writes source-level evidence and fingerprint, and tests PASS.

- [ ] **Step 5: Independent verification and commit**

An independent Pactify reviewer compares a sample of raw `PipelineRun`/`SourceCheck` rows, Railway execution logs, and spend reports to the generated evidence. After acceptance:

```bash
git add scripts/verify-p0-burn-in.ts test/p0-burn-in.test.ts docs/operations/phase1-p0-evidence.md .agent/CURRENT.md
git commit -m "ops: certify phase1 p0 reliability"
```

**Definition of done:** A real, uninterrupted seven-day report passes, is independently verified, and is linked from `.agent/CURRENT.md`; fixture-only evidence cannot open the public launch gate.

## Monitoring and Rollback

- **Run monitoring:** query latest run per JobName, duration, result, attempt counts, item counts, and runner revision.
- **Source monitoring:** show last successful check, next SLA deadline, parsed-count baseline, readiness, and current incident.
- **Downstream monitoring:** show reviewed drafts awaiting publish, last public weekly briefing, cache invalidation time, and product email delivery after Private launch.
- **Cost monitoring:** store daily actual/projected spend and the applied suppression decision.
- **Rollback checkpoint A:** before cron enablement, store current service configuration and Neon branch.
- **Rollback checkpoint B:** if any global gap or duplicate slot occurs in the first 72 hours, disable cron schedules, deploy the previous release, and run the old worker only after confirming no advisory lock or active cron run remains.
- **Rollback checkpoint C:** after 72 hours and old-worker deletion, rollback is a forward deployment of the last known-good finite job revision; pg-boss is not reintroduced.
- **Data rollback:** preserve run/source-check history and canonical history; correct through new rows and forward migrations.

## Full Verification Gate

```bash
pnpm db:validate
pnpm lint
pnpm test
pnpm build
pnpm job --name collect-fast --dry-run
pnpm job --name health --dry-run
pnpm job --name cost-report --dry-run
pnpm tsx scripts/verify-p0-burn-in.ts --latest-complete-window
```

Expected: all commands exit 0, each job terminates, the final command reports `pass: true`, and projected monthly cost is at most $50.

## Product Spec Coverage Check

- [x] Seven consecutive stable production days: Task 6.
- [x] No unobserved global gap and source-specific SLA: Tasks 4 and 6.
- [x] Successful empty check differs from failure: Tasks 2, 4, and 6.
- [x] Fetch failure, content collapse, and briefing absence alert: Tasks 3 and 4.
- [x] Short-lived Railway Cron jobs: Tasks 1, 2, and 5.
- [x] No five-minute fallback polling: Task 5.
- [x] Sleeping scraper: Tasks 2 and 5.
- [x] ISR/cache does not wake workers: Task 3 contract; public implementation is Public Tasks 4–7.
- [x] No real-time promise: Global Constraints and four-hour minimum schedule.
- [x] $25–50/month target and graceful cost degradation: Cost Guardrail and Task 4.
- [x] No paid proxy/commercial core source: Global Constraints.
- [x] Monitoring and rollback checkpoints: Tasks 4–6 and Monitoring and Rollback.

## Decisions Requiring Human Owner Confirmation

1. **Cron frequency:** approve four hours as the fastest free-tier public freshness promise. Recommendation: approve; it aligns cost, official-source cadence, and scale-to-zero.
2. **Hard cap behavior:** approve suppressing Experimental demand and model enrichment above a projected $50 while official collection continues. Recommendation: approve.
3. **Old worker rollback window:** approve a paused, non-running 72-hour recovery window before deleting pg-boss runtime files and the Railway worker. Recommendation: approve; this is a bounded rollback checkpoint, not a compatibility layer.
4. **P0 launch rule:** approve resetting the seven-day counter after an unobserved global gap, even if the missed interval is later backfilled. Recommendation: approve; backfill does not prove continuous operation.
5. **Operational notifications:** approve Telegram for operator incidents while seller Telegram remains later Phase 1. Recommendation: approve because the existing operational channel can be reused without making a product promise.
