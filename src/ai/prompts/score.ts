// v1 — 2026-06-03 — Stage 2 urgency scoring (run by the reasoning model)
// See docs/specs/ai-pipeline.md. Produces the seller-facing alert fields.
import { z } from "zod";
import type { LlmCompleteOpts } from "../client.js";
import { extractJson } from "../json.js";
import { CATEGORIES, REGIONS } from "./categorize.js";

export interface ScoreInput {
  title: string;
  summary?: string | null;
  category: (typeof CATEGORIES)[number];
  regions: (typeof REGIONS)[number][];
  platforms: string[];
}

const SYSTEM = `You score cross-border e-commerce alerts by how URGENTLY a seller must act.
urgencyScore (0.0-5.0):
  5 = act now, money/store at imminent risk (store-ban wave, IP TRO freezing funds,
      a rule/tariff going live within days)
  4 = high impact, plan this week (confirmed fee/policy/tariff/compliance change with a date)
  3 = notable, worth knowing (new requirement announced, significant market move)
  2 = informational (general industry news, trends to watch)
  1 = minor / nice-to-know
  0 = noise
Also return:
  impactScope: one sentence on WHO is affected (which sellers / regions / platforms).
  recommendation: one concrete action the seller should take (or "monitor" if none).
Respond ONLY with JSON {"urgencyScore": number, "impactScope": string, "recommendation": string}.`;

export function buildScorePrompt(input: ScoreInput): LlmCompleteOpts {
  const lines = [
    `category: ${input.category}`,
    `regions: ${input.regions.join(", ") || "n/a"}`,
    `platforms: ${input.platforms.join(", ") || "n/a"}`,
    `title: ${input.title}`,
  ];
  if (input.summary) lines.push(`summary: ${input.summary}`);
  return { system: SYSTEM, user: lines.join("\n"), json: true, maxTokens: 400 };
}

export const ScoreResultSchema = z.object({
  // no min/max here — tolerate out-of-range model output, clamp in parseScore
  urgencyScore: z.number(),
  impactScope: z.string(),
  recommendation: z.string(),
});
export type ScoreResult = z.infer<typeof ScoreResultSchema>;

export function parseScore(text: string): ScoreResult {
  const r = ScoreResultSchema.parse(extractJson(text));
  // clamp defensively
  r.urgencyScore = Math.max(0, Math.min(5, r.urgencyScore));
  return r;
}
