import type PgBoss from "pg-boss";
import { QUEUES, sendOpts } from "../queue/queues.js";
import { IngestJobSchema, type RawItem } from "../queue/schemas.js";
import { prisma } from "../db/client.js";
import { insertItemsDeduped } from "../collection/run.js";
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

      // Google News items link to a redirect page — resolve to the real
      // publisher first so url/urlHash (dedup) and the stored URL are canonical
      // (tap target + og:image come from the article, not Google). Graceful:
      // a failed resolve keeps the GN link.
      const resolved: RawItem[] = [];
      for (const raw of capped) {
        let rawUrl = raw.url;
        if (!isBestseller && isGoogleNewsUrl(rawUrl)) {
          const real = await resolveGoogleNewsUrl(rawUrl);
          if (real) rawUrl = real;
        }
        resolved.push(rawUrl === raw.url ? raw : { ...raw, url: rawUrl });
      }

      // Shared URL/hash dedup insert (level 1); replay-safe by urlHash unique.
      const results = await insertItemsDeduped(sourceId, resolved, {
        extraCreate: isBestseller
          ? (raw) => ({
              status: "processed",
              regions: (src?.regions ?? []) as never[],
              platforms: src?.platforms ?? [],
              category: (src?.categoryHint ?? "trend") as never,
              imageUrl: (raw.rawContent as { image?: string } | null)?.image ?? null,
            })
          : undefined,
      });

      for (const r of results) {
        const bsImage = (r.raw.rawContent as { image?: string } | null)?.image ?? null;
        if (!r.created) {
          // Bestsellers are one-row-per-product (deduped); refresh image/rank/
          // title on re-crawl so the board stays current without re-bloating.
          if (isBestseller) {
            await prisma.item.update({
              where: { urlHash: r.hash },
              data: {
                title: r.raw.title,
                rawContent: (r.raw.rawContent ?? undefined) as object | undefined,
                ...(bsImage ? { imageUrl: bsImage } : {}),
                crawledAt: new Date(),
              },
            });
            await recordValidationSnapshot(sourceId, r.url, r.raw.title, r.raw.rawContent ?? null, bsImage);
          }
          continue;
        }
        created++;
        if (isBestseller) {
          await recordValidationSnapshot(sourceId, r.url, r.raw.title, r.raw.rawContent ?? null, bsImage);
        } else {
          await boss.send(QUEUES.process, { itemId: r.itemId }, sendOpts);
        }
      }

      logger.info(
        { sourceId, received: items.length, capped: capped.length, created, bestseller: isBestseller },
        "ingested",
      );
    }
  });
}
