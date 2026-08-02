import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

/**
 * Task 5 — real HTTP status gate for /guides, /guides/[slug] and the three
 * briefing period routes.
 *
 * Locks the loading-skeleton-trap ruling for this task's surfaces: a
 * `loading.tsx` at app/(public)/guides/ or app/(public)/briefings/ would
 * cover the child segments and turn every gated 404 into a soft-200 (the
 * bug Task 3 fixed at the route-group level). Unknown guide slugs — which
 * in Phase 1 means EVERY guide, since the corpus is locked drafts — must
 * return a real 404, as must out-of-range weeks, unpublished periods, and
 * below-threshold daily dates.
 *
 * The spec seeds one run-scoped published weekly briefing (change version +
 * BRIEFING PipelineRun + generated/published Briefing) on the shared
 * non-production branch and deletes everything in FK-safe order afterwards.
 */

const prisma = new PrismaClient();

const runId = `e2egb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let weeklyPath = "";

test.beforeAll(async ({}, testInfo) => {
  const { generateBriefing, publishBriefing, briefingPath, briefingScopeKey } = await import(
    "../../src/public-intelligence/briefings.js"
  );
  // Both Playwright projects share one database — each gets its own
  // canonical-format period (route parsers reject anything else) while the
  // runId-scoped fingerprint keeps cleanup precise. If a real briefing ever
  // exists for one of these periods, generateBriefing throws
  // BRIEFING_ALREADY_PUBLISHED here — loudly, by design.
  const periodKey = testInfo.project.name.includes("mobile") ? "2026-W49" : "2026-W48";

  const source = await prisma.source.create({
    data: {
      id: `${runId}-source`,
      name: "E2E Briefings Test Source",
      url: `https://example.com/${runId}`,
      adapter: "rss",
      frequencyCron: "0 * * * *",
      language: "en",
      regions: ["north_america"],
      platforms: [],
      authorityLevel: "GOVERNMENT_OFFICIAL",
      lastOkAt: new Date(),
    },
  });
  const item = await prisma.item.create({
    data: {
      sourceId: source.id,
      url: `https://example.com/${runId}/item`,
      urlHash: `${runId}-hash`,
      title: "E2E briefings test item",
      publishedAt: new Date("2026-07-01T00:00:00Z"),
      regions: ["north_america"],
      platforms: [],
      lang: "en",
    },
  });
  const cluster = await prisma.evidenceCluster.create({
    data: {
      fingerprint: `${runId}-fp`,
      members: { create: [{ itemId: item.id, role: "PRIMARY_OFFICIAL" }] },
    },
  });
  const change = await prisma.canonicalChange.create({
    data: { slug: `${runId}-change`, clusterId: cluster.id },
  });
  const version = await prisma.canonicalChangeVersion.create({
    data: {
      canonicalChangeId: change.id,
      version: 1,
      isCurrent: true,
      title: `E2E Briefings Gate ${runId}`,
      summary: "A published, reviewed, Verified change pinned into an e2e briefing.",
      signalType: "REGULATORY",
      regions: ["north_america"],
      platforms: [],
      operatingStages: ["PREPARING_TO_LAUNCH"],
      productCategories: [],
      riskAttributes: [],
      policyTopics: [],
      sourcePublishedAt: new Date("2026-07-15T00:00:00Z"),
      effectiveAt: new Date("2026-09-15T00:00:00Z"),
      urgency: 60,
      readiness: "VERIFIED",
      generalImpact: "Hits sellers importing covered goods.",
      editorialStatus: "PUBLISHED",
      reviewedAt: new Date("2026-07-20T00:00:00Z"),
      reviewedBy: "e2e-gate",
    },
  });
  await prisma.evidenceRecord.create({
    data: {
      changeVersionId: version.id,
      sourceId: source.id,
      sourceItemId: item.id,
      url: `https://example.com/${runId}/evidence`,
      role: "PRIMARY_OFFICIAL",
      authorityLevel: "GOVERNMENT_OFFICIAL",
      publishedAt: new Date("2026-07-10T00:00:00Z"),
      access: "PUBLIC",
      licenseNote: "Public domain",
      normalizedSummary: "E2E briefings gate evidence summary",
      contentHash: `${runId}-ch`,
      fetchedAt: new Date("2026-07-18T00:00:00Z"),
      reviewedAt: new Date("2026-07-19T00:00:00Z"),
    },
  });

  // The Track A contract surface: a finished BRIEFING PipelineRun whose
  // metadata carries the ordered pinned version IDs; the fingerprint carries
  // the run scope, and cleanup keys off it.
  await prisma.pipelineRun.create({
    data: {
      jobType: "BRIEFING",
      scopeKey: briefingScopeKey("WEEKLY", periodKey),
      scheduledFor: new Date("2026-11-23T00:00:00Z"),
      startedAt: new Date("2026-11-23T00:00:00Z"),
      finishedAt: new Date("2026-11-23T00:05:00Z"),
      status: "SUCCEEDED_ITEMS",
      itemCount: 1,
      outputFingerprint: `${runId}-outfp`,
      metadata: { changeVersionIds: [version.id] },
      runnerVersion: "e2e-gate",
    },
  });

  const draft = await generateBriefing({ kind: "WEEKLY", periodKey });
  if (draft === "NO_QUALIFIED_CONTENT") throw new Error("expected a draft briefing");
  await publishBriefing(draft.id, "e2e-gate");
  weeklyPath = briefingPath("WEEKLY", periodKey);
});

test.afterAll(async () => {
  await prisma.briefingEntry.deleteMany({
    where: { briefing: { fingerprint: { startsWith: runId } } },
  });
  await prisma.briefing.deleteMany({ where: { fingerprint: { startsWith: runId } } });
  await prisma.pipelineRun.deleteMany({ where: { outputFingerprint: { startsWith: runId } } });
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
});

test("no loading.tsx may sit above the gated guide or briefing segments", () => {
  expect(fs.existsSync("app/(public)/guides/loading.tsx")).toBe(false);
  expect(fs.existsSync("app/(public)/briefings/loading.tsx")).toBe(false);
});

test("an unknown guide slug returns a real 404, not a skeleton soft-200", async ({ page }) => {
  const response = await page.goto("/guides/definitely-not-a-real-guide");
  expect(response?.status()).toBe(404);
});

test("every draft guide 404s — the locked corpus is never public", async ({ page }) => {
  const response = await page.goto("/guides/us-market-entry-basics");
  expect(response?.status()).toBe(404);
});

test("an out-of-range week returns a real 404", async ({ page }) => {
  const response = await page.goto("/briefings/weekly/2026/54");
  expect(response?.status()).toBe(404);
});

test("a below-threshold daily date returns a real 404 — no empty daily page exists", async ({
  page,
}) => {
  const response = await page.goto("/briefings/daily/2026-07-06");
  expect(response?.status()).toBe(404);
});

test("an unpublished or never-qualified period returns a real 404", async ({ page }) => {
  const response = await page.goto("/briefings/monthly/2026/1");
  expect(response?.status()).toBe(404);
});

test("the guides index returns 200 with the honest-absence state", async ({ page }) => {
  const response = await page.goto("/guides");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Guides" })).toBeVisible();
  await expect(page.getByText(/No published guides yet/i)).toBeVisible();
  await expect(page.getByText(/9 guides are drafted/i)).toBeVisible();
  // Drafts are named as a count, never linked.
  await expect(page.getByRole("link", { name: /market entry basics/i })).toHaveCount(0);
});

test("the briefings index returns 200", async ({ page }) => {
  const response = await page.goto("/briefings");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Briefings" })).toBeVisible();
});

test("a valid published briefing period returns 200 and renders its pinned entry", async ({
  page,
}) => {
  const response = await page.goto(weeklyPath);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Weekly briefing/i);
  // The title appears in the summary headline and the entry card — assert the card link.
  await expect(page.getByRole("link", { name: `E2E Briefings Gate ${runId}` })).toBeVisible();
  await expect(page.getByText(/E2E briefings gate evidence summary/i)).toBeVisible();
  await expect(page.getByText(`${runId}-outfp`)).toBeVisible();
});
