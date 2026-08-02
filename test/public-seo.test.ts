import { afterEach, describe, expect, it, vi } from "vitest";

// Public Intelligence Task 3 — SEO & sitemap contract (plan Step 4).
// Node environment; the coverage read model is mocked so sitemap/metadata
// assertions are deterministic regardless of the branch's current data.

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
    key: "platform:amazon-us",
    kind: "platform" as const,
    label: "Amazon US",
    readiness: "UNAVAILABLE" as const,
    summary: "Amazon seller-policy coverage.",
    knownGaps: ["Login-walled policy pages"],
    slaMinutes: null,
    lastSuccessfulCheck: null,
    sourcesWithinSla: 0,
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
    key: "category:pet-supplies",
    kind: "category" as const,
    label: "Pet Supplies",
    readiness: "EXPERIMENTAL" as const,
    summary: "Pet supplies coverage.",
    knownGaps: ["BSR disabled"],
    slaMinutes: 720,
    lastSuccessfulCheck: null,
    sourcesWithinSla: 0,
    sourceCount: 1,
    overdueCount: 1,
    lastContentReview: null,
  },
];

const TOPICS = [
  { topic: "IMPORT_CUSTOMS" as const, slug: "import-customs", label: "Import & Customs", changeCount: 4, guideCount: 0, supported: true },
  { topic: "LISTING_ACCOUNT_HEALTH" as const, slug: "listing-account-health", label: "Listing & Account Health", changeCount: 1, guideCount: 0, supported: false },
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
}

afterEach(() => {
  vi.doUnmock("../src/public-intelligence/coverage.js");
  vi.doUnmock("../src/daily/db.js");
  vi.resetModules();
});

describe("sitemap eligibility", () => {
  it("includes renderable hubs, supported topics and /coverage only", async () => {
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

    // Below-Monitored hubs and unsupported topics stay out.
    expect(urls.some((u) => u.endsWith("/amazon-us"))).toBe(false);
    expect(urls.some((u) => u.endsWith("/categories/pet-supplies"))).toBe(false);
    expect(urls.some((u) => u.endsWith("/topics/listing-account-health"))).toBe(false);
  });
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
      expect(m.title).toContain(m.path === "/us" ? "US Market" : m.path === "/shopify-us" ? "Shopify US" : "Consumer Electronics");
      expect(m.canonical).toMatch(new RegExp(`${m.path.replace(/[/-]/g, "\\$&")}$`));
      expect(m.description.length).toBeGreaterThan(20);
    }
  });

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
  });
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
  });
});
