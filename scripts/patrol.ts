/**
 * Daily source & content patrol — the standing inspection that feeds the daily
 * 巡检报告. Prints a structured snapshot of one UTC day: source health, items,
 * alerts, daily notes, the 爆品 track (snapshots + movers), the trends track,
 * distribution, and subscribers.
 *
 * Run:  pnpm patrol              # yesterday (D-1 UTC)
 *       pnpm patrol 2026-06-10   # a specific UTC day
 *
 * Output is meant to be read by an agent and synthesised into the markdown
 * report (see the `daily-patrol` skill). Exit 0 always — this is a read-only
 * inspection, not a health gate (use scripts/health.ts for liveness).
 */
import { prisma } from "../src/db/client.js";
import { SOURCES } from "../src/config/sources.js";
import { computeTopMovers, moverWhyEn } from "../src/trends/movers.js";

/** YYYY-MM-DD for a UTC day; defaults to yesterday. */
function targetDay(arg: string | undefined): string {
  if (arg) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(arg)) throw new Error(`bad date: ${arg} (want YYYY-MM-DD)`);
    return arg;
  }
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const pct = (n: number, d: number) => (d === 0 ? "0%" : `${Math.round((100 * n) / d)}%`);
const kv = (o: Record<string, number>) =>
  Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join("  ");
function bar(label: string) { console.log(`\n===== ${label} =====`); }

async function main() {
  const DAY = targetDay(process.argv[2]);
  const start = new Date(`${DAY}T00:00:00.000Z`);
  const end = new Date(`${DAY}T23:59:59.999Z`);
  const within = { gte: start, lte: end };
  const dayDate = new Date(`${DAY}T00:00:00.000Z`); // @db.Date columns

  console.log(`\n######## TradeLinks 巡检 · ${DAY} (UTC) ########`);
  console.log(`(generated ${new Date().toISOString()})`);

  // ---------- 1. SOURCE HEALTH ----------
  bar("1. SOURCE HEALTH");
  const sources = await prisma.source.findMany();
  const srcMap = new Map(sources.map((s) => [s.id, s]));
  const itemsBySrc = await prisma.item.groupBy({ by: ["sourceId"], where: { crawledAt: within }, _count: { _all: true } });
  const fired = new Map(itemsBySrc.map((r) => [r.sourceId, r._count._all]));
  console.log(`configured ${SOURCES.length} | in DB ${sources.length} | active ${sources.filter((s) => s.isActive).length} | fired yesterday ${fired.size}`);

  console.log(`\nfired (items produced):`);
  [...fired.entries()].sort((a, b) => b[1] - a[1]).forEach(([id, c]) =>
    console.log(`  ${id.padEnd(5)} ${String(c).padStart(3)}  ${srcMap.get(id)?.name ?? "?"}`));

  const silent = sources.filter((s) => s.isActive && !fired.has(s.id));
  console.log(`\nSILENT active sources (no items in window): ${silent.length}`);
  silent.forEach((s) =>
    console.log(`  ${s.id.padEnd(5)} fails=${s.consecutiveFailures} lastOk=${s.lastOkAt?.toISOString().slice(0, 10) ?? "never"}  ${s.name}`));

  const failing = sources.filter((s) => s.consecutiveFailures >= 3).sort((a, b) => b.consecutiveFailures - a.consecutiveFailures);
  console.log(`\nFAILING sources (consecutiveFailures>=3): ${failing.length}`);
  failing.forEach((s) => console.log(`  ${s.id.padEnd(5)} fails=${s.consecutiveFailures} lastOk=${s.lastOkAt?.toISOString().slice(0, 10) ?? "never"}  ${s.name}`));

  const inactive = sources.filter((s) => !s.isActive).sort((a, b) => a.id.localeCompare(b.id));
  console.log(`\nINACTIVE sources (isActive=false): ${inactive.length}`);
  inactive.forEach((s) => console.log(`  ${s.id.padEnd(5)} ${s.name}`));

  // ---------- 2. ITEMS ----------
  bar("2. ITEMS (crawled in window)");
  const totalItems = await prisma.item.count({ where: { crawledAt: within } });
  const byStatus = await prisma.item.groupBy({ by: ["status"], where: { crawledAt: within }, _count: { _all: true } });
  const dupCount = await prisma.item.count({ where: { crawledAt: within, isDuplicate: true } });
  console.log(`total ${totalItems} | ${byStatus.map((r) => `${r.status}=${r._count._all}`).join("  ")} | dups ${dupCount}`);

  // ---------- 3. ALERTS ----------
  bar("3. ALERTS (created in window)");
  const alerts = await prisma.alert.findMany({ where: { createdAt: within } });
  const catCount: Record<string, number> = {};
  const regCount: Record<string, number> = {};
  for (const a of alerts) {
    catCount[a.category] = (catCount[a.category] ?? 0) + 1;
    for (const r of a.regions) regCount[r] = (regCount[r] ?? 0) + 1;
  }
  const naShare = pct(regCount["north_america"] ?? 0, alerts.length);
  console.log(`total ${alerts.length}`);
  console.log(`by category: ${kv(catCount)}`);
  console.log(`by region  : ${kv(regCount)}   (NA share ${naShare})`);
  console.log(`urgency>=4: ${alerts.filter((a) => a.urgencyScore >= 4).length} | with image: ${alerts.filter((a) => a.imageUrl).length} | weak summary: ${alerts.filter((a) => !a.summary || a.summary.length < 20).length}`);
  console.log(`\ntop urgency:`);
  [...alerts].sort((a, b) => b.urgencyScore - a.urgencyScore).slice(0, 12).forEach((a) =>
    console.log(`  u${a.urgencyScore} [${a.category}/${a.regions.join(",")}] ${a.title.slice(0, 70)}`));
  const lowq = alerts.filter((a) => a.title.length < 18 || /tablet|charger|\bset\b|^\$?\d/i.test(a.title));
  if (lowq.length) {
    console.log(`\npossible low-quality (short/product-like): ${lowq.length}`);
    lowq.slice(0, 10).forEach((a) => console.log(`  [${a.category}] ${a.title}`));
  }

  // ---------- 4. DAILY NOTES ----------
  bar("4. DAILY NOTES");
  const notes = await prisma.dailyNote.findMany({ where: { OR: [{ date: dayDate }, { createdAt: within }] } });
  if (!notes.length) console.log("  (none)");
  notes.forEach((n) =>
    console.log(`  [${n.status}/${n.kind}/${n.lang}] ${n.title.slice(0, 64)} | model=${n.model} reviewer=${n.reviewModel} removed=${n.removedClaims.length}`));

  // ---------- 5. 爆品轨 (BL-042) ----------
  bar("5. PRODUCT SNAPSHOTS (爆品轨)");
  const snaps = await prisma.productSnapshot.findMany({ where: { date: dayDate } });
  const snapByKey: Record<string, number> = {};
  for (const s of snaps) snapByKey[`${s.region}|${s.category}`] = (snapByKey[`${s.region}|${s.category}`] ?? 0) + 1;
  console.log(`snapshots ${snaps.length}`);
  Object.entries(snapByKey).sort().forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  if (snaps.length)
    console.log(`enrichment: reviewCount ${snaps.filter((s) => s.reviewCount != null).length}/${snaps.length}  rating ${snaps.filter((s) => s.rating != null).length}/${snaps.length}  price ${snaps.filter((s) => s.price != null).length}/${snaps.length} (${pct(snaps.filter((s) => s.price != null).length, snaps.length)})  commodity ${snaps.filter((s) => s.isCommodity).length}`);
  const snapDates = await prisma.productSnapshot.findMany({ distinct: ["date"], select: { date: true }, orderBy: { date: "desc" }, take: 6 });
  console.log(`recent snapshot dates: ${snapDates.map((d) => d.date.toISOString().slice(0, 10)).join(", ")}`);

  // movers — the real signal test
  console.log(`\nmovers (computeTopMovers):`);
  try {
    const movers = await computeTopMovers(10);
    console.log(`  qualified: ${movers.length} | with reviewDelta: ${movers.filter((m) => m.reviewDelta != null).length}`);
    movers.forEach((m, i) =>
      console.log(`  ${i + 1}. [${m.region}/${m.category}] ${m.title.slice(0, 44)}  score=${m.score} rankΔ=${m.rankDelta} revΔ=${m.reviewDelta} new=${m.isNewEntrant} #${m.currentRank} — ${moverWhyEn(m)}`));
  } catch (e) {
    console.log(`  ERR computeTopMovers: ${(e as Error).message}`);
  }

  // ---------- 6. 趋势轨 (Google Trends) ----------
  bar("6. TREND SNAPSHOTS (趋势轨)");
  const tsnaps = await prisma.trendSnapshot.findMany({ where: { date: dayDate } });
  const tByReg: Record<string, number> = {};
  for (const t of tsnaps) tByReg[t.region] = (tByReg[t.region] ?? 0) + 1;
  console.log(`trend snapshots ${tsnaps.length}${tsnaps.length ? `  (${kv(tByReg)})` : ""}`);
  const tDates = await prisma.trendSnapshot.findMany({ distinct: ["date"], select: { date: true }, orderBy: { date: "desc" }, take: 6 });
  console.log(`recent trend dates: ${tDates.map((d) => d.date.toISOString().slice(0, 10)).join(", ")}`);

  // ---------- 7. DISTRIBUTION ----------
  bar("7. DISTRIBUTION");
  const pushes = await prisma.channelPush.findMany({ where: { pushedAt: within } });
  const pByType: Record<string, number> = {};
  for (const p of pushes) pByType[p.itemType] = (pByType[p.itemType] ?? 0) + 1;
  console.log(`telegram pushes ${pushes.length}${pushes.length ? `  (${kv(pByType)})` : ""}`);
  const subTotal = await prisma.subscriber.count();
  const subConfirmed = await prisma.subscriber.count({ where: { status: "confirmed" } });
  console.log(`subscribers ${subTotal} total | ${subConfirmed} confirmed`);

  console.log(`\n######## end 巡检 · ${DAY} ########\n`);
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => { console.error("❌ patrol failed:", e); process.exit(1); });
