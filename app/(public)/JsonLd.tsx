/**
 * Public Intelligence Task 8 — structured data for public pages.
 *
 * One component, two builders. Every claim is drawn from the record the
 * page already renders: titles, summaries, dates, canonical URLs. Readiness
 * is a coverage statement about TradeLinks, never a quality or endorsement
 * signal about the record — it is deliberately absent from every builder
 * (no rating, review, or readiness properties anywhere).
 *
 * Server-rendered as an inert <script type="application/ld+json">: zero
 * layout shift, present with JavaScript disabled.
 */

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

export function JsonLd({ data }: { data: unknown }) {
  // `<` must never survive into the script body raw: a "</script>" inside a
  // title would break the HTML parse. < is U+003C in JSON.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

/** BreadcrumbList mirroring the visual breadcrumb the page already renders. */
export function breadcrumbJsonLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE}${item.path}`,
    })),
  };
}

/** Article for a dated public record (guide, briefing). */
export function articleJsonLd(input: {
  title: string;
  summary: string;
  path: string;
  datePublished?: string;
  dateModified?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.summary,
    ...(input.datePublished ? { datePublished: input.datePublished } : {}),
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
    mainEntityOfPage: `${SITE}${input.path}`,
    isAccessibleForFree: true,
    author: { "@type": "Organization", name: "TradeLinks", url: SITE },
    publisher: { "@type": "Organization", name: "TradeLinks", url: SITE },
  };
}
