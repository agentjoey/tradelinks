/**
 * Phase 1 canonicalization batch — finite path (Operations Task 2).
 *
 * Exports:
 *   createCanonicalizeBatch(deps) → (args) => Promise<JobResult>
 *   canonicalizeBatch(args) — production, exactly 1 parameter
 *
 * The factory is for credential-free tests; the one-param function is the
 * registered job handler.
 */

import type { EvidenceRole } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { candidateFingerprint, type SourceItemFacts } from "../canonicalize/fingerprint.js";
import { decideCluster } from "../canonicalize/cluster.js";
import {
  buildPromotionDraft,
  isPromotableAnchor,
  type PromotableCluster,
  type PromotionDraft,
} from "../canonicalize/promote.js";
import { beginRun } from "../collection/run.js";
import type { SourceContract } from "../domain/intelligence/source-contract.js";
import { PHASE1_SOURCES, PHASE1_SOURCES_BY_ID } from "../config/phase1-sources.js";
import type { JobArgs, JobResult, JobStatus } from "./types.js";
import { registerJob } from "./registry.js";

const MAX_ITEMS_PER_RUN = 200;

/**
 * Clusters promoted per slot. The backlog at cutover was ~1,650 eligible
 * clusters; at six slots a day this drains it in under two days while leaving
 * the 15-minute job budget mostly to clustering.
 */
const MAX_PROMOTIONS_PER_RUN = 150;

/** Outcome of persisting one promotion; a replay is not new work. */
export type PromotionOutcome = "PROMOTED" | "ALREADY_PROMOTED";

/**
 * Sources whose items may anchor a claimed change. Computed once from the
 * contracts so the SQL pre-filter can never drift from the real gate in
 * `isPromotableAnchor`.
 */
const PROMOTABLE_ANCHOR_SOURCE_IDS: string[] = PHASE1_SOURCES.filter((s) =>
  isPromotableAnchor(s),
).map((s) => s.id);

export interface MatchedItem {
  itemId: string;
  sourceId: string;
  contract: SourceContract | undefined;
  facts: SourceItemFacts;
}

// ---- injectable deps ----

export interface CanonicalizeDeps {
  selectOrphans(limit: number): Promise<MatchedItem[]>;
  upsertCluster(fingerprint: string): Promise<string>;
  upsertMember(
    clusterId: string,
    itemId: string,
    role: EvidenceRole,
  ): Promise<boolean>;
  beginRun(input: {
    scopeKey: string;
    scheduledFor: Date;
    runnerVersion: string;
  }): Promise<string>;
  finishRun(
    runId: string,
    summary: { status: string; itemCount: number; attempted: number; succeeded: number; failed: number },
  ): Promise<void>;
  /** Read the existing PipelineRun itemCount — used on replay to avoid
   *  overwriting a prior run's count with 0. Returns 0 if the run does
   *  not exist. */
  existingItemCount?(runId: string): Promise<number>;
  /** Read the existing PipelineRun summary — used on replay to preserve
   *  the prior status and cumulative counts when no new work was done.
   *  Returns null when no prior summary exists (first run). */
  existingSummary?(runId: string): Promise<{
    status: string; itemCount: number; attempted: number;
    succeeded: number; failed: number;
  } | null>;
  /**
   * Clusters with no CanonicalChange yet, pre-filtered to those holding at
   * least one member from an anchor-eligible source. Optional so existing
   * callers and tests keep working without a promotion phase.
   */
  selectPromotableClusters?(limit: number): Promise<PromotableCluster[]>;
  /** Persist one built draft. Must be idempotent on the cluster. */
  promoteCluster?(draft: PromotionDraft): Promise<PromotionOutcome>;
}

// ---- production deps ----

const REAL_DEPS: CanonicalizeDeps = {
  async selectOrphans(limit: number) {
    const { prisma: db } = await import("../db/client.js");
    const items = await db.item.findMany({
      where: { evidenceClusterMembers: { none: {} } },
      take: limit,
      orderBy: { crawledAt: "desc" },
      select: { id: true, title: true, sourceId: true, publishedAt: true },
    });
    return items.map((item) => {
      const contract = PHASE1_SOURCES_BY_ID.get(item.sourceId);
      return {
        itemId: item.id,
        sourceId: item.sourceId,
        contract,
        facts: factsFromItem(item, contract),
      };
    });
  },
  async upsertCluster(fingerprint: string) {
    const { prisma: db } = await import("../db/client.js");
    const result = await db.$transaction(async (tx) => {
      let cluster = await tx.evidenceCluster.findUnique({
        where: { fingerprint },
        select: { id: true },
      });
      if (!cluster) {
        cluster = await tx.evidenceCluster.create({
          data: { fingerprint, status: "DRAFT" },
          select: { id: true },
        });
      }
      return cluster.id;
    }, { maxWait: 30000, timeout: 60000 });
    return result;
  },
  async upsertMember(clusterId: string, itemId: string, role: EvidenceRole) {
    const { prisma: db } = await import("../db/client.js");
    try {
      await db.evidenceClusterMember.create({
        data: { clusterId, itemId, role },
      });
      return true;
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e.code === "P2002") return false;
      throw err;
    }
  },
  async selectPromotableClusters(limit: number) {
    const { prisma: db } = await import("../db/client.js");
    const clusters = await db.evidenceCluster.findMany({
      where: {
        canonicalChange: { is: null },
        // Cheap pre-filter: readiness lives in the contract, not the database,
        // so SQL narrows by source id and buildPromotionDraft applies the real
        // gate. Without this the limit would be spent on ineligible clusters.
        members: { some: { item: { sourceId: { in: PROMOTABLE_ANCHOR_SOURCE_IDS } } } },
      },
      take: limit,
      // Newest cluster first: the most recent changes reach review soonest.
      orderBy: { createdAt: "desc" },
      include: { members: { include: { item: true } } },
    });
    return clusters.map((c) => ({
      clusterId: c.id,
      fingerprint: c.fingerprint,
      members: c.members.map((m) => ({
        itemId: m.itemId,
        sourceId: m.item.sourceId,
        role: m.role,
        contract: PHASE1_SOURCES_BY_ID.get(m.item.sourceId),
        item: {
          title: m.item.title,
          titleEn: m.item.titleEn,
          summaryEn: m.item.summaryEn,
          url: m.item.url,
          publishedAt: m.item.publishedAt,
          crawledAt: m.item.crawledAt,
          regions: m.item.regions,
          urgencyScore: m.item.urgencyScore,
        },
      })),
    }));
  },
  async promoteCluster(draft: PromotionDraft): Promise<PromotionOutcome> {
    const { prisma: db } = await import("../db/client.js");
    try {
      await db.$transaction(async (tx) => {
        const change = await tx.canonicalChange.create({
          data: { slug: draft.slug, clusterId: draft.clusterId },
          select: { id: true },
        });
        const version = await tx.canonicalChangeVersion.create({
          data: { canonicalChangeId: change.id, ...draft.version },
          select: { id: true },
        });
        await tx.evidenceRecord.createMany({
          data: draft.evidence.map((e) => ({ changeVersionId: version.id, ...e })),
          skipDuplicates: true,
        });
      }, { maxWait: 30000, timeout: 60000 });
      return "PROMOTED";
    } catch (err: unknown) {
      const e = err as { code?: string; meta?: { target?: unknown } };
      // A cluster already promoted is a replay, not a fault. Any other unique
      // violation is a real problem and must surface as a failed unit.
      if (e.code === "P2002") {
        const target = Array.isArray(e.meta?.target) ? (e.meta!.target as string[]) : [];
        if (target.includes("clusterId")) return "ALREADY_PROMOTED";
      }
      throw err;
    }
  },
  async beginRun(input) {
    const run = await beginRun({
      jobType: "CANONICALIZE",
      scopeKey: input.scopeKey,
      scheduledFor: input.scheduledFor,
      runnerVersion: input.runnerVersion,
    });
    return run.id;
  },
  async finishRun(runId: string, summary: { status: string; itemCount: number; attempted: number; succeeded: number; failed: number }) {
    const { prisma: db } = await import("../db/client.js");
    await db.pipelineRun.update({
      where: { id: runId },
      data: {
        status: summary.status as import("@prisma/client").RunStatus,
        itemCount: summary.itemCount,
        finishedAt: new Date(),
        // The canonicalize PipelineRun has no SourceChecks, so we store the
        // completion summary in metadata for replay preservation.
        metadata: {
          canonicalizeSummary: {
            status: summary.status,
            itemCount: summary.itemCount,
            attempted: summary.attempted,
            succeeded: summary.succeeded,
            failed: summary.failed,
          },
        },
      },
    });
  },
  async existingItemCount(runId: string) {
    const { prisma: db } = await import("../db/client.js");
    const run = await db.pipelineRun.findUnique({
      where: { id: runId },
      select: { itemCount: true },
    });
    return run?.itemCount ?? 0;
  },
  async existingSummary(runId: string) {
    const { prisma: db } = await import("../db/client.js");
    const run = await db.pipelineRun.findUnique({
      where: { id: runId },
      select: { finishedAt: true, metadata: true },
    });
    if (!run || !run.finishedAt) return null;
    const meta = run.metadata as { canonicalizeSummary?: {
      status: string; itemCount: number;
      attempted: number; succeeded: number; failed: number;
    } } | null;
    if (!meta?.canonicalizeSummary) return null;
    return meta.canonicalizeSummary;
  },
};

// ---- facts derivation ----

function factsFromItem(
  item: { id: string; title: string; sourceId: string; publishedAt: Date },
  contract: SourceContract | undefined,
): SourceItemFacts {
  return {
    id: item.id,
    title: item.title,
    market: contract?.market ?? "US",
    platforms: contract?.platforms ?? [],
    publishedAt: item.publishedAt.toISOString(),
    productCategories: contract?.categories,
    // authorityEventId and effectiveAt are not carried by Item DB rows.
    // decideCluster's official-id and effective-date guards can only fire
    // when upstream enrichments add those fields — deferred to a later task.
  };
}

function deriveRole(contract: SourceContract | undefined): EvidenceRole {
  if (!contract) return "SECONDARY_CONTEXT";
  if (contract.authorityLevel === "GOVERNMENT_OFFICIAL" && contract.primaryEvidenceEligible) {
    return "PRIMARY_OFFICIAL";
  }
  if (contract.authorityLevel === "GOVERNMENT_OFFICIAL") return "SUPPORTING_OFFICIAL";
  if (contract.authorityLevel === "PLATFORM_OFFICIAL" && contract.primaryEvidenceEligible) {
    return "PRIMARY_OFFICIAL";
  }
  if (contract.authorityLevel === "PLATFORM_OFFICIAL") return "SUPPORTING_OFFICIAL";
  return "SECONDARY_CONTEXT";
}

// ---- factory ----

export function createCanonicalizeBatch(
  deps: CanonicalizeDeps,
): (args: JobArgs) => Promise<JobResult> {
  return async (args: JobArgs): Promise<JobResult> => {
    const scopeKey = "canonicalize";
    const runId = await deps.beginRun({
      scopeKey,
      scheduledFor: args.scheduledFor,
      runnerVersion: args.runnerVersion,
    });

    const orphans = await deps.selectOrphans(MAX_ITEMS_PER_RUN);
    let attempted = 0;
    let succeeded = 0;
    let totalItems = 0;

    const buckets = new Map<string, MatchedItem[]>();
    for (const o of orphans) {
      const fp = candidateFingerprint(o.facts);
      const group = buckets.get(fp) ?? [];
      group.push(o);
      buckets.set(fp, group);
    }

    const representatives = new Map(
      [...buckets.entries()].map(([fp, members]) => [fp, members[0]!]),
    );
    const mergedInto = new Map<string, string>();

    const fpList = [...buckets.keys()];
    for (let i = 0; i < fpList.length; i++) {
      const fpI = fpList[i]!;
      if (mergedInto.has(fpI)) continue;
      for (let j = i + 1; j < fpList.length; j++) {
        const fpJ = fpList[j]!;
        if (mergedInto.has(fpJ)) continue;
        const repI = representatives.get(fpI)!;
        const repJ = representatives.get(fpJ)!;
        const decision = await decideCluster({
          left: repI.facts,
          right: repJ.facts,
        });
        if (decision.decision === "MERGE") {
          const membersI = buckets.get(fpI)!;
          const membersJ = buckets.get(fpJ)!;
          if (membersI.length >= membersJ.length) {
            membersI.push(...membersJ);
            mergedInto.set(fpJ, fpI);
          } else {
            membersJ.push(...membersI);
            mergedInto.set(fpI, fpJ);
          }
          break;
        }
      }
    }

    for (const [fingerprint, members] of buckets) {
      if (mergedInto.has(fingerprint)) continue;
      attempted++;
      try {
        const clusterId = await deps.upsertCluster(fingerprint);
        let created = 0;
        for (const m of members) {
          const newlyAdded = await deps.upsertMember(
            clusterId,
            m.itemId,
            deriveRole(m.contract),
          );
          if (newlyAdded) created++;
        }
        totalItems += created;
        succeeded++;
      } catch {
        // Individual cluster failures don't poison the batch.
      }
    }

    // ---- promotion phase ----
    //
    // Clustering alone left production with thousands of clusters and no
    // canonical changes. Promotion runs here rather than as a ninth Railway
    // service: it shares the clustering slot, and its counts fold into the
    // run's so a slot that promoted changes never reports itself empty.
    // Nothing it writes is publicly visible — every draft needs a human.
    if (deps.selectPromotableClusters && deps.promoteCluster) {
      const candidates = await deps.selectPromotableClusters(MAX_PROMOTIONS_PER_RUN);
      for (const candidate of candidates) {
        // Selection filters by source id in SQL; anchor readiness lives in the
        // contract. A source regraded down leaves a selected cluster with no
        // valid anchor — that is a skip, not a failure.
        const draft = buildPromotionDraft(candidate);
        if (!draft) continue;
        attempted++;
        try {
          const outcome = await deps.promoteCluster(draft);
          succeeded++;
          if (outcome === "PROMOTED") totalItems++;
        } catch {
          // One bad cluster must not cost the slot its other promotions.
        }
      }
    }

    const status: JobStatus =
      attempted === 0
        ? "SUCCEEDED_EMPTY"
        : succeeded === attempted
          ? totalItems > 0
            ? "SUCCEEDED_ITEMS"
            : "SUCCEEDED_EMPTY"
          : "PARTIAL";

    const failed = attempted - succeeded;

    // On replay, accumulate onto the prior persisted summary so the result
    // summarizes the run's complete history, not just current-invocation work.
    let persistedStatus: JobStatus = status;
    let persistedItemCount = totalItems;
    let persistedAttempted = attempted;
    let persistedSucceeded = succeeded;
    let persistedFailed = failed;
    if (deps.existingSummary) {
      const prior = await deps.existingSummary(runId);
      if (prior) {
        if (totalItems === 0) {
          // Replay produced no new work — preserve the prior summary verbatim.
          persistedStatus = (prior.status === "FAILED" || prior.status === "SUCCEEDED_EMPTY" ||
            prior.status === "SUCCEEDED_ITEMS" || prior.status === "PARTIAL")
            ? prior.status : status;
          persistedItemCount = prior.itemCount;
          persistedAttempted = prior.attempted;
          persistedSucceeded = prior.succeeded;
          persistedFailed = prior.failed;
        } else {
          // Replay produced new work — accumulate onto the prior summary.
          persistedItemCount = prior.itemCount + totalItems;
          persistedAttempted = prior.attempted + attempted;
          persistedSucceeded = prior.succeeded + succeeded;
          persistedFailed = prior.failed + failed;
          persistedStatus = (
            persistedAttempted === 0 ? "SUCCEEDED_EMPTY"
            : persistedSucceeded === persistedAttempted
              ? persistedItemCount > 0 ? "SUCCEEDED_ITEMS" : "SUCCEEDED_EMPTY"
            : "PARTIAL"
          ) as JobStatus;
        }
      } else if (totalItems === 0 && deps.existingItemCount) {
        persistedItemCount = await deps.existingItemCount(runId);
      }
    }

    await deps.finishRun(runId, {
      status: persistedStatus,
      itemCount: persistedItemCount,
      attempted: persistedAttempted,
      succeeded: persistedSucceeded,
      failed: persistedFailed,
    });

    return {
      runId,
      status: persistedStatus,
      attempted: persistedAttempted,
      succeeded: persistedSucceeded,
      failed: persistedFailed,
      itemCount: persistedItemCount,
      exitCode: persistedFailed > 0 ? 1 : 0,
    };
  };
}

/** Production one-parameter entry point — exactly the spec shape. */
export const canonicalizeBatch = createCanonicalizeBatch(REAL_DEPS);

// ---- job registration ----

registerJob({
  name: "canonicalize",
  maxAttempts: 1,
  run: canonicalizeBatch,
  dryRun: async (_args: JobArgs): Promise<JobResult> => {
    const orphans = await REAL_DEPS.selectOrphans(MAX_ITEMS_PER_RUN);
    return {
      runId: randomUUID(),
      status: "SUCCEEDED_EMPTY",
      attempted: orphans.length,
      succeeded: 0,
      failed: 0,
      itemCount: 0,
      exitCode: 0,
    };
  },
});
