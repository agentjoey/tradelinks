import type { ColumnSpec } from "./types.js";
import type { DailyNoteInput } from "../../../daily/compose.js";
import { dailyVolume } from "./daily-brief.js";

const DAILY_OUTPUT = `Respond ONLY with JSON:
{"title","dek","body_markdown","key_takeaways":[..],"meta_description","tags":[..]}`;

/** roundup hook: at least one trend signal, or at least two radar items. */
export const roundupHook = (i: DailyNoteInput): boolean => i.signals.length >= 1 || i.radar.length >= 2;

export const dailyRoundup: ColumnSpec<DailyNoteInput> = {
  id: "daily-roundup",
  angle: `Write a VIRAL-PRODUCT / sourcing roundup. Lead with what is trending and WHY, framed as an
EARLY SOURCING SIGNAL for cross-border sellers. Make cross-region diffusion the core thesis — a
product rising in one region is an advance signal for the markets it is spreading to; tell sellers
what to source and which secondary markets to pre-position inventory for. Center the trend signals
and radar (viral tweets, bestseller movers); alerts are supporting context.
- Give the actual playbook: which market, what lead time, why now, and the margin/risk trade-off.
  Name at least one non-consensus take or a risk most sellers will miss.
- TITLE FORMULA: write the title as "[the change] — [the consequence for sellers]" (state the move
  plus what it means), not "[company] announces [thing]". e.g. "Korean glass-skin masks are climbing
  US Beauty — and just surfaced in the UK".`,
  techniques: { multiItem: true },
  lengthHint: "- 600–1000 words.",
  outputShape: DAILY_OUTPUT,
  gateConfig: { minVolume: 4, measure: dailyVolume, hook: roundupHook },
};
