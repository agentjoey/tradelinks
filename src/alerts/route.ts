// Alert status routing by urgency score. Pure + unit-tested.
// See docs/architecture.md (Alert Push Routing) — push itself lands in Sprint 004.

export const REVIEW_THRESHOLD = 4.0; // >= this → human review before it can be pushed

export type AlertStatus = "pending_review" | "published" | "rejected";

/**
 * High-urgency alerts (≥4) need human sign-off before going out (push wired
 * Sprint 004); everything else is published directly (web + digest bucket).
 */
export function routeAlertStatus(urgencyScore: number): AlertStatus {
  return urgencyScore >= REVIEW_THRESHOLD ? "pending_review" : "published";
}

/** Push tier (used by Sprint 004): ≥4 immediate, 2–3.99 digest, <2 web-only. */
export type PushTier = "immediate" | "digest" | "web_only";
export function pushTier(urgencyScore: number): PushTier {
  if (urgencyScore >= 4) return "immediate";
  if (urgencyScore >= 2) return "digest";
  return "web_only";
}
