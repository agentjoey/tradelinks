import { getAlerts, type AlertRow } from "./alerts";
import { getBestsellers } from "../../src/trends/db.js";
import { getViralX, getHotTopicsX, type HotTopicXRow } from "../../src/social/db.js";
import { getPublishedNotes } from "../../src/daily/db.js";
import { pickHero, topAlerts, buildLatest, type LatestItem } from "./home";
import type { Lang } from "./i18n";
import { localizeAlerts } from "./i18n-content";

export interface ProductCard {
  key: string;
  title: string;
  platform: string;
  metric: string;
  rank: number | null;
  region: string | null;
  url: string;
  imageUrl: string | null;
}

export type DailyNoteCard = Awaited<ReturnType<typeof getPublishedNotes>>[number];

/** The lead-hero is usually the top alert; if there are no alerts we fall back to
 * the latest Daily note so the hero is never empty. */
export type HeroItem =
  | { kind: "alert"; alert: AlertRow }
  | { kind: "note"; note: DailyNoteCard }
  | null;

export interface HomeData {
  hero: HeroItem;
  secondary: AlertRow[];
  latest: LatestItem[];
  wireFeatured: AlertRow | null;
  wireList: AlertRow[];
  radarLeader: ProductCard | null;
  radarGrid: ProductCard[];
  hotTopics: HotTopicXRow[];
  notes: DailyNoteCard[];
}

const hasImg = (a: AlertRow) => !!(a.imageUrl && a.imageUrl.trim() !== "");

// 单品召回 feed（ACCC 等）：内容是合法预警，但标题是单个商品名、配图常是占位图，
// 做头条大图不合适。Hero 排除这些 feed —— 召回仍正常进 Wire/Latest 列表。
const RECALL_HOSTS = ["productsafety.gov.au"];
const isRecall = (a: AlertRow) => a.sourceUrls.some((u) => RECALL_HOSTS.some((h) => u.includes(h)));

/**
 * Assemble everything the editorial Home needs in one parallel fetch, then derive
 * the hero, the two secondary highlights, the live Latest rail, and each section's
 * slice. Pure derivations live in `home.ts`; this layer only orchestrates I/O.
 */
export async function getHomeData(lang: Lang, now = Date.now()): Promise<HomeData> {
  const [{ items: rawAlerts }, bestsellers, viral, topics, notes] = await Promise.all([
    getAlerts({ take: 60 }),
    getBestsellers(),
    getViralX(),
    getHotTopicsX(),
    // Daily notes - prefer current language, fall back to English.
    getPublishedNotes(4, lang),
  ]);
  const alerts = await localizeAlerts(rawAlerts, lang);
  const notesLocalized = notes.length > 0 ? notes : lang === "en" ? notes : await getPublishedNotes(4, "en");

  // ---- top cluster ----
  // 爆品（trend 类）与单品召回不进 Hero —— 商品/占位图不适合做头条大图；
  // 二者仍分别在 Radar 区、Wire 列表展示。
  const heroAlert = pickHero(alerts.filter((a) => a.category !== "trend" && !isRecall(a)), now);
  const secondary = topAlerts(alerts, 2, heroAlert?.id);
  const usedTop = new Set([heroAlert?.id, ...secondary.map((a) => a.id)].filter(Boolean) as string[]);
  const hero: HeroItem = heroAlert
    ? { kind: "alert", alert: heroAlert }
    : notesLocalized[0]
      ? { kind: "note", note: notesLocalized[0] }
      : null;

  const latest = buildLatest(alerts, viral, topics, 8);

  // ---- Wire section: featured + list (earlier folded in) ----
  const remaining = alerts.filter((a) => !usedTop.has(a.id));
  const wireFeatured =
    remaining.find(hasImg) ?? remaining[0] ?? null;
  const wireList = topAlerts(remaining, 5, wireFeatured?.id);

  // ---- Radar section: #1 leader + grid (bestsellers + viral, image-preferred) ----
  const products: ProductCard[] = [
    ...bestsellers.slice(0, 8).map((b) => ({
      key: `bestseller:${b.url}`,
      title: b.title,
      platform: "Amazon",
      metric: b.rank != null ? `BSR #${b.rank}` : "Bestseller",
      rank: b.rank,
      region: b.region,
      url: b.url,
      imageUrl: b.imageUrl,
    })),
    ...viral.slice(0, 8).map((v) => ({
      key: `viral:${v.link}`,
      title: v.product,
      platform: "X",
      metric: `♥ ${v.likes.toLocaleString()}`,
      rank: null,
      region: null,
      url: v.link,
      imageUrl: v.imageUrl,
    })),
  ];
  const withImg = products.filter((p) => p.imageUrl);
  const ranked = withImg.length >= 7 ? withImg : products;
  const radarLeader = ranked[0] ?? null;
  const radarGrid = ranked.slice(1, 7);

  return {
    hero,
    secondary,
    latest,
    wireFeatured,
    wireList,
    radarLeader,
    radarGrid,
    hotTopics: topics.slice(0, 6),
    notes: notesLocalized.slice(0, 3),
  };
}
