import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import type { CanonicalPublicRecord } from "../src/public-intelligence/types.js";
import {
  getPublicChangeBySlug,
  listPublicChanges,
} from "../src/public-intelligence/query.js";
import { serializeCanonicalVersion } from "../src/public-intelligence/serialize.js";

// Channel consistency contract — every public projection (web, feed, API)
// shares the same fingerprint/permalink/slug/id for a given canonical version.
//
// Requires DATABASE_URL pointing at an isolated branch with migration
// 0012_phase1_publication_review_fields applied (0013 being tested here).

const prisma = new PrismaClient();

const runId = `testpubch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let seedSeq = 0;

function nextSeed() {
  return `${runId}-${++seedSeq}`;
}

async function seedPublicVersion() {
  const seedId = nextSeed();
  const source = await prisma.source.create({
    data: {
      id: `${seedId}-source`,
      name: "Channel Consistency Source",
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
      title: "Channel consistency test item",
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
  const change = await prisma.canonicalChange.create({
    data: { slug: `${seedId}-change`, clusterId: cluster.id },
  });

  const version = await prisma.canonicalChangeVersion.create({
    data: {
      canonicalChangeId: change.id,
      version: 1,
      isCurrent: true,
      title: "Channel Test",
      summary: "A channel consistency test",
      signalType: "REGULATORY",
      regions: ["north_america"],
      platforms: [],
      operatingStages: ["PREPARING_TO_LAUNCH"],
      productCategories: ["CONSUMER_ELECTRONICS"],
      riskAttributes: ["BATTERY"],
      policyTopics: ["IMPORT_CUSTOMS"],
      sourcePublishedAt: new Date("2026-07-15T00:00:00Z"),
      urgency: 85,
      readiness: "VERIFIED",
      generalImpact: "New import documentation required",
      generalActionTemplate: "Verify your customs broker has updated forms",
      editorialStatus: "PUBLISHED",
      reviewedAt: new Date("2026-07-20T00:00:00Z"),
      reviewedBy: "reviewer-1",
    },
  });

  // Fetch the full version with relations for serialization
  const fullVersion = await prisma.canonicalChangeVersion.findUniqueOrThrow({
    where: { id: version.id },
    include: {
      canonicalChange: { include: { versions: { orderBy: { version: "asc" } } } },
      evidence: { include: { source: true }, orderBy: [{ role: "asc" }, { publishedAt: "desc" }] },
    },
  });

  return { source, change, version: fullVersion };
}

// Channel projection fixtures — each simulates a different consumer of the
// CanonicalPublicRecord without requiring real route handlers.

function webProjection(record: CanonicalPublicRecord) {
  return {
    id: record.id,
    slug: record.slug,
    versionId: record.versionId,
    fingerprint: record.fingerprint,
    permalink: record.permalink,
    title: record.title,
    readiness: record.readiness,
  };
}

function feedProjection(record: CanonicalPublicRecord) {
  return {
    guid: record.versionId,
    link: record.permalink,
    fingerprint: record.fingerprint,
    title: record.title,
    readiness: record.readiness,
  };
}

function apiProjection(record: CanonicalPublicRecord) {
  return {
    versionId: record.versionId,
    fingerprint: record.fingerprint,
    permalink: record.permalink,
    readiness: record.readiness,
  };
}

function briefingProjection(record: CanonicalPublicRecord) {
  return {
    changeVersionId: record.versionId,
    fingerprint: record.fingerprint,
    permalink: record.permalink,
    title: record.title,
  };
}

function telegramProjection(record: CanonicalPublicRecord) {
  return {
    versionId: record.versionId,
    fingerprint: record.fingerprint,
    permalink: record.permalink,
    urgency: record.urgency,
  };
}

afterAll(async () => {
  await prisma.evidenceRecord.deleteMany({ where: { changeVersion: { canonicalChange: { slug: { startsWith: runId } } } } });
  await prisma.canonicalChangeVersion.deleteMany({ where: { canonicalChange: { slug: { startsWith: runId } } } });
  await prisma.canonicalChange.deleteMany({ where: { slug: { startsWith: runId } } });
  await prisma.evidenceClusterMember.deleteMany({ where: { cluster: { fingerprint: { startsWith: runId } } } });
  await prisma.evidenceCluster.deleteMany({ where: { fingerprint: { startsWith: runId } } });
  await prisma.item.deleteMany({ where: { sourceId: { startsWith: runId } } });
  await prisma.source.deleteMany({ where: { id: { startsWith: runId } } });
  await prisma.$disconnect();
}, 120000);

describe("every channel projection shares the same core fields", () => {
  let record: CanonicalPublicRecord;

  beforeAll(async () => {
    const { version } = await seedPublicVersion();
    record = serializeCanonicalVersion(version as any);
  }, 60000);

  it("web, feed, API, briefing, and Telegram use the same versionId", () => {
    const w = webProjection(record);
    const f = feedProjection(record);
    const a = apiProjection(record);
    const b = briefingProjection(record);
    const t = telegramProjection(record);

    expect(w.versionId).toBe(record.versionId);
    expect(f.guid).toBe(record.versionId);
    expect(a.versionId).toBe(record.versionId);
    expect(b.changeVersionId).toBe(record.versionId);
    expect(t.versionId).toBe(record.versionId);
  });

  it("web, feed, API, briefing, and Telegram use the same fingerprint", () => {
    const w = webProjection(record);
    const f = feedProjection(record);
    const a = apiProjection(record);
    const b = briefingProjection(record);
    const t = telegramProjection(record);

    expect(w.fingerprint).toBe(record.fingerprint);
    expect(f.fingerprint).toBe(w.fingerprint);
    expect(a.fingerprint).toBe(w.fingerprint);
    expect(b.fingerprint).toBe(w.fingerprint);
    expect(t.fingerprint).toBe(w.fingerprint);
  });

  it("all projections use the same canonical permalink", () => {
    const w = webProjection(record);
    const f = feedProjection(record);
    const a = apiProjection(record);
    const b = briefingProjection(record);
    const t = telegramProjection(record);

    expect(w.permalink).toBe(record.permalink);
    expect(f.link).toBe(record.permalink);
    expect(a.permalink).toBe(record.permalink);
    expect(b.permalink).toBe(record.permalink);
    expect(t.permalink).toBe(record.permalink);
  });
});

describe("listPublicChanges produces channel-consistent records", () => {
  it("every item in a listing has the same fingerprint computed by the serializer", async () => {
    await seedPublicVersion();

    // Task 10: each vitest worker has its own schema, so no other suite can
    // delete rows mid-query; the "Inconsistent query result" retry that used
    // to guard this read is retired.
    const page = await listPublicChanges({ pool: "verified", limit: 100 });
    // Filter to run-scoped slugs: the listing legitimately sees rows left by
    // earlier files that shared this worker's schema.
    const runItems = page.items.filter((item) => item.slug.startsWith(runId));
    expect(runItems.length).toBeGreaterThan(0);

    for (const item of runItems) {
      const viaSlug = await getPublicChangeBySlug(item.slug);
      expect(viaSlug).not.toBeNull();
      expect(viaSlug!.fingerprint).toBe(item.fingerprint);
      expect(viaSlug!.permalink).toBe(item.permalink);
    }
  }, 30000);

  it("fingerprint matches hash of version identity fields", async () => {
    const { version } = await seedPublicVersion();
    const record = serializeCanonicalVersion(version as any);

    const expectedInput = `${version.id}|${version.version}|${version.updatedAt.toISOString()}`;
    const expectedFingerprint = createHash("sha256").update(expectedInput).digest("hex");

    expect(record.fingerprint).toBe(expectedFingerprint);
  }, 30000);
});
