// Trend scoring from a Google Trends interest-over-time series. Pure + tested.
// pytrends "now 7-d" returns ~169 hourly points (0-100 interest index).

export interface TrendScore {
  level: number; // recent interest level 0-100 (mean of last window)
  slope: number; // change vs. earlier window, -100..100 (>0 = rising)
  signalStrength: number; // 0..1 combined "how strongly is this rising & hot"
}

const WINDOW = 24; // ~last/first day of hourly points

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Reduce a raw interest series to a level + slope + signalStrength.
 * - level: mean of the last WINDOW points (recent heat)
 * - slope: mean(last WINDOW) − mean(first WINDOW) (momentum)
 * - signalStrength: rising momentum weighted by current level, 0..1
 */
export function scoreSeries(series: number[]): TrendScore {
  const clean = series.filter((n) => Number.isFinite(n));
  if (clean.length === 0) return { level: 0, slope: 0, signalStrength: 0 };

  const w = Math.min(WINDOW, Math.floor(clean.length / 2) || 1);
  const level = Math.round(mean(clean.slice(-w)));
  const slope = Math.round(mean(clean.slice(-w)) - mean(clean.slice(0, w)));

  // strength: only rising trends score; scale by level so a jump from 2→5
  // doesn't outrank a sustained-high-and-climbing term.
  const rise = Math.max(0, slope) / 100; // 0..1 momentum (only positive)
  const heat = level / 100; // 0..1
  const signalStrength = Math.round(Math.min(1, 0.6 * rise + 0.4 * heat) * 100) / 100;

  return { level, slope, signalStrength };
}
