/**
 * Deterministic-first cluster decisions for canonical evidence.
 *
 * Order of decision:
 *  1. Official event/recall/rule ids dominate — equal ids merge, different
 *     ids stay separate, no matter the titles.
 *  2. Incompatible market, platform, or effective-date facts block any
 *     fallback merge (false-merge guards).
 *  3. Trigram similarity at/above the duplicate threshold merges.
 *  4. The grey zone only merges when an injected model judge confirms the
 *     same event; without a model it stays separate (never auto-merge).
 *
 * Reuses the existing dedup thresholds (src/dedup/classify.ts) and the
 * grey-zone judge prompt (src/ai/prompts/cluster-judge.ts).
 */
import type { LlmClient } from "../ai/client.js";
import { buildClusterJudgePrompt, parseClusterJudge } from "../ai/prompts/cluster-judge.js";
import { classifyScore } from "../dedup/classify.js";
import {
  dayDistance,
  normalizeAuthorityEventId,
  titleSimilarity,
  type SourceItemFacts,
} from "./fingerprint.js";

/** Max whole-day distance between effective dates for a fallback merge. */
export const EFFECTIVE_DATE_WINDOW_DAYS = 7;

export interface ClusterInput {
  left: SourceItemFacts;
  right: SourceItemFacts;
  /** Optional grey-zone judge; deterministic fixtures/tests omit or fake it. */
  llm?: LlmClient;
}

export type ClusterReason =
  | "OFFICIAL_ID_MATCH"
  | "OFFICIAL_ID_MISMATCH"
  | "MARKET_MISMATCH"
  | "PLATFORM_MISMATCH"
  | "DATE_WINDOW_EXCEEDED"
  | "TRIGRAM_MATCH"
  | "LOW_SIMILARITY"
  | "GREY_ZONE_NO_MODEL"
  | "MODEL_CONFIRMED"
  | "MODEL_REJECTED";

export interface ClusterDecision {
  decision: "MERGE" | "SEPARATE";
  reason: ClusterReason;
}

function merge(reason: ClusterReason): ClusterDecision {
  return { decision: "MERGE", reason };
}

function separate(reason: ClusterReason): ClusterDecision {
  return { decision: "SEPARATE", reason };
}

function platformsCompatible(left: SourceItemFacts, right: SourceItemFacts): boolean {
  if (left.platforms.length === 0 || right.platforms.length === 0) return true;
  return left.platforms.some((p) => right.platforms.includes(p));
}

export async function decideCluster(input: ClusterInput): Promise<ClusterDecision> {
  const { left, right } = input;

  // 1. Official identifiers dominate.
  const leftId = normalizeAuthorityEventId(left.authorityEventId);
  const rightId = normalizeAuthorityEventId(right.authorityEventId);
  if (leftId !== null && rightId !== null) {
    return leftId === rightId ? merge("OFFICIAL_ID_MATCH") : separate("OFFICIAL_ID_MISMATCH");
  }

  // 2. Compatibility guards before any probabilistic comparison.
  if (left.market !== right.market) return separate("MARKET_MISMATCH");
  if (!platformsCompatible(left, right)) return separate("PLATFORM_MISMATCH");
  // Compare effective dates when both sides have one; otherwise compare
  // published dates. Mixing one side's effective date with the other's
  // published date would block legitimate announcement/report pairs.
  const bothEffective = left.effectiveAt != null && right.effectiveAt != null;
  const distance = dayDistance(
    bothEffective ? left.effectiveAt! : left.publishedAt,
    bothEffective ? right.effectiveAt! : right.publishedAt,
  );
  if (distance !== null && distance > EFFECTIVE_DATE_WINDOW_DAYS) {
    return separate("DATE_WINDOW_EXCEEDED");
  }

  // 3. Trigram fallback.
  const score = titleSimilarity(left.title, right.title);
  const cls = classifyScore(score);
  if (cls === "duplicate") return merge("TRIGRAM_MATCH");
  if (cls === "distinct") return separate("LOW_SIMILARITY");

  // 4. Grey zone: only a model confirmation may merge.
  if (!input.llm) return separate("GREY_ZONE_NO_MODEL");
  const judged = parseClusterJudge(
    (await input.llm.complete(buildClusterJudgePrompt({ a: left.title, b: right.title }))).text,
  );
  return judged.same ? merge("MODEL_CONFIRMED") : separate("MODEL_REJECTED");
}
