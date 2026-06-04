import type PgBoss from "pg-boss";
import { QUEUES, sendOpts } from "../queue/queues.js";
import { IngestJobSchema } from "../queue/schemas.js";
import { prisma } from "../db/client.js";
import { urlHash } from "../lib/hash.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * ingest-queue worker. Upserts RawItems into `items` (url unique = dedup
 * level 1), status=raw, then enqueues each new item onto process-queue.
 */
export async function registerIngestWorker(boss: PgBoss) {
  await boss.work(QUEUES.ingest, async (jobs) => {
    for (const job of jobs) {
      const { sourceId, items } = IngestJobSchema.parse(job.data);
      let created = 0;

      // newest-first cap: only process the latest N per crawl (bounds AI cost
      // on large feeds, e.g. Shopify changelog ~1500 items). Already-seen items
      // are skipped by url-hash anyway, so steady-state only new items flow.
      const capped = items.slice(0, env.MAX_ITEMS_PER_CRAWL);
      for (const raw of capped) {
        const hash = urlHash(raw.url);
        const existing = await prisma.item.findUnique({ where: { urlHash: hash } });
        if (existing) continue;

        const item = await prisma.item.create({
          data: {
            sourceId,
            url: raw.url,
            urlHash: hash,
            title: raw.title,
            lang: raw.lang ?? "en",
            publishedAt: raw.publishedAt ? new Date(raw.publishedAt) : new Date(),
            rawContent: (raw.rawContent ?? undefined) as object | undefined,
          },
        });
        created++;
        await boss.send(QUEUES.process, { itemId: item.id }, sendOpts);
      }

      logger.info({ sourceId, received: items.length, capped: capped.length, created }, "ingested");
    }
  });
}
