// Stage 1 orchestration: prefilter -> translate -> categorize.
// Pure of DB/queue so it can be unit-tested with a fake LlmClient.
import type { LlmClient } from "./client.js";
import { buildPrefilterPrompt, parsePrefilter } from "./prompts/prefilter.js";
import { buildTranslatePrompt, parseTranslate } from "./prompts/translate.js";
import {
  buildCategorizePrompt,
  parseCategorize,
  REGIONS,
} from "./prompts/categorize.js";

export interface Stage1Input {
  id: string;
  title: string;
  lang: string;
  snippet?: string;
  content?: string;
  /** source-configured regions, used as fallback when LLM returns none */
  fallbackRegions: readonly (typeof REGIONS)[number][];
}

export interface Stage1Output {
  keep: boolean;
  reason: string;
  titleEn: string | null;
  summaryEn: string | null;
  category: (typeof import("./prompts/categorize.js").CATEGORIES)[number] | null;
  regions: (typeof REGIONS)[number][];
  platforms: string[];
}

/** Run all of Stage 1 for a single item. Drops short-circuit (no enrich calls). */
export async function runStage1(item: Stage1Input, llm: LlmClient): Promise<Stage1Output> {
  // 1.1 pre-filter (single-item batch; batch-of-N is a token optimization)
  const pf = parsePrefilter(
    (await llm.complete(buildPrefilterPrompt([{ id: item.id, title: item.title, snippet: item.snippet }]))).text,
  );
  const decision = pf.find((r) => r.id === item.id) ?? { keep: true, reason: "no decision" };
  if (!decision.keep) {
    return {
      keep: false,
      reason: decision.reason,
      titleEn: null,
      summaryEn: null,
      category: null,
      regions: [],
      platforms: [],
    };
  }

  // 1.2 translate / summarize
  const tr = parseTranslate(
    (await llm.complete(buildTranslatePrompt({ title: item.title, lang: item.lang, content: item.content }))).text,
  );

  // 1.3 categorize + tag (uses EN title/summary when available)
  const cat = parseCategorize(
    (await llm.complete(
      buildCategorizePrompt({ title: tr.titleEn ?? item.title, summary: tr.summaryEn }),
    )).text,
    item.fallbackRegions,
  );

  return {
    keep: true,
    reason: decision.reason,
    titleEn: tr.titleEn,
    summaryEn: tr.summaryEn,
    category: cat.category,
    regions: cat.regions,
    platforms: cat.platforms,
  };
}
