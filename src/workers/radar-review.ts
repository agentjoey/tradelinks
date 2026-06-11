import type PgBoss from "pg-boss";
import { QUEUES } from "../queue/queues.js";
import { sendOpsAlert } from "../push/send.js"; // → admin Telegram chat
import { getValidationHistories } from "../trends/product-snapshots.js";
import { rankMovers } from "../trends/movers.js";
import { renderRadarReview } from "../trends/product-signal.js";
import { generateInsight } from "../movers/insight.js";
import { upsertMoverInsight } from "../movers/db.js";
import { editorClient } from "../ai/client.js";
import { logger } from "../lib/logger.js";

const TOP_N = 8;

/**
 * 算今日 movers → 为每个生成 evidence-bound 洞察卡 → 持久化(供 /radar The Movers) → 发 Telegram 复盘。
 * 洞察卡生成失败不阻塞(逐个 try);Telegram 始终发。可被 script 直接调用。
 */
export async function runRadarReview(date = new Date().toISOString().slice(0, 10)): Promise<{ movers: number; cards: number }> {
  const histories = await getValidationHistories(14);
  const top = rankMovers(histories).slice(0, TOP_N);

  const client = editorClient();
  let cards = 0;
  for (const { mover, evidence } of top) {
    try {
      const card = await generateInsight(client, evidence);
      await upsertMoverInsight({ date, mover, card, model: client.name });
      cards++;
    } catch (e) {
      logger.warn({ asin: mover.asin, err: String(e) }, "mover insight failed");
    }
  }

  const result = await sendOpsAlert(renderRadarReview(top.map((x) => x.mover), date));
  logger.info({ movers: top.length, cards, telegram: result }, "radar review sent");
  return { movers: top.length, cards };
}

export function registerRadarReviewWorker(boss: PgBoss) {
  return boss.work(QUEUES.radarReview, async () => {
    await runRadarReview();
  });
}
