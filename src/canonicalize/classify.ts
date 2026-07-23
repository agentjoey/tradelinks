/**
 * Typed classification of a canonical evidence cluster.
 *
 * Deterministic safety gates run over the model's suggestion; anything
 * uncertain routes to review instead of auto-publishing:
 *  - confidence below 0.80
 *  - ambiguous operating-stage impact (no stages asserted)
 *  - incompatible product categories (ALL_PRODUCTS mixed with specific
 *    categories, or evidence items with disjoint category hints)
 *  - unsupported dates (unparseable effective/published dates)
 *  - missing evidence item ids
 *
 * Pure + unit-tested; the suggestion typically comes from
 * parseCanonicalClassify (src/ai/prompts/categorize.ts) and the two shapes
 * must stay in agreement.
 */
import type { MarketCode, OperatingStage, PlatformCode } from "@prisma/client";

import type {
  PolicyTopic,
  ProductCategory,
  RiskAttribute,
  SignalType,
} from "../domain/intelligence/taxonomy.js";
import { isoDay, type SourceItemFacts } from "./fingerprint.js";

/** Minimum confidence for a classification to leave the review queue. */
export const CONFIDENCE_THRESHOLD = 0.8;

/** The model's proposed classification for a cluster. */
export interface ClassificationSuggestion {
  signalType: SignalType;
  productCategories: ProductCategory[];
  riskAttributes: RiskAttribute[];
  policyTopics: PolicyTopic[];
  market: MarketCode;
  platforms: PlatformCode[];
  operatingStages: OperatingStage[];
  confidence: number;
}

export interface ClusterFacts {
  /** Immutable evidence items backing the cluster. */
  items: SourceItemFacts[];
  /** Model suggestion; absent/empty means confidence 0 => review. */
  suggestion?: ClassificationSuggestion | null;
}

export type ReviewReason =
  | "MISSING_EVIDENCE_ITEM_IDS"
  | "LOW_CONFIDENCE"
  | "AMBIGUOUS_OPERATING_STAGES"
  | "INCOMPATIBLE_CATEGORIES"
  | "UNSUPPORTED_DATES";

export interface ClassificationDecision {
  signalType: SignalType;
  productCategories: ProductCategory[];
  riskAttributes: RiskAttribute[];
  policyTopics: PolicyTopic[];
  market: MarketCode;
  platforms: PlatformCode[];
  operatingStages: OperatingStage[];
  confidence: number;
  evidenceItemIds: string[];
  requiresReview: boolean;
  reviewReasons: ReviewReason[];
}

const EMPTY_SUGGESTION: ClassificationSuggestion = {
  signalType: "INDUSTRY",
  productCategories: ["ALL_PRODUCTS"],
  riskAttributes: [],
  policyTopics: [],
  market: "US",
  platforms: [],
  operatingStages: [],
  confidence: 0,
};

function categoriesCompatible(items: SourceItemFacts[], suggestion: ClassificationSuggestion): boolean {
  // ALL_PRODUCTS cannot coexist with specific categories in one decision.
  if (
    suggestion.productCategories.length > 1 &&
    suggestion.productCategories.includes("ALL_PRODUCTS")
  ) {
    return false;
  }
  // Evidence items with non-empty hints must agree on at least one category.
  const hinted = items
    .map((item) => item.productCategories ?? [])
    .filter((categories) => categories.length > 0);
  for (let i = 0; i < hinted.length; i++) {
    for (let j = i + 1; j < hinted.length; j++) {
      const a = hinted[i]!;
      const b = hinted[j]!;
      if (!a.some((category) => b.includes(category))) return false;
    }
  }
  return true;
}

function datesSupported(items: SourceItemFacts[]): boolean {
  return items.every(
    (item) =>
      (item.effectiveAt == null || isoDay(item.effectiveAt) !== null) &&
      isoDay(item.publishedAt) !== null,
  );
}

export async function classifyChange(input: ClusterFacts): Promise<ClassificationDecision> {
  const items = input.items ?? [];
  const suggestion = input.suggestion ?? EMPTY_SUGGESTION;
  const evidenceItemIds = items.map((item) => item.id).filter((id) => id.trim() !== "");

  const reviewReasons: ReviewReason[] = [];
  if (items.length === 0 || evidenceItemIds.length !== items.length) {
    reviewReasons.push("MISSING_EVIDENCE_ITEM_IDS");
  }
  if (suggestion.confidence < CONFIDENCE_THRESHOLD) {
    reviewReasons.push("LOW_CONFIDENCE");
  }
  if (suggestion.operatingStages.length === 0) {
    reviewReasons.push("AMBIGUOUS_OPERATING_STAGES");
  }
  if (!categoriesCompatible(items, suggestion)) {
    reviewReasons.push("INCOMPATIBLE_CATEGORIES");
  }
  if (!datesSupported(items)) {
    reviewReasons.push("UNSUPPORTED_DATES");
  }

  return {
    ...suggestion,
    evidenceItemIds,
    requiresReview: reviewReasons.length > 0,
    reviewReasons,
  };
}
