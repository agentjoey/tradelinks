// Review-queue operations for high-urgency alerts (status pending_review).
// Web UI lands in Sprint 003; this backend is driven by scripts/review.ts now.
//
// The legacy Alert functions below are still consumed by the Telegram webhook
// and the CLI; their behavior and signatures are frozen. The admin web
// surface no longer uses them — it reviews canonical change versions through
// listCanonicalReviewQueue + src/canonicalize/publish.ts instead.
import { Prisma } from "@prisma/client";

import { prisma } from "../db/client.js";

export interface PendingAlert {
  id: string;
  title: string;
  urgencyScore: number;
  category: string;
  regions: string[];
  actionRequired: string | null;
  sourceUrls: string[];
}

export async function listPending(): Promise<PendingAlert[]> {
  return prisma.alert.findMany({
    where: { status: "pending_review" },
    orderBy: { urgencyScore: "desc" },
    select: {
      id: true, title: true, urgencyScore: true, category: true,
      regions: true, actionRequired: true, sourceUrls: true,
    },
  });
}

/**
 * Approve → published (appears on the public Wire). Push already happened at
 * review time (Sprint 006), so approval just flips status — no re-push.
 */
export async function approveAlert(id: string, reviewer = "cli"): Promise<boolean> {
  const res = await prisma.alert.updateMany({
    where: { id, status: "pending_review" },
    data: { status: "published", publishedAt: new Date(), reviewedBy: reviewer },
  });
  return res.count > 0;
}

/** Look up an alert for rendering a Telegram confirmation. */
export async function getAlertBrief(id: string) {
  return prisma.alert.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, urgencyScore: true },
  });
}

export async function rejectAlert(id: string, reviewer = "cli"): Promise<boolean> {
  const res = await prisma.alert.updateMany({
    where: { id, status: "pending_review" },
    data: { status: "rejected", reviewedBy: reviewer },
  });
  return res.count > 0;
}

// ---------- Canonical review queue (admin web surface) ----------

const canonicalReviewArgs = Prisma.validator<Prisma.CanonicalChangeVersionDefaultArgs>()({
  include: {
    evidence: {
      orderBy: [{ role: "asc" }, { url: "asc" }],
      include: { source: { select: { id: true, name: true } } },
    },
    canonicalChange: {
      select: {
        id: true,
        slug: true,
        versions: {
          orderBy: { version: "desc" },
          include: {
            evidence: {
              orderBy: [{ role: "asc" }, { url: "asc" }],
              include: { source: { select: { id: true, name: true } } },
            },
          },
        },
      },
    },
  },
});

export type CanonicalReviewDraft = Prisma.CanonicalChangeVersionGetPayload<
  typeof canonicalReviewArgs
>;

/**
 * Canonical drafts awaiting review (newest first), each with its structured
 * evidence and the change's current published version (the diff base and the
 * correction target). Read-only; publication goes through
 * src/canonicalize/publish.ts.
 */
export async function listCanonicalReviewQueue(): Promise<CanonicalReviewDraft[]> {
  return prisma.canonicalChangeVersion.findMany({
    where: { editorialStatus: { in: ["DRAFT", "IN_REVIEW"] } },
    orderBy: [{ urgency: "desc" }, { createdAt: "desc" }],
    ...canonicalReviewArgs,
  });
}
