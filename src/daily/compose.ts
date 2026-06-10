// Daily Note composition — yesterday's signal set → one original editorial brief.
// Pure-ish: the LLM client is injected (testable with a stub, see
// test/daily-note.test.ts). Following the extract.ts trust model, all factual
// provenance (citation links, source ids) comes from the INPUT, never the model —
// the model only writes prose, so the published note can never cite a fabricated
// source. Quality is enforced before composition by passesQualityGate().
import { z } from "zod";
import type { LlmClient } from "../ai/client.js";
import { extractJson } from "../ai/json.js";
import { composeSystemPrompt } from "../ai/writing/index.js";
import { passesTopicGate } from "../ai/writing/topic-gate.js";
import { dailyBrief, dailyVolume, briefHook } from "../ai/writing/columns/daily-brief.js";
import { dailyRoundup, roundupHook } from "../ai/writing/columns/daily-roundup.js";

export interface DailyNoteAlert {
  id: string;
  title: string;
  summary: string;
  category: string;
  regions: string[];
  urgencyScore: number;
  actionRequired: string | null;
  sourceUrl: string | null;
}
export interface DailyNoteSignal {
  keyword: string;
  originRegion: string;
  spreadingTo: string[];
  confidence: number;
}
export interface DailyNoteRadarItem {
  kind: "product" | "topic" | "bestseller";
  title: string;
  link: string;
  likes?: number;
}
export interface DailyNoteInput {
  date: string; // the D-1 UTC date the note covers (YYYY-MM-DD)
  lang: string; // "en" | "zh" | …
  alerts: DailyNoteAlert[];
  signals: DailyNoteSignal[];
  radar: DailyNoteRadarItem[];
  recentTitles: string[]; // prior days' note titles → avoid repetition
}

/**
 * Two article shapes (user decision 2026-06-06). A rich day can yield both:
 *  - "brief": policy/alert interpretation — leads with the consequential alerts.
 *  - "roundup": viral-product / sourcing roundup — leads with trend + radar signals.
 */
export type DailyNoteKind = "brief" | "roundup";

export interface ComposedNote {
  date: string;
  lang: string;
  kind: DailyNoteKind;
  slug: string;
  title: string;
  dek: string;
  bodyMarkdown: string;
  keyTakeaways: string[];
  metaDescription: string;
  tags: string[];
  citations: { title: string; url: string }[]; // from inputs, NOT the model
  sourceAlertIds: string[];
  model: string;
}

export interface QualityGateOpts {
  /** which article shape we're gating for (default "brief"). */
  kind?: DailyNoteKind;
  /** minimum substantive inputs (alerts + signals + radar) to publish. */
  minItems?: number;
  /** minimum urgency for an alert to count as "high-priority". */
  highUrgency?: number;
}

/**
 * Gate before composition (spec §quality bar): never force a thin day. Require
 * enough total substance AND a hook appropriate to the article kind — a brief
 * needs a high-urgency alert; a roundup needs cross-region trend / radar signal.
 * A thin article is worse than none.
 */
export function passesQualityGate(input: DailyNoteInput, opts: QualityGateOpts = {}): boolean {
  const kind = opts.kind ?? "brief";
  const minVolume = opts.minItems ?? 4;
  const highUrgency = opts.highUrgency ?? 3;
  return passesTopicGate(input, {
    minVolume,
    measure: dailyVolume,
    hook: kind === "roundup" ? roundupHook : (i) => briefHook(i, highUrgency),
  });
}

const BRAND = "TradeLinks";
const AUTHOR = "Agent Joey";

function langName(lang: string): string {
  const map: Record<string, string> = { en: "English", zh: "Chinese (Simplified)", es: "Spanish", pt: "Portuguese", ar: "Arabic" };
  return map[lang.toLowerCase()] ?? "English";
}

function systemPrompt(lang: string, kind: DailyNoteKind): string {
  const spec = kind === "roundup" ? dailyRoundup : dailyBrief;
  const preamble = `You are the lead editor of ${BRAND}, a cross-border e-commerce intelligence outlet.
Your byline is "${AUTHOR}". Write ONE original daily article in ${langName(lang)}.`;
  return `${preamble}\n\n${composeSystemPrompt(spec)}`;
}

/**
 * Map an internal signal-confidence score to a qualitative band. The editor and
 * reviewer see the band, never the raw float — internal scores must never surface
 * as figures in the published prose (the editor would otherwise print "confidence 0.47").
 */
export function confidenceBand(c: number): string {
  if (c >= 0.7) return "strong";
  if (c >= 0.5) return "moderate";
  return "tentative";
}

function factsBlock(input: DailyNoteInput): string {
  const lines: string[] = [`Date covered: ${input.date}`, ""];
  if (input.alerts.length) {
    lines.push("ALERTS (published yesterday):");
    for (const a of input.alerts) {
      lines.push(
        `- [urgency ${a.urgencyScore.toFixed(1)} · ${a.category} · ${a.regions.join("/") || "global"}] ${a.title}` +
          (a.summary ? ` — ${a.summary}` : "") +
          (a.actionRequired ? ` (action: ${a.actionRequired})` : ""),
      );
    }
    lines.push("");
  }
  if (input.signals.length) {
    lines.push("TREND SIGNALS (cross-region diffusion):");
    for (const s of input.signals) {
      lines.push(`- "${s.keyword}" rising in ${s.originRegion} → spreading to ${s.spreadingTo.join("/")} (${confidenceBand(s.confidence)} cross-region signal)`);
    }
    lines.push("");
  }
  if (input.radar.length) {
    lines.push("RADAR (early social/marketplace signals):");
    for (const r of input.radar) {
      lines.push(`- [${r.kind}] ${r.title}${r.likes != null ? ` (${r.likes} likes)` : ""}`);
    }
    lines.push("");
  }
  if (input.recentTitles.length) {
    lines.push("RECENT BRIEFS (do NOT repeat these angles):");
    for (const t of input.recentTitles) lines.push(`- ${t}`);
  }
  return lines.join("\n").trimEnd();
}

/** Slug = date + kebab(title); falls back to date+lang for non-Latin titles. */
export function slugify(date: string, title: string, lang: string): string {
  const body = title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .split("-")
    .slice(0, 12)
    .join("-");
  return body ? `${date}-${body}` : `${date}-${lang}`;
}

const NoteSchema = z.object({
  title: z.string(),
  dek: z.string().default(""),
  body_markdown: z.string(),
  key_takeaways: z.array(z.string()).default([]),
  meta_description: z.string().default(""),
  tags: z.array(z.string()).default([]),
});

/** Compose one daily note of the given kind. Provenance comes from inputs only. */
export async function composeDailyNote(input: DailyNoteInput, client: LlmClient, kind: DailyNoteKind = "brief"): Promise<ComposedNote> {
  const res = await client.complete({
    system: systemPrompt(input.lang, kind),
    user: factsBlock(input),
    json: true,
    maxTokens: 4000, // 600–1000-word article + headroom for reasoning models
    temperature: 0.5,
  });
  const parsed = NoteSchema.parse(extractJson(res.text));

  // Provenance/citations come from the inputs, never the model. Alerts cite their
  // source article; radar items (X tweets, bestseller listings) cite their permalink —
  // these are the sources for product/trend-led briefs.
  const citations = [
    ...input.alerts.filter((a) => a.sourceUrl).map((a) => ({ title: a.title, url: a.sourceUrl as string })),
    ...input.radar.filter((r) => r.link).map((r) => ({ title: r.title, url: r.link })),
  ];

  return {
    date: input.date,
    lang: input.lang,
    kind,
    slug: slugify(input.date, parsed.title, input.lang),
    title: parsed.title,
    dek: parsed.dek,
    bodyMarkdown: parsed.body_markdown,
    keyTakeaways: parsed.key_takeaways,
    metaDescription: parsed.meta_description,
    tags: parsed.tags,
    citations,
    sourceAlertIds: input.alerts.map((a) => a.id),
    model: res.model,
  };
}
