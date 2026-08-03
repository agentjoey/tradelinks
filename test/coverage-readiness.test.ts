import { PrismaClient, type ReadinessLevel } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PHASE1_CAPABILITY_KEYS,
  recomputeCapabilityReadiness,
  seedPhase1Coverage,
} from "../src/canonicalize/coverage.js";
import { refreshCapabilityReadiness } from "../src/monitoring/health.js";
import { INITIAL_PUBLIC_CATEGORIES, categorySlug } from "../src/domain/intelligence/taxonomy.js";

// Contract coverage for Phase 1 plan task 7: explicit coverage capabilities,
// reviewed readiness ceilings, and source-SLA-driven stale transitions.
// Automated checks may lower a capability to STALE but never promote it above
// its reviewed ceiling; seeding is idempotent and never rewrites readiness.
//
// Requires DATABASE_URL pointing at an isolated branch with migration
// 0011_phase1_intelligence_foundation applied.

const prisma = new PrismaClient();

const runId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let seedSeq = 0;

const NOW = new Date("2026-07-26T12:00:00Z");
const minutesAgo = (n: number) => new Date(NOW.getTime() - n * 60000);

const EXPECTED_KEYS = [
  "market:us",
  "platform:amazon-us",
  "platform:shopify-us",
  "category:consumer-electronics",
  "category:pet-supplies",
  "category:beauty-personal-care",
  "category:toys-childrens-products",
  "category:home-kitchen",
  "category:apparel-accessories",
  "demand:amazon-bsr",
] as const;

function nextSeed() {
  return `${runId}-${++seedSeq}`;
}

async function seedFixtureCapability(opts: {
  readiness: ReadinessLevel;
  sources: Array<{
    isActive?: boolean;
    slaMinutes?: number | null;
    lastOkAt?: Date | null;
  }>;
}) {
  const seedId = nextSeed();
  const capability = await prisma.coverageCapability.create({
    data: {
      key: `${seedId}-cap`,
      market: "US",
      readiness: opts.readiness,
      summary: "Coverage readiness test capability",
      knownGaps: ["test gap"],
      lastReviewedAt: NOW,
    },
  });
  for (const [i, s] of opts.sources.entries()) {
    const source = await prisma.source.create({
      data: {
        id: `${seedId}-source-${i}`,
        name: "Coverage Readiness Test Source",
        url: `https://example.com/${seedId}/${i}`,
        adapter: "rss",
        frequencyCron: "0 * * * *",
        language: "en",
        regions: ["north_america"],
        platforms: [],
        isActive: s.isActive ?? true,
        freshnessSlaMinutes: s.slaMinutes === undefined ? 1440 : s.slaMinutes,
        lastOkAt: s.lastOkAt ?? null,
      },
    });
    await prisma.capabilitySource.create({
      data: { capabilityId: capability.id, sourceId: source.id },
    });
  }
  return capability;
}

beforeAll(async () => {
  // Start from a clean slate so the reviewed-ceiling assertions are
  // repeatable: automated STALE transitions from earlier runs (or the
  // refresh suite below) must not leak into the seed assertions.
  await prisma.capabilitySource.deleteMany({
    where: { capability: { key: { in: [...PHASE1_CAPABILITY_KEYS] } } },
  });
  await prisma.coverageCapability.deleteMany({
    where: { key: { in: [...PHASE1_CAPABILITY_KEYS] } },
  });
  await seedPhase1Coverage();
}, 300000);

afterAll(async () => {
  // FK-safe order: links → capabilities → sources (relations are RESTRICT).
  await prisma.capabilitySource.deleteMany({ where: { capability: { key: { startsWith: runId } } } });
  await prisma.coverageCapability.deleteMany({ where: { key: { startsWith: runId } } });
  await prisma.source.deleteMany({ where: { id: { startsWith: runId } } });
  await prisma.$disconnect();
}, 60000);

describe("seedPhase1Coverage", () => {
  it("seeds exactly the ten Phase 1 capability keys", async () => {
    const caps = await prisma.coverageCapability.findMany({
      where: { key: { in: [...PHASE1_CAPABILITY_KEYS] } },
    });
    expect(caps.map((c) => c.key).sort()).toEqual([...EXPECTED_KEYS].sort());
    expect(PHASE1_CAPABILITY_KEYS).toHaveLength(10);
  }, 60000);

  it("seeds Amazon policy at MONITORED (hard-ceilinged below VERIFIED) and BSR at EXPERIMENTAL", async () => {
    // Owner decision 4 (2026-08-02) + Public Intelligence Task 8 Debt 1:
    // platform:amazon-us is MONITORED — a lawful public route exists but the
    // authoritative channel is login-walled, so it can never reach VERIFIED.
    const amazon = await prisma.coverageCapability.findUniqueOrThrow({
      where: { key: "platform:amazon-us" },
    });
    const bsr = await prisma.coverageCapability.findUniqueOrThrow({
      where: { key: "demand:amazon-bsr" },
    });
    expect(amazon.readiness).toBe("MONITORED");
    expect(bsr.readiness).toBe("EXPERIMENTAL");
  }, 60000);

  it("re-seeding lifts a never-reviewed, non-STALE stored grade to the seed ceiling", async () => {
    // Debt 1's re-seed path: the stored UNAVAILABLE grade predates owner
    // decision 4. A row that was never human-reviewed (lastReviewedAt is the
    // epoch sentinel) and is not carrying an automated STALE transition
    // tracks the seed's reviewed ceiling; human reviews and STALE rows never
    // move. Snapshot/restore so other suites see the contract state.
    const before = await prisma.coverageCapability.findUniqueOrThrow({
      where: { key: "platform:amazon-us" },
    });
    try {
      await prisma.coverageCapability.update({
        where: { key: "platform:amazon-us" },
        data: { readiness: "UNAVAILABLE", lastReviewedAt: new Date(0) },
      });
      await seedPhase1Coverage();
      const after = await prisma.coverageCapability.findUniqueOrThrow({
        where: { key: "platform:amazon-us" },
      });
      expect(after.id).toBe(before.id);
      expect(after.readiness).toBe("MONITORED");
    } finally {
      await prisma.coverageCapability.updateMany({
        where: { id: before.id },
        data: { readiness: before.readiness, lastReviewedAt: before.lastReviewedAt },
      });
    }
  }, 60000);

  it("never seeds the US market, Shopify, or any launch category above MONITORED", async () => {
    const atOrBelowMonitored: ReadinessLevel[] = ["UNAVAILABLE", "EXPERIMENTAL", "MONITORED"];
    const market = await prisma.coverageCapability.findUniqueOrThrow({ where: { key: "market:us" } });
    const shopify = await prisma.coverageCapability.findUniqueOrThrow({
      where: { key: "platform:shopify-us" },
    });
    expect(atOrBelowMonitored).toContain(market.readiness);
    expect(atOrBelowMonitored).toContain(shopify.readiness);

    const categoryKeys = INITIAL_PUBLIC_CATEGORIES.map((c) => `category:${categorySlug(c)}`);
    const categories = await prisma.coverageCapability.findMany({
      where: { key: { in: categoryKeys } },
    });
    expect(categories).toHaveLength(INITIAL_PUBLIC_CATEGORIES.length);
    for (const cap of categories) {
      expect(atOrBelowMonitored).toContain(cap.readiness);
    }
  }, 60000);

  it("gives every launch category linked sources and a non-empty known-gaps list", async () => {
    // HAZARD (cross-suite readiness race — see the Task 5 scope extension):
    // this invariant covers the Phase 1 contract keys ONLY. Querying
    // `startsWith: "category:"` sweeps in other suites' run-scoped fixtures
    // mid-creation/mid-deletion (a capability whose source links are not
    // written yet reads as sources.length === 0) and fails on their state,
    // not ours.
    const categoryKeys = INITIAL_PUBLIC_CATEGORIES.map((c) => `category:${categorySlug(c)}`);
    const categories = await prisma.coverageCapability.findMany({
      where: { key: { in: categoryKeys } },
      include: { sources: true },
    });
    expect(categories.length).toBe(INITIAL_PUBLIC_CATEGORIES.length);
    for (const cap of categories) {
      expect(cap.sources.length).toBeGreaterThan(0);
      expect(cap.knownGaps.length).toBeGreaterThan(0);
      for (const gap of cap.knownGaps) expect(gap.trim()).not.toBe("");
    }
  }, 60000);

  it("is idempotent and never rewrites a stored readiness", async () => {
    await seedPhase1Coverage();
    const first = await prisma.coverageCapability.findMany({
      where: { key: { in: [...PHASE1_CAPABILITY_KEYS] } },
      include: { sources: true },
    });
    // Simulate an automated STALE transition that a re-seed must not undo.
    await prisma.coverageCapability.update({
      where: { key: "category:pet-supplies" },
      data: { readiness: "STALE" },
    });

    await seedPhase1Coverage();
    const second = await prisma.coverageCapability.findMany({
      where: { key: { in: [...PHASE1_CAPABILITY_KEYS] } },
      include: { sources: true },
    });

    expect(second.map((c) => c.id).sort()).toEqual(first.map((c) => c.id).sort());
    for (const cap of second) {
      const before = first.find((c) => c.id === cap.id)!;
      expect(cap.sources.map((s) => s.sourceId).sort()).toEqual(
        before.sources.map((s) => s.sourceId).sort(),
      );
      expect(cap.readiness).toBe(cap.key === "category:pet-supplies" ? "STALE" : before.readiness);
    }
    // Restore the seeded ceiling so later suites see the contract state.
    await prisma.coverageCapability.update({
      where: { key: "category:pet-supplies" },
      data: { readiness: "MONITORED" },
    });
  }, 60000);
});

describe("recomputeCapabilityReadiness", () => {
  it("makes a capability STALE when a required source misses its SLA, and persists it", async () => {
    const cap = await seedFixtureCapability({
      readiness: "MONITORED",
      sources: [{ slaMinutes: 24 * 60, lastOkAt: minutesAgo(30 * 60) }],
    });
    await expect(recomputeCapabilityReadiness(cap.key, NOW)).resolves.toBe("STALE");
    const stored = await prisma.coverageCapability.findUniqueOrThrow({ where: { id: cap.id } });
    expect(stored.readiness).toBe("STALE");
  }, 60000);

  it("keeps the reviewed ceiling when every required source is inside its SLA", async () => {
    const cap = await seedFixtureCapability({
      readiness: "MONITORED",
      sources: [{ slaMinutes: 24 * 60, lastOkAt: minutesAgo(60) }],
    });
    await expect(recomputeCapabilityReadiness(cap.key, NOW)).resolves.toBe("MONITORED");
    const stored = await prisma.coverageCapability.findUniqueOrThrow({ where: { id: cap.id } });
    expect(stored.readiness).toBe("MONITORED");
  }, 60000);

  it("treats a required source that never succeeded as overdue", async () => {
    const cap = await seedFixtureCapability({
      readiness: "EXPERIMENTAL",
      sources: [{ slaMinutes: 480, lastOkAt: null }],
    });
    await expect(recomputeCapabilityReadiness(cap.key, NOW)).resolves.toBe("STALE");
  }, 60000);

  it("does not mark a source stale exactly at its SLA boundary", async () => {
    const cap = await seedFixtureCapability({
      readiness: "MONITORED",
      sources: [{ slaMinutes: 1440, lastOkAt: minutesAgo(1440) }],
    });
    await expect(recomputeCapabilityReadiness(cap.key, NOW)).resolves.toBe("MONITORED");
  }, 60000);

  it("ignores disabled sources and sources without an SLA", async () => {
    const cap = await seedFixtureCapability({
      readiness: "MONITORED",
      sources: [
        { isActive: false, slaMinutes: 480, lastOkAt: null },
        { slaMinutes: null, lastOkAt: null },
        { slaMinutes: 720, lastOkAt: minutesAgo(30) },
      ],
    });
    await expect(recomputeCapabilityReadiness(cap.key, NOW)).resolves.toBe("MONITORED");
  }, 60000);

  it("never promotes above the reviewed ceiling, even when sources are healthy", async () => {
    const experimental = await seedFixtureCapability({
      readiness: "EXPERIMENTAL",
      sources: [{ slaMinutes: 720, lastOkAt: minutesAgo(5) }],
    });
    await expect(recomputeCapabilityReadiness(experimental.key, NOW)).resolves.toBe("EXPERIMENTAL");

    const unavailable = await seedFixtureCapability({
      readiness: "UNAVAILABLE",
      sources: [{ slaMinutes: 720, lastOkAt: minutesAgo(5) }],
    });
    await expect(recomputeCapabilityReadiness(unavailable.key, NOW)).resolves.toBe("UNAVAILABLE");
  }, 60000);

  it("never auto-restores a STALE capability when sources recover", async () => {
    const cap = await seedFixtureCapability({
      readiness: "MONITORED",
      sources: [{ slaMinutes: 60, lastOkAt: minutesAgo(120) }],
    });
    await expect(recomputeCapabilityReadiness(cap.key, NOW)).resolves.toBe("STALE");

    // The source recovers, but only human re-review may lift the capability.
    await prisma.source.updateMany({
      where: { id: { startsWith: runId }, capabilities: { some: { capabilityId: cap.id } } },
      data: { lastOkAt: minutesAgo(1) },
    });
    await expect(recomputeCapabilityReadiness(cap.key, NOW)).resolves.toBe("STALE");
    const stored = await prisma.coverageCapability.findUniqueOrThrow({ where: { id: cap.id } });
    expect(stored.readiness).toBe("STALE");
  }, 60000);

  it("holds the platform:amazon-us hard ceiling below VERIFIED even with every source healthy", async () => {
    // Debt 1 (Public Intelligence Task 8): while the authoritative Seller
    // Central channel is login-walled, platform:amazon-us can never reach
    // VERIFIED — not by healthy sources (automation never promotes anyway)
    // and not by an erroneous stored raise (the recompute clamps it back).
    // Touches the shared capability row and its four contract sources, so
    // snapshot everything and restore in finally.
    const capBefore = await prisma.coverageCapability.findUniqueOrThrow({
      where: { key: "platform:amazon-us" },
      include: { sources: { include: { source: true } } },
    });
    const sourceBefore = capBefore.sources.map((link) => ({
      id: link.source.id,
      isActive: link.source.isActive,
      freshnessSlaMinutes: link.source.freshnessSlaMinutes,
      lastOkAt: link.source.lastOkAt,
    }));
    try {
      // Every required source healthy and inside its SLA.
      for (const link of capBefore.sources) {
        await prisma.source.update({
          where: { id: link.source.id },
          data: {
            isActive: true,
            freshnessSlaMinutes: link.source.freshnessSlaMinutes ?? 720,
            lastOkAt: minutesAgo(1),
          },
        });
      }

      // Healthy sources never promote the seeded ceiling.
      await prisma.coverageCapability.update({
        where: { id: capBefore.id },
        data: { readiness: "MONITORED" },
      });
      await expect(recomputeCapabilityReadiness("platform:amazon-us", NOW)).resolves.toBe("MONITORED");

      // Even a stored VERIFIED (an erroneous raise) is clamped back below it.
      await prisma.coverageCapability.update({
        where: { id: capBefore.id },
        data: { readiness: "VERIFIED" },
      });
      await expect(recomputeCapabilityReadiness("platform:amazon-us", NOW)).resolves.toBe("MONITORED");
      const stored = await prisma.coverageCapability.findUniqueOrThrow({
        where: { id: capBefore.id },
      });
      expect(stored.readiness).toBe("MONITORED");
    } finally {
      await prisma.coverageCapability.updateMany({
        where: { id: capBefore.id },
        data: { readiness: capBefore.readiness, lastReviewedAt: capBefore.lastReviewedAt },
      });
      for (const s of sourceBefore) {
        await prisma.source.updateMany({
          where: { id: s.id },
          data: {
            isActive: s.isActive,
            freshnessSlaMinutes: s.freshnessSlaMinutes,
            lastOkAt: s.lastOkAt,
          },
        });
      }
    }
  }, 60000);

  it("accepts the capability id as well as the key", async () => {
    const cap = await seedFixtureCapability({
      readiness: "MONITORED",
      sources: [{ slaMinutes: 60, lastOkAt: minutesAgo(10) }],
    });
    await expect(recomputeCapabilityReadiness(cap.id, NOW)).resolves.toBe("MONITORED");
  }, 60000);

  it("throws for an unknown capability", async () => {
    await expect(recomputeCapabilityReadiness(`${runId}-missing`, NOW)).rejects.toThrow(
      /unknown capability/i,
    );
  }, 60000);
});

describe("refreshCapabilityReadiness (health integration)", () => {
  it("drives stale transitions for every stored capability at the injected clock", async () => {
    // HAZARD (cross-suite readiness race — see the Task 5 scope extension):
    // refreshCapabilityReadiness recomputes EVERY row of the shared
    // CoverageCapability table, including fixtures belonging to suites
    // running in parallel. Snapshot every readiness first and restore it in
    // finally, so a concurrent suite never keeps observing our flips and a
    // failing assertion never leaves one behind. Standing rule (Tasks 6-9):
    // any test invoking a recompute/refresh of ALL rows of a shared table
    // must snapshot and restore that table.
    const snapshot = await prisma.coverageCapability.findMany({
      select: { id: true, readiness: true },
    });
    try {
      const stale = await seedFixtureCapability({
        readiness: "MONITORED",
        sources: [{ slaMinutes: 60, lastOkAt: minutesAgo(24 * 60) }],
      });
      const healthy = await seedFixtureCapability({
        readiness: "MONITORED",
        sources: [{ slaMinutes: 24 * 60, lastOkAt: minutesAgo(30) }],
      });

      // Cross-suite race guard (test code only, per the standing rule): a
      // parallel suite can delete its own fixture capability between
      // refreshCapabilityReadiness' list-all and its per-row recompute,
      // which then throws "unknown capability" on a row that no longer
      // exists. Retry the refresh rather than product-hardening a window
      // that cannot occur in production (curated capabilities are never
      // deleted).
      let results: Awaited<ReturnType<typeof refreshCapabilityReadiness>> | null = null;
      for (let attempt = 0; attempt < 4 && results === null; attempt++) {
        try {
          results = await refreshCapabilityReadiness(NOW);
        } catch (e) {
          if (!String(e).includes("unknown capability")) throw e;
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
        }
      }
      if (results === null) throw new Error("refreshCapabilityReadiness kept hitting deleted fixtures");
      const byId = new Map(results.map((r) => [r.id, r.readiness]));
      expect(byId.get(stale.id)).toBe("STALE");
      expect(byId.get(healthy.id)).toBe("MONITORED");
      // Recomputes every stored capability — one remote round trip each.
    } finally {
      // updateMany: rows a parallel suite deleted mid-run are skipped, not errors.
      for (const row of snapshot) {
        await prisma.coverageCapability.updateMany({
          where: { id: row.id },
          data: { readiness: row.readiness },
        });
      }
    }
  }, 300000);
});
