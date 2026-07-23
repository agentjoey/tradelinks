// v1 — 2026-06-03 — Stage 1.3 categorize + region/platform tagging
// See docs/specs/ai-pipeline.md. MUST return >=1 region (98% coverage rule).
import { z } from "zod";
import { MarketCode, OperatingStage, PlatformCode } from "@prisma/client";
import type { LlmCompleteOpts } from "../client.js";
import { extractJson } from "../json.js";
import {
  POLICY_TOPICS,
  PRODUCT_CATEGORIES,
  RISK_ATTRIBUTES,
  SIGNAL_TYPES,
} from "../../domain/intelligence/taxonomy.js";

export const REGIONS = [
  "north_america",
  "europe",
  "southeast_asia",
  "middle_east",
  "latin_america",
  "australia_nz",
] as const;

export const CATEGORIES = [
  "regulatory",
  "platform_policy",
  "logistics",
  "trend",
  "industry",
  "tip",
] as const;

export interface CategorizeInput {
  title: string;
  summary?: string;
}

const SYSTEM = `You tag cross-border e-commerce items.
Return JSON {"category", "regions", "platforms"}.
- category: one of regulatory | platform_policy | logistics | trend | industry | tip
- regions: 1..N of [north_america, europe, southeast_asia, middle_east, latin_america, australia_nz].
  Rules: explicit country/market -> its region; "EU"/"GDPR"/"GPSR" -> europe;
  "FBA"/Amazon.com -> north_america (unless other marketplace TLD).
  If global or unclear, list ALL applicable regions. NEVER return an empty list.
- platforms: 0..N lowercase-kebab platform names (e.g. amazon, tiktok-shop, shopee, ebay, temu, shein), or [].`;

export function buildCategorizePrompt(input: CategorizeInput): LlmCompleteOpts {
  const summary = input.summary ? `\nSummary: ${input.summary}` : "";
  return {
    system: SYSTEM,
    user: `Title: ${input.title}${summary}`,
    json: true,
    maxTokens: 200,
  };
}

export const CategorizeResultSchema = z.object({
  category: z.enum(CATEGORIES),
  regions: z.array(z.enum(REGIONS)),
  platforms: z.array(z.string()),
});
export type CategorizeResult = z.infer<typeof CategorizeResultSchema>;

/**
 * Parse + enforce the >=1 region invariant. If the model returns an empty
 * regions list, fall back to the source's configured regions.
 */
export function parseCategorize(
  text: string,
  fallbackRegions: readonly (typeof REGIONS)[number][],
): CategorizeResult {
  const parsed = CategorizeResultSchema.parse(extractJson(text));
  if (parsed.regions.length === 0) {
    parsed.regions = [...(fallbackRegions.length ? fallbackRegions : REGIONS)];
  }
  // dedupe + drop invalid
  parsed.regions = [...new Set(parsed.regions)];
  parsed.platforms = [...new Set(parsed.platforms.map((p) => p.toLowerCase()))];
  return parsed;
}

// ---------------------------------------------------------------------------
// Phase 1 canonical classification prompt (taxonomy-aligned).
// The parsed result feeds classifyChange (src/canonicalize/classify.ts);
// the two shapes must stay in agreement.
// ---------------------------------------------------------------------------

export interface CanonicalClassifyInput {
  title: string;
  summary?: string;
  market: (typeof MarketCode)[keyof typeof MarketCode];
  platforms: readonly (typeof PlatformCode)[keyof typeof PlatformCode][];
}

const CANONICAL_SYSTEM = `You classify one canonical cross-border e-commerce change
for US-market sellers, backed by official evidence.
Return JSON {"signalType","productCategories","riskAttributes","policyTopics",
"market","platforms","operatingStages","confidence"}.
- signalType: one of ${SIGNAL_TYPES.join(" | ")}
- productCategories: 1..N of ${PRODUCT_CATEGORIES.join(" | ")};
  use ALL_PRODUCTS alone when the change truly applies to every category,
  never mix it with specific categories.
- riskAttributes: 0..N of ${RISK_ATTRIBUTES.join(" | ")}, or []
- policyTopics: 0..N of ${POLICY_TOPICS.join(" | ")}, or []
- market: ${Object.keys(MarketCode).join(" | ")}
- platforms: 0..N of ${Object.keys(PlatformCode).join(" | ")}, or []
- operatingStages: 1..N of ${Object.keys(OperatingStage).join(" | ")};
  return [] only when the impacted stages are genuinely ambiguous.
- confidence: number 0..1 — your calibrated confidence in the whole
  classification. Below 0.80 the change is routed to human review.`;

export function buildCanonicalClassifyPrompt(input: CanonicalClassifyInput): LlmCompleteOpts {
  const summary = input.summary ? `\nSummary: ${input.summary}` : "";
  return {
    system: CANONICAL_SYSTEM,
    user: `Market: ${input.market}\nPlatforms: ${input.platforms.join(", ") || "any"}\nTitle: ${input.title}${summary}`,
    json: true,
    maxTokens: 300,
  };
}

export const CanonicalClassifyResultSchema = z.object({
  signalType: z.enum(SIGNAL_TYPES),
  productCategories: z.array(z.enum(PRODUCT_CATEGORIES)).min(1),
  riskAttributes: z.array(z.enum(RISK_ATTRIBUTES)),
  policyTopics: z.array(z.enum(POLICY_TOPICS)),
  market: z.nativeEnum(MarketCode),
  platforms: z.array(z.nativeEnum(PlatformCode)),
  operatingStages: z.array(z.nativeEnum(OperatingStage)),
  confidence: z.number().min(0).max(1),
});
export type CanonicalClassifyResult = z.infer<typeof CanonicalClassifyResultSchema>;

/** Parse + validate the model's canonical classification against the taxonomy. */
export function parseCanonicalClassify(text: string): CanonicalClassifyResult {
  const parsed = CanonicalClassifyResultSchema.parse(extractJson(text));
  return {
    ...parsed,
    productCategories: [...new Set(parsed.productCategories)],
    riskAttributes: [...new Set(parsed.riskAttributes)],
    policyTopics: [...new Set(parsed.policyTopics)],
    platforms: [...new Set(parsed.platforms)],
    operatingStages: [...new Set(parsed.operatingStages)],
  };
}
