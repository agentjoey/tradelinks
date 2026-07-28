/**
 * Phase 1 canonicalization batch — finite path (Operations Task 2).
 *
 * canonicalizeBatch(args, deps) selects at most 200 items lacking an
 * EvidenceClusterMember, fingerprints each, clusters using
 * decideCluster (official-id dominance + market/platform/date guards +
 * trigram similarity) for cross-fingerprint merges, and creates
 * EvidenceCluster / EvidenceClusterMember records idempotently.
 * Does NOT publish versions — that is Task 3 behaviour.
 *
 * CanonicalizeDeps decouples data access so credential-free tests can
 * inject fake item selection and cluster storage.
 */

import type { EvidenceRole } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { candidateFingerprint, type SourceItemFacts } from "../canonicalize/fingerprint.js";
import { decideCluster } from "../canonicalize/cluster.js";
import { beginRun } from "../collection/run.js";
import type { SourceContract } from "../domain/intelligence/source-contract.js";
import { PHASE1_SOURCES_BY_ID } from "../config/phase1-sources.js";
import type { JobArgs, JobResult, JobStatus } from "./types.js";
import { registerJob } from "./registry.js";

const MAX_ITEMS_PER_RUN = 200;

/** Minimum facts we can derive from an Item + its SourceContract. */
export interface MatchedItem {
  itemId: string;
  sourceId: string;
  contract: SourceContract | undefined;
  facts: SourceItemFacts;
}

// ---- injectable deps ----

export interface CanonicalizeDeps {
  /** Return up to `limit` orphan items (no EvidenceClusterMember). */
  selectOrphans(limit: number): Promise<MatchedItem[]>;
  /** Find an existing cluster by fingerprint, or create one. Returns cluster id. */
  upsertCluster(fingerprint: string): Promise<string>;
  /** Create a cluster member if it doesn't already exist. Returns true when newly created. */
  upsertMember(
    clusterId: string,
    itemId: string,
    role: EvidenceRole,
  ): Promise<boolean>;
  /** Begin a run for this batch. Returns runId. */
  beginRun(input: {
    scopeKey: string;
    scheduledFor: Date;
    runnerVersion: string;
  }): Promise<string>;
  /** Finish the run with the derived completion summary. The implementation
   *  must persist the summary to the PipelineRun so the persisted row matches
   *  the returned JobResult. */
  finishRun(
    runId: string,
    summary: { status: string; itemCount: number; attempted: number; succeeded: number; failed: number },
  ): Promise<void>;
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
    // Use create with try/catch for P2002 (unique violation) to avoid
    // a separate findUnique round-trip.
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
  async beginRun(input) {
    const run = await beginRun({
      jobType: "CANONICALIZE",
      scopeKey: input.scopeKey,
      scheduledFor: input.scheduledFor,
      runnerVersion: input.runnerVersion,
    });
    return run.id;
  },
  async finishRun(runId: string, summary: { status: string; itemCount: number }) {
    const { prisma: db } = await import("../db/client.js");
    await db.pipelineRun.update({
      where: { id: runId },
      data: {
        status: summary.status as import("@prisma/client").RunStatus,
        itemCount: summary.itemCount,
        finishedAt: new Date(),
      },
    });
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

export async function canonicalizeBatch(
  args: JobArgs,
  deps: Partial<CanonicalizeDeps> = {},
): Promise<JobResult> {
  const d: CanonicalizeDeps = {
    selectOrphans: deps.selectOrphans ?? REAL_DEPS.selectOrphans,
    upsertCluster: deps.upsertCluster ?? REAL_DEPS.upsertCluster,
    upsertMember: deps.upsertMember ?? REAL_DEPS.upsertMember,
    beginRun: deps.beginRun ?? REAL_DEPS.beginRun,
    finishRun: deps.finishRun ?? REAL_DEPS.finishRun,
  };

  const scopeKey = "canonicalize";
  const runId = await d.beginRun({
    scopeKey,
    scheduledFor: args.scheduledFor,
    runnerVersion: args.runnerVersion,
  });

  const orphans = await d.selectOrphans(MAX_ITEMS_PER_RUN);
  let attempted = 0;
  let succeeded = 0;
  let totalItems = 0;

  // Step 1: group by exact fingerprint (bucket = all items with same fp)
  const buckets = new Map<string, MatchedItem[]>();
  for (const o of orphans) {
    const fp = candidateFingerprint(o.facts);
    const group = buckets.get(fp) ?? [];
    group.push(o);
    buckets.set(fp, group);
  }

  // Step 2: cross-fingerprint merging via decideCluster.
  // Compare each bucket's representative with every other bucket.
  const representatives = new Map(
    [...buckets.entries()].map(([fp, members]) => [fp, members[0]!]),
  );
  const mergedInto = new Map<string, string>(); // fp → target fp

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
        // Merge the smaller bucket into the larger.
        const membersI = buckets.get(fpI)!;
        const membersJ = buckets.get(fpJ)!;
        if (membersI.length >= membersJ.length) {
          membersI.push(...membersJ);
          mergedInto.set(fpJ, fpI);
        } else {
          membersJ.push(...membersI);
          mergedInto.set(fpI, fpJ);
        }
        break; // fpI's bucket absorbed fpJ; fpJ is done.
      }
    }
  }

  // Step 3: persist clusters.
  for (const [fingerprint, members] of buckets) {
    if (mergedInto.has(fingerprint)) continue; // absorbed by another bucket
    attempted++;
    try {
      const clusterId = await d.upsertCluster(fingerprint);
      let created = 0;
      for (const m of members) {
        const newlyAdded = await d.upsertMember(
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

  const status: JobStatus =
    attempted === 0
      ? "SUCCEEDED_EMPTY"
      : succeeded === attempted
        ? totalItems > 0
          ? "SUCCEEDED_ITEMS"
          : "SUCCEEDED_EMPTY"
        : "PARTIAL";

  const failed = attempted - succeeded;

  // Persist the completion summary so the PipelineRun row matches what we return.
  await d.finishRun(runId, {
    status,
    itemCount: totalItems,
    attempted,
    succeeded,
    failed,
  });

  return {
    runId,
    status,
    attempted,
    succeeded,
    failed,
    itemCount: totalItems,
    exitCode: failed > 0 ? 1 : 0,
  };
}

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
