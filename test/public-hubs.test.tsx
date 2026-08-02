import { PrismaClient } from "@prisma/client";
import type { Source } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Public Intelligence Task 3 — readiness-gated hubs.
//
// Requires DATABASE_URL pointing at an isolated non-production branch.
// All seeded rows carry the run-scoped runId prefix and are deleted in
// FK-safe order in afterAll, exactly as the existing DB suites do.

let mockPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import {
  RISK_TO_TOPIC,
  canRenderHub,
  getCoverageMatrix,
  getHub,
  getTopicHub,
  topicSlug,
  toDemandContext,
} from "../src/public-intelligence/coverage.js";
import CategoryPage from "../app/(public)/categories/[category]/page";
import Home from "../app/(public)/page";

const prisma = new PrismaClient();

const runId = `testhub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let seedSeq = 0;
function nextSeed() {
  return `${runId}-${++seedSeq}`;
}

// ---------- seeding helpers (run-scoped, FK-safe cleanup) ----------

async function seedSource(opts?: {
  lastOkAt?: Date | null;
  slaMinutes?: number | null;
  isActive?: boolean;
}) {
  const seedId = nextSeed();
  return prisma.source.create({
    data: {
      id: `${seedId}-source`,
      name: `Hub Test Source ${seedId}`,
      url: `https://example.com/${seedId}`,
      adapter: "rss",
      frequencyCron: "0 * * * *",
      language: "en",
      regions: ["north_america"],
      platforms: [],
      authorityLevel: "GOVERNMENT_OFFICIAL",
      freshnessSlaMinutes: opts?.slaMinutes === undefined ? 720 : opts.slaMinutes,
      lastOkAt: opts?.lastOkAt === undefined ? new Date() : opts.lastOkAt,
      isActive: opts?.isActive ?? true,
    },
  });
}

async function seedCapability(opts: {
  key: string;
  readiness: "UNAVAILABLE" | "EXPERIMENTAL" | "MONITORED" | "VERIFIED" | "STALE";
  category?:
    | "CONSUMER_ELECTRONICS"
    | "PET_SUPPLIES"
    | "BEAUTY_PERSONAL_CARE"
    | "TOYS_CHILDRENS_PRODUCTS"
    | "HOME_KITCHEN"
    | "APPAREL_ACCESSORIES";
  platform?: "AMAZON" | "SHOPIFY";
  gaps?: string[];
  sources?: Source[];
  lastReviewedAt?: Date;
}) {
  const capability = await prisma.coverageCapability.create({
    data: {
      key: opts.key,
      market: "US",
      platform: opts.platform ?? null,
      category: (opts.category as any) ?? null,
      readiness: opts.readiness,
      summary: `Hub test capability ${opts.key}`,
      knownGaps: opts.gaps ?? [`known gap for ${opts.key}`],
      lastReviewedAt: opts.lastReviewedAt ?? new Date("2026-07-20T00:00:00Z"),
    },
  });
  // Default to one healthy linked source so every run-scoped fixture stays
  // compliant with coverage-readiness' suite-wide category invariant
  // (sources > 0, gaps > 0) when both files share the branch concurrently.
  const sources = opts.sources ?? [await seedSource()];
  for (const source of sources) {
    await prisma.capabilitySource.create({
      data: { capabilityId: capability.id, sourceId: source.id },
    });
  }
  return capability;
}

async function seedChange(opts: {
  readiness?: "MONITORED" | "VERIFIED" | "STALE" | "EXPERIMENTAL";
  editorialStatus?: "DRAFT" | "PUBLISHED";
  platforms?: Array<"AMAZON" | "SHOPIFY">;
  productCategories?: Array<
    | "CONSUMER_ELECTRONICS"
    | "PET_SUPPLIES"
    | "BEAUTY_PERSONAL_CARE"
    | "TOYS_CHILDRENS_PRODUCTS"
    | "HOME_KITCHEN"
    | "APPAREL_ACCESSORIES"
  >;
  policyTopics?: Array<
    | "IMPORT_CUSTOMS"
    | "PRODUCT_SAFETY_RECALLS"
    | "LABELING_CLAIMS"
    | "FEES_PAYMENTS"
    | "PRIVACY_CONSUMER_PROTECTION"
    | "LISTING_ACCOUNT_HEALTH"
  >;
  riskAttributes?: Array<"BATTERY" | "TEXTILE_LABELING" | "CHILDREN">;
  title?: string;
}) {
  const seedId = nextSeed();
  const source = await prisma.source.create({
    data: {
      id: `${seedId}-source`,
      name: "Hub Change Test Source",
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
      title: "Hub test item",
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
      title: opts.title ?? `Hub Test Change ${seedId}`,
      summary: "Hub test summary",
      signalType: "REGULATORY",
      regions: ["north_america"],
      platforms: (opts.platforms ?? []) as any,
      operatingStages: ["PREPARING_TO_LAUNCH"],
      productCategories: (opts.productCategories ?? []) as any,
      riskAttributes: (opts.riskAttributes ?? []) as any,
      policyTopics: (opts.policyTopics ?? []) as any,
      sourcePublishedAt: new Date("2026-07-15T00:00:00Z"),
      urgency: 60,
      readiness: (opts.readiness ?? "MONITORED") as any,
      generalImpact: "Hits sellers importing covered goods.",
      editorialStatus: (opts.editorialStatus ?? "PUBLISHED") as any,
      // Fixed date BELOW the 2026-07-20 used by every other suite: run-scoped
      // rows never outrank theirs in global reviewedAt-desc pools (their
      // top-N pagination assertions keep their baseline composition), while
      // this suite's own hub windows stay deterministic by using product
      // categories no other suite publishes (HOME_KITCHEN).
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
      normalizedSummary: "Official evidence summary",
      contentHash: `${seedId}-ch`,
      fetchedAt: new Date("2026-07-18T00:00:00Z"),
      reviewedAt: new Date("2026-07-19T00:00:00Z"),
    },
  });
  return { change, version, source };
}

async function seedGuide(opts: {
  readiness?: "MONITORED" | "VERIFIED";
  editorialStatus?: "DRAFT" | "PUBLISHED";
  platforms?: Array<"AMAZON" | "SHOPIFY">;
  productCategories?: Array<"CONSUMER_ELECTRONICS" | "HOME_KITCHEN">;
  riskAttributes?: Array<"BATTERY" | "TEXTILE_LABELING" | "CHILDREN" | "TOPICAL_COSMETIC">;
  title?: string;
}) {
  const seedId = nextSeed();
  return prisma.guide.create({
    data: {
      id: `${seedId}-guide`,
      slug: `${seedId}-guide`,
      title: opts.title ?? `Hub Test Guide ${seedId}`,
      summary: "Hub test guide summary",
      bodyMarkdown: "# Guide",
      readiness: (opts.readiness ?? "MONITORED") as any,
      editorialStatus: (opts.editorialStatus ?? "PUBLISHED") as any,
      lastReviewedAt: new Date("2026-07-21T00:00:00Z"),
      reviewedBy: "reviewer-1",
      platforms: (opts.platforms ?? []) as any,
      productCategories: (opts.productCategories ?? []) as any,
      riskAttributes: (opts.riskAttributes ?? []) as any,
    },
  });
}

afterAll(async () => {
  // FK-safe order, mirrors the existing DB suites.
  await prisma.guideEvidence.deleteMany({ where: { guideId: { startsWith: runId } } });
  await prisma.guide.deleteMany({ where: { id: { startsWith: runId } } });
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
  await prisma.capabilitySource.deleteMany({
    where: { capability: { key: { startsWith: `category:${runId}` } } },
  });
  await prisma.coverageCapability.deleteMany({
    where: { key: { startsWith: `category:${runId}` } },
  });
  await prisma.source.deleteMany({ where: { id: { startsWith: runId } } });
  await prisma.$disconnect();
}, 120000);

// ---------- pure gating ----------

describe("canRenderHub", () => {
  it("renders only MONITORED or VERIFIED capabilities", () => {
    expect(canRenderHub({ readiness: "MONITORED" })).toBe(true);
    expect(canRenderHub({ readiness: "VERIFIED" })).toBe(true);
    expect(canRenderHub({ readiness: "UNAVAILABLE" })).toBe(false);
    expect(canRenderHub({ readiness: "EXPERIMENTAL" })).toBe(false);
    expect(canRenderHub({ readiness: "STALE" })).toBe(false);
  });
});

// ---------- getHub gating (run-scoped category capabilities) ----------

describe("getHub readiness gating", () => {
  it("returns null for a category with no capability row", async () => {
    expect(await getHub("grocery")).toBeNull();
  }, 30000);

  it("returns null for an unknown platform-shaped slug", async () => {
    expect(await getHub("temu-us")).toBeNull();
  }, 30000);

  it("does not publish a category below monitored (EXPERIMENTAL)", async () => {
    const seedId = nextSeed();
    await seedCapability({ key: `category:${seedId}`, category: "PET_SUPPLIES", readiness: "EXPERIMENTAL" });
    expect(await getHub(seedId)).toBeNull();
  }, 30000);

  it("does not publish a STALE category", async () => {
    const seedId = nextSeed();
    await seedCapability({ key: `category:${seedId}`, category: "PET_SUPPLIES", readiness: "STALE" });
    expect(await getHub(seedId)).toBeNull();
  }, 30000);

  it("does not publish an UNAVAILABLE category", async () => {
    const seedId = nextSeed();
    await seedCapability({ key: `category:${seedId}`, category: "PET_SUPPLIES", readiness: "UNAVAILABLE" });
    expect(await getHub(seedId)).toBeNull();
  }, 30000);

  it("publishes a MONITORED category", async () => {
    const seedId = nextSeed();
    await seedCapability({ key: `category:${seedId}`, category: "PET_SUPPLIES", readiness: "MONITORED" });
    const hub = await getHub(seedId);
    expect(hub).not.toBeNull();
    expect(hub!.readiness).toBe("MONITORED");
    expect(hub!.title).toBe("Pet Supplies");
  }, 30000);

  it("publishes a VERIFIED category", async () => {
    const seedId = nextSeed();
    await seedCapability({ key: `category:${seedId}`, category: "HOME_KITCHEN", readiness: "VERIFIED" });
    const hub = await getHub(seedId);
    expect(hub).not.toBeNull();
    expect(hub!.readiness).toBe("VERIFIED");
  }, 30000);

  it("refuses a renderable-readiness capability with an empty known-gaps list", async () => {
    const seedId = nextSeed();
    // This fixture deliberately violates the suite-wide category invariant
    // (non-empty gaps); it is deleted immediately so a concurrently running
    // coverage-readiness suite cannot observe it.
    try {
      await seedCapability({
        key: `category:${seedId}`,
        category: "PET_SUPPLIES",
        readiness: "MONITORED",
        gaps: [],
      });
      // An empty gap list is a bug, not a clean bill of health: the hub must
      // not render without its mandatory non-empty gap statement.
      expect(await getHub(seedId)).toBeNull();
    } finally {
      await prisma.capabilitySource.deleteMany({
        where: { capability: { key: `category:${seedId}` } },
      });
      await prisma.coverageCapability.deleteMany({ where: { key: `category:${seedId}` } });
    }
  }, 30000);
});

// ---------- getHub content mapping ----------

describe("getHub content", () => {
  const NOW = new Date("2026-08-02T12:00:00Z");
  let slug: string;
  let staleChangeSlug: string;
  let draftChangeSlug: string;
  let otherCategoryChangeSlug: string;
  let federalChangeSlug: string;
  let amazonChangeSlug: string;
  let guideSlug: string;
  let draftGuideSlug: string;
  let overdueSourceId: string;
  let okSourceId: string;

  beforeAll(async () => {
    const seedId = nextSeed();
    slug = seedId;
    // HAZARD (cross-suite readiness race — see the Task 5 scope extension):
    // coverage-readiness' refreshCapabilityReadiness test recomputes EVERY
    // stored CoverageCapability row and persists STALE transitions. A
    // fixture whose required sources are overdue at that suite's recompute
    // clock (2026-07-26T12:00Z) gets flipped to STALE mid-run and getHub
    // returns null. Both sources below are therefore NOT overdue at that
    // clock: okSource's lastOkAt is after it, and overdueSource is only
    // overdue at this file's fixture clock NOW (2026-08-02T12:00Z), which
    // is what the overdue-display assertions below actually need.
    const okSource = await seedSource({ lastOkAt: new Date("2026-08-02T11:00:00Z"), slaMinutes: 2880 });
    const overdueSource = await seedSource({ lastOkAt: new Date("2026-07-26T08:00:00Z"), slaMinutes: 360 });
    okSourceId = okSource.id;
    overdueSourceId = overdueSource.id;
    await seedCapability({
      key: `category:${seedId}`,
      category: "HOME_KITCHEN",
      readiness: "MONITORED",
      gaps: ["CPSC recall REST disabled", "Movers & Shakers bot-gated"],
      sources: [okSource, overdueSource],
      lastReviewedAt: new Date("2026-07-20T00:00:00Z"),
    });

    // In-scope monitored change (federal — no platforms)
    const federal = await seedChange({
      readiness: "MONITORED",
      productCategories: ["HOME_KITCHEN"],
      policyTopics: ["PRODUCT_SAFETY_RECALLS"],
      riskAttributes: ["BATTERY"],
      title: "Federal kitchen safety rule",
    });
    federalChangeSlug = federal.change.slug;
    // In-scope verified change tagged AMAZON
    const amazon = await seedChange({
      readiness: "VERIFIED",
      platforms: ["AMAZON"],
      productCategories: ["HOME_KITCHEN"],
      policyTopics: ["FEES_PAYMENTS"],
      title: "Amazon kitchen fee change",
    });
    amazonChangeSlug = amazon.change.slug;
    // Overflow records so the de-duplicated slices (which draw from beyond
    // the six-card changes window) always have content: 6 more federal and
    // 2 more AMAZON-tagged in-scope changes.
    for (let i = 0; i < 6; i++) {
      await seedChange({
        readiness: "MONITORED",
        productCategories: ["HOME_KITCHEN"],
        title: `Federal kitchen overflow rule ${i + 1}`,
      });
    }
    for (let i = 0; i < 2; i++) {
      await seedChange({
        readiness: "VERIFIED",
        platforms: ["AMAZON"],
        productCategories: ["HOME_KITCHEN"],
        title: `Amazon kitchen overflow change ${i + 1}`,
      });
    }
    // Below-public-readiness change — must not surface
    staleChangeSlug = (await seedChange({ readiness: "STALE", productCategories: ["HOME_KITCHEN"] })).change.slug;
    draftChangeSlug = (await seedChange({ editorialStatus: "DRAFT", productCategories: ["HOME_KITCHEN"] })).change.slug;
    // Different category — must not surface
    otherCategoryChangeSlug = (await seedChange({ readiness: "VERIFIED", productCategories: ["PET_SUPPLIES"] })).change.slug;

    const guide = await seedGuide({ productCategories: ["HOME_KITCHEN"], title: "Kitchen import guide" });
    guideSlug = guide.slug;
    const draftGuide = await seedGuide({ editorialStatus: "DRAFT", productCategories: ["HOME_KITCHEN"] });
    draftGuideSlug = draftGuide.slug;
  }, 120000);

  it("maps capability fields, gaps, freshness and overdue sources", async () => {
    const hub = await getHub(slug, NOW);
    expect(hub).not.toBeNull();
    expect(hub!.kind).toBe("category");
    expect(hub!.title).toBe("Home & Kitchen");
    expect(hub!.knownGaps).toEqual(["CPSC recall REST disabled", "Movers & Shakers bot-gated"]);
    expect(hub!.sources.map((s) => s.id).sort()).toEqual([okSourceId, overdueSourceId].sort());
    expect(hub!.slaMinutes).toBe(360);
    expect(hub!.lastSuccessfulCheck).toBe("2026-08-02T11:00:00.000Z");
    expect(hub!.overdueSources.map((s) => s.id)).toEqual([overdueSourceId]);
    expect(hub!.lastContentReview).toBe("2026-07-20T00:00:00.000Z");
  }, 30000);

  it("never reports a seeded-never-reviewed capability as reviewed", async () => {
    const seedId = nextSeed();
    await seedCapability({
      key: `category:${seedId}`,
      category: "PET_SUPPLIES",
      readiness: "MONITORED",
      lastReviewedAt: new Date(0),
    });
    const hub = await getHub(seedId, NOW);
    expect(hub!.lastContentReview).toBeNull();
  }, 30000);

  it("aggregates only public in-scope changes with no record rendered twice", async () => {
    const hub = await getHub(slug, NOW);
    const inWindow = hub!.changes.map((c) => c.slug);
    expect(hub!.changes.length).toBe(6);
    expect(inWindow).not.toContain(staleChangeSlug);
    expect(inWindow).not.toContain(draftChangeSlug);
    expect(inWindow).not.toContain(otherCategoryChangeSlug);

    const federal = hub!.federalRequirements;
    const amazonSlice = hub!.platformConsiderations.find((p) => p.platform === "AMAZON");

    // The union of window + slices covers the seeded in-scope records, and
    // every seeded record lands in exactly one of them (no duplication).
    const sliceSlugs = [
      ...federal.map((c) => c.slug),
      ...(amazonSlice?.changes.map((c) => c.slug) ?? []),
    ];
    const all = [...inWindow, ...sliceSlugs];
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain(federalChangeSlug);
    expect(all).toContain(amazonChangeSlug);
    expect(sliceSlugs).not.toContain(staleChangeSlug);
    expect(sliceSlugs).not.toContain(otherCategoryChangeSlug);

    // Slice semantics: federal records carry no platform tag; the amazon
    // slice carries only AMAZON-tagged records.
    for (const record of federal) expect(record.platforms).toHaveLength(0);
    for (const record of amazonSlice?.changes ?? []) {
      expect(record.platforms).toContain("AMAZON");
    }
    // Slices never repeat a record already shown in the changes window.
    for (const slug of sliceSlugs) expect(inWindow).not.toContain(slug);
    expect(sliceSlugs.length).toBeGreaterThan(0);
  }, 30000);

  it("lists recurring topics with counts and published guides only", async () => {
    const hub = await getHub(slug, NOW);
    const safety = hub!.recurringTopics.find((t) => t.topic === "PRODUCT_SAFETY_RECALLS");
    expect(safety).toBeDefined();
    expect(safety!.count).toBeGreaterThanOrEqual(1);
    expect(hub!.guides.map((g) => g.slug)).toContain(guideSlug);
    expect(hub!.guides.map((g) => g.slug)).not.toContain(draftGuideSlug);
  }, 30000);
});

// ---------- demand context ----------

describe("toDemandContext", () => {
  const base = {
    key: "demand:amazon-bsr",
    summary: "Rank observation only",
    knownGaps: ["no completeness claim"],
    sources: [] as any[],
  };
  it("exposes EXPERIMENTAL demand with its non-promise gaps", () => {
    const ctx = toDemandContext({ ...base, readiness: "EXPERIMENTAL" as const });
    expect(ctx).not.toBeNull();
    expect(ctx!.readiness).toBe("EXPERIMENTAL");
    expect(ctx!.knownGaps.length).toBeGreaterThan(0);
  });
  it("never exposes demand below experimental or without gaps", () => {
    expect(toDemandContext({ ...base, readiness: "STALE" as const })).toBeNull();
    expect(toDemandContext({ ...base, readiness: "MONITORED" as const })).toBeNull();
    expect(toDemandContext({ ...base, readiness: "EXPERIMENTAL" as const, knownGaps: [] })).toBeNull();
    expect(toDemandContext(null)).toBeNull();
  });
});

// ---------- topic hubs ----------

describe("topicSlug and risk mapping", () => {
  it("derives kebab slugs for all six approved topics", () => {
    expect(topicSlug("IMPORT_CUSTOMS")).toBe("import-customs");
    expect(topicSlug("PRODUCT_SAFETY_RECALLS")).toBe("product-safety-recalls");
    expect(topicSlug("LABELING_CLAIMS")).toBe("labeling-claims");
    expect(topicSlug("FEES_PAYMENTS")).toBe("fees-payments");
    expect(topicSlug("PRIVACY_CONSUMER_PROTECTION")).toBe("privacy-consumer-protection");
    expect(topicSlug("LISTING_ACCOUNT_HEALTH")).toBe("listing-account-health");
  });

  it("routes every Risk Attribute to one of the six explicit topics", () => {
    const topics = new Set(Object.values(RISK_TO_TOPIC));
    for (const topic of topics) {
      expect(topicSlug(topic as any)).toMatch(/^[a-z-]+$/);
    }
    expect(RISK_TO_TOPIC.TEXTILE_LABELING).toBe("LABELING_CLAIMS");
    expect(RISK_TO_TOPIC.BATTERY).toBe("PRODUCT_SAFETY_RECALLS");
  });
});

describe("getTopicHub support rules", () => {
  it("returns null for an unknown topic slug", async () => {
    expect(await getTopicHub("not-a-topic")).toBeNull();
  }, 30000);

  it("hides an unsupported recurring topic page", async () => {
    expect(await getTopicHub("listing-account-health")).toBeNull();
  }, 30000);

  it("one change alone does not support a topic", async () => {
    await seedChange({ policyTopics: ["LABELING_CLAIMS"], readiness: "VERIFIED" });
    expect(await getTopicHub("labeling-claims")).toBeNull();
  }, 30000);

  it("one reviewed guide plus one current published change supports a topic", async () => {
    await seedGuide({ riskAttributes: ["TEXTILE_LABELING"], readiness: "VERIFIED" });
    const hub = await getTopicHub("labeling-claims");
    expect(hub).not.toBeNull();
    expect(hub!.label).toBe("Labeling & Claims");
    expect(hub!.changes.length).toBeGreaterThanOrEqual(1);
    expect(hub!.guides.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it("three published monitored/verified changes support a topic without a guide", async () => {
    await seedChange({ policyTopics: ["FEES_PAYMENTS"], readiness: "MONITORED" });
    await seedChange({ policyTopics: ["FEES_PAYMENTS"], readiness: "VERIFIED" });
    await seedChange({ policyTopics: ["FEES_PAYMENTS"], readiness: "MONITORED" });
    const hub = await getTopicHub("fees-payments");
    expect(hub).not.toBeNull();
    expect(hub!.label).toBe("Fees & Payments");
    expect(hub!.changes.length).toBeGreaterThanOrEqual(3);
  }, 30000);
});

// ---------- coverage matrix ----------

describe("getCoverageMatrix", () => {
  it("sorts worst coverage first and keeps a non-empty gap on every row", async () => {
    const seedId = nextSeed();
    await seedCapability({
      key: `category:${seedId}`,
      category: "APPAREL_ACCESSORIES",
      readiness: "EXPERIMENTAL",
    });
    const matrix = await getCoverageMatrix(new Date());
    const run = matrix.find((row) => row.key === `category:${seedId}`);
    expect(run).toBeDefined();
    expect(run!.readiness).toBe("EXPERIMENTAL");
    // Every capability row carries a non-empty gap statement. Rows from this
    // run are excluded: one fixture deliberately violates the invariant to
    // prove getHub refuses it, and must not fail the matrix assertion.
    for (const row of matrix.filter((r) => !r.key.startsWith(`category:${runId}`))) {
      expect(row.knownGaps.length).toBeGreaterThan(0);
      for (const gap of row.knownGaps) expect(gap.trim()).not.toBe("");
    }
    const rank = { UNAVAILABLE: 0, STALE: 1, EXPERIMENTAL: 2, MONITORED: 3, VERIFIED: 4 } as const;
    const ranks = matrix.map((row) => rank[row.readiness]);
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);
  }, 60000);
});

// ---------- full-path category page render (real DB) ----------

describe("category hub page", () => {
  it("shows known gaps and freshness for a monitored hub", async () => {
    const seedId = nextSeed();
    const source = await seedSource({ lastOkAt: new Date("2026-08-02T11:40:00Z") });
    await seedCapability({
      key: `category:${seedId}`,
      category: "HOME_KITCHEN",
      readiness: "MONITORED",
      gaps: ["CPSC recall REST disabled"],
      sources: [source],
    });
    await seedChange({
      readiness: "VERIFIED",
      productCategories: ["HOME_KITCHEN"],
      title: "Rendered hub change title",
    });

    render(await CategoryPage({ params: { category: seedId } }));
    expect(screen.getByRole("heading", { level: 1, name: "Home & Kitchen" })).toBeVisible();
    expect(screen.getByText(/Known coverage gaps/i)).toBeVisible();
    expect(screen.getAllByText(/Last successful check/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Last content review/i)).toBeVisible();
    expect(screen.getAllByText("Rendered hub change title").length).toBeGreaterThan(0);
    // Readiness renders its literal word, never colour alone.
    expect(screen.getAllByText("Monitored").length).toBeGreaterThan(0);
  }, 60000);

  it("returns 404 for a category below monitored", async () => {
    const seedId = nextSeed();
    await seedCapability({ key: `category:${seedId}`, category: "PET_SUPPLIES", readiness: "EXPERIMENTAL" });
    await expect(CategoryPage({ params: { category: seedId } })).rejects.toThrow(/NEXT_NOT_FOUND/);
  }, 30000);

  it("returns 404 for an unknown category", async () => {
    await expect(CategoryPage({ params: { category: "grocery" } })).rejects.toThrow(/NEXT_NOT_FOUND/);
  }, 30000);
});

// ---------- Amazon US hub: warning leads the changes list ----------

describe("amazon-us hub page", () => {
  it("leads with the incomplete-policy warning above the changes list", async () => {
    const fixture = {
      slug: "amazon-us",
      kind: "platform" as const,
      title: "Amazon US",
      overview: "Fee schedules, listing requirements and account-health policy.",
      readiness: "MONITORED" as const,
      capabilityKey: "platform:amazon-us",
      summary: "Amazon US seller-policy coverage.",
      ceilingNote: "coverage ceiling — this hub cannot reach Verified",
      warningPanel: {
        heading: "What we can and cannot see here",
        body: "Amazon publishes most seller policy behind a Seller Central login.",
        canSee: "public fee announcements and the public help centre",
        cannotSee: "the authenticated fee schedule and account-health thresholds",
        consequence: "entries here stay Monitored; confirm fee-critical numbers in Seller Central",
      },
      knownGaps: ["No authorized Seller Central policy channel"],
      lastContentReview: "2026-07-12T00:00:00.000Z",
      sources: [],
      slaMinutes: 720,
      lastSuccessfulCheck: "2026-08-02T11:40:00.000Z",
      overdueSources: [],
      changes: [],
      changeCount90d: 0,
      federalRequirements: [],
      platformConsiderations: [],
      recurringTopics: [],
      guides: [],
      demand: null,
      asOf: "2026-08-02T12:00:00.000Z",
    };
    vi.resetModules();
    vi.doMock("../src/public-intelligence/coverage.js", async (importOriginal) => {
      const actual = await importOriginal<typeof import("../src/public-intelligence/coverage.js")>();
      return { ...actual, getHub: async () => fixture };
    });
    const { default: AmazonPage } = await import("../app/(public)/amazon-us/page");
    render(await AmazonPage());

    const warning = screen.getByText("What we can and cannot see here");
    const changesHeading = screen.getByRole("heading", { name: /Changes on Amazon US/i });
    expect(
      warning.compareDocumentPosition(changesHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getAllByText("Monitored").length).toBeGreaterThan(0);
    expect(screen.getByText(/cannot reach Verified/i)).toBeVisible();
    vi.doUnmock("../src/public-intelligence/coverage.js");
    vi.resetModules();
  }, 30000);
});

// ---------- home wiring ----------

describe("home page hub gating", () => {
  it("links only renderable hubs and marks the rest hidden", async () => {
    render(await Home());
    expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
    const whereToLook = screen.getByRole("heading", { name: /Where to look/i });
    expect(whereToLook).toBeVisible();
    // A below-Monitored hub is never a link; it is labelled hidden. The name
    // can also appear bolded inside change impact lines, so match the hub
    // card by link membership rather than by text alone.
    const matrix = await getCoverageMatrix(new Date());
    const amazon = matrix.find((row) => row.key === "platform:amazon-us");
    const amazonNodes = screen.getAllByText("Amazon US");
    const linkedAmazon = amazonNodes.filter((node) => node.closest("a"));
    if (amazon && canRenderHub(amazon)) {
      expect(linkedAmazon.length).toBeGreaterThan(0);
    } else {
      expect(linkedAmazon.length).toBe(0);
      expect(screen.getByText(/Amazon US — below Monitored, hidden/i)).toBeVisible();
    }
  }, 60000);

  it("keeps exactly one h1 and a live coverage strip", async () => {
    render(await Home());
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("status", { name: /coverage status/i })).toBeVisible();
  }, 60000);
});
