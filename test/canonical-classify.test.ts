// Gold-tested classification: confidence below 0.80, ambiguous operating
// stages, incompatible categories, unsupported dates, or missing evidence
// item ids always route to review; clean high-confidence input passes through.
// See .pact/tasks/phase1-foundation-canonicalization.md.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  parseCanonicalClassify,
  buildCanonicalClassifyPrompt,
} from "../src/ai/prompts/categorize.js";
import {
  classifyChange,
  CONFIDENCE_THRESHOLD,
  type ClassificationDecision,
  type ClassificationSuggestion,
  type ClusterFacts,
} from "../src/canonicalize/classify.js";
import type { SourceItemFacts } from "../src/canonicalize/fingerprint.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "canonical");

interface AutoCase {
  name: string;
  input: ClusterFacts;
  expect: {
    signalType: string;
    market: string;
    confidence: number;
    requiresReview: boolean;
    evidenceItemIds: string[];
  };
}

interface ReviewCase {
  name: string;
  input: ClusterFacts;
  expectReasons: string[];
}

function loadClassification(): { autoPublishable: AutoCase[]; mustReview: ReviewCase[] } {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, "classification.json"), "utf8"));
}

describe("classification gold cases", () => {
  const { autoPublishable, mustReview } = loadClassification();

  it.each(autoPublishable)("publishes without review: $name", async ({ input, expect: exp }) => {
    const decision: ClassificationDecision = await classifyChange(input);
    expect(decision.requiresReview).toBe(false);
    expect(decision.reviewReasons).toEqual([]);
    expect(decision.signalType).toBe(exp.signalType);
    expect(decision.market).toBe(exp.market);
    expect(decision.confidence).toBe(exp.confidence);
    expect(decision.evidenceItemIds).toEqual(exp.evidenceItemIds);
  });

  it.each(mustReview)("routes to review: $name", async ({ input, expectReasons }) => {
    const decision: ClassificationDecision = await classifyChange(input);
    expect(decision.requiresReview).toBe(true);
    for (const reason of expectReasons) {
      expect(decision.reviewReasons).toContain(reason);
    }
    // a review-routed decision must never look auto-publishable
    expect(decision.evidenceItemIds).toEqual(
      input.items.map((item) => item.id).filter(Boolean),
    );
  });
});

describe("classifyChange review triggers", () => {
  const cleanItem: SourceItemFacts = {
    id: "item-1",
    title: "Amazon raises referral fees for apparel category in October",
    market: "US",
    platforms: ["AMAZON"],
    authorityEventId: "AMZ-FEE-2026-Q4",
    effectiveAt: "2026-10-01",
    publishedAt: "2026-07-08T09:00:00Z",
  };

  const cleanSuggestion: ClassificationSuggestion = {
    signalType: "PLATFORM_POLICY",
    productCategories: ["APPAREL_ACCESSORIES"],
    riskAttributes: [],
    policyTopics: ["FEES_PAYMENTS"],
    market: "US",
    platforms: ["AMAZON"],
    operatingStages: ["ALREADY_SELLING"],
    confidence: CONFIDENCE_THRESHOLD,
  };

  it("accepts confidence exactly at the threshold", async () => {
    const decision = await classifyChange({
      items: [{ ...cleanItem }],
      suggestion: { ...cleanSuggestion },
    });
    expect(decision.requiresReview).toBe(false);
  });

  it("rejects confidence just below the threshold", async () => {
    const decision = await classifyChange({
      items: [{ ...cleanItem }],
      suggestion: { ...cleanSuggestion, confidence: CONFIDENCE_THRESHOLD - 0.001 },
    });
    expect(decision.requiresReview).toBe(true);
    expect(decision.reviewReasons).toContain("LOW_CONFIDENCE");
  });

  it("rejects a missing suggestion (no classification signal)", async () => {
    const decision = await classifyChange({ items: [{ ...cleanItem }] });
    expect(decision.requiresReview).toBe(true);
    expect(decision.reviewReasons).toContain("LOW_CONFIDENCE");
  });

  it("rejects an unparseable published date", async () => {
    const decision = await classifyChange({
      items: [{ ...cleanItem, publishedAt: "someday soon" }],
      suggestion: { ...cleanSuggestion },
    });
    expect(decision.requiresReview).toBe(true);
    expect(decision.reviewReasons).toContain("UNSUPPORTED_DATES");
  });

  it("rejects an evidence item with a blank id", async () => {
    const decision = await classifyChange({
      items: [{ ...cleanItem, id: "  " }],
      suggestion: { ...cleanSuggestion },
    });
    expect(decision.requiresReview).toBe(true);
    expect(decision.reviewReasons).toContain("MISSING_EVIDENCE_ITEM_IDS");
  });

  it("collects multiple reasons at once", async () => {
    const decision = await classifyChange({
      items: [],
      suggestion: { ...cleanSuggestion, confidence: 0.1, operatingStages: [] },
    });
    expect(decision.requiresReview).toBe(true);
    expect(decision.reviewReasons).toEqual(
      expect.arrayContaining([
        "MISSING_EVIDENCE_ITEM_IDS",
        "LOW_CONFIDENCE",
        "AMBIGUOUS_OPERATING_STAGES",
      ]),
    );
  });
});

describe("canonical classify prompt/parser agreement", () => {
  it("parses model JSON into a suggestion classifyChange accepts", async () => {
    const modelText = JSON.stringify({
      signalType: "REGULATORY",
      productCategories: ["TOYS_CHILDRENS_PRODUCTS"],
      riskAttributes: ["CHILDREN"],
      policyTopics: ["PRODUCT_SAFETY_RECALLS"],
      market: "US",
      platforms: [],
      operatingStages: ["ALREADY_SELLING"],
      confidence: 0.9,
    });
    const suggestion = parseCanonicalClassify(modelText);
    const decision = await classifyChange({
      items: [
        {
          id: "item-9",
          title: "CPSC recalls toy set over choking hazard",
          market: "US",
          platforms: [],
          authorityEventId: "CPSC-2026-077",
          effectiveAt: "2026-07-01",
          publishedAt: "2026-07-01T10:00:00Z",
        },
      ],
      suggestion,
    });
    expect(decision.requiresReview).toBe(false);
    expect(decision.signalType).toBe("REGULATORY");
  });

  it("rejects model output with values outside the taxonomy", () => {
    const bad = JSON.stringify({
      signalType: "REGULATORY",
      productCategories: ["NOT_A_CATEGORY"],
      riskAttributes: [],
      policyTopics: [],
      market: "US",
      platforms: [],
      operatingStages: ["ALREADY_SELLING"],
      confidence: 0.9,
    });
    expect(() => parseCanonicalClassify(bad)).toThrow();
  });

  it("builds a prompt that pins the taxonomy enums and a confidence score", () => {
    const prompt = buildCanonicalClassifyPrompt({
      title: "CPSC recalls toy set",
      market: "US",
      platforms: [],
    });
    expect(prompt.json).toBe(true);
    expect(prompt.system).toContain("REGULATORY");
    expect(prompt.system).toContain("TOYS_CHILDRENS_PRODUCTS");
    expect(prompt.system).toContain("confidence");
    expect(prompt.user).toContain("CPSC recalls toy set");
  });
});
