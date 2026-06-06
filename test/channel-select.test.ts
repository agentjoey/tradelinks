import { describe, it, expect } from "vitest";
import { selectChannelBatch, type BatchOpts } from "../src/push/channel-select.js";
import type { CandidateAlert, CandidateProduct } from "../src/push/channel-select.js";

function alert(id: string, urgencyScore: number, over: Partial<CandidateAlert> = {}): CandidateAlert {
  return {
    id, title: `Alert ${id}`, summary: "Summary",
    urgencyScore, category: "regulatory", regions: ["north_america"],
    actionRequired: null, sourceUrls: ["https://example.com"],
    ...over,
  };
}

function bs(key: string, rank: number | null, over: Partial<CandidateProduct> = {}): CandidateProduct {
  return {
    key, kind: "bestseller", title: `Product ${key}`, platform: "Amazon",
    rank, url: "https://amazon.com/dp/" + key,
    ...over,
  };
}

function viral(key: string, likes: number | null, over: Partial<CandidateProduct> = {}): CandidateProduct {
  return {
    key, kind: "viral", title: `Viral ${key}`, platform: "X",
    likes, url: "https://x.com/status/" + key,
    ...over,
  };
}

function opts(over: Partial<BatchOpts> = {}): BatchOpts {
  return {
    alreadyPushed: new Set(),
    pushedToday: 0,
    dailyMax: 8,
    runMax: 3,
    minUrgency: 2,
    ...over,
  };
}

// ──── Filters ────

describe("selectChannelBatch filters", () => {
  it("drops already-pushed alerts", () => {
    const cands = { alerts: [alert("a1", 5)], products: [] };
    const o = opts({ alreadyPushed: new Set(["a1"]) });
    expect(selectChannelBatch(cands, o)).toHaveLength(0);
  });

  it("drops already-pushed products", () => {
    const cands = { alerts: [], products: [bs("b:key1", 1)] };
    const o = opts({ alreadyPushed: new Set(["b:key1"]) });
    expect(selectChannelBatch(cands, o)).toHaveLength(0);
  });

  it("drops alerts below minUrgency", () => {
    const cands = { alerts: [alert("a1", 1)], products: [] };
    const o = opts({ minUrgency: 2 });
    expect(selectChannelBatch(cands, o)).toHaveLength(0);
  });

  it("keeps alerts at minUrgency boundary", () => {
    const cands = { alerts: [alert("a1", 2)], products: [] };
    const o = opts({ minUrgency: 2 });
    expect(selectChannelBatch(cands, o)).toHaveLength(1);
  });

  it("returns empty when budget (daily cap) is exhausted", () => {
    const cands = { alerts: [alert("a1", 5)], products: [] };
    const o = opts({ pushedToday: 8, dailyMax: 8 });
    expect(selectChannelBatch(cands, o)).toHaveLength(0);
  });
});

// ──── Ranking ────

describe("selectChannelBatch ranking", () => {
  it("ranks alerts by urgency desc", () => {
    const cands = { alerts: [alert("a1", 2), alert("a2", 5), alert("a3", 4)], products: [] };
    const o = opts({ runMax: 3 });
    const result = selectChannelBatch(cands, o);
    expect(result[0]!.itemId).toBe("a2");
    expect(result[1]!.itemId).toBe("a3");
    expect(result[2]!.itemId).toBe("a1");
  });

  it("ranks bestsellers by rank asc", () => {
    const cands = { alerts: [], products: [bs("b:r10", 10), bs("b:r1", 1), bs("b:r5", 5)] };
    const o = opts({ runMax: 3 });
    const result = selectChannelBatch(cands, o);
    expect(result[0]!.itemId).toBe("b:r1");
    expect(result[1]!.itemId).toBe("b:r5");
    expect(result[2]!.itemId).toBe("b:r10");
  });

  it("ranks viral by likes desc", () => {
    const cands = { alerts: [], products: [viral("v:100", 100), viral("v:500", 500), viral("v:50", 50)] };
    const o = opts({ runMax: 3 });
    const result = selectChannelBatch(cands, o);
    expect(result[0]!.itemId).toBe("v:500");
    expect(result[1]!.itemId).toBe("v:100");
    expect(result[2]!.itemId).toBe("v:50");
  });

  it("sinks null-rank bestsellers to the bottom", () => {
    const cands = { alerts: [], products: [bs("b:null", null), bs("b:r1", 1), bs("b:null2", null)] };
    const o = opts({ runMax: 3 });
    const result = selectChannelBatch(cands, o);
    // r1 should be first, then null-rank items (order stable)
    expect(result[0]!.itemId).toBe("b:r1");
  });
});

// ──── Blending ────

describe("selectChannelBatch blending", () => {
  it("alternates alert / product when both available", () => {
    const cands = {
      alerts: [alert("a1", 5), alert("a2", 4)],
      products: [bs("b:1", 1), bs("b:2", 2)],
    };
    const o = opts({ runMax: 4 });
    const result = selectChannelBatch(cands, o);
    // Starts with alert (highest signal), then alternates
    expect(result[0]!.type).toBe("alert");
    expect(result[1]!.type).toBe("product");
    expect(result[2]!.type).toBe("alert");
    expect(result[3]!.type).toBe("product");
  });

  it("fills remaining with alerts when products exhausted", () => {
    const cands = {
      alerts: [alert("a1", 5), alert("a2", 4), alert("a3", 3)],
      products: [bs("b:1", 1)],
    };
    const o = opts({ runMax: 4 });
    const result = selectChannelBatch(cands, o);
    expect(result).toHaveLength(4); // 3 alerts + 1 product = 4 eligible; blend fills remaining
    expect(result[0]!.type).toBe("alert");
    expect(result[1]!.type).toBe("product");
    expect(result[2]!.type).toBe("alert");
    expect(result[3]!.type).toBe("alert");
  });

  it("all-product when no alerts", () => {
    const cands = { alerts: [], products: [bs("b:1", 1), bs("b:2", 2)] };
    const o = opts({ runMax: 3 });
    const result = selectChannelBatch(cands, o);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.type === "product")).toBe(true);
  });
});

// ──── Budget / cap ────

describe("selectChannelBatch budget", () => {
  it("respects runMax cap", () => {
    const cands = {
      alerts: [alert("a1", 5), alert("a2", 5), alert("a3", 5), alert("a4", 5)],
      products: [],
    };
    const o = opts({ runMax: 2 });
    expect(selectChannelBatch(cands, o)).toHaveLength(2);
  });

  it("respects remaining daily budget (dailyMax - pushedToday)", () => {
    const cands = {
      alerts: [alert("a1", 5), alert("a2", 5), alert("a3", 5)],
      products: [],
    };
    // dailyMax=8, pushedToday=6 → 2 remaining; runMax=3 → cap at 2
    const o = opts({ runMax: 3, pushedToday: 6, dailyMax: 8 });
    expect(selectChannelBatch(cands, o)).toHaveLength(2);
  });

  it("pushes fewer (never pads) when candidates are scarce", () => {
    const cands = { alerts: [alert("a1", 5)], products: [] };
    const o = opts({ runMax: 3 });
    expect(selectChannelBatch(cands, o)).toHaveLength(1);
  });

  it("returns empty when no eligible candidates exist", () => {
    const cands = {
      alerts: [alert("a1", 1)],
      products: [],
    };
    const o = opts({ minUrgency: 2, runMax: 3 });
    expect(selectChannelBatch(cands, o)).toHaveLength(0);
  });
});

// ──── itemId correctness ────

describe("selectChannelBatch itemIds", () => {
  it("uses alert.id as itemId for alerts", () => {
    const cands = { alerts: [alert("alert-123", 5)], products: [] };
    const result = selectChannelBatch(cands, opts());
    expect(result[0]!.itemId).toBe("alert-123");
  });

  it("uses product.key as itemId for products", () => {
    const cands = { alerts: [], products: [bs("bestseller:amazon/dp/ASIN", 1)] };
    const result = selectChannelBatch(cands, opts());
    expect(result[0]!.itemId).toBe("bestseller:amazon/dp/ASIN");
  });
});
