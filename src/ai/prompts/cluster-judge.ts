// v1 — 2026-06-03 — dedup grey-zone judge: are two items the SAME event?
// See docs/specs/ai-pipeline.md. Only invoked for trigram score 0.5–0.75.
import { z } from "zod";
import type { LlmCompleteOpts } from "../client.js";
import { extractJson } from "../json.js";

export interface ClusterJudgeInput {
  a: string; // title (or titleEn) of candidate A
  b: string; // title (or titleEn) of candidate B
}

const SYSTEM = `You decide if two cross-border e-commerce news items report the
SAME underlying event (same policy change, same launch, same incident), even if
worded differently or from different sources. Different events about the same
company are NOT the same. Respond ONLY with JSON {"same": boolean, "reason": string}.`;

export function buildClusterJudgePrompt(input: ClusterJudgeInput): LlmCompleteOpts {
  return {
    system: SYSTEM,
    user: `A: ${input.a}\nB: ${input.b}`,
    json: true,
    maxTokens: 120,
  };
}

export const ClusterJudgeResultSchema = z.object({
  same: z.boolean(),
  reason: z.string().optional().default(""),
});
export type ClusterJudgeResult = z.infer<typeof ClusterJudgeResultSchema>;

export function parseClusterJudge(text: string): ClusterJudgeResult {
  return ClusterJudgeResultSchema.parse(extractJson(text));
}
