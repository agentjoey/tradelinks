import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/**
 * Public Intelligence Task 8, Debt 3 — site-wide internal-link integrity
 * crawl, owed since Task 3 and asserted by inspection three times before.
 *
 * Starts from every static public route in the URL contract, walks every
 * page it can reach, collects every internal href, and asserts each one
 * returns 200 or an intended redirect (3xx with a Location). A 404 fails
 * the suite and names the page and the link. The final summary line prints
 * the exact counts — the proof that the non-200 count is zero is the crawl
 * itself, not anyone's say-so.
 *
 * The Debt 1 regression case (/amazon-us) is covered: PublicNav links it
 * statically from every page, so a below-Monitored regrade fails this suite.
 *
 * Fixtures: three published VERIFIED changes sharing one policy topic (so
 * the topic page and every /changes/<slug> link resolve) — run-scoped,
 * FK-safe teardown, zero-residue assertion at the end. No guide/briefing
 * fixtures: a published guide would break public-briefings.spec.ts's
 * honest-absence assertion on the shared branch, and those detail routes'
 * 200/404 contract is already covered there.
 *
 * Parallel suites mutate shared state mid-crawl (their fixtures are deleted
 * under the walk, and public-hubs.spec.ts temporarily flips one capability's
 * readiness), so a non-200 only fails the suite when the linking page STILL
 * links the target AND the target still does not resolve on a delayed
 * recheck. A genuinely broken static link — the Debt 1 case, PublicNav
 * linking /amazon-us from every page — never clears that bar.
 */

const prisma = new PrismaClient();

const runId = `e2elinks-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const STATIC_ROUTES = [
  "/",
  "/us",
  "/amazon-us",
  "/shopify-us",
  "/categories",
  "/topics",
  "/changes",
  "/guides",
  "/briefings",
  "/coverage",
];

const MAX_PAGES = 200;

test.beforeAll(async ({}, testInfo) => {
  // Seeding happens once, in the desktop project only — the mobile project
  // skips the crawl test (viewport-independent link graph) and must not
  // seed/delete fixtures under the desktop crawl's feet.
  if (testInfo.project.name !== "desktop-chromium") return;
  // NOTE: no guide or briefing fixtures here. A published guide would break
  // public-briefings.spec.ts's honest-absence assertion (parallel suites
  // share this branch), and guide/briefing detail 200/404 behaviour is
  // already covered by that spec. Three changes on one topic: the topic
  // page opens at three published changes, so /topics/import-customs
  // (linked from cards and the detail aside) resolves instead of 404ing.
  for (let i = 1; i <= 3; i++) {
    const seedId = `${runId}-${i}`;
    const source = await prisma.source.create({
      data: {
        id: `${seedId}-source`,
        name: "E2E Link Crawl Source",
        url: `https://example.com/${seedId}`,
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
        url: `https://example.com/${seedId}/item`,
        urlHash: `${seedId}-hash`,
        title: `E2E link crawl item ${i}`,
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
        title: `E2E link crawl change ${i}`,
        summary: `Link crawl summary ${i}`,
        signalType: "REGULATORY",
        regions: ["north_america"],
        platforms: ["AMAZON"],
        operatingStages: ["PREPARING_TO_LAUNCH"],
        productCategories: ["PET_SUPPLIES"],
        riskAttributes: [],
        policyTopics: ["IMPORT_CUSTOMS"],
        sourcePublishedAt: new Date("2026-07-15T00:00:00Z"),
        effectiveAt: new Date("2026-08-01T00:00:00Z"),
        urgency: 80,
        readiness: "VERIFIED",
        generalImpact: "General impact statement.",
        editorialStatus: "PUBLISHED",
        reviewedAt: new Date(),
        reviewedBy: "reviewer-e2e-links",
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
        licenseNote: "",
        excerpt: "raw excerpt",
        normalizedSummary: "Normalized summary",
        contentHash: `${seedId}-ch`,
        fetchedAt: new Date("2026-07-18T00:00:00Z"),
        reviewedAt: new Date("2026-07-19T00:00:00Z"),
      },
    });
  }
});

test.afterAll(async ({}, testInfo) => {
  if (testInfo.project.name !== "desktop-chromium") return;
  await prisma.evidenceRecord.deleteMany({ where: { changeVersion: { canonicalChange: { slug: { startsWith: runId } } } } });
  await prisma.canonicalChangeVersion.deleteMany({ where: { canonicalChange: { slug: { startsWith: runId } } } });
  await prisma.canonicalChange.deleteMany({ where: { slug: { startsWith: runId } } });
  await prisma.evidenceClusterMember.deleteMany({ where: { cluster: { fingerprint: { startsWith: runId } } } });
  await prisma.evidenceCluster.deleteMany({ where: { fingerprint: { startsWith: runId } } });
  await prisma.item.deleteMany({ where: { sourceId: { startsWith: runId } } });
  await prisma.source.deleteMany({ where: { id: { startsWith: runId } } });
  // Zero residue is an assertion, not a hope — interrupted runs have
  // polluted this branch before.
  const residue = await prisma.canonicalChange.count({ where: { slug: { startsWith: runId } } });
  expect(residue).toBe(0);
  await prisma.$disconnect();
});

/** Internal, page-crawlable target (feeds/API/static files are checked, not crawled). */
function isCrawlable(path: string): boolean {
  if (path.startsWith("/api/")) return false;
  if (/\.(xml|md|json|png|ico|txt)$/.test(path)) return false;
  return true;
}

function normalize(href: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(href, origin);
  } catch {
    return null;
  }
  if (url.origin !== origin) return null; // external — evidence, sources, permalinks
  url.hash = "";
  const path = `${url.pathname}${url.search}`;
  return path === "" ? "/" : path;
}

test("every internal link on every reachable public page resolves", async ({
  page,
  request,
  isMobile,
}, testInfo) => {
  test.skip(Boolean(isMobile), "the link graph is viewport-independent — desktop covers it");
  test.setTimeout(600_000);

  const origin = new URL(testInfo.project.use.baseURL ?? "http://127.0.0.1:3000").origin;

  // target → the first page that linked it ("contract" for the static seed
  // routes — those must always exist and get no transient excuse).
  const links = new Map<string, string>();
  for (const route of STATIC_ROUTES) links.set(route, "contract");
  const visited = new Set<string>();
  const queue: string[] = [...STATIC_ROUTES];
  // Every candidate failure, with the page that linked it, for the
  // transient-state reclassification below.
  const candidates: Array<{ target: string; from: string; status: number }> = [];

  while (queue.length > 0 && visited.size < MAX_PAGES) {
    const path = queue.shift()!;
    if (visited.has(path)) continue;
    visited.add(path);

    const response = await page.goto(path, { waitUntil: "domcontentloaded" });
    const status = response?.status() ?? 0;
    if (status !== 200) {
      candidates.push({ target: path, from: links.get(path) ?? "contract", status });
      continue;
    }
    const contentType = response?.headers()["content-type"] ?? "";
    if (!contentType.includes("text/html")) continue;

    const hrefs = await page.locator("a[href]").evaluateAll((els) =>
      els.map((el) => el.getAttribute("href") ?? ""),
    );
    for (const href of hrefs) {
      const target = normalize(href, origin);
      if (!target) continue;
      if (!links.has(target)) links.set(target, path);
      if (isCrawlable(target) && !visited.has(target)) queue.push(target);
    }
  }

  // Every collected link gets a real status check. Pages already visited
  // returned 200 above; the rest (feeds, /api/v1/*, static files, filter
  // URLs) are checked here without following redirects, so an intended
  // redirect is seen as itself.
  let redirects = 0;
  for (const [target, fromPage] of links) {
    if (visited.has(target)) continue; // already proved 200 as a crawled page
    const res = await request.get(target, { maxRedirects: 0 });
    const status = res.status();
    if (status === 200) continue;
    if ([301, 302, 303, 307, 308].includes(status) && res.headers()["location"]) {
      redirects++;
      continue;
    }
    candidates.push({ target, from: fromPage, status });
  }

  // Transient shared-state reclassification. Parallel e2e suites seed and
  // delete their own run-scoped fixtures on this branch, and
  // public-hubs.spec.ts temporarily flips a capability's readiness: a link
  // collected mid-flight can point at state another suite has since torn
  // down. That is not a broken site link. So a candidate only fails the
  // suite if the linking page STILL links it and the target STILL does not
  // resolve on a fresh check. A genuinely broken static link (the Debt 1
  // case: PublicNav links /amazon-us from every page, unconditionally)
  // never clears this bar — the link never disappears.
  const failures: string[] = [];
  let transient = 0;
  for (const candidate of candidates) {
    if (candidate.from === "contract") {
      failures.push(`${candidate.target} → ${candidate.status} (static contract route)`);
      continue;
    }
    const source = await request.get(candidate.from);
    const html = source.ok() ? await source.text() : "";
    const stillLinked =
      html.includes(`href="${candidate.target}"`) ||
      html.includes(`href="${candidate.target.replace(/&/g, "&amp;")}"`);
    if (!stillLinked) {
      transient++;
      continue;
    }
    await new Promise((r) => setTimeout(r, 2500));
    const retry = await request.get(candidate.target, { maxRedirects: 0 });
    const retryStatus = retry.status();
    const ok =
      retryStatus === 200 ||
      ([301, 302, 303, 307, 308].includes(retryStatus) && retry.headers()["location"]);
    if (!ok) {
      failures.push(
        `${candidate.target} → ${candidate.status}, still ${retryStatus} on recheck (linked from ${candidate.from})`,
      );
    }
  }

  console.log(
    `[link-integrity] pages crawled: ${visited.size}; unique internal links checked: ${links.size}; intended redirects: ${redirects}; transient shared-state skips: ${transient}; persistent non-200/non-redirect: ${failures.length}`,
  );
  expect(failures).toEqual([]);
});
