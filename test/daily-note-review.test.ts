import { describe, it, expect } from "vitest";
import { reviewNote } from "../src/daily/review.js";
import type { ComposedNote, DailyNoteInput } from "../src/daily/compose.js";
import type { LlmClient } from "../src/ai/client.js";

function input(): DailyNoteInput {
  return {
    date: "2026-06-05",
    lang: "en",
    alerts: [
      { id: "a1", title: "EU sets €0 de-minimis from 2026", summary: "All parcels dutiable", category: "regulatory", regions: ["europe"], urgencyScore: 4.5, actionRequired: "Register IOSS", sourceUrl: "https://example.com/eu" },
    ],
    signals: [],
    radar: [],
    recentTitles: [],
  };
}

function composed(over: Partial<ComposedNote> = {}): ComposedNote {
  return {
    date: "2026-06-05",
    lang: "en",
    kind: "brief",
    slug: "2026-06-05-eu-zero-de-minimis",
    title: "EU Zero De-Minimis",
    dek: "All parcels become dutiable.",
    bodyMarkdown: "The EU set a €0 threshold. Duties can eat 20–30% of the selling price.",
    keyTakeaways: ["EU threshold is now €0", "Duties eat 20–30% of price"],
    metaDescription: "EU de-minimis hits zero.",
    tags: ["eu", "regulatory"],
    citations: [{ title: "EU sets €0 de-minimis from 2026", url: "https://example.com/eu" }],
    sourceAlertIds: ["a1"],
    model: "gemini-flex",
    ...over,
  };
}

/** Stub reviewer LlmClient returning canned JSON; records the prompt it saw. */
function stubClient(json: unknown, model = "deepseek-reviewer"): LlmClient & { lastUser?: string; lastSystem?: string } {
  const c: LlmClient & { lastUser?: string; lastSystem?: string } = {
    name: model,
    async complete(opts) {
      c.lastUser = opts.user;
      c.lastSystem = opts.system;
      return { text: JSON.stringify(json), usage: { promptTokens: 5, completionTokens: 8 }, model };
    },
  };
  return c;
}

describe("reviewNote (deepseek fact-check pass)", () => {
  it("strips an ungrounded claim from the body and lists what was removed", async () => {
    const client = stubClient({
      title: "EU Zero De-Minimis",
      dek: "All parcels become dutiable.",
      body_markdown: "The EU set a €0 threshold.",
      key_takeaways: ["EU threshold is now €0"],
      meta_description: "EU de-minimis hits zero.",
      removed_claims: ["Duties can eat 20–30% of the selling price — not in the source set"],
    });

    const out = await reviewNote(composed(), input(), client);

    expect(out.bodyMarkdown).not.toContain("20–30%");
    expect(out.keyTakeaways).not.toContain("Duties eat 20–30% of price");
    expect(out.removedClaims).toHaveLength(1);
    expect(out.revised).toBe(true);
    expect(out.reviewModel).toBe("deepseek-reviewer");
  });

  it("feeds the grounded facts AND the draft into the reviewer prompt", async () => {
    const client = stubClient({ title: "t", body_markdown: "b", removed_claims: [] });
    await reviewNote(composed(), input(), client);
    expect(client.lastUser).toContain("€0 de-minimis"); // a source fact
    expect(client.lastUser).toContain("20–30%"); // the draft under review
    expect(client.lastSystem?.toLowerCase()).toContain("fact");
  });

  it("reviewer prompt covers both fact-checking and de-AI voice", async () => {
    const client = stubClient({ title: "t", body_markdown: "b", removed_claims: [] });
    await reviewNote(composed(), input(), client);
    const sys = client.lastSystem!.toLowerCase();
    expect(sys).toMatch(/fact|ground|unsupported/); // job 1: truth
    expect(sys).toMatch(/voice|cliché|human|ai-/); // job 2: de-AI the prose
  });

  it("carries citations + provenance from the draft, never from the reviewer", async () => {
    const client = stubClient({ title: "EU Zero De-Minimis", body_markdown: "The EU set a €0 threshold.", removed_claims: [] });
    const draft = composed();
    const out = await reviewNote(draft, input(), client);
    expect(out.citations).toEqual(draft.citations);
    expect(out.sourceAlertIds).toEqual(["a1"]);
    expect(out.model).toBe("gemini-flex"); // editor model preserved
  });

  it("recomputes the slug when the reviewer revises the title", async () => {
    const client = stubClient({ title: "EU De-Minimis Drops to Zero", body_markdown: "x", removed_claims: ["something"] });
    const out = await reviewNote(composed(), input(), client);
    expect(out.slug).toBe("2026-06-05-eu-de-minimis-drops-to-zero");
  });

  it("marks revised=false when nothing is removed and text is unchanged", async () => {
    const d = composed();
    const client = stubClient({ title: d.title, dek: d.dek, body_markdown: d.bodyMarkdown, key_takeaways: d.keyTakeaways, meta_description: d.metaDescription, removed_claims: [] });
    const out = await reviewNote(d, input(), client);
    expect(out.revised).toBe(false);
    expect(out.removedClaims).toEqual([]);
  });
});
