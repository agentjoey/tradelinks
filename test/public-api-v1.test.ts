import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// In-process secret: tests must pass on a clean checkout without the ambient
// .env value. api.ts reads the secret at call time, so setting it here (before
// any handler runs) is sufficient and hermetic.
const TEST_SECRET = "0123456789abcdef0123456789abcdef"; // 32 bytes
process.env.PUBLIC_API_CURSOR_SECRET = TEST_SECRET;

import { GET as listChangesGET } from "../app/api/v1/changes/route.js";
import { GET as getChangeGET } from "../app/api/v1/changes/[slug]/route.js";
import { GET as coverageGET } from "../app/api/v1/coverage/route.js";
import { GET as briefingsGET } from "../app/api/v1/briefings/route.js";
import { GET as fingerprintGET } from "../app/api/v1/fingerprint/route.js";
import { GET as openApiGET } from "../app/openapi.json/route.js";
import {
  API_VERSION,
  CursorSecretUnavailableError,
  __withErrorEnvelopeForTest,
  decodeApiCursor,
  encodeApiCursor,
  openApiDocument,
} from "../src/public-intelligence/api.js";
import { PUBLIC_CACHE } from "../src/public-intelligence/cache.js";
import { serializeCanonicalVersion } from "../src/public-intelligence/serialize.js";
import { canonicalBase } from "../src/public-intelligence/site-url.js";

// Anonymous Public API v1 — the machine-readable contract. Like Task 6's
// feeds, the channel-consistency invariant is asserted over the RENDERED
// JSON: versionId / fingerprint / permalink must be byte-identical to
// serializeCanonicalVersion output for the same row. The API composes the
// accepted read layer (searchPublicChanges / getPublicChangeBySlug /
// getCoverageMatrix / listPublishedBriefings) and adds no query shape and
// no recomputed fingerprint of its own.
//
// Requires DATABASE_URL pointing at an isolated branch with migration 0012+.
//
// Fixture strategy mirrors test/public-feeds.test.ts: one beforeAll burst,
// run-scoped ids, and titles containing the runId so the q filter isolates
// this suite's rows from anything earlier files left on this worker's
// schema. Cleaned FK-safe in afterAll.

const prisma = new PrismaClient();

const runId = `testapi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let seedSeq = 0;

function nextSeed() {
  return `${runId}-${++seedSeq}`;
}

/** This suite's ONLY rows: three verified versions seeded in one beforeAll
 *  burst and reused by every test. No mid-run seeding. */
const seeded: Awaited<ReturnType<typeof seedPublicVersion>>[] = [];

// Staggered so verified rows sort deterministically newest-first WITHIN this
// run's q-filtered window. All list assertions here filter by q=runId, so
// global rank is irrelevant to this suite.
const REVIEWED_ATS = [
  new Date("2026-07-18T00:00:00Z"),
  new Date("2026-07-17T00:00:00Z"),
  new Date("2026-07-16T00:00:00Z"),
];

type SeedOverrides = {
  title?: string;
  readiness?: "VERIFIED" | "MONITORED";
  reviewedAt?: Date;
};

async function seedPublicVersion(overrides: SeedOverrides = {}) {
  const seedId = nextSeed();
  const source = await prisma.source.create({
    data: {
      id: `${seedId}-source`,
      name: "API Test Source",
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
      title: "API test item",
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
      title: overrides.title ?? `API test change ${seedId}`,
      summary: "An API v1 test summary",
      signalType: "REGULATORY",
      regions: ["north_america"],
      platforms: ["AMAZON"],
      operatingStages: ["PREPARING_TO_LAUNCH"],
      productCategories: ["PET_SUPPLIES"],
      riskAttributes: ["BATTERY"],
      policyTopics: ["IMPORT_CUSTOMS"],
      sourcePublishedAt: new Date("2026-07-15T00:00:00Z"),
      effectiveAt: new Date("2026-08-01T00:00:00Z"),
      urgency: 85,
      readiness: overrides.readiness ?? "VERIFIED",
      generalImpact: "New import documentation required",
      generalActionTemplate: "Verify your customs broker has updated forms",
      editorialStatus: "PUBLISHED",
      reviewedAt: overrides.reviewedAt ?? new Date("2026-07-16T00:00:00Z"),
      reviewedBy: "reviewer-api-1",
    },
  });
  const fullVersion = await prisma.canonicalChangeVersion.findUniqueOrThrow({
    where: { id: version.id },
    include: {
      canonicalChange: { include: { versions: { orderBy: { version: "asc" } } } },
      evidence: {
        include: { source: true },
        orderBy: [{ role: "asc" }, { publishedAt: "desc" }],
      },
    },
  });
  return { change, version: fullVersion };
}

const apiUrl = (path: string) => `http://localhost${path}`;

afterAll(async () => {
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

describe("GET /api/v1/changes — envelope, limits, headers", () => {
  // One shared list read for the whole describe: every envelope/header/byte
  // assertion below keys off this single response instead of each paying its
  // own query.
  let listRes: Response;
  let listBody: any;

  beforeAll(async () => {
    // One write burst: exactly three verified rows, seeded in PARALLEL (they
    // are FK-independent of each other). All list/detail assertions filter by
    // q=runId or by slug, so rows left by earlier files on this worker's
    // schema can never enter this suite's windows.
    const created = await Promise.all(
      REVIEWED_ATS.map((reviewedAt) => seedPublicVersion({ reviewedAt })),
    );
    seeded.push(...created);
    listRes = await listChangesGET(new Request(apiUrl(`/api/v1/changes?q=${runId}`)));
    listBody = await listRes.json();
  }, 120000);

  it("serves a bare request with no browser headers (curl gets 200)", async () => {
    const res = await listChangesGET(new Request(apiUrl("/api/v1/changes")));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
  }, 60000);

  it("returns the exact success envelope with default limit 20", async () => {
    expect(listRes.status).toBe(200);
    const body = listBody;
    expect(body.apiVersion).toBe(API_VERSION);
    expect(typeof body.generatedAt).toBe("string");
    expect(Number.isNaN(Date.parse(body.generatedAt))).toBe(false);
    expect(typeof body.fingerprint).toBe("string");
    expect(body.fingerprint.length).toBeGreaterThan(0);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.page.limit).toBe(20);
    expect(body.page.nextCursor === null || typeof body.page.nextCursor === "string").toBe(true);
    // q isolates this run's rows: exactly the three verified seeds.
    expect(body.data.length).toBe(3);
  });

  it("renders versionId/fingerprint/permalink byte-identical to the serializer", async () => {
    const record = serializeCanonicalVersion(seeded[0]!.version as any);
    const rendered = listBody.data.find((item: any) => item.versionId === record.versionId);
    expect(rendered).toBeDefined();
    expect(rendered.versionId).toBe(record.versionId);
    expect(rendered.fingerprint).toBe(record.fingerprint);
    expect(rendered.permalink).toBe(record.permalink);
  });

  it("carries canonical attribution (permalink + evidence links) on every record", async () => {
    for (const item of listBody.data) {
      expect(item.permalink).toBe(`${canonicalBase()}/changes/${item.slug}`);
      expect(Array.isArray(item.evidence)).toBe(true);
      for (const e of item.evidence) {
        expect(typeof e.url).toBe("string");
        expect(typeof e.sourceName).toBe("string");
      }
    }
  });

  it("rejects out-of-range limits with a deterministic 400, never a silent clamp", async () => {
    for (const bad of ["0", "101", "-1", "abc", "1.5"]) {
      const res = await listChangesGET(new Request(apiUrl(`/api/v1/changes?limit=${bad}`)));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("INVALID_LIMIT");
    }
    const edge = await listChangesGET(new Request(apiUrl(`/api/v1/changes?limit=100&q=${runId}`)));
    expect(edge.status).toBe(200);
    // limit=1 is exercised end-to-end by the pagination describe below.
  }, 60000);

  it("rejects unknown filter values with 400 INVALID_FILTER", async () => {
    for (const bad of [
      "pool=experimental-demand",
      "pool=everything",
      "signal=NOT_A_SIGNAL",
      "platform=ebay",
      "category=not-a-category",
      "from=2026-13-40",
      "to=07-01-2026",
      `q=${"x".repeat(121)}`,
    ]) {
      const res = await listChangesGET(new Request(apiUrl(`/api/v1/changes?${bad}`)));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("INVALID_FILTER");
    }
  }, 60000);

  it("sends ETag from the content fingerprint plus Last-Modified and Cache-Control", async () => {
    expect(listRes.headers.get("etag")).toBe(`"${listBody.fingerprint}"`);
    expect(listRes.headers.get("cache-control")).toBe(
      `public, s-maxage=${PUBLIC_CACHE.liveChangesRevalidate}, stale-while-revalidate=${PUBLIC_CACHE.canonicalChangeRevalidate}`,
    );
    const lastModified = listRes.headers.get("last-modified");
    expect(lastModified).not.toBeNull();
    expect(Number.isNaN(Date.parse(lastModified!))).toBe(false);
  });

  it("returns 304 with an EMPTY body for a matching If-None-Match", async () => {
    const etag = listRes.headers.get("etag")!;
    const second = await listChangesGET(
      new Request(apiUrl(`/api/v1/changes?q=${runId}`), {
        headers: { "if-none-match": etag },
      }),
    );
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  }, 60000);

  it("exposes no private data fields anywhere in the payload", async () => {
    const raw = JSON.stringify(listBody);
    expect(raw).not.toMatch(/sellerProfile|personalAction|relevanceAssessment|profileId|relevanceScore/i);
  }, 60000);
});

describe("GET /api/v1/changes — signed cursor pagination", () => {
  it("paginates deterministically through the run-scoped rows", async () => {
    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    let sawTrailingEmptyPage = false;
    do {
      const url = `/api/v1/changes?q=${runId}&limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res: Response = await listChangesGET(new Request(apiUrl(url)));
      expect(res.status).toBe(200);
      const body: any = await res.json();
      if (body.data.length === 0) {
        // The accepted read layer issues nextCursor whenever a page is full,
        // so a total that is a multiple of limit ends in one empty page.
        sawTrailingEmptyPage = true;
        expect(body.page.nextCursor).toBeNull();
        break;
      }
      expect(body.data.length).toBe(1);
      expect(seen.has(body.data[0].versionId)).toBe(false);
      seen.add(body.data[0].versionId);
      cursor = body.page.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    // Exactly this run's three verified rows, each exactly once.
    expect(seen.size).toBe(3);
    expect(sawTrailingEmptyPage || cursor === null).toBe(true);
  }, 120000);

  it("rejects cursor reuse under changed filters with 400 INVALID_CURSOR", async () => {
    const first = await listChangesGET(new Request(apiUrl(`/api/v1/changes?q=${runId}&limit=1`)));
    const cursor = (await first.json()).page.nextCursor;
    expect(typeof cursor).toBe("string");

    // Same filters, different limit: pagination parameter, still valid.
    const okReplay = await listChangesGET(
      new Request(apiUrl(`/api/v1/changes?q=${runId}&limit=2&cursor=${encodeURIComponent(cursor)}`)),
    );
    expect(okReplay.status).toBe(200);

    // Changed filters (different pool): the cursor must not be reusable.
    const reused = await listChangesGET(
      new Request(
        apiUrl(`/api/v1/changes?q=${runId}&pool=monitored&cursor=${encodeURIComponent(cursor)}`),
      ),
    );
    expect(reused.status).toBe(400);
    expect((await reused.json()).error.code).toBe("INVALID_CURSOR");
  }, 120000);

  it("rejects malformed and unsigned cursors with 400 INVALID_CURSOR", async () => {
    for (const bad of ["garbage", "AAAA.BBBB", ""]) {
      if (bad === "") continue; // empty param = absent
      const res = await listChangesGET(
        new Request(apiUrl(`/api/v1/changes?cursor=${encodeURIComponent(bad)}`)),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_CURSOR");
    }
    // A well-formed payload with a forged signature is equally refused.
    const forgedPayload = Buffer.from(
      JSON.stringify({ publishedAt: "2099-01-01T00:00:00.000Z", id: "x", filtersHash: "y" }),
    ).toString("base64url");
    const forged = `${forgedPayload}.${Buffer.from("forged-signature").toString("base64url")}`;
    const res = await listChangesGET(
      new Request(apiUrl(`/api/v1/changes?cursor=${encodeURIComponent(forged)}`)),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_CURSOR");
  }, 60000);

  it("fails closed with a deterministic error when the secret is absent", async () => {
    const saved = process.env.PUBLIC_API_CURSOR_SECRET;
    delete process.env.PUBLIC_API_CURSOR_SECRET;
    try {
      expect(() => encodeApiCursor({ publishedAt: "x", id: "y", filtersHash: "z" })).toThrow(
        CursorSecretUnavailableError,
      );
      // A page that must ISSUE a nextCursor cannot do so unsigned: 500.
      const res = await listChangesGET(new Request(apiUrl(`/api/v1/changes?q=${runId}&limit=1`)));
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error.code).toBe("CURSOR_NOT_CONFIGURED");
      // A presented cursor cannot be VERIFIED either: same deterministic 500.
      const presented = await listChangesGET(
        new Request(apiUrl(`/api/v1/changes?q=${runId}&limit=1&cursor=AAAA.BBBB`)),
      );
      expect(presented.status).toBe(500);
      expect((await presented.json()).error.code).toBe("CURSOR_NOT_CONFIGURED");
    } finally {
      process.env.PUBLIC_API_CURSOR_SECRET = saved;
    }
  }, 60000);

  it("round-trips its own cursor payload", () => {
    const payload = {
      publishedAt: "2099-01-01T00:00:00.000Z",
      id: "version-id-1",
      filtersHash: "abc123",
    };
    const encoded = encodeApiCursor(payload);
    expect(decodeApiCursor(encoded)).toEqual(payload);
    // Tampering with any byte invalidates the signature.
    const tampered = `${encoded.slice(0, -2)}${encoded.endsWith("a") ? "b" : "a"}x`;
    expect(decodeApiCursor(tampered)).toBeNull();
  });

  it("answers unexpected failures in the documented envelope (500 INTERNAL_ERROR)", async () => {
    // Unit-pin the wrapper: an unexpected throw becomes the documented
    // envelope, and the fail-closed secret case keeps its own code. (No live
    // DB-outage trigger is exercised here — stated plainly in the report.)
    const failing = __withErrorEnvelopeForTest(async () => {
      throw new Error("simulated driver failure");
    });
    const res = await failing();
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.apiVersion).toBe(API_VERSION);
    expect(body.error.code).toBe("INTERNAL_ERROR");

    const secretless = __withErrorEnvelopeForTest(async () => {
      throw new CursorSecretUnavailableError();
    });
    const res2 = await secretless();
    expect(res2.status).toBe(500);
    expect((await res2.json()).error.code).toBe("CURSOR_NOT_CONFIGURED");
  });
});

describe("GET /api/v1/changes/[slug]", () => {
  it("renders one canonical record byte-identical to the serializer", async () => {
    const record = serializeCanonicalVersion(seeded[0]!.version as any);

    const res = await getChangeGET(new Request(apiUrl(`/api/v1/changes/${record.slug}`)), {
      params: { slug: record.slug },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apiVersion).toBe(API_VERSION);
    expect(body.data.versionId).toBe(record.versionId);
    expect(body.data.fingerprint).toBe(record.fingerprint);
    expect(body.data.permalink).toBe(record.permalink);
    expect(body.fingerprint).toBe(record.fingerprint);
    expect(res.headers.get("etag")).toBe(`"${record.fingerprint}"`);

    const notModified = await getChangeGET(
      new Request(apiUrl(`/api/v1/changes/${record.slug}`), {
        headers: { "if-none-match": `"${record.fingerprint}"` },
      }),
      { params: { slug: record.slug } },
    );
    expect(notModified.status).toBe(304);
    expect(await notModified.text()).toBe("");
  }, 120000);

  it("404s an unknown slug with a stable code", async () => {
    const res = await getChangeGET(new Request(apiUrl("/api/v1/changes/no-such-change")), {
      params: { slug: "no-such-change" },
    });
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("NOT_FOUND");
  }, 60000);
});

describe("GET /api/v1/coverage, /api/v1/briefings, /api/v1/fingerprint", () => {
  it("coverage returns the matrix in the standard envelope", async () => {
    const res = await coverageGET(new Request(apiUrl("/api/v1/coverage")));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apiVersion).toBe(API_VERSION);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.page.nextCursor).toBeNull();
    for (const row of body.data) {
      expect(typeof row.key).toBe("string");
      expect(typeof row.readiness).toBe("string");
    }
    expect(res.headers.get("etag")).toBe(`"${body.fingerprint}"`);
  }, 60000);

  it("briefings returns published briefings only, in the standard envelope", async () => {
    const res = await briefingsGET(new Request(apiUrl("/api/v1/briefings")));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apiVersion).toBe(API_VERSION);
    expect(Array.isArray(body.data)).toBe(true);
    for (const briefing of body.data) {
      expect(typeof briefing.slug).toBe("string");
      expect(typeof briefing.publishedAt).toBe("string");
      expect(briefing.editorialStatus).toBeUndefined();
    }
  }, 60000);

  it("fingerprint is a cheap content-state probe consistent with the list", async () => {
    const res = await fingerprintGET(new Request(apiUrl("/api/v1/fingerprint")));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.apiVersion).toBe(API_VERSION);
    expect(typeof body.fingerprint).toBe("string");
    expect(typeof body.data.totalRecords).toBe("number");
    expect(
      body.data.latestFingerprint === null || typeof body.data.latestFingerprint === "string",
    ).toBe(true);
    expect(res.headers.get("etag")).toBe(`"${body.fingerprint}"`);
  }, 60000);
});

describe("GET /openapi.json", () => {
  it("serves an OpenAPI 3.1 document with cache headers", async () => {
    const res = await openApiGET();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("cache-control")).toContain(`s-maxage=${PUBLIC_CACHE.liveChangesRevalidate}`);
    const doc = await res.json();
    expect(doc.openapi).toBe("3.1.0");
    expect(doc.info.version).toBe("1.0.0");
  });

  it("documents exactly the five v1 endpoints", () => {
    const doc = openApiDocument();
    expect(Object.keys(doc.paths as Record<string, unknown>).sort()).toEqual([
      "/api/v1/briefings",
      "/api/v1/changes",
      "/api/v1/changes/{slug}",
      "/api/v1/coverage",
      "/api/v1/fingerprint",
    ]);
  });

  it("never names a private schema", async () => {
    const raw = JSON.stringify(openApiDocument());
    expect(raw).not.toMatch(/SellerProfile|PersonalAction|RelevanceAssessment/);
    const res = await openApiGET();
    expect(await res.text()).not.toMatch(/SellerProfile|PersonalAction|RelevanceAssessment/);
  });
});
