// Daily Note storage + reads (BL-027). Gather assembles the previous day's signal
// set into a DailyNoteInput (shared by both kinds); persist upserts the reviewed
// note (one row per date×lang×kind); the read helpers feed the /daily pages and
// sitemap. Note content is produced by the editor→reviewer pipeline (compose.ts /
// review.ts); provenance (citations, source ids) always comes from the inputs.
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { getViralX, getHotTopicsX } from "../social/db.js";
import type { DailyNoteInput } from "./compose.js";
import type { ReviewedNote } from "./review.js";

/** UTC day window [start, end) for a YYYY-MM-DD date string. */
function dayWindow(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00.000Z`);
  const end = new Date(start.getTime() + 864e5);
  return { start, end };
}

/**
 * Assemble the input set for the note covering `date` (a UTC YYYY-MM-DD). Same
 * set feeds both kinds — the kind only changes the prompt + quality gate.
 */
export async function gatherInputs(date: string, lang: string): Promise<DailyNoteInput> {
  const { start, end } = dayWindow(date);

  const [alerts, signals, viral, hot, recent] = await Promise.all([
    prisma.alert.findMany({
      where: { status: "published", publishedAt: { gte: start, lt: end } },
      orderBy: { urgencyScore: "desc" },
      take: 12,
      select: { id: true, title: true, summary: true, category: true, regions: true, urgencyScore: true, actionRequired: true, sourceUrls: true },
    }),
    prisma.trendSignal.findMany({
      orderBy: { confidence: "desc" },
      take: 8,
      select: { keyword: true, originRegion: true, spreadingTo: true, confidence: true },
    }),
    getViralX(8),
    getHotTopicsX(6),
    prisma.dailyNote.findMany({
      where: { status: "published" },
      orderBy: { date: "desc" },
      take: 5,
      select: { title: true },
    }),
  ]);

  return {
    date,
    lang,
    alerts: alerts.map((a) => ({
      id: a.id,
      title: a.title,
      summary: a.summary,
      category: a.category,
      regions: a.regions as string[],
      urgencyScore: a.urgencyScore,
      actionRequired: a.actionRequired,
      sourceUrl: a.sourceUrls[0] ?? null,
    })),
    signals: signals.map((s) => ({
      keyword: s.keyword,
      originRegion: s.originRegion as string,
      spreadingTo: s.spreadingTo as string[],
      confidence: s.confidence,
    })),
    radar: [
      ...viral.map((v) => ({ kind: "product" as const, title: v.whyViral ? `${v.product} — ${v.whyViral}` : v.product, link: v.link, likes: v.likes })),
      ...hot.map((h) => ({ kind: "topic" as const, title: h.whyHot ? `${h.headline} — ${h.whyHot}` : h.headline, link: h.link, likes: h.likes })),
    ],
    recentTitles: recent.map((r) => r.title),
  };
}

/** Upsert one reviewed note (idempotent per date×lang×kind). */
export async function persistNote(note: ReviewedNote, status: "draft" | "published"): Promise<void> {
  const date = new Date(`${note.date}T00:00:00.000Z`);
  const data = {
    slug: note.slug,
    title: note.title,
    dek: note.dek || null,
    bodyMarkdown: note.bodyMarkdown,
    keyTakeaways: note.keyTakeaways,
    metaDescription: note.metaDescription || null,
    tags: note.tags,
    citations: note.citations as unknown as Prisma.InputJsonValue,
    sourceAlertIds: note.sourceAlertIds,
    status,
    model: note.model,
    reviewModel: note.reviewModel,
    removedClaims: note.removedClaims,
    publishedAt: status === "published" ? new Date() : null,
  };

  await prisma.dailyNote.upsert({
    where: { date_lang_kind: { date, lang: note.lang, kind: note.kind } },
    update: data,
    create: { date, lang: note.lang, kind: note.kind, ...data },
  });
}

export interface DailyNoteCard {
  slug: string;
  date: Date;
  lang: string;
  kind: string;
  title: string;
  dek: string | null;
  tags: string[];
  publishedAt: Date | null;
}

/** Published notes, newest first — for the /daily index. */
export async function getPublishedNotes(limit = 50, lang?: string): Promise<DailyNoteCard[]> {
  return prisma.dailyNote.findMany({
    where: { status: "published", ...(lang ? { lang } : {}) },
    orderBy: [{ date: "desc" }, { kind: "asc" }],
    take: limit,
    select: { slug: true, date: true, lang: true, kind: true, title: true, dek: true, tags: true, publishedAt: true },
  });
}

export interface DailyNoteFull extends DailyNoteCard {
  bodyMarkdown: string;
  keyTakeaways: string[];
  metaDescription: string | null;
  citations: { title: string; url: string }[];
  heroImageUrl: string | null;
}

/** One published note by slug — for /daily/[slug]. Returns null if not published. */
export async function getNoteBySlug(slug: string): Promise<DailyNoteFull | null> {
  const n = await prisma.dailyNote.findFirst({
    where: { slug, status: "published" },
    select: {
      slug: true, date: true, lang: true, kind: true, title: true, dek: true, tags: true, publishedAt: true,
      bodyMarkdown: true, keyTakeaways: true, metaDescription: true, citations: true, heroImageUrl: true,
    },
  });
  if (!n) return null;
  return { ...n, citations: (n.citations as { title: string; url: string }[] | null) ?? [] };
}
