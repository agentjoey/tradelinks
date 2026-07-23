/**
 * Phase 1 idempotent collection run ledger (plan task 4).
 *
 * Every collection attempt persists a diagnosable PipelineRun plus one
 * SourceCheck per source, so retries reuse the scheduled run, successful-empty
 * stays distinct from failure, source freshness advances only on successful
 * checks, and replay never duplicates items or counts.
 *
 * Idempotency keys:
 * - PipelineRun upserts on [jobType, scopeKey, scheduledFor].
 * - SourceCheck upserts on [runId, sourceId]; itemCount is atomically
 *   incremented only by the number of items newly inserted in the current
 *   transaction (an identical replay inserts zero and leaves counts stable).
 */

import type { PipelineJobType, PipelineRun, Prisma, RunStatus, SourceCheck } from "@prisma/client";

import type { FetchOutcome } from "../adapters/types.js";
import { prisma } from "../db/client.js";
import { normalizeUrl, urlHash } from "../lib/hash.js";
import type { RawItem } from "../queue/schemas.js";

const SUCCESS_STATUSES: readonly RunStatus[] = ["SUCCEEDED_EMPTY", "SUCCEEDED_ITEMS"];

export interface BeginRunInput {
  jobType: PipelineJobType;
  scheduledFor: Date;
  runnerVersion: string;
  metadata?: Prisma.InputJsonValue;
}

/** One item after URL/hash dedup: either newly created or already present. */
export interface ItemDedupResult {
  raw: RawItem;
  /** Canonical stored URL (normalizeUrl output). */
  url: string;
  hash: string;
  created: boolean;
  itemId: string;
}

type ItemClient = Pick<typeof prisma, "item">;

/**
 * Insert items with the existing URL/hash dedup (level 1): a urlHash that is
 * already stored yields `created: false` with the existing row's id, so replay
 * never duplicates items. Shared by the ingest worker and the run ledger;
 * pass an interactive-transaction client to make the inserts atomic with
 * surrounding bookkeeping.
 */
export async function insertItemsDeduped(
  sourceId: string,
  items: RawItem[],
  options: {
    client?: ItemClient;
    /** Extra create fields (e.g. the ingest worker's bestseller tagging). */
    extraCreate?: (raw: RawItem) => Record<string, unknown>;
  } = {},
): Promise<ItemDedupResult[]> {
  const client: ItemClient = options.client ?? prisma;
  const results: ItemDedupResult[] = [];
  for (const raw of items) {
    const url = normalizeUrl(raw.url); // canonical (e.g. amazon → /dp/<ASIN>)
    const hash = urlHash(raw.url); // == sha256(normalizeUrl(raw.url))
    const existing = await client.item.findUnique({ where: { urlHash: hash } });
    if (existing) {
      results.push({ raw, url, hash, created: false, itemId: existing.id });
      continue;
    }
    const item = await client.item.create({
      data: {
        sourceId,
        url,
        urlHash: hash,
        title: raw.title,
        lang: raw.lang ?? "en",
        publishedAt: raw.publishedAt ? new Date(raw.publishedAt) : new Date(),
        rawContent: (raw.rawContent ?? undefined) as object | undefined,
        ...(options.extraCreate?.(raw) ?? {}),
      },
    });
    results.push({ raw, url, hash, created: true, itemId: item.id });
  }
  return results;
}

/** Per-check status, derived solely from the fetch outcome. */
function checkStatusOf(outcome: FetchOutcome): RunStatus {
  if (outcome.kind === "success") {
    return outcome.items.length > 0 ? "SUCCEEDED_ITEMS" : "SUCCEEDED_EMPTY";
  }
  return outcome.kind === "blocked" ? "BLOCKED" : "FAILED";
}

/**
 * Run status, derived explicitly from the run's checks: any items ⇒
 * SUCCEEDED_ITEMS; all empty successes ⇒ SUCCEEDED_EMPTY; a mix of successes
 * and failures ⇒ PARTIAL; uniformly blocked ⇒ BLOCKED; anything else (no
 * checks, or failures only) ⇒ FAILED.
 */
export function deriveRunStatus(
  checks: ReadonlyArray<Pick<SourceCheck, "status" | "itemCount">>,
): RunStatus {
  if (checks.length === 0) return "FAILED";
  const successes = checks.filter((c) => SUCCESS_STATUSES.includes(c.status));
  if (successes.length === checks.length) {
    return checks.some((c) => c.status === "SUCCEEDED_ITEMS") ? "SUCCEEDED_ITEMS" : "SUCCEEDED_EMPTY";
  }
  if (successes.length > 0) return "PARTIAL";
  if (checks.every((c) => c.status === "BLOCKED")) return "BLOCKED";
  return "FAILED";
}

/**
 * Begin (or reuse) the run for one scheduled slot. Retries of the same
 * [jobType, scopeKey, scheduledFor] return the existing row untouched, so run
 * ids stay stable across replay while distinct slots stay distinct.
 */
export async function beginRun(input: BeginRunInput & { scopeKey: string }): Promise<PipelineRun> {
  return prisma.pipelineRun.upsert({
    where: {
      jobType_scopeKey_scheduledFor: {
        jobType: input.jobType,
        scopeKey: input.scopeKey,
        scheduledFor: input.scheduledFor,
      },
    },
    create: { ...input, status: "RUNNING" },
    update: {},
  });
}

/**
 * Record one source's fetch outcome within a run. Item inserts, the check
 * upsert, and the source freshness update commit in a single transaction, so
 * inserted counts change only after the item transaction succeeds. Replaying
 * an identical outcome inserts zero items and leaves itemCount stable; a
 * failed/blocked attempt followed by a successful retry adds that attempt's
 * insertion count to the same check row.
 */
export async function recordSourceOutcome(
  runId: string,
  sourceId: string,
  outcome: FetchOutcome,
): Promise<SourceCheck> {
  const status = checkStatusOf(outcome);
  const httpStatus = outcome.kind === "success" ? outcome.httpStatus : (outcome.httpStatus ?? null);
  const contentHash = outcome.kind === "success" ? outcome.contentHash : null;
  const error = outcome.kind === "success" ? null : outcome.code;
  const checkedAt = new Date();

  return prisma.$transaction(async (tx) => {
    let inserted = 0;
    if (outcome.kind === "success" && outcome.items.length > 0) {
      const results = await insertItemsDeduped(sourceId, outcome.items, { client: tx });
      inserted = results.filter((r) => r.created).length;
    }

    const check = await tx.sourceCheck.upsert({
      where: { runId_sourceId: { runId, sourceId } },
      create: { runId, sourceId, status, itemCount: inserted, httpStatus, contentHash, error, checkedAt },
      update: { status, httpStatus, contentHash, error, checkedAt, itemCount: { increment: inserted } },
    });

    // Freshness (lastOkAt) advances on successful checks only — never for
    // blocked/failed outcomes. lastCrawledAt tracks any attempt.
    await tx.source.update({
      where: { id: sourceId },
      data: {
        lastCrawledAt: checkedAt,
        ...(SUCCESS_STATUSES.includes(status) ? { lastOkAt: checkedAt } : {}),
      },
    });
    return check;
  }, {
    // Remote (Neon) latency + cold-start resume can exceed the 5s default
    // interactive-transaction budget; bound it explicitly instead.
    maxWait: 30000,
    timeout: 60000,
  });
}

/**
 * Close a run: derive its status from the recorded checks and aggregate their
 * item counts. Recomputing a finished run yields the same status and count.
 */
export async function finishRun(runId: string): Promise<PipelineRun> {
  const checks = await prisma.sourceCheck.findMany({ where: { runId } });
  return prisma.pipelineRun.update({
    where: { id: runId },
    data: {
      status: deriveRunStatus(checks),
      itemCount: checks.reduce((sum, c) => sum + c.itemCount, 0),
      finishedAt: new Date(),
    },
  });
}
