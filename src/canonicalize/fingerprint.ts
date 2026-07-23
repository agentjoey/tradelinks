/**
 * Deterministic fingerprinting for canonical evidence items.
 *
 * Official event/recall/rule identifiers dominate: two items that share an
 * authority event id, market, and effective day produce the same fingerprint
 * regardless of title wording. Without an official id the normalized title
 * takes its place. Pure + unit-tested (no DB, no model calls).
 * See .pact/tasks/phase1-foundation-canonicalization.md.
 */
import { createHash } from "node:crypto";
import type { MarketCode, PlatformCode } from "@prisma/client";

import type { ProductCategory } from "../domain/intelligence/taxonomy.js";

/**
 * The facts about one immutable source item that canonicalization is allowed
 * to rely on. Dates are ISO strings (date or datetime); anything unparseable
 * is treated as unsupported by the classifier.
 */
export interface SourceItemFacts {
  id: string;
  title: string;
  market: MarketCode;
  platforms: PlatformCode[];
  /** Official event/recall/rule id when the authority publishes one. */
  authorityEventId?: string | null;
  effectiveAt?: string | null;
  publishedAt: string;
  /** Per-item category hints from the source contract, if known. */
  productCategories?: ProductCategory[];
}

/** Lowercase, punctuation-stripped, whitespace-collapsed title. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Normalized official id: trimmed, uppercased, inner whitespace collapsed. */
export function normalizeAuthorityEventId(id: string | null | undefined): string | null {
  if (id == null) return null;
  const normalized = id.trim().replace(/\s+/g, " ").toUpperCase();
  return normalized === "" ? null : normalized;
}

/** UTC calendar day (YYYY-MM-DD) of an ISO date/datetime, or null if unparseable. */
export function isoDay(value: string | null | undefined): string | null {
  if (value == null) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return new Date(time).toISOString().slice(0, 10);
}

/** Whole-day distance between two ISO dates, or null when either is unparseable. */
export function dayDistance(a: string, b: string): number | null {
  const da = isoDay(a);
  const db = isoDay(b);
  if (da === null || db === null) return null;
  return Math.abs(Date.parse(da) - Date.parse(db)) / 86_400_000;
}

function stableHash(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Deterministic fingerprint of one source item: market, official event id (or
 * normalized title), and the effective day (falling back to the published day).
 */
export function candidateFingerprint(item: SourceItemFacts): string {
  const identity =
    normalizeAuthorityEventId(item.authorityEventId) ?? normalizeTitle(item.title);
  const day = isoDay(item.effectiveAt) ?? isoDay(item.publishedAt) ?? "unknown-date";
  return stableHash([item.market, identity, day].join("|"));
}

function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

/**
 * Deterministic character-trigram Jaccard similarity (0..1) over normalized
 * titles — the pure-TS analogue of the pg_trgm similarity used by src/dedup.
 */
export function titleSimilarity(a: string, b: string): number {
  const ta = trigrams(normalizeTitle(a));
  const tb = trigrams(normalizeTitle(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const gram of ta) {
    if (tb.has(gram)) intersection++;
  }
  return intersection / (ta.size + tb.size - intersection);
}
