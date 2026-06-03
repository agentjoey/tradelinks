// v1 — 2026-06-03 — Stage 1.3 categorize + region/platform tagging
// See docs/specs/ai-pipeline.md. MUST return >=1 region (98% coverage rule).
import { z } from "zod";
import type { LlmCompleteOpts } from "../client.js";
import { extractJson } from "../json.js";

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
