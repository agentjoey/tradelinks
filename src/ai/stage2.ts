// Stage 2 orchestration: urgency scoring. DB-free + injectable client → testable.
// Uses the reasoning model (scoringClient) — low-frequency, benefits from depth.
import type { LlmClient } from "./client.js";
import { buildScorePrompt, parseScore, type ScoreInput, type ScoreResult } from "./prompts/score.js";

export type Stage2Input = ScoreInput;
export type Stage2Output = ScoreResult;

export async function runStage2(input: Stage2Input, llm: LlmClient): Promise<Stage2Output> {
  const res = await llm.complete(buildScorePrompt(input));
  return parseScore(res.text);
}
