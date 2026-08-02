import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

/**
 * Task 4 — real HTTP status gate for /changes and /changes/[slug].
 *
 * Locks the loading-skeleton-trap ruling: a `loading.tsx` at
 * app/(public)/changes/ would cover the [slug] child segment and turn every
 * gated 404 into a soft-200 (the bug Task 3 fixed at the route-group level).
 * An unknown or unpublished slug must return a real 404 — never a skeleton.
 *
 * The spec seeds one run-scoped published change on the shared
 * non-production branch and deletes it in FK-safe order afterwards.
 */

const prisma = new PrismaClient();

const runId = `e2echanges-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let seededSlug = "";

test.beforeAll(async () => {
  const source = await prisma.source.create({
    data: {
      id: `${runId}-source`,
      name: "E2E Changes Test Source",
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
      title: "E2E changes test item",
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
  seededSlug = change.slug;
  const version = await prisma.canonicalChangeVersion.create({
    data: {
      canonicalChangeId: change.id,
      version: 1,
      isCurrent: true,
      title: `E2E Changes Gate ${runId}`,
      summary: "A published, reviewed, Verified change seeded by the e2e status gate.",
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
      normalizedSummary: "E2E gate evidence summary",
      contentHash: `${runId}-ch`,
      fetchedAt: new Date("2026-07-18T00:00:00Z"),
      reviewedAt: new Date("2026-07-19T00:00:00Z"),
    },
  });
});

test.afterAll(async () => {
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

test("no loading.tsx may sit above the gated [slug] segment", () => {
  expect(fs.existsSync("app/(public)/changes/loading.tsx")).toBe(false);
});

test("an unknown slug returns a real 404, not a skeleton soft-200", async ({ page }) => {
  const response = await page.goto("/changes/definitely-not-a-real-slug");
  expect(response?.status()).toBe(404);
});

test("the changes index returns 200 with its heading and safe default", async ({ page }) => {
  const response = await page.goto("/changes");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", { level: 1, name: /Changes affecting US-market sellers/i }),
  ).toBeVisible();
  // Verified is pressed by default; the expert views require explicit selection.
  await expect(page.getByRole("link", { name: "Verified" })).toHaveAttribute("aria-current", "page");
});

test("a published change renders at its canonical permalink", async ({ page }) => {
  const response = await page.goto(`/changes/${seededSlug}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: `E2E Changes Gate ${runId}` })).toBeVisible();
  await expect(page.getByText(/What this does not tell you/i)).toBeVisible();
  await expect(page.getByText(/E2E gate evidence summary/i)).toBeVisible();
});
