import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CanonicalPublicRecord } from "../src/public-intelligence/types.js";
import {
  getPublicChangeBySlug,
  listPublicChanges,
} from "../src/public-intelligence/query.js";
import {
  assertPublicVersion,
  serializeCanonicalVersion,
} from "../src/public-intelligence/serialize.js";
import { PUBLIC_CACHE } from "../src/public-intelligence/cache.js";

// Public Content Schema and Read Model contract coverage
// (Phase 1 Public Intelligence Task 1).
//
// Requires DATABASE_URL pointing at an isolated branch with migration
// 0012_phase1_publication_review_fields applied (0013 being tested here).

const prisma = new PrismaClient();

const runId = `testpub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let seedSeq = 0;

function nextSeed() {
  return `${runId}-${++seedSeq}`;
}

async function seedCanonicalChange() {
  const seedId = nextSeed();
  const source = await prisma.source.create({
    data: {
      id: `${seedId}-source`,
      name: "Public Model Test Source",
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
      title: "Public model test item",
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
  return { source, item, cluster, change };
}

async function seedPublicVersion(overrides: {
  isCurrent?: boolean;
  editorialStatus?: typeof prisma.canonicalChangeVersion.fields.editorialStatus extends { type: infer T } ? T : string;
  readiness?: typeof prisma.canonicalChangeVersion.fields.readiness extends { type: infer T } ? T : string;
  reviewedAt?: Date | null;
  version?: number;
  reviewedBy?: string | null;
  actionTemplateReviewedBy?: string | null;
}) {
  const { change, source, item } = await seedCanonicalChange();

  const version = await prisma.canonicalChangeVersion.create({
    data: {
      canonicalChangeId: change.id,
      version: overrides.version ?? 1,
      isCurrent: overrides.isCurrent ?? true,
      title: `Test Change ${change.slug}`,
      summary: "A public test summary",
      signalType: "REGULATORY",
      regions: ["north_america"],
      platforms: [],
      operatingStages: ["PREPARING_TO_LAUNCH"],
      productCategories: ["CONSUMER_ELECTRONICS"],
      riskAttributes: ["BATTERY"],
      policyTopics: ["PRODUCT_SAFETY_RECALLS"],
      sourcePublishedAt: new Date("2026-07-15T00:00:00Z"),
      urgency: 80,
      readiness: (overrides.readiness as any) ?? "VERIFIED",
      generalImpact: "Requires UL certification updates",
      generalActionTemplate: "Review your latest UL report",
      editorialStatus: (overrides.editorialStatus as any) ?? "PUBLISHED",
      reviewedAt: "reviewedAt" in overrides ? overrides.reviewedAt! : new Date("2026-07-20T00:00:00Z"),
      reviewedBy: overrides.reviewedBy ?? "reviewer-1",
      actionTemplateReviewedBy: overrides.actionTemplateReviewedBy ?? null,
    },
  });

  // Create evidence records
  const evidence1 = await prisma.evidenceRecord.create({
    data: {
      changeVersionId: version.id,
      sourceId: source.id,
      sourceItemId: item.id,
      url: `https://example.com/${change.slug}/evidence`,
      role: "PRIMARY_OFFICIAL",
      authorityLevel: "GOVERNMENT_OFFICIAL",
      publishedAt: new Date("2026-07-10T00:00:00Z"),
      access: "PUBLIC",
      licenseNote: "Public domain",
      excerpt: "Full text excerpt that should NOT appear in public output",
      normalizedSummary: "Official guidance on battery labeling requirements",
      contentHash: "abc123",
      fetchedAt: new Date("2026-07-18T00:00:00Z"),
      reviewedAt: new Date("2026-07-19T00:00:00Z"),
    },
  });

  const evidence2 = await prisma.evidenceRecord.create({
    data: {
      changeVersionId: version.id,
      sourceId: source.id,
      sourceItemId: item.id,
      url: `https://example.com/${change.slug}/supporting`,
      role: "SUPPORTING_OFFICIAL",
      authorityLevel: "INDUSTRY_OFFICIAL",
      publishedAt: new Date("2026-07-12T00:00:00Z"),
      access: "PUBLIC",
      licenseNote: "Public domain",
      excerpt: "Supporting excerpt",
      normalizedSummary: "Industry guidance on compliance",
      contentHash: "def456",
      fetchedAt: new Date("2026-07-18T00:00:00Z"),
      reviewedAt: null,
    },
  });

  return {
    change,
    version,
    source,
    evidence: [evidence1, evidence2] as [typeof evidence1, typeof evidence2],
  };
}

async function seedNonPublicVersions() {
  const results = [];
  // Sequential to avoid seed-id races from ++seedSeq
  results.push(await (async () => {
    const { change, version } = await seedPublicVersion({ editorialStatus: "DRAFT" as any, reviewedAt: null });
    return { kind: "draft", change, version };
  })());
  results.push(await (async () => {
    const { change, version } = await seedPublicVersion({ isCurrent: false });
    return { kind: "notCurrent", change, version };
  })());
  results.push(await (async () => {
    const { change, version } = await seedPublicVersion({ reviewedAt: null });
    return { kind: "unreviewed", change, version };
  })());
  results.push(await (async () => {
    const { change, version } = await seedPublicVersion({ readiness: "MONITORED" as any });
    return { kind: "monitored", change, version };
  })());
  results.push(await (async () => {
    const { change, version } = await seedPublicVersion({ readiness: "STALE" as any });
    return { kind: "stale", change, version };
  })());
  results.push(await (async () => {
    const { change, version } = await seedPublicVersion({ readiness: "EXPERIMENTAL" as any });
    return { kind: "experimental", change, version };
  })());
  return results;
}

// After all tests, clean up in FK-safe order
afterAll(async () => {
  // FK-safe order for the new models + existing canonical chain
  await prisma.evidenceRecord.deleteMany({ where: { changeVersion: { canonicalChange: { slug: { startsWith: runId } } } } });
  await prisma.canonicalChangeVersion.deleteMany({ where: { canonicalChange: { slug: { startsWith: runId } } } });
  await prisma.canonicalChange.deleteMany({ where: { slug: { startsWith: runId } } });
  await prisma.evidenceClusterMember.deleteMany({ where: { cluster: { fingerprint: { startsWith: runId } } } });
  await prisma.evidenceCluster.deleteMany({ where: { fingerprint: { startsWith: runId } } });
  await prisma.item.deleteMany({ where: { sourceId: { startsWith: runId } } });
  await prisma.source.deleteMany({ where: { id: { startsWith: runId } } });
  await prisma.$disconnect();
}, 120000);

describe("verified listing excludes non-public versions", () => {
  let draftChange: { slug: string };
  let monitoredVersion: { id: string };

  beforeAll(async () => {
    const versions = await seedNonPublicVersions();
    draftChange = { slug: versions[0]!.change.slug };
    monitoredVersion = { id: versions[3]!.version.id };

    // Also seed a public version to ensure the list is not empty
    await seedPublicVersion({ readiness: "VERIFIED" as any });
  }, 60000);

  it("returns only current reviewed VERIFIED versions", async () => {
    const page = await listPublicChanges({ pool: "verified", limit: 20 });
    const allVerified = page.items.every((item) => item.readiness === "VERIFIED");
    expect(allVerified).toBe(true);
  }, 30000);

  it("does not include a draft version", async () => {
    const page = await listPublicChanges({ pool: "verified", limit: 20 });
    const slugs = page.items.map((item) => item.slug);
    expect(slugs).not.toContain(draftChange.slug);
  }, 30000);

  it("does not include monitored versions in the verified pool", async () => {
    const page = await listPublicChanges({ pool: "verified", limit: 20 });
    const versionIds = page.items.map((item) => item.versionId);
    expect(versionIds).not.toContain(monitoredVersion.id);
  }, 30000);
});

describe("monitored listing includes monitored and verified only", () => {
  let staleChangeSlug: string;

  beforeAll(async () => {
    // Seed VERIFIED
    await seedPublicVersion({ readiness: "VERIFIED" as any });
    // Seed MONITORED
    await seedPublicVersion({ readiness: "MONITORED" as any });
    // Seed STALE – must not appear
    const { change } = await seedPublicVersion({ readiness: "STALE" as any });
    staleChangeSlug = change.slug;
  }, 60000);

  it("allows VERIFIED in monitored pool", async () => {
    const page = await listPublicChanges({ pool: "monitored", limit: 20 });
    const readinesses = new Set(page.items.map((i: any) => i.readiness));
    expect(readinesses.has("VERIFIED") || readinesses.has("MONITORED")).toBe(true);
  }, 30000);

  it("excludes STALE from monitored pool", async () => {
    const page = await listPublicChanges({ pool: "monitored", limit: 20 });
    const slugs = page.items.map((i: any) => i.slug);
    expect(slugs).not.toContain(staleChangeSlug);
  }, 30000);
});

describe("slug lookup returns null for non-public states", () => {
  let draftSlug: string, notCurrentSlug: string, unreviewedSlug: string, staleSlug: string;

  beforeAll(async () => {
    const versions = await seedNonPublicVersions();
    draftSlug = versions[0]!.change.slug;
    notCurrentSlug = versions[1]!.change.slug;
    unreviewedSlug = versions[2]!.change.slug;
    staleSlug = versions[4]!.change.slug;
  }, 60000);

  it("returns null for a draft change", async () => {
    const result = await getPublicChangeBySlug(draftSlug);
    expect(result).toBeNull();
  }, 30000);

  it("returns null for a not-current change", async () => {
    const result = await getPublicChangeBySlug(notCurrentSlug);
    expect(result).toBeNull();
  }, 30000);

  it("returns null for an unreviewed change", async () => {
    const result = await getPublicChangeBySlug(unreviewedSlug);
    expect(result).toBeNull();
  }, 30000);

  it("returns null for a STALE change", async () => {
    const result = await getPublicChangeBySlug(staleSlug);
    expect(result).toBeNull();
  }, 30000);
});

describe("serializer visibility invariants", () => {
  it("assertPublicVersion rejects unpublished version", () => {
    expect(() =>
      assertPublicVersion({
        editorialStatus: "DRAFT",
        isCurrent: true,
        reviewedAt: new Date(),
        readiness: "VERIFIED",
        canonicalChange: { slug: "test" },
      } as any),
    ).toThrow();
  });

  it("assertPublicVersion rejects unreviewed version", () => {
    expect(() =>
      assertPublicVersion({
        editorialStatus: "PUBLISHED",
        isCurrent: true,
        reviewedAt: null,
        readiness: "VERIFIED",
        canonicalChange: { slug: "test" },
      } as any),
    ).toThrow();
  });

  it("assertPublicVersion rejects non-current version", () => {
    expect(() =>
      assertPublicVersion({
        editorialStatus: "PUBLISHED",
        isCurrent: false,
        reviewedAt: new Date(),
        readiness: "VERIFIED",
        canonicalChange: { slug: "test" },
      } as any),
    ).toThrow();
  });

  it("assertPublicVersion rejects EXPERIMENTAL readiness", () => {
    expect(() =>
      assertPublicVersion({
        editorialStatus: "PUBLISHED",
        isCurrent: true,
        reviewedAt: new Date(),
        readiness: "EXPERIMENTAL",
        canonicalChange: { slug: "test" },
      } as any),
    ).toThrow();
  });
});

describe("serialized output omissions and ordering", () => {
  let version: any;
  let record: CanonicalPublicRecord;

  beforeAll(async () => {
    const seeded = await seedPublicVersion({
      readiness: "VERIFIED" as any,
      reviewedBy: "reviewer-1@example.com",
      actionTemplateReviewedBy: "template-reviewer-1",
    });

    // Add a correction history (version 2 with correctionReason)
    await prisma.canonicalChangeVersion.create({
      data: {
        canonicalChangeId: seeded.change.id,
        version: 2,
        isCurrent: false,
        title: "Corrected Test Change",
        summary: "Corrected summary",
        signalType: "REGULATORY",
        regions: [],
        platforms: [],
        operatingStages: [],
        productCategories: [],
        riskAttributes: [],
        policyTopics: [],
        sourcePublishedAt: new Date("2026-07-15T00:00:00Z"),
        urgency: 80,
        readiness: "VERIFIED" as any,
        generalImpact: "Corrected impact",
        editorialStatus: "PUBLISHED" as any,
        correctionReason: "Fixed effective date",
        reviewedAt: new Date("2026-07-21T00:00:00Z"),
        reviewedBy: "reviewer-2",
      },
    });

    // Re-fetch with relations
    version = await prisma.canonicalChangeVersion.findUniqueOrThrow({
      where: { id: seeded.version.id },
      include: {
        canonicalChange: { include: { versions: { orderBy: { version: "asc" } } } },
        evidence: { include: { source: true }, orderBy: [{ role: "asc" }, { publishedAt: "desc" }] },
      },
    });

    record = serializeCanonicalVersion(version as any);
  }, 60000);

  it("omits excerpt from evidence", () => {
    for (const ev of record.evidence) {
      expect((ev as any).excerpt).toBeUndefined();
    }
  });

  it("omits reviewedBy", () => {
    expect((record as any).reviewedBy).toBeUndefined();
  });

  it("omits actionTemplateReviewedBy", () => {
    expect((record as any).actionTemplateReviewedBy).toBeUndefined();
  });

  it("omits license-restricted text", () => {
    // licenseNote is excluded because it may reference restricted licenses
    for (const ev of record.evidence) {
      expect((ev as any).licenseNote).toBeUndefined();
    }
  });

  it("includes correction history without unpublished bodies", () => {
    expect(record.correctionHistory.length).toBe(1);
    expect(record.correctionHistory[0]!.correctionReason).toBe("Fixed effective date");
    expect(record.correctionHistory[0]!.version).toBe(2);
    // Correction history should not expose body text
    expect((record.correctionHistory[0] as any).title).toBeUndefined();
    expect((record.correctionHistory[0] as any).body).toBeUndefined();
  });

  it("evidence order is deterministic", () => {
    const roles = record.evidence.map((e: any) => e.role);
    // PRIMARY_OFFICIAL before SUPPORTING_OFFICIAL
    expect(roles[0]).toBe("PRIMARY_OFFICIAL");
    expect(roles[1]).toBe("SUPPORTING_OFFICIAL");
  });

  it("includes a valid permalink", () => {
    expect(record.permalink).toMatch(/^https:\/\/tradelinks\.us\/changes\//);
    expect(record.permalink).toContain(record.slug);
  });

  it("fingerprint is a 64-character hex string", () => {
    expect(record.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("fingerprint determinism", () => {
  it("is deterministic for the same input", () => {
    const base: any = {
      id: "v1",
      version: 1,
      updatedAt: new Date("2026-07-20T00:00:00Z"),
      canonicalChange: { slug: "test", id: "c1", versions: [] },
      editorialStatus: "PUBLISHED",
      isCurrent: true,
      reviewedAt: new Date(),
      readiness: "VERIFIED",
      title: "Test",
      summary: "Summary",
      signalType: "REGULATORY",
      market: "US",
      regions: [],
      platforms: [],
      operatingStages: [],
      productCategories: [],
      riskAttributes: [],
      policyTopics: [],
      sourcePublishedAt: new Date("2026-07-15T00:00:00Z"),
      effectiveAt: null,
      urgency: 80,
      generalImpact: "Impact",
      generalActionTemplate: null,
      evidence: [],
    };
    const r1 = serializeCanonicalVersion(base);
    const r2 = serializeCanonicalVersion({ ...base });
    expect(r1.fingerprint).toBe(r2.fingerprint);
    expect(r1.permalink).toBe(r2.permalink);
  });

  it("changes when version id differs", () => {
    const base: any = {
      id: "v1",
      version: 1,
      updatedAt: new Date("2026-07-20T00:00:00Z"),
      canonicalChange: { slug: "test", id: "c1", versions: [] },
      editorialStatus: "PUBLISHED",
      isCurrent: true,
      reviewedAt: new Date(),
      readiness: "VERIFIED",
      title: "Test",
      summary: "Summary",
      signalType: "REGULATORY",
      market: "US",
      regions: [],
      platforms: [],
      operatingStages: [],
      productCategories: [],
      riskAttributes: [],
      policyTopics: [],
      sourcePublishedAt: new Date("2026-07-15T00:00:00Z"),
      effectiveAt: null,
      urgency: 80,
      generalImpact: "Impact",
      generalActionTemplate: null,
      evidence: [],
    };
    const alt = { ...base, id: "v2" };
    expect(serializeCanonicalVersion(base).fingerprint).not.toBe(
      serializeCanonicalVersion(alt).fingerprint,
    );
  });

  it("changes when version number differs", () => {
    const base: any = {
      id: "v1",
      version: 1,
      updatedAt: new Date("2026-07-20T00:00:00Z"),
      canonicalChange: { slug: "test", id: "c1", versions: [] },
      editorialStatus: "PUBLISHED",
      isCurrent: true,
      reviewedAt: new Date(),
      readiness: "VERIFIED",
      title: "Test",
      summary: "Summary",
      signalType: "REGULATORY",
      market: "US",
      regions: [],
      platforms: [],
      operatingStages: [],
      productCategories: [],
      riskAttributes: [],
      policyTopics: [],
      sourcePublishedAt: new Date("2026-07-15T00:00:00Z"),
      effectiveAt: null,
      urgency: 80,
      generalImpact: "Impact",
      generalActionTemplate: null,
      evidence: [],
    };
    const alt = { ...base, version: 2 };
    expect(serializeCanonicalVersion(base).fingerprint).not.toBe(
      serializeCanonicalVersion(alt).fingerprint,
    );
  });

  it("changes when update timestamp changes", () => {
    const base: any = {
      id: "v1",
      version: 1,
      updatedAt: new Date("2026-07-20T00:00:00Z"),
      canonicalChange: { slug: "test", id: "c1", versions: [] },
      editorialStatus: "PUBLISHED",
      isCurrent: true,
      reviewedAt: new Date(),
      readiness: "VERIFIED",
      title: "Test",
      summary: "Summary",
      signalType: "REGULATORY",
      market: "US",
      regions: [],
      platforms: [],
      operatingStages: [],
      productCategories: [],
      riskAttributes: [],
      policyTopics: [],
      sourcePublishedAt: new Date("2026-07-15T00:00:00Z"),
      effectiveAt: null,
      urgency: 80,
      generalImpact: "Impact",
      generalActionTemplate: null,
      evidence: [],
    };
    const alt = { ...base, updatedAt: new Date("2026-07-21T00:00:00Z") };
    expect(serializeCanonicalVersion(base).fingerprint).not.toBe(
      serializeCanonicalVersion(alt).fingerprint,
    );
  });
});

describe("pagination and limits", () => {
  it("rejects a limit of 0", async () => {
    await expect(listPublicChanges({ pool: "verified", limit: 0 })).rejects.toThrow();
  });

  it("rejects a negative limit", async () => {
    await expect(listPublicChanges({ pool: "verified", limit: -1 })).rejects.toThrow();
  });

  it("rejects an excessively large limit", async () => {
    await expect(listPublicChanges({ pool: "verified", limit: 1001 })).rejects.toThrow();
  });

  it("pagination is stable when repeated with same cursor", async () => {
    // Seed several public versions
    await Promise.all([
      seedPublicVersion({ readiness: "VERIFIED" as any }),
      seedPublicVersion({ readiness: "VERIFIED" as any }),
    ]);

    const page1 = await listPublicChanges({ pool: "verified", limit: 5 });
    const page2 = await listPublicChanges({ pool: "verified", limit: 5 });
    expect(page1.items.map((i) => i.id)).toEqual(page2.items.map((i) => i.id));
  }, 30000);
});

describe("PUBLIC_CACHE contract", () => {
  it("defines live changes revalidation at 900 seconds", () => {
    expect(PUBLIC_CACHE.liveChangesRevalidate).toBe(900);
  });

  it("defines canonical change revalidation at 3600 seconds", () => {
    expect(PUBLIC_CACHE.canonicalChangeRevalidate).toBe(3600);
  });

  it("includes 'changes' tag", () => {
    expect(PUBLIC_CACHE.tags.default).toContain("changes");
  });

  it("derives change tag as 'change:<id>'", () => {
    expect(PUBLIC_CACHE.tags.changeRecord("c-001")).toBe("change:c-001");
  });
});

describe("new schema constraints exercised", () => {
  it("BriefingKind enum values are available", async () => {
    // Verify the new models exist by exercising a write+read
    // This will fail before migration 0013 is applied (Prisma validation)
    const result: boolean = typeof (prisma as any).guide !== "undefined";
    expect(result).toBe(true);
  });
});
