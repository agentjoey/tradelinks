// BL-042 P2b — Movers 洞察卡 prompt + 解析。复用 BL-033 写作标准;evidence-bound。
import { ANALYTICAL_DEPTH, HUMAN_VOICE, GROUNDING } from "./writing-standard.js";
import { extractJson } from "../json.js";
import type { MoverEvidence } from "../../movers/evidence.js";

export interface InsightCard {
  whatItIs: string;
  whyNow: string;
  trajectory: string;
  soWhat: string;
}

export function buildMoverInsightPrompt(ev: MoverEvidence): { system: string; user: string } {
  const system = `You are the lead analyst of TradeLinks. Write a SHORT insight card for ONE product that is moving on Amazon, for cross-border sellers.

${ANALYTICAL_DEPTH}

${HUMAN_VOICE}

${GROUNDING}
- CRITICAL — do not invent the CAUSE. The facts above are ALL that is known. Never claim a "viral push", "coordinated marketing", "restock", "social spike", "pent-up demand", or any reason the data does not show. If the only signal is a fresh appearance with no rank/review change yet, say plainly: it is an early, not-yet-explained entry, and name what to watch next (rank holding? reviews accelerating? spreading to other regions?).
- Separate what the data SHOWS from what it might MEAN. Hedge interpretation ("could", "worth watching", "if it holds"); never state a guessed cause as fact. A thin, honest card beats a confident fabricated one.
- 2–3 sentences per field. No headers inside the values.

Respond ONLY with JSON: {"what_it_is","why_now","trajectory","so_what"}`;

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
