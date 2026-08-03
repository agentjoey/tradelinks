/**
 * Phase 1 Public Intelligence — canonical scoped RSS feeds (Task 6).
 *
 * Server-only. Every change item is a projection of CanonicalPublicRecord
 * produced by serializeCanonicalVersion through the accepted read model
 * (searchPublicChanges, Task 4). This module never queries the database
 * with its own shape and never recomputes a fingerprint: the versionId,
 * fingerprint and permalink rendered into the XML are the serializer's own
 * bytes, pinned by test/public-feeds.test.ts over the rendered XML string.
 *
 * Hard rules (contract): max 50 items, normalized/concise public summaries
 * only (never third-party full text), no private fields, cache headers
 * derived from PUBLIC_CACHE only, unknown platform/category scope is a 404
 * (resolved by the route via resolvePlatformScope/resolveCategoryScope),
 * version ID as guid isPermaLink="false", canonical permalink as link.
 */

import type { PlatformCode, ProductCategory } from "@prisma/client";

import {
  INITIAL_PUBLIC_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  categorySlug,
  parseProductCategory,
} from "../domain/intelligence/taxonomy.js";
import { listPublishedBriefings } from "./briefings.js";
import type { PublishedBriefingSummary } from "./briefings.js";
import { PUBLIC_CACHE } from "./cache.js";
import { searchPublicChanges } from "./search.js";
import type { CanonicalPublicRecord } from "./types.js";

export const FEED_MAX_ITEMS = 50;

/** Canonical origin — the same base the serializer uses for permalinks. */
const CANONICAL_BASE = "https://tradelinks.us";

const PLATFORM_SCOPES: Record<string, PlatformCode> = {
  "amazon-us": "AMAZON",
  "shopify-us": "SHOPIFY",
};

const PLATFORM_LABELS: Record<string, string> = {
  AMAZON: "Amazon US",
  SHOPIFY: "Shopify US",
};

export type FeedScope =
  | { kind: "changes" }
  | { kind: "platform"; slug: string; platform: PlatformCode }
  | { kind: "category"; slug: string; category: ProductCategory }
  | { kind: "briefings" };

export type FeedChannel = {
  title: string;
  link: string;
  /** Absolute URL of the feed itself — the atom:self canonical subscription URL. */
  self: string;
  description: string;
};

// ---------- scope resolution ----------

function stripXmlSuffix(param: string): string | null {
  return param.endsWith(".xml") ? param.slice(0, -".xml".length) : null;
}

/**
 * The route param arrives with the `.xml` suffix (e.g. "amazon-us.xml") —
 * the amendment pins this: require the suffix, strip it, validate the
 * remainder against the known platform enum, null (→ 404) otherwise.
 */
export function resolvePlatformScope(param: string): Extract<FeedScope, { kind: "platform" }> | null {
  const slug = stripXmlSuffix(param);
  if (!slug) return null;
  const platform = PLATFORM_SCOPES[slug];
  return platform ? { kind: "platform", slug, platform } : null;
}

/** Only the six public category hubs are public scopes; anything else 404s. */
export function resolveCategoryScope(param: string): Extract<FeedScope, { kind: "category" }> | null {
  const raw = stripXmlSuffix(param);
  if (!raw) return null;
  const category = parseProductCategory(raw);
  if (!category || !(INITIAL_PUBLIC_CATEGORIES as readonly string[]).includes(category)) {
    return null;
  }
  // Normalize to the canonical slug so a case variant (PET-SUPPLIES.xml)
  // never emits a channel link the case-sensitive page route would 404.
  return { kind: "category", slug: categorySlug(category), category };
}

// ---------- XML primitives ----------

const XML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

/**
 * Escapes all five XML entities and strips control characters that are
 * illegal in XML 1.0 (they survive scraping and would make readers drop
 * the whole feed). Applied to every interpolated value, without exception.
 */
export function escapeXml(value: string): string {
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[&<>"']/g, (c) => XML_ENTITIES[c]!);
}

function toRfc822(iso: string): string {
  return new Date(iso).toUTCString();
}

// ---------- change items ----------

function changeItemXml(record: CanonicalPublicRecord): string {
  const descriptionLines: string[] = [record.summary, ""];
  descriptionLines.push(`Market: ${record.market}`);
  descriptionLines.push(`Readiness: ${record.readiness}`);
  if (record.effectiveAt) {
    descriptionLines.push(`Effective: ${record.effectiveAt.slice(0, 10)}`);
  }
  if (record.evidence.length > 0) {
    descriptionLines.push("", "Evidence:");
    for (const e of record.evidence) {
      descriptionLines.push(`- ${e.sourceName}: ${e.url}`);
    }
  }

  const categories = [
    `<category domain="market">${escapeXml(record.market)}</category>`,
    `<category domain="readiness">${escapeXml(record.readiness)}</category>`,
    `<category domain="signal">${escapeXml(record.signalType)}</category>`,
    `<category domain="fingerprint">${escapeXml(record.fingerprint)}</category>`,
    ...record.platforms.map(
      (p) => `<category domain="platform">${escapeXml(p)}</category>`,
    ),
    ...record.productCategories.map(
      (c) => `<category domain="product-category">${escapeXml(c)}</category>`,
    ),
  ];

  return `    <item>
      <title>${escapeXml(record.title)}</title>
      <link>${escapeXml(record.permalink)}</link>
      <guid isPermaLink="false">${escapeXml(record.versionId)}</guid>
      <pubDate>${toRfc822(record.sourcePublishedAt)}</pubDate>
      ${categories.join("\n      ")}
      <description>${escapeXml(descriptionLines.join("\n"))}</description>
    </item>`;
}

/**
 * Pure renderer: serializer-produced records in, RSS XML out. The 50-item
 * cap is enforced here (not only in the query) so no caller can exceed it.
 */
export function renderChangesFeedXml(
  channel: FeedChannel,
  records: CanonicalPublicRecord[],
): string {
  const items = records.slice(0, FEED_MAX_ITEMS).map(changeItemXml).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.link)}</link>
    <atom:link rel="self" type="application/rss+xml" href="${escapeXml(channel.self)}"/>
    <language>en-us</language>
    <description>${escapeXml(channel.description)}</description>
${items}
  </channel>
</rss>
`;
}

// ---------- briefing items ----------

function briefingItemXml(briefing: PublishedBriefingSummary): string {
  const link = `${CANONICAL_BASE}${briefing.path}`;
  return `    <item>
      <title>${escapeXml(briefing.title)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="false">${escapeXml(briefing.slug)}</guid>
      <pubDate>${toRfc822(briefing.publishedAt)}</pubDate>
      <category domain="kind">${escapeXml(briefing.kind)}</category>
      <category domain="readiness">${escapeXml(briefing.readiness)}</category>
      <description>${escapeXml(briefing.summary)}</description>
    </item>`;
}

export function renderBriefingsFeedXml(
  channel: FeedChannel,
  briefings: PublishedBriefingSummary[],
): string {
  const items = briefings.slice(0, FEED_MAX_ITEMS).map(briefingItemXml).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(channel.title)}</title>
    <link>${escapeXml(channel.link)}</link>
    <atom:link rel="self" type="application/rss+xml" href="${escapeXml(channel.self)}"/>
    <language>en-us</language>
    <description>${escapeXml(channel.description)}</description>
${items}
  </channel>
</rss>
`;
}

// ---------- the feed endpoint ----------

/** Cache policy: PUBLIC_CACHE values only — no second caching policy. */
export function feedHeaders(): Record<string, string> {
  return {
    "content-type": "application/rss+xml; charset=utf-8",
    "cache-control": `public, s-maxage=${PUBLIC_CACHE.liveChangesRevalidate}, stale-while-revalidate=${PUBLIC_CACHE.canonicalChangeRevalidate}`,
  };
}

export function feedChannel(scope: FeedScope): FeedChannel {
  switch (scope.kind) {
    case "platform":
      return {
        title: `TradeLinks — ${PLATFORM_LABELS[scope.platform]} changes`,
        link: `${CANONICAL_BASE}/${scope.slug}`,
        self: `${CANONICAL_BASE}/feeds/platforms/${scope.slug}.xml`,
        description: `Verified canonical changes for ${PLATFORM_LABELS[scope.platform]} sellers.`,
      };
    case "category":
      return {
        title: `TradeLinks — ${PRODUCT_CATEGORY_LABELS[scope.category]} changes`,
        link: `${CANONICAL_BASE}/categories/${scope.slug}`,
        self: `${CANONICAL_BASE}/feeds/categories/${scope.slug}.xml`,
        description: `Verified canonical changes for ${PRODUCT_CATEGORY_LABELS[scope.category]} in the US market.`,
      };
    case "briefings":
      return {
        title: "TradeLinks — Briefings",
        link: `${CANONICAL_BASE}/briefings`,
        self: `${CANONICAL_BASE}/feeds/briefings.xml`,
        description: "Published weekly, monthly and conditional daily briefings.",
      };
    default:
      return {
        title: "TradeLinks — Verified US market changes",
        link: `${CANONICAL_BASE}/changes`,
        self: `${CANONICAL_BASE}/feeds/changes.xml`,
        description: "Verified canonical changes for cross-border sellers in the US market.",
      };
  }
}

/**
 * Renders one feed. Change feeds consume CanonicalPublicRecord from the
 * accepted read model (verified pool — the safe public default); the
 * briefings feed consumes published briefing summaries. Unknown scopes are
 * rejected before this is called (resolvePlatformScope/resolveCategoryScope
 * return null and the route answers 404, never an empty feed).
 */
export async function renderPublicFeed(scope: FeedScope): Promise<Response> {
  const channel = feedChannel(scope);

  if (scope.kind === "briefings") {
    const briefings = await listPublishedBriefings();
    return new Response(renderBriefingsFeedXml(channel, briefings), {
      status: 200,
      headers: feedHeaders(),
    });
  }

  const page = await searchPublicChanges({
    pool: "verified",
    signal: null,
    platform: scope.kind === "platform" ? scope.platform : null,
    category: scope.kind === "category" ? scope.category : null,
    from: null,
    to: null,
    q: null,
    cursor: null,
    limit: FEED_MAX_ITEMS,
  });

  return new Response(renderChangesFeedXml(channel, page.items), {
    status: 200,
    headers: feedHeaders(),
  });
}
