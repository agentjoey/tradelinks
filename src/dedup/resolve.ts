// Dedup resolution orchestration. DB-free + injectable deps => unit-testable.
// See docs/specs/ai-pipeline.md (Dedup / Clustering).
import type { LlmClient } from "../ai/client.js";
import { buildClusterJudgePrompt, parseClusterJudge } from "../ai/prompts/cluster-judge.js";
import { normalizeAuthorityEventId } from "../canonicalize/fingerprint.js";
import { classifyScore } from "./classify.js";

export interface SimilarCandidate {
  id: string;
  title: string; // titleEn ?? title
  score: number; // trigram similarity 0..1 vs the item under test
  clusterId: string | null;
  /** Official event/recall/rule id when the authority publishes one. */
  authorityEventId?: string | null;
}

export type DedupResolution =
  | { action: "distinct" }
  | { action: "duplicate"; ofId: string }
  | { action: "cluster"; withId: string; clusterId: string | null };

/**
 * Decide what to do with `itemTitle` given trigram-similar candidates (already
 * filtered to a 24h window by the DB layer). Official event ids dominate when
 * both sides carry one: a matching id clusters immediately, a conflicting id
 * excludes the candidate (false-merge guard). Otherwise highest score wins:
 *  - >=0.75            -> duplicate of that candidate
 *  - [0.5,0.75) grey   -> ask the LLM if same event; if yes -> cluster
 *  - <0.5              -> distinct
 */
export async function resolveDuplication(
  itemTitle: string,
  candidates: SimilarCandidate[],
  llm: LlmClient,
  opts: { authorityEventId?: string | null } = {},
): Promise<DedupResolution> {
  const itemEventId = normalizeAuthorityEventId(opts.authorityEventId);
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  for (const cand of sorted) {
    const candEventId = normalizeAuthorityEventId(cand.authorityEventId);
    if (itemEventId !== null && candEventId !== null) {
      if (candEventId === itemEventId) {
        return { action: "cluster", withId: cand.id, clusterId: cand.clusterId };
      }
      continue; // different official events: never merge, whatever the score
    }
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
