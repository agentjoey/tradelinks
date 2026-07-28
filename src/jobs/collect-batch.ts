/**
 * Phase 1 resumable collection batch — finite path (Operations Task 2).
 *
 * collectBatch(group, args, deps) iterates enabled sources in the given
 * collection group, fetches each, records per-source outcomes in the
 * idempotent run ledger, and returns a complete JobResult. A failed source
 * never poisons the batch; concurrent fetches are bounded to 5; source-level
 * retry is owned by the batch (maximum 3 structured attempts).
 *
 * The BatchLedger interface decouples the orchestration from the database so
 * credential-free tests can inject a fake ledger.
 */

import { createHash } from "node:crypto";
import parser from "cron-parser";

import type { FetchOutcome } from "../domain/intelligence/source-contract.js";
import type { SourceContract } from "../domain/intelligence/source-contract.js";
import { PHASE1_SOURCES } from "../config/phase1-sources.js";
import { beginRun, finishRun, recordSourceOutcome } from "../collection/run.js";
import { retryUnit } from "./retry.js";
import type { JobArgs, JobResult, JobStatus } from "./types.js";
import { registerJob } from "./registry.js";
import { parseFeed } from "../adapters/rss.js";
import { parseFederalRegister } from "../adapters/json.js";
import { parseHtml } from "../adapters/fetch.js";
import { isBlocked } from "../adapters/blocked.js";
import { callScraper } from "../workers/scrape.js";
import { env } from "../config/env.js";

export type CollectionGroup = "FAST" | "STANDARD" | "SLOW";

// ---- custom errors for structured retry ----

/** Thrown when a retryable FetchOutcome is received (e.g. HTTP 503). */
export class RetryableFetchError extends Error {
  public readonly outcome: FetchOutcome;
  constructor(outcome: FetchOutcome) {
    super(outcome.kind === "success" ? "RETRYABLE" : outcome.code);
    this.name = "RetryableFetchError";
    this.outcome = outcome;
  }
}

/** Thrown when a non-retryable FetchOutcome is received (e.g. blocked, INVARIANT). */
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
  /** Begin (or reuse) the run for one scheduled slot. Returns the run id. */
  beginRun(input: {
    jobType: string;
    scopeKey: string;
    scheduledFor: Date;
    runnerVersion: string;
  }): Promise<string>;
  /** Source IDs that already have a successful check in this run. */
  alreadySucceeded(runId: string): Promise<Set<string>>;
  /** Record one source's fetch outcome. Returns status + itemCount. */
  recordOutcome(
    runId: string,
    sourceId: string,
    outcome: FetchOutcome,
  ): Promise<{ status: string; itemCount: number }>;
  /** Close and derive the run status. */
  finishRun(
    runId: string,
  ): Promise<{ status: string; itemCount: number }>;
}

/** Real ledger backed by the Phase 1 collection-run module. */
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
    return { status: run.status, itemCount: run.itemCount };
  },
};

// ---- deps ----

export interface CollectBatchDeps {
  getSources: (group: CollectionGroup) => SourceContract[];
  fetchSource: (source: SourceContract) => Promise<FetchOutcome>;
  ledger: BatchLedger;
}

export const DEFAULT_DEPS: CollectBatchDeps = {
  getSources: getSourcesForGroup,
  fetchSource: fetchSourceImpl,
  ledger: DB_LEDGER,
};

// ---- cron-to-group mapping ----

/** Parse the hours interval from a cron expression using cron-parser. */
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

/** Default source resolver: group by cron frequency from PHASE1_SOURCES. */
export function getSourcesForGroup(group: CollectionGroup): SourceContract[] {
  return PHASE1_SOURCES.filter((s) => {
    if (!s.enabled || !s.refreshCron) return false;
    const interval = parseCronIntervalHours(s.refreshCron);
    if (group === "FAST") return interval <= 6;
    if (group === "STANDARD") return interval > 6 && interval <= 12;
    return interval > 12;
  });
}

// ---- fetchSourceImpl — production fetch path ----

async function fetchSourceImpl(source: SourceContract): Promise<FetchOutcome> {
  switch (source.fetchMethod) {
    case "RSS":
      return fetchRssSource(source);
    case "JSON":
      return fetchJsonSource(source);
    case "HTML":
      return fetchHtmlSource(source);
    case "SCRAPER":
      return fetchScraperSource(source);
    case "PAGE_DIFF":
      return fetchPageDiffSource(source);
  }
}

const BROWSER_UA =
  "TradeLinks/0.1 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124.0";

async function fetchRssSource(source: SourceContract): Promise<FetchOutcome> {
  try {
    const res = await fetch(source.url, {
      headers: { "User-Agent": BROWSER_UA },
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
    const items = await parseFeed(body, "en");
    return {
      kind: "success",
      items,
      httpStatus: res.status,
      contentHash: createHash("sha256").update(body).digest("hex"),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/robots_denied|license_denied/i.test(msg)) {
      return { kind: "blocked", code: "BOT_WALL", retryable: false };
    }
    return { kind: "failed", code: "FETCH_ERROR", retryable: true };
  }
}

const JSON_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/124.0 Safari/537.36";

async function fetchJsonSource(source: SourceContract): Promise<FetchOutcome> {
  try {
    const res = await fetch(source.url, {
      headers: { "User-Agent": JSON_UA, Accept: "application/json" },
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
    const items = parseFederalRegister(JSON.parse(body));
    return {
      kind: "success",
      items,
      httpStatus: res.status,
      contentHash: createHash("sha256").update(body).digest("hex"),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/robots_denied|license_denied/i.test(msg)) {
      return { kind: "blocked", code: "BOT_WALL", retryable: false };
    }
    return { kind: "failed", code: "FETCH_ERROR", retryable: true };
  }
}

async function fetchHtmlSource(source: SourceContract): Promise<FetchOutcome> {
  if (!source.selectors) {
    return { kind: "failed", code: "INVARIANT: no selectors", retryable: false };
  }
  try {
    const res = await fetch(source.url, {
      headers: {
        "User-Agent": JSON_UA,
        "Accept-Language": "en-US,en;q=0.9",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
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
    if (isBlocked({ body, expectedSelectors: source.selectors ? Object.values(source.selectors) : undefined })) {
      return { kind: "blocked", code: "BOT_WALL", retryable: false };
    }
    const items = parseHtml(body, source.url, {
      itemSelector: source.selectors.item ?? "article",
      titleSelector: source.selectors.title ?? "h2",
      ...(source.selectors.link ? { linkSelector: source.selectors.link } : {}),
    });
    return {
      kind: "success",
      items,
      httpStatus: res.status,
      contentHash: createHash("sha256").update(body).digest("hex"),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/robots_denied|license_denied/i.test(msg)) {
      return { kind: "blocked", code: "BOT_WALL", retryable: false };
    }
    return { kind: "failed", code: "FETCH_ERROR", retryable: true };
  }
}

async function fetchScraperSource(
  source: SourceContract,
): Promise<FetchOutcome> {
  try {
    const items = await callScraper(
      {
        sourceId: source.id,
        url: source.url,
        mode: "stealth",
        ...(source.selectors ? { selectors: source.selectors as Record<string, string> } : {}),
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
    const msg = err instanceof Error ? err.message : String(err);
    if (/robots_denied|license_denied/i.test(msg)) {
      return { kind: "blocked", code: "BOT_WALL", retryable: false };
    }
    return { kind: "failed", code: "FETCH_ERROR", retryable: true };
  }
}

async function fetchPageDiffSource(source: SourceContract): Promise<FetchOutcome> {
  // PAGE_DIFF always returns empty items with a contentHash. The hash diff
  // detection is deferred to a future task; currently this records
  // SUCCEEDED_EMPTY every slot with the current hash for auditing.
  try {
    const res = await fetch(source.url, {
      headers: { "User-Agent": JSON_UA },
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

/** Primary path: outcome-based retry decision. Called after fetchSource returns. */
function branchOnOutcome(outcome: FetchOutcome): FetchOutcome {
  if (outcome.kind === "success") return outcome;
  if (outcome.retryable) throw new RetryableFetchError(outcome);
  throw new NonRetryableFetchError(outcome);
}

/** Fallback: thrown errors that bypassed the outcome path (e.g. transport errors). */
function isRetryableThrownError(error: unknown): boolean {
  if (error instanceof RetryableFetchError) return true;
  if (error instanceof NonRetryableFetchError) return false;
  // Defensive fallback for bare throws (transport/protocol errors).
  const msg = error instanceof Error ? error.message : String(error);
  if (/robots_denied/i.test(msg)) return false;
  if (/license_denied/i.test(msg)) return false;
  if (/INVARIANT/i.test(msg)) return false;
  if (/validation|schema|fixture/i.test(msg)) return false;
  return true;
}

/** Extract the source-level FetchOutcome from a retry error, if possible. */
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

// ---- collectBatch ----

function deriveResultStatus(
  attempted: number,
  succeeded: number,
  failed: number,
): JobStatus {
  if (attempted === 0) return "SUCCEEDED_EMPTY";
  if (succeeded > 0 && failed === 0) return "SUCCEEDED_ITEMS";
  if (succeeded > 0) return "PARTIAL";
  return "FAILED";
}

export async function collectBatch(
  group: CollectionGroup,
  args: JobArgs,
  deps: Partial<CollectBatchDeps> = {},
): Promise<JobResult> {
  const d: CollectBatchDeps = {
    getSources: deps.getSources ?? DEFAULT_DEPS.getSources,
    fetchSource: deps.fetchSource ?? DEFAULT_DEPS.fetchSource,
    ledger: deps.ledger ?? DEFAULT_DEPS.ledger,
  };

  const sources = d.getSources(group);
  const scopeKey = `collect-${group.toLowerCase()}`;

  const runId = await d.ledger.beginRun({
    jobType: "COLLECT",
    scopeKey,
    scheduledFor: args.scheduledFor,
    runnerVersion: args.runnerVersion,
  });

  const skipIds = await d.ledger.alreadySucceeded(runId);
  const pendingSources = sources.filter((s) => !skipIds.has(s.id));

  let attempted = 0;
  let succeeded = 0;
  let failed = 0;
  let totalItems = 0;

  await mapWithLimit(pendingSources, 5, async (source) => {
    attempted++;
    const retryResult = await retryUnit({
      maxAttempts: 3,
      baseDelayMs: 1000,
      execute: async () => {
        const outcome = await d.fetchSource(source);
        return branchOnOutcome(outcome);
      },
      isRetryable: isRetryableThrownError,
    });

    if (retryResult.status === "OK") {
      const outcome = retryResult.value!;
      const check = await d.ledger.recordOutcome(runId, source.id, outcome);
      if (
        check.status === "SUCCEEDED_ITEMS" ||
        check.status === "SUCCEEDED_EMPTY"
      ) {
        succeeded++;
        totalItems += check.itemCount;
      } else {
        failed++;
      }
    } else {
      // Exhausted or invariant failure — record a structured diagnostic check.
      const lastOutcome = outcomeFromError(retryResult.error);
      const code =
        retryResult.status === "EXHAUSTED" ? "RETRY_EXHAUSTED" : "INVARIANT_FAILURE";
      try {
        await d.ledger.recordOutcome(runId, source.id, lastOutcome ?? {
          kind: "failed",
          code,
          retryable: false,
        });
      } catch {
        // best-effort
      }
      failed++;
    }
  });

  await d.ledger.finishRun(runId);

  return {
    runId,
    status: deriveResultStatus(attempted, succeeded, failed),
    attempted,
    succeeded,
    failed,
    itemCount: totalItems,
    exitCode: failed > 0 ? 1 : 0,
  };
}

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
