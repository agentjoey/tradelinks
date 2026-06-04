import "dotenv/config";
import { prisma } from "../src/db/client.js";

async function main() {
  const dbSize = await prisma.$queryRawUnsafe<any[]>(
    `select pg_size_pretty(pg_database_size(current_database())) as db`,
  );
  console.log("total db size:", dbSize[0].db);

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    select n.nspname as schema, c.relname as table,
           pg_size_pretty(pg_total_relation_size(c.oid)) as total,
           pg_total_relation_size(c.oid) as bytes
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','i','t') and n.nspname not in ('pg_catalog','information_schema')
    order by pg_total_relation_size(c.oid) desc limit 25
  `);
  console.log("\ntop relations by total size:");
  for (const r of rows) console.log(`  ${String(r.total).padStart(9)}  ${r.schema}.${r.table}`);

  // pgboss job/archive counts
  const pgboss = await prisma.$queryRawUnsafe<any[]>(`
    select table_name from information_schema.tables where table_schema='pgboss'
  `).catch(() => []);
  console.log("\npgboss tables:", pgboss.map((t:any)=>t.table_name).join(", ") || "(none)");
  for (const t of pgboss) {
    const c = await prisma.$queryRawUnsafe<any[]>(`select count(*)::int as n from pgboss."${t.table_name}"`).catch(()=>[{n:"?"}]);
    console.log(`  pgboss.${t.table_name}: ${c[0].n} rows`);
  }

  const items = await prisma.$queryRawUnsafe<any[]>(`
    select status, count(*)::int as n from items group by status order by n desc
  `);
  console.log("\nitems by status:");
  for (const r of items) console.log(`  ${r.status}: ${r.n}`);
  await prisma.$disconnect();
}
main().catch((e)=>{console.error(e);process.exit(1);});
