// Dedup level-2/3 classification by trigram similarity. Pure + unit-tested.
// See docs/specs/ai-pipeline.md (Dedup / Clustering).

export const DUP_THRESHOLD = 0.75; // >= this => duplicate
export const GREY_LOW = 0.5; // [GREY_LOW, DUP_THRESHOLD) => LLM judge

export type SimilarityClass = "duplicate" | "grey" | "distinct";

/** Classify a single similarity score (0..1). */
export function classifyScore(score: number): SimilarityClass {
  if (score >= DUP_THRESHOLD) return "duplicate";
  if (score >= GREY_LOW) return "grey";
  return "distinct";
}
