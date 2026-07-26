/**
 * Publication invariants for canonical change versions.
 *
 * `assertPublishableVersion` is the single gate every publication path
 * (initial publish, correction) must pass BEFORE the write transaction
 * starts. It is pure: it inspects the version plus its structured evidence
 * and throws a `PublicationError` with a stable machine code when a required
 * fact is missing. The rules:
 *
 *  - readiness must be publishable in public (Monitored or Verified);
 *  - Verified publication additionally requires reviewed PRIMARY_OFFICIAL
 *    evidence from a government/platform official source;
 *  - any version carrying an action recommendation (a non-blank
 *    generalActionTemplate) requires a reviewed action template.
 *
 * Corrections require a non-empty correctionReason and preserve all older
 * versions; rejections require a non-blank reason.
 */

import type { ReadinessLevel } from "./taxonomy.js";
import { canPublishPublic } from "./readiness.js";
import {
  isReviewedPrimaryOfficialEvidence,
  type StructuredEvidence,
} from "./evidence.js";

export const PUBLICATION_ERROR_CODES = [
  "CANONICAL_DRAFT_NOT_FOUND",
  "CANONICAL_VERSION_NOT_REVIEWABLE",
  "CANONICAL_READINESS_NOT_PUBLISHABLE",
  "VERIFIED_REQUIRES_REVIEWED_PRIMARY_OFFICIAL_EVIDENCE",
  "ACTION_TEMPLATE_REQUIRED",
  "ACTION_TEMPLATE_REQUIRES_REVIEW",
  "REJECTION_REASON_REQUIRED",
  "CORRECTION_REASON_REQUIRED",
] as const;

export type PublicationErrorCode = (typeof PUBLICATION_ERROR_CODES)[number];

/** Publication failure with a stable machine-readable code. */
export class PublicationError extends Error {
  readonly code: PublicationErrorCode;

  constructor(code: PublicationErrorCode, message?: string) {
    super(message ? `${code}: ${message}` : code);
    this.name = "PublicationError";
    this.code = code;
  }
}

/** The version facts the publishable invariant inspects. */
export interface VersionWithEvidence {
  readiness: ReadinessLevel;
  generalActionTemplate: string | null;
  actionTemplateReviewedAt: Date | null;
  evidence: Array<
    Pick<
      StructuredEvidence,
      "role" | "authorityLevel" | "reviewedAt" | "retractedAt"
    >
  >;
}

/**
 * Returns every publication invariant the version violates (empty = publishable).
 * Pure and synchronous; `assertPublishableVersion` throws the first violation,
 * and the review surface renders the full list as publication constraints.
 */
export function checkPublishableVersion(
  input: VersionWithEvidence,
): PublicationErrorCode[] {
  const violations: PublicationErrorCode[] = [];
  if (!canPublishPublic(input.readiness)) {
    violations.push("CANONICAL_READINESS_NOT_PUBLISHABLE");
  }
  if (
    input.readiness === "VERIFIED" &&
    !input.evidence.some(isReviewedPrimaryOfficialEvidence)
  ) {
    violations.push("VERIFIED_REQUIRES_REVIEWED_PRIMARY_OFFICIAL_EVIDENCE");
  }
  if (
    input.generalActionTemplate != null &&
    input.generalActionTemplate.trim() !== "" &&
    input.actionTemplateReviewedAt == null
  ) {
    violations.push("ACTION_TEMPLATE_REQUIRES_REVIEW");
  }
  return violations;
}

const VIOLATION_MESSAGES: Record<string, string> = {
  CANONICAL_READINESS_NOT_PUBLISHABLE:
    "readiness is not publishable (requires MONITORED or VERIFIED)",
  VERIFIED_REQUIRES_REVIEWED_PRIMARY_OFFICIAL_EVIDENCE:
    "Verified publication requires reviewed PRIMARY_OFFICIAL evidence from a government/platform official source",
  ACTION_TEMPLATE_REQUIRES_REVIEW:
    "an action recommendation requires a reviewed action template before publication",
};

/**
 * Enforces the publication invariants. Pure and synchronous; call it before
 * opening the publication transaction so an invariant failure never leaves a
 * half-written version behind.
 */
export function assertPublishableVersion(input: VersionWithEvidence): void {
  const [first] = checkPublishableVersion(input);
  if (first) {
    throw new PublicationError(first, VIOLATION_MESSAGES[first]);
  }
}

/** What a forward correction of an immutable version may change. */
export interface CorrectionChanges {
  title?: string;
  summary?: string;
  generalImpact?: string;
  generalActionTemplate?: string | null;
  effectiveAt?: Date | null;
  urgency?: number;
}

export interface CorrectionInput {
  /** The version being corrected (normally the current published one). */
  versionId: string;
  reviewerId: string;
  /** Required, non-empty after trimming; persisted on the new version. */
  correctionReason: string;
  changes?: CorrectionChanges;
}

/** Trimmed non-blank reason, or a PublicationError with the given code. */
export function requireReason(
  reason: string,
  code: "REJECTION_REASON_REQUIRED" | "CORRECTION_REASON_REQUIRED",
): string {
  const trimmed = reason.trim();
  if (trimmed === "") {
    throw new PublicationError(code, "a non-blank reason is required");
  }
  return trimmed;
}
