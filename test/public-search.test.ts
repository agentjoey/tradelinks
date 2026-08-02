import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

// Public Intelligence Task 4 — typed filters, unindexed Phase 1 search,
// opaque-cursor page-through, experimental-demand boundary.
//
// Requires DATABASE_URL pointing at an isolated non-production branch.
// All seeded rows carry the run-scoped runId prefix and are deleted in
// FK-safe order in afterAll, exactly as the existing DB suites do.
//
// Search scoping trick: every seeded title embeds the unique runId token, so
// `q=<token>` scopes any search to this suite's rows even when other suites
// share the branch concurrently.

import {
  getPublicChangeDetail,
  listExperimentalDemand,
  parsePublicSearchParams,
  searchPublicChanges,
} from "../src/public-intelligence/search.js";
import { listPublicChanges } from "../src/public-intelligence/query.js";

const prisma = new PrismaClient();

const runId = `testsearch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let seedSeq = 0;
function nextSeed() {
  return `${runId}-${++seedSeq}`;
}

// ---------- seeding helpers (run-scoped, FK-safe cleanup) ----------

async function seedChange(opts: {
  readiness?: "MONITORED" | "VERIFIED" | "STALE" | "EXPERIMENTAL";
  editorialStatus?: "DRAFT" | "PUBLISHED" | "REJECTED";
  isCurrent?: boolean;
  title?: string;
  summary?: string;
  signalType?: "REGULATORY" | "PLATFORM_POLICY" | "LOGISTICS" | "DEMAND" | "INDUSTRY" | "PRACTICAL_GUIDANCE";
  platforms?: Array<"AMAZON" | "SHOPIFY">;
  productCategories?: Array<"CONSUMER_ELECTRONICS" | "PET_SUPPLIES" | "HOME_KITCHEN" | "TOYS_CHILDRENS_PRODUCTS">;
  effectiveAt?: Date | null;
  reviewedAt?: Date;
  evidenceRole?: "PRIMARY_OFFICIAL" | "SUPPORTING_OFFICIAL" | "SECONDARY_CONTEXT";
  evidenceAccess?: "PUBLIC" | "RESTRICTED" | "UNAVAILABLE";
  evidenceReviewedAt?: Date | null;
  actionTemplate?: string | null;
  actionTemplateReviewedAt?: Date | null;
}) {
  const seedId = nextSeed();
  const source = await prisma.source.create({
    data: {
      id: `${seedId}-source`,
      name: "Search Test Source",
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
      title: "Search test item",
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
      isCurrent: opts.isCurrent ?? true,
      title: opts.title ?? `Search Test Change ${seedId}`,
      summary: opts.summary ?? `Search test summary ${seedId}`,
      signalType: (opts.signalType ?? "REGULATORY") as any,
      regions: ["north_america"],
      platforms: (opts.platforms ?? []) as any,
      operatingStages: ["PREPARING_TO_LAUNCH"],
      productCategories: (opts.productCategories ?? []) as any,
      riskAttributes: [] as any,
      policyTopics: [] as any,
      sourcePublishedAt: new Date("2026-07-15T00:00:00Z"),
      effectiveAt: opts.effectiveAt === undefined ? new Date("2026-08-01T00:00:00Z") : opts.effectiveAt,
      urgency: 60,
      readiness: (opts.readiness ?? "VERIFIED") as any,
      generalImpact: "Hits sellers importing covered goods.",
      generalActionTemplate: opts.actionTemplate ?? null,
      actionTemplateReviewedAt: opts.actionTemplateReviewedAt ?? null,
      editorialStatus: (opts.editorialStatus ?? "PUBLISHED") as any,
      // Fixed date below the 2026-07-20 used by other suites: run-scoped rows
      // never outrank theirs in global reviewedAt-desc pools.
      reviewedAt: opts.reviewedAt ?? new Date("2026-07-10T00:00:00Z"),
      reviewedBy: "reviewer-1",
    },
  });
  await prisma.evidenceRecord.create({
    data: {
      changeVersionId: version.id,
      sourceId: source.id,
      sourceItemId: item.id,
      url: `https://example.com/${seedId}/evidence`,
      role: (opts.evidenceRole ?? "PRIMARY_OFFICIAL") as any,
      authorityLevel: "GOVERNMENT_OFFICIAL",
      publishedAt: new Date("2026-07-10T00:00:00Z"),
      access: (opts.evidenceAccess ?? "PUBLIC") as any,
      licenseNote: "Public domain",
      normalizedSummary: `Official evidence summary ${seedId}`,
      contentHash: `${seedId}-ch`,
      fetchedAt: new Date("2026-07-18T00:00:00Z"),
      reviewedAt: opts.evidenceReviewedAt === undefined ? new Date("2026-07-19T00:00:00Z") : opts.evidenceReviewedAt,
    },
  });
  return { change, version, source };
}

async function seedDemandSnapshot(opts: { asin: string; title: string; rank: number; date: Date }) {
  const seedId = nextSeed();
  const source = await prisma.source.create({
    data: {
      id: `${seedId}-bsr-source`,
      name: "Search Test BSR Source",
      url: `https://example.com/${seedId}/bsr`,
      adapter: "rss",
      frequencyCron: "0 * * * *",
      language: "en",
      regions: ["north_america"],
      platforms: [],
    },
  });
  await prisma.productSnapshot.create({
    data: {
      date: opts.date,
      asin: opts.asin,
      region: "north_america",
      category: "SearchTestCategory",
      rank: opts.rank,
      title: opts.title,
      sourceId: source.id,
    },
  });
}

afterAll(async () => {
  // FK-safe order, mirrors the existing DB suites.
  await prisma.productSnapshot.deleteMany({ where: { sourceId: { startsWith: runId } } });
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
  await prisma.source.deleteMany({ where: { id: { startsWith: runId } } });
  await prisma.$disconnect();
}, 120000);

// ---------- parsePublicSearchParams: the safe-default contract ----------

describe("parsePublicSearchParams", () => {
  it("defaults to verified for an absent, empty, unknown or hostile pool", () => {
    expect(parsePublicSearchParams(new URLSearchParams()).pool).toBe("verified");
    expect(parsePublicSearchParams(new URLSearchParams("pool=")).pool).toBe("verified");
    expect(parsePublicSearchParams(new URLSearchParams("pool=draft")).pool).toBe("verified");
    expect(parsePublicSearchParams(new URLSearchParams("pool=';DROP TABLE--")).pool).toBe("verified");
    expect(parsePublicSearchParams(new URLSearchParams("pool=VERIFIED")).pool).toBe("verified");
  });

  it("accepts the two expert pools only by exact value", () => {
    expect(parsePublicSearchParams(new URLSearchParams("pool=monitored")).pool).toBe("monitored");
    expect(parsePublicSearchParams(new URLSearchParams("pool=experimental-demand")).pool).toBe("experimental-demand");
    expect(parsePublicSearchParams(new URLSearchParams("pool=experimental")).pool).toBe("verified");
  });

  it("parses allowed filters and ignores everything else", () => {
    const parsed = parsePublicSearchParams(
      new URLSearchParams(
        "signal=REGULATORY&platform=amazon&category=home-kitchen&from=2026-07-01&to=2026-08-01&q=battery&cursor=abc123&utm_source=evil&readiness=STALE&editorialStatus=DRAFT",
      ),
    );
    expect(parsed.signal).toBe("REGULATORY");
    expect(parsed.platform).toBe("AMAZON");
    expect(parsed.category).toBe("HOME_KITCHEN");
    expect(parsed.from).toBe("2026-07-01");
    expect(parsed.to).toBe("2026-08-01");
    expect(parsed.q).toBe("battery");
    expect(parsed.cursor).toBe("abc123");
    // Unknown params never survive parsing into the filter object.
    expect(Object.keys(parsed).sort()).toEqual(
      ["category", "cursor", "from", "limit", "platform", "pool", "q", "signal", "to"].sort(),
    );
  });

  it("drops invalid filter values rather than erroring or leaking", () => {
    const parsed = parsePublicSearchParams(
      new URLSearchParams("signal=NOPE&platform=temu&category=grocery&from=not-a-date&to=2026-13-40&q=%20%20"),
    );
    expect(parsed.signal).toBeNull();
    expect(parsed.platform).toBeNull();
    expect(parsed.category).toBeNull();
    expect(parsed.from).toBeNull();
    expect(parsed.to).toBeNull();
    expect(parsed.q).toBeNull();
  });

  it("falls back to the default limit for absent, non-integer or out-of-range values", () => {
    expect(parsePublicSearchParams(new URLSearchParams()).limit).toBe(12);
    expect(parsePublicSearchParams(new URLSearchParams("limit=abc")).limit).toBe(12);
    expect(parsePublicSearchParams(new URLSearchParams("limit=0")).limit).toBe(12);
    expect(parsePublicSearchParams(new URLSearchParams("limit=9999")).limit).toBe(12);
    expect(parsePublicSearchParams(new URLSearchParams("limit=5")).limit).toBe(5);
  });
});

// ---------- searchPublicChanges: gating, filters, search, pagination ----------

describe("searchPublicChanges", () => {
  it("never leaks drafts, rejected, stale, non-current or below-Monitored records", async () => {
    const token = `${runId}-gate`;
    await seedChange({ editorialStatus: "DRAFT", title: `${token} draft` });
    await seedChange({ editorialStatus: "REJECTED", title: `${token} rejected` });
    await seedChange({ readiness: "STALE", title: `${token} stale` });
    await seedChange({ readiness: "EXPERIMENTAL", title: `${token} experimental` });
    await seedChange({ isCurrent: false, title: `${token} old version` });
    await seedChange({ readiness: "VERIFIED", title: `${token} verified keeper` });

    for (const pool of ["verified", "monitored"] as const) {
      const page = await searchPublicChanges({ ...parsePublicSearchParams(new URLSearchParams()), pool, q: token });
      expect(page.items.length).toBe(1);
      expect(page.items[0]!.title).toContain("verified keeper");
    }
  }, 60000);

  it("defaults to verified and widens to monitored only by explicit selection", async () => {
    const token = `${runId}-pool`;
    await seedChange({ readiness: "VERIFIED", title: `${token} verified one` });
    await seedChange({ readiness: "MONITORED", title: `${token} monitored one` });

    const verifiedOnly = await searchPublicChanges({
      ...parsePublicSearchParams(new URLSearchParams()),
      q: token,
    });
    expect(verifiedOnly.items.map((i) => i.readiness)).toEqual(["VERIFIED"]);

    const allMonitored = await searchPublicChanges({
      ...parsePublicSearchParams(new URLSearchParams(`pool=monitored`)),
      q: token,
    });
    expect(allMonitored.items.map((i) => i.readiness).sort()).toEqual(["MONITORED", "VERIFIED"]);
  }, 60000);

  it("applies structured filters without widening on invalid combinations", async () => {
    const token = `${runId}-filter`;
    await seedChange({
      title: `${token} amazon electronics logistics`,
      platforms: ["AMAZON"],
      productCategories: ["CONSUMER_ELECTRONICS"],
      signalType: "LOGISTICS",
    });
    await seedChange({
      title: `${token} shopify pets regulatory`,
      platforms: ["SHOPIFY"],
      productCategories: ["PET_SUPPLIES"],
      signalType: "REGULATORY",
    });

    const base = parsePublicSearchParams(new URLSearchParams());
    const byPlatform = await searchPublicChanges({ ...base, q: token, platform: "AMAZON" });
    expect(byPlatform.items.length).toBe(1);
    expect(byPlatform.items[0]!.title).toContain("amazon electronics");

    const byCategory = await searchPublicChanges({ ...base, q: token, category: "PET_SUPPLIES" });
    expect(byCategory.items.length).toBe(1);
    expect(byCategory.items[0]!.title).toContain("shopify pets");

    const bySignal = await searchPublicChanges({ ...base, q: token, signal: "LOGISTICS" });
    expect(bySignal.items.length).toBe(1);
    expect(bySignal.items[0]!.signalType).toBe("LOGISTICS");

    // A contradictory combination narrows to empty — never widens.
    const none = await searchPublicChanges({ ...base, q: token, platform: "AMAZON", category: "PET_SUPPLIES" });
    expect(none.items.length).toBe(0);
  }, 60000);

  it("filters on the effective-date range and excludes undated records when a range is set", async () => {
    const token = `${runId}-dates`;
    await seedChange({ title: `${token} july`, effectiveAt: new Date("2026-07-10T00:00:00Z") });
    await seedChange({ title: `${token} september`, effectiveAt: new Date("2026-09-01T00:00:00Z") });
    await seedChange({ title: `${token} undated`, effectiveAt: null });

    const base = parsePublicSearchParams(new URLSearchParams());
    const ranged = await searchPublicChanges({ ...base, q: token, from: "2026-07-01", to: "2026-08-01" });
    expect(ranged.items.map((i) => i.title)).toEqual([`${token} july`]);

    // An impossible range (from > to) narrows to empty, never widens.
    const impossible = await searchPublicChanges({ ...base, q: token, from: "2026-08-01", to: "2026-07-01" });
    expect(impossible.items.length).toBe(0);
  }, 60000);

  it("matches q against title and summary case-insensitively", async () => {
    const token = `${runId}-qmatch`;
    await seedChange({ title: `${token} Battery Label Rule`, summary: "unrelated prose" });
    await seedChange({ title: `${token} plain title`, summary: "the BATTERY guidance lives here" });

    const base = parsePublicSearchParams(new URLSearchParams());
    const byTitle = await searchPublicChanges({ ...base, q: `${token} battery label` });
    expect(byTitle.items.length).toBe(1);
    const bySummary = await searchPublicChanges({ ...base, q: token, signal: null });
    const summaryHit = await searchPublicChanges({ ...base, q: "battery guidance lives" });
    expect(summaryHit.items.some((i) => i.title === `${token} plain title`)).toBe(true);
    expect(bySummary.items.length).toBe(2);
    const lower = await searchPublicChanges({ ...base, q: `${token} battery label`.toLowerCase() });
    expect(lower.items.length).toBe(1);
  }, 60000);

  it("pages through with the Task 1 opaque cursor and nulls nextCursor on the final page", async () => {
    const token = `${runId}-pages`;
    for (let i = 0; i < 5; i++) {
      await seedChange({
        title: `${token} page item ${i}`,
        reviewedAt: new Date(Date.UTC(2026, 6, 10, 0, 0, i)),
      });
    }
    const base = { ...parsePublicSearchParams(new URLSearchParams()), q: token, limit: 2 };

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 6; page++) {
      const result = await searchPublicChanges({ ...base, cursor });
      seen.push(...result.items.map((i) => i.title));
      cursor = result.nextCursor;
      if (!cursor) break;
    }
    expect(seen.length).toBe(5);
    expect(new Set(seen).size).toBe(5);
    expect(cursor).toBeNull();

    // Wire-format compatibility with the Task 1 cursor scheme: base64url
    // JSON { id, reviewedAt } — the same shape listPublicChanges emits.
    const first = await searchPublicChanges({ ...base });
    const decoded = JSON.parse(Buffer.from(first.nextCursor!, "base64url").toString("utf8"));
    expect(typeof decoded.id).toBe("string");
    expect(typeof decoded.reviewedAt).toBe("string");

    // A cursor produced by the Task 1 helper is consumable here.
    const task1Page = await listPublicChanges({ pool: "verified", limit: 1 });
    if (task1Page.nextCursor) {
      const continued = await searchPublicChanges({
        ...parsePublicSearchParams(new URLSearchParams()),
        cursor: task1Page.nextCursor,
      });
      expect(continued.items.every((i) => i.versionId !== task1Page.items[0]!.versionId)).toBe(true);
    }
  }, 90000);

  it("rejects an undecodable cursor and a non-integer limit", async () => {
    const base = parsePublicSearchParams(new URLSearchParams());
    await expect(searchPublicChanges({ ...base, cursor: "!!!not-base64!!!" })).rejects.toThrow(/cursor/i);
    await expect(searchPublicChanges({ ...base, limit: 2.5 })).rejects.toThrow(/limit/i);
    await expect(searchPublicChanges({ ...base, limit: 0 })).rejects.toThrow(/limit/i);
  }, 30000);
});

// ---------- getPublicChangeDetail: access labels + action template gate ----------

describe("getPublicChangeDetail", () => {
  it("returns null for an unknown or unpublished slug", async () => {
    expect(await getPublicChangeDetail("definitely-not-a-real-slug")).toBeNull();
    const draft = await seedChange({ editorialStatus: "DRAFT" });
    expect(await getPublicChangeDetail(draft.change.slug)).toBeNull();
    const stale = await seedChange({ readiness: "STALE" });
    expect(await getPublicChangeDetail(stale.change.slug)).toBeNull();
  }, 60000);

  it("carries evidence access labels and the reviewed action template", async () => {
    const { change } = await seedChange({
      readiness: "VERIFIED",
      evidenceAccess: "RESTRICTED",
      evidenceReviewedAt: new Date("2026-07-19T00:00:00Z"),
      actionTemplate: "Identify covered listings and re-certify before the effective date.",
      actionTemplateReviewedAt: new Date("2026-07-20T00:00:00Z"),
    });
    const detail = await getPublicChangeDetail(change.slug);
    expect(detail).not.toBeNull();
    expect(detail!.record.slug).toBe(change.slug);
    expect(detail!.evidence[0]!.access).toBe("RESTRICTED");
    expect(detail!.hasReviewedPrimaryOfficial).toBe(true);
    expect(detail!.actionTemplate).not.toBeNull();
    expect(detail!.actionTemplate!.body).toContain("Identify covered listings");
  }, 60000);

  it("withholds the action template without review or without reviewed primary-official evidence", async () => {
    const unreviewedTemplate = await seedChange({
      actionTemplate: "Unreviewed template body",
      actionTemplateReviewedAt: null,
    });
    const detail1 = await getPublicChangeDetail(unreviewedTemplate.change.slug);
    expect(detail1!.actionTemplate).toBeNull();

    const unreviewedEvidence = await seedChange({
      actionTemplate: "Reviewed template body",
      actionTemplateReviewedAt: new Date("2026-07-20T00:00:00Z"),
      evidenceReviewedAt: null,
    });
    const detail2 = await getPublicChangeDetail(unreviewedEvidence.change.slug);
    expect(detail2!.hasReviewedPrimaryOfficial).toBe(false);
  }, 60000);
});

// ---------- sitemap: published changes become entries, gated slugs never do ----------

describe("sitemap canonical-change entries", () => {
  it("includes published changes and /changes; drafts and unknown slugs stay out", async () => {
    const published = await seedChange({ editorialStatus: "PUBLISHED", readiness: "VERIFIED" });
    const draft = await seedChange({ editorialStatus: "DRAFT" });
    const { default: sitemap } = await import("../app/sitemap");
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((u) => u.endsWith("/changes"))).toBe(true);
    expect(urls.some((u) => u.endsWith(`/changes/${published.change.slug}`))).toBe(true);
    expect(urls.some((u) => u.endsWith(`/changes/${draft.change.slug}`))).toBe(false);
    expect(urls.some((u) => u.endsWith("/changes/definitely-not-a-real-slug"))).toBe(false);
  }, 90000);
});


// ---------- listExperimentalDemand: the separate demand repository ----------

describe("listExperimentalDemand", () => {
  it("returns rank observations only — no bestseller, launch or market-size claims", async () => {
    // Unique per run (date+asin+region is the unique key) and ASIN-shaped.
    const asin = `T${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 4).toUpperCase()}`.slice(0, 10);
    await seedDemandSnapshot({
      asin,
      title: `${runId} demand widget`,
      rank: 42,
      date: new Date("2026-08-01T00:00:00Z"),
    });
    const rows = await listExperimentalDemand(50);
    const mine = rows.filter((row) => row.asin === asin);
    expect(mine.length).toBe(1);
    expect(mine[0]!.rank).toBe(42);
    expect(mine[0]!.title).toContain("demand widget");
    expect(mine[0]!.observedAt).toBe("2026-08-01");
    // The observation shape carries no recommendation fields at all.
    expect(Object.keys(mine[0]!).sort()).toEqual(["asin", "category", "observedAt", "rank", "title"]);
  }, 60000);
});
