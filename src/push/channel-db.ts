// Channel-push database access (BL-039 slice 1).
// Gathers candidates from existing tables, tracks already-pushed items,
// and records successful posts. All queries reuse the single prisma client.

import { prisma } from "../db/client.js";
import type { CandidateAlert, CandidateProduct } from "./channel-select.js";
import { getBestsellers, type BestsellerRow } from "../trends/db.js";
import { getViralX, type ViralXRow } from "../social/db.js";

// ──── Candidate gathering ────

function toBestsellerKey(url: string): string { return `bestseller:${url}`; }
function toViralKey(url: string): string { return `viral:${url}`; }

/**
 * Map a BestsellerRow into a CandidateProduct shape.
 * itemId = "bestseller:<url>" (stable, unique per product page).
 */
function bsToProduct(row: BestsellerRow): CandidateProduct {
  return {
    key: toBestsellerKey(row.url),
    kind: "bestseller",
    title: row.title,
    platform: "Amazon",
    rank: row.rank,
    region: row.region,
    url: row.url,
    imageUrl: row.imageUrl,
  };
}

/**
 * Map a ViralXRow into a CandidateProduct shape.
 * itemId = "viral:<link>" (stable, unique per tweet/permalink).
 */
function viralToProduct(row: ViralXRow): CandidateProduct {
  return {
    key: toViralKey(row.link),
    kind: "viral",
    title: row.product,
    platform: "X",
    likes: row.likes,
    url: row.link,
    imageUrl: row.imageUrl,
  };
}

export interface ChannelCandidates {
  alerts: CandidateAlert[];
  products: CandidateProduct[];
}

/** Gather published alerts (last 48h) + bestsellers (top 30/cat) + viral X (top 24).
 * Recency uses createdAt (publishedAt is unset for most published rows), matching
 * how the Wire page defines freshness — so Wire content actually flows to the channel. */
export async function gatherChannelCandidates(): Promise<ChannelCandidates> {
  const since = new Date(Date.now() - 48 * 3600 * 1000);

  const [alertRows, bestsellerRows, viralRows] = await Promise.all([
    prisma.alert.findMany({
      where: { status: "published", createdAt: { gte: since } },
      orderBy: { urgencyScore: "desc" },
      take: 30,
      select: {
        id: true, title: true, summary: true, urgencyScore: true,
        category: true, regions: true, actionRequired: true, sourceUrls: true, imageUrl: true,
      },
    }),
    getBestsellers(30),
    getViralX(24),
  ]);

  const alerts: CandidateAlert[] = alertRows.map((a) => ({
    id: a.id,
    title: a.title,
    summary: a.summary ?? "",
    urgencyScore: a.urgencyScore ?? 0,
    category: a.category as string ?? "industry",
    regions: a.regions as string[],
    actionRequired: a.actionRequired,
    sourceUrls: a.sourceUrls as string[],
    imageUrl: a.imageUrl,
  }));

  const products: CandidateProduct[] = [
    ...bestsellerRows.map(bsToProduct),
    ...viralRows.map(viralToProduct),
  ];

  return { alerts, products };
}

// ──── Tracking ────

/** All itemIds already pushed to this channel (any time — unique constraint prevents re-push). */
export async function alreadyPushedKeys(channelId: string): Promise<Set<string>> {
  const rows = await prisma.channelPush.findMany({
    where: { channelId },
    select: { itemType: true, itemId: true },
  });
  return new Set(rows.map((r) => r.itemId));
}

/** Number of items pushed to this channel today (UTC date boundary). */
export async function pushedTodayCount(channelId: string): Promise<number> {
  const today = new Date(new Date().toISOString().slice(0, 10)); // UTC midnight
  return prisma.channelPush.count({
    where: { channelId, pushedAt: { gte: today } },
  });
}

/** Record a successful channel post. No-op if the unique constraint already blocks it. */
export async function recordChannelPush(
  itemType: string,
  itemId: string,
  channelId: string,
  messageId?: number,
): Promise<void> {
  try {
    await prisma.channelPush.create({
      data: { itemType, itemId, channelId, messageId: messageId != null ? String(messageId) : null },
    });
  } catch (e) {
    // unique constraint violation → already recorded, safe to ignore
    const code = (e as { code?: string })?.code;
    if (code === "P2002") return;
    throw e;
  }
}
