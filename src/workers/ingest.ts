import type PgBoss from "pg-boss";
import { QUEUES, sendOpts } from "../queue/queues.js";
import { IngestJobSchema } from "../queue/schemas.js";
import { prisma } from "../db/client.js";
import { urlHash, normalizeUrl } from "../lib/hash.js";
import { isGoogleNewsUrl, resolveGoogleNewsUrl } from "../lib/gnews.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { BESTSELLER_SOURCE_IDS, VALIDATION_SOURCE_IDS, SOURCES_BY_ID } from "../config/sources.js";
import { extractAsin, isCommodity } from "../trends/product-signal.js";
import { upsertProductSnapshot } from "../trends/product-snapshots.js";
import { parseReviewCount, parsePrice, parseRating } from "../trends/parse-bsr.js";

/** BL-042: 验证集 bestseller 写当日 product_snapshot（幂等）。失败不阻塞 ingest。 */
async function recordValidationSnapshot(
  sourceId: string,
  url: string,
  title: string,
  rawContent: unknown,
  imageUrl: string | null,
): Promise<void> {
  if (!VALIDATION_SOURCE_IDS.has(sourceId)) return;
  const asin = extractAsin(url);
  if (!asin) return;
  const src = SOURCES_BY_ID.get(sourceId);
  const category = src?.name.match(/\(([^)]+)\)\s*$/)?.[1] ?? src?.name ?? sourceId;
  const region = (src?.regions[0] as string) ?? "north_america";
  const rc = rawContent as { rank?: unknown } | null;
  const m = rc?.rank != null ? String(rc.rank).match(/\d+/) : null;
  const rank = m ? Number(m[0]) : null;
  const rc2 = rawContent as { ratingText?: string; reviewText?: string; priceText?: string } | null;
  const rating = parseRating(rc2?.ratingText ?? null);
  const reviewCount = parseReviewCount(rc2?.reviewText ?? null);
  const price = parsePrice(rc2?.priceText ?? null);
  try {
    await upsertProductSnapshot({
      asin, region: region as never, category, rank, title, imageUrl, isCommodity: isCommodity(title), sourceId,
      reviewCount, rating, price,
    });
  } catch (e) {
    logger.warn({ sourceId, asin, err: String(e) }, "snapshot write failed");
  }
}

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
        // Google News items link to a redirect page — resolve to the real
        // publisher first so url/urlHash (dedup) and the stored URL are canonical
        // (tap target + og:image come from the article, not Google). Graceful:
        // a failed resolve keeps the GN link.
        let rawUrl = raw.url;
        if (!isBestseller && isGoogleNewsUrl(rawUrl)) {
          const real = await resolveGoogleNewsUrl(rawUrl);
          if (real) rawUrl = real;
        }
        const url = normalizeUrl(rawUrl); // canonical (e.g. amazon → /dp/<ASIN>)
        const hash = urlHash(rawUrl); // == sha256(normalizeUrl(rawUrl))
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
            await recordValidationSnapshot(sourceId, url, raw.title, raw.rawContent ?? null, bsImage);
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
        if (isBestseller) await recordValidationSnapshot(sourceId, url, raw.title, raw.rawContent ?? null, bsImage);
        if (!isBestseller) await boss.send(QUEUES.process, { itemId: item.id }, sendOpts);
      }

      logger.info(
        { sourceId, received: items.length, capped: capped.length, created, bestseller: isBestseller },
        "ingested",
      );
    }
  });
}
