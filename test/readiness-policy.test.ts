import { describe, it, expect } from "vitest";
import {
  canPublishPublic,
  canPersonalize,
  canRecommendAction,
  type PublicationFacts,
} from "../src/domain/intelligence/readiness.js";

function facts(over: Partial<PublicationFacts> = {}): PublicationFacts {
  return {
    readiness: "VERIFIED",
    hasReviewedPrimaryOfficialEvidence: true,
    actionTemplateReviewed: true,
    ...over,
  };
}

describe("readiness policy", () => {
  it("publishes publicly only at Monitored or Verified", () => {
    expect(canPublishPublic("MONITORED")).toBe(true);
    expect(canPublishPublic("VERIFIED")).toBe(true);
    expect(canPublishPublic("UNAVAILABLE")).toBe(false);
    expect(canPublishPublic("EXPERIMENTAL")).toBe(false);
    expect(canPublishPublic("STALE")).toBe(false);
  });

  it("personalizes only at Verified", () => {
    expect(canPersonalize(facts({ readiness: "VERIFIED" }))).toBe(true);
    expect(canPersonalize(facts({ readiness: "MONITORED" }))).toBe(false);
    expect(canPersonalize(facts({ readiness: "EXPERIMENTAL" }))).toBe(false);
    expect(canPersonalize(facts({ readiness: "STALE" }))).toBe(false);
    expect(canPersonalize(facts({ readiness: "UNAVAILABLE" }))).toBe(false);
  });

  it("requires reviewed primary evidence for an action", () => {
    expect(canRecommendAction({
      readiness: "VERIFIED",
      hasReviewedPrimaryOfficialEvidence: true,
      actionTemplateReviewed: true,
    })).toBe(true);
    expect(canRecommendAction({
      readiness: "MONITORED",
      hasReviewedPrimaryOfficialEvidence: true,
      actionTemplateReviewed: true,
    })).toBe(false);
  });

  it("blocks actions when any single gate fails", () => {
    expect(canRecommendAction(facts({ readiness: "STALE" }))).toBe(false);
    expect(canRecommendAction(facts({ hasReviewedPrimaryOfficialEvidence: false }))).toBe(false);
    expect(canRecommendAction(facts({ actionTemplateReviewed: false }))).toBe(false);
  });
});
