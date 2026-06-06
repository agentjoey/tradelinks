import { getAlerts, type AlertRow } from "./alerts";
import { getBestsellers } from "../../src/trends/db.js";
import { getViralX } from "../../src/social/db.js";
import { getPublishedNotes } from "../../src/daily/db.js";
import { pickBreaking, topAlerts } from "./home";
import type { Lang } from "./i18n";

export interface ProductCard {
  key: string;
  title: string;
  platform: string;
  metric: string;
  region: string | null;
  url: string;
  imageUrl: string | null;
}

export type DailyNoteCard = Awaited<ReturnType<typeof getPublishedNotes>>[number];

export interface HomeData {
  breaking: AlertRow | null;
  wireTop: AlertRow[];
  radarTop: ProductCard[];
  notes: DailyNoteCard[];
  earlierAlerts: AlertRow[];
}

/**
 * Assemble everything the editorial Home needs in one parallel fetch, then
 * derive the breaking item, each stream's top, and the leftover "earlier" pool.
 * Pure derivations live in `home.ts`; this layer only orchestrates I/O.
 */
export async function getHomeData(lang: Lang, now = Date.now()): Promise<HomeData> {
  const [{ items: alerts }, bestsellers, viral, notes] = await Promise.all([
    getAlerts({ take: 60 }),
    getBestsellers(),
    getViralX(),
    getPublishedNotes(4, lang),
  ]);

  const breaking = pickBreaking(alerts, now);
  const wireTop = topAlerts(alerts, 3, breaking?.id);

  const products: ProductCard[] = [
    ...bestsellers.slice(0, 6).map((b) => ({
      key: `bestseller:${b.url}`,
      title: b.title,
      platform: "Amazon",
      metric: b.rank != null ? `BSR #${b.rank}` : "Bestseller",
      region: b.region,
      url: b.url,
      imageUrl: b.imageUrl,
    })),
    ...viral.slice(0, 6).map((v) => ({
      key: `viral:${v.link}`,
      title: v.product,
      platform: "X",
      metric: `♥ ${v.likes.toLocaleString()}`,
      region: null,
      url: v.link,
      imageUrl: v.imageUrl,
    })),
  ];
  const withImg = products.filter((p) => p.imageUrl);
  const radarTop = (withImg.length >= 3 ? withImg : products).slice(0, 3);

  const usedIds = new Set(
    [breaking?.id, ...wireTop.map((a) => a.id)].filter(Boolean) as string[],
  );
  const earlierAlerts = alerts.filter((a) => !usedIds.has(a.id));

  return { breaking, wireTop, radarTop, notes, earlierAlerts };
}
