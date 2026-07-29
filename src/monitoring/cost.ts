/**
 * Phase 1 cost projection & guardrail (Operations Task 4).
 *
 * Reads RAILWAY_PROJECTED_MONTHLY_COSTS_JSON — a non-secret Railway env value
 * documented for Task 5. The value must be a JSON object mapping component
 * names to finite, non-negative numbers. Missing or malformed input fails
 * closed (throws) instead of evaluating as zero.
 *
 * Exports:
 *   dateHourBucket(date) → "YYYY-MM-DDTHH"
 *   getProjectedCost() → { total, breakdown }  (throws on missing/malformed)
 *   evaluateCostGuardrail(input) → CostDecision  (pure, credential-free)
 */

export interface CostInputs {
  projectedTotalUsd: number;
}

export interface CostDecision {
  level: "NORMAL" | "REVIEW" | "HARD_CAP";
  suppress: string[];
  message: string;
  projectedTotalUsd: number;
  breakdown: Record<string, number>;
}

export function dateHourBucket(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  return `${y}-${m}-${day}T${h}`;
}

// ---- production cost input ----

interface CostBreakdown {
  total: number;
  breakdown: Record<string, number>;
}

/**
 * Parse and validate RAILWAY_PROJECTED_MONTHLY_COSTS_JSON.
 * Must be a non-empty object of finite non-negative numbers.
 * Throws on missing, malformed, or invalid input (fails closed).
 */
export async function getProjectedCost(): Promise<CostBreakdown> {
  const raw = process.env.RAILWAY_PROJECTED_MONTHLY_COSTS_JSON;
  if (!raw) {
    throw new Error(
      "cost-guardrail: RAILWAY_PROJECTED_MONTHLY_COSTS_JSON is not set. " +
      "Task 5 must populate this Railway env with a JSON object mapping " +
      "component names to finite non-negative monthly USD projections.",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "cost-guardrail: RAILWAY_PROJECTED_MONTHLY_COSTS_JSON is not valid JSON.",
    );
  }

  if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(
      "cost-guardrail: RAILWAY_PROJECTED_MONTHLY_COSTS_JSON must be a non-empty JSON object.",
    );
  }

  const breakdown: Record<string, number> = {};
  let total = 0;

  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new Error(
        `cost-guardrail: RAILWAY_PROJECTED_MONTHLY_COSTS_JSON component "${key}" ` +
        `must be a finite, non-negative number. Got: ${String(value)}`,
      );
    }
    breakdown[key] = value;
    total += value;
  }

  if (Object.keys(breakdown).length === 0) {
    throw new Error(
      "cost-guardrail: RAILWAY_PROJECTED_MONTHLY_COSTS_JSON must be a non-empty object.",
    );
  }

  return { total, breakdown };
}

// ---- pure guardrail ----

/**
 * Evaluate cost guardrail thresholds. Official-source collection is never
 * suppressed — only experimental demand and model enrichment are affected
 * at HARD_CAP. Boundary: strictly above $40 → REVIEW, above $50 → HARD_CAP.
 */
export function evaluateCostGuardrail(input: CostInputs): CostDecision {
  const projected = input.projectedTotalUsd;

  if (projected > 50) {
    return {
      level: "HARD_CAP",
      suppress: ["experimental-demand", "model-enrichment"],
      message:
        `Projected monthly cost $${projected.toFixed(2)} exceeds hard cap. ` +
        `Experimental demand and model enrichment suppressed. ` +
        `Official collection and health checks remain enabled.`,
      projectedTotalUsd: projected,
      breakdown: {},
    };
  }

  if (projected > 40) {
    return {
      level: "REVIEW",
      suppress: [],
      message:
        `Projected monthly cost $${projected.toFixed(2)} requires review. ` +
        `No jobs suppressed yet — operator should assess cost drivers.`,
      projectedTotalUsd: projected,
      breakdown: {},
    };
  }

  return {
    level: "NORMAL",
    suppress: [],
    message: `Projected monthly cost $${projected.toFixed(2)} is within budget.`,
    projectedTotalUsd: projected,
    breakdown: {},
  };
}
