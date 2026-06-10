// Writing-modules barrel + system-prompt assembler.
import { writingCore } from "./core.js";
import { topicGateBlock } from "./topic-gate.js";
import type { ColumnSpec } from "./columns/types.js";

export * from "./core.js";
export * from "./topic-gate.js";
export * from "./self-check.js";
export type { ColumnSpec } from "./columns/types.js";

/**
 * Assemble a column's system-prompt body:
 *   angle + writingCore(techniques) + depth-bar + [grounding] + lengthHint + outputShape
 * A consumer may prepend a role/preamble (e.g. the daily editor's byline + language line).
 */
export function composeSystemPrompt(col: ColumnSpec<never>): string {
  const parts = [
    col.angle,
    writingCore(col.techniques),
    topicGateBlock(),
    ...(col.grounding ? [col.grounding] : []),
    col.lengthHint,
    "",
    col.outputShape,
  ];
  return parts.join("\n\n");
}
