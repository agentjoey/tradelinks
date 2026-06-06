// Curated Telegram channel batch selection (BL-039 slice 1).
// Pure — no I/O, no DB. Selects which alerts + products to push,
// respecting daily budget, run cap, and type blending.
//
// See spec: docs/superpowers/specs/2026-06-07-bl039-telegram-channel-push-design.md

export interface CandidateAlert {
  id: string;
  title: string;
  summary: string;
  urgencyScore: number;
  category: string;
  regions: string[];
  actionRequired: string | null;
  sourceUrls: string[];
}

export interface CandidateProduct {
  key: string;
  kind: "bestseller" | "viral";
  title: string;
  platform: string;
  rank?: number | null;
  likes?: number | null;
  region?: string;
  url: string;
  imageUrl?: string | null;
}

export type ChannelItem =
  | { type: "alert"; alert: CandidateAlert; itemId: string }
  | { type: "product"; product: CandidateProduct; itemId: string };

export interface BatchOpts {
  alreadyPushed: ReadonlySet<string>; // itemIds already on the channel
  pushedToday: number;               // total pushed today so far
  dailyMax: number;                  // hard daily cap (default 8)
  runMax: number;                    // max items per run (default 3)
  minUrgency: number;                // drop alerts below this
}

// ──── Ranking helpers ────

/** Rank alerts by urgency desc, then recency (implicitly first-come-first, stable). */
function rankAlerts(alerts: CandidateAlert[]): CandidateAlert[] {
  return [...alerts].sort((a, b) => b.urgencyScore - a.urgencyScore);
}

/**
 * Normalized score for a single product so that a #1 bestseller and a
 * high-like viral can interleave fairly in a blended list.
 *   bestseller: 1 / (rank + 1)   — #1→0.5, #10→0.09, null→0
 *   viral:      likes / maxLikes — top tweet→1.0, half-likes→0.5
 * Returns a value in [0, 1].
 */
function productScore(p: CandidateProduct, maxLikes: number): number {
  if (p.kind === "bestseller") {
    return p.rank ? 1 / (p.rank + 1) : 0;
  }
  // viral
  if (maxLikes === 0) return 0;
  return p.likes ? p.likes / maxLikes : 0;
}

/** Merge bestsellers (rank asc) and viral (likes desc) into a single ranked product list. */
function rankProducts(products: CandidateProduct[]): CandidateProduct[] {
  const virals = products.filter((p) => p.kind === "viral");
  const maxLikes = Math.max(...virals.map((p) => p.likes ?? 0), 1);
  return [...products].sort((a, b) => {
    // push items without score/likes/rank to the end
    const sa = productScore(a, maxLikes);
    const sb = productScore(b, maxLikes);
    return sb - sa; // descending
  });
}

// ──── Selection ────

/**
 * Select the ordered batch of channel items for this run.
 *
 * Returns an ordered list ≤ min(runMax, dailyMax − pushedToday).
 * If not enough quality candidates exist, pushes fewer — never pads.
 * Blends alert / product so a single run isn't all one type.
 */
export function selectChannelBatch(
  candidates: { alerts: CandidateAlert[]; products: CandidateProduct[] },
  opts: BatchOpts,
): ChannelItem[] {
  const { alreadyPushed, pushedToday, dailyMax, runMax, minUrgency } = opts;

  const budget = Math.max(0, Math.min(runMax, dailyMax - pushedToday));
  if (budget === 0) return [];

  // 1. Filter alerts: drop already-pushed + below-min-urgency
  const eligibleAlerts = candidates.alerts.filter(
    (a) => a.urgencyScore >= minUrgency && !alreadyPushed.has(a.id),
  );

  // 2. Filter products: drop already-pushed
  const eligibleProducts = candidates.products.filter(
    (p) => !alreadyPushed.has(p.key),
  );

  // 3. Rank
  const rankedAlerts = rankAlerts(eligibleAlerts);
  const rankedProducts = rankProducts(eligibleProducts);

  // 4. Blend: alternate alert / product, taking from ranked lists
  const result: ChannelItem[] = [];
  let ai = 0; // alert index
  let pi = 0; // product index
  // Start with an alert (if available) to lead with high-signal content
  let nextIsAlert = rankedAlerts.length > 0;

  while (result.length < budget) {
    if (nextIsAlert && ai < rankedAlerts.length) {
      const a = rankedAlerts[ai]!;
      result.push({ type: "alert", alert: a, itemId: a.id });
      ai++;
    } else if (pi < rankedProducts.length) {
      const p = rankedProducts[pi]!;
      result.push({ type: "product", product: p, itemId: p.key });
      pi++;
    } else if (ai < rankedAlerts.length) {
      const a = rankedAlerts[ai]!;
      result.push({ type: "alert", alert: a, itemId: a.id });
      ai++;
    } else {
      // Both exhausted
      break;
    }
    // Toggle, but if the other side is empty stay on the current side
    if (nextIsAlert && pi < rankedProducts.length) nextIsAlert = false;
    else if (!nextIsAlert && ai < rankedAlerts.length) nextIsAlert = true;
  }

  return result;
}
