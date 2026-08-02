import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// Public Intelligence Task 4 — /changes index and /changes/[slug] detail.
//
// Requires DATABASE_URL pointing at an isolated non-production branch.
// All seeded rows carry the run-scoped runId prefix and are deleted in
// FK-safe order in afterAll, exactly as the existing DB suites do.

let mockPathname = "/changes";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { parsePublicSearchParams } from "../src/public-intelligence/search.js";
import { ChangesResults, ChangesShell } from "../app/(public)/changes/page";
import ChangeDetailPage, {
  generateMetadata as generateDetailMetadata,
} from "../app/(public)/changes/[slug]/page";
import { canonicalSharePayload } from "../app/(public)/ShareButton";

const prisma = new PrismaClient();

const runId = `testpage-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let seedSeq = 0;
function nextSeed() {
  return `${runId}-${++seedSeq}`;
}

// ---------- seeding helpers (run-scoped, FK-safe cleanup) ----------

async function seedChange(opts: {
  readiness?: "MONITORED" | "VERIFIED" | "STALE";
  editorialStatus?: "DRAFT" | "PUBLISHED";
  title?: string;
  summary?: string;
  effectiveAt?: Date | null;
  versions?: Array<{ version: number; correctionReason: string | null; createdAt: Date; isCurrent: boolean }>;
  evidence?: Array<{
    role: "PRIMARY_OFFICIAL" | "SUPPORTING_OFFICIAL" | "SECONDARY_CONTEXT";
    access?: "PUBLIC" | "RESTRICTED" | "UNAVAILABLE";
    summary: string;
    host?: string;
    reviewedAt?: Date | null;
  }>;
  actionTemplate?: string | null;
  actionTemplateReviewedAt?: Date | null;
  policyTopics?: Array<"PRODUCT_SAFETY_RECALLS" | "LABELING_CLAIMS">;
  productCategories?: Array<"TOYS_CHILDRENS_PRODUCTS" | "APPAREL_ACCESSORIES">;
}) {
  const seedId = nextSeed();
  const source = await prisma.source.create({
    data: {
      id: `${seedId}-source`,
      name: "Page Test Source",
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
      title: "Page test item",
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

  const versionSpecs = opts.versions ?? [
    { version: 1, correctionReason: null, createdAt: new Date("2026-07-10T00:00:00Z"), isCurrent: true },
  ];
  let currentVersionId = "";
  for (const spec of versionSpecs) {
    const version = await prisma.canonicalChangeVersion.create({
      data: {
        canonicalChangeId: change.id,
        version: spec.version,
        isCurrent: spec.isCurrent,
        title: opts.title ?? `Page Test Change ${seedId}`,
        summary: opts.summary ?? `Page test summary ${seedId}`,
        signalType: "REGULATORY",
        regions: ["north_america"],
        platforms: [],
        operatingStages: ["PREPARING_TO_LAUNCH"],
        productCategories: (opts.productCategories ?? []) as any,
        riskAttributes: [],
        policyTopics: (opts.policyTopics ?? []) as any,
        sourcePublishedAt: new Date("2026-07-15T00:00:00Z"),
        effectiveAt: opts.effectiveAt === undefined ? new Date("2026-09-15T00:00:00Z") : opts.effectiveAt,
        urgency: 60,
        readiness: (opts.readiness ?? "VERIFIED") as any,
        generalImpact: "Hits sellers importing covered goods.",
        generalActionTemplate: opts.actionTemplate ?? null,
        actionTemplateReviewedAt: opts.actionTemplateReviewedAt ?? null,
        editorialStatus: (opts.editorialStatus ?? "PUBLISHED") as any,
        correctionReason: spec.correctionReason,
        createdAt: spec.createdAt,
        reviewedAt: new Date("2026-07-10T00:00:00Z"),
        reviewedBy: "reviewer-1",
      },
    });
    if (spec.isCurrent) currentVersionId = version.id;
  }

  const evidenceSpecs = opts.evidence ?? [
    { role: "PRIMARY_OFFICIAL" as const, summary: `Official evidence ${seedId}` },
  ];
  for (const [index, ev] of evidenceSpecs.entries()) {
    await prisma.evidenceRecord.create({
      data: {
        changeVersionId: currentVersionId,
        sourceId: source.id,
        sourceItemId: item.id,
        url: `https://${ev.host ?? "example.com"}/${seedId}/evidence-${index}`,
        role: ev.role as any,
        authorityLevel: ev.role === "SECONDARY_CONTEXT" ? "REPUTABLE_SECONDARY" : "GOVERNMENT_OFFICIAL",
        publishedAt: new Date(Date.UTC(2026, 6, 10 + index)),
        access: (ev.access ?? "PUBLIC") as any,
        licenseNote: "Public domain",
        normalizedSummary: ev.summary,
        contentHash: `${seedId}-ch-${index}`,
        fetchedAt: new Date("2026-07-18T00:00:00Z"),
        reviewedAt: ev.reviewedAt === undefined ? new Date("2026-07-19T00:00:00Z") : ev.reviewedAt,
      },
    });
  }
  return { change, source };
}

afterAll(async () => {
  // FK-safe order, mirrors the existing DB suites.
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

// ---------- /changes index ----------

describe("/changes index", () => {
  it("defaults to verified and shows monitored entries only on explicit selection", async () => {
    const token = `${runId}-idx`;
    await seedChange({ readiness: "VERIFIED", title: `${token} verified entry` });
    await seedChange({ readiness: "MONITORED", title: `${token} monitored entry` });

    const base = parsePublicSearchParams(new URLSearchParams());
    render(await ChangesResults({ filters: { ...base, q: token } }));
    expect(screen.getByText(`${token} verified entry`)).toBeVisible();
    expect(screen.queryByText(`${token} monitored entry`)).toBeNull();
    expect(screen.getAllByText("Verified").length).toBeGreaterThan(0);
    cleanup();

    render(
      await ChangesResults({ filters: { ...parsePublicSearchParams(new URLSearchParams("pool=monitored")), q: token } }),
    );
    expect(screen.getAllByText(`${token} monitored entry`).length).toBeGreaterThan(0);
  }, 60000);

  it("teaches the surface on an empty filter instead of padding it", async () => {
    const base = parsePublicSearchParams(new URLSearchParams());
    render(await ChangesResults({ filters: { ...base, q: `${runId}-nothing-matches-this` } }));
    expect(screen.getByText(/No qualified changes in this filter/i)).toBeVisible();
  }, 60000);

  it("links the next page with the opaque cursor and keeps the active filters", async () => {
    const token = `${runId}-next`;
    for (let i = 0; i < 3; i++) {
      await seedChange({ title: `${token} entry ${i}` });
    }
    const base = { ...parsePublicSearchParams(new URLSearchParams()), q: token, limit: 2 };
    render(await ChangesResults({ filters: base }));
    const next = screen.getByRole("link", { name: "Next →" });
    const href = next.getAttribute("href")!;
    expect(href).toContain("cursor=");
    expect(href).toContain(encodeURIComponent(token));
  }, 60000);

  it("shell keeps exactly one h1, presses the active scope and states the expert-view trade", async () => {
    const filters = parsePublicSearchParams(new URLSearchParams("pool=monitored"));
    render(
      <ChangesShell filters={filters} demand={null}>
        <div>results go here</div>
      </ChangesShell>,
    );
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: /Changes affecting US-market sellers/i })).toBeVisible();
    const monitored = screen.getByRole("link", { name: /All Monitored/i });
    expect(monitored.getAttribute("aria-current")).toBe("page");
    const verified = screen.getByRole("link", { name: "Verified" });
    expect(verified.getAttribute("aria-current")).toBeNull();
    expect(screen.getByText(/Expert view/i)).toBeVisible();
    expect(screen.getByText(/has not reached primary-official strength/i)).toBeVisible();
  }, 30000);

  it("renders the experimental-demand boundary copy whenever the demand pool is selected", async () => {
    const filters = parsePublicSearchParams(new URLSearchParams("pool=experimental-demand"));
    render(
      <ChangesShell
        filters={filters}
        demand={{
          readiness: "EXPERIMENTAL",
          summary: "Rank observations from public bestseller pages.",
          knownGaps: ["No completeness claim"],
          lastSuccessfulCheck: "2026-08-01T00:00:00.000Z",
        }}
      >
        <div>demand rows go here</div>
      </ChangesShell>,
    );
    expect(screen.getByText(/Held apart on purpose/i)).toBeVisible();
    expect(screen.getByText(/Not a bestseller list/i)).toBeVisible();
    expect(screen.getByText(/launch recommendation/i)).toBeVisible();
    expect(screen.getByText(/market-size estimate/i)).toBeVisible();
  }, 30000);
});

// ---------- /changes/[slug] detail ----------

describe("/changes/[slug] detail", () => {
  it("renders primary evidence before supporting before secondary context", async () => {
    const { change } = await seedChange({
      evidence: [
        { role: "SECONDARY_CONTEXT", summary: "Secondary commentary", host: "secondary.example.com" },
        { role: "PRIMARY_OFFICIAL", summary: "The official rule text", host: "federal.example.gov" },
        { role: "SUPPORTING_OFFICIAL", summary: "Agency guidance", host: "agency.example.gov" },
      ],
    });
    render(await ChangeDetailPage({ params: { slug: change.slug } }));
    const roles = screen.getAllByTestId("evidence-role").map((node) => node.textContent);
    expect(roles).toEqual(["Primary official", "Supporting official", "Secondary context"]);
  }, 60000);

  it("shows readiness, version, dates, authority, what changed, who it hits and the boundary block", async () => {
    const { change } = await seedChange({
      title: "CPSC expands third-party testing to imported children's sleepwear",
      summary: "The Commission extended the third-party testing requirement.",
      policyTopics: ["PRODUCT_SAFETY_RECALLS"],
      productCategories: ["TOYS_CHILDRENS_PRODUCTS"],
      evidence: [{ role: "PRIMARY_OFFICIAL", summary: "Final Rule", host: "federalregister.gov" }],
    });
    render(await ChangeDetailPage({ params: { slug: change.slug } }));
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: /CPSC expands third-party testing/i })).toBeVisible();
    expect(screen.getAllByText("Verified").length).toBeGreaterThan(0);
    expect(screen.getByText(/version 1 · current/i)).toBeVisible();
    expect(screen.getAllByText(/EFFECTIVE/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PUBLISHED/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/LAST REVIEWED/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/AUTHORITY/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/What changed/i)).toBeVisible();
    expect(screen.getByText(/Who it hits/i)).toBeVisible();
    expect(screen.getByText(/What this does not tell you/i)).toBeVisible();
    expect(screen.getByText(/not legal advice/i)).toBeVisible();
    // The permalink in the aside carries no query string and no tracking parameters.
    const permalink = screen.getByTestId("permalink");
    expect(permalink.textContent).not.toContain("?");
    expect(permalink.textContent).toContain(`/changes/${change.slug}`);
    // Track this change is deliberately not shipped (owner ruling 2026-08-02).
    expect(screen.queryByText(/Track this change/i)).toBeNull();
  }, 60000);

  it("labels inaccessible and disallowed evidence instead of omitting it", async () => {
    const { change } = await seedChange({
      evidence: [
        { role: "PRIMARY_OFFICIAL", summary: "Public announcement", access: "PUBLIC" },
        { role: "SUPPORTING_OFFICIAL", summary: "Login-walled fee schedule", access: "RESTRICTED" },
        { role: "SECONDARY_CONTEXT", summary: "Terms-prohibited portal", access: "UNAVAILABLE" },
      ],
    });
    render(await ChangeDetailPage({ params: { slug: change.slug } }));
    expect(screen.getByText("Inaccessible")).toBeVisible();
    expect(screen.getByText(/requires seller login, not retrievable/i)).toBeVisible();
    expect(screen.getByText("Disallowed")).toBeVisible();
    expect(screen.getByText(/terms prohibit automated access/i)).toBeVisible();
    // Non-public evidence is labelled, never linked out as if retrievable.
    expect(screen.getByText(/Login-walled fee schedule/i).closest("a")).toBeNull();
  }, 60000);

  it("shows the reviewed action template only with reviewed primary-official evidence and a reviewed template", async () => {
    const withBoth = await seedChange({
      actionTemplate: "Identify covered listings and re-certify.",
      actionTemplateReviewedAt: new Date("2026-07-20T00:00:00Z"),
      evidence: [{ role: "PRIMARY_OFFICIAL", summary: "Reviewed official rule" }],
    });
    render(await ChangeDetailPage({ params: { slug: withBoth.change.slug } }));
    expect(screen.getByRole("heading", { name: /Reviewed action template/i })).toBeVisible();
    expect(screen.getAllByText(/not legal advice/i).length).toBeGreaterThan(0);
    cleanup();

    const withoutReview = await seedChange({
      actionTemplate: "Unreviewed template",
      actionTemplateReviewedAt: null,
    });
    render(await ChangeDetailPage({ params: { slug: withoutReview.change.slug } }));
    expect(screen.queryByRole("heading", { name: /Reviewed action template/i })).toBeNull();
  }, 90000);

  it("keeps correction history visible with every prior version addressable", async () => {
    const { change } = await seedChange({
      versions: [
        { version: 1, correctionReason: null, createdAt: new Date("2026-07-22T00:00:00Z"), isCurrent: false },
        { version: 2, correctionReason: "Size range clarified to 0–14", createdAt: new Date("2026-07-25T00:00:00Z"), isCurrent: false },
        { version: 3, correctionReason: "Effective date restated", createdAt: new Date("2026-07-30T00:00:00Z"), isCurrent: true },
      ],
    });
    render(await ChangeDetailPage({ params: { slug: change.slug } }));
    expect(screen.getByText(/Correction history/i)).toBeVisible();
    expect(screen.getByText(/Published versions are never rewritten/i)).toBeVisible();
    expect(screen.getByText(/Size range clarified/i)).toBeVisible();
    expect(screen.getByText(/Effective date restated/i)).toBeVisible();
    const v2 = screen.getByTestId("version-v2");
    expect(v2.getAttribute("id")).toBe("v2");
    const link = screen.getByRole("link", { name: /View v2/i });
    expect(link.getAttribute("href")).toBe("#v2");
    // Every prior version is addressable — including the first publication.
    expect(screen.getByTestId("version-v1").getAttribute("id")).toBe("v1");
    expect(screen.getByText(/First publication/i)).toBeVisible();
    expect(screen.getByRole("link", { name: /View v1/i }).getAttribute("href")).toBe("#v1");
  }, 60000);

  it("states the Monitored limit in prose on the permalink page, never a bare badge", async () => {
    const { change } = await seedChange({ readiness: "MONITORED" });
    render(await ChangeDetailPage({ params: { slug: change.slug } }));
    expect(screen.getByText(/We cannot verify this to the Verified standard/i)).toBeVisible();
    expect(screen.getAllByText("Monitored").length).toBeGreaterThan(0);
  }, 60000);

  it("returns a real 404 for an unknown slug and for an unpublished record", async () => {
    await expect(ChangeDetailPage({ params: { slug: "definitely-not-a-real-slug" } })).rejects.toThrow(/NEXT_NOT_FOUND/);
    const draft = await seedChange({ editorialStatus: "DRAFT" });
    await expect(ChangeDetailPage({ params: { slug: draft.change.slug } })).rejects.toThrow(/NEXT_NOT_FOUND/);
    const stale = await seedChange({ readiness: "STALE" });
    await expect(ChangeDetailPage({ params: { slug: stale.change.slug } })).rejects.toThrow(/NEXT_NOT_FOUND/);
  }, 90000);

  it("metadata canonical excludes filters and tracking parameters", async () => {
    const { change } = await seedChange({});
    const meta = await generateDetailMetadata({ params: { slug: change.slug } });
    const canonical = String(meta.alternates?.canonical);
    expect(canonical).toMatch(new RegExp(`/changes/${change.slug}$`));
    expect(canonical).not.toContain("?");
    expect(canonical).not.toContain("utm");
    expect(String(meta.title)).toContain("Page Test Change");
    expect(String(meta.description).length).toBeGreaterThan(20);
  }, 60000);
});

// ---------- share payload ----------

describe("canonicalSharePayload", () => {
  it("shares only the canonical permalink", () => {
    const record = {
      title: "Some canonical change",
      permalink: "https://tradelinks.us/changes/some-canonical-change",
    };
    expect(canonicalSharePayload(record as any)).toEqual({
      title: record.title,
      url: record.permalink,
    });
  });
});
