// BL-042 P2b — Movers 洞察卡 prompt + 解析。System prompt built from the movers column spec.
import { composeSystemPrompt } from "../writing/index.js";
import { moversInsight } from "../writing/columns/movers-insight.js";
import { extractJson } from "../json.js";
import type { MoverEvidence } from "../../movers/evidence.js";

export interface InsightCard {
  whatItIs: string;
  whyNow: string;
  trajectory: string;
  soWhat: string;
}

export function buildMoverInsightPrompt(ev: MoverEvidence): { system: string; user: string } {
  const system = composeSystemPrompt(moversInsight);

  const facts: string[] = [
    `Product: ${ev.title}`,
    `Category / region: ${ev.category} · ${ev.region}`,
    ev.currentRank != null ? `Current BSR rank: #${ev.currentRank}` : "",
    ev.rankDelta != null ? `Rank change: ${ev.rankDelta >= 0 ? "+" : ""}${ev.rankDelta} (positive = climbing)` : "",
    ev.rankTrajectory.length ? `Rank trajectory: ${ev.rankTrajectory.join(" → ")}` : "",
    ev.reviewDelta != null ? `Review-count change: +${ev.reviewDelta} (a sales proxy)` : "",
    ev.reviewCount != null ? `Reviews: ${ev.reviewCount}` : "",
    ev.rating != null ? `Rating: ${ev.rating}` : "",
    ev.price != null ? `Price: $${ev.price}` : "",
    ev.isNewEntrant ? "New entrant to the top list (not present a day earlier)." : "",
    ev.spreadingTo.length ? `Strong here, absent in: ${ev.spreadingTo.join(", ")} (possible diffusion target).` : "",
    `Days tracked so far: ${ev.daysTracked}`,
  ].filter(Boolean);

  const user = `FACTS (use only these — do not invent any number, date, or claim):\n${facts.map((f) => `- ${f}`).join("\n")}`;
  return { system, user };
}

export function parseMoverInsight(raw: string): InsightCard {
  const j = extractJson(raw) as Record<string, unknown>;
  return {
    whatItIs: String(j.what_it_is ?? ""),
    whyNow: String(j.why_now ?? ""),
    trajectory: String(j.trajectory ?? ""),
    soWhat: String(j.so_what ?? ""),
  };
}
