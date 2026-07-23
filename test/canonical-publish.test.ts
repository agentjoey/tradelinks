import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

// Schema-contract coverage for the Phase 1 intelligence foundation
// (plan task 2): the additive canonical models must exist and a canonical
// change must never have two current versions (partial unique index
// "CanonicalChangeVersion_one_current").
//
// Requires DATABASE_URL pointing at an isolated branch with migration
// 0011_phase1_intelligence_foundation applied.

const prisma = new PrismaClient();

const runId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let seedSeq = 0;

async function seedCanonicalChange() {
  const seedId = `${runId}-${++seedSeq}`;
  const source = await prisma.source.create({
    data: {
      id: `${seedId}-source`,
      name: "Contract Test Source",
      url: `https://example.com/${seedId}`,
      adapter: "rss",
      frequencyCron: "0 * * * *",
      language: "en",
      regions: ["north_america"],
      platforms: [],
    },
  });
  const item = await prisma.item.create({
    data: {
      sourceId: source.id,
      url: `https://example.com/${seedId}/item`,
      urlHash: `${seedId}-hash`,
      title: "Contract test item",
      publishedAt: new Date("2026-07-01T00:00:00Z"),
      regions: ["north_america"],
      platforms: [],
      lang: "en",
    },
  });
  const cluster = await prisma.evidenceCluster.create({
    data: {
      fingerprint: `${seedId}-fp`,
      members: {
        create: [{ itemId: item.id, role: "PRIMARY_OFFICIAL" }],
      },
    },
  });
  return prisma.canonicalChange.create({
    data: { slug: `${seedId}-change`, clusterId: cluster.id },
  });
}

function seedVersion(
  canonicalChangeId: string,
  input: { version: number; isCurrent: boolean },
) {
  return prisma.canonicalChangeVersion.create({
    data: {
      canonicalChangeId,
      version: input.version,
      isCurrent: input.isCurrent,
      title: `Version ${input.version}`,
      summary: "Contract test summary",
      signalType: "REGULATORY",
      regions: [],
      platforms: [],
      operatingStages: [],
      productCategories: [],
      riskAttributes: [],
      policyTopics: [],
      sourcePublishedAt: new Date("2026-07-01T00:00:00Z"),
      urgency: 1,
      readiness: "MONITORED",
      generalImpact: "Contract test impact",
    },
  });
}

afterAll(async () => {
  // Delete in FK-safe order (relations use ON DELETE RESTRICT): versions →
  // changes → cluster members → clusters → items → sources.
  await prisma.canonicalChangeVersion.deleteMany({
    where: { canonicalChange: { slug: { startsWith: runId } } },
  });
  await prisma.canonicalChange.deleteMany({ where: { slug: { startsWith: runId } } });
  await prisma.evidenceClusterMember.deleteMany({
    where: { cluster: { fingerprint: { startsWith: runId } } },
  });
  await prisma.evidenceCluster.deleteMany({ where: { fingerprint: { startsWith: runId } } });
  await prisma.item.deleteMany({ where: { urlHash: { startsWith: runId } } });
  await prisma.source.deleteMany({ where: { id: { startsWith: runId } } });
  await prisma.$disconnect();
}, 60000);

describe("canonical change schema contract", () => {
  it("rejects a second current version for one change", async () => {
    const change = await seedCanonicalChange();
    await seedVersion(change.id, { version: 1, isCurrent: true });
    await expect(seedVersion(change.id, { version: 2, isCurrent: true }))
      .rejects.toMatchObject({ code: "P2002" });
  }, 60000);

  it("allows multiple non-current versions for one change", async () => {
    const change = await seedCanonicalChange();
    await seedVersion(change.id, { version: 1, isCurrent: true });
    const older = await seedVersion(change.id, { version: 2, isCurrent: false });
    expect(older.isCurrent).toBe(false);
  }, 60000);
});
