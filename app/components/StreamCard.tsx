import type { AlertRow } from "../lib/alerts";
import type { ProductCard } from "../lib/home-data";
import { SignalCard, type SignalTone } from "./SignalCard";
import { tierStyle, CAT_LABEL, REGION_LABEL, domainOf, hhmm, type Tiers } from "./alert-style";
import { addLocale } from "../lib/locale";

const proxied = (u: string) => `/api/img-proxy?u=${encodeURIComponent(u)}`;

/** Urgency → card tone: ≥4 urgent, ≥2 signal, else neutral. */
const toneOf = (score: number): SignalTone => (score >= 4 ? "urgent" : score >= 2 ? "signal" : "neutral");

/** Wire alert card (top-of-band). Same props as before; markup now lives in
 * SignalCard — tier chip + meta + title + thumbnail. */
export function WireCard({ a, tiers }: { a: AlertRow; tiers: Tiers }) {
  const u = tierStyle(a.urgencyScore, tiers);
  const href = a.sourceUrls[0] ?? "#";
  const meta = [
    CAT_LABEL[a.category] ?? a.category,
    ...a.regions.map((r) => REGION_LABEL[r] ?? r),
    domainOf(href),
    hhmm(a.publishedAt ?? a.createdAt),
  ].filter((s): s is string => !!s).join(" · ");
  return (
    <SignalCard
      href={href} external
      tierLabel={u.label} tone={toneOf(a.urgencyScore)}
      meta={meta} title={a.title}
      imageUrl={a.imageUrl ? proxied(a.imageUrl) : null}
    />
  );
}

/** Radar product card: rank chip + platform/metric meta. */
export function RadarCard({ p }: { p: ProductCard }) {
  return (
    <SignalCard
      href={p.url} external
      tierLabel={p.rank != null ? `#${p.rank}` : undefined}
      meta={`${p.platform} · ${p.metric}${p.region ? ` · ${REGION_LABEL[p.region] ?? p.region}` : ""}`}
      title={p.title}
      imageUrl={p.imageUrl ? proxied(p.imageUrl) : null}
    />
  );
}

interface NoteCard { slug: string; date: Date; title: string; dek: string | null; kind: string }

/** Editorial Daily card — text only (notes carry no image; decision C). */
export function DailyCard({ note, briefLabel, roundupLabel, byLabel, lang }: {
  note: NoteCard; briefLabel: string; roundupLabel: string; byLabel: string; lang: string;
}) {
  const roundup = note.kind === "roundup";
  const date = new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(note.date));
  return (
    <SignalCard
      href={addLocale(`/daily/${note.slug}`, lang as "en" | "zh")}
      tierLabel={roundup ? roundupLabel : briefLabel}
      tone={roundup ? "calm" : "signal"}
      meta={`${date} · ${byLabel}`}
      title={note.title}
      dek={note.dek ?? undefined}
    />
  );
}
