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
import { OFFICIAL_AUTHORITY_LEVELS } from "../domain/intelligence/evidence.js";
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
 * Confirm an entry against its primary-official evidence — the act that makes
 * VERIFIED reachable.
 *
 * `EvidenceRecord.reviewedAt` has existed since the Foundation and nothing
 * ever wrote it. The publication invariant reads it, the detail page reads it,
 * the Telegram selector reads it, and no editorial action set it — so no entry
 * could reach VERIFIED, and every surface that defaulted to the verified pool
 * showed nothing.
 *
 * The coverage glossary states the act in one sentence: "Verified means a
 * reviewer has confirmed the entry against primary-official evidence." That is
 * a single editorial decision, so this is a single function. Splitting it into
 * "mark evidence reviewed" and "raise readiness" would let the two drift, and
 * a VERIFIED grade whose evidence was never confirmed is precisely the claim
 * the invariant exists to prevent.
 *
 * What it deliberately does not touch: retracted records (a withdrawn document
 * cannot be confirmed) and supporting records (they were not examined, and
 * marking them reviewed would overstate what happened). Published versions are
 * refused outright — publication is immutable, and re-grading a live entry in
 * place would rewrite the permanent record instead of superseding it. Use a
 * correction.
 */
export async function confirmCanonicalEvidence(
  versionId: string,
  reviewerId: string,
): Promise<CanonicalChangeVersion> {
  const draft = await loadVersionWithEvidence(versionId);
  assertReviewable(draft);

  const confirmable = draft.evidence.filter(
    (ev) =>
      ev.role === "PRIMARY_OFFICIAL" &&
      OFFICIAL_AUTHORITY_LEVELS.includes(ev.authorityLevel) &&
      ev.retractedAt == null,
  );
  if (confirmable.length === 0) {
    throw new PublicationError(
      "VERIFIED_REQUIRES_REVIEWED_PRIMARY_OFFICIAL_EVIDENCE",
      "no unretracted primary-official evidence to confirm",
    );
  }

  return prisma.$transaction(async (tx) => {
    await tx.evidenceRecord.updateMany({
      // Only records not already reviewed: re-confirming must not re-date an
      // earlier reviewer's decision.
      where: { id: { in: confirmable.map((ev) => ev.id) }, reviewedAt: null },
      data: { reviewedAt: new Date() },
    });
    return tx.canonicalChangeVersion.update({
      where: { id: draft.id },
      data: { readiness: "VERIFIED", reviewedBy: reviewerId },
    });
  }, TX_OPTIONS);
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
