/**
 * Cluster → CanonicalChange promotion.
 *
 * The gap this closes: `canonicalize-batch` builds EvidenceClusters and stops.
 * Nothing turned a cluster into a CanonicalChange, so the review queue stayed
 * empty, `publish` reported SUCCEEDED_EMPTY on every run, and the public
 * surfaces had nothing to show. Production held 3,667 clusters and 0 changes.
 *
 * Two rules govern everything below.
 *
 * **Never invent prose.** Title, summary and impact come from the source item;
 * market, platforms, categories, signal type and readiness come from the
 * source's own contract. Where we have no basis — operating stages, policy
 * topics, risk attributes, effective dates, action templates — the field stays
 * empty and the classifier routes the draft to a human. A confident-looking
 * draft assembled from defaults is worse than an obviously incomplete one.
 *
 * **Never produce a publicly-visible row.** Every draft is DRAFT, not current,
 * unreviewed, with unreviewed evidence, so `publicBaseCondition()` excludes it
 * by construction. Publication stays a human act.
 *
 * The anchor gate is the publication invariant read backwards: a change may
 * only be claimed where primary-official evidence could support it, from a
 * source already graded fit to support a public conclusion.
 */

import { createHash } from "node:crypto";

import type {
  AuthorityLevel,
  EvidenceAccess,
  EvidenceRole,
  MarketCode,
  OperatingStage,
  PlatformCode,
} from "@prisma/client";

import type {
  PolicyTopic,
  ProductCategory,
  RiskAttribute,
  SignalType,
} from "../domain/intelligence/taxonomy.js";
import type { SourceContract } from "../domain/intelligence/source-contract.js";
import { canSatisfyPrimaryEvidence } from "../domain/intelligence/source-contract.js";
import type { ReviewReason } from "./classify.js";

/** Urgency when the item carries no score. Mid-scale: asserts nothing. */
export const DEFAULT_URGENCY = 3;

/** Longest slug we emit; the disambiguating suffix is always preserved. */
const SLUG_MAX = 80;
const SLUG_HASH_LEN = 8;

// ---- input shapes ---------------------------------------------------------

export interface PromotableItem {
  title: string;
  titleEn: string | null;
  summaryEn: string | null;
  url: string;
  publishedAt: Date;
  crawledAt: Date;
  regions: string[];
  urgencyScore: number | null;
}

export interface PromotableMember {
  itemId: string;
  sourceId: string;
  role: EvidenceRole;
  /** Undefined when the item's source has no Phase 1 contract. */
  contract: SourceContract | undefined;
  item: PromotableItem;
}

export interface PromotableCluster {
  clusterId: string;
  fingerprint: string;
  members: PromotableMember[];
}

// ---- output shapes --------------------------------------------------------

export interface PromotionVersion {
  version: number;
  isCurrent: false;
  title: string;
  summary: string;
  signalType: SignalType;
  market: MarketCode;
  regions: string[];
  platforms: PlatformCode[];
  operatingStages: OperatingStage[];
  productCategories: ProductCategory[];
  riskAttributes: RiskAttribute[];
  policyTopics: PolicyTopic[];
  sourcePublishedAt: Date;
  effectiveAt: Date | null;
  urgency: number;
  readiness: "MONITORED" | "VERIFIED";
  generalImpact: string;
  generalActionTemplate: null;
  editorialStatus: "DRAFT";
  classificationConfidence: number;
}

export interface PromotionEvidence {
  sourceId: string;
  sourceItemId: string;
  url: string;
  role: EvidenceRole;
  authorityLevel: AuthorityLevel;
  publishedAt: Date;
  access: EvidenceAccess;
  licenseNote: string;
  normalizedSummary: string;
  contentHash: string;
  fetchedAt: Date;
}

export interface PromotionDraft {
  clusterId: string;
  fingerprint: string;
  slug: string;
  anchorItemId: string;
  version: PromotionVersion;
  evidence: PromotionEvidence[];
  requiresReview: boolean;
  reviewReasons: ReviewReason[];
}

// ---- anchor gate ----------------------------------------------------------

/**
 * May this source anchor a claimed change?
 *
 * Two conditions, both necessary. It must be able to satisfy the primary
 * evidence invariant at all — secondary reporting never can, however reliable
 * the outlet. And it must already be graded MONITORED or VERIFIED: the
 * coverage glossary reserves EXPERIMENTAL for "observed but unreviewed —
 * cannot support a conclusion", and a draft built on one would be born
 * unpublishable, since the review UI publishes and rejects but cannot regrade
 * readiness. Such a draft can only ever be rejected, so it is noise.
 */
export function isPromotableAnchor(contract: SourceContract | undefined): boolean {
  if (!contract) return false;
  if (!canSatisfyPrimaryEvidence(contract)) return false;
  return contract.readiness === "MONITORED" || contract.readiness === "VERIFIED";
}

/**
 * The member a change is claimed from: newest qualifying evidence, ties broken
 * on item id so a replay of the same cluster picks the same anchor and yields
 * the same slug.
 */
export function selectPromotionAnchor(cluster: PromotableCluster): PromotableMember | null {
  const qualifying = cluster.members.filter((m) => isPromotableAnchor(m.contract));
  if (qualifying.length === 0) return null;
  return qualifying.reduce((best, candidate) => {
    const d = candidate.item.publishedAt.getTime() - best.item.publishedAt.getTime();
    if (d > 0) return candidate;
    if (d < 0) return best;
    return candidate.itemId < best.itemId ? candidate : best;
  });
}

// ---- derivations ----------------------------------------------------------

/**
 * Signal type from the anchor's authority, which is the only thing we know
 * without reading the change. Government/industry official → REGULATORY;
 * platform official → PLATFORM_POLICY. A finer type is a classification
 * judgment, and judgments belong to review.
 */
function signalTypeFor(contract: SourceContract): SignalType {
  return contract.authorityLevel === "PLATFORM_OFFICIAL" ? "PLATFORM_POLICY" : "REGULATORY";
}

/** Legacy urgency scores are 0–5 floats; the column is a 1–5 int. */
export function clampUrgency(score: number | null | undefined): number {
  if (score == null || !Number.isFinite(score)) return DEFAULT_URGENCY;
  return Math.max(1, Math.min(5, Math.round(score)));
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * A readable, stable, unique slug. The title carries the readability (these
 * are public URLs); the fingerprint hash carries the uniqueness, so two
 * genuinely different changes that happen to share a headline never collide.
 */
export function promotionSlug(title: string, fingerprint: string): string {
  const suffix = sha256(fingerprint).slice(0, SLUG_HASH_LEN);
  const body = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, SLUG_MAX - SLUG_HASH_LEN - 1)
    .replace(/-+$/g, "");
  // A title with no url-safe characters at all still needs a slug.
  return body === "" ? `change-${suffix}` : `${body}-${suffix}`;
}

// ---- builder --------------------------------------------------------------

/**
 * Build one draft, or null when the cluster has no qualifying anchor.
 *
 * Pure: no database, no clock, no network. Everything it emits is a function
 * of the cluster it was given.
 */
export function buildPromotionDraft(cluster: PromotableCluster): PromotionDraft | null {
  const anchor = selectPromotionAnchor(cluster);
  if (!anchor) return null;
  const contract = anchor.contract!;

  const title = (anchor.item.titleEn ?? anchor.item.title).trim();
  // No summary is not a licence to write one: restate the title instead.
  const summary = (anchor.item.summaryEn ?? title).trim();

  const version: PromotionVersion = {
    version: 1,
    isCurrent: false,
    title,
    summary,
    signalType: signalTypeFor(contract),
    market: contract.market,
    regions: anchor.item.regions,
    platforms: contract.platforms,
    // Empty on purpose — see the review reasons below. Which stages a change
    // touches cannot be read off a contract.
    operatingStages: [],
    productCategories: contract.categories as ProductCategory[],
    riskAttributes: [],
    policyTopics: [],
    sourcePublishedAt: anchor.item.publishedAt,
    // Effective dates live in the change text, which we have not parsed.
    effectiveAt: null,
    urgency: clampUrgency(anchor.item.urgencyScore),
    readiness: contract.readiness as "MONITORED" | "VERIFIED",
    // A restatement of the source, never an inferred consequence.
    generalImpact: summary,
    generalActionTemplate: null,
    editorialStatus: "DRAFT",
    // We ran no classifier. Saying so is the honest value.
    classificationConfidence: 0,
  };

  const evidence: PromotionEvidence[] = [];
  const seenUrls = new Set<string>();
  for (const m of cluster.members) {
    // Without a contract we cannot state authority, access or licence, and
    // an evidence row asserts all three. Drop it rather than guess.
    if (!m.contract) continue;
    if (seenUrls.has(m.item.url)) continue; // @@unique([changeVersionId, url])
    seenUrls.add(m.item.url);
    evidence.push({
      sourceId: m.sourceId,
      sourceItemId: m.itemId,
      url: m.item.url,
      role: m.role,
      authorityLevel: m.contract.authorityLevel,
      publishedAt: m.item.publishedAt,
      access: m.contract.access,
      licenseNote: m.contract.license,
      normalizedSummary: (m.item.summaryEn ?? m.item.titleEn ?? m.item.title).trim(),
      contentHash: sha256(`${m.item.url}:${m.item.title}`),
      fetchedAt: m.item.crawledAt,
      // reviewedAt stays unset: a reviewed PRIMARY_OFFICIAL record is exactly
      // what unlocks VERIFIED publication, and no unattended job may grant it.
    });
  }

  // These mirror classifyChange's deterministic gates for the inputs we have.
  // We ran no model, so confidence is 0 (LOW_CONFIDENCE), and we asserted no
  // operating stages (AMBIGUOUS_OPERATING_STAGES). Both mean: a human decides.
  const reviewReasons: ReviewReason[] = ["LOW_CONFIDENCE", "AMBIGUOUS_OPERATING_STAGES"];

  return {
    clusterId: cluster.clusterId,
    fingerprint: cluster.fingerprint,
    slug: promotionSlug(title, cluster.fingerprint),
    anchorItemId: anchor.itemId,
    version,
    evidence,
    requiresReview: true,
    reviewReasons,
  };
}
