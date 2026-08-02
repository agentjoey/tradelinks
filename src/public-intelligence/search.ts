/**
 * Phase 1 Public Intelligence — /changes search and detail read model (Task 4).
 *
 * Server-only. Builds on the accepted Task 1 contract: the same visibility
 * invariant (isCurrent / PUBLISHED / reviewed / MONITORED|VERIFIED), the same
 * serializer, and the same opaque cursor wire format (base64url JSON
 * { id, reviewedAt }) emitted by listPublicChanges in query.ts. Task 1 keeps
 * its helpers module-private and query.ts is out of scope, so the pagination
 * below re-states the identical format — the tests pin cross-compatibility.
 *
 * Phase 1 ships search WITHOUT a dedicated index, deliberately: canonical
 * changes are curated and low-volume (hundreds, not millions), so a
 * case-insensitive scan over title/summary is acceptable at this size. The
 * trigram/full-text index is owned by Task 8 once measured numbers justify
 * the migration. Do not add one here.
 */

import type { PlatformCode, ProductCategory, SignalType } from "@prisma/client";

import { prisma } from "../db/client.js";
import {
  PRODUCT_CATEGORIES,
  SIGNAL_TYPES,
  parseProductCategory,
} from "../domain/intelligence/taxonomy.js";
import { toDemandContext } from "./coverage.js";
import type { DemandContext } from "./coverage.js";
import { getPublicChangeBySlug } from "./query.js";
import { serializeCanonicalVersion } from "./serialize.js";
import type { CanonicalPublicRecord, PublicPage, VersionWithEvidence } from "./types.js";

// ---------- filters ----------

export type PublicSearchPool = "verified" | "monitored" | "experimental-demand";

export type PublicSearchFilters = {
  pool: PublicSearchPool;
  signal: SignalType | null;
  platform: PlatformCode | null;
  category: ProductCategory | null;
  /** Inclusive effective-date bounds, YYYY-MM-DD. Null when absent/invalid. */
  from: string | null;
  to: string | null;
  q: string | null;
  cursor: string | null;
  limit: number;
};

export const DEFAULT_SEARCH_LIMIT = 12;
const MAX_SEARCH_LIMIT = 50;
const MAX_Q_LENGTH = 120;

const PLATFORMS: Record<string, PlatformCode> = {
  amazon: "AMAZON",
  "amazon-us": "AMAZON",
  shopify: "SHOPIFY",
  "shopify-us": "SHOPIFY",
};

function parseDateParam(value: string | null): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  // Reject roll-overs like 2026-13-40 that Date normalises silently.
  if (date.toISOString().slice(0, 10) !== value) return null;
  return value;
}

/**
 * Parses the public filter vocabulary. The safe default is `verified` for an
 * absent, empty, unknown or hostile pool; invalid values for the other
 * allowed filters are dropped, never widened into a leak. Unknown parameters
 * are ignored — they never survive into the returned object, so they can
 * never reach a query.
 */
export function parsePublicSearchParams(input: URLSearchParams): PublicSearchFilters {
  const poolRaw = input.get("pool");
  const pool: PublicSearchPool =
    poolRaw === "monitored" || poolRaw === "experimental-demand" ? poolRaw : "verified";

  const signalRaw = input.get("signal");
  const signal = (SIGNAL_TYPES as readonly string[]).includes(signalRaw ?? "")
    ? (signalRaw as SignalType)
    : null;

  const platformRaw = input.get("platform")?.trim().toLowerCase() ?? "";
  const platform = PLATFORMS[platformRaw] ?? null;

  const categoryRaw = input.get("category");
  let category: ProductCategory | null = null;
  if (categoryRaw) {
    const parsed = parseProductCategory(categoryRaw);
    if (parsed && (PRODUCT_CATEGORIES as readonly string[]).includes(parsed)) category = parsed;
  }

  const qRaw = input.get("q")?.trim() ?? "";
  const q = qRaw === "" ? null : qRaw.slice(0, MAX_Q_LENGTH);

  const limitRaw = Number(input.get("limit"));
  const limit =
    Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= MAX_SEARCH_LIMIT
      ? limitRaw
      : DEFAULT_SEARCH_LIMIT;

  return {
    pool,
    signal,
    platform,
    category,
    from: parseDateParam(input.get("from")),
    to: parseDateParam(input.get("to")),
    q,
    cursor: input.get("cursor"),
    limit,
  };
}

// ---------- cursor (identical wire format to Task 1 query.ts) ----------

function decodeCursor(cursor: string): { id: string; reviewedAt: string } | null {
  try {
    const obj = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof obj.id === "string" && typeof obj.reviewedAt === "string") {
      return obj;
    }
    return null;
  } catch {
    return null;
  }
}

function encodeCursor(id: string, reviewedAt: string): string {
  return Buffer.from(JSON.stringify({ id, reviewedAt })).toString("base64url");
}

// ---------- search ----------

const MAX_LIMIT = 100;

const PUBLIC_READINESS = ["MONITORED", "VERIFIED"] as const;

const VERSION_INCLUDE = {
  canonicalChange: { include: { versions: { orderBy: { version: "asc" as const } } } },
  evidence: {
    include: { source: { select: { name: true } } },
    orderBy: [{ role: "asc" as const }, { publishedAt: "desc" as const }],
  },
};

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`limit must be an integer between 1 and ${MAX_LIMIT}, got ${limit}`);
  }
}

/**
 * Searches current published canonical changes. Verified is the default
 * pool; Monitored enters only by explicit selection. The q scan is
 * deliberately unindexed in Phase 1 (see file header). An impossible filter
 * combination narrows to empty — it never widens.
 */
export async function searchPublicChanges(filters: PublicSearchFilters): Promise<PublicPage> {
  assertLimit(filters.limit);
  if (filters.pool === "experimental-demand") {
    throw new Error("experimental-demand reads the demand repository, not the canonical stream");
  }

  const readiness = filters.pool === "verified" ? ["VERIFIED" as const] : [...PUBLIC_READINESS];

  const where: Record<string, unknown> = {
    isCurrent: true,
    editorialStatus: "PUBLISHED",
    reviewedAt: { not: null },
    readiness: { in: readiness },
  };
  if (filters.signal) where.signalType = filters.signal;
  if (filters.platform) where.platforms = { has: filters.platform };
  if (filters.category) where.productCategories = { has: filters.category };
  if (filters.from || filters.to) {
    // The mockup's date filter is the effective date. Records without one
    // are excluded while a range is active — narrowing, never widening.
    where.effectiveAt = {
      ...(filters.from ? { gte: new Date(`${filters.from}T00:00:00Z`) } : {}),
      ...(filters.to ? { lte: new Date(`${filters.to}T23:59:59.999Z`) } : {}),
    };
  }
  if (filters.q) {
    where.OR = [
      { title: { contains: filters.q, mode: "insensitive" } },
      { summary: { contains: filters.q, mode: "insensitive" } },
    ];
  }

  const total = await prisma.canonicalChangeVersion.count({ where });

  let cursorClause: { cursor: { id: string }; skip: number } | undefined;
  if (filters.cursor) {
    const decoded = decodeCursor(filters.cursor);
    if (!decoded) {
      throw new Error(`invalid or undecodable cursor: ${filters.cursor.slice(0, 20)}...`);
    }
    cursorClause = { cursor: { id: decoded.id }, skip: 1 };
  }

  const versions = await prisma.canonicalChangeVersion.findMany({
    where,
    include: VERSION_INCLUDE,
    orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
    take: filters.limit,
    ...(cursorClause as any),
  });

  const items = versions.map((v) => serializeCanonicalVersion(v as unknown as VersionWithEvidence));

  const nextCursor =
    items.length === filters.limit && items.length > 0
      ? encodeCursor(
          items[items.length - 1]!.versionId,
          versions[versions.length - 1]!.reviewedAt!.toISOString(),
        )
      : null;

  return { items, nextCursor, total };
}

// ---------- detail ----------

export type PublicEvidenceWithAccess = CanonicalPublicRecord["evidence"][number] & {
  access: "PUBLIC" | "RESTRICTED" | "UNAVAILABLE";
};

export type PublicChangeDetail = {
  record: CanonicalPublicRecord;
  evidence: PublicEvidenceWithAccess[];
  /** Present only when the template itself has been reviewed. */
  actionTemplate: { body: string; reviewedAt: string } | null;
  hasReviewedPrimaryOfficial: boolean;
  /**
   * Every published version of the record, oldest first — the public audit
   * trail. Published versions are never rewritten, and every one is
   * addressable on the page. Draft versions are editorial internals and
   * never appear.
   */
  versionHistory: Array<{ version: number; createdAt: string; correctionReason: string | null }>;
};

/**
 * The /changes/[slug] read model: the Task 1 record plus the two detail-only
 * facts the public DTO deliberately does not carry — evidence access labels
 * (inaccessible/disallowed evidence is labelled, never omitted) and the
 * action-template review state. Unknown, unpublished or below-Monitored
 * slugs return null so the page can 404 for real.
 */
export async function getPublicChangeDetail(slug: string): Promise<PublicChangeDetail | null> {
  const record = await getPublicChangeBySlug(slug);
  if (!record) return null;

  const version = await prisma.canonicalChangeVersion.findUnique({
    where: { id: record.versionId },
    select: {
      actionTemplateReviewedAt: true,
      evidence: { select: { url: true, access: true, reviewedAt: true, role: true } },
      canonicalChange: {
        select: {
          versions: {
            where: { editorialStatus: "PUBLISHED" },
            orderBy: { version: "asc" },
            select: { version: true, createdAt: true, correctionReason: true },
          },
        },
      },
    },
  });
  if (!version) return null;

  const accessByUrl = new Map(version.evidence.map((e) => [e.url, e.access]));
  const evidence: PublicEvidenceWithAccess[] = record.evidence.map((e) => ({
    ...e,
    access: (accessByUrl.get(e.url) ?? "PUBLIC") as PublicEvidenceWithAccess["access"],
  }));

  const hasReviewedPrimaryOfficial = version.evidence.some(
    (e) => e.role === "PRIMARY_OFFICIAL" && e.reviewedAt != null,
  );

  const actionTemplate =
    record.generalActionTemplate && version.actionTemplateReviewedAt
      ? { body: record.generalActionTemplate, reviewedAt: version.actionTemplateReviewedAt.toISOString() }
      : null;

  const versionHistory = version.canonicalChange.versions.map((v) => ({
    version: v.version,
    createdAt: v.createdAt.toISOString(),
    correctionReason: v.correctionReason,
  }));

  return { record, evidence, actionTemplate, hasReviewedPrimaryOfficial, versionHistory };
}

// ---------- experimental demand (the separate demand repository) ----------

export type DemandObservation = {
  asin: string;
  title: string;
  category: string;
  rank: number | null;
  observedAt: string;
};

/**
 * Rank observations from public bestseller pages, read from the separate
 * demand repository (product_snapshots) — never merged into the canonical
 * stream. One row per ASIN, most recent observation first. These rows cannot
 * support a bestseller claim, a launch recommendation, or a market-size
 * estimate; the boundary copy renders wherever they do.
 */
export async function listExperimentalDemand(limit = 12): Promise<DemandObservation[]> {
  const rows = await prisma.productSnapshot.findMany({
    where: { region: "north_america" },
    orderBy: [{ date: "desc" }, { rank: "asc" }],
    take: limit * 8,
    select: { asin: true, title: true, category: true, rank: true, date: true },
  });
  const seen = new Set<string>();
  const observations: DemandObservation[] = [];
  for (const row of rows) {
    if (seen.has(row.asin)) continue;
    seen.add(row.asin);
    observations.push({
      asin: row.asin,
      title: row.title,
      category: row.category,
      rank: row.rank,
      observedAt: row.date.toISOString().slice(0, 10),
    });
    if (observations.length >= limit) break;
  }
  return observations;
}

/**
 * The demand capability gate: demand renders only while its capability is
 * EXPERIMENTAL with a non-empty non-promise gap statement (Task 3's
 * toDemandContext, consumed unchanged).
 */
export async function getDemandCapabilityContext(): Promise<DemandContext | null> {
  const capability = await prisma.coverageCapability.findUnique({
    where: { key: "demand:amazon-bsr" },
    include: { sources: { include: { source: true } } },
  });
  return toDemandContext(capability);
}
