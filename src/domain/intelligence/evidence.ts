/**
 * Structured evidence attached to a canonical change version.
 *
 * An evidence record preserves everything a reviewer (and every downstream
 * consumer) needs to audit a publication decision: which source produced it,
 * the original URL, its role and authority, access conditions, the license
 * note, the normalized summary, the content hash, and the fetch/review
 * timestamps. Records are never edited in place; corrections attach copies to
 * the new immutable version.
 */

import type {
  AuthorityLevel,
  EvidenceAccess,
  EvidenceRole,
} from "@prisma/client";

/** The fields every preserved evidence record must carry. */
export interface StructuredEvidence {
  sourceId: string;
  sourceItemId?: string | null;
  url: string;
  role: EvidenceRole;
  authorityLevel: AuthorityLevel;
  access: EvidenceAccess;
  licenseNote: string;
  normalizedSummary: string;
  contentHash: string;
  fetchedAt: Date;
  reviewedAt?: Date | null;
  retractedAt?: Date | null;
}

/** Authority levels that count as a government/platform official source. */
export const OFFICIAL_AUTHORITY_LEVELS: readonly AuthorityLevel[] = [
  "GOVERNMENT_OFFICIAL",
  "PLATFORM_OFFICIAL",
];

/**
 * Reviewed `PRIMARY_OFFICIAL` evidence from a government/platform official
 * source: the evidence Verified publication is required to have. Retracted or
 * unreviewed records never qualify.
 */
export function isReviewedPrimaryOfficialEvidence(
  ev: Pick<
    StructuredEvidence,
    "role" | "authorityLevel" | "reviewedAt" | "retractedAt"
  >,
): boolean {
  return (
    ev.role === "PRIMARY_OFFICIAL" &&
    OFFICIAL_AUTHORITY_LEVELS.includes(ev.authorityLevel) &&
    ev.reviewedAt != null &&
    ev.retractedAt == null
  );
}
