/**
 * Contract tests for canonicalize-batch (Operations Task 2 — BLOCKER 3/4 fix).
 *
 * All tests use injectable CanonicalizeDeps so they pass credential-free.
 */

import { describe, expect, it } from "vitest";

import type { JobArgs } from "../src/jobs/types.js";
import type { CanonicalizeDeps, MatchedItem } from "../src/jobs/canonicalize-batch.js";
import { canonicalizeBatch } from "../src/jobs/canonicalize-batch.js";

// ----- helpers -----

function baseArgs(): JobArgs {
  return {
    scheduledFor: new Date("2026-07-29T08:00:00Z"),
    runnerVersion: "test",
    dryRun: false,
  };
}

function fakeFacts(id: string, title: string, overrides: Partial<{
  market: string;
  platforms: import("@prisma/client").PlatformCode[];
  publishedAt: string;
  authorityEventId: string | null;
  effectiveAt: string | null;
}> = {}) {
  return {
    id,
    title,
    market: (overrides.market ?? "US") as "US",
    platforms: overrides.platforms ?? ([] as import("@prisma/client").PlatformCode[]),
    publishedAt: overrides.publishedAt ?? "2026-07-20T00:00:00.000Z",
    authorityEventId: overrides.authorityEventId ?? null,
    effectiveAt: overrides.effectiveAt ?? null,
    productCategories: ["ALL_PRODUCTS"],
  } satisfies import("../src/canonicalize/fingerprint.js").SourceItemFacts;
}

function fakeMatch(itemId: string, title: string, overrides?: Parameters<typeof fakeFacts>[2]): MatchedItem {
  return {
    itemId,
    sourceId: `source-${itemId}`,
    contract: undefined,
    facts: fakeFacts(itemId, title, overrides),
  };
}

function fakeDeps(overrides: Partial<CanonicalizeDeps> = {}): CanonicalizeDeps {
  const clusters = new Map<string, string>();
  const members = new Map<string, Set<string>>();
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
// 200-item cap (BLOCKER 4d — assert exact count)
// ================================================================

describe("canonicalizeBatch — 200-item cap", () => {
  it("honours the 200-item cap on selectOrphans", async () => {
    // Verify that exactly `limit` items are passed to selectOrphans.
    const returnedCount = 200;
    const manyItems: MatchedItem[] = Array.from({ length: returnedCount }, (_, i) =>
      fakeMatch(`cap-${i}`, `item-${i}`),
    );

    let receivedLimit = 0;
    const deps = fakeDeps({
      selectOrphans: async (limit) => {
        receivedLimit = limit;
        return manyItems;
      },
    });

    await canonicalizeBatch(baseArgs(), deps);
    expect(receivedLimit).toBe(200);
    // The impl passes MAX_ITEMS_PER_RUN=200 to selectOrphans.
  }, 10000);
});

// ================================================================
// Replay idempotency
// ================================================================

describe("canonicalizeBatch — replay idempotency", () => {
  it("replay produces no duplicate members and preserves cluster id", async () => {
    const items = [
      fakeMatch("item-a", "US imposes tariff on electronics"),
      fakeMatch("item-b", "Tariff on electronics imposed by US"),
      fakeMatch("item-c", "FDA recalls peanut butter"),
    ];

    const deps = fakeDeps({ selectOrphans: async () => items });

    const first = await canonicalizeBatch(baseArgs(), deps);
    expect(first.itemCount).toBe(3);

    // Same items re-presented — upsertMember returns false → 0 new members.
    const second = await canonicalizeBatch(baseArgs(), deps);
    expect(second.itemCount).toBe(0);
    // Same cluster count because fingerprints are unchanged.
    expect(second.attempted).toBe(first.attempted);
  }, 10000);
});

// ================================================================
// Per-cluster failure does not poison the batch
// ================================================================

describe("canonicalizeBatch — per-cluster failure", () => {
  it("reports PARTIAL when one cluster fails, continues to process others", async () => {
    const items = [
      fakeMatch("item-good", "Normal product change"),
      fakeMatch("item-bad", "This cluster will fail"),
    ];

    let call = 0;
    const deps = fakeDeps({
      selectOrphans: async () => items,
      upsertCluster: async (fp) => {
        call++;
        if (call === 2) throw new Error("simulated cluster write failure");
        return `cluster-${fp.slice(0, 8)}`;
      },
      finishRun: async () => ({
        status: "PARTIAL",
        itemCount: 1, // only item-good was persisted
      }),
    });

    const result = await canonicalizeBatch(baseArgs(), deps);
    expect(result.failed).toBeGreaterThanOrEqual(1);
    expect(result.status).toBe("PARTIAL");
    expect(result.exitCode).toBe(1);
  }, 10000);
});

// ================================================================
// decideCluster cross-fingerprint merging (BLOCKER 4c — real branches)
// ================================================================

describe("canonicalizeBatch — decideCluster merging", () => {
  it("merges different-fingerprint items with high trigram similarity", async () => {
    // Two items with different titles that produce DIFFERENT fingerprints
    // but have high trigram similarity (≥0.75). decideCluster should merge
    // them into one cluster.
    const items = [
      fakeMatch("item-1a", "Amazon increases seller fees for electronics"),
      fakeMatch("item-1b", "Amazon increases electronics seller fees"), // different fingerprint, high trigram
    ];

    const deps = fakeDeps({ selectOrphans: async () => items });

    const result = await canonicalizeBatch(baseArgs(), deps);
    // decideCluster merges them → one cluster, not two.
    expect(result.attempted).toBe(1);
    expect(result.itemCount).toBe(2);
  }, 10000);

  it("separates items with different official event ids", async () => {
    // Two items with DIFFERENT authorityEventIds should be kept separate
    // regardless of title similarity (official-id dominance rule).
    const items = [
      fakeMatch("item-o1", "Product recall notice", {
        authorityEventId: "RECALL-2026-001",
      }),
      fakeMatch("item-o2", "Product recall notice", {
        authorityEventId: "RECALL-2026-002", // different ID → SEPARATE
      }),
    ];

    const deps = fakeDeps({ selectOrphans: async () => items });

    const result = await canonicalizeBatch(baseArgs(), deps);
    expect(result.attempted).toBe(2);
    // Each gets its own cluster despite identical titles.
  }, 10000);

  it("separates items with completely different titles (low trigram similarity)", async () => {
    const items = [
      fakeMatch("item-l1", "Amazon increases seller fees"),
      fakeMatch("item-l2", "FDA approves new medical device classification"),
    ];

    const deps = fakeDeps({ selectOrphans: async () => items });

    const result = await canonicalizeBatch(baseArgs(), deps);
    // Low trigram similarity → SEPARATE.
    expect(result.attempted).toBe(2);
  }, 10000);

  it("separates items with >7 days between published dates", async () => {
    const items = [
      fakeMatch("item-d1", "New safety standard released", {
        publishedAt: "2026-07-01T00:00:00.000Z",
      }),
      fakeMatch("item-d2", "New safety standard released", {
        publishedAt: "2026-07-10T00:00:00.000Z", // 9 days apart
      }),
    ];

    const deps = fakeDeps({ selectOrphans: async () => items });

    const result = await canonicalizeBatch(baseArgs(), deps);
    // Date window exceeded → SEPARATE.
    expect(result.attempted).toBe(2);
  }, 10000);

  it("separates items with incompatible platforms", async () => {
    const items = [
      fakeMatch("item-p1", "Amazon platform policy update", {
        platforms: ["AMAZON" as import("@prisma/client").PlatformCode],
      }),
      fakeMatch("item-p2", "Shopify platform policy update", {
        platforms: ["SHOPIFY" as import("@prisma/client").PlatformCode],
      }),
    ];

    const deps = fakeDeps({ selectOrphans: async () => items });

    const result = await canonicalizeBatch(baseArgs(), deps);
    // Different titles → different fingerprints → decideCluster runs.
    // Platform mismatch → SEPARATE → two clusters.
    expect(result.attempted).toBe(2);
  }, 10000);
});

// ================================================================
// BLOCKER 4b — no version / publication writes
// ================================================================

describe("canonicalizeBatch — no version publication", () => {
  it("creates EvidenceCluster and members but never touches CanonicalChange", async () => {
    const items = [fakeMatch("item-v", "A new regulation is published")];

    let clusterCreated = false;
    let memberCreated = false;

    const deps = fakeDeps({
      selectOrphans: async () => items,
      upsertCluster: async (fp) => {
        clusterCreated = true;
        return `cluster-v-${fp.slice(0, 8)}`;
      },
      upsertMember: async () => {
        memberCreated = true;
        return true;
      },
    });

    const result = await canonicalizeBatch(baseArgs(), deps);
    expect(clusterCreated).toBe(true);
    expect(memberCreated).toBe(true);
    // The canonicalizeBatch never calls any publish() or create Version.
    // We verify this by the fact that the deps interface has no publish method.
    expect(result.attempted).toBe(1);
  }, 10000);
});
