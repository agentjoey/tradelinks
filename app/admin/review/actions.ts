"use server";

import { revalidatePath } from "next/cache";

import {
  confirmCanonicalEvidence,
  correctCanonicalChange,
  publishCanonicalDraft,
  rejectCanonicalDraft,
  reviewCanonicalActionTemplate,
} from "../../../src/canonicalize/publish.js";
import { PublicationError } from "../../../src/domain/intelligence/canonical-change.js";
import { requireAdmin } from "../../lib/auth";

export type ReviewActionResult = { ok: true } | { ok: false; error: string };

/**
 * Admin review actions operate ONLY on canonical draft/version ids. Legacy
 * Alert approval/rejection is retired from the web surface (the Telegram/CLI
 * paths keep it); a legacy Alert id fails as CANONICAL_DRAFT_NOT_FOUND and
 * leaves the Alert row unchanged. Every action re-authorizes via Neon Auth
 * and records the admin's email as the reviewer.
 */
async function run(
  fn: (reviewerId: string) => Promise<unknown>,
): Promise<ReviewActionResult> {
  const admin = await requireAdmin();
  try {
    await fn(admin.email);
    revalidatePath("/admin/review");
    return { ok: true };
  } catch (e) {
    if (e instanceof PublicationError) return { ok: false, error: e.code };
    return { ok: false, error: "UNEXPECTED_PUBLICATION_ERROR" };
  }
}

export async function publishDraft(draftId: string): Promise<ReviewActionResult> {
  return run((reviewerId) => publishCanonicalDraft(draftId, reviewerId));
}

export async function rejectDraft(
  draftId: string,
  reason: string,
): Promise<ReviewActionResult> {
  return run((reviewerId) => rejectCanonicalDraft(draftId, reviewerId, reason));
}

export async function reviewTemplate(draftId: string): Promise<ReviewActionResult> {
  return run((reviewerId) => reviewCanonicalActionTemplate(draftId, reviewerId));
}

/**
 * Confirm the entry against its primary-official evidence, raising it to
 * Verified. The single act the coverage glossary describes; nothing else in
 * the product could set EvidenceRecord.reviewedAt, so Verified was
 * unreachable and the verified-pool surfaces were permanently empty.
 */
export async function confirmEvidence(draftId: string): Promise<ReviewActionResult> {
  return run((reviewerId) => confirmCanonicalEvidence(draftId, reviewerId));
}

export async function correctDraft(
  currentVersionId: string,
  correctionReason: string,
  effectiveAt: string | null,
  actionTemplate: string | null,
): Promise<ReviewActionResult> {
  return run((reviewerId) =>
    correctCanonicalChange({
      versionId: currentVersionId,
      reviewerId,
      correctionReason,
      changes: {
        ...(effectiveAt ? { effectiveAt: new Date(effectiveAt) } : {}),
        ...(actionTemplate && actionTemplate.trim() !== ""
          ? { generalActionTemplate: actionTemplate }
          : {}),
      },
    }),
  );
}
