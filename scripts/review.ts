/**
 * Alert review-queue CLI (Sprint 002 T3). Web UI comes in Sprint 003.
 * Usage:
 *   pnpm tsx scripts/review.ts list
 *   pnpm tsx scripts/review.ts approve <alertId>
 *   pnpm tsx scripts/review.ts reject  <alertId>
 */
import { prisma } from "../src/db/client.js";
import { listPending, approveAlert, rejectAlert } from "../src/alerts/review.js";

async function main() {
  const [cmd, id] = process.argv.slice(2);

  if (cmd === "list" || !cmd) {
    const pending = await listPending();
    if (!pending.length) {
      console.log("✅ review queue empty");
      return;
    }
    console.log(`${pending.length} alert(s) awaiting review:\n`);
    for (const a of pending) {
      console.log(`[${a.urgencyScore}] ${a.category}  id=${a.id}`);
      console.log(`   ${a.title}`);
      console.log(`   regions: ${a.regions.join(", ")} | sources: ${a.sourceUrls.length}`);
      console.log(`   action: ${a.actionRequired ?? "-"}\n`);
    }
    console.log("approve: pnpm tsx scripts/review.ts approve <id>");
    return;
  }

  if (!id) {
    console.error(`Usage: review.ts ${cmd} <alertId>`);
    process.exit(1);
  }
  if (cmd === "approve") {
    console.log((await approveAlert(id)) ? `✅ approved ${id}` : `not found / not pending: ${id}`);
  } else if (cmd === "reject") {
    console.log((await rejectAlert(id)) ? `🚫 rejected ${id}` : `not found / not pending: ${id}`);
  } else {
    console.error(`Unknown command: ${cmd} (use list|approve|reject)`);
    process.exit(1);
  }
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => prisma.$disconnect());
