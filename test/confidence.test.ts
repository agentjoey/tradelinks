/**
 * Reading a model's confidence, in every shape it actually arrives in.
 *
 * MiniMax answered `0.9`, `"0.9"` and `"medium"` for the same prompt across
 * three runs. A strict `z.number()` rejected the whole batch on the third
 * form, so four well-grounded, quote-verified templates were discarded because
 * a fifth field was a word. Batches run to 20 items, so one malformed field
 * could cost 19 good verdicts.
 */

import { describe, expect, it } from "vitest";

import { readConfidence } from "../src/ai/confidence.js";

describe("readConfidence", () => {
  it("passes a well-formed number through", () => {
    expect(readConfidence(0.85)).toBe(0.85);
    expect(readConfidence(0)).toBe(0);
    expect(readConfidence(1)).toBe(1);
  });

  it("reads the numeric strings models emit", () => {
    expect(readConfidence("0.9")).toBe(0.9);
    expect(readConfidence(".85")).toBe(0.85);
    expect(readConfidence(" 0.7 ")).toBe(0.7);
  });

  it("reads percentages", () => {
    expect(readConfidence("90%")).toBe(0.9);
    expect(readConfidence("100 %")).toBe(1);
  });

  it("reads the word forms, mapped clear of the thresholds", () => {
    expect(readConfidence("high")).toBe(0.9);
    expect(readConfidence("HIGH")).toBe(0.9);
    expect(readConfidence("medium")).toBe(0.75);
    expect(readConfidence("low")).toBe(0.4);
  });

  it("reads anything unrecognisable as zero, never as certainty", () => {
    for (const value of ["definitely", "", "n/a", "???", null, undefined, {}, [], true]) {
      expect(readConfidence(value), String(value)).toBe(0);
    }
  });

  it("reads an out-of-range number as zero rather than clamping it up", () => {
    // Clamping 5 to 1 would turn a malformed field into maximum certainty —
    // the single worst reading available.
    expect(readConfidence(5)).toBe(0);
    expect(readConfidence(-1)).toBe(0);
    expect(readConfidence("500%")).toBe(0);
    expect(readConfidence(Number.NaN)).toBe(0);
    expect(readConfidence(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("never throws, whatever it is handed", () => {
    // Throwing is what cost the batch; a bad value must degrade, not explode.
    for (const value of [Symbol("x"), () => 1, new Date(), 0n]) {
      expect(() => readConfidence(value)).not.toThrow();
    }
  });
});
