/**
 * Real Stage-2 scoring verification with scoringClient (MiniMax reasoning).
 * Run: pnpm tsx scripts/verify-score.ts
 */
import { scoringClient } from "../src/ai/client.js";
import { runStage2, type Stage2Input } from "../src/ai/stage2.js";

const SAMPLES: Stage2Input[] = [
  { title: "US CBP confirms de minimis $800 exemption ends next Monday; duties apply to all parcels", category: "regulatory", regions: ["north_america"], platforms: [] },
  { title: "EU GPSR: marketplaces must list an EU Responsible Person by deadline", category: "regulatory", regions: ["europe"], platforms: ["amazon"] },
  { title: "Seller shares 5 tips for better product photos on TikTok Shop", category: "tip", regions: ["north_america"], platforms: ["tiktok-shop"] },
];

async function main() {
  const llm = scoringClient();
  console.log("scoring client:", llm.name, "\n");
  for (const s of SAMPLES) {
    const r = await runStage2(s, llm);
    console.log(`[${r.urgencyScore}] ${s.title.slice(0, 55)}`);
    console.log(`   impact: ${r.impactScope}`);
    console.log(`   action: ${r.recommendation}\n`);
  }
  console.log("✅ scoring verification complete");
}
main().catch((e) => { console.error("❌", e); process.exit(1); });
