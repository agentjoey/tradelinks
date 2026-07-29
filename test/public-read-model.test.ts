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
  // FK-safe order for the new models + existing canonical chain.
  // FKs are ON DELETE RESTRICT so we delete children first.
  // Phase-1 public models use runId as a prefix on their ids/slugs.
  await prisma.briefingEntry.deleteMany({ where: { briefingId: { startsWith: runId } } });
  await prisma.briefing.deleteMany({ where: { id: { startsWith: runId } } });
  await prisma.guideEvidence.deleteMany({ where: { guideId: { startsWith: runId } } });
  await prisma.guide.deleteMany({ where: { id: { startsWith: runId } } });
  await prisma.legacyRedirect.deleteMany({ where: { fromPath: { startsWith: runId } } });
  await prisma.evidenceRecord.deleteMany({ where: { changeVersion: { canonicalChange: { slug: { startsWith: runId } } } } });
  await prisma.canonicalChangeVersion.deleteMany({ where: { canonicalChange: { slug: { startsWith: runId } } } });
  await prisma.canonicalChange.deleteMany({ where: { slug: { startsWith: runId } } });
  await prisma.evidenceClusterMember.deleteMany({ where: { cluster: { fingerprint: { startsWith: runId } } } });
  await prisma.evidenceCluster.deleteMany({ where: { fingerprint: { startsWith: runId } } });
  await prisma.item.deleteMany({ where: { sourceId: { startsWith: runId } } });
  await prisma.source.deleteMany({ where: { id: { startsWith: runId } } });
  await prisma.alert.deleteMany({ where: { id: { startsWith: runId } } });
  await prisma.$disconnect();
}, 120000);

describe("verified listing excludes non-public versions", () => {
  let draftChange: { slug: string };
  let notCurrentSlug: string;
  let unreviewedSlug: string;
  let monitoredVersion: { id: string };
  let publicSlug: string;

  beforeAll(async () => {
    const versions = await seedNonPublicVersions();
    draftChange = { slug: versions[0]!.change.slug };
    notCurrentSlug = versions[1]!.change.slug;
    unreviewedSlug = versions[2]!.change.slug;
    monitoredVersion = { id: versions[3]!.version.id };

    // Also seed a public VERIFIED version to ensure the list is not empty
    const { change } = await seedPublicVersion({ readiness: "VERIFIED" as any });
    publicSlug = change.slug;
  }, 60000);

  it("returns only current reviewed VERIFIED versions", async () => {
    const page = await listPublicChanges({ pool: "verified", limit: 20 });
    const runItems = page.items.filter((item) => item.slug.startsWith(runId));
    // The seeded VERIFIED row must be present
    const publicInResult = runItems.some((item) => item.slug === publicSlug);
    expect(publicInResult).toBe(true);
    const allVerified = runItems.every((item) => item.readiness === "VERIFIED");
    expect(allVerified).toBe(true);
  }, 30000);

  it("does not include a draft version", async () => {
    const page = await listPublicChanges({ pool: "verified", limit: 20 });
    const slugs = page.items.map((item) => item.slug);
    expect(slugs).not.toContain(draftChange.slug);
  }, 30000);

  it("does not include a not-current version", async () => {
    const page = await listPublicChanges({ pool: "verified", limit: 20 });
    const slugs = page.items.map((item) => item.slug);
    expect(slugs).not.toContain(notCurrentSlug);
  }, 30000);

  it("does not include an unreviewed version", async () => {
    const page = await listPublicChanges({ pool: "verified", limit: 20 });
    const slugs = page.items.map((item) => item.slug);
    expect(slugs).not.toContain(unreviewedSlug);
  }, 30000);

  it("does not include monitored versions in the verified pool", async () => {
    const page = await listPublicChanges({ pool: "verified", limit: 20 });
    const versionIds = page.items.map((item) => item.versionId);
    expect(versionIds).not.toContain(monitoredVersion.id);
  }, 30000);
});

describe("monitored listing includes monitored and verified only", () => {
  let staleChangeSlug: string;
  let verifiedSlug: string;
  let monitoredSlug: string;

  beforeAll(async () => {
    // Seed VERIFIED
    const { change: vChange } = await seedPublicVersion({ readiness: "VERIFIED" as any });
    verifiedSlug = vChange.slug;
    // Seed MONITORED
    const { change: mChange } = await seedPublicVersion({ readiness: "MONITORED" as any });
    monitoredSlug = mChange.slug;
    // Seed STALE – must not appear
    const { change } = await seedPublicVersion({ readiness: "STALE" as any });
    staleChangeSlug = change.slug;
  }, 60000);

  it("allows VERIFIED in monitored pool", async () => {
    const page = await listPublicChanges({ pool: "monitored", limit: 20 });
    const runItems = page.items.filter((item) => item.slug.startsWith(runId));
    const verifiedPresent = runItems.some((item) => item.slug === verifiedSlug);
    const monitoredPresent = runItems.some((item) => item.slug === monitoredSlug);
    expect(verifiedPresent).toBe(true);
    expect(monitoredPresent).toBe(true);
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

describe("pagination, limits, and cursor round-trip", () => {
  it("rejects a limit of 0", async () => {
    await expect(listPublicChanges({ pool: "verified", limit: 0 })).rejects.toThrow();
  });

  it("rejects a negative limit", async () => {
    await expect(listPublicChanges({ pool: "verified", limit: -1 })).rejects.toThrow();
  });

  it("rejects an excessively large limit", async () => {
    await expect(listPublicChanges({ pool: "verified", limit: 1001 })).rejects.toThrow();
  });

  it("rejects a non-integer limit (e.g. 2.7)", async () => {
    await expect(listPublicChanges({ pool: "verified", limit: 2.7 })).rejects.toThrow();
  });

  it("rejects an undecodable cursor", async () => {
    await expect(
      listPublicChanges({ pool: "verified", limit: 5, cursor: "not-base64-json" }),
    ).rejects.toThrow(/invalid or undecodable cursor/i);
  });

  it("repeat query without cursor returns same order", async () => {
    await Promise.all([
      seedPublicVersion({ readiness: "VERIFIED" as any }),
      seedPublicVersion({ readiness: "VERIFIED" as any }),
    ]);

    const page1 = await listPublicChanges({ pool: "verified", limit: 5 });
    const page2 = await listPublicChanges({ pool: "verified", limit: 5 });
    expect(page1.items.map((i) => i.id)).toEqual(page2.items.map((i) => i.id));
  }, 30000);

  it("cursor page-through collects all rows with no duplicates or gaps", async () => {
    // Seed 3 run-scoped VERIFIED rows
    const s1 = await seedPublicVersion({ readiness: "VERIFIED" as any });
    const s2 = await seedPublicVersion({ readiness: "VERIFIED" as any });
    const s3 = await seedPublicVersion({ readiness: "VERIFIED" as any });
    const seeded = [s1.change.slug, s2.change.slug, s3.change.slug];

    // Page through with limit 2: page1 + page2 should cover all 3
    const page1 = await listPublicChanges({ pool: "verified", limit: 2 });
    const page1Run = page1.items.filter((i) => i.slug.startsWith(runId));
    expect(page1Run.length).toBeGreaterThan(0);
    expect(page1Run.length).toBeLessThanOrEqual(2);
    expect(page1.nextCursor).not.toBeNull();

    const page2 = await listPublicChanges({
      pool: "verified",
      limit: 2,
      cursor: page1.nextCursor!,
    });
    const page2Run = page2.items.filter((i) => i.slug.startsWith(runId));

    // Concatenated slugs across pages, filtered to run scoped
    const pagedSlugs = [...page1Run, ...page2Run].map((i) => i.slug);
    // All 3 seeded slugs should appear
    for (const s of seeded) {
      expect(pagedSlugs).toContain(s);
    }
    // No duplicates
    expect(new Set(pagedSlugs).size).toBe(pagedSlugs.length);

    // The full single-page listing at a larger limit should be a superset
    const fullPage = await listPublicChanges({ pool: "verified", limit: 100 });
    const fullRunSlugs = fullPage.items
      .filter((i) => i.slug.startsWith(runId))
      .map((i) => i.slug);
    for (const s of seeded) {
      expect(fullRunSlugs).toContain(s);
    }
  }, 60000);

  it("nextCursor is null when total items <= limit", async () => {
    // Use a very large limit to guarantee everything fits in one page
    const page = await listPublicChanges({ pool: "verified", limit: 100 });
    expect(page.nextCursor).toBeNull();
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

describe("schema constraints and reverse relations exercised on branch", () => {
  it("creates a Guide with two GuideEvidence rows and reads them back", async () => {
    const seedId = nextSeed();
    const source = await prisma.source.create({
      data: {
        id: `${seedId}-source`,
        name: "Guide Evidence Source",
        url: `https://example.com/${seedId}`,
        adapter: "rss",
        frequencyCron: "0 * * * *",
        language: "en",
        regions: ["north_america"],
        platforms: [],
      },
    });

    const guide = await prisma.guide.create({
      data: {
        id: `${seedId}-guide`,
        slug: `${seedId}-guide`,
        title: "Test Guide",
        summary: "Test summary",
        bodyMarkdown: "# Test",
        readiness: "VERIFIED",
        lastReviewedAt: new Date("2026-07-20T00:00:00Z"),
        reviewedBy: "reviewer",
        platforms: ["AMAZON"],
        productCategories: ["CONSUMER_ELECTRONICS"],
        riskAttributes: ["BATTERY"],
        evidence: {
          create: [
            {
              id: `${seedId}-ev1`,
              sourceId: source.id,
              url: `https://example.com/${seedId}/ev1`,
              authorityLevel: "GOVERNMENT_OFFICIAL",
              access: "PUBLIC",
              licenseNote: "Public domain",
              normalizedSummary: "Evidence summary 1",
              publishedAt: new Date("2026-07-10T00:00:00Z"),
              reviewedAt: new Date("2026-07-19T00:00:00Z"),
              position: 1,
            },
            {
              id: `${seedId}-ev2`,
              sourceId: source.id,
              url: `https://example.com/${seedId}/ev2`,
              authorityLevel: "INDUSTRY_OFFICIAL",
              access: "PUBLIC",
              licenseNote: "Public domain",
              normalizedSummary: "Evidence summary 2",
              publishedAt: new Date("2026-07-12T00:00:00Z"),
              reviewedAt: new Date("2026-07-19T00:00:00Z"),
              position: 2,
            },
          ],
        },
      },
      include: { evidence: true },
    });

    expect(guide.evidence.length).toBe(2);
    expect(guide.slug).toBe(`${seedId}-guide`);
  }, 30000);

  it("@@unique([guideId, url]) rejects duplicate evidence URL per guide", async () => {
    const seedId = nextSeed();
    const source = await prisma.source.create({
      data: {
        id: `${seedId}-source`,
        name: "Unique URL Source",
        url: `https://example.com/${seedId}`,
        adapter: "rss",
        frequencyCron: "0 * * * *",
        language: "en",
        regions: ["north_america"],
        platforms: [],
      },
    });
    await prisma.guide.create({
      data: {
        id: `${seedId}-guide`,
        slug: `${seedId}-guide`,
        title: "Test",
        summary: "Test",
        bodyMarkdown: "# Test",
        readiness: "VERIFIED",
        lastReviewedAt: new Date("2026-07-20T00:00:00Z"),
        reviewedBy: "reviewer",
        platforms: [],
        productCategories: [],
        riskAttributes: [],
        evidence: {
          create: {
            id: `${seedId}-ev`,
            sourceId: source.id,
            url: `https://example.com/${seedId}/dup`,
            authorityLevel: "GOVERNMENT_OFFICIAL",
            access: "PUBLIC",
            licenseNote: "PD",
            normalizedSummary: "Evidence",
            reviewedAt: new Date("2026-07-19T00:00:00Z"),
            position: 1,
          },
        },
      },
    });
    // Duplicate (guideId, url) should reject
    await expect(
      prisma.guideEvidence.create({
        data: {
          id: `${seedId}-ev2`,
          guideId: `${seedId}-guide`,
          sourceId: source.id,
          url: `https://example.com/${seedId}/dup`,
          authorityLevel: "GOVERNMENT_OFFICIAL",
          access: "PUBLIC",
          licenseNote: "PD",
          normalizedSummary: "Evidence",
          reviewedAt: new Date("2026-07-19T00:00:00Z"),
          position: 2,
        },
      }),
    ).rejects.toThrow();
  }, 30000);

  it("@@unique([guideId, position]) rejects duplicate position", async () => {
    const seedId = nextSeed();
    const source = await prisma.source.create({
      data: {
        id: `${seedId}-source`,
        name: "Unique Position Source",
        url: `https://example.com/${seedId}`,
        adapter: "rss",
        frequencyCron: "0 * * * *",
        language: "en",
        regions: ["north_america"],
        platforms: [],
      },
    });
    await prisma.guide.create({
      data: {
        id: `${seedId}-guide`,
        slug: `${seedId}-guide`,
        title: "Test",
        summary: "Test",
        bodyMarkdown: "# Test",
        readiness: "VERIFIED",
        lastReviewedAt: new Date("2026-07-20T00:00:00Z"),
        reviewedBy: "reviewer",
        platforms: [],
        productCategories: [],
        riskAttributes: [],
        evidence: {
          create: {
            id: `${seedId}-ev1`,
            sourceId: source.id,
            url: `https://example.com/${seedId}/a`,
            authorityLevel: "GOVERNMENT_OFFICIAL",
            access: "PUBLIC",
            licenseNote: "PD",
            normalizedSummary: "Evidence",
            reviewedAt: new Date("2026-07-19T00:00:00Z"),
            position: 1,
          },
        },
      },
    });
    await expect(
      prisma.guideEvidence.create({
        data: {
          id: `${seedId}-ev2`,
          guideId: `${seedId}-guide`,
          sourceId: source.id,
          url: `https://example.com/${seedId}/b`,
          authorityLevel: "GOVERNMENT_OFFICIAL",
          access: "PUBLIC",
          licenseNote: "PD",
          normalizedSummary: "Evidence",
          reviewedAt: new Date("2026-07-19T00:00:00Z"),
          position: 1,
        },
      }),
    ).rejects.toThrow();
  }, 30000);

  it("creates a Briefing + BriefingEntry, rejects duplicate period key", async () => {
    const seedId = nextSeed();
    const { change } = await seedCanonicalChange();
    const version = await prisma.canonicalChangeVersion.create({
      data: {
        canonicalChangeId: change.id,
        version: 1,
        isCurrent: true,
        title: "Briefing Entry Test",
        summary: "Test",
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
        generalImpact: "Test",
        editorialStatus: "PUBLISHED" as any,
        reviewedAt: new Date("2026-07-20T00:00:00Z"),
        reviewedBy: "reviewer",
      },
    });

    const briefing = await prisma.briefing.create({
      data: {
        id: `${seedId}-briefing`,
        kind: "WEEKLY",
        periodKey: `${seedId}-wk`,
        slug: `${seedId}-briefing`,
        title: "Weekly Briefing",
        summary: "Test briefing",
        bodyMarkdown: "# Briefing",
        readiness: "VERIFIED",
        fingerprint: "fp1",
        entries: {
          create: {
            changeVersionId: version.id,
            position: 1,
            commentary: "Test commentary",
          },
        },
      },
      include: { entries: true },
    });

    expect(briefing.entries.length).toBe(1);

    // @@unique([kind, periodKey]) must reject duplicate
    await expect(
      prisma.briefing.create({
        data: {
          id: `${seedId}-briefing2`,
          kind: "WEEKLY",
          periodKey: `${seedId}-wk`,
          slug: `${seedId}-briefing2`,
          title: "Dupe",
          summary: "Dupe",
          bodyMarkdown: "# Dupe",
          readiness: "VERIFIED",
          fingerprint: "fp2",
        },
      }),
    ).rejects.toThrow();
  }, 30000);

  it("@@unique([briefingId, position]) rejects duplicate entry position", async () => {
    const seedId = nextSeed();
    const { change } = await seedCanonicalChange();
    const version1 = await prisma.canonicalChangeVersion.create({
      data: {
        canonicalChangeId: change.id,
        version: 1,
        isCurrent: true,
        title: "Briefing Pos Test",
        summary: "Test",
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
        generalImpact: "Test",
        editorialStatus: "PUBLISHED" as any,
        reviewedAt: new Date("2026-07-20T00:00:00Z"),
        reviewedBy: "reviewer",
      },
    });
    const version2 = await prisma.canonicalChangeVersion.create({
      data: {
        canonicalChangeId: change.id,
        version: 2,
        isCurrent: false,
        title: "Briefing Pos Test v2",
        summary: "Test",
        signalType: "REGULATORY",
        regions: [],
        platforms: [],
        operatingStages: [],
        productCategories: [],
        riskAttributes: [],
        policyTopics: [],
        sourcePublishedAt: new Date("2026-07-16T00:00:00Z"),
        urgency: 80,
        readiness: "VERIFIED" as any,
        generalImpact: "Test",
        editorialStatus: "PUBLISHED" as any,
        reviewedAt: new Date("2026-07-21T00:00:00Z"),
        reviewedBy: "reviewer",
      },
    });

    await prisma.briefing.create({
      data: {
        id: `${seedId}-briefing`,
        kind: "MONTHLY",
        periodKey: `${seedId}-mo`,
        slug: `${seedId}-briefing`,
        title: "Monthly",
        summary: "Test",
        bodyMarkdown: "# Test",
        readiness: "VERIFIED",
        fingerprint: "fp1",
        entries: {
          create: {
            changeVersionId: version1.id,
            position: 1,
            commentary: "First",
          },
        },
      },
    });
    await expect(
      prisma.briefingEntry.create({
        data: {
          briefingId: `${seedId}-briefing`,
          changeVersionId: version2.id,
          position: 1,
          commentary: "Must reject duplicate position",
        },
      }),
    ).rejects.toThrow();
  }, 30000);

  it("reverse relation: Source.guideEvidence returns seeded rows", async () => {
    const seedId = nextSeed();
    const source = await prisma.source.create({
      data: {
        id: `${seedId}-source`,
        name: "Reverse Relation Source",
        url: `https://example.com/${seedId}`,
        adapter: "rss",
        frequencyCron: "0 * * * *",
        language: "en",
        regions: ["north_america"],
        platforms: [],
      },
    });
    await prisma.guide.create({
      data: {
        id: `${seedId}-guide`,
        slug: `${seedId}-guide`,
        title: "Reverse Test",
        summary: "Test",
        bodyMarkdown: "# Test",
        readiness: "VERIFIED",
        lastReviewedAt: new Date("2026-07-20T00:00:00Z"),
        reviewedBy: "reviewer",
        platforms: [],
        productCategories: [],
        riskAttributes: [],
        evidence: {
          create: {
            id: `${seedId}-ev`,
            sourceId: source.id,
            url: `https://example.com/${seedId}/ev`,
            authorityLevel: "GOVERNMENT_OFFICIAL",
            access: "PUBLIC",
            licenseNote: "PD",
            normalizedSummary: "Evidence",
            reviewedAt: new Date("2026-07-19T00:00:00Z"),
            position: 1,
          },
        },
      },
    });
    const fetched = await prisma.source.findUniqueOrThrow({
      where: { id: source.id },
      include: { guideEvidence: true },
    });
    expect(fetched.guideEvidence.length).toBe(1);
    expect(fetched.guideEvidence[0]!.guideId).toBe(`${seedId}-guide`);
  }, 30000);

  it("reverse relation: CanonicalChangeVersion.briefingEntries returns seeded rows", async () => {
    const seedId = nextSeed();
    const { change } = await seedCanonicalChange();
    const version = await prisma.canonicalChangeVersion.create({
      data: {
        canonicalChangeId: change.id,
        version: 1,
        isCurrent: true,
        title: "Reverse Briefing Test",
        summary: "Test",
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
        generalImpact: "Test",
        editorialStatus: "PUBLISHED" as any,
        reviewedAt: new Date("2026-07-20T00:00:00Z"),
        reviewedBy: "reviewer",
      },
    });
    await prisma.briefing.create({
      data: {
        id: `${seedId}-briefing`,
        kind: "DAILY",
        periodKey: `${seedId}-day`,
        slug: `${seedId}-briefing`,
        title: "Daily",
        summary: "Test",
        bodyMarkdown: "# Test",
        readiness: "VERIFIED",
        fingerprint: "fp1",
        entries: {
          create: {
            changeVersionId: version.id,
            position: 1,
            commentary: "Test",
          },
        },
      },
    });
    const fetched = await prisma.canonicalChangeVersion.findUniqueOrThrow({
      where: { id: version.id },
      include: { briefingEntries: true },
    });
    expect(fetched.briefingEntries.length).toBe(1);
    expect(fetched.briefingEntries[0]!.briefingId).toBe(`${seedId}-briefing`);
  }, 30000);

  it("LegacyRedirect: write+read and default status 308", async () => {
    const seedId = nextSeed();
    await prisma.legacyRedirect.create({
      data: {
        fromPath: `${seedId}-from`,
        toPath: "/changes/new-slug",
      },
    });
    const fetched = await prisma.legacyRedirect.findUniqueOrThrow({
      where: { fromPath: `${seedId}-from` },
    });
    expect(fetched.toPath).toBe("/changes/new-slug");
    expect(fetched.status).toBe(308);
  }, 30000);
});

describe("legacy Alert exclusion", () => {
  it("listPublicChanges never includes legacy Alerts", async () => {
    // Create a published Alert — it must never leak into the public listing
    await prisma.alert.create({
      data: {
        id: `${runId}-legacy-alert`,
        title: "Legacy Alert — must not appear in public listing",
        summary: "Test legacy alert",
        urgencyScore: 90,
        regions: ["north_america"],
        platforms: [],
        category: "regulatory",
        affectedSkus: [],
        sourceUrls: [],
        status: "published",
        publishedAt: new Date("2026-07-20T00:00:00Z"),
      },
    });

    const page = await listPublicChanges({ pool: "verified", limit: 100 });
    const ids = page.items.map((i) => i.id);
    expect(ids).not.toContain(`${runId}-legacy-alert`);

    // Also lookup by slug — must be null
    const result = await getPublicChangeBySlug(`${runId}-legacy-alert`);
    expect(result).toBeNull();
  }, 30000);
});

describe("correctionHistory filters DRAFT versions", () => {
  it("excludes correction reasons authored on DRAFT-only versions", async () => {
    const { change } = await seedPublicVersion({
      readiness: "VERIFIED" as any,
    });

    // Create a DRAFT version with a correctionReason — this should NOT appear
    await prisma.canonicalChangeVersion.create({
      data: {
        canonicalChangeId: change.id,
        version: 2,
        isCurrent: false,
        title: "Draft correction",
        summary: "Draft correction",
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
        generalImpact: "Draft",
        editorialStatus: "DRAFT" as any,
        correctionReason: "This DRAFT reason must not appear in public",
        reviewedAt: null,
      },
    });

    // Create a PUBLISHED correction — only this should appear
    await prisma.canonicalChangeVersion.create({
      data: {
        canonicalChangeId: change.id,
        version: 3,
        isCurrent: false,
        title: "Published correction",
        summary: "Published correction",
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
        generalImpact: "Corrected",
        editorialStatus: "PUBLISHED" as any,
        correctionReason: "This PUBLISHED correction must appear in public",
        reviewedAt: new Date("2026-07-22T00:00:00Z"),
        reviewedBy: "reviewer-2",
      },
    });

    const result = await getPublicChangeBySlug(change.slug);
    expect(result).not.toBeNull();
    expect(result!.correctionHistory.length).toBe(1);
    expect(result!.correctionHistory[0]!.correctionReason).toBe(
      "This PUBLISHED correction must appear in public",
    );
    expect(result!.correctionHistory[0]!.version).toBe(3);
  }, 30000);
});
