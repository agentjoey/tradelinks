import { describe, it, expect } from "vitest";
import {
  passesQualityGate,
  composeDailyNote,
  confidenceBand,
  type DailyNoteInput,
} from "../src/daily/compose.js";
import type { LlmClient } from "../src/ai/client.js";

function input(over: Partial<DailyNoteInput> = {}): DailyNoteInput {
  return {
    date: "2026-06-05",
    lang: "en",
    alerts: [
      { id: "a1", title: "Temu changes EU import rules", summary: "New IOSS thresholds", category: "regulatory", regions: ["europe"], urgencyScore: 4, actionRequired: "Re-check VAT registration", sourceUrl: "https://example.com/temu-eu" },
      { id: "a2", title: "Amazon raises EU FBA fees", summary: "Fee schedule update", category: "platform_policy", regions: ["europe"], urgencyScore: 2, actionRequired: null, sourceUrl: "https://example.com/amazon-fba" },
    ],
    signals: [
      { keyword: "mini blender", originRegion: "north_america", spreadingTo: ["southeast_asia"], confidence: 0.7 },
    ],
    radar: [
      { kind: "product", title: "PocketBlend mini blender", link: "https://x.com/i/web/status/1", likes: 320 },
    ],
    recentTitles: ["Yesterday: SEA logistics squeeze"],
    ...over,
  };
}

/** Stub LlmClient returning canned JSON; records the prompt it saw. */
function stubClient(json: unknown): LlmClient & { lastUser?: string; lastSystem?: string } {
  const c: LlmClient & { lastUser?: string; lastSystem?: string } = {
    name: "stub-model",
    async complete(opts) {
      c.lastUser = opts.user;
      c.lastSystem = opts.system;
      return { text: JSON.stringify(json), usage: { promptTokens: 10, completionTokens: 20 }, model: "stub-model" };
    },
  };
  return c;
}

const GOOD_JSON = {
  title: "Temu's EU Shake-up and the Mini-Blender That Won't Quit",
  dek: "Why yesterday's import-rule change matters more than the fee noise.",
  body_markdown: "Cross-border sellers woke up to a quieter but bigger story...",
  key_takeaways: ["EU IOSS thresholds changed", "Mini blender spreading to SEA"],
  meta_description: "Temu EU import-rule change and a viral mini blender — what to do.",
  tags: ["eu", "regulatory", "trend"],
};

describe("passesQualityGate", () => {
  it("passes (brief) when there is enough substance with a high-urgency alert", () => {
    expect(passesQualityGate(input())).toBe(true);
  });

  it("fails on a thin day (too few inputs)", () => {
    expect(passesQualityGate(input({ alerts: [], signals: [], radar: [{ kind: "product", title: "x", link: "l" }] }))).toBe(false);
  });

  it("fails (brief) when there is volume but no high-urgency alert and no trend signal", () => {
    const lowAlerts = Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, title: `noise ${i}`, summary: "", category: "industry", regions: [], urgencyScore: 1, actionRequired: null, sourceUrl: null }));
    expect(passesQualityGate(input({ alerts: lowAlerts, signals: [], radar: [] }))).toBe(false);
  });

  it("roundup passes on trend/radar volume even with no high-urgency alert; brief fails on the same day", () => {
    const trendDay = input({
      alerts: [{ id: "x", title: "minor", summary: "", category: "industry", regions: [], urgencyScore: 1, actionRequired: null, sourceUrl: null }],
      signals: [{ keyword: "neck fan", originRegion: "north_america", spreadingTo: ["southeast_asia"], confidence: 0.7 }],
      radar: [
        { kind: "product", title: "viral blender", link: "l1", likes: 4000 },
        { kind: "bestseller", title: "ice roller +160", link: "l2" },
        { kind: "product", title: "sunset lamp", link: "l3", likes: 3000 },
      ],
    });
    expect(passesQualityGate(trendDay, { kind: "roundup" })).toBe(true);
    expect(passesQualityGate(trendDay, { kind: "brief" })).toBe(false);
  });
});

describe("article kind", () => {
  it("roundup prompt centers products / sourcing / trends", async () => {
    const client = stubClient(GOOD_JSON);
    await composeDailyNote(input(), client, "roundup");
    const sys = client.lastSystem!.toLowerCase();
    expect(sys).toContain("sourc"); // sourcing angle
    expect(sys).toMatch(/trend|product|viral/);
  });

  it("brief prompt centers alerts / who-is-affected / policy", async () => {
    const client = stubClient(GOOD_JSON);
    await composeDailyNote(input(), client, "brief");
    expect(client.lastSystem!.toLowerCase()).toMatch(/alert|affected|policy/);
  });

  it("tags the note with its kind (default brief)", async () => {
    expect((await composeDailyNote(input(), stubClient(GOOD_JSON))).kind).toBe("brief");
    expect((await composeDailyNote(input(), stubClient(GOOD_JSON), "roundup")).kind).toBe("roundup");
  });

  it("editor prompt demands analytical depth and bans AI-tells", async () => {
    const client = stubClient(GOOD_JSON);
    await composeDailyNote(input(), client, "roundup");
    const sys = client.lastSystem!.toLowerCase();
    expect(sys).toMatch(/depth|non-obvious|second-order|mechanism/); // depth demands
    expect(sys).toMatch(/in conclusion|moreover|cliché|filler/); // banned AI-tells
  });
});

describe("composeDailyNote", () => {
  it("returns a structured note parsed from the model JSON", async () => {
    const client = stubClient(GOOD_JSON);
    const note = await composeDailyNote(input(), client);
    expect(note.title).toBe(GOOD_JSON.title);
    expect(note.dek).toBe(GOOD_JSON.dek);
    expect(note.bodyMarkdown).toContain("Cross-border sellers");
    expect(note.keyTakeaways).toEqual(GOOD_JSON.key_takeaways);
    expect(note.metaDescription).toBe(GOOD_JSON.meta_description);
    expect(note.tags).toEqual(GOOD_JSON.tags);
    expect(note.model).toBe("stub-model");
  });

  it("derives a date-prefixed slug from the title", async () => {
    const note = await composeDailyNote(input(), stubClient(GOOD_JSON));
    expect(note.slug).toBe("2026-06-05-temus-eu-shake-up-and-the-mini-blender-that-wont-quit");
  });

  it("builds citations from the INPUT alerts, never from the model", async () => {
    // model body tries to smuggle a fabricated link — it must NOT become a citation
    const sneaky = { ...GOOD_JSON, body_markdown: "see https://fake.example/made-up for details" };
    const note = await composeDailyNote(input(), stubClient(sneaky));
    const urls = note.citations.map((c) => c.url);
    expect(urls).toContain("https://example.com/temu-eu");
    expect(urls).toContain("https://example.com/amazon-fba");
    expect(urls).not.toContain("https://fake.example/made-up");
    expect(note.sourceAlertIds).toEqual(["a1", "a2"]);
  });

  it("includes radar item links as citations (product/trend articles cite the tweet/listing)", async () => {
    const note = await composeDailyNote(input(), stubClient(GOOD_JSON));
    const urls = note.citations.map((c) => c.url);
    expect(urls).toContain("https://x.com/i/web/status/1"); // radar product link
  });

  it("feeds recent titles and the brand/author into the prompt (dedupe + E-E-A-T)", async () => {
    const client = stubClient(GOOD_JSON);
    await composeDailyNote(input(), client);
    expect(client.lastUser).toContain("Yesterday: SEA logistics squeeze");
    expect(client.lastSystem).toContain("Agent Joey");
    expect(client.lastSystem).toContain("TradeLinks");
  });

  it("requests the target language in the prompt", async () => {
    const client = stubClient(GOOD_JSON);
    await composeDailyNote(input({ lang: "zh" }), client);
    expect(client.lastSystem?.toLowerCase()).toContain("chinese");
  });
});

describe("confidenceBand (internal scores never surface as raw figures)", () => {
  it("maps a signal-confidence score to a qualitative band", () => {
    expect(confidenceBand(0.9)).toBe("strong");
    expect(confidenceBand(0.7)).toBe("strong");
    expect(confidenceBand(0.6)).toBe("moderate");
    expect(confidenceBand(0.5)).toBe("moderate");
    expect(confidenceBand(0.47)).toBe("tentative");
    expect(confidenceBand(0.1)).toBe("tentative");
  });

  it("the editor never sees a raw confidence float in the facts — only the band", async () => {
    const client = stubClient(GOOD_JSON);
    await composeDailyNote(
      input({ signals: [{ keyword: "neck fan", originRegion: "north_america", spreadingTo: ["southeast_asia"], confidence: 0.47 }] }),
      client,
      "roundup",
    );
    expect(client.lastUser).not.toMatch(/confidence 0\.\d/);
    expect(client.lastUser).not.toContain("0.47");
    expect(client.lastUser!.toLowerCase()).toContain("tentative");
  });
});
