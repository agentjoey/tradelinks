/**
 * X ingest batch report (feeds BL-037 account scoring). Aggregates X01 Radar items
 * stored in the last N hours by their source query (@handle for the curated-accounts
 * track, or the search query string), so we can see which accounts/queries actually
 * produced signal — products vs topics, volume, peak engagement.
 *
 * Run: pnpm tsx scripts/x-report.ts [hours=26]
 */
import { prisma } from "../src/db/client.js";
import { X_SOURCE_ID } from "../src/config/sources.js";

interface RC { kind?: string; query?: string; likes?: number; author?: string }

async function main() {
  const hours = Number(process.argv[2] ?? "26");
  const since = new Date(Date.now() - hours * 3600_000);

  const items = await prisma.item.findMany({
    where: { sourceId: X_SOURCE_ID, crawledAt: { gte: since } },
    select: { title: true, rawContent: true, crawledAt: true },
  });

  type Agg = { source: string; isAccount: boolean; total: number; products: number; topics: number; maxLikes: number; sample: string };
  const by = new Map<string, Agg>();
  let products = 0, topics = 0;

  for (const it of items) {
    const rc = (it.rawContent ?? {}) as RC;
    const key = rc.query ?? "(unknown)";
    const a = by.get(key) ?? { source: key, isAccount: key.startsWith("@"), total: 0, products: 0, topics: 0, maxLikes: 0, sample: it.title };
    a.total++;
    if (rc.kind === "product") { a.products++; products++; }
    else if (rc.kind === "topic") { a.topics++; topics++; }
    a.maxLikes = Math.max(a.maxLikes, rc.likes ?? 0);
    by.set(key, a);
  }

  const rows = [...by.values()].sort((x, y) => y.total - x.total);
  const accounts = rows.filter((r) => r.isAccount);
  const searches = rows.filter((r) => !r.isAccount);

  console.log(`\n=== X ingest report — last ${hours}h ===`);
  console.log(`total items: ${items.length}  (products ${products} · topics ${topics})`);
  console.log(`sources: ${accounts.length} accounts · ${searches.length} search queries\n`);

  const fmt = (r: Agg) => `${r.source.padEnd(22)} total ${String(r.total).padStart(3)} | prod ${String(r.products).padStart(3)} | topic ${String(r.topics).padStart(3)} | ♥max ${String(r.maxLikes).padStart(4)} | ${r.sample.slice(0, 48)}`;

  console.log("— curated accounts (by yield) —");
  for (const r of accounts) console.log("  " + fmt(r));
  if (accounts.length === 0) console.log("  (none — X_ENABLED off, or no account items yet)");

  console.log("\n— search queries —");
  for (const r of searches) console.log("  " + fmt(r));

  // accounts that produced ZERO over the window (candidates to drop / down-weight)
  const { X_ACCOUNTS } = await import("../src/config/x-accounts.js");
  const seen = new Set(accounts.map((a) => a.source.replace(/^@/, "").toLowerCase()));
  const silent = X_ACCOUNTS.filter((h) => !seen.has(h.replace(/^@/, "").toLowerCase()));
  console.log(`\n— silent accounts this window (${silent.length}): ${silent.join(", ") || "none"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
