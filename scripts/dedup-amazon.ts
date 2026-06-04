/**
 * One-off: collapse duplicate Amazon items created before URL canonicalization.
 * Run: pnpm tsx scripts/dedup-amazon.ts
 *
 * Amazon /dp/<ASIN> URLs carried a per-crawl /ref=…/<session-id> suffix, so
 * url-dedup failed and every crawl re-stored the same ~30 products (one source
 * had 2022 rows for ~30 products). normalizeUrl() now collapses them to
 * /dp/<ASIN>; this script applies that retroactively: per canonical URL keep the
 * newest row (rewritten to the canonical url+hash), delete the rest.
 */
import "dotenv/config";
import { prisma } from "../src/db/client.js";
import { normalizeUrl, urlHash } from "../src/lib/hash.js";
import { BESTSELLER_SOURCE_IDS } from "../src/config/sources.js";

async function main() {
  const ids = [...BESTSELLER_SOURCE_IDS];
  const items = await prisma.item.findMany({
    where: { sourceId: { in: ids } },
    select: { id: true, url: true, crawledAt: true },
    orderBy: { crawledAt: "desc" },
  });
  console.log(`scanning ${items.length} bestseller items…`);

  const groups = new Map<string, { id: string }[]>(); // canonical -> rows (newest first)
  for (const it of items) {
    const canon = normalizeUrl(it.url);
    (groups.get(canon) ?? groups.set(canon, []).get(canon)!).push(it);
  }
  console.log(`distinct products (canonical): ${groups.size}`);

  const toDelete: string[] = [];
  let rewritten = 0;
  for (const [canon, rows] of groups) {
    const [keep, ...dups] = rows;
    toDelete.push(...dups.map((d) => d.id));
    // rewrite survivor to canonical so future crawls dedupe against it
    try {
      await prisma.item.update({ where: { id: keep!.id }, data: { url: canon, urlHash: urlHash(canon) } });
      rewritten++;
    } catch {
      // canonical already taken (shouldn't happen — one group per canonical); drop survivor too
      toDelete.push(keep!.id);
    }
  }

  let deleted = 0;
  for (let i = 0; i < toDelete.length; i += 500) {
    const batch = toDelete.slice(i, i + 500);
    const r = await prisma.item.deleteMany({ where: { id: { in: batch } } });
    deleted += r.count;
  }

  console.log(`survivors rewritten: ${rewritten} | duplicate rows deleted: ${deleted}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error("dedup failed:", e); process.exit(1); });
