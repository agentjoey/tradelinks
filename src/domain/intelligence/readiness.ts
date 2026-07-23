/**
 * Pure readiness and publication gates.
 *
 * Capability rules (Phase 1 spec):
 * - Public market explanation: Monitored or Verified.
 * - Personal relevance: Verified.
 * - Action recommendation: Verified + reviewed primary official evidence
 *   + reviewed action template.
 */

import type { ReadinessLevel } from "./taxonomy.js";

export interface PublicationFacts {
  readiness: ReadinessLevel;
  hasReviewedPrimaryOfficialEvidence: boolean;
  actionTemplateReviewed: boolean;
}

export function canPublishPublic(readiness: ReadinessLevel): boolean {
  return readiness === "MONITORED" || readiness === "VERIFIED";
}

export function canPersonalize(change: PublicationFacts): boolean {
  return change.readiness === "VERIFIED";
}

export function canRecommendAction(change: PublicationFacts): boolean {
  return (
    change.readiness === "VERIFIED" &&
    change.hasReviewedPrimaryOfficialEvidence &&
    change.actionTemplateReviewed
  );
}
