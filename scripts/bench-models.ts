/**
 * Model bench: MiniMax-M2.7-highspeed vs deepseek-v4-flash (thinking off).
 * Same Stage-1 prompts, real items. Compares correctness, latency, tokens.
 * Run: pnpm tsx scripts/bench-models.ts
 */
import {
  AnthropicCompatClient,
  OpenAiCompatClient,
  getUsageTotals,
  type LlmClient,
} from "../src/ai/client.js";
import { env } from "../src/config/env.js";
import { runStage1, type Stage1Input } from "../src/ai/stage1.js";

type Region = Stage1Input["fallbackRegions"][number];
interface Case {
  id: string;
  title: string;
  lang: string;
  fb: Region[];
  expectKeep: boolean;
  note: string;
}

const CASES: Case[] = [
  { id: "c1", title: "EU GPSR compliance deadline approaches for online marketplaces", lang: "en", fb: ["europe"], expectKeep: true, note: "clear regulatory" },
  { id: "c2", title: "亚马逊宣布调整欧洲站FBA配送费用，2026年生效", lang: "zh", fb: ["europe", "north_america"], expectKeep: true, note: "ZH→EN + platform_policy" },
  { id: "c3", title: "BUY NOW! 70% off phone cases — limited sponsored offer", lang: "en", fb: ["north_america"], expectKeep: false, note: "spam drop" },
  { id: "c4", title: "Indonesia tightens import permit rules for cross-border e-commerce sellers", lang: "en", fb: ["southeast_asia"], expectKeep: true, note: "SEA regulatory" },
  { id: "c5", title: "Freightos index shows Asia–US ocean freight rates surge 40%", lang: "en", fb: ["north_america"], expectKeep: true, note: "logistics" },
  { id: "c6", title: "easyGroup launches easyShop.com marketplace in partnership with OnBuy", lang: "en", fb: ["europe"], expectKeep: true, note: "borderline: new marketplace" },
];

const minimaxHS = new AnthropicCompatClient({
  name: "MiniMax-M2.7-highspeed",
  baseUrl: env.MINIMAX_BASE_URL,
  apiKey: env.MINIMAX_API_KEY,
  model: "MiniMax-M2.7-highspeed",
});

const deepseekFlash = new OpenAiCompatClient({
  name: "deepseek-v4-flash (no-think)",
  baseUrl: "https://api.deepseek.com/v1",
  apiKey: env.DEEPSEEK_API_KEY,
  model: "deepseek-v4-flash",
  extraBody: { thinking: { type: "disabled" } },
});

async function bench(client: LlmClient) {
  console.log(`\n========== ${client.name} ==========`);
  const before = getUsageTotals();
  const t0 = Date.now();
  let correct = 0;
  const latencies: number[] = [];

  for (const c of CASES) {
    const s: Stage1Input = { id: c.id, title: c.title, lang: c.lang, fallbackRegions: c.fb };
    const it0 = Date.now();
    try {
      const out = await runStage1(s, client);
      const ms = Date.now() - it0;
      latencies.push(ms);
      const ok = out.keep === c.expectKeep;
      if (ok) correct++;
      const tag = out.keep ? `keep ${out.category} ${JSON.stringify(out.regions)}` : "DROP";
      const tr = out.titleEn ? ` | en="${out.titleEn.slice(0, 40)}"` : "";
      console.log(`${ok ? "✓" : "✗"} [${ms}ms] ${c.note}: ${tag}${tr}`);
    } catch (e) {
      latencies.push(Date.now() - it0);
      console.log(`✗ [ERR] ${c.note}: ${e instanceof Error ? e.message.slice(0, 120) : e}`);
    }
  }

  const after = getUsageTotals();
  const totalMs = Date.now() - t0;
  const calls = after.calls - before.calls;
  const ptoks = after.promptTokens - before.promptTokens;
  const ctoks = after.completionTokens - before.completionTokens;
  console.log(`— accuracy ${correct}/${CASES.length} | total ${totalMs}ms | avg/item ${Math.round(totalMs / CASES.length)}ms`);
  console.log(`— ${calls} calls | ${ptoks} prompt + ${ctoks} completion tokens (${Math.round((ptoks + ctoks) / CASES.length)} tok/item)`);
  return { name: client.name, correct, totalMs, calls, ctoks };
}

async function main() {
  const a = await bench(minimaxHS);
  const b = await bench(deepseekFlash);
  console.log("\n========== SUMMARY ==========");
  for (const r of [a, b]) {
    console.log(`${r.name}: acc ${r.correct}/${CASES.length}, ${Math.round(r.totalMs / CASES.length)}ms/item, ${Math.round(r.ctoks / CASES.length)} out-tok/item`);
  }
}

main().catch((e) => { console.error("❌", e); process.exit(1); });
