import type PgBoss from "pg-boss";
import { QUEUES, sendOpts } from "../queue/queues.js";
import { prisma } from "../db/client.js";
import { SOURCES_BY_ID } from "../config/sources.js";
import { pickClient } from "../ai/client.js";
import { runStage1, type Stage1Input } from "../ai/stage1.js";
import { REGIONS } from "../ai/prompts/categorize.js";
import { resolveDuplication } from "../dedup/resolve.js";
import { findSimilarItems, applyDuplicate, applyCluster } from "../dedup/db.js";
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

      // Dedup level 2/3 (trigram + LLM cluster-judge). URL-exact already done at ingest.
      const dedupTitle = out.titleEn ?? item.title;
      const candidates = await findSimilarItems(dedupTitle, item.id);
      let isDup = false;
      if (candidates.length > 0) {
        const res = await resolveDuplication(dedupTitle, candidates, pickClient(item.lang));
        if (res.action === "duplicate") {
          await applyDuplicate(item.id);
          isDup = true;
          logger.debug({ itemId, ofId: res.ofId }, "marked duplicate");
        } else if (res.action === "cluster") {
          await applyCluster(item.id, res.withId, res.clusterId, item.url);
          logger.debug({ itemId, withId: res.withId }, "clustered");
        }
      }

      // Stage 2: non-duplicates go to scoring → alert generation
      if (!isDup) {
        await boss.send(QUEUES.score, { itemId: item.id }, sendOpts);
      }
    }
  });
}
