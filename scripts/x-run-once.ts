/**
 * Manually trigger one full X ingest run (all 3 tracks) for validation. Reads the
 * real X API and writes X01 items to the DB — needs X_ENABLED=true + X_BEARER_TOKEN
 * (and an AI key for extraction). Run:
 *   X_ENABLED=true X_BEARER_TOKEN=… pnpm tsx scripts/x-run-once.ts
 */
import { runXIngest } from "../src/workers/x.js";
import { getViralX, getHotTopicsX } from "../src/social/db.js";

async function main() {
  const r = await runXIngest();
  console.log("\n=== runXIngest result ===");
  console.log(JSON.stringify(r, null, 2));

  const [viral, hot] = await Promise.all([getViralX(8), getHotTopicsX(8)]);
  console.log(`\n=== stored Radar sample — viral products (${viral.length}) ===`);
  for (const v of viral) console.log(`  [${v.likes}♥] ${v.product}${v.query ? `  (${v.query})` : ""}`);
  console.log(`\n=== stored Radar sample — hot topics (${hot.length}) ===`);
  for (const h of hot) console.log(`  [${h.likes}♥] ${h.headline}`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
