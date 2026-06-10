// Topic quality gate — is this worth a deep piece? Two parts:
//  - passesTopicGate: a deterministic, config-driven predicate (the real skip decision).
//  - topicGateBlock: a short prompt "depth bar" that shapes tone/honesty at write time.
// Generic over the input type so it carries no business types (open-source-friendly).

export interface TopicGateConfig<T> {
  /** minimum substantive-input count to be worth writing. */
  minVolume: number;
  /** how to count substance from the input. */
  measure: (input: T) => number;
  /** a column-appropriate hook that must be present (e.g. a high-urgency item). */
  hook: (input: T) => boolean;
}

/** Enough substance AND the right hook. */
export function passesTopicGate<T>(input: T, config: TopicGateConfig<T>): boolean {
  if (config.measure(input) < config.minVolume) return false;
  return config.hook(input);
}

/** Short prompt bar appended to a column's system prompt. */
export function topicGateBlock(): string {
  return `DEPTH BAR:
- Commit to a real argument only if there is a genuine MECHANISM and a consequential or non-obvious
  angle. If the inputs are thin, say so plainly and name what to watch next — don't pad. A short,
  honest piece beats a padded, confident one.`;
}
