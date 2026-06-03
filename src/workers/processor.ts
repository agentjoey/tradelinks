import type PgBoss from "pg-boss";
import { QUEUES } from "../queue/queues.js";
import { prisma } from "../db/client.js";
import { SOURCES_BY_ID } from "../config/sources.js";
import { pickClient } from "../ai/client.js";
import { runStage1, type Stage1Input } from "../ai/stage1.js";
import { REGIONS } from "../ai/prompts/categorize.js";
import { logger } from "../lib/logger.js";

type Region = (typeof REGIONS)[number];

/**
 * process-queue worker. Runs AI Stage 1 on a raw item and writes the result:
 * filtered (dropped) or processed (translated + categorized + tagged).
 */
export async function registerProcessorWorker(boss: PgBoss) {
  await boss.work(QUEUES.process, async (jobs) => {
    for (const job of jobs) {
      const { itemId } = job.data as { itemId: string };
      const item = await prisma.item.findUnique({ where: { id: itemId } });
      if (!item || item.status !== "raw") continue;

      const source = SOURCES_BY_ID.get(item.sourceId);
      const fallbackRegions = (source?.regions ?? []) as Region[];
      const snippet =
        item.rawContent && typeof item.rawContent === "object"
          ? (item.rawContent as Record<string, unknown>).contentSnippet
          : undefined;

      const input: Stage1Input = {
        id: item.id,
        title: item.title,
        lang: item.lang,
        snippet: typeof snippet === "string" ? snippet : undefined,
        content: typeof snippet === "string" ? snippet : undefined,
        fallbackRegions,
      };

      const out = await runStage1(input, pickClient(item.lang));

      if (!out.keep) {
        await prisma.item.update({ where: { id: itemId }, data: { status: "filtered" } });
        logger.debug({ itemId, reason: out.reason }, "filtered");
        continue;
      }

      await prisma.item.update({
        where: { id: itemId },
        data: {
          status: "processed",
          titleEn: out.titleEn,
          summaryEn: out.summaryEn,
          category: out.category,
          regions: out.regions,
          platforms: out.platforms,
        },
      });
      logger.debug({ itemId, category: out.category, regions: out.regions }, "processed");
    }
  });
}
