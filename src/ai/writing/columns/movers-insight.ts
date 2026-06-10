import type { ColumnSpec } from "./types.js";
import type { MoverEvidence } from "../../movers/evidence.js";

const ANTI_CAUSE = `- CRITICAL — do not invent the CAUSE. The facts above are ALL that is known. Never claim a "viral push", "coordinated marketing", "restock", "social spike", "pent-up demand", or any reason the data does not show. If the only signal is a fresh appearance with no rank/review change yet, say plainly: it is an early, not-yet-explained entry, and name what to watch next (rank holding? reviews accelerating? spreading to other regions?).
- Separate what the data SHOWS from what it might MEAN. Hedge interpretation ("could", "worth watching", "if it holds"); never state a guessed cause as fact. A thin, honest card beats a confident fabricated one.`;

export const moversInsight: ColumnSpec<MoverEvidence> = {
  id: "movers-insight",
  angle: `You are the lead analyst of TradeLinks. Write a SHORT insight card for ONE product that is moving on Amazon, for cross-border sellers.`,
  techniques: { multiItem: false },
  grounding: ANTI_CAUSE,
  lengthHint: "- 2–3 sentences per field. No headers inside the values.",
  outputShape: `Respond ONLY with JSON: {"what_it_is","why_now","trajectory","so_what"}`,
  // movers are pre-filtered upstream; the gate is permissive (always worth a card).
  gateConfig: { minVolume: 0, measure: () => 1, hook: () => true },
};
