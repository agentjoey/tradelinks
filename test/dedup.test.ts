import { describe, it, expect } from "vitest";
import { classifyScore } from "../src/dedup/classify.js";
import { resolveDuplication, type SimilarCandidate } from "../src/dedup/resolve.js";
import { parseClusterJudge } from "../src/ai/prompts/cluster-judge.js";
import type { LlmClient, LlmCompleteOpts, LlmResult } from "../src/ai/client.js";

describe("classifyScore", () => {
  it("classifies by trigram thresholds", () => {
    expect(classifyScore(0.9)).toBe("duplicate");
    expect(classifyScore(0.75)).toBe("duplicate");
    expect(classifyScore(0.6)).toBe("grey");
    expect(classifyScore(0.5)).toBe("grey");
    expect(classifyScore(0.49)).toBe("distinct");
    expect(classifyScore(0)).toBe("distinct");
  });
});

describe("parseClusterJudge", () => {
  it("parses same=true", () => {
    expect(parseClusterJudge('{"same":true,"reason":"same policy"}').same).toBe(true);
  });
  it("defaults reason when missing", () => {
    expect(parseClusterJudge('{"same":false}')).toEqual({ same: false, reason: "" });
  });
});

/** Fake LLM: same=true only when BOTH the A and B titles mention "GPSR". */
class JudgeFake implements LlmClient {
  readonly name = "fake";
  async complete(opts: LlmCompleteOpts): Promise<LlmResult> {
    const a = opts.user.match(/^A:\s*(.+)$/m)?.[1] ?? "";
    const b = opts.user.match(/^B:\s*(.+)$/m)?.[1] ?? "";
    const same = /GPSR/i.test(a) && /GPSR/i.test(b);
    return {
      text: JSON.stringify({ same, reason: same ? "same event" : "different" }),
      usage: { promptTokens: 10, completionTokens: 5 },
      model: "fake",
    };
  }
}

describe("resolveDuplication", () => {
  const llm = new JudgeFake();

  it("returns distinct when no candidates", async () => {
    expect(await resolveDuplication("x", [], llm)).toEqual({ action: "distinct" });
  });

  it("marks duplicate when top score >= 0.75", async () => {
    const cands: SimilarCandidate[] = [
      { id: "a", title: "Amazon FBA fee increase 2026", score: 0.82, clusterId: null },
      { id: "b", title: "Something else", score: 0.55, clusterId: null },
    ];
    const res = await resolveDuplication("Amazon FBA fees rise 2026", cands, llm);
    expect(res).toEqual({ action: "duplicate", ofId: "a" });
  });

  it("clusters when grey-zone candidate judged same event", async () => {
    const cands: SimilarCandidate[] = [
      { id: "c", title: "EU GPSR deadline approaches", score: 0.62, clusterId: "cl1" },
    ];
    const res = await resolveDuplication("GPSR compliance deadline EU", cands, llm);
    expect(res).toEqual({ action: "cluster", withId: "c", clusterId: "cl1" });
  });

  it("stays distinct when grey-zone judged different", async () => {
    const cands: SimilarCandidate[] = [
      { id: "d", title: "Totally unrelated shipping news", score: 0.6, clusterId: null },
    ];
    const res = await resolveDuplication("Amazon payout schedule change", cands, llm);
    expect(res).toEqual({ action: "distinct" });
  });

  it("picks highest score first (duplicate beats grey)", async () => {
    const cands: SimilarCandidate[] = [
      { id: "low", title: "x", score: 0.55, clusterId: null },
      { id: "high", title: "y", score: 0.9, clusterId: null },
    ];
    const res = await resolveDuplication("z", cands, llm);
    expect(res).toEqual({ action: "duplicate", ofId: "high" });
  });
});
