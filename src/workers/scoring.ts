import type PgBoss from "pg-boss";
import { QUEUES } from "../queue/queues.js";
import { prisma } from "../db/client.js";
import { scoringClient } from "../ai/client.js";
import { runStage2 } from "../ai/stage2.js";
import { upsertAlertForItem } from "../alerts/db.js";
import { pushAlertForReview } from "../push/send.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import type { Category, Region } from "../config/sources.js";

/**
 * score-queue worker (Stage 2). Scores a processed item with the reasoning
 * model, writes urgency fields, and generates/merges its alert.
 */
export function registerScoringWorker(boss: PgBoss) {
  return boss.work(QUEUES.score, async (jobs) => {
    for (const job of jobs) {
      const { itemId } = job.data as { itemId: string };
      const item = await prisma.item.findUnique({ where: { id: itemId } });
      if (!item || item.status !== "processed" || !item.category) continue;
      if (item.isDuplicate) continue; // duplicates don't get their own alert

      const score = await runStage2(
        {
          title: item.titleEn ?? item.title,
          summary: item.summaryEn,
          category: item.category as Category,
          regions: item.regions as Region[],
          platforms: item.platforms,
        },
        scoringClient(),
      );

      await prisma.item.update({
        where: { id: itemId },
        data: {
          urgencyScore: score.urgencyScore,
          impactScope: score.impactScope,
          recommendation: score.recommendation,
        },
      });

      const res = await upsertAlertForItem(item, score);
      logger.debug({ itemId, urgency: score.urgencyScore }, "scored → alert");

      // Auto-push high-urgency NEW alerts to Telegram with in-chat Approve/Reject.
      if (res?.created && res.urgencyScore >= env.PUSH_THRESHOLD && res.status === "pending_review") {
        await pushAlertForReview({
          id: res.alertId,
          title: item.titleEn ?? item.title,
          summary: item.summaryEn ?? "",
          urgencyScore: res.urgencyScore,
          category: item.category,
          regions: item.regions as string[],
          actionRequired: score.recommendation,
          sourceUrls: [item.url],
        }).catch((e) => logger.error({ err: String(e) }, "push failed"));
      }
    }
  });
}
