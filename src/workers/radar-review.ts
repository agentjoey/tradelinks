import type PgBoss from "pg-boss";
import { QUEUES } from "../queue/queues.js";
import { sendOpsAlert } from "../push/send.js"; // → admin Telegram chat
import { getValidationHistories } from "../trends/product-snapshots.js";
import { rankMovers } from "../trends/movers.js";
import { renderRadarReview } from "../trends/product-signal.js";
import { logger } from "../lib/logger.js";

const TOP_N = 8;

/** 算今日 movers 并发一条 Telegram 复盘（admin chat）。可被 script 直接调用。 */
export async function runRadarReview(date = new Date().toISOString().slice(0, 10)): Promise<{ movers: number }> {
  const histories = await getValidationHistories(14);
  const top = rankMovers(histories).slice(0, TOP_N);
  const result = await sendOpsAlert(renderRadarReview(top.map((x) => x.mover), date));
  logger.info({ movers: top.length, telegram: result }, "radar review sent");
  return { movers: top.length };
}

export function registerRadarReviewWorker(boss: PgBoss) {
  return boss.work(QUEUES.radarReview, async () => {
    await runRadarReview();
  });
}
