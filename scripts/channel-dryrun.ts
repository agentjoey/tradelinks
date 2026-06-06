// Read-only preview of the next channel-push batch: gather → select → render,
// WITHOUT sending. Safe to run anytime. Usage: pnpm exec tsx scripts/channel-dryrun.ts
import { gatherChannelCandidates, alreadyPushedKeys, pushedTodayCount } from "../src/push/channel-db.js";
import { selectChannelBatch } from "../src/push/channel-select.js";
import { renderChannelAlert, renderChannelProduct } from "../src/push/channel-render.js";
import { env } from "../src/config/env.js";

async function main() {
  const channelId = env.TELEGRAM_CHANNEL_ID ?? "dryrun";
  const cands = await gatherChannelCandidates();
  const alreadyPushed = await alreadyPushedKeys(channelId);
  const pushedToday = await pushedTodayCount(channelId);
  const batch = selectChannelBatch(cands, {
    alreadyPushed,
    pushedToday,
    dailyMax: env.CHANNEL_PUSH_DAILY_MAX,
    runMax: env.CHANNEL_PUSH_RUN_MAX,
    minUrgency: env.CHANNEL_PUSH_MIN_URGENCY,
  });

  console.log(
    `candidates: ${cands.alerts.length} alerts, ${cands.products.length} products | ` +
    `alreadyPushed=${alreadyPushed.size} pushedToday=${pushedToday} | ` +
    `caps: daily=${env.CHANNEL_PUSH_DAILY_MAX} run=${env.CHANNEL_PUSH_RUN_MAX} minUrgency=${env.CHANNEL_PUSH_MIN_URGENCY}`,
  );
  console.log(`channelId=${channelId} → batch of ${batch.length}\n`);

  for (const it of batch) {
    const previewUrl = it.type === "alert" ? it.alert.sourceUrls[0] : it.product.url;
    console.log("─".repeat(56));
    console.log(it.type === "alert" ? renderChannelAlert(it.alert) : renderChannelProduct(it.product));
    console.log(`🔗 tap-image → ${previewUrl ?? "(no source url → text-only)"}`);
    console.log();
  }
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
