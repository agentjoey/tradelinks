/**
 * Verify the curated X account list (BL-034) BEFORE enabling the track: resolves
 * every handle → user_id in one batched read and reports which are valid vs
 * unknown/suspended, so the starter list can be trimmed. Optionally samples one
 * timeline (--sample) to confirm the read path. Needs X_BEARER_TOKEN.
 *
 * Run: pnpm tsx scripts/x-accounts-probe.ts [--sample]
 */
import { env } from "../src/config/env.js";
import { resolveUserIds, fetchUserTimeline } from "../src/social/x.js";
import { X_ACCOUNTS } from "../src/config/x-accounts.js";

async function main() {
  const bearer = env.X_BEARER_TOKEN;
  if (!bearer) {
    console.error("X_BEARER_TOKEN not set — cannot probe.");
    process.exit(1);
  }

  const resolved = await resolveUserIds(X_ACCOUNTS, { bearer });
  const found = new Set(resolved.map((r) => r.handle.toLowerCase()));
  const missing = X_ACCOUNTS.filter((h) => !found.has(h.replace(/^@/, "").toLowerCase()));

  console.log(`resolved ${resolved.length}/${X_ACCOUNTS.length} handles (1 read):`);
  for (const r of resolved) console.log(`  ✓ @${r.handle} → ${r.id}`);
  if (missing.length) {
    console.log(`\n✗ unresolved (trim or fix these): ${missing.join(", ")}`);
  }

  if (process.argv.includes("--sample") && resolved[0]) {
    const a = resolved[0];
    const tweets = await fetchUserTimeline(a.id, { bearer, maxResults: 5 });
    console.log(`\nsample timeline @${a.handle} (5 latest, ${tweets.length} returned):`);
    for (const t of tweets) console.log(`  [${t.likes}♥] ${t.text.replace(/\s+/g, " ").slice(0, 100)}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
