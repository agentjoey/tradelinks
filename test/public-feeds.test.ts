import { PrismaClient } from "@prisma/client";
// @ts-expect-error jsdom ships no type declarations; DOMParser is used here
// strictly as a real XML parser for feed assertions.
import { JSDOM } from "jsdom";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { briefingPath } from "../src/public-intelligence/briefings.js";
import { PUBLIC_CACHE } from "../src/public-intelligence/cache.js";
import {
  FEED_MAX_ITEMS,
  feedChannel,
  renderBriefingsFeedXml,
  renderChangesFeedXml,
  renderPublicFeed,
  resolveCategoryScope,
  resolvePlatformScope,
} from "../src/public-intelligence/feeds.js";
import { serializeCanonicalVersion } from "../src/public-intelligence/serialize.js";
import type { CanonicalPublicRecord } from "../src/public-intelligence/types.js";
import { GET as legacyFeedGET } from "../app/feed.xml/route.js";
import { GET as briefingsFeedGET } from "../app/feeds/briefings.xml/route.js";
import { GET as categoryFeedGET } from "../app/feeds/categories/[category]/route.js";
import { GET as changesFeedGET } from "../app/feeds/changes.xml/route.js";
import { GET as platformFeedGET } from "../app/feeds/platforms/[platform]/route.js";
import { canonicalBase } from "../src/public-intelligence/site-url.js";

// Canonical scoped feeds — the first surface where the channel-consistency
// invariant is asserted over RENDERED XML, not projection objects. Every
// versionId/fingerprint/permalink in the XML string must be byte-identical
// to what serializeCanonicalVersion produced for the same record.
//
// Requires DATABASE_URL pointing at an isolated branch with migration 0012+.
//
// Fixture strategy: all rows are written in ONE beforeAll burst and carry a
// far-future reviewedAt so they always sort into every feed's top-50 — feeds
// are unscoped top-N listings, and this keeps the suite independent of any
// rows left behind by earlier files on this worker's schema. All ids are
// run-scoped and cleaned in FK-safe order in afterAll.

const prisma = new PrismaClient();

const runId = `testpf-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let seedSeq = 0;

function nextSeed() {
  return `${runId}-${++seedSeq}`;
}

const FULL_TEXT_MARKERS: string[] = [];

type SeedOverrides = {
  title?: string;
  summary?: string;
  platforms?: string[];
  productCategories?: string[];
  readiness?: "VERIFIED" | "MONITORED";
};

async function seedPublicVersion(overrides: SeedOverrides = {}) {
  const seedId = nextSeed();
  const fullTextMarker = `THIRD-PARTY FULL TEXT ${seedId} — licensed scraper output`;
  FULL_TEXT_MARKERS.push(fullTextMarker);
  const source = await prisma.source.create({
    data: {
      id: `${seedId}-source`,
      name: "Feed Test Source",
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
      title: fullTextMarker,
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
      title: overrides.title ?? "Feed test change",
      summary: overrides.summary ?? "A feed test summary",
      signalType: "REGULATORY",
      regions: ["north_america"],
      platforms: (overrides.platforms ?? ["AMAZON"]) as any,
      operatingStages: ["PREPARING_TO_LAUNCH"],
      productCategories: (overrides.productCategories ?? ["PET_SUPPLIES"]) as any,
      riskAttributes: ["BATTERY"],
      policyTopics: ["IMPORT_CUSTOMS"],
      sourcePublishedAt: new Date("2026-07-15T00:00:00Z"),
      effectiveAt: new Date("2026-08-01T00:00:00Z"),
      urgency: 85,
      readiness: overrides.readiness ?? "VERIFIED",
      generalImpact: "New import documentation required",
      generalActionTemplate: "Verify your customs broker has updated forms",
      editorialStatus: "PUBLISHED",
      reviewedAt: new Date("2099-01-01T00:00:00Z"),
      reviewedBy: "reviewer-feed-1",
    },
  });

  await prisma.evidenceRecord.create({
    data: {
      changeVersionId: version.id,
      sourceId: source.id,
      sourceItemId: item.id,
      url: `https://official.example/${seedId}/rule?a=1&b=2`,
      role: "PRIMARY_OFFICIAL",
      authorityLevel: "GOVERNMENT_OFFICIAL",
      publishedAt: new Date("2026-07-10T00:00:00Z"),
      access: "PUBLIC",
      licenseNote: "",
      excerpt: fullTextMarker,
      normalizedSummary: "Normalized official summary, safe to quote",
      contentHash: `${seedId}-ch`,
      fetchedAt: new Date("2026-07-18T00:00:00Z"),
      reviewedAt: new Date("2026-07-19T00:00:00Z"),
    },
  });

  const fullVersion = await prisma.canonicalChangeVersion.findUniqueOrThrow({
    where: { id: version.id },
    include: {
      canonicalChange: { include: { versions: { orderBy: { version: "asc" } } } },
      evidence: { include: { source: true }, orderBy: [{ role: "asc" }, { publishedAt: "desc" }] },
    },
  });

  return serializeCanonicalVersion(fullVersion as any);
}

const BRIEFING_PERIOD_KEY = `${runId}-W07`;

// Seeded once, consumed by the whole suite (see fixture strategy note above).
let recAmazonPets: CanonicalPublicRecord;
let recHostile: CanonicalPublicRecord;
let recShopifyBeauty: CanonicalPublicRecord;
let recAmazonHome: CanonicalPublicRecord;
let recMonitoredId: string;

beforeAll(async () => {
  recAmazonPets = await seedPublicVersion({ platforms: ["AMAZON"], productCategories: ["PET_SUPPLIES"] });
  recHostile = await seedPublicVersion({
    title: `Cats & "Dogs" <Deluxe> '26 Sale`,
    summary: `Summary with a > b, "quotes", 'apostrophes' & ampersands\x0B plus a control char`,
    platforms: ["AMAZON"],
    productCategories: ["PET_SUPPLIES"],
  });
  recShopifyBeauty = await seedPublicVersion({ platforms: ["SHOPIFY"], productCategories: ["BEAUTY_PERSONAL_CARE"] });
  recAmazonHome = await seedPublicVersion({ platforms: ["AMAZON"], productCategories: ["HOME_KITCHEN"] });
  recMonitoredId = (await seedPublicVersion({ readiness: "MONITORED" })).versionId;

  await prisma.briefing.create({
    data: {
      kind: "WEEKLY",
      periodKey: BRIEFING_PERIOD_KEY,
      slug: `${runId}-weekly`,
      title: "Weekly briefing — feed test",
      summary: "A published briefing for the feed test",
      bodyMarkdown: "body",
      readiness: "VERIFIED",
      editorialStatus: "PUBLISHED",
      fingerprint: `${runId}-bfp`,
      publishedAt: new Date("2026-07-25T00:00:00Z"),
      reviewedAt: new Date("2026-07-25T00:00:00Z"),
      reviewedBy: "reviewer-feed-1",
    },
  });
  await prisma.briefing.create({
    data: {
      kind: "MONTHLY",
      periodKey: `${runId}-M07`,
      slug: `${runId}-draft-monthly`,
      title: "DRAFT briefing must not appear",
      summary: "draft",
      bodyMarkdown: "draft",
      readiness: "MONITORED",
      editorialStatus: "DRAFT",
      fingerprint: `${runId}-dfp`,
    },
  });
}, 180000);

afterAll(async () => {
  await prisma.briefing.deleteMany({ where: { slug: { startsWith: runId } } });
  await prisma.evidenceRecord.deleteMany({ where: { changeVersion: { canonicalChange: { slug: { startsWith: runId } } } } });
  await prisma.canonicalChangeVersion.deleteMany({ where: { canonicalChange: { slug: { startsWith: runId } } } });
  await prisma.canonicalChange.deleteMany({ where: { slug: { startsWith: runId } } });
  await prisma.evidenceClusterMember.deleteMany({ where: { cluster: { fingerprint: { startsWith: runId } } } });
  await prisma.evidenceCluster.deleteMany({ where: { fingerprint: { startsWith: runId } } });
  await prisma.item.deleteMany({ where: { sourceId: { startsWith: runId } } });
  await prisma.source.deleteMany({ where: { id: { startsWith: runId } } });
  await prisma.$disconnect();
}, 120000);

// ---------- helpers ----------

function parseXml(xml: string): Document {
  const doc = new (new JSDOM().window.DOMParser)().parseFromString(xml, "application/xml");
  const error = doc.querySelector("parsererror");
  expect(error, `feed must parse as XML: ${error?.textContent?.slice(0, 200)}`).toBeNull();
  return doc;
}

function findItem(doc: Document, guid: string): Element {
  const items = [...doc.querySelectorAll("item")];
  const item = items.find((i) => i.querySelector("guid")?.textContent === guid);
  expect(item, `feed must contain an item with guid ${guid}`).toBeDefined();
  return item!;
}

function fakeRecord(i: number): CanonicalPublicRecord {
  return {
    id: `c-${i}`,
    slug: `fake-${i}`,
    versionId: `v-${i}`,
    version: 1,
    fingerprint: `fp-${i}`,
    title: `Fake ${i}`,
    summary: "Fake summary",
    signalType: "REGULATORY",
    market: "US",
    regions: [],
    platforms: ["AMAZON"],
    operatingStages: [],
    productCategories: ["PET_SUPPLIES"],
    riskAttributes: [],
    policyTopics: [],
    sourcePublishedAt: "2026-07-15T00:00:00.000Z",
    effectiveAt: null,
    urgency: 50,
    readiness: "VERIFIED",
    generalImpact: "",
    generalActionTemplate: null,
    permalink: `${canonicalBase()}/changes/fake-${i}`,
    reviewedAt: "2026-07-20T00:00:00.000Z",
    evidence: [],
    correctionHistory: [],
  };
}

// ---------- rendered-XML channel consistency (the core invariant) ----------

describe("rendered XML is byte-identical to the serializer output", () => {
  it("guid, link and fingerprint in the XML string equal the serializer's, exactly", async () => {
    const res = await renderPublicFeed({ kind: "changes" });
    const xml = await res.text();

    // Over the rendered STRING, not a projection object.
    expect(xml).toContain(`<guid isPermaLink="false">${recAmazonPets.versionId}</guid>`);
    expect(xml).toContain(`<link>${recAmazonPets.permalink}</link>`);
    expect(xml).toContain(`<category domain="fingerprint">${recAmazonPets.fingerprint}</category>`);

    // And the same values survive a real parse.
    const doc = parseXml(xml);
    const item = findItem(doc, recAmazonPets.versionId);
    expect(item.querySelector("link")!.textContent).toBe(recAmazonPets.permalink);
    expect(item.querySelector('category[domain="fingerprint"]')!.textContent).toBe(recAmazonPets.fingerprint);
  }, 60000);

  it("renders every item field the contract requires", async () => {
    const res = await renderPublicFeed({ kind: "changes" });
    const doc = parseXml(await res.text());
    const item = findItem(doc, recAmazonPets.versionId);

    expect(item.querySelector("title")!.textContent).toBe(recAmazonPets.title);
    expect(item.querySelector("guid")!.getAttribute("isPermaLink")).toBe("false");
    expect(item.querySelector("pubDate")!.textContent).toBe(new Date(recAmazonPets.sourcePublishedAt).toUTCString());
    const domains = [...item.querySelectorAll("category")].map((c) => `${c.getAttribute("domain")}=${c.textContent}`);
    expect(domains).toContain("market=US");
    expect(domains).toContain("readiness=VERIFIED");
    expect(domains).toContain("platform=AMAZON");
    expect(domains).toContain("product-category=PET_SUPPLIES");
    expect(item.querySelector("description")!.textContent).toContain("Effective: 2026-08-01");
  }, 60000);
});

// ---------- XML correctness with a real parser ----------

describe("XML escaping", () => {
  it("round-trips a title containing &, <, a straight quote and an apostrophe", async () => {
    const res = await renderPublicFeed({ kind: "changes" });
    const xml = await res.text();

    expect(xml).toContain("&amp;");
    expect(xml).toContain("&lt;");
    expect(xml).toContain("&quot;");
    expect(xml).toContain("&apos;");

    // A real parser must accept it, and the title must round-trip byte-identically.
    const doc = parseXml(xml);
    const item = findItem(doc, recHostile.versionId);
    expect(item.querySelector("title")!.textContent).toBe(recHostile.title);
    expect(item.querySelector("description")!.textContent).toContain(
      `Summary with a > b, "quotes", 'apostrophes' & ampersands`,
    );
  }, 60000);
});

// ---------- feed contract rules ----------

describe("feed contract", () => {
  it("serves RSS content type and cache headers derived from PUBLIC_CACHE only", async () => {
    const res = await renderPublicFeed({ kind: "changes" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/rss+xml; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe(
      `public, s-maxage=${PUBLIC_CACHE.liveChangesRevalidate}, stale-while-revalidate=${PUBLIC_CACHE.canonicalChangeRevalidate}`,
    );
  }, 60000);

  it("caps a feed at 50 items", () => {
    const records = Array.from({ length: FEED_MAX_ITEMS + 5 }, (_, i) => fakeRecord(i));
    const xml = renderChangesFeedXml(
      { title: "t", link: `${canonicalBase()}/changes`, self: `${canonicalBase()}/feeds/changes.xml`, description: "d" },
      records,
    );
    const doc = parseXml(xml);
    expect(doc.querySelectorAll("item").length).toBe(50);
    expect(xml).toContain(`<guid isPermaLink="false">v-49</guid>`);
    expect(xml).not.toContain("v-50");
  });

  it("caps the briefings feed at 50 items", () => {
    const briefings = Array.from({ length: FEED_MAX_ITEMS + 5 }, (_, i) => ({
      kind: "WEEKLY" as const,
      periodKey: `2026-W${String(i + 1).padStart(2, "0")}`,
      slug: `fake-briefing-${i}`,
      title: `Briefing ${i}`,
      summary: "s",
      readiness: "VERIFIED" as const,
      publishedAt: "2026-07-25T00:00:00.000Z",
      entryCount: 1,
      path: `/briefings/weekly/2026/${i + 1}`,
    }));
    const xml = renderBriefingsFeedXml(
      { title: "t", link: `${canonicalBase()}/briefings`, self: `${canonicalBase()}/feeds/briefings.xml`, description: "d" },
      briefings,
    );
    const doc = parseXml(xml);
    expect(doc.querySelectorAll("item").length).toBe(50);
    expect(xml).not.toContain("fake-briefing-50");
  });

  it("change feeds never include monitored-pool records", async () => {
    const res = await renderPublicFeed({ kind: "changes" });
    const xml = await res.text();
    expect(xml).not.toContain(recMonitoredId);
  }, 60000);

  it("channel carries title, link, atom self link and language", () => {
    const xml = renderChangesFeedXml(feedChannel({ kind: "changes" }), []);
    const doc = parseXml(xml);
    const channel = doc.querySelector("channel")!;
    expect(channel.querySelector(":scope > title")!.textContent).toContain("TradeLinks");
    expect(channel.querySelector(":scope > link")!.textContent).toBe(`${canonicalBase()}/changes`);
    const self = channel.querySelector("[rel='self']")!;
    expect(self.getAttribute("href")).toBe(`${canonicalBase()}/feeds/changes.xml`);
    expect(channel.querySelector("language")!.textContent).toBe("en-us");
  });

  it("quotes evidence links and normalized data, never third-party full text or private fields", async () => {
    const res = await renderPublicFeed({ kind: "changes" });
    const xml = await res.text();

    expect(xml).toContain(recAmazonPets.evidence[0]!.url.replace(/&/g, "&amp;"));
    for (const marker of FULL_TEXT_MARKERS) {
      expect(xml).not.toContain(marker);
    }
    expect(xml).not.toContain("profileId");
    expect(xml).not.toContain("relevanceScore");
    expect(xml).not.toContain("reviewer-feed-1");
  }, 60000);
});

// ---------- scoped feeds ----------

describe("scoped feeds", () => {
  it("platform scope includes only that platform's records", async () => {
    const res = await renderPublicFeed({ kind: "platform", slug: "amazon-us", platform: "AMAZON" });
    const xml = await res.text();
    const doc = parseXml(xml);

    expect(xml).toContain(`<guid isPermaLink="false">${recAmazonPets.versionId}</guid>`);
    expect(xml).not.toContain(recShopifyBeauty.versionId);
    for (const item of doc.querySelectorAll("item")) {
      const platforms = [...item.querySelectorAll('category[domain="platform"]')].map((c) => c.textContent);
      expect(platforms).toContain("AMAZON");
    }
  }, 60000);

  it("category scope includes only that category's records", async () => {
    const res = await renderPublicFeed({ kind: "category", slug: "pet-supplies", category: "PET_SUPPLIES" });
    const xml = await res.text();
    const doc = parseXml(xml);

    expect(xml).toContain(`<guid isPermaLink="false">${recAmazonPets.versionId}</guid>`);
    expect(xml).not.toContain(recAmazonHome.versionId);
    for (const item of doc.querySelectorAll("item")) {
      const categories = [...item.querySelectorAll('category[domain="product-category"]')].map((c) => c.textContent);
      expect(categories).toContain("PET_SUPPLIES");
    }
  }, 60000);

  it("an empty feed for a scope that exists is valid XML with zero items", () => {
    const xml = renderChangesFeedXml(
      { title: "t", link: `${canonicalBase()}/changes`, self: `${canonicalBase()}/feeds/changes.xml`, description: "d" },
      [],
    );
    const doc = parseXml(xml);
    expect(doc.querySelectorAll("item").length).toBe(0);
  });
});

// ---------- scope resolution (the .xml suffix is required) ----------

describe("scope resolution", () => {
  it("resolves known platform scopes only with the .xml suffix", () => {
    expect(resolvePlatformScope("amazon-us.xml")).toEqual({ kind: "platform", slug: "amazon-us", platform: "AMAZON" });
    expect(resolvePlatformScope("shopify-us.xml")).toEqual({ kind: "platform", slug: "shopify-us", platform: "SHOPIFY" });
    expect(resolvePlatformScope("amazon-us")).toBeNull();
    expect(resolvePlatformScope("not-a-platform.xml")).toBeNull();
    expect(resolvePlatformScope("")).toBeNull();
  });

  it("resolves public category scopes only with the .xml suffix", () => {
    expect(resolveCategoryScope("pet-supplies.xml")).toEqual({ kind: "category", slug: "pet-supplies", category: "PET_SUPPLIES" });
    expect(resolveCategoryScope("pet-supplies")).toBeNull();
    // A taxonomy category that is not one of the six public hubs is not a public scope.
    expect(resolveCategoryScope("health-supplements.xml")).toBeNull();
    expect(resolveCategoryScope("not-a-category.xml")).toBeNull();
    // Case variants normalize to the canonical slug rather than emitting a
    // channel link the case-sensitive page route would 404.
    expect(resolveCategoryScope("PET-SUPPLIES.xml")).toEqual({ kind: "category", slug: "pet-supplies", category: "PET_SUPPLIES" });
  });
});

// ---------- route handlers (status codes the amendment pins) ----------

describe("route handlers", () => {
  it("changes.xml returns 200 RSS", async () => {
    const res = await changesFeedGET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/rss+xml; charset=utf-8");
    parseXml(await res.text());
  }, 60000);

  it("platform route: 200 with suffix, 404 without it or for unknown scopes", async () => {
    const ok = await platformFeedGET(new Request("http://localhost/feeds/platforms/amazon-us.xml"), {
      params: { platform: "amazon-us.xml" },
    });
    expect(ok.status).toBe(200);
    parseXml(await ok.text());

    const noSuffix = await platformFeedGET(new Request("http://localhost/feeds/platforms/amazon-us"), {
      params: { platform: "amazon-us" },
    });
    expect(noSuffix.status).toBe(404);

    const unknown = await platformFeedGET(new Request("http://localhost/feeds/platforms/not-a-platform.xml"), {
      params: { platform: "not-a-platform.xml" },
    });
    expect(unknown.status).toBe(404);
  }, 60000);

  it("category route: 200 with suffix, 404 without it", async () => {
    const ok = await categoryFeedGET(new Request("http://localhost/feeds/categories/pet-supplies.xml"), {
      params: { category: "pet-supplies.xml" },
    });
    expect(ok.status).toBe(200);
    parseXml(await ok.text());

    const noSuffix = await categoryFeedGET(new Request("http://localhost/feeds/categories/pet-supplies"), {
      params: { category: "pet-supplies" },
    });
    expect(noSuffix.status).toBe(404);
  }, 60000);

  it("briefings.xml lists published briefings only, linking canonical briefing pages", async () => {
    const res = await briefingsFeedGET();
    expect(res.status).toBe(200);
    const xml = await res.text();
    const doc = parseXml(xml);

    expect(xml).toContain("Weekly briefing — feed test");
    expect(xml).toContain(`${canonicalBase()}${briefingPath("WEEKLY", BRIEFING_PERIOD_KEY)}`);
    expect(xml).not.toContain("DRAFT briefing must not appear");
    expect(doc.querySelectorAll("item").length).toBeGreaterThan(0);
  }, 60000);

  it("legacy /feed.xml is a 308 to /feeds/changes.xml", async () => {
    const res = await legacyFeedGET(new Request("http://localhost/feed.xml"));
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe("http://localhost/feeds/changes.xml");
  });
});
