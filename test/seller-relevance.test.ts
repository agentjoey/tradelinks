/**
 * The relevance gate, and the one property that makes it safe to run
 * unattended: every uncertain path resolves to "do not promote".
 *
 * The pre-existing Stage-1 prefilter defaults the other way
 * (`?? { keep: true, reason: "no decision" }`). That is right for a noise
 * filter over an internal queue and wrong for a gate on a public claim — a
 * model timeout must not become a published change.
 */

import { describe, expect, it } from "vitest";

import {
  RELEVANCE_CONFIDENCE_THRESHOLD,
  SETTLE_CONFIDENCE_THRESHOLD,
  buildSellerRelevancePrompt,
  isSettledDrop,
  foldRelevance,
  parseSellerRelevance,
  type RelevanceItem,
} from "../src/ai/prompts/seller-relevance.js";

function item(id: string, title = "t", sourceId = "A02"): RelevanceItem {
  return { id, title, sourceId };
}

describe("buildSellerRelevancePrompt", () => {
  it("asks for JSON deterministically", () => {
    const opts = buildSellerRelevancePrompt([item("a")]);
    expect(opts.json).toBe(true);
    expect(opts.temperature).toBe(0);
  });

  it("states the mandatory-or-automatic test the whole gate rests on", () => {
    const { system } = buildSellerRelevancePrompt([item("a")]);
    expect(system).toMatch(/mandatory or automatic/i);
    expect(system).toMatch(/optional feature|opting in is a choice/i);
  });

  it("names the industrial-goods exclusion, which no keyword rule could carry", () => {
    const { system } = buildSellerRelevancePrompt([item("a")]);
    expect(system).toMatch(/trailers/i);
    expect(system).toMatch(/CONSUMER GOODS/);
  });

  it("carries each item's id, source and title", () => {
    const { user } = buildSellerRelevancePrompt([
      { id: "x1", title: "Fee schedule update", sourceId: "AMZ-ANNOUNCEMENTS" },
    ]);
    expect(user).toContain("id=x1");
    expect(user).toContain("source=AMZ-ANNOUNCEMENTS");
    expect(user).toContain("Fee schedule update");
  });

  it("bounds the snippet so one long article cannot blow the batch budget", () => {
    const { user } = buildSellerRelevancePrompt([
      { id: "x", title: "t", sourceId: "A02", snippet: "word ".repeat(400) },
    ]);
    expect(user.length).toBeLessThan(600);
  });

  it("collapses newlines in a snippet so one item stays one line", () => {
    const { user } = buildSellerRelevancePrompt([
      { id: "x", title: "t", sourceId: "A02", snippet: "line one\nline two\n\nline three" },
    ]);
    expect(user.split("\n").filter((l) => l.startsWith("- id="))).toHaveLength(1);
  });
});

describe("parseSellerRelevance", () => {
  it("parses a well-formed batch", () => {
    const out = parseSellerRelevance(
      '{"results":[{"id":"a","keep":true,"reason":"fee increase","confidence":0.9}]}',
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.keep).toBe(true);
  });

  it("reads a malformed confidence as zero rather than as certainty", () => {
    // Previously this threw, which killed the whole batch — and a batch is up
    // to 20 items, so one bad field discarded 19 good verdicts. Now the value
    // reads as 0 and that item fails its own threshold, leaving the rest
    // intact. Uncertainty about the confidence is itself a lack of confidence.
    const out = parseSellerRelevance(
      '{"results":[{"id":"a","keep":true,"reason":"r","confidence":5},' +
        '{"id":"b","keep":true,"reason":"r","confidence":0.9}]}',
    );
    expect(out[0]!.confidence).toBe(0);
    expect(out[1]!.confidence).toBe(0.9);
    expect(foldRelevance([item("a"), item("b")], out).get("a")!.keep).toBe(false);
    expect(foldRelevance([item("a"), item("b")], out).get("b")!.keep).toBe(true);
  });

  it("reads the word forms models actually emit", () => {
    // MiniMax answers "medium" as readily as 0.75 for the same prompt.
    const out = parseSellerRelevance(
      '{"results":[{"id":"a","keep":true,"reason":"r","confidence":"high"},' +
        '{"id":"b","keep":true,"reason":"r","confidence":"low"}]}',
    );
    expect(out[0]!.confidence).toBeGreaterThanOrEqual(RELEVANCE_CONFIDENCE_THRESHOLD);
    expect(out[1]!.confidence).toBeLessThan(RELEVANCE_CONFIDENCE_THRESHOLD);
  });

  it("rejects a missing field rather than filling a default", () => {
    expect(() => parseSellerRelevance('{"results":[{"id":"a","keep":true}]}')).toThrow();
  });
});

describe("foldRelevance — every uncertain path drops", () => {
  it("keeps a confident keep", () => {
    const v = foldRelevance(
      [item("a")],
      [{ id: "a", keep: true, reason: "fee change", confidence: 0.95 }],
    );
    expect(v.get("a")!.keep).toBe(true);
  });

  it("drops a confident drop", () => {
    const v = foldRelevance(
      [item("a")],
      [{ id: "a", keep: false, reason: "optional feature", confidence: 0.95 }],
    );
    expect(v.get("a")!.keep).toBe(false);
  });

  it("drops an item the model never judged", () => {
    const v = foldRelevance([item("a"), item("b")], [
      { id: "a", keep: true, reason: "r", confidence: 0.9 },
    ]);
    expect(v.get("b")!.keep).toBe(false);
    expect(v.get("b")!.reason).toBe("NO_VERDICT");
  });

  it("drops an id the model invented — it cannot smuggle in an unrequested item", () => {
    const v = foldRelevance(
      [item("a")],
      [{ id: "hallucinated", keep: true, reason: "r", confidence: 1 }],
    );
    expect(v.has("hallucinated")).toBe(false);
    expect(v.get("a")!.keep).toBe(false);
  });

  it("drops a keep below the confidence threshold", () => {
    const v = foldRelevance([item("a")], [
      { id: "a", keep: true, reason: "maybe", confidence: RELEVANCE_CONFIDENCE_THRESHOLD - 0.01 },
    ]);
    expect(v.get("a")!.keep).toBe(false);
    expect(v.get("a")!.reason).toMatch(/^LOW_CONFIDENCE/);
  });

  it("keeps exactly at the threshold, so the boundary is not silently exclusive", () => {
    const v = foldRelevance([item("a")], [
      { id: "a", keep: true, reason: "r", confidence: RELEVANCE_CONFIDENCE_THRESHOLD },
    ]);
    expect(v.get("a")!.keep).toBe(true);
  });

  it("lets the first verdict win, so a duplicated id cannot upgrade a drop", () => {
    const v = foldRelevance([item("a")], [
      { id: "a", keep: false, reason: "optional", confidence: 0.9 },
      { id: "a", keep: true, reason: "actually keep", confidence: 1 },
    ]);
    expect(v.get("a")!.keep).toBe(false);
  });

  it("drops everything when the model returns nothing at all", () => {
    const items = [item("a"), item("b"), item("c")];
    const v = foldRelevance(items, []);
    expect([...v.values()].every((r) => !r.keep)).toBe(true);
    expect(v.size).toBe(3);
  });

  it("returns a verdict for every requested item, never a partial map", () => {
    const items = [item("a"), item("b")];
    const v = foldRelevance(items, [{ id: "a", keep: true, reason: "r", confidence: 1 }]);
    expect([...v.keys()].sort()).toEqual(["a", "b"]);
  });

  it("records why an item was dropped, so the gate is auditable", () => {
    const v = foldRelevance([item("a")], [
      { id: "a", keep: false, reason: "optional POS feature", confidence: 0.9 },
    ]);
    expect(v.get("a")!.reason).toBe("optional POS feature");
  });
});

// ---- settling a verdict ----------------------------------------------------

/**
 * Two thresholds, because the two mistakes are not symmetrical.
 *
 * Promoting is a public claim, so an uncertain keep must not promote — that is
 * the 0.70 gate above. Settling is destructive: it buries a cluster for good
 * (or, in the sweep, deletes a draft), so an uncertain DROP must not settle
 * either. Measured runs put real verdicts at 0.60 ("MSG… borderline
 * industrial"), and burying a change a seller might need on that basis is the
 * worse of the two errors.
 *
 * Both rules are the same rule: when unsure, take the reversible action. An
 * unsettled item is simply re-judged on the next slot and reaches a human if
 * it ever reads as relevant.
 */

describe("isSettledDrop", () => {
  it("settles a confident drop", () => {
    expect(isSettledDrop({ keep: false, reason: "industrial goods", confidence: 0.95 })).toBe(true);
  });

  it("does not settle an uncertain drop — it will be judged again", () => {
    expect(isSettledDrop({ keep: false, reason: "borderline", confidence: 0.6 })).toBe(false);
  });

  it("settles exactly at the threshold", () => {
    expect(isSettledDrop({ keep: false, reason: "r", confidence: SETTLE_CONFIDENCE_THRESHOLD })).toBe(true);
  });

  it("requires more certainty to bury than to publish", () => {
    // The destructive action must be the harder one to reach.
    expect(SETTLE_CONFIDENCE_THRESHOLD).toBeGreaterThan(RELEVANCE_CONFIDENCE_THRESHOLD);
  });

  it("never settles a keep, whatever its confidence", () => {
    expect(isSettledDrop({ keep: true, reason: "r", confidence: 1 })).toBe(false);
  });

  it("never settles a low-confidence keep that was folded into a drop", () => {
    // foldRelevance rewrites an uncertain keep as a drop tagged LOW_CONFIDENCE
    // and carries the original confidence, which is below both thresholds —
    // so an uncertain keep cannot become a permanent rejection.
    const folded = foldRelevance(
      [item("a")],
      [{ id: "a", keep: true, reason: "maybe", confidence: 0.5 }],
    ).get("a")!;
    expect(folded.keep).toBe(false);
    expect(isSettledDrop(folded)).toBe(false);
  });

  it("never settles a verdict that was never made", () => {
    const absent = foldRelevance([item("a")], []).get("a")!;
    expect(absent.reason).toBe("NO_VERDICT");
    expect(isSettledDrop(absent)).toBe(false);
  });
});
