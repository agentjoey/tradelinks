import type PgBoss from "pg-boss";
import { QUEUES, sendOpts } from "../queue/queues.js";
import { IngestJobSchema } from "../queue/schemas.js";
import { prisma } from "../db/client.js";
import { urlHash } from "../lib/hash.js";
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

      for (const raw of items) {
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

      logger.info({ sourceId, received: items.length, created }, "ingested");
    }
  });
}
