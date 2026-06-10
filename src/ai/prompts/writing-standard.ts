// BL-033 — DEPRECATED shim. The writing standard now lives in src/ai/writing/.
// These re-exports keep existing imports working during migration; remove once
// all consumers import from ../writing/* directly (see Task 9).
import { DEPTH, VOICE, GROUNDING, writingCore } from "../writing/core.js";

/** @deprecated import { DEPTH } from "../writing/core.js" */
export const ANALYTICAL_DEPTH = DEPTH;
/** @deprecated import { VOICE } from "../writing/core.js" */
export const HUMAN_VOICE = VOICE;
/** @deprecated import { GROUNDING } from "../writing/core.js" */
export { GROUNDING };
/** @deprecated import { writingCore } from "../writing/core.js" */
export function writingStandardBlock(): string {
  return writingCore();
}
