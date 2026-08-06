/**
 * Read a model's stated confidence, whatever shape it arrives in.
 *
 * MiniMax answers `"confidence": 0.9`, `"0.9"` and `"medium"` interchangeably
 * for the same prompt. A strict `z.number()` rejected the whole batch on the
 * third form, so four well-grounded, quote-verified templates were thrown away
 * because a fifth field was a word. Two rules follow from that:
 *
 *   - accept every form the model actually emits, and
 *   - never let one malformed field cost the other items in its batch.
 *
 * Anything unrecognised reads as 0, which fails every threshold. Uncertainty
 * about the confidence is itself a lack of confidence.
 */

import { z } from "zod";

/** Words models use instead of numbers, mapped clear of any threshold. */
const WORDS: Record<string, number> = {
  "very high": 0.95,
  high: 0.9,
  medium: 0.75,
  moderate: 0.75,
  low: 0.4,
  "very low": 0.2,
  none: 0,
  unknown: 0,
};

export function readConfidence(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 0;
  }
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    const word = WORDS[text];
    if (word !== undefined) return word;
    // "0.9", "90%", ".85"
    const percent = /^(\d{1,3})\s*%$/.exec(text);
    if (percent) {
      const n = Number(percent[1]) / 100;
      return n >= 0 && n <= 1 ? n : 0;
    }
    const n = Number(text);
    return Number.isFinite(n) && n >= 0 && n <= 1 ? n : 0;
  }
  return 0;
}

/**
 * Zod field for a model-reported confidence. Never throws: an unreadable value
 * becomes 0 and the item fails its threshold on its own, leaving the rest of
 * the batch intact.
 */
export const confidenceField = z.preprocess(readConfidence, z.number().min(0).max(1));
