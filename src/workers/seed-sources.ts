import { prisma } from "../db/client.js";
import { SOURCES } from "../config/sources.js";
import { logger } from "../lib/logger.js";

/**
 * Upsert every configured source into the `sources` table on worker boot.
 * Without rows, `markOk()` (which updates lastCrawledAt) silently no-ops, so the
 * scheduler treats every source as perpetually "due" and re-dispatches each tick.
 * Seeding fixes scheduling + the worker heartbeat. Idempotent.
 */
export async function seedSources(): Promise<void> {
  let n = 0;
  for (const s of SOURCES) {
    await prisma.source.upsert({
      where: { id: s.id },
      update: {
        name: s.name,
        url: s.url,
        adapter: s.adapter,
        frequencyCron: s.frequencyCron,
        isActive: s.enabled !== false,
      },
      create: {
        id: s.id,
        name: s.name,
        url: s.url,
        adapter: s.adapter,
        frequencyCron: s.frequencyCron,
        language: s.language,
        regions: s.regions as never[],
        platforms: s.platforms,
        categoryHint: (s.categoryHint ?? null) as never,
        isActive: s.enabled !== false,
      },
    });
    n++;
  }
  logger.info({ sources: n }, "sources seeded");
}
