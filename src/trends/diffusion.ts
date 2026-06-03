// Cross-region trend diffusion (Sprint 004 T2) — the product's signature signal.
// Honest framing: this is EARLY-SIGNAL / lead-lag detection, not prediction.
// If a keyword is hot & rising in mature markets but still low in an emerging
// market, that gap is an opportunity window. Pure + unit-tested.
import type { Region } from "../config/sources.js";
import { MATURE_REGIONS } from "../config/keywords.js";
import type { TrendScore } from "./score.js";

export interface RegionPoint extends TrendScore {
  region: Region;
}

export interface DiffusionSignal {
  keyword: string;
  originRegion: Region; // strongest mature market
  spreadingTo: Region[]; // lagging markets with a meaningful gap
  confidence: number; // 0..1
  signalBasis: string; // human-readable rationale
}

// thresholds
const HOT = 45; // origin must be at least this hot
const RISING = 4; // origin must be rising (slope)
const GAP = 25; // origin.level − target.level must exceed this

/**
 * Given one keyword's latest score per region, emit a diffusion signal when a
 * mature market is hot+rising and one or more (typically emerging) markets lag.
 */
export function detectDiffusion(keyword: string, points: RegionPoint[]): DiffusionSignal | null {
  if (points.length < 2) return null;

  // origin = the strongest MATURE market that is hot and rising
  const matureHot = points
    .filter((p) => MATURE_REGIONS.includes(p.region) && p.level >= HOT && p.slope >= RISING)
    .sort((a, b) => b.signalStrength - a.signalStrength);
  const origin = matureHot[0];
  if (!origin) return null;

  // targets = any region lagging the origin by more than GAP
  const spreadingTo = points
    .filter((p) => p.region !== origin.region && origin.level - p.level >= GAP)
    .sort((a, b) => a.level - b.level)
    .map((p) => p.region);
  if (spreadingTo.length === 0) return null;

  // confidence: origin strength + how wide/consistent the gap is
  const avgTargetLevel = points
    .filter((p) => spreadingTo.includes(p.region))
    .reduce((s, p) => s + p.level, 0) / spreadingTo.length;
  const gapScore = Math.min(1, (origin.level - avgTargetLevel) / 60);
  const confidence = Math.round(Math.min(1, 0.55 * origin.signalStrength + 0.45 * gapScore) * 100) / 100;

  const signalBasis =
    `"${keyword}" is hot in ${origin.region} (level ${origin.level}, rising +${origin.slope}) ` +
    `but lagging in ${spreadingTo.join(", ")} — early diffusion window.`;

  return { keyword, originRegion: origin.region, spreadingTo, confidence, signalBasis };
}

/** Rank-worthy rising keywords (for the "Rising now" board), regardless of diffusion. */
export function risingKeywords(
  rows: { keyword: string; region: Region; score: TrendScore }[],
  min = 0.45,
): { keyword: string; region: Region; signalStrength: number; level: number }[] {
  return rows
    .filter((r) => r.score.signalStrength >= min && r.score.slope > 0)
    .map((r) => ({ keyword: r.keyword, region: r.region, signalStrength: r.score.signalStrength, level: r.score.level }))
    .sort((a, b) => b.signalStrength - a.signalStrength);
}
