/**
 * Phase 1 resumable collection batch — finite path (Operations Task 2).
 *
 * Exports:
 *   createCollectBatch(deps) → (group, args) => Promise<JobResult>
 *   collectBatch(group, args) — production, exactly 2 parameters
 *
 * The factory is for credential-free tests; the two-param function is the
 * registered job handler.
 */

import { createHash } from "node:crypto";
import parser from "cron-parser";

import type { FetchOutcome } from "../domain/intelligence/source-contract.js";
import type { SourceContract } from "../domain/intelligence/source-contract.js";
import { PHASE1_SOURCES } from "../config/phase1-sources.js";
import { SOURCES_BY_ID } from "../config/sources.js";
import { buildAdapter, toFetchOutcome } from "../adapters/index.js";
import { beginRun, finishRun, recordSourceOutcome } from "../collection/run.js";
import { retryUnit } from "./retry.js";
import type { JobArgs, JobResult, JobStatus } from "./types.js";
import { registerJob } from "./registry.js";
import { callScraper } from "../workers/scrape.js";
import { env } from "../config/env.js";

export type CollectionGroup = "FAST" | "STANDARD" | "SLOW";

// ---- custom errors for structured retry ----

export class RetryableFetchError extends Error {
  public readonly outcome: FetchOutcome;
  constructor(outcome: FetchOutcome) {
    super(outcome.kind === "success" ? "RETRYABLE" : outcome.code);
    this.name = "RetryableFetchError";
    this.outcome = outcome;
  }
}

export class NonRetryableFetchError extends Error {
  public readonly outcome: FetchOutcome;
  constructor(outcome: FetchOutcome) {
    super(outcome.kind === "success" ? "NON_RETRYABLE" : outcome.code);
    this.name = "NonRetryableFetchError";
    this.outcome = outcome;
  }
}

// ---- BatchLedger — injected so credential-free tests pass without DATABASE_URL ----

export interface BatchLedger {
  beginRun(input: {
    jobType: string;
    scopeKey: string;
    scheduledFor: Date;
    runnerVersion: string;
  }): Promise<string>;
  alreadySucceeded(runId: string): Promise<Set<string>>;
  recordOutcome(
    runId: string,
    sourceId: string,
    outcome: FetchOutcome,
  ): Promise<{ status: string; itemCount: number }>;
  finishRun(
    runId: string,
  ): Promise<{
    status: string;
    itemCount: number;
    attempted: number;
    succeeded: number;
    failed: number;
  }>;
}

const DB_LEDGER: BatchLedger = {
  async beginRun(input) {
    const run = await beginRun({
      jobType: input.jobType as Parameters<typeof beginRun>[0]["jobType"],
      scopeKey: input.scopeKey,
      scheduledFor: input.scheduledFor,
      runnerVersion: input.runnerVersion,
    });
    return run.id;
  },
  async alreadySucceeded(runId: string) {
    const { prisma } = await import("../db/client.js");
    const checks = await prisma.sourceCheck.findMany({
      where: {
        runId,
        status: { in: ["SUCCEEDED_ITEMS", "SUCCEEDED_EMPTY"] },
      },
      select: { sourceId: true },
    });
    return new Set(checks.map((c: { sourceId: string }) => c.sourceId));
  },
  async recordOutcome(runId, sourceId, outcome) {
    const check = await recordSourceOutcome(runId, sourceId, outcome);
    return { status: check.status, itemCount: check.itemCount };
  },
  async finishRun(runId) {
    const run = await finishRun(runId);
    const { prisma } = await import("../db/client.js");
    const checks = await prisma.sourceCheck.findMany({
      where: { runId },
      select: { status: true },
    });
    const succeededCount = checks.filter(
      (c: { status: string }) =>
        c.status === "SUCCEEDED_ITEMS" || c.status === "SUCCEEDED_EMPTY",
    ).length;
    const failedCount = checks.filter(
      (c: { status: string }) =>
        c.status === "FAILED" || c.status === "BLOCKED",
    ).length;
    return {
      status: run.status,
      itemCount: run.itemCount,
      attempted: checks.length,
      succeeded: succeededCount,
      failed: failedCount,
    };
  },
};

// ---- deps ----

export interface CollectBatchDeps {
  getSources: (group: CollectionGroup) => SourceContract[];
  fetchSource: (source: SourceContract) => Promise<FetchOutcome>;
  ledger: BatchLedger;
  /** Optional: return true to skip a source (e.g. EXPERIMENTAL at HARD_CAP). */
  shouldSkip?: (source: SourceContract) => Promise<boolean>;
}

// ---- cost suppression reader (production, consumed by collect-batch) ----

async function shouldSkipAtHardCap(source: SourceContract): Promise<boolean> {
  try {
    const { readLatestCostDecision } = await import("./cost-report.js");
    const decision = await readLatestCostDecision();
    if (decision?.level === "HARD_CAP" && decision.suppress.includes("experimental-demand")) {
      return source.readiness === "EXPERIMENTAL";
    }
  } catch {
    // cost-report not available — proceed without suppression
  }
  return false;
}

// ---- cron-to-group mapping ----

export function parseCronIntervalHours(cron: string): number {
  try {
    const interval = parser.parseExpression(cron);
    const d1 = interval.next().toDate();
    const d2 = interval.next().toDate();
    return (d2.getTime() - d1.getTime()) / (1000 * 60 * 60);
  } catch {
    return 24;
  }
}

export function getSourcesForGroup(group: CollectionGroup): SourceContract[] {
  return PHASE1_SOURCES.filter((s) => {
    if (!s.enabled || !s.refreshCron) return false;
    const interval = parseCronIntervalHours(s.refreshCron);
    if (group === "FAST") return interval <= 6;
    if (group === "STANDARD") return interval > 6 && interval <= 12;
    return interval > 12;
  });
}

// ---- fetchSourceViaRegistry — production path via existing registry ----

async function fetchSourceViaRegistry(source: SourceContract): Promise<FetchOutcome> {
  const config = SOURCES_BY_ID.get(source.id);
  if (!config) {
    return { kind: "failed", code: "INVARIANT: no SourceConfig", retryable: false };
  }

  if (config.adapter === "scrapling") {
    return fetchViaScraper(source, config);
  }

  // PAGE_DIFF: fetch the page, return empty items + contentHash for auditing.
  // Diff detection is deferred to a future task; currently this records
  // SUCCEEDED_EMPTY every slot for the AMZ-PRICING-PAGE source.
  if (source.fetchMethod === "PAGE_DIFF") {
    return fetchPageDiffImpl(source);
  }

  let adapter;
  try {
    adapter = buildAdapter(config);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: "failed", code: `INVARIANT: ${msg}`, retryable: false };
  }
  if (!adapter) {
    return { kind: "failed", code: "INVARIANT: unresolvable adapter", retryable: false };
  }

  try {
    const result = await adapter.crawl({ sourceId: source.id, url: source.url, adapter: config.adapter });
    return toFetchOutcome(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { kind: "failed", code: `ADAPTER_ERROR: ${msg}`, retryable: true };
  }
}

async function fetchViaScraper(
  source: SourceContract,
  config: { scrapeMode?: string; scrapeSelectors?: Record<string, string> },
): Promise<FetchOutcome> {
  try {
    const items = await callScraper(
      {
        sourceId: source.id,
        url: source.url,
        mode: (config.scrapeMode as "stealth" | "trends") ?? "stealth",
        ...(config.scrapeSelectors ? { selectors: config.scrapeSelectors } : {}),
      },
      env.SCRAPER_SERVICE_URL,
    );
    return {
      kind: "success",
      items,
      httpStatus: 200,
      contentHash: createHash("sha256").update(JSON.stringify(items)).digest("hex"),
    };
  } catch (err) {
    return classifyCallScraperError(err);
  }
}

/** Classify an error thrown by callScraper into a FetchOutcome. Parses the
 *  HTTP status from scraper error messages and applies the same retryability
 *  rule as toFetchOutcome: retryable only for 429/5xx/transport.
 *  Schema validation failures (no HTTP status) are non-retryable. Exported
 *  for credential-free testing. */
export function classifyCallScraperError(err: unknown): FetchOutcome {
  const msg = err instanceof Error ? err.message : String(err);
  if (/robots_denied|license_denied/i.test(msg)) {
    return { kind: "blocked", code: "BOT_WALL", retryable: false };
  }
  // callScraper throws "scraper service HTTP <status>: <body>" on non-2xx.
  const statusMatch = msg.match(/\bHTTP (\d{3})\b/);
  const httpStatus = statusMatch ? Number(statusMatch[1]) : undefined;
  if (httpStatus !== undefined) {
    return {
      kind: "failed",
      code: `SCRAPER_HTTP_${httpStatus}`,
      retryable: httpStatus === 429 || httpStatus >= 500,
      httpStatus,
    };
  }
  // Schema validation failure (ZodError from ScrapeResponseSchema.parse) or
  // other unclassified errors — never retried.
  return { kind: "failed", code: `SCRAPER_ERROR: ${msg.slice(0, 100)}`, retryable: false };
}

async function fetchPageDiffImpl(source: SourceContract): Promise<FetchOutcome> {
  try {
    const res = await fetch(source.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.text();
    if (!res.ok) {
      return {
        kind: "failed",
        code: `HTTP_${res.status}`,
        retryable: res.status === 429 || res.status >= 500,
        httpStatus: res.status,
      };
    }
    return {
      kind: "success",
      items: [],
      httpStatus: res.status,
      contentHash: createHash("sha256").update(body).digest("hex"),
    };
  } catch {
    return { kind: "failed", code: "FETCH_ERROR", retryable: true };
  }
}

// ---- retryable error detection ----

function branchOnOutcome(outcome: FetchOutcome): FetchOutcome {
  if (outcome.kind === "success") return outcome;
  if (outcome.retryable) throw new RetryableFetchError(outcome);
  throw new NonRetryableFetchError(outcome);
}

function isRetryableThrownError(error: unknown): boolean {
  if (error instanceof RetryableFetchError) return true;
  if (error instanceof NonRetryableFetchError) return false;
  const msg = error instanceof Error ? error.message : String(error);
  if (/robots_denied/i.test(msg)) return false;
  if (/license_denied/i.test(msg)) return false;
  if (/INVARIANT/i.test(msg)) return false;
  if (/validation|schema|fixture/i.test(msg)) return false;
  return true;
}

function outcomeFromError(error: unknown): FetchOutcome | null {
  if (error instanceof RetryableFetchError) return error.outcome;
  if (error instanceof NonRetryableFetchError) return error.outcome;
  return null;
}

// ---- sliding-window concurrency limiter ----

async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: (R | undefined)[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const i = index++;
      const item = items[i]!;
      try {
        results[i] = await fn(item);
      } catch {
        // errors are handled at the call site
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results.filter((r): r is R => r !== undefined);
}

// ---- factories (acceptance pin 1) ----

/** Create a production collectBatch with the default deps wired in. */
export function createCollectBatch(
  deps: CollectBatchDeps,
): (
  group: CollectionGroup,
  args: JobArgs,
) => Promise<JobResult> {
  return async (
    group: CollectionGroup,
    args: JobArgs,
  ): Promise<JobResult> => {
    const sources = deps.getSources(group);
    const scopeKey = `collect-${group.toLowerCase()}`;

    const runId = await deps.ledger.beginRun({
      jobType: "COLLECT",
      scopeKey,
      scheduledFor: args.scheduledFor,
      runnerVersion: args.runnerVersion,
    });

    // Apply cost suppression: skip EXPERIMENTAL demand sources at HARD_CAP
    let pendingSources: SourceContract[];
    if (deps.shouldSkip) {
      const skipFlags = await Promise.all(sources.map(async (s) => ({
        source: s,
        skip: await deps.shouldSkip!(s),
      })));
      pendingSources = skipFlags.filter((f) => !f.skip).map((f) => f.source);
    } else {
      pendingSources = sources;
    }

    const skipIds = await deps.ledger.alreadySucceeded(runId);
    pendingSources = pendingSources.filter((s) => !skipIds.has(s.id));

    // Track in-invocation failures that never reached the ledger (BLOCKER 2 fix).
    let unreportedFailures = 0;

    await mapWithLimit(pendingSources, 5, async (source) => {
      const retryResult = await retryUnit({
        maxAttempts: 3,
        baseDelayMs: 1000,
        execute: async () => {
          const outcome = await deps.fetchSource(source);
          return branchOnOutcome(outcome);
        },
        isRetryable: isRetryableThrownError,
      });

      if (retryResult.status === "OK") {
        const outcome = retryResult.value!;
        try {
          await deps.ledger.recordOutcome(runId, source.id, outcome);
        } catch {
          // Ledger write rejected — source was reached but the check was
          // not persisted. Count it so it doesn't silently vanish (BLOCKER 2).
          unreportedFailures++;
        }
      } else {
        const lastOutcome = outcomeFromError(retryResult.error);
        const code =
          retryResult.status === "EXHAUSTED"
            ? "RETRY_EXHAUSTED"
            : "INVARIANT_FAILURE";
        try {
          await deps.ledger.recordOutcome(runId, source.id, lastOutcome ?? {
            kind: "failed",
            code,
            retryable: false,
          });
        } catch {
          unreportedFailures++;
        }
      }
    });

    // Derive the persisted status and cumulative counts from finishRun.
    const finished = await deps.ledger.finishRun(runId);

    // Reconcile: if any source was reached but the check never persisted,
    // the persisted failed count undercounts. Surface at least the
    // unreported failures.
    const reconciledFailed = Math.max(finished.failed, unreportedFailures);
    // If we know about failures the persisted run doesn't, the run is at
    // best PARTIAL.
    let status = finished.status as JobStatus;
    if (unreportedFailures > 0 && status !== "FAILED") {
      status = finished.attempted > 0 || finished.failed > 0 ? "PARTIAL" : "FAILED";
    }

    return {
      runId,
      status,
      attempted: Math.max(finished.attempted, pendingSources.length),
      succeeded: finished.succeeded,
      failed: reconciledFailed,
      itemCount: finished.itemCount,
      exitCode: reconciledFailed > 0 ? 1 : 0,
    };
  };
}

/** Production two-parameter entry point — exactly the spec shape. */
export const collectBatch = createCollectBatch({
  getSources: getSourcesForGroup,
  fetchSource: fetchSourceViaRegistry,
  ledger: DB_LEDGER,
  shouldSkip: shouldSkipAtHardCap,
});

// ---- job registration ----

async function dryRunCollectBatch(group: CollectionGroup): Promise<JobResult> {
  const sources = getSourcesForGroup(group);
  return {
    runId: crypto.randomUUID(),
    status: "SUCCEEDED_EMPTY",
    attempted: sources.length,
    succeeded: 0,
    failed: 0,
    itemCount: 0,
    exitCode: 0,
  };
}

registerJob({
  name: "collect-fast",
  maxAttempts: 1,
  run: (args) => collectBatch("FAST", args),
  dryRun: () => dryRunCollectBatch("FAST"),
});

registerJob({
  name: "collect-standard",
  maxAttempts: 1,
  run: (args) => collectBatch("STANDARD", args),
  dryRun: () => dryRunCollectBatch("STANDARD"),
});

registerJob({
  name: "collect-slow",
  maxAttempts: 1,
  run: (args) => collectBatch("SLOW", args),
  dryRun: () => dryRunCollectBatch("SLOW"),
});
