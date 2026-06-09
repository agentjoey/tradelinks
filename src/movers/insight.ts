// BL-042 P2b — 洞察卡生成（evidence → AI 编辑 → InsightCard）。
import type { LlmClient } from "../ai/client.js";
import { buildMoverInsightPrompt, parseMoverInsight, type InsightCard } from "../ai/prompts/mover-insight.js";
import type { MoverEvidence } from "./evidence.js";

export async function generateInsight(client: LlmClient, ev: MoverEvidence): Promise<InsightCard> {
  const { system, user } = buildMoverInsightPrompt(ev);
  const res = await client.complete({ system, user, json: true, maxTokens: 700, temperature: 0.4 });
  return parseMoverInsight(res.text);
}
