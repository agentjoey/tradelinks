// Review-queue operations for high-urgency alerts (status pending_review).
// Web UI lands in Sprint 003; this backend is driven by scripts/review.ts now.
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

/** Approve → published, then dispatch instant push (Sprint 004 T3). */
export async function approveAlert(id: string, reviewer = "cli"): Promise<boolean> {
  const res = await prisma.alert.updateMany({
    where: { id, status: "pending_review" },
    data: { status: "published", publishedAt: new Date(), reviewedBy: reviewer },
  });
  if (res.count === 0) return false;

  // instant push for the just-published alert (no-ops if channels unconfigured)
  const a = await prisma.alert.findUnique({ where: { id } });
  if (a) {
    const { dispatchPush } = await import("../push/send.js");
    await dispatchPush({
      title: a.title, summary: a.summary, urgencyScore: a.urgencyScore,
      category: a.category, regions: a.regions as string[],
      actionRequired: a.actionRequired, sourceUrls: a.sourceUrls,
    }).catch(() => undefined);
  }
  return true;
}

export async function rejectAlert(id: string, reviewer = "cli"): Promise<boolean> {
  const res = await prisma.alert.updateMany({
    where: { id, status: "pending_review" },
    data: { status: "rejected", reviewedBy: reviewer },
  });
  return res.count > 0;
}
