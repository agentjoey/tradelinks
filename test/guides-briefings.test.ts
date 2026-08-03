import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Public Intelligence Task 5 — guides (drafted, unpublishable by
// construction) and briefings (PipelineRun-pinned, threshold-gated daily).
//
// Requires DATABASE_URL pointing at an isolated non-production branch.
// All seeded rows carry the run-scoped runId prefix and are deleted in
// FK-safe order in afterAll, exactly as the existing DB suites do.

import {
  GUIDE_WORD_MAX,
  GUIDE_WORD_MIN,
  OFFICIAL_AUTHORITY_LEVELS,
  REQUIRED_GUIDE_SECTIONS,
  assertPublishable,
  getPublishedGuideBySlug,
  listPublishedGuides,
  publishGateIssues,
  publishGuide,
  validateGuideCorpus,
} from "../src/public-intelligence/guides.js";
import {
  NO_QUALIFIED_CONTENT,
  briefingPath,
  briefingScopeKey,
  generateBriefing,
  getPublishedBriefing,
  listPublishedBriefings,
  parseDailyPeriod,
  parseMonthlyPeriod,
  parseWeeklyPeriod,
  publishBriefing,
} from "../src/public-intelligence/briefings.js";
import { INITIAL_PUBLIC_CATEGORIES } from "../src/domain/intelligence/taxonomy.js";

const prisma = new PrismaClient();

const runId = `testgb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let seedSeq = 0;
function nextSeed() {
  return `${runId}-${++seedSeq}`;
}

// ---------- seeding helpers (run-scoped, FK-safe cleanup) ----------

async function seedChangeVersion(opts: {
  readiness?: "MONITORED" | "VERIFIED" | "STALE" | "EXPERIMENTAL";
  title?: string;
}) {
  const seedId = nextSeed();
  const source = await prisma.source.create({
    data: {
      id: `${seedId}-source`,
      name: "Briefing Test Source",
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
      title: "Briefing test item",
      publishedAt: new Date("2026-07-01T00:00:00Z"),
      regions: ["north_america"],
      platforms: [],
      lang: "en",
    },
  });
  const cluster = await prisma.evidenceCluster.create({
    data: {
      fingerprint: `${seedId}-fp`,
      members: { create: [{ itemId: item.id, role: "PRIMARY_OFFICIAL" }] },
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
      title: opts.title ?? `Briefing Test Change ${seedId}`,
      summary: `Briefing test summary ${seedId}`,
      signalType: "REGULATORY",
      regions: ["north_america"],
      platforms: [],
      operatingStages: ["PREPARING_TO_LAUNCH"],
      productCategories: [],
      riskAttributes: [],
      policyTopics: [],
      sourcePublishedAt: new Date("2026-07-15T00:00:00Z"),
      effectiveAt: new Date("2026-08-01T00:00:00Z"),
      urgency: 60,
      readiness: (opts.readiness ?? "VERIFIED") as any,
      generalImpact: "Hits sellers importing covered goods.",
      editorialStatus: "PUBLISHED",
      reviewedAt: new Date("2026-07-10T00:00:00Z"),
      reviewedBy: "reviewer-1",
    },
  });
  await prisma.evidenceRecord.create({
    data: {
      changeVersionId: version.id,
      sourceId: source.id,
      sourceItemId: item.id,
      url: `https://example.com/${seedId}/evidence`,
      role: "PRIMARY_OFFICIAL",
      authorityLevel: "GOVERNMENT_OFFICIAL",
      publishedAt: new Date("2026-07-10T00:00:00Z"),
      access: "PUBLIC",
      licenseNote: "Public domain",
      normalizedSummary: `Briefing evidence summary ${seedId}`,
      contentHash: `${seedId}-ch`,
      fetchedAt: new Date("2026-07-18T00:00:00Z"),
      reviewedAt: new Date("2026-07-19T00:00:00Z"),
    },
  });
  return { change, version, source };
}

async function seedQualificationRun(opts: {
  scopeKey: string;
  status?: "RUNNING" | "SUCCEEDED_ITEMS" | "SUCCEEDED_EMPTY" | "FAILED";
  finished?: boolean;
  changeVersionIds?: string[];
  fingerprint?: string | null;
  scheduledFor?: Date;
}) {
  return prisma.pipelineRun.create({
    data: {
      jobType: "BRIEFING",
      scopeKey: opts.scopeKey,
      scheduledFor: opts.scheduledFor ?? new Date("2026-07-27T00:00:00Z"),
      startedAt: new Date("2026-07-27T00:00:00Z"),
      finishedAt: (opts.finished ?? true) ? new Date("2026-07-27T00:05:00Z") : null,
      status: (opts.status ?? "SUCCEEDED_ITEMS") as any,
      itemCount: opts.changeVersionIds?.length ?? 0,
      outputFingerprint: opts.fingerprint === undefined ? `${runId}-outfp` : opts.fingerprint,
      metadata: opts.changeVersionIds ? { changeVersionIds: opts.changeVersionIds } : {},
      runnerVersion: "test-runner",
    },
  });
}

afterAll(async () => {
  await prisma.briefingEntry.deleteMany({ where: { briefing: { periodKey: { contains: runId } } } });
  await prisma.briefing.deleteMany({ where: { periodKey: { contains: runId } } });
  await prisma.pipelineRun.deleteMany({ where: { scopeKey: { contains: runId } } });
  await prisma.guideEvidence.deleteMany({ where: { guide: { slug: { startsWith: runId } } } });
  await prisma.guide.deleteMany({ where: { slug: { startsWith: runId } } });
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
  await prisma.item.deleteMany({ where: { sourceId: { startsWith: runId } } });
  await prisma.source.deleteMany({ where: { id: { contains: runId } } });
  await prisma.$disconnect();
}, 120000);

// ---------- the guide corpus: drafted, complete, unpublishable ----------

describe("guide corpus (content/guides)", () => {
  it("has nine structurally complete drafts covering every launch category", async () => {
    const report = await validateGuideCorpus("content/guides");
    expect(report.errors).toEqual([]);
    expect(report.guideCount).toBe(9);
    // Draft coverage of the six launch categories (contract-adjusted from
    // the plan: coverage means drafts exist, not published guides).
    expect(report.missingLaunchCategories).toEqual([]);
    expect(report.invalidEvidence).toEqual([]);
  }, 60000);

  it("locks every draft: EXPERIMENTAL, unreviewed, machine-authored, citations unverified", async () => {
    const report = await validateGuideCorpus("content/guides");
    for (const guide of report.guides) {
      expect(guide.frontmatter.readiness).toBe("EXPERIMENTAL");
      expect(guide.frontmatter.reviewedBy).toBeNull();
      expect(guide.frontmatter.lastReviewedAt).toBeNull();
      expect(guide.frontmatter.draftedBy).toBe("kimi-code/k3");
      expect(guide.frontmatter.citationsVerified).toBe(false);
      expect(guide.frontmatter.sources.length).toBeGreaterThanOrEqual(2);
      for (const source of guide.frontmatter.sources) {
        expect(OFFICIAL_AUTHORITY_LEVELS).toContain(source.authorityLevel);
      }
      for (const section of REQUIRED_GUIDE_SECTIONS) {
        expect(guide.sections).toContain(section);
      }
      expect(guide.wordCount).toBeGreaterThanOrEqual(GUIDE_WORD_MIN);
      expect(guide.wordCount).toBeLessThanOrEqual(GUIDE_WORD_MAX);
    }
    // The corpus covers all six launch categories as drafts.
    const covered = new Set(report.guides.flatMap((g) => g.frontmatter.productCategories));
    for (const category of INITIAL_PUBLIC_CATEGORIES) {
      expect(covered.has(category)).toBe(true);
    }
  }, 60000);

  it("confirms zero guides in the corpus pass the publish gate", async () => {
    const report = await validateGuideCorpus("content/guides");
    expect(report.guideCount).toBe(9);
    expect(report.publishableSlugs).toEqual([]);
  }, 60000);
});

// ---------- publishGuide: every refusal tested separately ----------

function basePublishableGuide(): any {
  return {
    filePath: "fixture.md",
    bodyMarkdown: "body",
    wordCount: 1000,
    sections: [...REQUIRED_GUIDE_SECTIONS],
    frontmatter: {
      slug: "fixture",
      title: "Fixture",
      summary: "Fixture summary",
      market: "US" as const,
      platforms: ["AMAZON" as const],
      productCategories: ["CONSUMER_ELECTRONICS" as const],
      riskAttributes: [],
      policyTopics: [],
      readiness: "MONITORED" as const,
      reviewedBy: "human-reviewer",
      lastReviewedAt: "2026-08-01",
      draftedBy: "kimi-code/k3",
      draftedAt: "2026-07-30",
      citationsVerified: true,
      sources: [
        { name: "A", url: "https://a.example", authorityLevel: "GOVERNMENT_OFFICIAL" as const },
        { name: "B", url: "https://b.example", authorityLevel: "PLATFORM_OFFICIAL" as const },
      ],
    },
  };
}

describe("publishGuide refusals (each condition separately)", () => {
  it("throws GUIDE_CITATIONS_UNVERIFIED when citationsVerified is false", () => {
    const guide = basePublishableGuide();
    guide.frontmatter.citationsVerified = false;
    expect(() => assertPublishable(guide as any)).toThrow("GUIDE_CITATIONS_UNVERIFIED");
  });

  it("throws GUIDE_REVIEWER_REQUIRED when reviewedBy is null", () => {
    const guide = basePublishableGuide();
    guide.frontmatter.reviewedBy = null as any;
    expect(() => assertPublishable(guide as any)).toThrow("GUIDE_REVIEWER_REQUIRED");
  });

  it("throws GUIDE_REVIEW_DATE_REQUIRED when lastReviewedAt is null", () => {
    const guide = basePublishableGuide();
    guide.frontmatter.lastReviewedAt = null as any;
    expect(() => assertPublishable(guide as any)).toThrow("GUIDE_REVIEW_DATE_REQUIRED");
  });

  it("throws GUIDE_REQUIRES_OFFICIAL_SOURCES with fewer than two official source records", () => {
    const guide = basePublishableGuide();
    guide.frontmatter.sources = [
      { name: "A", url: "https://a.example", authorityLevel: "GOVERNMENT_OFFICIAL" as const },
    ];
    expect(() => assertPublishable(guide as any)).toThrow("GUIDE_REQUIRES_OFFICIAL_SOURCES");
  });

  it("throws GUIDE_REQUIRES_OFFICIAL_SOURCES when sources are not official", () => {
    const guide = basePublishableGuide();
    guide.frontmatter.sources = [
      { name: "A", url: "https://a.example", authorityLevel: "REPUTABLE_SECONDARY" as const },
      { name: "B", url: "https://b.example", authorityLevel: "COMMUNITY" as const },
    ];
    expect(() => assertPublishable(guide as any)).toThrow("GUIDE_REQUIRES_OFFICIAL_SOURCES");
  });

  it("throws GUIDE_READINESS_BELOW_MONITORED for EXPERIMENTAL or lower readiness", () => {
    const guide = basePublishableGuide();
    guide.frontmatter.readiness = "EXPERIMENTAL" as any;
    expect(() => assertPublishable(guide as any)).toThrow("GUIDE_READINESS_BELOW_MONITORED");
  });

  it("passes a fully reviewed, verified-citation, official-sourced MONITORED guide", () => {
    expect(() => assertPublishable(basePublishableGuide() as any)).not.toThrow();
    expect(publishGateIssues(basePublishableGuide() as any)).toEqual([]);
  });
});

describe("publishGuide against the real corpus and the database", () => {
  it("refuses every real Phase 1 draft — no guide can ever publish", async () => {
    const report = await validateGuideCorpus("content/guides");
    for (const guide of report.guides) {
      await expect(publishGuide(guide.frontmatter.slug, "reviewer-x")).rejects.toThrow(/^GUIDE_/);
    }
  }, 120000);

  it("publishes a genuinely publishable guide and lists it", async () => {
    const slug = `${runId}-publishable`;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "guide-"));
    const sourceUrl = `https://example.com/${runId}-official`;
    // Taxonomy deliberately scoped to nothing any parallel suite asserts on:
    // no platforms, a non-launch category, no risk attributes, no topics.
    // A PUBLISHED guide row is global state — hub and topic queries in other
    // suites filter on exactly these dimensions.
    fs.writeFileSync(
      path.join(dir, `${slug}.md`),
      [
        "---",
        `slug: ${slug}`,
        'title: "Publishable Fixture Guide"',
        'summary: "A fixture that passes the publish gate."',
        "market: US",
        "platforms: []",
        "productCategories: [AUTOMOTIVE_TOOLS]",
        "riskAttributes: []",
        "policyTopics: []",
        "readiness: MONITORED",
        "reviewedBy: human-reviewer",
        "lastReviewedAt: 2026-08-01",
        "draftedBy: kimi-code/k3",
        "draftedAt: 2026-07-30",
        "citationsVerified: true",
        "sources:",
        `  - name: "Fixture Official Source"`,
        `    url: "${sourceUrl}"`,
        "    authorityLevel: GOVERNMENT_OFFICIAL",
        `  - name: "Fixture Platform Source"`,
        `    url: "https://example.com/${runId}-platform"`,
        "    authorityLevel: PLATFORM_OFFICIAL",
        "---",
        "",
        "## Who this is for",
        "",
        "Fixture body.",
      ].join("\n"),
    );
    try {
      const guide = await publishGuide(slug, "reviewer-x", { corpusDir: dir });
      expect(guide.editorialStatus).toBe("PUBLISHED");
      expect(guide.reviewedBy).toBe("reviewer-x");

      const listed = await listPublishedGuides();
      expect(listed.some((g) => g.slug === slug)).toBe(true);

      const detail = await getPublishedGuideBySlug(slug);
      expect(detail).not.toBeNull();
      expect(detail!.title).toBe("Publishable Fixture Guide");
      expect(detail!.bodyMarkdown).toContain("Fixture body.");
      expect(detail!.evidence.length).toBe(2);

      // Remove the global-state row immediately — do not wait for afterAll.
      await prisma.guideEvidence.deleteMany({ where: { guideId: guide.id } });
      await prisma.guide.deleteMany({ where: { id: guide.id } });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }, 60000);

  it("never exposes drafts through the public read path", async () => {
    expect(await getPublishedGuideBySlug("us-market-entry-basics")).toBeNull();
    expect(await getPublishedGuideBySlug("definitely-not-a-guide")).toBeNull();
  }, 30000);
});

// ---------- briefing period keys and paths ----------

describe("briefing period parsing", () => {
  it("parses weekly periods strictly (ISO week 1-53)", () => {
    expect(parseWeeklyPeriod("2026", "31")).toBe("2026-W31");
    expect(parseWeeklyPeriod("2026", "7")).toBe("2026-W07");
    expect(parseWeeklyPeriod("2026", "0")).toBeNull();
    expect(parseWeeklyPeriod("2026", "54")).toBeNull();
    expect(parseWeeklyPeriod("2026", "abc")).toBeNull();
    expect(parseWeeklyPeriod("26", "31")).toBeNull();
    expect(parseWeeklyPeriod("2026", "31';DROP--")).toBeNull();
  });

  it("parses monthly periods strictly (calendar month 1-12)", () => {
    expect(parseMonthlyPeriod("2026", "7")).toBe("2026-07");
    expect(parseMonthlyPeriod("2026", "12")).toBe("2026-12");
    expect(parseMonthlyPeriod("2026", "0")).toBeNull();
    expect(parseMonthlyPeriod("2026", "13")).toBeNull();
    expect(parseMonthlyPeriod("2026", "x")).toBeNull();
  });

  it("parses daily periods strictly (real dates only)", () => {
    expect(parseDailyPeriod("2026-08-03")).toBe("2026-08-03");
    expect(parseDailyPeriod("2026-02-29")).toBeNull(); // 2026 is not a leap year
    expect(parseDailyPeriod("2026-13-01")).toBeNull();
    expect(parseDailyPeriod("2026-08-3")).toBeNull();
    expect(parseDailyPeriod("not-a-date")).toBeNull();
  });

  it("builds scope keys and public paths from the same period key", () => {
    expect(briefingScopeKey("WEEKLY", "2026-W31")).toBe("weekly:2026-W31");
    expect(briefingPath("WEEKLY", "2026-W31")).toBe("/briefings/weekly/2026/31");
    expect(briefingPath("MONTHLY", "2026-07")).toBe("/briefings/monthly/2026/7");
    expect(briefingPath("DAILY", "2026-08-03")).toBe("/briefings/daily/2026-08-03");
  });
});

// ---------- generateBriefing: the PipelineRun integration contract ----------

describe("generateBriefing", () => {
  it("pins the exact ordered version IDs and fingerprint of the finished qualification run", async () => {
    const periodKey = `${runId}-W01`;
    const a = await seedChangeVersion({ readiness: "VERIFIED", title: `${runId} first created` });
    const b = await seedChangeVersion({ readiness: "MONITORED", title: `${runId} second created` });
    // Pinned order is deliberately NOT creation order — the run's ordering wins.
    const run = await seedQualificationRun({
      scopeKey: briefingScopeKey("WEEKLY", periodKey),
      changeVersionIds: [b.version.id, a.version.id],
    });

    const draft = await generateBriefing({ kind: "WEEKLY", periodKey });
    expect(draft).not.toBe(NO_QUALIFIED_CONTENT);
    if (draft === NO_QUALIFIED_CONTENT) return;
    expect(draft.changeVersionIds).toEqual([b.version.id, a.version.id]);
    expect(draft.fingerprint).toBe(run.outputFingerprint);

    // Persisted as DRAFT with BriefingEntry rows pinned in the run's order.
    const stored = await prisma.briefing.findUnique({
      where: { id: draft.id },
      include: { entries: { orderBy: { position: "asc" } } },
    });
    expect(stored).not.toBeNull();
    expect(stored!.editorialStatus).toBe("DRAFT");
    expect(stored!.fingerprint).toBe(run.outputFingerprint);
    expect(stored!.entries.map((e) => e.changeVersionId)).toEqual([b.version.id, a.version.id]);
    expect(stored!.entries.map((e) => e.position)).toEqual([0, 1]);
  }, 90000);

  it("returns NO_QUALIFIED_CONTENT when no finished qualification run exists — never computes its own ordering", async () => {
    const periodKey = `${runId}-W02`;
    const result = await generateBriefing({ kind: "WEEKLY", periodKey });
    expect(result).toBe(NO_QUALIFIED_CONTENT);
    const count = await prisma.briefing.count({ where: { periodKey } });
    expect(count).toBe(0);
  }, 60000);

  it("returns NO_QUALIFIED_CONTENT for unfinished or failed runs", async () => {
    const runningKey = `${runId}-W03`;
    await seedQualificationRun({
      scopeKey: briefingScopeKey("WEEKLY", runningKey),
      status: "RUNNING",
      finished: false,
      changeVersionIds: [],
    });
    expect(await generateBriefing({ kind: "WEEKLY", periodKey: runningKey })).toBe(NO_QUALIFIED_CONTENT);

    const failedKey = `${runId}-W04`;
    await seedQualificationRun({
      scopeKey: briefingScopeKey("WEEKLY", failedKey),
      status: "FAILED",
      changeVersionIds: [],
    });
    expect(await generateBriefing({ kind: "WEEKLY", periodKey: failedKey })).toBe(NO_QUALIFIED_CONTENT);
  }, 60000);

  it("breaks loudly when the run metadata does not carry ordered version IDs", async () => {
    const periodKey = `${runId}-W05`;
    await seedQualificationRun({
      scopeKey: briefingScopeKey("WEEKLY", periodKey),
      // status SUCCEEDED_ITEMS but metadata has no changeVersionIds array.
    });
    await expect(generateBriefing({ kind: "WEEKLY", periodKey })).rejects.toThrow(
      "BRIEFING_RUN_METADATA_INVALID",
    );

    const noFpKey = `${runId}-W06`;
    const v = await seedChangeVersion({});
    await seedQualificationRun({
      scopeKey: briefingScopeKey("WEEKLY", noFpKey),
      changeVersionIds: [v.version.id],
      fingerprint: null,
    });
    await expect(generateBriefing({ kind: "WEEKLY", periodKey: noFpKey })).rejects.toThrow(
      "BRIEFING_RUN_METADATA_INVALID",
    );
  }, 60000);

  it("rejects a qualification run whose scope does not match the requested period", async () => {
    const periodKey = `${runId}-W07`;
    const other = await seedQualificationRun({
      scopeKey: briefingScopeKey("WEEKLY", `${runId}-W99`),
      changeVersionIds: [],
      status: "FAILED",
    });
    await expect(
      generateBriefing({ kind: "WEEKLY", periodKey, qualificationRunId: other.id }),
    ).rejects.toThrow("BRIEFING_RUN_SCOPE_MISMATCH");
  }, 60000);
});

// ---------- the daily threshold (Owner Decision 5) ----------

describe("generateBriefing daily threshold", () => {
  it("does not manufacture a daily briefing below three qualified changes", async () => {
    const periodKey = `${runId}-D1`;
    const v1 = await seedChangeVersion({ readiness: "VERIFIED" });
    const v2 = await seedChangeVersion({ readiness: "MONITORED" });
    await seedQualificationRun({
      scopeKey: briefingScopeKey("DAILY", periodKey),
      changeVersionIds: [v1.version.id, v2.version.id],
    });
    expect(await generateBriefing({ kind: "DAILY", periodKey })).toBe(NO_QUALIFIED_CONTENT);
    expect(await prisma.briefing.count({ where: { periodKey } })).toBe(0);
  }, 60000);

  it("does not manufacture a daily briefing without at least one Verified change", async () => {
    const periodKey = `${runId}-D2`;
    const v1 = await seedChangeVersion({ readiness: "MONITORED" });
    const v2 = await seedChangeVersion({ readiness: "MONITORED" });
    const v3 = await seedChangeVersion({ readiness: "MONITORED" });
    await seedQualificationRun({
      scopeKey: briefingScopeKey("DAILY", periodKey),
      changeVersionIds: [v1.version.id, v2.version.id, v3.version.id],
    });
    expect(await generateBriefing({ kind: "DAILY", periodKey })).toBe(NO_QUALIFIED_CONTENT);
  }, 60000);

  it("generates a daily draft at three qualified changes including one Verified", async () => {
    const periodKey = `${runId}-D3`;
    const v1 = await seedChangeVersion({ readiness: "VERIFIED" });
    const v2 = await seedChangeVersion({ readiness: "MONITORED" });
    const v3 = await seedChangeVersion({ readiness: "MONITORED" });
    await seedQualificationRun({
      scopeKey: briefingScopeKey("DAILY", periodKey),
      changeVersionIds: [v1.version.id, v2.version.id, v3.version.id],
    });
    const draft = await generateBriefing({ kind: "DAILY", periodKey });
    expect(draft).not.toBe(NO_QUALIFIED_CONTENT);
    if (draft === NO_QUALIFIED_CONTENT) return;
    expect(draft.changeVersionIds).toEqual([v1.version.id, v2.version.id, v3.version.id]);
  }, 60000);
});

// ---------- publishBriefing and the correction guard ----------

describe("publishBriefing", () => {
  it("publishes a draft with a review event and refuses to republish", async () => {
    const periodKey = `${runId}-P1`;
    const v = await seedChangeVersion({});
    await seedQualificationRun({
      scopeKey: briefingScopeKey("WEEKLY", periodKey),
      changeVersionIds: [v.version.id],
    });
    const draft = await generateBriefing({ kind: "WEEKLY", periodKey });
    if (draft === NO_QUALIFIED_CONTENT) throw new Error("expected a draft");

    const published = await publishBriefing(draft.id, "reviewer-y");
    expect(published.editorialStatus).toBe("PUBLISHED");
    expect(published.reviewedBy).toBe("reviewer-y");
    expect(published.publishedAt).not.toBeNull();
    expect(published.reviewedAt).not.toBeNull();

    await expect(publishBriefing(draft.id, "reviewer-z")).rejects.toThrow(
      "BRIEFING_ALREADY_PUBLISHED",
    );
  }, 90000);

  it("never rewrites a published briefing — a correction needs a new fingerprint and review", async () => {
    const periodKey = `${runId}-P2`;
    const v = await seedChangeVersion({});
    const run = await seedQualificationRun({
      scopeKey: briefingScopeKey("WEEKLY", periodKey),
      changeVersionIds: [v.version.id],
    });
    const draft = await generateBriefing({ kind: "WEEKLY", periodKey });
    if (draft === NO_QUALIFIED_CONTENT) throw new Error("expected a draft");
    await publishBriefing(draft.id, "reviewer-y");

    await expect(generateBriefing({ kind: "WEEKLY", periodKey })).rejects.toThrow(
      "BRIEFING_ALREADY_PUBLISHED",
    );
    const untouched = await prisma.briefing.findUnique({ where: { id: draft.id } });
    expect(untouched!.fingerprint).toBe(run.outputFingerprint);
    expect(untouched!.editorialStatus).toBe("PUBLISHED");
  }, 90000);
});

// ---------- public read path and sitemap ----------

describe("published briefing read path", () => {
  it("returns entries in pinned order with serialized records; drafts stay invisible", async () => {
    const periodKey = `${runId}-R1`;
    const a = await seedChangeVersion({ readiness: "VERIFIED", title: `${runId} read path A` });
    const b = await seedChangeVersion({ readiness: "MONITORED", title: `${runId} read path B` });
    await seedQualificationRun({
      scopeKey: briefingScopeKey("MONTHLY", periodKey),
      changeVersionIds: [b.version.id, a.version.id],
    });

    // Unpublished: invisible.
    const draftKey = `${runId}-R2`;
    const c = await seedChangeVersion({});
    await seedQualificationRun({
      scopeKey: briefingScopeKey("MONTHLY", draftKey),
      changeVersionIds: [c.version.id],
    });
    const draft = await generateBriefing({ kind: "MONTHLY", periodKey: draftKey });
    if (draft === NO_QUALIFIED_CONTENT) throw new Error("expected a draft");
    expect(await getPublishedBriefing("MONTHLY", draftKey)).toBeNull();

    const pub = await generateBriefing({ kind: "MONTHLY", periodKey });
    if (pub === NO_QUALIFIED_CONTENT) throw new Error("expected a draft");
    await publishBriefing(pub.id, "reviewer-y");

    const detail = await getPublishedBriefing("MONTHLY", periodKey);
    expect(detail).not.toBeNull();
    expect(detail!.fingerprint).toBe(pub.fingerprint);
    expect(detail!.entries.map((e) => e.changeVersionId)).toEqual([b.version.id, a.version.id]);
    expect(detail!.entries[0]!.record.title).toContain("read path B");
    expect(detail!.entries[0]!.record.readiness).toBe("MONITORED");
    expect(detail!.entries[0]!.record.evidence.length).toBeGreaterThan(0);

    const listed = await listPublishedBriefings();
    const mine = listed.find((entry) => entry.periodKey === periodKey);
    expect(mine).toBeDefined();
    expect(mine!.path).toBe(briefingPath("MONTHLY", periodKey));
    expect(listed.some((entry) => entry.periodKey === draftKey)).toBe(false);
  }, 120000);

  it("sitemap includes published briefing periods and published guides — no drafts, no empty periods", async () => {
    // Task 8 amended the Task 5 contract: published guides ARE sitemap
    // entries (drafts never are). The old "no guides" assertion encoded the
    // locked-corpus state and was superseded; the guide fixtures here pin
    // the new rule with run-scoped rows.
    const periodKey = `${runId}-S1`;
    const v = await seedChangeVersion({});
    await seedQualificationRun({
      scopeKey: briefingScopeKey("WEEKLY", periodKey),
      changeVersionIds: [v.version.id],
    });
    const draft = await generateBriefing({ kind: "WEEKLY", periodKey });
    if (draft === NO_QUALIFIED_CONTENT) throw new Error("expected a draft");
    await publishBriefing(draft.id, "reviewer-y");

    const draftOnlyKey = `${runId}-S2`;
    const w = await seedChangeVersion({});
    await seedQualificationRun({
      scopeKey: briefingScopeKey("WEEKLY", draftOnlyKey),
      changeVersionIds: [w.version.id],
    });
    await generateBriefing({ kind: "WEEKLY", periodKey: draftOnlyKey });

    for (const [slug, status] of [
      [`${runId}-published-guide`, "PUBLISHED"],
      [`${runId}-draft-guide`, "DRAFT"],
    ] as const) {
      await prisma.guide.create({
        data: {
          slug,
          title: `Guide ${slug}`,
          summary: `Summary ${slug}`,
          bodyMarkdown: "body",
          platforms: [],
          productCategories: [],
          riskAttributes: [],
          readiness: "MONITORED",
          editorialStatus: status,
          lastReviewedAt: new Date("2026-07-20T00:00:00Z"),
          reviewedBy: "reviewer-y",
        },
      });
    }

    const { default: sitemap } = await import("../app/sitemap");
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((u) => u.endsWith(briefingPath("WEEKLY", periodKey)))).toBe(true);
    expect(urls.some((u) => u.endsWith(briefingPath("WEEKLY", draftOnlyKey)))).toBe(false);
    expect(urls.some((u) => u.endsWith(briefingPath("WEEKLY", "2026-W99")))).toBe(false);
    // Published guide is an entry (and the /guides index is too, now that a
    // published guide exists); the draft guide never appears.
    expect(urls.some((u) => u.endsWith(`/guides/${runId}-published-guide`))).toBe(true);
    expect(urls.some((u) => u.endsWith("/guides"))).toBe(true);
    expect(urls.some((u) => u.includes(`${runId}-draft-guide`))).toBe(false);
  }, 120000);
});
