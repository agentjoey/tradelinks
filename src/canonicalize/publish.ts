/**
 * Immutable publication of reviewed canonical drafts.
 *
 * Every write path enforces the same contract:
 *  - `assertPublishableVersion` runs BEFORE the transaction, so an invariant
 *    failure never opens a write;
 *  - publication happens in ONE interactive transaction that clears the
 *    previous current version and publishes exactly one current version;
 *  - corrections create a new immutable version (older versions are never
 *    mutated) and carry the structured evidence forward;
 *  - rejections require and persist a non-blank reason and never make the
 *    rejected version current.
 *
 * Legacy Alert ids are not canonical draft ids: they fail explicitly as
 * CANONICAL_DRAFT_NOT_FOUND and the Alert row is left untouched.
 */

import type { CanonicalChangeVersion } from "@prisma/client";

import { prisma } from "../db/client.js";
import {
  assertPublishableVersion,
  PublicationError,
  requireReason,
  type CorrectionInput,
} from "../domain/intelligence/canonical-change.js";

/** Neon cold-start headroom, same as the collection run ledger. */
const TX_OPTIONS = { maxWait: 30_000, timeout: 60_000 } as const;

const REVIEWABLE_STATUSES = ["DRAFT", "IN_REVIEW"] as const;

async function loadVersionWithEvidence(draftId: string) {
  const version = await prisma.canonicalChangeVersion.findUnique({
    where: { id: draftId },
    include: { evidence: true },
  });
  if (!version) {
    throw new PublicationError(
      "CANONICAL_DRAFT_NOT_FOUND",
      `no canonical change version with id ${draftId}`,
    );
  }
  return version;
}

function assertReviewable(version: { editorialStatus: string }): void {
  if (
    !(REVIEWABLE_STATUSES as readonly string[]).includes(version.editorialStatus)
  ) {
    throw new PublicationError(
      "CANONICAL_VERSION_NOT_REVIEWABLE",
      `version is ${version.editorialStatus}, not a reviewable draft`,
    );
  }
}

/**
 * Publishes a reviewed draft: invariants first, then one transaction that
 * clears the previous current version and publishes exactly this one.
 */
export async function publishCanonicalDraft(
  draftId: string,
  reviewerId: string,
): Promise<CanonicalChangeVersion> {
  const draft = await loadVersionWithEvidence(draftId);
  assertReviewable(draft);
  assertPublishableVersion(draft);

  return prisma.$transaction(async (tx) => {
    await tx.canonicalChangeVersion.updateMany({
      where: { canonicalChangeId: draft.canonicalChangeId, isCurrent: true },
      data: { isCurrent: false },
    });
    return tx.canonicalChangeVersion.update({
      where: { id: draft.id },
      data: {
        isCurrent: true,
        editorialStatus: "PUBLISHED",
        reviewedAt: new Date(),
        reviewedBy: reviewerId,
      },
    });
  }, TX_OPTIONS);
}

/**
 * Rejects a draft with a required, persisted reason. The version is never
 * made current; reviewer identity and time are recorded on the immutable row.
 */
export async function rejectCanonicalDraft(
  draftId: string,
  reviewerId: string,
  reason: string,
): Promise<CanonicalChangeVersion> {
  const rejectionReason = requireReason(reason, "REJECTION_REASON_REQUIRED");
  const draft = await loadVersionWithEvidence(draftId);
  assertReviewable(draft);

  return prisma.canonicalChangeVersion.update({
    where: { id: draft.id },
    data: {
      editorialStatus: "REJECTED",
      rejectionReason,
      reviewedAt: new Date(),
      reviewedBy: reviewerId,
      isCurrent: false,
    },
  });
}

/**
 * Records the human review of the draft's action template. Does not publish;
 * publication re-checks the review timestamp via assertPublishableVersion.
 */
export async function reviewCanonicalActionTemplate(
  draftId: string,
  reviewerId: string,
): Promise<CanonicalChangeVersion> {
  const draft = await loadVersionWithEvidence(draftId);
  assertReviewable(draft);
  if (!draft.generalActionTemplate || draft.generalActionTemplate.trim() === "") {
    throw new PublicationError(
      "ACTION_TEMPLATE_REQUIRED",
      "the draft has no action template to review",
    );
  }

  return prisma.canonicalChangeVersion.update({
    where: { id: draft.id },
    data: {
      actionTemplateReviewedAt: new Date(),
      actionTemplateReviewedBy: reviewerId,
    },
  });
}

/**
 * Creates the next immutable version of a published change. The older
 * versions are preserved untouched; the new version re-passes the publication
 * invariants and carries the structured evidence forward in one transaction.
 */
export async function correctCanonicalChange(
  input: CorrectionInput,
): Promise<CanonicalChangeVersion> {
  const correctionReason = requireReason(
    input.correctionReason,
    "CORRECTION_REASON_REQUIRED",
  );
  const previous = await loadVersionWithEvidence(input.versionId);
  if (previous.editorialStatus !== "PUBLISHED") {
    throw new PublicationError(
      "CANONICAL_VERSION_NOT_REVIEWABLE",
      `only a PUBLISHED version can be corrected (got ${previous.editorialStatus})`,
    );
  }
  const changes = input.changes ?? {};
  // A changed template invalidates the earlier template review. The
  // correcting reviewer sees and submits the new template deliberately (with
  // a required correction reason), so the correction itself is the review of
  // the new template: record the correcting reviewer on the new version. A
  // cleared template has no recommendation left to review.
  const templateChanged =
    changes.generalActionTemplate !== undefined &&
    changes.generalActionTemplate !== previous.generalActionTemplate;
  const nextTemplate =
    changes.generalActionTemplate !== undefined
      ? changes.generalActionTemplate
      : previous.generalActionTemplate;
  const templateCleared =
    templateChanged && (nextTemplate == null || nextTemplate.trim() === "");
  const correctedAt = new Date();
  const nextTemplateReview = templateChanged
    ? templateCleared
      ? { at: null, by: null }
      : { at: correctedAt, by: input.reviewerId }
    : {
        at: previous.actionTemplateReviewedAt,
        by: previous.actionTemplateReviewedBy,
      };
  const nextFacts = {
    readiness: previous.readiness,
    generalActionTemplate: nextTemplate,
    actionTemplateReviewedAt: nextTemplateReview.at,
    evidence: previous.evidence,
  };
  assertPublishableVersion(nextFacts);

  return prisma.$transaction(async (tx) => {
    const latest = await tx.canonicalChangeVersion.findFirst({
      where: { canonicalChangeId: previous.canonicalChangeId },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    await tx.canonicalChangeVersion.updateMany({
      where: { canonicalChangeId: previous.canonicalChangeId, isCurrent: true },
      data: { isCurrent: false },
    });
    const corrected = await tx.canonicalChangeVersion.create({
      data: {
        canonicalChangeId: previous.canonicalChangeId,
        version: (latest?.version ?? previous.version) + 1,
        isCurrent: true,
        title: changes.title ?? previous.title,
        summary: changes.summary ?? previous.summary,
        signalType: previous.signalType,
        market: previous.market,
        regions: previous.regions,
        platforms: previous.platforms,
        operatingStages: previous.operatingStages,
        productCategories: previous.productCategories,
        riskAttributes: previous.riskAttributes,
        policyTopics: previous.policyTopics,
        sourcePublishedAt: previous.sourcePublishedAt,
        effectiveAt:
          changes.effectiveAt !== undefined
            ? changes.effectiveAt
            : previous.effectiveAt,
        urgency: changes.urgency ?? previous.urgency,
        readiness: previous.readiness,
        generalImpact: changes.generalImpact ?? previous.generalImpact,
        generalActionTemplate: nextFacts.generalActionTemplate,
        actionTemplateReviewedAt: nextTemplateReview.at,
        actionTemplateReviewedBy: nextTemplateReview.by,
        editorialStatus: "PUBLISHED",
        correctionReason,
        classificationConfidence: previous.classificationConfidence,
        reviewedAt: correctedAt,
        reviewedBy: input.reviewerId,
      },
    });
    if (previous.evidence.length > 0) {
      await tx.evidenceRecord.createMany({
        data: previous.evidence.map((ev) => ({
          changeVersionId: corrected.id,
          sourceId: ev.sourceId,
          sourceItemId: ev.sourceItemId,
          url: ev.url,
          role: ev.role,
          authorityLevel: ev.authorityLevel,
          publishedAt: ev.publishedAt,
          access: ev.access,
          licenseNote: ev.licenseNote,
          excerpt: ev.excerpt,
          normalizedSummary: ev.normalizedSummary,
          contentHash: ev.contentHash,
          fetchedAt: ev.fetchedAt,
          reviewedAt: ev.reviewedAt,
          retractedAt: ev.retractedAt,
        })),
      });
    }
    return corrected;
  }, TX_OPTIONS);
}
