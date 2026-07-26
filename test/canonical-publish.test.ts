import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import {
  assertPublishableVersion,
  PublicationError,
} from "../src/domain/intelligence/canonical-change.js";
import {
  correctCanonicalChange,
  publishCanonicalDraft,
  rejectCanonicalDraft,
  reviewCanonicalActionTemplate,
} from "../src/canonicalize/publish.js";

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
  // Delete in FK-safe order (relations use ON DELETE RESTRICT): evidence →
  // versions → changes → cluster members → clusters → items → sources.
  await prisma.evidenceRecord.deleteMany({
    where: { changeVersion: { canonicalChange: { slug: { startsWith: runId } } } },
  });
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
  await prisma.alert.deleteMany({ where: { title: { startsWith: runId } } });
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

// ---------- Task 6: immutable publication + structured evidence ----------

type EvidenceSeed = {
  role: "PRIMARY_OFFICIAL" | "SUPPORTING_OFFICIAL" | "SECONDARY_CONTEXT";
  authority:
    | "GOVERNMENT_OFFICIAL"
    | "PLATFORM_OFFICIAL"
    | "INDUSTRY_OFFICIAL"
    | "REPUTABLE_SECONDARY"
    | "COMMUNITY";
  reviewed?: boolean;
  retracted?: boolean;
};

async function seedDraft(input: {
  version?: number;
  readiness?: "UNAVAILABLE" | "EXPERIMENTAL" | "MONITORED" | "VERIFIED" | "STALE";
  editorialStatus?: "DRAFT" | "IN_REVIEW" | "PUBLISHED" | "REJECTED" | "RETRACTED";
  isCurrent?: boolean;
  actionTemplate?: string | null;
  actionTemplateReviewed?: boolean;
  classificationConfidence?: number | null;
  evidence?: EvidenceSeed[];
}) {
  const change = await seedCanonicalChange();
  const seedId = change.slug.replace(/-change$/, "");
  const version = await prisma.canonicalChangeVersion.create({
    data: {
      canonicalChangeId: change.id,
      version: input.version ?? 1,
      isCurrent: input.isCurrent ?? false,
      title: `Draft ${change.slug}`,
      summary: "Publication test summary",
      signalType: "REGULATORY",
      regions: ["north_america"],
      platforms: ["AMAZON"],
      operatingStages: ["ALREADY_SELLING"],
      productCategories: ["CONSUMER_ELECTRONICS"],
      riskAttributes: ["BATTERY"],
      policyTopics: ["IMPORT_CUSTOMS"],
      sourcePublishedAt: new Date("2026-07-01T00:00:00Z"),
      effectiveAt: new Date("2026-08-01T00:00:00Z"),
      urgency: 4,
      readiness: input.readiness ?? "MONITORED",
      generalImpact: "Publication test impact",
      generalActionTemplate: input.actionTemplate ?? null,
      actionTemplateReviewedAt: input.actionTemplateReviewed ? new Date("2026-07-02T00:00:00Z") : null,
      actionTemplateReviewedBy: input.actionTemplateReviewed ? "seed-reviewer" : null,
      editorialStatus: input.editorialStatus ?? "DRAFT",
      classificationConfidence: input.classificationConfidence ?? null,
    },
  });
  for (const [i, ev] of (input.evidence ?? []).entries()) {
    await prisma.evidenceRecord.create({
      data: {
        changeVersionId: version.id,
        sourceId: `${seedId}-source`,
        url: `https://example.com/${seedId}/evidence-${i}`,
        role: ev.role,
        authorityLevel: ev.authority,
        access: "PUBLIC",
        licenseNote: "public government notice",
        normalizedSummary: `Evidence summary ${i}`,
        contentHash: `${seedId}-evhash-${i}`,
        fetchedAt: new Date("2026-07-01T01:00:00Z"),
        reviewedAt: ev.reviewed ? new Date("2026-07-02T00:00:00Z") : null,
        retractedAt: ev.retracted ? new Date("2026-07-03T00:00:00Z") : null,
      },
    });
  }
  return { change, version };
}

async function loadVersion(id: string) {
  return prisma.canonicalChangeVersion.findUniqueOrThrow({
    where: { id },
    include: { evidence: true },
  });
}

describe("assertPublishableVersion (pure gates)", () => {
  const primaryEvidence = {
    role: "PRIMARY_OFFICIAL" as const,
    authorityLevel: "GOVERNMENT_OFFICIAL" as const,
    reviewedAt: new Date(),
    retractedAt: null,
  };
  const base = {
    readiness: "VERIFIED" as const,
    generalActionTemplate: null,
    actionTemplateReviewedAt: null,
    evidence: [primaryEvidence],
  };

  it("passes Verified with reviewed primary official evidence", () => {
    expect(() => assertPublishableVersion(base)).not.toThrow();
  });

  it("blocks Verified without reviewed primary official evidence", () => {
    expect(() =>
      assertPublishableVersion({ ...base, evidence: [] }),
    ).toThrow("VERIFIED_REQUIRES_REVIEWED_PRIMARY_OFFICIAL_EVIDENCE");
    expect(() =>
      assertPublishableVersion({
        ...base,
        evidence: [{ ...primaryEvidence, reviewedAt: null }],
      }),
    ).toThrow("VERIFIED_REQUIRES_REVIEWED_PRIMARY_OFFICIAL_EVIDENCE");
    expect(() =>
      assertPublishableVersion({
        ...base,
        evidence: [{ ...primaryEvidence, role: "SECONDARY_CONTEXT" }],
      }),
    ).toThrow("VERIFIED_REQUIRES_REVIEWED_PRIMARY_OFFICIAL_EVIDENCE");
    expect(() =>
      assertPublishableVersion({
        ...base,
        evidence: [{ ...primaryEvidence, authorityLevel: "COMMUNITY" }],
      }),
    ).toThrow("VERIFIED_REQUIRES_REVIEWED_PRIMARY_OFFICIAL_EVIDENCE");
    expect(() =>
      assertPublishableVersion({
        ...base,
        evidence: [{ ...primaryEvidence, retractedAt: new Date() }],
      }),
    ).toThrow("VERIFIED_REQUIRES_REVIEWED_PRIMARY_OFFICIAL_EVIDENCE");
  });

  it("blocks unreviewed action templates", () => {
    expect(() =>
      assertPublishableVersion({
        ...base,
        readiness: "MONITORED",
        evidence: [],
        generalActionTemplate: "File the updated CPC before 2026-08-01.",
      }),
    ).toThrow("ACTION_TEMPLATE_REQUIRES_REVIEW");
  });

  it("blocks readiness below Monitored", () => {
    expect(() =>
      assertPublishableVersion({ ...base, readiness: "EXPERIMENTAL", evidence: [] }),
    ).toThrow("CANONICAL_READINESS_NOT_PUBLISHABLE");
  });

  it("throws PublicationError with a stable code", () => {
    try {
      assertPublishableVersion({ ...base, evidence: [] });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(PublicationError);
      expect((e as PublicationError).code).toBe(
        "VERIFIED_REQUIRES_REVIEWED_PRIMARY_OFFICIAL_EVIDENCE",
      );
    }
  });
});

describe("publishCanonicalDraft", () => {
  it("blocks Verified publication without reviewed primary official evidence", async () => {
    const { version } = await seedDraft({
      readiness: "VERIFIED",
      evidence: [
        { role: "SECONDARY_CONTEXT", authority: "REPUTABLE_SECONDARY", reviewed: true },
      ],
    });
    await expect(publishCanonicalDraft(version.id, "reviewer-1")).rejects.toThrow(
      "VERIFIED_REQUIRES_REVIEWED_PRIMARY_OFFICIAL_EVIDENCE",
    );
    const after = await loadVersion(version.id);
    expect(after.editorialStatus).toBe("DRAFT");
    expect(after.isCurrent).toBe(false);
  }, 60000);

  it("blocks Verified publication when the action template is unreviewed", async () => {
    const { version } = await seedDraft({
      readiness: "VERIFIED",
      actionTemplate: "File the updated CPC before 2026-08-01.",
      evidence: [
        { role: "PRIMARY_OFFICIAL", authority: "GOVERNMENT_OFFICIAL", reviewed: true },
      ],
    });
    await expect(publishCanonicalDraft(version.id, "reviewer-1")).rejects.toThrow(
      "ACTION_TEMPLATE_REQUIRES_REVIEW",
    );
  }, 60000);

  it("blocks publication below Monitored readiness", async () => {
    const { version } = await seedDraft({ readiness: "EXPERIMENTAL" });
    await expect(publishCanonicalDraft(version.id, "reviewer-1")).rejects.toThrow(
      "CANONICAL_READINESS_NOT_PUBLISHABLE",
    );
  }, 60000);

  it("publishes exactly one current version and clears the previous current", async () => {
    const { change, version: current } = await seedDraft({
      version: 1,
      isCurrent: true,
      editorialStatus: "PUBLISHED",
      readiness: "MONITORED",
    });
    const draft = await prisma.canonicalChangeVersion.create({
      data: {
        canonicalChangeId: change.id,
        version: 2,
        title: "Revised draft",
        summary: "Revised summary",
        signalType: "REGULATORY",
        regions: ["north_america"],
        platforms: ["AMAZON"],
        operatingStages: ["ALREADY_SELLING"],
        productCategories: ["CONSUMER_ELECTRONICS"],
        riskAttributes: ["BATTERY"],
        policyTopics: ["IMPORT_CUSTOMS"],
        sourcePublishedAt: new Date("2026-07-05T00:00:00Z"),
        urgency: 4,
        readiness: "MONITORED",
        generalImpact: "Revised impact",
        classificationConfidence: 0.87,
      },
    });

    const published = await publishCanonicalDraft(draft.id, "reviewer-1");
    expect(published.isCurrent).toBe(true);
    expect(published.editorialStatus).toBe("PUBLISHED");
    expect(published.reviewedBy).toBe("reviewer-1");
    expect(published.reviewedAt).toBeInstanceOf(Date);
    // The persisted classifier confidence is preserved, never synthesized.
    expect(published.classificationConfidence).toBe(0.87);

    const previous = await loadVersion(current.id);
    expect(previous.isCurrent).toBe(false);
    expect(previous.editorialStatus).toBe("PUBLISHED"); // history untouched

    const currents = await prisma.canonicalChangeVersion.count({
      where: { canonicalChangeId: change.id, isCurrent: true },
    });
    expect(currents).toBe(1);
  }, 60000);

  it("preserves structured evidence fields on the published version", async () => {
    const { version } = await seedDraft({
      readiness: "VERIFIED",
      classificationConfidence: 0.91,
      evidence: [
        { role: "PRIMARY_OFFICIAL", authority: "GOVERNMENT_OFFICIAL", reviewed: true },
        { role: "SECONDARY_CONTEXT", authority: "REPUTABLE_SECONDARY" },
      ],
    });
    const published = await publishCanonicalDraft(version.id, "reviewer-1");
    const evidence = await prisma.evidenceRecord.findMany({
      where: { changeVersionId: published.id },
      orderBy: { url: "asc" },
    });
    expect(evidence).toHaveLength(2);
    const primary = evidence.find((e) => e.role === "PRIMARY_OFFICIAL")!;
    expect(primary.sourceId).toContain(runId);
    expect(primary.url).toContain("https://example.com/");
    expect(primary.authorityLevel).toBe("GOVERNMENT_OFFICIAL");
    expect(primary.access).toBe("PUBLIC");
    expect(primary.licenseNote).toBe("public government notice");
    expect(primary.normalizedSummary).toContain("Evidence summary");
    expect(primary.contentHash).toContain("-evhash-");
    expect(primary.fetchedAt).toBeInstanceOf(Date);
    expect(primary.reviewedAt).toBeInstanceOf(Date);
  }, 60000);

  it("rejects a legacy Alert id as CANONICAL_DRAFT_NOT_FOUND and leaves the Alert unchanged", async () => {
    const alert = await prisma.alert.create({
      data: {
        title: `${runId}-legacy-alert`,
        summary: "legacy",
        urgencyScore: 5,
        regions: ["north_america"],
        platforms: [],
        category: "regulatory",
        affectedSkus: [],
        sourceUrls: [],
        status: "pending_review",
      },
    });
    await expect(publishCanonicalDraft(alert.id, "reviewer-1")).rejects.toThrow(
      "CANONICAL_DRAFT_NOT_FOUND",
    );
    const after = await prisma.alert.findUniqueOrThrow({ where: { id: alert.id } });
    expect(after.status).toBe("pending_review");
    expect(after.publishedAt).toBeNull();
    expect(after.reviewedBy).toBeNull();
  }, 60000);
});

describe("rejectCanonicalDraft", () => {
  it("requires a non-blank rejection reason", async () => {
    const { version } = await seedDraft({});
    await expect(rejectCanonicalDraft(version.id, "reviewer-1", "   ")).rejects.toThrow(
      "REJECTION_REASON_REQUIRED",
    );
    const after = await loadVersion(version.id);
    expect(after.editorialStatus).toBe("DRAFT");
    expect(after.rejectionReason).toBeNull();
  }, 60000);

  it("persists the trimmed reason and never makes the version current", async () => {
    const { change, version } = await seedDraft({});
    const rejected = await rejectCanonicalDraft(
      version.id,
      "reviewer-1",
      "  Evidence is a reseller blog, not the official notice.  ",
    );
    expect(rejected.editorialStatus).toBe("REJECTED");
    expect(rejected.rejectionReason).toBe(
      "Evidence is a reseller blog, not the official notice.",
    );
    expect(rejected.reviewedBy).toBe("reviewer-1");
    expect(rejected.reviewedAt).toBeInstanceOf(Date);
    expect(rejected.isCurrent).toBe(false);
    const currents = await prisma.canonicalChangeVersion.count({
      where: { canonicalChangeId: change.id, isCurrent: true },
    });
    expect(currents).toBe(0);
  }, 60000);
});

describe("reviewCanonicalActionTemplate", () => {
  it("requires a non-blank template on the draft", async () => {
    const { version } = await seedDraft({ actionTemplate: "  " });
    await expect(
      reviewCanonicalActionTemplate(version.id, "reviewer-1"),
    ).rejects.toThrow("ACTION_TEMPLATE_REQUIRED");
  }, 60000);

  it("records the review without publishing the draft", async () => {
    const { version } = await seedDraft({
      readiness: "VERIFIED",
      actionTemplate: "File the updated CPC before 2026-08-01.",
    });
    const reviewed = await reviewCanonicalActionTemplate(version.id, "reviewer-1");
    expect(reviewed.actionTemplateReviewedBy).toBe("reviewer-1");
    expect(reviewed.actionTemplateReviewedAt).toBeInstanceOf(Date);
    expect(reviewed.editorialStatus).toBe("DRAFT");
    expect(reviewed.isCurrent).toBe(false);
  }, 60000);
});

describe("correctCanonicalChange", () => {
  it("requires a non-empty correction reason", async () => {
    const { version } = await seedDraft({
      isCurrent: true,
      editorialStatus: "PUBLISHED",
    });
    await expect(
      correctCanonicalChange({
        versionId: version.id,
        reviewerId: "reviewer-1",
        correctionReason: "  ",
      }),
    ).rejects.toThrow("CORRECTION_REASON_REQUIRED");
  }, 60000);

  it("creates version 2, preserves version 1, and carries evidence forward", async () => {
    const { change, version } = await seedDraft({
      isCurrent: true,
      editorialStatus: "PUBLISHED",
      readiness: "MONITORED",
      classificationConfidence: 0.77,
      evidence: [
        { role: "PRIMARY_OFFICIAL", authority: "GOVERNMENT_OFFICIAL", reviewed: true },
      ],
    });
    const corrected = await correctCanonicalChange({
      versionId: version.id,
      reviewerId: "reviewer-1",
      correctionReason: "Effective date moved to 2026-09-01.",
      changes: { effectiveAt: new Date("2026-09-01T00:00:00Z") },
    });
    expect(corrected.version).toBe(2);
    expect(corrected.isCurrent).toBe(true);
    expect(corrected.editorialStatus).toBe("PUBLISHED");
    expect(corrected.correctionReason).toBe("Effective date moved to 2026-09-01.");
    expect(corrected.reviewedBy).toBe("reviewer-1");
    expect(corrected.effectiveAt?.toISOString()).toBe("2026-09-01T00:00:00.000Z");
    // Real classifier confidence carries forward; nothing is synthesized.
    expect(corrected.classificationConfidence).toBe(0.77);

    const old = await loadVersion(version.id);
    expect(old.isCurrent).toBe(false);
    expect(old.editorialStatus).toBe("PUBLISHED"); // immutable history
    expect(old.effectiveAt?.toISOString()).toBe("2026-08-01T00:00:00.000Z");

    const correctedEvidence = await prisma.evidenceRecord.findMany({
      where: { changeVersionId: corrected.id },
    });
    expect(correctedEvidence).toHaveLength(1);
    expect(correctedEvidence[0]!.role).toBe("PRIMARY_OFFICIAL");
    expect(correctedEvidence[0]!.contentHash).toContain("-evhash-");

    const versions = await prisma.canonicalChangeVersion.findMany({
      where: { canonicalChangeId: change.id },
      orderBy: { version: "asc" },
    });
    expect(versions.map((v) => v.version)).toEqual([1, 2]);
    expect(versions.filter((v) => v.isCurrent)).toHaveLength(1);
  }, 60000);

  it("a correction that changes the action template records the correcting reviewer as its reviewer", async () => {
    const { version } = await seedDraft({
      isCurrent: true,
      editorialStatus: "PUBLISHED",
      readiness: "MONITORED",
      actionTemplate: "File the updated CPC before 2026-08-01.",
      actionTemplateReviewed: true,
    });
    const corrected = await correctCanonicalChange({
      versionId: version.id,
      reviewerId: "reviewer-1",
      correctionReason: "CPC deadline moved; recommended action updated.",
      changes: { generalActionTemplate: "File the updated CPC before 2026-09-01." },
    });
    // The corrected version is published with the new template, reviewed by
    // the correcting reviewer at correction time — the publishable invariant
    // (a published action recommendation always has a reviewed template)
    // holds on the new immutable version.
    expect(corrected.editorialStatus).toBe("PUBLISHED");
    expect(corrected.isCurrent).toBe(true);
    expect(corrected.generalActionTemplate).toBe(
      "File the updated CPC before 2026-09-01.",
    );
    expect(corrected.actionTemplateReviewedBy).toBe("reviewer-1");
    expect(corrected.actionTemplateReviewedAt).toBeInstanceOf(Date);

    // The old version keeps its own template and review metadata untouched.
    const old = await loadVersion(version.id);
    expect(old.generalActionTemplate).toBe("File the updated CPC before 2026-08-01.");
    expect(old.actionTemplateReviewedBy).toBe("seed-reviewer");
    expect(old.isCurrent).toBe(false);
  }, 60000);

  it("a correction that clears the action template drops the review metadata", async () => {
    const { version } = await seedDraft({
      isCurrent: true,
      editorialStatus: "PUBLISHED",
      readiness: "MONITORED",
      actionTemplate: "File the updated CPC before 2026-08-01.",
      actionTemplateReviewed: true,
    });
    const corrected = await correctCanonicalChange({
      versionId: version.id,
      reviewerId: "reviewer-1",
      correctionReason: "No seller action is needed after all.",
      changes: { generalActionTemplate: null },
    });
    expect(corrected.editorialStatus).toBe("PUBLISHED");
    expect(corrected.generalActionTemplate).toBeNull();
    expect(corrected.actionTemplateReviewedAt).toBeNull();
    expect(corrected.actionTemplateReviewedBy).toBeNull();
  }, 60000);

  it("a correction that keeps the action template carries its review forward", async () => {
    const { version } = await seedDraft({
      isCurrent: true,
      editorialStatus: "PUBLISHED",
      readiness: "MONITORED",
      actionTemplate: "File the updated CPC before 2026-08-01.",
      actionTemplateReviewed: true,
    });
    const corrected = await correctCanonicalChange({
      versionId: version.id,
      reviewerId: "reviewer-1",
      correctionReason: "Effective date moved to 2026-09-01.",
      changes: { effectiveAt: new Date("2026-09-01T00:00:00Z") },
    });
    expect(corrected.generalActionTemplate).toBe(
      "File the updated CPC before 2026-08-01.",
    );
    expect(corrected.actionTemplateReviewedBy).toBe("seed-reviewer");
    expect(corrected.actionTemplateReviewedAt?.toISOString()).toBe(
      "2026-07-02T00:00:00.000Z",
    );
  }, 60000);
});
