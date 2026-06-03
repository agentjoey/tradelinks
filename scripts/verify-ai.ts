/**
 * Real AI Stage-1 verification with the configured provider (MiniMax token-plan
 * via Anthropic endpoint, or DeepSeek fallback). Proves T4 end-to-end.
 * Run: pnpm tsx scripts/verify-ai.ts
 */
import { pickClient, getUsageTotals } from "../src/ai/client.js";
import { runStage1, type Stage1Input } from "../src/ai/stage1.js";

const SAMPLES: Stage1Input[] = [
  {
    id: "s1",
    title: "EU GPSR compliance deadline approaches for online marketplaces",
    lang: "en",
    fallbackRegions: ["europe"],
  },
  {
    id: "s2",
    title: "亚马逊宣布调整欧洲站FBA配送费用，2026年生效",
    lang: "zh",
    fallbackRegions: ["europe", "north_america"],
  },
  {
    id: "s3",
    title: "BUY NOW! 70% off phone cases — limited sponsored offer",
    lang: "en",
    fallbackRegions: ["north_america"],
  },
];

async function main() {
  const client = pickClient("en");
  console.log(`provider: ${client.name}\n`);

  for (const s of SAMPLES) {
    const out = await runStage1(s, pickClient(s.lang));
    console.log(`— ${s.title.slice(0, 50)}`);
    console.log(`  keep=${out.keep} category=${out.category} regions=${JSON.stringify(out.regions)} platforms=${JSON.stringify(out.platforms)}`);
    if (out.keep) console.log(`  titleEn=${out.titleEn ?? "(already en)"}\n  summaryEn=${out.summaryEn?.slice(0, 120)}`);
    console.log();
  }

  const u = getUsageTotals();
  console.log(`usage: ${u.calls} calls, ${u.promptTokens} prompt + ${u.completionTokens} completion tokens`);
  console.log("✅ AI Stage-1 verification complete");
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
