// Gold-tested clustering: official identifiers dominate, incompatible
// market/platform/date facts prevent unsafe merges, grey-zone similarity
// never auto-merges without model confirmation.
// See .pact/tasks/phase1-foundation-canonicalization.md.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { LlmClient, LlmCompleteOpts, LlmResult } from "../src/ai/client.js";
import {
  candidateFingerprint,
  titleSimilarity,
  type SourceItemFacts,
} from "../src/canonicalize/fingerprint.js";
import { decideCluster, type ClusterDecision } from "../src/canonicalize/cluster.js";
import { DUP_THRESHOLD, GREY_LOW } from "../src/dedup/classify.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "canonical");

interface Pair {
  name: string;
  left: SourceItemFacts;
  right: SourceItemFacts;
}

function loadPairs(file: string): Pair[] {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, file), "utf8")) as Pair[];
}

/** Deterministic fake judge: same=true only when BOTH titles mention "GPSR". */
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

describe("canonical clustering gold pairs", () => {
  it.each(loadPairs("merge.json"))("merges $name", async ({ left, right }) => {
    const decision: ClusterDecision = await decideCluster({ left, right });
    expect(decision.decision).toBe("MERGE");
  });

  it.each(loadPairs("separate.json"))("keeps $name separate", async ({ left, right }) => {
    const decision: ClusterDecision = await decideCluster({ left, right });
    expect(decision.decision).toBe("SEPARATE");
  });
});

describe("decideCluster guards", () => {
  const greyPair = loadPairs("separate.json").find(
    (p) => p.name === "grey-zone-similarity-without-model-assist",
  )!;

  it("fixtures labelled grey-zone actually land in the grey zone", () => {
    const score = titleSimilarity(greyPair.left.title, greyPair.right.title);
    expect(score).toBeGreaterThanOrEqual(GREY_LOW);
    expect(score).toBeLessThan(DUP_THRESHOLD);
  });

  it("merge fixtures without official ids score at or above the duplicate threshold", () => {
    for (const pair of loadPairs("merge.json")) {
      if (pair.left.authorityEventId && pair.right.authorityEventId) continue;
      expect(titleSimilarity(pair.left.title, pair.right.title)).toBeGreaterThanOrEqual(
        DUP_THRESHOLD,
      );
    }
  });

  it("merges grey-zone pair only when the model confirms same event", async () => {
    const withJudge = await decideCluster({ ...greyPair, llm: new JudgeFake() });
    expect(withJudge.decision).toBe("MERGE");
    expect(withJudge.reason).toBe("MODEL_CONFIRMED");
  });

  it("keeps grey-zone pair separate when the model rejects", async () => {
    class RejectFake extends JudgeFake {
      override async complete(opts: LlmCompleteOpts): Promise<LlmResult> {
        void opts;
        return {
          text: JSON.stringify({ same: false, reason: "different" }),
          usage: { promptTokens: 10, completionTokens: 5 },
          model: "fake",
        };
      }
    }
    const decision = await decideCluster({ ...greyPair, llm: new RejectFake() });
    expect(decision.decision).toBe("SEPARATE");
    expect(decision.reason).toBe("MODEL_REJECTED");
  });

  it("official id mismatch beats identical titles", async () => {
    const base = loadPairs("separate.json").find(
      (p) => p.name === "different-official-recall-ids-similar-wording",
    )!;
    const identical = {
      left: base.left,
      right: { ...base.right, title: base.left.title },
    };
    const decision = await decideCluster(identical);
    expect(decision.decision).toBe("SEPARATE");
    expect(decision.reason).toBe("OFFICIAL_ID_MISMATCH");
  });

  it("official id match beats low title similarity", async () => {
    const pair = loadPairs("merge.json").find(
      (p) => p.name === "same-official-recall-id-different-wording-and-case",
    )!;
    expect(titleSimilarity(pair.left.title, pair.right.title)).toBeLessThan(DUP_THRESHOLD);
    const decision = await decideCluster(pair);
    expect(decision.decision).toBe("MERGE");
    expect(decision.reason).toBe("OFFICIAL_ID_MATCH");
  });
});

describe("candidateFingerprint", () => {
  const item: SourceItemFacts = {
    id: "item-1",
    title: "  CPSC Recalls Acme   Blender! ",
    market: "US",
    platforms: [],
    authorityEventId: "cpsc-2026-014",
    effectiveAt: "2026-07-01T10:00:00Z",
    publishedAt: "2026-07-02T08:00:00Z",
  };

  it("is stable across runs", () => {
    expect(candidateFingerprint(item)).toBe(candidateFingerprint({ ...item }));
  });

  it("gives official id precedence over title wording", () => {
    const reworded = { ...item, title: "completely different wording" };
    expect(candidateFingerprint(reworded)).toBe(candidateFingerprint(item));
  });

  it("normalizes official id case and whitespace", () => {
    const variant = { ...item, authorityEventId: "  CPSC-2026-014 " };
    expect(candidateFingerprint(variant)).toBe(candidateFingerprint(item));
  });

  it("uses the effective date day, not the published date", () => {
    const laterPublish = { ...item, publishedAt: "2026-07-09T08:00:00Z" };
    expect(candidateFingerprint(laterPublish)).toBe(candidateFingerprint(item));
  });

  it("falls back to normalized title when no official id", () => {
    const { authorityEventId, ...noId } = item;
    void authorityEventId;
    const a = candidateFingerprint({ ...noId, title: "CPSC recalls acme blender" });
    const b = candidateFingerprint({ ...noId, title: "  cpsc   recalls ACME blender  " });
    expect(a).toBe(b);
    const c = candidateFingerprint({ ...noId, title: "another title entirely" });
    expect(c).not.toBe(a);
  });

  it("changes with market", () => {
    const otherMarket = { ...item, market: "EU" as SourceItemFacts["market"] };
    expect(candidateFingerprint(otherMarket)).not.toBe(candidateFingerprint(item));
  });

  it("matches across gold merge pairs that share an official id and effective day", () => {
    for (const pair of loadPairs("merge.json")) {
      if (!pair.left.authorityEventId || !pair.right.authorityEventId) continue;
      if (!pair.left.effectiveAt || !pair.right.effectiveAt) continue;
      expect(candidateFingerprint(pair.left)).toBe(candidateFingerprint(pair.right));
    }
  });
});
