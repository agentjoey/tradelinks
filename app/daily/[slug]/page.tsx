import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getNoteBySlug, getNoteSiblingSlug } from "../../../src/daily/db.js";
import { getDict } from "../../lib/i18n";
import { addLocale } from "../../lib/locale";
import { Markdown } from "../Markdown";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";
const AUTHOR = "Agent Joey";

function fmtDate(d: Date, lang: string): string {
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const n = await getNoteBySlug(slug);
  if (!n) return { title: "Not found — TradeLinks" };
  const selfPath = addLocale(`/daily/${n.slug}`, n.lang as "en" | "zh");
  const url = `${SITE}${selfPath}`;
  const otherLang = n.lang === "zh" ? "en" : "zh";
  const siblingSlug = await getNoteSiblingSlug(n.date, n.kind, otherLang);
  const languages: Record<string, string> = {
    [n.lang === "zh" ? "zh-Hans" : "en"]: url,
  };
  if (siblingSlug) {
    const siblingPath = addLocale(`/daily/${siblingSlug}`, otherLang as "en" | "zh");
    languages[otherLang === "zh" ? "zh-Hans" : "en"] = `${SITE}${siblingPath}`;
    languages["x-default"] = otherLang === "en" ? `${SITE}${siblingPath}` : url;
  }
  const desc = n.metaDescription ?? n.dek ?? n.title;
  return {
    title: `${n.title} — TradeLinks`,
    description: desc,
    alternates: { canonical: url, languages },
    openGraph: { title: n.title, description: desc, type: "article", url, publishedTime: (n.publishedAt ?? n.date).toISOString(), authors: [AUTHOR], ...(n.heroImageUrl ? { images: [n.heroImageUrl] } : {}) },
    twitter: { card: "summary_large_image", title: n.title, description: desc },
  };
}

export default async function DailyNotePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { lang, t } = await getDict();
  const n = await getNoteBySlug(slug);
  if (!n) notFound();

  const url = `${SITE}${addLocale(`/daily/${n.slug}`, n.lang as "en" | "zh")}`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: n.title,
    description: n.metaDescription ?? n.dek ?? undefined,
    datePublished: (n.publishedAt ?? n.date).toISOString(),
    dateModified: (n.publishedAt ?? n.date).toISOString(),
    inLanguage: n.lang,
    author: { "@type": "Person", name: AUTHOR },
    publisher: { "@type": "Organization", name: "TradeLinks" },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    ...(n.heroImageUrl ? { image: [n.heroImageUrl] } : {}),
    ...(n.citations.length ? { citation: n.citations.map((c) => c.url) } : {}),
  };

  return (
    <article className="mx-auto max-w-[42rem]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <Link href={addLocale("/daily", lang)} className="ticker text-[10px] uppercase tracking-[0.18em] text-faint hover:text-signal transition-colors">{t.dailyBackToAll}</Link>

      <div className="mt-4 ticker flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-faint">
        <span>{fmtDate(n.date, lang)}</span>
        <span className="text-line">·</span>
        <span className={n.kind === "roundup" ? "text-calm" : "text-signal"}>{n.kind === "roundup" ? t.kindRoundup : t.kindBrief}</span>
      </div>

      <h1 className="mt-2 font-display text-[2.1rem] leading-[1.12] tracking-tight text-paper">{n.title}</h1>
      {n.dek && <p className="mt-3 text-[17px] italic leading-7 text-muted">{n.dek}</p>}
      <p className="mt-3 ticker text-[11px] uppercase tracking-[0.14em] text-faint">{t.dailyBy}</p>

      <div className="mt-7 border-t border-line pt-2">
        <Markdown source={n.bodyMarkdown} />
      </div>

      {n.keyTakeaways.length > 0 && (
        <div className="mt-8 rounded-lg border border-line bg-surface/60 p-5">
          <div className="ticker mb-2 text-[10px] uppercase tracking-[0.16em] text-signal/80">{t.dailyTakeaways}</div>
          <ul className="list-disc pl-5 text-[14.5px] text-muted marker:text-faint">
            {n.keyTakeaways.map((k, i) => <li key={i} className="my-1 leading-6">{k}</li>)}
          </ul>
        </div>
      )}

      {n.citations.length > 0 && (
        <div className="mt-7">
          <div className="ticker mb-2 text-[10px] uppercase tracking-[0.16em] text-faint">{t.dailySources}</div>
          <ul className="space-y-1.5">
            {n.citations.map((c, i) => (
              <li key={i} className="text-[13.5px] leading-6">
                <a href={c.url} target="_blank" rel="noopener nofollow" className="text-calm hover:text-signal transition-colors">{c.title} ↗</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
