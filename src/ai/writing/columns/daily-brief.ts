import type { ColumnSpec } from "./types.js";
import type { DailyNoteInput } from "../../../daily/compose.js";

const DAILY_OUTPUT = `Respond ONLY with JSON:
{"title","dek","body_markdown","key_takeaways":[..],"meta_description","tags":[..]}`;

/** brief hook: a high-urgency alert is present (highUrgency default 3). */
export const briefHook = (i: DailyNoteInput, highUrgency = 3): boolean =>
  i.alerts.some((a) => a.urgencyScore >= highUrgency);

export const dailyVolume = (i: DailyNoteInput): number =>
  i.alerts.length + i.signals.length + i.radar.length;

export const dailyBrief: ColumnSpec<DailyNoteInput> = {
  id: "daily-brief",
  angle: `Write a POLICY / ALERT interpretation brief. Lead with the most consequential alerts and
synthesize across regulatory, platform and logistics changes. Tell the reader who is affected and
what to do. Trend/radar signals are secondary colour.`,
  techniques: { multiItem: true },
  lengthHint: "- 600–1000 words.",
  outputShape: DAILY_OUTPUT,
  gateConfig: { minVolume: 4, measure: dailyVolume, hook: (i) => briefHook(i) },
};
