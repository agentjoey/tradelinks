import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalBase } from "../src/public-intelligence/site-url.js";

// Public Intelligence Task 3 — SEO & sitemap contract (plan Step 4), extended
// by Task 8 (Debt 2 + distribution surfaces).
//
// Node environment; every DB touchpoint is mocked so the assertions are
// deterministic regardless of the branch's current data — and so the suite
// does ZERO network I/O. Debt 2 root cause: the sitemap test used to hit the
// real Neon branch through prisma.briefing.findMany and
// prisma.canonicalChangeVersion.findMany (the latter behind sitemap.ts's own
// 4.5s budget race), so a cold/polluted branch pushed the test past vitest's
// default 5000ms budget (reviewer measured 5008/5010/5008ms). Mocking the
// prisma client removes the fetch entirely; the explicit budget below now
// carries real headroom (measured margin is recorded in the Task 8 report).
const SEO_TEST_BUDGET_MS = 10_000;

const MATRIX = [
  {
    key: "market:us",
    kind: "market" as const,
    label: "US Market",
    readiness: "MONITORED" as const,
    summary: "US federal coverage.",
    knownGaps: ["No state-level coverage"],
    slaMinutes: 360,
    lastSuccessfulCheck: "2026-08-02T11:00:00.000Z",
    sourcesWithinSla: 3,
    sourceCount: 4,
    overdueCount: 1,
    lastContentReview: "2026-07-20T00:00:00.000Z",
  },
  {
    // Debt 1 regrade (owner decision 4, 2026-08-02): Amazon US is MONITORED,
    // so its hub renders and belongs in the sitemap.
    key: "platform:amazon-us",
    kind: "platform" as const,
    label: "Amazon US",
    readiness: "MONITORED" as const,
    summary: "Amazon seller-policy coverage.",
    knownGaps: ["Login-walled policy pages"],
    slaMinutes: 720,
    lastSuccessfulCheck: "2026-08-02T11:00:00.000Z",
    sourcesWithinSla: 2,
    sourceCount: 2,
    overdueCount: 0,
    lastContentReview: null,
  },
  {
    key: "platform:shopify-us",
    kind: "platform" as const,
    label: "Shopify US",
    readiness: "MONITORED" as const,
    summary: "Shopify merchant terms.",
    knownGaps: ["Changelog only"],
    slaMinutes: 720,
    lastSuccessfulCheck: "2026-08-02T10:00:00.000Z",
    sourcesWithinSla: 1,
    sourceCount: 1,
    overdueCount: 0,
    lastContentReview: "2026-07-20T00:00:00.000Z",
  },
  {
    key: "category:consumer-electronics",
    kind: "category" as const,
    label: "Consumer Electronics",
    readiness: "VERIFIED" as const,
    summary: "Electronics coverage.",
    knownGaps: ["Recall REST disabled"],
    slaMinutes: 360,
    lastSuccessfulCheck: "2026-08-02T11:30:00.000Z",
    sourcesWithinSla: 2,
    sourceCount: 2,
    overdueCount: 0,
    lastContentReview: "2026-07-20T00:00:00.000Z",
  },
  {
    // Test-seeded below-Monitored capability. The plan's example hard-coded a
    // real category (pet-supplies) as excluded, but all six production
    // category capabilities are MONITORED — the exclusion invariant is
    // asserted against THIS synthetic fixture instead, so the test cannot
    // drift with production grades.
    key: "category:fixture-below-monitored",
    kind: "category" as const,
    label: "Fixture Below Monitored",
    readiness: "UNAVAILABLE" as const,
    summary: "Synthetic below-Monitored capability for the exclusion assertion.",
    knownGaps: ["No lawful public route (synthetic)"],
    slaMinutes: null,
    lastSuccessfulCheck: null,
    sourcesWithinSla: 0,
    sourceCount: 1,
    overdueCount: 0,
    lastContentReview: null,
  },
];

const TOPICS = [
  { topic: "IMPORT_CUSTOMS" as const, slug: "import-customs", label: "Import & Customs", changeCount: 4, guideCount: 0, supported: true },
  { topic: "LISTING_ACCOUNT_HEALTH" as const, slug: "listing-account-health", label: "Listing & Account Health", changeCount: 1, guideCount: 0, supported: false },
];

// DB fixtures the mocked prisma serves. Each carries a PUBLISHED row that
// must appear and a DRAFT/non-qualifying row that must not — the mocks honor
// the query's editorialStatus filter, so a regression that drops the filter
// surfaces here.
const BRIEFING_ROWS = [
  { kind: "WEEKLY", periodKey: "2026-W30", publishedAt: new Date("2026-07-27T00:00:00Z"), editorialStatus: "PUBLISHED" },
  { kind: "WEEKLY", periodKey: "2026-W29", publishedAt: null, editorialStatus: "DRAFT" },
];

const CHANGE_ROWS = [
  { reviewedAt: new Date("2026-07-28T00:00:00Z"), canonicalChange: { slug: "published-change" } },
];

const GUIDE_ROWS = [
  {
    slug: "published-guide",
    title: "Published guide",
    summary: "A published guide summary for sitemap coverage.",
    readiness: "MONITORED",
    lastReviewedAt: new Date("2026-07-20T00:00:00Z"),
    editorialStatus: "PUBLISHED",
  },
  {
    slug: "draft-guide",
    title: "Draft guide",
    summary: "A draft guide that must never be listed.",
    readiness: "MONITORED",
    lastReviewedAt: new Date("2026-07-21T00:00:00Z"),
    editorialStatus: "DRAFT",
  },
];

function hubFor(slug: string) {
  const row = MATRIX.find((m) => m.key.endsWith(`:${slug}`) || (m.key === "market:us" && slug === "us"));
  if (!row) return null;
  return {
    slug,
    kind: row.kind === "category" ? ("category" as const) : row.kind === "platform" ? ("platform" as const) : ("market" as const),
    title: row.label,
    overview: `${row.label} overview sentence for metadata uniqueness.`,
    readiness: row.readiness,
  };
}

function mockCoverage() {
  vi.resetModules();
  vi.doMock("../src/public-intelligence/coverage.js", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../src/public-intelligence/coverage.js")>();
    return {
      ...actual,
      getCoverageMatrix: async () => MATRIX,
      listTopicSummaries: async () => TOPICS,
      getHub: async (slug: string) => hubFor(slug),
      getTopicHub: async (slug: string) => {
        const t = TOPICS.find((topic) => topic.slug === slug && topic.supported);
        return t ? { topic: t.topic, slug: t.slug, label: t.label } : null;
      },
    };
  });
  vi.doMock("../src/daily/db.js", () => ({ getPublishedNotes: async () => [] }));
  vi.doMock("../src/db/client.js", () => ({
    prisma: {
      briefing: {
        findMany: async (args?: { where?: { editorialStatus?: string } }) =>
          BRIEFING_ROWS.filter((r) => !args?.where?.editorialStatus || r.editorialStatus === args.where.editorialStatus),
      },
      canonicalChangeVersion: {
        findMany: async () => CHANGE_ROWS,
      },
      guide: {
        findMany: async (args?: { where?: { editorialStatus?: string } }) =>
          GUIDE_ROWS.filter((r) => !args?.where?.editorialStatus || r.editorialStatus === args.where.editorialStatus),
      },
    },
  }));
}

afterEach(() => {
  vi.doUnmock("../src/public-intelligence/coverage.js");
  vi.doUnmock("../src/daily/db.js");
  vi.doUnmock("../src/db/client.js");
  vi.resetModules();
});

describe("sitemap eligibility", () => {
  it("includes renderable hubs, supported topics, published changes/briefings/guides and /coverage only", async () => {
    mockCoverage();
    const { default: sitemap } = await import("../app/sitemap");
    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls.some((u) => u.endsWith("/coverage"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/us"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/shopify-us"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/categories"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/categories/consumer-electronics"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/topics"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/topics/import-customs"))).toBe(true);
    // Debt 1: the regraded Monitored hub is indexable.
    expect(urls.some((u) => u.endsWith("/amazon-us"))).toBe(true);
    // Published distribution surfaces.
    expect(urls.some((u) => u.endsWith("/changes/published-change"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/briefings/weekly/2026/30"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/guides/published-guide"))).toBe(true);
    expect(urls.some((u) => u.endsWith("/guides"))).toBe(true);

    // Below-Monitored hubs (the synthetic fixture, not a production category
    // name), unsupported topics, drafts and empty periods stay out.
    expect(urls.some((u) => u.endsWith("/categories/fixture-below-monitored"))).toBe(false);
    expect(urls.some((u) => u.endsWith("/topics/listing-account-health"))).toBe(false);
    expect(urls.some((u) => u.includes("draft-guide"))).toBe(false);
    expect(urls.some((u) => u.includes("2026/29"))).toBe(false);
    // Filter URLs and private routes never appear.
    expect(urls.some((u) => u.includes("?"))).toBe(false);
    expect(urls.some((u) => u.includes("/my/") || u.endsWith("/my"))).toBe(false);
    expect(urls.some((u) => u.includes("/admin"))).toBe(false);
  }, SEO_TEST_BUDGET_MS);

  it("omits the /guides index while zero guides are published (honest absence)", async () => {
    mockCoverage();
    vi.doMock("../src/db/client.js", () => ({
      prisma: {
        briefing: { findMany: async () => [] },
        canonicalChangeVersion: { findMany: async () => [] },
        guide: { findMany: async () => [] },
      },
    }));
    const { default: sitemap } = await import("../app/sitemap");
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls.some((u) => u.endsWith("/guides"))).toBe(false);
    expect(urls.some((u) => u.includes("/guides/"))).toBe(false);
  }, SEO_TEST_BUDGET_MS);
});

describe("robots policy", () => {
  it("allows public pages and the public machine surfaces, blocks private and non-public API paths", async () => {
    mockCoverage();
    const { default: robots } = await import("../app/robots");
    const policy = robots();
    const rules = Array.isArray(policy.rules) ? policy.rules : [policy.rules];
    const wildcard = rules.find((r) => r.userAgent === "*");
    expect(wildcard).toBeDefined();
    const allow = ([] as string[]).concat(wildcard!.allow as string | string[]);
    const disallow = ([] as string[]).concat(wildcard!.disallow as string | string[]);

    expect(allow).toContain("/");
    // Task 7 shipped both as deliberately public machine surfaces — they stay
    // crawlable (decision + reasoning in the Task 8 report).
    expect(allow).toContain("/api/v1/");
    expect(allow).toContain("/openapi.json");
    for (const path of ["/admin", "/auth", "/my", "/onboarding/preview", "/api"]) {
      expect(disallow).toContain(path);
    }
    expect(policy.sitemap).toMatch(/\/sitemap\.xml$/);
  }, SEO_TEST_BUDGET_MS);
});

describe("hub metadata", () => {
  it("gives every hub a unique title and description plus a canonical URL", async () => {
    mockCoverage();
    const metas: Array<{ path: string; title: string; description: string; canonical: string }> = [];

    const us = await import("../app/(public)/us/page");
    const usMeta = await us.generateMetadata!();
    metas.push({
      path: "/us",
      title: String(usMeta.title),
      description: String(usMeta.description),
      canonical: String(usMeta.alternates?.canonical),
    });

    const amazon = await import("../app/(public)/amazon-us/page");
    const amazonMeta = await amazon.generateMetadata!();
    metas.push({
      path: "/amazon-us",
      title: String(amazonMeta.title),
      description: String(amazonMeta.description),
      canonical: String(amazonMeta.alternates?.canonical),
    });

    const shopify = await import("../app/(public)/shopify-us/page");
    const shopifyMeta = await shopify.generateMetadata!();
    metas.push({
      path: "/shopify-us",
      title: String(shopifyMeta.title),
      description: String(shopifyMeta.description),
      canonical: String(shopifyMeta.alternates?.canonical),
    });

    const category = await import("../app/(public)/categories/[category]/page");
    const catMeta = await category.generateMetadata!(
      { params: { category: "consumer-electronics" } } as any,
    );
    metas.push({
      path: "/categories/consumer-electronics",
      title: String(catMeta.title),
      description: String(catMeta.description),
      canonical: String(catMeta.alternates?.canonical),
    });

    const titles = metas.map((m) => m.title);
    const descriptions = metas.map((m) => m.description);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const m of metas) {
      expect(m.title).toContain(
        m.path === "/us"
          ? "US Market"
          : m.path === "/amazon-us"
            ? "Amazon US"
            : m.path === "/shopify-us"
              ? "Shopify US"
              : "Consumer Electronics",
      );
      expect(m.canonical).toMatch(new RegExp(`${m.path.replace(/[/-]/g, "\\$&")}$`));
      expect(m.description.length).toBeGreaterThan(20);
    }
  }, SEO_TEST_BUDGET_MS);

  it("gives index and coverage pages distinct static metadata", async () => {
    mockCoverage();
    const categories = await import("../app/(public)/categories/page");
    const topics = await import("../app/(public)/topics/page");
    const coverage = await import("../app/(public)/coverage/page");
    const titles = [categories.metadata, topics.metadata, coverage.metadata].map((m: any) => String(m.title));
    expect(new Set(titles).size).toBe(3);
    for (const m of [categories.metadata, topics.metadata, coverage.metadata] as any[]) {
      expect(String(m.description).length).toBeGreaterThan(20);
      expect(String(m.alternates?.canonical)).toMatch(/^https?:\/\//);
    }
  }, SEO_TEST_BUDGET_MS);
});

describe("structured data", () => {
  it("change-detail JSON-LD is an Article + BreadcrumbList carrying only supported claims", async () => {
    mockCoverage();
    const { buildChangeJsonLd } = await import("../app/(public)/changes/[slug]/page");
    const detail = {
      record: {
        slug: "published-change",
        title: "A published change",
        summary: "A concise public summary.",
        sourcePublishedAt: "2026-07-15T00:00:00.000Z",
        effectiveAt: "2026-08-01T00:00:00.000Z",
        reviewedAt: "2026-07-28T00:00:00.000Z",
        readiness: "VERIFIED",
        permalink: `${canonicalBase()}/changes/published-change`,
      },
    };
    const graph = buildChangeJsonLd(detail as any) as Array<Record<string, unknown>>;
    const article = graph.find((node) => node["@type"] === "Article");
    const breadcrumbs = graph.find((node) => node["@type"] === "BreadcrumbList");
    expect(article).toBeDefined();
    expect(breadcrumbs).toBeDefined();
    expect(article!.headline).toBe("A published change");
    expect(article!.datePublished).toBe("2026-07-15T00:00:00.000Z");
    expect(article!.mainEntityOfPage).toBe(`${canonicalBase()}/changes/published-change`);
    // Readiness is a coverage statement, never a quality or endorsement
    // signal: no rating/review fields, and the raw readiness claim does not
    // leak into structured data at all.
    const serialized = JSON.stringify(graph);
    expect(serialized).not.toContain("aggregateRating");
    expect(serialized).not.toContain("reviewRating");
    expect(serialized).not.toMatch(/"readiness"/i);
    expect(serialized).not.toContain("VERIFIED");
  }, SEO_TEST_BUDGET_MS);
});

describe("cache contract", () => {
  it("every hub, index and coverage page declares one-hour revalidation", async () => {
    mockCoverage();
    const modules = [
      "../app/(public)/page",
      "../app/(public)/us/page",
      "../app/(public)/amazon-us/page",
      "../app/(public)/shopify-us/page",
      "../app/(public)/categories/page",
      "../app/(public)/categories/[category]/page",
      "../app/(public)/topics/page",
      "../app/(public)/topics/[topic]/page",
      "../app/(public)/coverage/page",
    ];
    const { PUBLIC_CACHE } = await import("../src/public-intelligence/cache.js");
    expect(PUBLIC_CACHE.canonicalChangeRevalidate).toBe(3600);
    for (const path of modules) {
      const mod = await import(path);
      expect(mod.revalidate, `${path} revalidate`).toBe(PUBLIC_CACHE.canonicalChangeRevalidate);
    }
  }, SEO_TEST_BUDGET_MS);
});
