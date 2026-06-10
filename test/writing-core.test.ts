import { describe, it, expect } from "vitest";
import { DEPTH, VOICE, GROUNDING, BANNED_PHRASES, writingCore } from "../src/ai/writing/core.js";

describe("writing core blocks", () => {
  it("DEPTH keeps the canonical header and depth demands", () => {
    expect(DEPTH).toContain("ANALYTICAL DEPTH");
    expect(DEPTH.toLowerCase()).toMatch(/mechanism|second-order|non-obvious/);
  });

  it("VOICE lists the banned phrases and reads as anti-AI-filler", () => {
    expect(VOICE).toContain("In conclusion");
    expect(VOICE).toContain("Moreover");
    expect(VOICE.toLowerCase()).toMatch(/cliché|filler/);
  });

  it("BANNED_PHRASES is the single source and is embedded in VOICE", () => {
    expect(BANNED_PHRASES).toContain("In conclusion");
    expect(BANNED_PHRASES).toContain("game-changer");
    for (const p of BANNED_PHRASES) expect(VOICE).toContain(p);
  });

  it("GROUNDING forbids invented facts and raw URLs", () => {
    expect(GROUNDING.toLowerCase()).toMatch(/never invent|only the facts|only the provided/);
    expect(GROUNDING.toLowerCase()).toContain("url");
  });

  it("writingCore composes the three blocks; multiItem adds escalation ordering", () => {
    const base = writingCore();
    expect(base).toContain("ANALYTICAL DEPTH");
    expect(base).toContain("In conclusion");
    expect(base).toContain(GROUNDING);
    expect(base.toLowerCase()).not.toContain("strongest");

    const multi = writingCore({ multiItem: true });
    expect(multi.toLowerCase()).toContain("strongest");
  });

  it("core imports nothing from the rest of the project (open-source boundary)", async () => {
    const src = await import("node:fs").then((fs) => fs.readFileSync("src/ai/writing/core.ts", "utf8"));
    expect(src).not.toMatch(/from\s+["']\.\.\//); // no parent-dir imports
  });
});
