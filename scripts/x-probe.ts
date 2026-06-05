/**
 * X auth + parse dry-run. Hits GET /2/tweets/search/recent ONCE with one small
 * query (max_results=10) to confirm the bearer works, reveal the tier/rate
 * limits (x-rate-limit-* headers), and prove the parser. Run BEFORE enabling
 * the worker. Costs ~10 reads (~$0.05). Requires X_BEARER_TOKEN in env.
 *
 * Run: pnpm tsx scripts/x-probe.ts
 */
import { env } from "../src/config/env.js";
import { searchRecent } from "../src/social/x.js";

async function main() {
  if (!env.X_BEARER_TOKEN) {
    console.error("❌ X_BEARER_TOKEN not set — add it to .env first.");
    process.exit(1);
  }

  const query = "#TikTokMadeMeBuyIt -is:retweet lang:en";
  console.log(`probing X search/recent with: ${query} (max_results=10)…\n`);

  // wrap fetch to surface status + rate-limit headers in the same single call
  // that searchRecent uses to parse — reveals the account tier/limits.
  const fetchImpl: typeof fetch = async (input, init) => {
    const res = await fetch(input, init);
    console.log("HTTP", res.status, res.statusText);
    for (const h of ["x-rate-limit-limit", "x-rate-limit-remaining", "x-rate-limit-reset", "x-app-limit-24hour-limit", "x-app-limit-24hour-remaining"]) {
      const v = res.headers.get(h);
      if (v != null) console.log(`  ${h}: ${v}`);
    }
    console.log("");
    return res;
  };

  const tweets = await searchRecent(query, { bearer: env.X_BEARER_TOKEN, maxResults: 10, fetchImpl });

  console.log(`parsed ${tweets.length} tweets:\n`);
  for (const t of tweets.slice(0, 5)) {
    console.log(`  ♥${t.likes} 🔁${t.retweets} ${t.mediaUrl ? "[img] " : ""}${t.link}`);
    console.log(`    ${t.text.replace(/\s+/g, " ").slice(0, 120)}`);
  }
  console.log("\n✅ X auth + parse verified");
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
