/**
 * Daily-Note model bench (BL-027). Same real-ish input set → one original brief
 * per model, EN + ZH, comparing: quality (read the saved files), multilingual,
 * latency, token consumption. Models: gemini-3.5-flash, MiniMax-M3,
 * MiniMax-M2.7-highspeed, deepseek-v4-flash.
 *
 * Run: pnpm tsx scripts/bench-daily-note.ts
 * Full articles are written to ./bench-out/daily-note/<model>-<lang>.md
 */
import { writeFileSync, mkdirSync } from "node:fs";
import {
  OpenAiCompatClient,
  AnthropicCompatClient,
  getUsageTotals,
  type LlmClient,
} from "../src/ai/client.js";
import { env } from "../src/config/env.js";
import { composeDailyNote, type DailyNoteInput } from "../src/daily/compose.js";

const OUT = "bench-out/daily-note";

// ---- representative "yesterday" signal set (EN; ZH run reuses same facts) ----
const baseInput: Omit<DailyNoteInput, "lang"> = {
  date: "2026-06-05",
  alerts: [
    { id: "a1", title: "EU lowers de-minimis: €0 customs threshold for parcels from 2026", summary: "All imports become dutiable; IOSS registration effectively mandatory for marketplaces.", category: "regulatory", regions: ["europe"], urgencyScore: 4.6, actionRequired: "Register for IOSS and re-price EU SKUs to absorb duty", sourceUrl: "https://example.com/eu-deminimis" },
    { id: "a2", title: "Amazon raises EU FBA fulfilment fees 4–7% effective July", summary: "Size-tier reshuffle hits small-and-light worst.", category: "platform_policy", regions: ["europe"], urgencyScore: 3.2, actionRequired: "Audit small-and-light SKUs for margin", sourceUrl: "https://example.com/amazon-fba-eu" },
    { id: "a3", title: "Red Sea diversions push Asia–Europe ocean rates up 28%", summary: "Transit times +10–14 days into Q3.", category: "logistics", regions: ["europe", "southeast_asia"], urgencyScore: 3.5, actionRequired: "Pull forward Q3 inventory; book early", sourceUrl: "https://example.com/redsea-rates" },
    { id: "a4", title: "Indonesia tightens cross-border import licensing on TikTok Shop", summary: "Local-entity requirement expands.", category: "regulatory", regions: ["southeast_asia"], urgencyScore: 3.0, actionRequired: "Confirm local partner / entity status", sourceUrl: "https://example.com/id-tiktok" },
    { id: "a5", title: "Shein opens third-party marketplace to US sellers", summary: "Onboarding waitlist live.", category: "platform_policy", regions: ["north_america"], urgencyScore: 2.4, actionRequired: null, sourceUrl: "https://example.com/shein-us" },
  ],
  signals: [
    { keyword: "portable neck fan", originRegion: "north_america", spreadingTo: ["southeast_asia", "middle_east"], confidence: 0.74 },
    { keyword: "collagen lip mask", originRegion: "europe", spreadingTo: ["north_america"], confidence: 0.61 },
  ],
  radar: [
    { kind: "product", title: "TikTokMadeMeBuyIt: magnetic phone-mount ring light", link: "https://x.com/i/web/status/1", likes: 412 },
    { kind: "topic", title: "Sellers debate EU de-minimis fallout for sub-€10 goods", link: "https://x.com/i/web/status/2", likes: 88 },
    { kind: "bestseller", title: "Amazon Movers: mini portable blender +180 ranks (Home)", link: "https://example.com/bsr" },
  ],
  recentTitles: ["Jun 4: SEA logistics squeeze and the rise of the $7 gadget"],
};

interface ModelDef { label: string; client: LlmClient }

const models: ModelDef[] = [
  // Gemini standard tier (reasoning off — thinking truncates JSON otherwise).
  { label: "gemini-3.5-flash", client: new OpenAiCompatClient({ name: "gemini-3.5-flash", baseUrl: env.GEMINI_BASE_URL, apiKey: env.GEMINI_API_KEY, model: "gemini-3.5-flash", extraBody: { reasoning_effort: "none" } }) },
  // Gemini Flex tier: ~50% cheaper, best-effort + possibly queued → long timeout.
  { label: "gemini-3.5-flash-flex", client: new OpenAiCompatClient({ name: "gemini-3.5-flash-flex", baseUrl: env.GEMINI_BASE_URL, apiKey: env.GEMINI_API_KEY, model: "gemini-3.5-flash", extraBody: { reasoning_effort: "none", service_tier: "flex" }, timeoutMs: 600_000 }) },
  // MiniMax-M3 with thinking OFF (per docs: thinking:{type:"disabled"}; M2.x ignores it).
  { label: "minimax-m3-nothink", client: new AnthropicCompatClient({ name: "minimax-m3-nothink", baseUrl: env.MINIMAX_BASE_URL, apiKey: env.MINIMAX_API_KEY, model: "MiniMax-M3", extraBody: { thinking: { type: "disabled" } }, timeoutMs: 120_000 }) },
  { label: "minimax-m2.7-highspeed", client: new AnthropicCompatClient({ name: "minimax-m2.7-highspeed", baseUrl: env.MINIMAX_BASE_URL, apiKey: env.MINIMAX_API_KEY, model: "MiniMax-M2.7-highspeed" }) },
  { label: "deepseek-v4-flash", client: new OpenAiCompatClient({ name: "deepseek-v4-flash", baseUrl: "https://api.deepseek.com/v1", apiKey: env.DEEPSEEK_API_KEY, model: "deepseek-v4-flash", extraBody: { thinking: { type: "disabled" } } }) },
];

const LANGS = ["en", "zh"] as const;

interface Row { model: string; lang: string; ok: boolean; ms: number; pt: number; ct: number; words: number; title: string; err?: string }

function words(s: string): number {
  // CJK: count characters; else whitespace tokens
  const cjk = (s.match(/[一-鿿]/g) ?? []).length;
  const latin = (s.trim().match(/\S+/g) ?? []).length;
  return cjk > latin ? cjk : latin;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const rows: Row[] = [];

  for (const m of models) {
    for (const lang of LANGS) {
      const input: DailyNoteInput = { ...baseInput, lang };
      const before = getUsageTotals();
      const t0 = Date.now();
      try {
        const note = await composeDailyNote(input, m.client);
        const ms = Date.now() - t0;
        const after = getUsageTotals();
        const pt = after.promptTokens - before.promptTokens;
        const ct = after.completionTokens - before.completionTokens;
        const md = `# ${note.title}\n\n*${note.dek}*\n\n> ${m.label} · ${lang} · ${ms}ms\n\n${note.bodyMarkdown}\n\n## Key takeaways\n${note.keyTakeaways.map((t) => `- ${t}`).join("\n")}\n\n**Meta:** ${note.metaDescription}\n\n**Tags:** ${note.tags.join(", ")}\n\n**Citations:**\n${note.citations.map((c) => `- [${c.title}](${c.url})`).join("\n")}\n`;
        writeFileSync(`${OUT}/${m.label}-${lang}.md`, md);
        rows.push({ model: m.label, lang, ok: true, ms, pt, ct, words: words(note.bodyMarkdown), title: note.title });
        console.log(`✓ ${m.label} [${lang}] ${ms}ms · ${words(note.bodyMarkdown)} words · ${pt}+${ct} tok · "${note.title}"`);
      } catch (e) {
        const ms = Date.now() - t0;
        rows.push({ model: m.label, lang, ok: false, ms, pt: 0, ct: 0, words: 0, title: "", err: String(e).slice(0, 160) });
        console.log(`✗ ${m.label} [${lang}] FAILED after ${ms}ms: ${String(e).slice(0, 160)}`);
      }
    }
  }

  console.log("\n================ SUMMARY ================");
  console.log("model                    | lang | ok  | ms     | words | prompt | compl | title");
  console.log("-------------------------|------|-----|--------|-------|--------|-------|------");
  for (const r of rows) {
    console.log(
      `${r.model.padEnd(24)} | ${r.lang.padEnd(4)} | ${(r.ok ? "yes" : "ERR").padEnd(3)} | ${String(r.ms).padStart(6)} | ${String(r.words).padStart(5)} | ${String(r.pt).padStart(6)} | ${String(r.ct).padStart(5)} | ${(r.err ?? r.title).slice(0, 36)}`,
    );
  }
  console.log(`\nFull articles written to ./${OUT}/  (read them to judge quality + multilingual fluency).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
