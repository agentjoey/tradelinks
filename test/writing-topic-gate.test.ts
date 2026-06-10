import { describe, it, expect } from "vitest";
import { passesTopicGate, topicGateBlock, type TopicGateConfig } from "../src/ai/writing/topic-gate.js";

describe("passesTopicGate", () => {
  const volumeOf = (i: { n: number }) => i.n;
  const cfg: TopicGateConfig<{ n: number; hot: boolean }> = {
    minVolume: 4,
    measure: (i) => i.n,
    hook: (i) => i.hot,
  };

  it("fails when volume is below minVolume", () => {
    expect(passesTopicGate({ n: 2, hot: true }, cfg)).toBe(false);
  });
  it("fails when volume clears but the hook is absent", () => {
    expect(passesTopicGate({ n: 6, hot: false }, cfg)).toBe(false);
  });
  it("passes when volume clears AND the hook is present", () => {
    expect(passesTopicGate({ n: 6, hot: true }, cfg)).toBe(true);
    void volumeOf;
  });
});

describe("topicGateBlock", () => {
  it("tells the model to commit only with real depth and to be honest when thin", () => {
    const b = topicGateBlock().toLowerCase();
    expect(b).toMatch(/mechanism|consequential|non-obvious/);
    expect(b).toMatch(/thin|honest|don'?t pad/);
  });
});
