/**
 * Pipeline health check — is data flowing? Run: pnpm tsx scripts/health.ts
 * Exit 0 = healthy (new items in last hour), 1 = stalled.
 */
import { prisma } from "../src/db/client.js";

const SCRAPLING = ["D02", "D03", "D04", "D05", "D06", "D30", "D31", "D32", "D33", "D34", "D01"];

function ago(d: Date | null): string {
  if (!d) return "never";
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  return m < 60 ? `${m}m ago` : `${(m / 60).toFixed(1)}h ago`;
}

async function main() {
  const now = Date.now();
  const [items, alerts, pub, pending, raw, failed, last15m, last1h, scrapeItems, ge45] = await Promise.all([
    prisma.item.count(),
    prisma.alert.count(),
    prisma.alert.count({ where: { status: "published" } }),
    prisma.alert.count({ where: { status: "pending_review" } }),
    prisma.item.count({ where: { status: "raw" } }),
    prisma.item.count({ where: { status: "failed" } }),
    prisma.item.count({ where: { crawledAt: { gte: new Date(now - 900e3) } } }),
    prisma.item.count({ where: { crawledAt: { gte: new Date(now - 3600e3) } } }),
    prisma.item.count({ where: { sourceId: { in: SCRAPLING } } }),
    prisma.alert.count({ where: { urgencyScore: { gte: 4.5 } } }),
  ]);
  const newest = await prisma.item.findFirst({ orderBy: { crawledAt: "desc" }, select: { crawledAt: true, sourceId: true } });
  // worker heartbeat: the worker stamps source.lastCrawledAt on every crawl,
  // so this is "alive?" even when slow feeds yield no new items.
  const beat = await prisma.source.findFirst({ where: { lastCrawledAt: { not: null } }, orderBy: { lastCrawledAt: "desc" }, select: { lastCrawledAt: true, id: true } });
  const beatMin = beat?.lastCrawledAt ? (now - new Date(beat.lastCrawledAt).getTime()) / 60000 : Infinity;
  const workerAlive = beatMin < 15;

  console.log(`\n  TradeLinks pipeline — ${new Date().toISOString()}`);
  console.log(`  ${"─".repeat(46)}`);
  console.log(`  worker heartbeat .. ${ago(beat?.lastCrawledAt ?? null)}  [last crawl: ${beat?.id ?? "-"}]`);
  console.log(`  items ............. ${items}   (raw/queued ${raw}, failed ${failed})`);
  console.log(`  alerts ............ ${alerts}   (published ${pub}, pending ${pending}, ≥4.5 ${ge45})`);
  console.log(`  ingested last 1h .. ${last1h}   (last 15m: ${last15m})`);
  console.log(`  newest item ....... ${ago(newest?.crawledAt ?? null)}  [${newest?.sourceId ?? "-"}]`);
  console.log(`  scrapling items ... ${scrapeItems}  ${scrapeItems > 0 ? "(Amazon/Trends OK)" : "(none — Python scraper unreachable?)"}`);
  console.log(`  ${"─".repeat(46)}`);
  if (workerAlive && scrapeItems > 0) console.log(`  ✅ HEALTHY — worker alive, scrapling working`);
  else if (workerAlive) console.log(`  🟡 worker ALIVE but scrapling produces nothing (Python scraper / SCRAPER_SERVICE_URL?)`);
  else console.log(`  ⚠️  worker DOWN — no crawl heartbeat in 15m`);
  console.log("");

  await prisma.$disconnect();
  process.exit(workerAlive ? 0 : 1);
}
main().catch((e) => { console.error("❌", e); process.exit(2); });
