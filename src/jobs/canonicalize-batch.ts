/**
 * Phase 1 canonicalization batch — finite path (Operations Task 2).
 *
 * canonicalizeBatch(args) selects at most 200 items lacking an
 * EvidenceClusterMember, fingerprints each, clusters by fingerprint, and
 * creates EvidenceCluster / EvidenceClusterMember records idempotently.
 * Does NOT publish versions — that is Task 3 behaviour.
 */

import type { EvidenceRole } from "@prisma/client";

import { prisma } from "../db/client.js";
import { candidateFingerprint, type SourceItemFacts } from "../canonicalize/fingerprint.js";
import { beginRun, finishRun } from "../collection/run.js";
import type { SourceContract } from "../domain/intelligence/source-contract.js";
import { PHASE1_SOURCES_BY_ID } from "../config/phase1-sources.js";
import type { JobArgs, JobResult, JobStatus } from "./types.js";

import { registerJob } from "./registry.js";

const MAX_ITEMS_PER_RUN = 200;

/** Minimum facts we can derive from an Item + its SourceContract. */
interface MatchedItem {
  itemId: string;
  sourceId: string;
  contract: SourceContract | undefined;
  facts: SourceItemFacts;
}

/**
 * Derive SourceItemFacts from a raw Item DB row and its Phase 1 contract.
 * Market comes from the contract; platform / categories from the DB source.
 */
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

async function findOrphanItems(limit: number): Promise<MatchedItem[]> {
  const items = await prisma.item.findMany({
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

export async function canonicalizeBatch(args: JobArgs): Promise<JobResult> {
  const scopeKey = "canonicalize";
  const run = await beginRun({
    jobType: "CANONICALIZE",
    scopeKey,
    scheduledFor: args.scheduledFor,
    runnerVersion: args.runnerVersion,
  });

  const orphans = await findOrphanItems(MAX_ITEMS_PER_RUN);
  let attempted = 0;
  let succeeded = 0;
  let totalItems = 0;

  // Group by fingerprint
  const byFingerprint = new Map<string, MatchedItem[]>();
  for (const o of orphans) {
    const fp = candidateFingerprint(o.facts);
    const group = byFingerprint.get(fp) ?? [];
    group.push(o);
    byFingerprint.set(fp, group);
  }

  for (const [fingerprint, members] of byFingerprint) {
    attempted++;
    try {
      await prisma.$transaction(async (tx) => {
        // Find or create the EvidenceCluster
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

        // Create members for items that don't already have one
        let created = 0;
        for (const m of members) {
          const existing = await tx.evidenceClusterMember.findUnique({
            where: {
              clusterId_itemId: { clusterId: cluster.id, itemId: m.itemId },
            },
          });
          if (existing) continue;

          await tx.evidenceClusterMember.create({
            data: {
              clusterId: cluster.id,
              itemId: m.itemId,
              role: deriveRole(m.contract),
            },
          });
          created++;
        }
        totalItems += created;
      }, { maxWait: 30000, timeout: 60000 });
      succeeded++;
    } catch {
      // Individual cluster failures don't poison the batch.
    }
  }

  await finishRun(run.id);

  const status: JobStatus =
    attempted === 0
      ? "SUCCEEDED_EMPTY"
      : succeeded === attempted
        ? totalItems > 0 ? "SUCCEEDED_ITEMS" : "SUCCEEDED_EMPTY"
        : "PARTIAL";

  return {
    runId: run.id,
    status,
    attempted,
    succeeded,
    failed: attempted - succeeded,
    itemCount: totalItems,
    exitCode: succeeded === attempted ? 0 : 1,
  };
}

// ---- job registration ----

registerJob({
  name: "canonicalize",
  maxAttempts: 1,
  run: canonicalizeBatch,
  dryRun: async (_args: JobArgs): Promise<JobResult> => {
    const count = await prisma.item.count({
      where: { evidenceClusterMembers: { none: {} } },
    });
    return {
      runId: crypto.randomUUID(),
      status: "SUCCEEDED_EMPTY",
      attempted: Math.min(count, MAX_ITEMS_PER_RUN),
      succeeded: 0,
      failed: 0,
      itemCount: 0,
      exitCode: 0,
    };
  },
});
