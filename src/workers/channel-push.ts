// Curated Telegram channel push worker (BL-039 slice 1).
// channel-push-tick: gathers published alerts + bestseller/viral products,
// selects a blended batch respecting daily budget + run cap, renders, sends,
// and records confirmations. Separate from admin-review push — public channel only.

import type PgBoss from "pg-boss";
import { QUEUES } from "../queue/queues.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { sendToChannel } from "../push/send.js";
import { selectChannelBatch } from "../push/channel-select.js";
import { renderChannelAlert, renderChannelProduct } from "../push/channel-render.js";
import {
  gatherChannelCandidates,
  alreadyPushedKeys,
  pushedTodayCount,
  recordChannelPush,
} from "../push/channel-db.js";

export interface ChannelPushResult {
  posted: number;
  skipped: number;
  failed: number;
  pushedToday: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * One tick of the channel push pipeline: gather → select → render → send → record.
 * Idempotent: already-pushed items are filtered by selectChannelBatch;
 * double-sends are blocked by the ChannelPush unique constraint.
 */
export async function runChannelPush(): Promise<ChannelPushResult> {
  if (!env.CHANNEL_PUSH_ENABLED || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHANNEL_ID) {
    logger.info("channel-push disabled (CHANNEL_PUSH_ENABLED, token, or channel id not set)");
    return { posted: 0, skipped: 0, failed: 0, pushedToday: 0 };
  }

  const channelId = env.TELEGRAM_CHANNEL_ID;

  // 1. Gather candidates + tracking state
  const [candidates, alreadyPushed, pushedToday] = await Promise.all([
    gatherChannelCandidates(),
    alreadyPushedKeys(channelId),
    pushedTodayCount(channelId),
  ]);

  logger.info(
    { alerts: candidates.alerts.length, products: candidates.products.length, alreadyPushed: alreadyPushed.size, pushedToday },
    "channel-push gathering done",
  );

  // 2. Select batch (pure)
  const batch = selectChannelBatch(candidates, {
    alreadyPushed,
    pushedToday,
    dailyMax: env.CHANNEL_PUSH_DAILY_MAX,
    runMax: env.CHANNEL_PUSH_RUN_MAX,
    minUrgency: env.CHANNEL_PUSH_MIN_URGENCY,
  });

  if (batch.length === 0) {
    logger.info({ pushedToday }, "channel-push no eligible items for this run");
    return { posted: 0, skipped: 0, failed: 0, pushedToday };
  }

  // 3. Send with spacing (~1.5s between messages)
  let posted = 0;
  let failed = 0;

  for (const item of batch) {
    const text =
      item.type === "alert"
        ? renderChannelAlert(item.alert)
        : renderChannelProduct(item.product);

    // Alerts: tappable link preview (tap image → source). Products: sendPhoto with
    // our stored image (Amazon blocks link-preview og:image) + a source button.
    const opts =
      item.type === "alert"
        ? { previewUrl: item.alert.sourceUrls[0] }
        : { imageUrl: item.product.imageUrl, sourceUrl: item.product.url, buttonLabel: `↗ ${item.product.platform}` };
    const itemType = item.type === "alert" ? "alert" : "product";

    // Dry-run log when token not configured (shouldn't reach here per gate above,
    // but safe to keep as defense-in-depth)
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHANNEL_ID) {
      logger.info({ itemType, itemId: item.itemId, text: text.slice(0, 120) }, "channel-push dry-run");
      continue;
    }

    const res = await sendToChannel(text, opts);
    if (res.status === "sent") {
      await recordChannelPush(itemType, item.itemId, channelId, res.messageId);
      posted++;
      logger.info({ itemType, itemId: item.itemId, messageId: res.messageId }, "channel-push sent");
    } else {
      failed++;
      logger.warn({ itemType, itemId: item.itemId, status: res.status }, "channel-push send failed");
    }

    // Spacing between messages to stay well under rate limits
    if (batch.length > 1) await sleep(1500);
  }

  const result: ChannelPushResult = { posted, skipped: 0, failed, pushedToday: pushedToday + posted };
  logger.info(result, "channel-push run complete");
  return result;
}

export function registerChannelPushWorker(boss: PgBoss) {
  return boss.work(QUEUES.channelPush, async () => {
    await runChannelPush();
  });
}
