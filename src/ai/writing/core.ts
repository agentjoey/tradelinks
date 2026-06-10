// General writing core — depth + human voice + grounding.
// OPEN-SOURCE BOUNDARY: this file MUST NOT import anything from the rest of the
// project. It is domain-agnostic and can be lifted into a standalone package.
// Single source of truth for the banned-phrase list (see BANNED_PHRASES).

export const DEPTH = `ANALYTICAL DEPTH (this is the whole job — a shallow summary is a failure):
- Don't stop at WHAT happened. Explain the MECHANISM (why it's happening), the SECOND-ORDER effects
  (what it forces next), and the NON-OBVIOUS implication a casual reader would miss.
- Quantify with the specific figures in the source set. Tie every number to a concrete consequence.
- Show the reasoning — phenomenon → why → the non-obvious implication — don't just assert a conclusion.
- Connect the items into ONE argument with a through-line that pays off by the end. If two facts
  interact, say how. No item-by-item recap.`;

/** The banned phrases/tics, as data so other modules reuse the exact list. */
export const BANNED_PHRASES = [
  "In conclusion",
  "Moreover",
  "Furthermore",
  "It's important to note",
  "In today's fast-paced",
  "game-changer",
  "navigate the landscape",
  "a testament to",
  "Let's dive in",
  "Let's take a look",
];

export const VOICE = `VOICE (write like a sharp human analyst, not an AI):
- Take a clear position. Vary sentence length. Be specific over abstract.
- Where the data warrants it, flip the obvious read ("the obvious read is X; the data says Y") —
  sparingly, and only when grounded.
- Open on a concrete fact, never a throat-clearing intro.
- BANNED phrases/tics: ${BANNED_PHRASES.map((p) => `"${p}"`).join(", ")}, and empty intensifiers
  ("massive", "powerful", "robust") used without a number. Avoid tidy 3-part listicles and clichés —
  they read like AI filler.`;

export const ESCALATION = `ORDERING (multi-item pieces):
- When comparing or listing several items, order them weakest → strongest so the piece builds.
  Don't dump conclusions up front; let the strongest finding land last.`;

export const GROUNDING = `GROUNDING:
- Use ONLY the facts provided below. Never invent numbers, dates, companies, thresholds, or claims.
- Do NOT paste raw URLs in the body; citations are rendered separately.`;

export interface WritingOpts {
  /** true for pieces that compare/list several items (adds escalation ordering). */
  multiItem?: boolean;
}

/** Compose the general writing standard. Append column-specific length/output at the call site. */
export function writingCore(opts: WritingOpts = {}): string {
  const blocks = [DEPTH, VOICE];
  if (opts.multiItem) blocks.push(ESCALATION);
  blocks.push(GROUNDING);
  return blocks.join("\n\n");
}
