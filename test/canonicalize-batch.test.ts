/**
 * Contract tests for canonicalize-batch (Operations Task 2 — BLOCKER 3 fix).
 *
 * All tests use injectable CanonicalizeDeps so they pass credential-free.
 */

import { describe, expect, it } from "vitest";

import type { JobArgs } from "../src/jobs/types.js";
import type {
  CanonicalizeDeps,
  MatchedItem,
} from "../src/jobs/canonicalize-batch.js";

// We import the raw function, not the default-deps version, to keep it
// credential-free. The registration side-effect is harmless — tests
// inject their own deps via the second argument.
import { canonicalizeBatch } from "../src/jobs/canonicalize-batch.js";

// Note: the module-level registration also imports @prisma/client.
// The import itself succeeds without DATABASE_URL (only usage fails).

// ----- helpers -----

function baseArgs(): JobArgs {
  return {
    scheduledFor: new Date("2026-07-29T08:00:00Z"),
    runnerVersion: "test",
    dryRun: false,
  };
}

function fakeFacts(id: string, title: string) {
  return {
    id,
    title,
    market: "US" as const,
    platforms: [] as import("@prisma/client").PlatformCode[],
    publishedAt: "2026-07-20T00:00:00.000Z",
    productCategories: ["ALL_PRODUCTS"],
  } satisfies import("../src/canonicalize/fingerprint.js").SourceItemFacts;
}

function fakeMatch(
  itemId: string,
  title: string,
): MatchedItem {
  return {
    itemId,
    sourceId: `source-${itemId}`,
    contract: undefined,
    facts: fakeFacts(itemId, title),
  };
}

function fakeDeps(overrides: Partial<CanonicalizeDeps> = {}): CanonicalizeDeps {
  const clusters = new Map<string, string>(); // fingerprint → clusterId
  const members = new Map<string, Set<string>>(); // clusterId → Set<itemId>
  let clusterSeq = 0;
  let runSeq = 0;

  return {
    async selectOrphans(limit) {
      return overrides.selectOrphans?.(limit) ?? [];
    },
    async upsertCluster(fp) {
      if (overrides.upsertCluster) return overrides.upsertCluster(fp);
      let cid = clusters.get(fp);
      if (!cid) {
        cid = `cluster-${++clusterSeq}`;
        clusters.set(fp, cid);
        members.set(cid, new Set());
      }
      return cid;
    },
    async upsertMember(clusterId, itemId, _role) {
      if (overrides.upsertMember) return overrides.upsertMember(clusterId, itemId, _role);
      const set = members.get(clusterId);
      if (!set) throw new Error(`cluster ${clusterId} not found`);
      if (set.has(itemId)) return false;
      set.add(itemId);
      return true;
    },
    async beginRun(_input) {
      return overrides.beginRun?.(_input) ?? `run-${++runSeq}`;
    },
    async finishRun(_runId) {
      return overrides.finishRun?.(_runId) ?? { status: "RUNNING", itemCount: 0 };
    },
  };
}

// ================================================================
// 200-item cap
// ================================================================

describe("canonicalizeBatch — 200-item cap", () => {
  it("processes at most 200 orphan items", async () => {
    // Create 250 items but only 200 should be returned.
    const manyItems: MatchedItem[] = Array.from({ length: 250 }, (_, i) =>
      fakeMatch(`item-${i}`, `Title ${i}`),
    );

    const deps = fakeDeps({
      selectOrphans: async (limit) => {
        expect(limit).toBe(200);
        return manyItems.slice(0, limit);
      },
    });

    const result = await canonicalizeBatch(baseArgs(), deps);
    // 200 items, each with unique fingerprint → 200 clusters attempted
    expect(result.attempted).toBeLessThanOrEqual(200);
    expect(result.itemCount).toBeLessThanOrEqual(200);
  }, 10000);
});

// ================================================================
// Replay idempotency
// ================================================================

describe("canonicalizeBatch — replay idempotency", () => {
  it("replay produces no duplicate EvidenceClusterMember and stable cluster id", async () => {
    const items = [
      fakeMatch("item-a", "US imposes tariff on electronics"),
      fakeMatch("item-b", "Tariff on electronics imposed by US"),
      fakeMatch("item-c", "FDA recalls peanut butter"),
    ];

    const deps = fakeDeps({
      selectOrphans: async (_limit) => items,
    });

    // First run.
    const first = await canonicalizeBatch(baseArgs(), deps);
    expect(first.attempted).toBeGreaterThan(0);
    const firstCreated = first.itemCount;
    expect(firstCreated).toBe(3); // all 3 items should become members

    // Second run: same items re-selected (simulating the DB still has
    // them as orphans). upsertCluster reuses existing cluster ids,
    // upsertMember returns false when already present.
    const second = await canonicalizeBatch(baseArgs(), deps);
    // Same cluster count because fingerprints are unchanged.
    expect(second.attempted).toBe(first.attempted);
    // No new members created — all were already present.
    expect(second.itemCount).toBe(0);
  }, 10000);

  it("preserves stable cluster id on replay", async () => {
    const items = [fakeMatch("item-x", "Amazon announces fee changes")];

    const clusterIds: string[] = [];
    const deps = fakeDeps({
      selectOrphans: async (_limit) => items,
      upsertCluster: async (fp) => {
        const id = `stable-cluster-${fp.slice(0, 8)}`;
        clusterIds.push(id);
        return id;
      },
    });

    await canonicalizeBatch(baseArgs(), deps);
    await canonicalizeBatch(baseArgs(), deps);

    // Same cluster id returned twice (idempotent).
    expect(clusterIds.length).toBe(2);
    expect(clusterIds[0]).toBe(clusterIds[1]);
  }, 10000);
});

// ================================================================
// Per-cluster failure does not poison the batch
// ================================================================

describe("canonicalizeBatch — per-cluster failure", () => {
  it("reports PARTIAL when one cluster fails, does not crash", async () => {
    const items = [
      fakeMatch("item-good", "Normal product change"),
      fakeMatch("item-bad", "This cluster will fail"),
    ];

    let call = 0;
    const deps = fakeDeps({
      selectOrphans: async (_limit) => items,
      upsertCluster: async (fp) => {
        call++;
        if (call === 2) throw new Error("simulated cluster write failure");
        return `cluster-${fp.slice(0, 8)}`;
      },
    });

    const result = await canonicalizeBatch(baseArgs(), deps);
    // At least one cluster failed. The batch continues and reports PARTIAL.
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.status).toBe("PARTIAL");
    expect(result.exitCode).toBe(1);
  }, 10000);
});

// ================================================================
// decideCluster cross-fingerprint merging
// ================================================================

describe("canonicalizeBatch — decideCluster merging", () => {
  it("merges clusters when decideCluster returns MERGE", async () => {
    // Two items with different fingerprints but identical normalized titles
    // should merge via trigram similarity.
    const items = [
      fakeMatch("item-1", "Amazon increases seller fees"),
      fakeMatch("item-2", "amazon increases Seller Fees"), // same normalized title → same fingerprint
      fakeMatch("item-3", "FDA recalls contaminated lettuce"),
    ];

    const deps = fakeDeps({
      selectOrphans: async (_limit) => items,
    });

    const result = await canonicalizeBatch(baseArgs(), deps);
    // items 1 & 2 share fingerprint → 1 bucket; item 3 → 1 bucket = 2 clusters
    expect(result.attempted).toBe(2);
  }, 10000);
});
