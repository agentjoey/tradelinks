/**
 * Contract tests for canonicalize-batch (Operations Task 2).
 *
 * Tests call createCanonicalizeBatch(deps) — the factory — not the
 * production two-parameter canonicalizeBatch.
 */

import { describe, expect, it } from "vitest";

import type { JobArgs } from "../src/jobs/types.js";
import type { CanonicalizeDeps, MatchedItem } from "../src/jobs/canonicalize-batch.js";
import { createCanonicalizeBatch } from "../src/jobs/canonicalize-batch.js";

function baseArgs(): JobArgs { return { scheduledFor: new Date("2026-07-29T08:00:00Z"), runnerVersion: "test", dryRun: false }; }

function fakeFacts(id: string, title: string, overrides: Partial<{
  market: string; platforms: import("@prisma/client").PlatformCode[];
  publishedAt: string; authorityEventId: string | null; effectiveAt: string | null;
}> = {}) {
  return {
    id, title,
    market: (overrides.market ?? "US") as "US",
    platforms: overrides.platforms ?? ([] as import("@prisma/client").PlatformCode[]),
    publishedAt: overrides.publishedAt ?? "2026-07-20T00:00:00.000Z",
    authorityEventId: overrides.authorityEventId ?? null,
    effectiveAt: overrides.effectiveAt ?? null,
    productCategories: ["ALL_PRODUCTS"],
  } satisfies import("../src/canonicalize/fingerprint.js").SourceItemFacts;
}

function fakeMatch(itemId: string, title: string, overrides?: Parameters<typeof fakeFacts>[2]): MatchedItem {
  return { itemId, sourceId: `source-${itemId}`, contract: undefined, facts: fakeFacts(itemId, title, overrides) };
}

function makeCanonicalizer(deps: Partial<CanonicalizeDeps> = {}) {
  const clusters = new Map<string, string>();
  const members = new Map<string, Set<string>>();
  let clusterSeq = 0, runSeq = 0;

  return createCanonicalizeBatch({
    async selectOrphans(limit) { return deps.selectOrphans?.(limit) ?? []; },
    async upsertCluster(fp) {
      if (deps.upsertCluster) return deps.upsertCluster(fp);
      let cid = clusters.get(fp);
      if (!cid) { cid = `cluster-${++clusterSeq}`; clusters.set(fp, cid); members.set(cid, new Set()); }
      return cid;
    },
    async upsertMember(clusterId, itemId, _role) {
      if (deps.upsertMember) return deps.upsertMember(clusterId, itemId, _role);
      const s = members.get(clusterId)!; if (s.has(itemId)) return false; s.add(itemId); return true;
    },
    async beginRun(_input) { return deps.beginRun?.(_input) ?? `run-${++runSeq}`; },
    async finishRun(_rid, _summary) { if (deps.finishRun) return deps.finishRun(_rid, _summary); },
    async existingItemCount(_runId) { return deps.existingItemCount?.(_runId) ?? 0; },
    async existingSummary(_runId) { return deps.existingSummary?.(_runId) ?? null; },
  });
}

// ============================ 200 cap ===========================

describe("canonicalizeBatch — 200-item cap", () => {
  it("honours the 200-item cap on selectOrphans", async () => {
    let receivedLimit = 0;
    const call = makeCanonicalizer({
      selectOrphans: async (limit) => { receivedLimit = limit; return []; },
    });
    await call(baseArgs());
    expect(receivedLimit).toBe(200);
  }, 10000);
});

// ============================ replay idempotency ================

describe("canonicalizeBatch — replay idempotency", () => {
  it("replay produces no duplicate members and preserves prior status", async () => {
    const items = [
      fakeMatch("item-a", "US imposes tariff on electronics"),
      fakeMatch("item-b", "Tariff on electronics imposed by US"),
      fakeMatch("item-c", "FDA recalls peanut butter"),
    ];
    let priorSummary: {
      status: string; itemCount: number; attempted: number;
      succeeded: number; failed: number;
    } | null = null;
    const call = makeCanonicalizer({
      selectOrphans: async () => items,
      finishRun: async (_rid, s) => {
        priorSummary = { ...s };
      },
      existingSummary: async () => priorSummary,
    });
    const first = await call(baseArgs());
    expect(first.status).toBe("SUCCEEDED_ITEMS");
    expect(first.itemCount).toBe(3);
    // Replay: all members already exist → no new work.
    const second = await call(baseArgs());
    // BLOCKER 5 / REWORK 2: prior status and counts survive replay.
    expect(second.status).toBe("SUCCEEDED_ITEMS");
    expect(second.itemCount).toBe(3);
    expect(second.attempted).toBe(first.attempted);
    expect(second.succeeded).toBe(first.succeeded);
    expect(second.failed).toBe(0);
    expect(second.exitCode).toBe(0);
  }, 10000);

  it("replay preserves the prior run status (REWORK 2)", async () => {
    const items = [fakeMatch("item-x", "Some item")];
    let prior: any = null;
    const call = makeCanonicalizer({
      selectOrphans: async () => items,
      finishRun: async (_rid, s) => { prior = { ...s }; },
      existingSummary: async () => prior,
    });
    const f = await call(baseArgs());
    expect(f.itemCount).toBe(1);
    expect(f.status).toBe("SUCCEEDED_ITEMS");
    // Replay: all already members. Prior status SUCCEEDED_ITEMS survives.
    const s = await call(baseArgs());
    expect(s.status).toBe("SUCCEEDED_ITEMS");
    expect(s.itemCount).toBe(1);
  }, 10000);
});

// ============================ per-cluster failure ===============

describe("canonicalizeBatch — per-cluster failure", () => {
  it("reports PARTIAL when one cluster fails", async () => {
    const items = [fakeMatch("good", "Normal"), fakeMatch("bad", "Fail")];
    let callCount = 0;
    const call = makeCanonicalizer({
      selectOrphans: async () => items,
      upsertCluster: async (fp) => {
        callCount++;
        if (callCount === 2) throw new Error("simulated failure");
        return `c-${fp.slice(0,8)}`;
      },
    });
    const r = await call(baseArgs());
    expect(r.failed).toBeGreaterThanOrEqual(1);
    expect(r.status).toBe("PARTIAL");
    expect(r.exitCode).toBe(1);
  }, 10000);
});

// ============================ BLOCKER A: finishRun summary =====

describe("canonicalizeBatch — finishRun summary", () => {
  it("calls finishRun with the same summary the result carries", async () => {
    const items = [fakeMatch("s1", "Amazon increases fees"), fakeMatch("s2", "Amazon seller fee increase")];
    let captured: any = null;
    const call = makeCanonicalizer({
      selectOrphans: async () => items,
      finishRun: async (_rid, s) => { captured = s; },
    });
    const r = await call(baseArgs());
    expect(captured).not.toBeNull();
    expect(captured.status).toBe(r.status);
    expect(captured.itemCount).toBe(r.itemCount);
    expect(captured.attempted).toBe(r.attempted);
    expect(captured.succeeded).toBe(r.succeeded);
    expect(captured.failed).toBe(r.failed);
  }, 10000);
});

// ============================ decideCluster branches ============

describe("canonicalizeBatch — decideCluster merging", () => {
  it("merges different-fp items with high trigram similarity", async () => {
    const items = [
      fakeMatch("1a", "Amazon increases seller fees for electronics"),
      fakeMatch("1b", "Amazon increases electronics seller fees"),
    ];
    const call = makeCanonicalizer({ selectOrphans: async () => items });
    const r = await call(baseArgs());
    expect(r.attempted).toBe(1);
    expect(r.itemCount).toBe(2);
  }, 10000);

  it("separates items with different official event ids", async () => {
    const items = [
      fakeMatch("o1", "Product recall notice", { authorityEventId: "RECALL-2026-001" }),
      fakeMatch("o2", "Product recall notice", { authorityEventId: "RECALL-2026-002" }),
    ];
    const call = makeCanonicalizer({ selectOrphans: async () => items });
    const r = await call(baseArgs());
    expect(r.attempted).toBe(2);
  }, 10000);

  it("separates items with different titles (low trigram similarity)", async () => {
    const items = [
      fakeMatch("l1", "Amazon increases seller fees"),
      fakeMatch("l2", "FDA approves new medical device classification"),
    ];
    const call = makeCanonicalizer({ selectOrphans: async () => items });
    const r = await call(baseArgs());
    expect(r.attempted).toBe(2);
  }, 10000);

  it("separates items with >7 days between published dates", async () => {
    const items = [
      fakeMatch("d1", "New safety standard released", { publishedAt: "2026-07-01T00:00:00.000Z" }),
      fakeMatch("d2", "New safety standard released", { publishedAt: "2026-07-10T00:00:00.000Z" }),
    ];
    const call = makeCanonicalizer({ selectOrphans: async () => items });
    const r = await call(baseArgs());
    expect(r.attempted).toBe(2);
  }, 10000);

  it("separates items with incompatible platforms", async () => {
    const items = [
      fakeMatch("p1", "Amazon platform policy update", { platforms: ["AMAZON" as import("@prisma/client").PlatformCode] }),
      fakeMatch("p2", "Shopify platform policy update", { platforms: ["SHOPIFY" as import("@prisma/client").PlatformCode] }),
    ];
    const call = makeCanonicalizer({ selectOrphans: async () => items });
    const r = await call(baseArgs());
    expect(r.attempted).toBe(2);
  }, 10000);
});

// ============================ no version publication ============

describe("canonicalizeBatch — no version publication", () => {
  it("creates EvidenceCluster and members but never touches CanonicalChange", async () => {
    const items = [fakeMatch("v", "New regulation published")];
    let clusterCreated = false, memberCreated = false;
    const call = makeCanonicalizer({
      selectOrphans: async () => items,
      upsertCluster: async (fp) => { clusterCreated = true; return `cv-${fp.slice(0,8)}`; },
      upsertMember: async () => { memberCreated = true; return true; },
    });
    const r = await call(baseArgs());
    expect(clusterCreated).toBe(true);
    expect(memberCreated).toBe(true);
    expect(r.attempted).toBe(1);
  }, 10000);
});
