import type PgBoss from "pg-boss";
import { QUEUES, sendOpts } from "../queue/queues.js";
import { IngestJobSchema } from "../queue/schemas.js";
import { prisma } from "../db/client.js";
import { urlHash, normalizeUrl } from "../lib/hash.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { BESTSELLER_SOURCE_IDS, SOURCES_BY_ID } from "../config/sources.js";

/**
 * ingest-queue worker. Upserts RawItems into `items` (url unique = dedup
 * level 1), status=raw, then enqueues each new item onto process-queue.
 *
 * Exception: Amazon best-seller sources (BESTSELLER_SOURCE_IDS) are stored as
 * terminal `processed` rows tagged with the source's region/platform/category
 * and are NOT enqueued to process-queue — they feed the Trend Radar's
 * Bestsellers board directly, never the Wire (no AI scoring, no alerts).
 */
export async function registerIngestWorker(boss: PgBoss) {
  await boss.work(QUEUES.ingest, async (jobs) => {
    for (const job of jobs) {
      const { sourceId, items } = IngestJobSchema.parse(job.data);
      const isBestseller = BESTSELLER_SOURCE_IDS.has(sourceId);
      const src = SOURCES_BY_ID.get(sourceId);
      let created = 0;

      // newest-first cap: only process the latest N per crawl (bounds AI cost
      // on large feeds, e.g. Shopify changelog ~1500 items). Already-seen items
      // are skipped by url-hash anyway, so steady-state only new items flow.
      // Bestseller crawls are storage-only (no AI), so keep the full grid.
      const capped = isBestseller ? items : items.slice(0, env.MAX_ITEMS_PER_CRAWL);
      for (const raw of capped) {
        const url = normalizeUrl(raw.url); // canonical (e.g. amazon → /dp/<ASIN>)
        const hash = urlHash(raw.url); // == sha256(normalizeUrl(raw.url))
        const bsImage = (raw.rawContent as { image?: string } | null)?.image ?? null;
        const existing = await prisma.item.findUnique({ where: { urlHash: hash } });
        if (existing) {
          // Bestsellers are one-row-per-product (deduped); refresh image/rank/
          // title on re-crawl so the board stays current without re-bloating.
          if (isBestseller) {
            await prisma.item.update({
              where: { urlHash: hash },
              data: {
                title: raw.title,
                rawContent: (raw.rawContent ?? undefined) as object | undefined,
                ...(bsImage ? { imageUrl: bsImage } : {}),
                crawledAt: new Date(),
              },
            });
          }
          continue;
        }

        const item = await prisma.item.create({
          data: {
            sourceId,
            url,
            urlHash: hash,
            title: raw.title,
            lang: raw.lang ?? "en",
            publishedAt: raw.publishedAt ? new Date(raw.publishedAt) : new Date(),
            rawContent: (raw.rawContent ?? undefined) as object | undefined,
            ...(isBestseller
              ? {
                  status: "processed" as const,
                  regions: (src?.regions ?? []) as never[],
                  platforms: src?.platforms ?? [],
                  category: (src?.categoryHint ?? "trend") as never,
                  imageUrl: bsImage,
                }
              : {}),
          },
        });
        created++;
        if (!isBestseller) await boss.send(QUEUES.process, { itemId: item.id }, sendOpts);
      }

      logger.info(
        { sourceId, received: items.length, capped: capped.length, created, bestseller: isBestseller },
        "ingested",
      );
    }
  });
}
