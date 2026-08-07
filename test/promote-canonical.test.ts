/**
 * Cluster → CanonicalChange promotion (the missing link).
 *
 * Production held 3,667 EvidenceClusters and zero CanonicalChange rows
 * because nothing promoted a cluster into a change. These tests pin the two
 * properties that make promotion safe to run unattended against production:
 *
 *   1. it never invents prose — every字 of a draft traces to the source item
 *      or to the source's own contract;
 *   2. it never produces a publicly-visible row — every draft lands DRAFT,
 *      not current, unreviewed, so the public read contract excludes it and a
 *      human decides.
 *
 * Pure builder only; no database. The batch wrapper is dep-injected the same
 * way collect/canonicalize are.
 */

import { describe, expect, it } from "vitest";

import {
  buildPromotionDraft,
  selectPromotionAnchor,
  isPromotableAnchor,
  promotionSlug,
  PROMOTION_MAX_AGE_DAYS,
  deriveSummary,
  SUMMARY_MAX_CHARS,
  type PromotableCluster,
  type PromotableMember,
  type PromotionDraft,
} from "../src/canonicalize/promote.js";
import { createCanonicalizeBatch, TEMPLATE_MAX_PER_RUN } from "../src/jobs/canonicalize-batch.js";
import type { CanonicalizeDeps } from "../src/jobs/canonicalize-batch.js";
import type { JobArgs } from "../src/jobs/types.js";
import type { SourceContract } from "../src/domain/intelligence/source-contract.js";

// ---- fixtures -------------------------------------------------------------

function contract(over: Partial<SourceContract> & { id: string }): SourceContract {
  return {
    name: `source ${over.id}`,
    url: "https://example.gov/feed",
    market: "US",
    platforms: [],
    categories: ["ALL_PRODUCTS"],
    authorityLevel: "GOVERNMENT_OFFICIAL",
    readiness: "MONITORED",
    access: "PUBLIC",
    license: "US Government work",
    fetchMethod: "RSS",
    primaryEvidenceEligible: true,
    freshnessSlaMinutes: 480,
    refreshCron: "0 */8 * * *",
    degradationPolicy: "d",
    userPromise: "p",
    enabled: true,
    fixture: "f.xml",
    ...over,
  } as SourceContract;
}

const SHOPIFY = contract({
  id: "A02",
  name: "Shopify Changelog",
  authorityLevel: "PLATFORM_OFFICIAL",
  platforms: ["SHOPIFY"],
  readiness: "MONITORED",
  license: "Platform ToS",
});

const FED_REGISTER = contract({ id: "B03", readiness: "MONITORED" });
const CPSC_RSS = contract({ id: "US-CPSC-RSS", readiness: "EXPERIMENTAL" });
const NEWS = contract({
  id: "F03",
  authorityLevel: "REPUTABLE_SECONDARY",
  primaryEvidenceEligible: false,
  readiness: "MONITORED",
});

function member(over: Partial<PromotableMember> & { itemId: string }): PromotableMember {
  return {
    sourceId: over.contract?.id ?? "A02",
    role: "PRIMARY_OFFICIAL",
    contract: SHOPIFY,
    item: {
      title: "Checkout extensibility deadline moves to March",
      titleEn: null,
      summaryEn: null,
      url: `https://example.com/${over.itemId}`,
      publishedAt: new Date("2026-07-20T10:00:00Z"),
      crawledAt: new Date("2026-07-20T11:00:00Z"),
      regions: ["US"],
      urgencyScore: null,
    },
    ...over,
  } as PromotableMember;
}

function cluster(members: PromotableMember[], fingerprint = "fp-1"): PromotableCluster {
  return { clusterId: "cluster-1", fingerprint, members };
}

// ---- anchor eligibility ---------------------------------------------------

describe("promotion anchor eligibility", () => {
  it("accepts a primary-evidence source graded MONITORED", () => {
    expect(isPromotableAnchor(SHOPIFY)).toBe(true);
    expect(isPromotableAnchor(FED_REGISTER)).toBe(true);
  });

  it("rejects a primary-evidence source still graded EXPERIMENTAL", () => {
    // The coverage glossary says EXPERIMENTAL "cannot support a conclusion".
    // Promoting it would create a draft the review UI can only reject —
    // readiness is not editable there, so an unpublishable draft is a dead end.
    expect(isPromotableAnchor(CPSC_RSS)).toBe(false);
  });

  it("rejects secondary reporting however well graded", () => {
    expect(isPromotableAnchor(NEWS)).toBe(false);
  });

  it("rejects an unknown source (no contract)", () => {
    expect(isPromotableAnchor(undefined)).toBe(false);
  });
});

describe("selectPromotionAnchor", () => {
  it("returns null when no member qualifies", () => {
    const c = cluster([
      member({ itemId: "i1", contract: NEWS, role: "SECONDARY_CONTEXT" }),
      member({ itemId: "i2", contract: CPSC_RSS }),
    ]);
    expect(selectPromotionAnchor(c)).toBeNull();
  });

  it("picks the newest qualifying member", () => {
    const older = member({ itemId: "old" });
    const newer = member({ itemId: "new" });
    newer.item.publishedAt = new Date("2026-07-25T00:00:00Z");
    const c = cluster([older, newer]);
    expect(selectPromotionAnchor(c)?.itemId).toBe("new");
  });

  it("breaks ties on item id so replays pick the same anchor", () => {
    const b = member({ itemId: "b" });
    const a = member({ itemId: "a" });
    expect(selectPromotionAnchor(cluster([b, a]))?.itemId).toBe("a");
    expect(selectPromotionAnchor(cluster([a, b]))?.itemId).toBe("a");
  });

  it("ignores non-qualifying members when choosing, even if newer", () => {
    const official = member({ itemId: "official" });
    const news = member({ itemId: "news", contract: NEWS, role: "SECONDARY_CONTEXT" });
    news.item.publishedAt = new Date("2026-07-30T00:00:00Z");
    expect(selectPromotionAnchor(cluster([official, news]))?.itemId).toBe("official");
  });
});

// ---- slug -----------------------------------------------------------------

describe("promotionSlug", () => {
  it("is stable for the same fingerprint and title", () => {
    expect(promotionSlug("Fee schedule update", "fp-a")).toBe(
      promotionSlug("Fee schedule update", "fp-a"),
    );
  });

  it("distinguishes identical titles from different clusters", () => {
    expect(promotionSlug("Fee schedule update", "fp-a")).not.toBe(
      promotionSlug("Fee schedule update", "fp-b"),
    );
  });

  it("is url-safe and bounded", () => {
    const slug = promotionSlug("Ünïcode — “quoted” / slashed  title!!! ".repeat(10), "fp");
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug.length).toBeLessThanOrEqual(80);
  });

  it("still yields a slug when the title has no url-safe characters", () => {
    expect(promotionSlug("《》——", "fp-x")).toMatch(/^[a-z0-9-]+$/);
  });
});

// ---- draft construction ---------------------------------------------------

describe("buildPromotionDraft", () => {
  it("returns null for a cluster with no qualifying anchor", () => {
    expect(buildPromotionDraft(cluster([member({ itemId: "i", contract: NEWS })]))).toBeNull();
  });

  it("derives classification from the anchor's contract, not from a guess", () => {
    const draft = buildPromotionDraft(cluster([member({ itemId: "i" })]))!;
    expect(draft.version.signalType).toBe("PLATFORM_POLICY");
    expect(draft.version.platforms).toEqual(["SHOPIFY"]);
    expect(draft.version.market).toBe("US");
    expect(draft.version.productCategories).toEqual(["ALL_PRODUCTS"]);
    expect(draft.version.readiness).toBe("MONITORED");
  });

  it("grades a government source REGULATORY, a platform source PLATFORM_POLICY", () => {
    const gov = buildPromotionDraft(cluster([member({ itemId: "g", contract: FED_REGISTER })]))!;
    expect(gov.version.signalType).toBe("REGULATORY");
    expect(gov.version.platforms).toEqual([]);
  });

  it("takes title and summary from the item and never invents either", () => {
    const m = member({ itemId: "i" });
    m.item.titleEn = "Checkout deadline moves";
    m.item.summaryEn = "Shopify moved the checkout extensibility deadline to March 2027.";
    const draft = buildPromotionDraft(cluster([m]))!;
    expect(draft.version.title).toBe("Checkout deadline moves");
    expect(draft.version.summary).toBe(m.item.summaryEn);
  });

  it("falls back to the item title when no summary exists, rather than fabricating one", () => {
    const draft = buildPromotionDraft(cluster([member({ itemId: "i" })]))!;
    expect(draft.version.summary).toBe("Checkout extensibility deadline moves to March");
  });

  it("restates the source as impact and never asserts an action", () => {
    const draft = buildPromotionDraft(cluster([member({ itemId: "i" })]))!;
    // generalImpact is a restatement of the source, not an inferred consequence.
    expect(draft.version.generalImpact).toBe(draft.version.summary);
    // An action recommendation would need a reviewed template; we assert none.
    expect(draft.version.generalActionTemplate).toBeNull();
  });

  it("produces a draft the public read contract cannot select", () => {
    const draft = buildPromotionDraft(cluster([member({ itemId: "i" })]))!;
    expect(draft.version.editorialStatus).toBe("DRAFT");
    expect(draft.version.isCurrent).toBe(false);
    expect(draft.version.version).toBe(1);
    // Not "reviewedAt is null" — the key is never written at all, so the
    // column keeps its default and no code path can set it by accident.
    expect("reviewedAt" in draft.version).toBe(false);
    expect("reviewedBy" in draft.version).toBe(false);
  });

  it("leaves operating stages empty so the classifier routes it to review", () => {
    const draft = buildPromotionDraft(cluster([member({ itemId: "i" })]))!;
    expect(draft.version.operatingStages).toEqual([]);
    expect(draft.requiresReview).toBe(true);
    expect(draft.reviewReasons).toContain("AMBIGUOUS_OPERATING_STAGES");
    expect(draft.reviewReasons).toContain("LOW_CONFIDENCE");
  });

  it("records zero confidence rather than implying a classification it did not make", () => {
    const draft = buildPromotionDraft(cluster([member({ itemId: "i" })]))!;
    expect(draft.version.classificationConfidence).toBe(0);
  });

  it("carries the item's dates and regions verbatim", () => {
    const draft = buildPromotionDraft(cluster([member({ itemId: "i" })]))!;
    expect(draft.version.sourcePublishedAt).toEqual(new Date("2026-07-20T10:00:00Z"));
    expect(draft.version.effectiveAt).toBeNull();
    expect(draft.version.regions).toEqual(["US"]);
  });

  it("clamps urgency from the item score and defaults when absent", () => {
    const scored = member({ itemId: "s" });
    scored.item.urgencyScore = 4.6;
    expect(buildPromotionDraft(cluster([scored]))!.version.urgency).toBe(5);

    const wild = member({ itemId: "w" });
    wild.item.urgencyScore = 99;
    expect(buildPromotionDraft(cluster([wild]))!.version.urgency).toBe(5);

    expect(buildPromotionDraft(cluster([member({ itemId: "n" })]))!.version.urgency).toBe(3);
  });
});

// ---- evidence -------------------------------------------------------------

describe("promotion evidence", () => {
  it("records every cluster member, not only the anchor", () => {
    const a = member({ itemId: "anchor" });
    const n = member({ itemId: "news", contract: NEWS, role: "SECONDARY_CONTEXT" });
    const draft = buildPromotionDraft(cluster([a, n]))!;
    expect(draft.evidence).toHaveLength(2);
    expect(draft.evidence.map((e) => e.sourceItemId).sort()).toEqual(["anchor", "news"]);
  });

  it("preserves each member's evidence role and authority", () => {
    const draft = buildPromotionDraft(
      cluster([member({ itemId: "a" }), member({ itemId: "n", contract: NEWS, role: "SECONDARY_CONTEXT" })]),
    )!;
    const news = draft.evidence.find((e) => e.sourceItemId === "n")!;
    expect(news.role).toBe("SECONDARY_CONTEXT");
    expect(news.authorityLevel).toBe("REPUTABLE_SECONDARY");
  });

  it("leaves evidence unreviewed — a Verified claim must not be reachable unattended", () => {
    const draft = buildPromotionDraft(cluster([member({ itemId: "a" })]))!;
    // A reviewed PRIMARY_OFFICIAL record is precisely what unlocks VERIFIED
    // publication. The key is never written, so no unattended run can grant it.
    expect(draft.evidence.every((e) => !("reviewedAt" in e))).toBe(true);
  });

  it("deduplicates members that share a url, which the schema forbids twice", () => {
    const a = member({ itemId: "a" });
    const b = member({ itemId: "b" });
    b.item.url = a.item.url;
    const draft = buildPromotionDraft(cluster([a, b]))!;
    expect(draft.evidence).toHaveLength(1);
  });

  it("drops a member with no contract rather than guessing its authority", () => {
    const known = member({ itemId: "known" });
    const unknown = member({ itemId: "unknown", contract: undefined, role: "SECONDARY_CONTEXT" });
    const draft = buildPromotionDraft(cluster([known, unknown]))!;
    expect(draft.evidence.map((e) => e.sourceItemId)).toEqual(["known"]);
  });
});

// ---- batch phase ----------------------------------------------------------

/**
 * The promotion phase rides inside `canonicalize` rather than a ninth Railway
 * service. These tests pin the properties that matter when it runs unattended
 * every four hours: it is bounded, individual failures do not poison the run,
 * a replay is a no-op, and the job's reported status reflects the promotion
 * work it actually did.
 */

function batchArgs(): JobArgs {
  return { scheduledFor: new Date("2026-08-05T04:00:00Z"), runnerVersion: "test", dryRun: false };
}

function promotableCluster(id: string): PromotableCluster {
  return cluster([member({ itemId: `${id}-item` })], `fp-${id}`);
}

/**
 * `classifyRelevance` defaults to allow-all here so the mechanics tests below
 * (counts, failure isolation, idempotency, bounds) keep testing mechanics.
 * The gate's own behaviour — including that its ABSENCE promotes nothing — is
 * pinned separately in "canonicalize relevance gate".
 */
function makeBatch(over: Partial<CanonicalizeDeps> = {}) {
  const runs: Record<string, unknown>[] = [];
  const base: CanonicalizeDeps = {
    async selectOrphans() { return []; },
    async upsertCluster() { return "cluster-x"; },
    async upsertMember() { return false; },
    async beginRun() { return "run-1"; },
    async finishRun(_runId, summary) { runs.push(summary); },
    async classifyRelevance(items) {
      return new Map(items.map((i) => [i.id, { keep: true, reason: "allow-all", confidence: 1 }]));
    },
    ...over,
  };
  return { batch: createCanonicalizeBatch(base), runs };
}

describe("canonicalize promotion phase", () => {
  it("does nothing when the promotion deps are absent", async () => {
    const { batch } = makeBatch();
    const result = await batch(batchArgs());
    expect(result.status).toBe("SUCCEEDED_EMPTY");
    expect(result.exitCode).toBe(0);
  });

  it("promotes every qualifying cluster and counts the work", async () => {
    const promoted: string[] = [];
    const { batch } = makeBatch({
      async selectPromotableClusters() {
        return [promotableCluster("a"), promotableCluster("b")];
      },
      async promoteCluster(draft: PromotionDraft) {
        promoted.push(draft.clusterId);
        return "PROMOTED";
      },
    });
    const result = await batch(batchArgs());
    expect(promoted).toHaveLength(2);
    expect(result.attempted).toBe(2);
    expect(result.succeeded).toBe(2);
    expect(result.itemCount).toBe(2);
    // A run that promoted two changes must not report itself empty.
    expect(result.status).toBe("SUCCEEDED_ITEMS");
  });

  it("passes a fully-built draft, not a raw cluster", async () => {
    let seen: PromotionDraft | null = null;
    const { batch } = makeBatch({
      async selectPromotableClusters() { return [promotableCluster("a")]; },
      async promoteCluster(draft: PromotionDraft) { seen = draft; return "PROMOTED"; },
    });
    await batch(batchArgs());
    expect(seen!.version.editorialStatus).toBe("DRAFT");
    expect(seen!.slug).toMatch(/^[a-z0-9-]+$/);
    expect(seen!.evidence.length).toBeGreaterThan(0);
  });

  it("skips a cluster that lost its anchor between selection and build", async () => {
    // Selection filters in SQL by source id; readiness lives in code. A source
    // regraded down between the two leaves a selected cluster unpromotable.
    const { batch } = makeBatch({
      async selectPromotableClusters() {
        return [cluster([member({ itemId: "x", contract: NEWS, role: "SECONDARY_CONTEXT" })], "fp-x")];
      },
      async promoteCluster() { throw new Error("must not be called"); },
    });
    const result = await batch(batchArgs());
    expect(result.attempted).toBe(0);
    expect(result.status).toBe("SUCCEEDED_EMPTY");
    expect(result.exitCode).toBe(0);
  });

  it("counts an already-promoted cluster as done, not as new work", async () => {
    const { batch } = makeBatch({
      async selectPromotableClusters() { return [promotableCluster("a")]; },
      async promoteCluster() { return "ALREADY_PROMOTED"; },
    });
    const result = await batch(batchArgs());
    expect(result.attempted).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.itemCount).toBe(0); // idempotent replay creates nothing
    expect(result.exitCode).toBe(0);
  });

  it("isolates a failing promotion so the rest of the batch still lands", async () => {
    const promoted: string[] = [];
    const { batch } = makeBatch({
      async selectPromotableClusters() {
        return [promotableCluster("a"), promotableCluster("b"), promotableCluster("c")];
      },
      async promoteCluster(draft: PromotionDraft) {
        if (draft.clusterId === "cluster-1" && draft.fingerprint === "fp-b") {
          throw new Error("constraint violation");
        }
        promoted.push(draft.fingerprint);
        return "PROMOTED";
      },
    });
    const result = await batch(batchArgs());
    expect(promoted.sort()).toEqual(["fp-a", "fp-c"]);
    expect(result.attempted).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.status).toBe("PARTIAL");
    expect(result.exitCode).toBe(1);
  });

  it("asks for a bounded number of clusters so a 3,000-row backlog cannot hang the slot", async () => {
    let askedFor = -1;
    const { batch } = makeBatch({
      async selectPromotableClusters(limit: number) { askedFor = limit; return []; },
      async promoteCluster() { return "PROMOTED"; },
    });
    await batch(batchArgs());
    expect(askedFor).toBeGreaterThan(0);
    expect(askedFor).toBeLessThanOrEqual(500);
  });
});

// ---- recency ---------------------------------------------------------------

/**
 * A change from 2018 is not a change; it is history.
 *
 * The Shopify changelog feed carries its full archive — 1,561 clustered items
 * reaching back to 2018-08-03 — so the first promotion run treated eight years
 * of feature announcements as current US-market intelligence. The volume alone
 * made human review impossible, and publishing any of it would have been a
 * false claim about what changed.
 *
 * The window is part of the product's definition of a change, not a
 * performance tweak: what falls outside it is never promoted, at any depth of
 * backlog.
 */

describe("promotion recency", () => {
  const NOW = new Date("2026-08-05T00:00:00Z");

  function aged(itemId: string, daysAgo: number): PromotableMember {
    const m = member({ itemId });
    m.item.publishedAt = new Date(NOW.getTime() - daysAgo * 86400_000);
    return m;
  }

  it("promotes a change published inside the window", () => {
    expect(buildPromotionDraft(cluster([aged("fresh", 10)]), NOW)).not.toBeNull();
  });

  it("refuses a change older than the window", () => {
    expect(buildPromotionDraft(cluster([aged("ancient", 400)]), NOW)).toBeNull();
  });

  it("uses the window boundary inclusively, so a run cannot drop an edge case", () => {
    expect(buildPromotionDraft(cluster([aged("edge", PROMOTION_MAX_AGE_DAYS)]), NOW)).not.toBeNull();
    expect(buildPromotionDraft(cluster([aged("past", PROMOTION_MAX_AGE_DAYS + 1)]), NOW)).toBeNull();
  });

  it("judges recency on the anchor, not on stale corroborating evidence", () => {
    // A fresh official announcement discussed again by an old article is still
    // a fresh change; the anchor is what dates it.
    const fresh = aged("fresh", 5);
    const oldNews = aged("old-news", 900);
    oldNews.contract = NEWS;
    oldNews.role = "SECONDARY_CONTEXT";
    const draft = buildPromotionDraft(cluster([fresh, oldNews]), NOW)!;
    expect(draft.anchorItemId).toBe("fresh");
    // The old article still travels as evidence — it is context, not the claim.
    expect(draft.evidence.map((e) => e.sourceItemId).sort()).toEqual(["fresh", "old-news"]);
  });

  it("refuses when only the non-qualifying evidence is recent", () => {
    const oldAnchor = aged("old-anchor", 500);
    const freshNews = aged("fresh-news", 1);
    freshNews.contract = NEWS;
    freshNews.role = "SECONDARY_CONTEXT";
    expect(buildPromotionDraft(cluster([oldAnchor, freshNews]), NOW)).toBeNull();
  });

  it("defaults to the current clock when no time is supplied", () => {
    // Production passes the job's scheduledFor; the default keeps the pure
    // builder usable without threading a clock through every caller.
    const veryOld = member({ itemId: "very-old" });
    veryOld.item.publishedAt = new Date("2018-08-03T00:00:00Z");
    expect(buildPromotionDraft(cluster([veryOld]))).toBeNull();
  });
});

// ---- relevance gate --------------------------------------------------------

/**
 * The relevance gate inside the batch.
 *
 * The anchor gate asks whether a source is authoritative and current; it
 * cannot ask whether the change matters. Both Shopify's changelog and the
 * Federal Register pass the anchor gate while mostly carrying items no
 * cross-border consumer-goods seller must act on.
 *
 * What is pinned here is the failure behaviour, because that is what runs
 * unattended every four hours: no classifier, a thrown classifier, an empty
 * verdict — each must promote nothing rather than fall back to promoting
 * everything.
 */

describe("canonicalize relevance gate", () => {
  function relevantCluster(id: string): PromotableCluster {
    const m = member({ itemId: `${id}-item` });
    m.item.publishedAt = new Date("2026-08-01T00:00:00Z");
    return cluster([m], `fp-${id}`);
  }

  function batchWithClusters(
    ids: string[],
    over: Partial<CanonicalizeDeps> = {},
  ) {
    const promoted: string[] = [];
    const { batch, runs } = makeBatch({
      async selectPromotableClusters() { return ids.map(relevantCluster); },
      async promoteCluster(draft: PromotionDraft) {
        promoted.push(draft.fingerprint);
        return "PROMOTED";
      },
      ...over,
    });
    return { batch, promoted, runs };
  }

  it("promotes only what the classifier keeps", async () => {
    const { batch, promoted } = batchWithClusters(["a", "b", "c"], {
      async classifyRelevance(items) {
        return new Map(items.map((i) => [i.id, {
          keep: i.id.startsWith("fp-b"),
          reason: "test",
          confidence: 1,
        }]));
      },
    });
    const result = await batch(batchArgs());
    expect(promoted).toEqual(["fp-b"]);
    expect(result.itemCount).toBe(1);
  });

  it("promotes nothing when no classifier is configured", async () => {
    // Fail closed. Without a relevance judgment we cannot claim a change
    // matters, and promoting everything is the behaviour this gate exists to
    // stop — so an unconfigured key halts promotion rather than reverting to it.
    const { batch, promoted } = batchWithClusters(["a", "b"], { classifyRelevance: undefined });
    const result = await batch(batchArgs());
    expect(promoted).toEqual([]);
    expect(result.attempted).toBe(0);
    expect(result.exitCode).toBe(0);
  });

  it("promotes nothing when the classifier throws", async () => {
    const { batch, promoted } = batchWithClusters(["a", "b"], {
      async classifyRelevance() { throw new Error("deepseek 500"); },
    });
    const result = await batch(batchArgs());
    expect(promoted).toEqual([]);
    expect(result.exitCode).toBe(0);
  });

  it("promotes nothing when the classifier returns an empty verdict set", async () => {
    const { batch, promoted } = batchWithClusters(["a", "b"], {
      async classifyRelevance() { return new Map(); },
    });
    await batch(batchArgs());
    expect(promoted).toEqual([]);
  });

  it("records how many were dropped, so a silent gate cannot hide", async () => {
    const { batch, runs } = batchWithClusters(["a", "b", "c"], {
      async classifyRelevance(items) {
        return new Map(items.map((i) => [i.id, {
          keep: i.id.startsWith("fp-a"), reason: "r", confidence: 1,
        }]));
      },
    });
    await batch(batchArgs());
    const summary = runs[0] as unknown as { relevanceDropped?: number };
    expect(summary.relevanceDropped).toBe(2);
  });

  it("asks the classifier once per batch, not once per cluster", async () => {
    let calls = 0;
    const { batch } = batchWithClusters(["a", "b", "c", "d"], {
      async classifyRelevance(items) {
        calls++;
        return new Map(items.map((i) => [i.id, { keep: true, reason: "r", confidence: 1 }]));
      },
    });
    await batch(batchArgs());
    expect(calls).toBe(1);
  });

  it("does not consult the classifier about clusters it would reject anyway", async () => {
    // An out-of-window or unanchored cluster is already excluded; paying a
    // model call to re-confirm that would be waste.
    let seen: string[] = [];
    const stale = cluster([member({ itemId: "old" })], "fp-stale");
    stale.members[0]!.item.publishedAt = new Date("2020-01-01T00:00:00Z");
    const { batch } = makeBatch({
      async selectPromotableClusters() { return [relevantCluster("fresh"), stale]; },
      async classifyRelevance(items) {
        seen = items.map((i) => i.id);
        return new Map(items.map((i) => [i.id, { keep: true, reason: "r", confidence: 1 }]));
      },
      async promoteCluster() { return "PROMOTED"; },
    });
    await batch(batchArgs());
    expect(seen).toEqual(["fp-fresh"]);
  });
});

// ---- verdict persistence ---------------------------------------------------

/**
 * A drop must stick.
 *
 * Measured against production, the same 140 candidates judged twice returned
 * different keep sets (6, then 3) despite temperature 0 — MiniMax does not
 * guarantee determinism. A rejected cluster stays selectable, so it would be
 * re-judged every four hours for the whole ninety-day window: roughly 540
 * attempts. Under repeated sampling anything with even a small keep
 * probability eventually passes, which quietly converts a fail-closed gate
 * into "keeps everything borderline, given time".
 *
 * Recording the verdict on the cluster makes the judgment happen once. It also
 * stops the slot re-paying for ~134 verdicts it has already bought.
 */

describe("relevance verdicts persist", () => {
  function freshCluster(id: string): PromotableCluster {
    const m = member({ itemId: `${id}-item` });
    m.item.publishedAt = new Date("2026-08-01T00:00:00Z");
    return cluster([m], `fp-${id}`);
  }

  it("records a rejection so the cluster is never judged twice", async () => {
    const rejected: Array<{ clusterId: string; reason: string }> = [];
    const { batch } = makeBatch({
      async selectPromotableClusters() { return [freshCluster("a"), freshCluster("b")]; },
      async classifyRelevance(items) {
        return new Map(items.map((i) => [i.id, {
          keep: i.id === "fp-a", reason: "optional feature", confidence: 0.9,
        }]));
      },
      async promoteCluster() { return "PROMOTED"; },
      async rejectCluster(clusterId, reason) { rejected.push({ clusterId, reason }); },
    });
    await batch(batchArgs());
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBe("optional feature");
  });

  it("does not reject when the classifier itself was unavailable", async () => {
    // Absent judgment is not a verdict. Rejecting here would permanently bury
    // clusters because a key was missing or the API had a bad minute.
    const rejected: string[] = [];
    const { batch } = makeBatch({
      async selectPromotableClusters() { return [freshCluster("a")]; },
      classifyRelevance: undefined,
      async promoteCluster() { return "PROMOTED"; },
      async rejectCluster(clusterId) { rejected.push(clusterId); },
    });
    await batch(batchArgs());
    expect(rejected).toEqual([]);
  });

  it("does not reject when the classifier threw", async () => {
    const rejected: string[] = [];
    const { batch } = makeBatch({
      async selectPromotableClusters() { return [freshCluster("a")]; },
      async classifyRelevance() { throw new Error("api down"); },
      async promoteCluster() { return "PROMOTED"; },
      async rejectCluster(clusterId) { rejected.push(clusterId); },
    });
    await batch(batchArgs());
    expect(rejected).toEqual([]);
  });

  it("does not reject an item the model simply failed to return a verdict for", async () => {
    const rejected: string[] = [];
    const { batch } = makeBatch({
      async selectPromotableClusters() { return [freshCluster("a"), freshCluster("b")]; },
      async classifyRelevance(items) {
        // Only one of the two comes back — the other is unjudged, not rejected.
        return new Map([[items[0]!.id, { keep: true, reason: "r", confidence: 1 }]]);
      },
      async promoteCluster() { return "PROMOTED"; },
      async rejectCluster(clusterId) { rejected.push(clusterId); },
    });
    await batch(batchArgs());
    expect(rejected).toEqual([]);
  });

  it("survives a failing rejection write without losing the rest of the slot", async () => {
    const promoted: string[] = [];
    const { batch } = makeBatch({
      async selectPromotableClusters() { return [freshCluster("a"), freshCluster("b")]; },
      async classifyRelevance(items) {
        return new Map(items.map((i) => [i.id, {
          keep: i.id === "fp-a", reason: "r", confidence: 0.9,
        }]));
      },
      async promoteCluster(draft) { promoted.push(draft.fingerprint); return "PROMOTED"; },
      async rejectCluster() { throw new Error("write failed"); },
    });
    const result = await batch(batchArgs());
    expect(promoted).toEqual(["fp-a"]);
    expect(result.exitCode).toBe(0);
  });
});

// ---- summary derivation ----------------------------------------------------

/**
 * The draft must carry the publisher's words, not just their headline.
 *
 * Promotion wrote `summaryEn ?? title`, and `summaryEn` is null on all but 24
 * of A02's 1,564 items — so six of the eight production drafts had a summary
 * that was the title repeated verbatim. The site's "What changed" panel read
 * as a headline echo, and there was nothing for an interpreter to work from.
 *
 * The body was there the whole time: 1,550 A02 items carry up to 10 KB of
 * rawContent. It simply never reached the draft.
 */

describe("deriveSummary", () => {
  const TITLE = "Benchmark Comparisons will be removed";

  it("prefers a reviewed English summary when one exists", () => {
    expect(
      deriveSummary({ titleEn: null, summaryEn: "A human-checked summary.", rawContent: { contentSnippet: "raw" } }, TITLE),
    ).toBe("A human-checked summary.");
  });

  it("falls back to the publisher's own plain-text snippet", () => {
    expect(
      deriveSummary({ titleEn: null, summaryEn: null, rawContent: { contentSnippet: "Benchmark data stops on May 19." } }, TITLE),
    ).toBe("Benchmark data stops on May 19.");
  });

  it("accepts an abstract, which is what the Federal Register supplies", () => {
    expect(
      deriveSummary({ titleEn: null, summaryEn: null, rawContent: { abstract: "Commerce amended the final results." } }, TITLE),
    ).toBe("Commerce amended the final results.");
  });

  it("strips markup when only the HTML body is available", () => {
    const summary = deriveSummary(
      { titleEn: null, summaryEn: null, rawContent: { content: "<p>Data stops <b>May 19</b>.</p>\n<p>Use targets.</p>" } },
      TITLE,
    );
    expect(summary).toBe("Data stops May 19. Use targets.");
    expect(summary).not.toMatch(/[<>]/);
  });

  it("falls back to the title only when there is genuinely no body", () => {
    expect(deriveSummary({ titleEn: null, summaryEn: null, rawContent: null }, TITLE)).toBe(TITLE);
  });

  it("ignores a body too short to say anything", () => {
    // A stray "Read more" is not a summary; the title is more honest.
    expect(
      deriveSummary({ titleEn: null, summaryEn: null, rawContent: { contentSnippet: "Read more" } }, TITLE),
    ).toBe(TITLE);
  });

  it("bounds a long body and cuts at a sentence, not mid-word", () => {
    const body = "First sentence here. " + "Filler sentence that runs on. ".repeat(60);
    const summary = deriveSummary({ titleEn: null, summaryEn: null, rawContent: { contentSnippet: body } }, TITLE);
    expect(summary.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    expect(summary).toMatch(/[.!?]$/);
    // The cut must land on a real boundary in the source, never inside a word:
    // the excerpt is a verbatim prefix, and the source continues with a space.
    expect(body.startsWith(summary)).toBe(true);
    expect(body[summary.length]).toBe(" ");
  });

  it("keeps a body that has no sentence break usable rather than dropping it", () => {
    const body = "word ".repeat(300).trim();
    const summary = deriveSummary({ titleEn: null, summaryEn: null, rawContent: { contentSnippet: body } }, TITLE);
    expect(summary.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS);
    expect(summary.startsWith("word")).toBe(true);
  });

  it("collapses the whitespace RSS bodies arrive with", () => {
    expect(
      deriveSummary(
        { titleEn: null, summaryEn: null, rawContent: { contentSnippet: "Benchmark data stops.\n\n  Use Metric Targets instead." } },
        TITLE,
      ),
    ).toBe("Benchmark data stops. Use Metric Targets instead.");
  });
});

describe("buildPromotionDraft summary", () => {
  it("no longer repeats the title when a body exists", () => {
    const m = member({ itemId: "i" });
    m.item.rawContent = { contentSnippet: "Shopify will apply the default disclosure on June 22." };
    const draft = buildPromotionDraft(cluster([m]))!;
    expect(draft.version.summary).toBe("Shopify will apply the default disclosure on June 22.");
    expect(draft.version.summary).not.toBe(draft.version.title);
  });

  it("gives the evidence record the same grounded text", () => {
    const m = member({ itemId: "i" });
    m.item.rawContent = { contentSnippet: "Shopify will apply the default disclosure on June 22." };
    const draft = buildPromotionDraft(cluster([m]))!;
    expect(draft.evidence[0]!.normalizedSummary).toBe(draft.version.summary);
  });

  it("still restates the source as impact — never an inferred consequence", () => {
    const m = member({ itemId: "i" });
    m.item.rawContent = { contentSnippet: "Shopify will apply the default disclosure on June 22." };
    const draft = buildPromotionDraft(cluster([m]))!;
    expect(draft.version.generalImpact).toBe(draft.version.summary);
    expect(draft.version.generalActionTemplate).toBeNull();
  });
});

// ---- action templates ------------------------------------------------------

/**
 * Generating the "what this means for you" note during promotion.
 *
 * The slot has been designed and gated since the Foundation and left null,
 * because promotion refuses to write prose it cannot ground. The interpreter
 * grounds it: the model must quote the phrase from the source that carries its
 * conclusion, and the quote is checked against the source before the template
 * is kept.
 *
 * Attaching a template deliberately makes the draft harder to publish, not
 * easier: ACTION_TEMPLATE_REQUIRES_REVIEW blocks publication until a reviewer
 * has read it. That is the correct direction — the template is the product
 * asserting something about what a seller must do.
 */

describe("promotion action templates", () => {
  function freshMember(id: string): PromotableMember {
    const m = member({ itemId: `${id}-item` });
    m.item.publishedAt = new Date("2026-08-01T00:00:00Z");
    m.item.rawContent = { contentSnippet: "Shopify will apply the default disclosure on June 22." };
    return m;
  }
  function freshCluster(id: string): PromotableCluster {
    return cluster([freshMember(id)], `fp-${id}`);
  }
  function allowAll(items: Array<{ id: string }>) {
    return new Map(items.map((i) => [i.id, { keep: true, reason: "r", confidence: 1 }]));
  }

  it("attaches a generated template to the draft", async () => {
    let seen: PromotionDraft | null = null;
    const { batch } = makeBatch({
      async selectPromotableClusters() { return [freshCluster("a")]; },
      async classifyRelevance(items) { return allowAll(items); },
      async generateActionTemplate() { return "Review the disclosure before June 22."; },
      async promoteCluster(draft) { seen = draft; return "PROMOTED"; },
    });
    await batch(batchArgs());
    expect(seen!.version.generalActionTemplate).toBe("Review the disclosure before June 22.");
  });

  it("leaves the template unreviewed, so publication still needs a human", async () => {
    let seen: PromotionDraft | null = null;
    const { batch } = makeBatch({
      async selectPromotableClusters() { return [freshCluster("a")]; },
      async classifyRelevance(items) { return allowAll(items); },
      async generateActionTemplate() { return "Do the thing."; },
      async promoteCluster(draft) { seen = draft; return "PROMOTED"; },
    });
    await batch(batchArgs());
    expect("actionTemplateReviewedAt" in seen!.version).toBe(false);
    expect("actionTemplateReviewedBy" in seen!.version).toBe(false);
  });

  it("promotes without a template when the writer declines", async () => {
    // A refusal is the correct answer for material too thin to interpret. The
    // change is still worth publishing; it just carries no note.
    let seen: PromotionDraft | null = null;
    const { batch } = makeBatch({
      async selectPromotableClusters() { return [freshCluster("a")]; },
      async classifyRelevance(items) { return allowAll(items); },
      async generateActionTemplate() { return null; },
      async promoteCluster(draft) { seen = draft; return "PROMOTED"; },
    });
    const result = await batch(batchArgs());
    expect(seen!.version.generalActionTemplate).toBeNull();
    expect(result.itemCount).toBe(1);
  });

  it("promotes without a template when the writer throws", async () => {
    // Fail soft in this one direction only: a missing note costs a reader
    // nothing, while losing the draft loses the change entirely.
    let seen: PromotionDraft | null = null;
    const { batch } = makeBatch({
      async selectPromotableClusters() { return [freshCluster("a")]; },
      async classifyRelevance(items) { return allowAll(items); },
      async generateActionTemplate() { throw new Error("model timeout"); },
      async promoteCluster(draft) { seen = draft; return "PROMOTED"; },
    });
    const result = await batch(batchArgs());
    expect(seen!.version.generalActionTemplate).toBeNull();
    expect(result.exitCode).toBe(0);
  });

  it("promotes normally when no writer is configured at all", async () => {
    let seen: PromotionDraft | null = null;
    const { batch } = makeBatch({
      async selectPromotableClusters() { return [freshCluster("a")]; },
      async classifyRelevance(items) { return allowAll(items); },
      async promoteCluster(draft) { seen = draft; return "PROMOTED"; },
    });
    await batch(batchArgs());
    expect(seen!.version.generalActionTemplate).toBeNull();
  });

  it("never writes a template for a cluster the relevance gate dropped", async () => {
    // Interpretation is the expensive call; spending it on something that will
    // not be promoted is pure waste.
    let calls = 0;
    const { batch } = makeBatch({
      async selectPromotableClusters() { return [freshCluster("a"), freshCluster("b")]; },
      async classifyRelevance(items) {
        return new Map(items.map((i) => [i.id, { keep: i.id === "fp-a", reason: "r", confidence: 1 }]));
      },
      async generateActionTemplate() { calls++; return "note"; },
      async promoteCluster() { return "PROMOTED"; },
      async rejectCluster() {},
    });
    await batch(batchArgs());
    expect(calls).toBe(1);
  });

  it("passes the anchor's source text, not the headline", async () => {
    let received = "";
    const { batch } = makeBatch({
      async selectPromotableClusters() { return [freshCluster("a")]; },
      async classifyRelevance(items) { return allowAll(items); },
      async generateActionTemplate(input) { received = input.sourceText; return "note"; },
      async promoteCluster() { return "PROMOTED"; },
    });
    await batch(batchArgs());
    expect(received).toContain("default disclosure on June 22");
  });

  it("stops writing templates past a per-slot bound", async () => {
    // One model call per draft is the quality-driven choice (batched judging
    // measurably collapsed to applies=false), so the slot needs a ceiling.
    let calls = 0;
    const many = Array.from({ length: TEMPLATE_MAX_PER_RUN + 5 }, (_, i) => freshCluster(`c${i}`));
    const { batch } = makeBatch({
      async selectPromotableClusters() { return many; },
      async classifyRelevance(items) { return allowAll(items); },
      async generateActionTemplate() { calls++; return "note"; },
      async promoteCluster() { return "PROMOTED"; },
    });
    const result = await batch(batchArgs());
    expect(calls).toBe(TEMPLATE_MAX_PER_RUN);
    // Every cluster is still promoted; only the note is rationed.
    expect(result.succeeded).toBe(many.length);
  });
});
