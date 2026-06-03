// DB layer for dedup. Postgres-only (pg_trgm similarity, migration 0002).
// Not unit-tested (requires Neon); exercised via integration + processor.
import { prisma } from "../db/client.js";
import { GREY_LOW } from "./classify.js";
import type { SimilarCandidate } from "./resolve.js";

/**
 * Find items whose title is trigram-similar to `title` within the last
 * `sinceHours`, excluding the item itself. Uses pg_trgm similarity().
 * Returns candidates with score >= GREY_LOW (cheap prefilter before LLM).
 */
export async function findSimilarItems(
  title: string,
  excludeId: string,
  sinceHours = 24,
): Promise<SimilarCandidate[]> {
  const rows = await prisma.$queryRaw<
    { id: string; title: string; score: number; clusterId: string | null }[]
  >`
    SELECT id,
           COALESCE("titleEn", title) AS title,
           similarity(COALESCE("titleEn", title), ${title}) AS score,
           "clusterId"
    FROM items
    WHERE id <> ${excludeId}
      AND "isDuplicate" = false
      AND "crawledAt" > now() - (${sinceHours} || ' hours')::interval
      AND similarity(COALESCE("titleEn", title), ${title}) >= ${GREY_LOW}
    ORDER BY score DESC
    LIMIT 10
  `;
  return rows.map((r) => ({ ...r, score: Number(r.score) }));
}

/** Mark an item as a duplicate (kept in DB, excluded from feed/push). */
export async function applyDuplicate(itemId: string): Promise<void> {
  await prisma.item.update({ where: { id: itemId }, data: { isDuplicate: true } });
}

/**
 * Attach `itemId` to the cluster of `withId` (creating one if needed) and merge
 * `itemUrl` into the cluster's sourceUrls. Returns the cluster id.
 */
export async function applyCluster(
  itemId: string,
  withId: string,
  existingClusterId: string | null,
  itemUrl: string,
): Promise<string> {
  if (existingClusterId) {
    await prisma.cluster.update({
      where: { id: existingClusterId },
      data: { sourceUrls: { push: itemUrl } },
    });
    await prisma.item.update({ where: { id: itemId }, data: { clusterId: existingClusterId } });
    return existingClusterId;
  }
  const peer = await prisma.item.findUnique({ where: { id: withId }, select: { url: true } });
  const cluster = await prisma.cluster.create({
    data: { representativeItemId: withId, sourceUrls: [peer?.url ?? withId, itemUrl] },
  });
  await prisma.item.updateMany({
    where: { id: { in: [itemId, withId] } },
    data: { clusterId: cluster.id },
  });
  return cluster.id;
}
