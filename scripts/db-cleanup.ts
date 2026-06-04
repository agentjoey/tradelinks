/**
 * Reclaim Neon storage. Run: pnpm tsx scripts/db-cleanup.ts
 *
 * Root cause (measured): ~300MB of 323MB was the pg-boss `ingest-queue` job
 * partition — completed/failed jobs whose `data` holds the full scraped items
 * array (big JSONB), never purged after the earlier flood + worker restarts.
 *
 * This deletes FINISHED jobs only (completed/cancelled/failed); live jobs
 * (created/retry/active) are kept, so no pending work is lost. Then VACUUM FULL
 * returns the freed space to disk. Idempotent + safe to re-run.
 *
 * Prevention lives in queues.ts (short retention + frequent maintenance).
 */
import "dotenv/config";
import { prisma } from "../src/db/client.js";

async function dbSize(): Promise<string> {
  const r = await prisma.$queryRawUnsafe<any[]>(`select pg_size_pretty(pg_database_size(current_database())) as s`);
  return r[0].s;
}

async function main() {
  console.log("db size before:", await dbSize());

  const before = await prisma.$queryRawUnsafe<any[]>(
    `select count(*)::int as n from pgboss.job where state in ('completed','cancelled','failed')`,
  );
  console.log(`deleting ${before[0].n} finished pg-boss jobs (keeping created/retry/active)…`);
  const deleted = await prisma.$executeRawUnsafe(
    `DELETE FROM pgboss.job WHERE state IN ('completed','cancelled','failed')`,
  );
  console.log(`deleted rows: ${deleted}`);

  // VACUUM FULL every pgboss relation to return freed pages to disk. After the
  // delete these are near-empty, so the rewrite is tiny + the lock window short.
  const rels = await prisma.$queryRawUnsafe<any[]>(
    `select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='pgboss' and c.relkind='r' order by pg_total_relation_size(c.oid) desc`,
  );
  for (const r of rels) {
    try {
      await prisma.$executeRawUnsafe(`VACUUM (FULL) pgboss."${r.relname}"`);
      process.stdout.write(".");
    } catch (e: any) {
      console.log(`\n  skip ${r.relname}: ${String(e.message || e).split("\n")[0].slice(0, 100)}`);
    }
  }
  console.log("\ndb size after:", await dbSize());
  await prisma.$disconnect();
}
main().catch((e) => { console.error("cleanup failed:", e); process.exit(1); });
