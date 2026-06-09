// BL-033 — TradeLinks 通用写作标准（深度 + 反 AI 腔 + grounding）。
// 单一事实来源:Daily editor(compose.ts)、未来 The Movers(BL-044)、newsletter
// (BL-043) 等所有内容生成都拼这同一套规范,保证全站声音/深度一致。
// 注:这些是给 *运行时 LLM 编辑*(DeepSeek/Gemini)的指令块,非 Claude Code skill。

export const ANALYTICAL_DEPTH = `ANALYTICAL DEPTH (this is the whole job — a shallow summary is a failure):
- Don't stop at WHAT happened. Explain the MECHANISM (why it's happening), the SECOND-ORDER effects
  (what it forces next), and the NON-OBVIOUS implication a casual reader would miss.
- Quantify with the specific figures in the source set (rank deltas, %, like counts, confidence is
  internal — reason from it but never print it). Tie numbers to a concrete consequence.
- For sourcing/trend angles: give the actual playbook — which market, what lead time, why now, what
  the margin/risk trade-off is. Name at least one non-consensus take or a risk most sellers will miss.
- Connect the items into ONE argument. If two facts interact, say how. No item-by-item recap.`;

export const HUMAN_VOICE = `VOICE (write like a sharp human analyst, not an AI):
- Take a clear position. Vary sentence length. Be specific over abstract.
- BANNED phrases/tics: "In conclusion", "Moreover", "Furthermore", "It's important to note",
  "In today's fast-paced", "game-changer", "navigate the landscape", "a testament to", and empty
  intensifiers ("massive", "powerful", "robust") used without a number. Avoid tidy 3-part listicles
  and clichés — they read like AI filler.`;

export const GROUNDING = `GROUNDING:
- Use ONLY the facts provided below. Never invent numbers, dates, companies, thresholds, or claims.
- Do NOT paste raw URLs in the body; citations are rendered separately.`;

/**
 * 通用写作标准块(深度 + 声音 + grounding)。拼进任意内容生成的 system prompt;
 * 字数上限/输出 JSON 形态等按各内容类型在调用处自行追加。
 */
export function writingStandardBlock(): string {
  return `${ANALYTICAL_DEPTH}\n\n${HUMAN_VOICE}\n\n${GROUNDING}`;
}
