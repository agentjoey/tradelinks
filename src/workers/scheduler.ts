import type PgBoss from "pg-boss";
import parser from "cron-parser";
import { QUEUES, sendOpts } from "../queue/queues.js";
import { SOURCES } from "../config/sources.js";
import type { CrawlJob } from "../queue/schemas.js";
import { prisma } from "../db/client.js";
import { logger } from "../lib/logger.js";

/**
 * pg-boss schedule is keyed by queue name (one cron per queue), so we cannot
 * give 25 sources individual crons directly (ADR-004). Instead a single
 * per-minute `scheduler-tick` fans out: for each active source, if its cron's
 * most recent fire time is newer than lastCrawledAt, enqueue a crawl job.
 */

/** Pure due-check, unit-tested. */
export function isDue(cron: string, lastCrawledAt: Date | null, now: Date): boolean {
  if (!lastCrawledAt) return true;
  try {
    const prev = parser.parseExpression(cron, { currentDate: now }).prev().toDate();
    return prev > lastCrawledAt;
  } catch {
    return false;
  }
}

export async function registerScheduler(boss: PgBoss) {
  // fire the tick every minute
  await boss.schedule(QUEUES.scheduler, "* * * * *");

  await boss.work(QUEUES.scheduler, async () => {
    const now = new Date();
    const rows = await prisma.source.findMany({
      where: { isActive: true },
      select: { id: true, lastCrawledAt: true },
    });
    const lastById = new Map(rows.map((r) => [r.id, r.lastCrawledAt]));

    let dispatched = 0;
    for (const source of SOURCES) {
      const last = lastById.get(source.id) ?? null;
      if (!isDue(source.frequencyCron, last, now)) continue;
      const payload: CrawlJob = {
        sourceId: source.id,
        url: source.url,
        adapter: source.adapter,
      };
      await boss.send(QUEUES.crawl, payload, sendOpts);
      dispatched++;
    }
    if (dispatched > 0) logger.info({ dispatched }, "scheduler dispatched crawl jobs");
  });
}
