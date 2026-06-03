// Dedup resolution orchestration. DB-free + injectable deps => unit-testable.
// See docs/specs/ai-pipeline.md (Dedup / Clustering).
import type { LlmClient } from "../ai/client.js";
import { buildClusterJudgePrompt, parseClusterJudge } from "../ai/prompts/cluster-judge.js";
import { classifyScore } from "./classify.js";

export interface SimilarCandidate {
  id: string;
  title: string; // titleEn ?? title
  score: number; // trigram similarity 0..1 vs the item under test
  clusterId: string | null;
}

export type DedupResolution =
  | { action: "distinct" }
  | { action: "duplicate"; ofId: string }
  | { action: "cluster"; withId: string; clusterId: string | null };

/**
 * Decide what to do with `itemTitle` given trigram-similar candidates (already
 * filtered to a 24h window by the DB layer). Highest score wins:
 *  - >=0.75            -> duplicate of that candidate
 *  - [0.5,0.75) grey   -> ask the LLM if same event; if yes -> cluster
 *  - <0.5              -> distinct
 */
export async function resolveDuplication(
  itemTitle: string,
  candidates: SimilarCandidate[],
  llm: LlmClient,
): Promise<DedupResolution> {
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  for (const cand of sorted) {
    const cls = classifyScore(cand.score);
    if (cls === "distinct") break; // sorted desc => the rest are also distinct
    if (cls === "duplicate") {
      return { action: "duplicate", ofId: cand.id };
    }
    // grey zone -> LLM judge
    const res = parseClusterJudge(
      (await llm.complete(buildClusterJudgePrompt({ a: itemTitle, b: cand.title }))).text,
    );
    if (res.same) {
      return { action: "cluster", withId: cand.id, clusterId: cand.clusterId };
    }
    // not same -> keep scanning lower candidates (still in grey/distinct range)
  }
  return { action: "distinct" };
}
