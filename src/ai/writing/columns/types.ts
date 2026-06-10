import type { WritingOpts } from "../core.js";
import type { TopicGateConfig } from "../topic-gate.js";

/** A per-content-type writing spec. `angle`/`grounding`/`outputShape` are prompt text. */
export interface ColumnSpec<TInput = unknown> {
  id: string;
  /** lead/framing instruction (the column's editorial angle). */
  angle: string;
  /** which core positive techniques apply. */
  techniques: WritingOpts;
  /** optional column-specific extra grounding (e.g. movers' anti-cause block). */
  grounding?: string;
  /** e.g. "- 600–1000 words." */
  lengthHint: string;
  /** the JSON output contract line. */
  outputShape: string;
  /** the deterministic quality gate for this column. */
  gateConfig: TopicGateConfig<TInput>;
}
