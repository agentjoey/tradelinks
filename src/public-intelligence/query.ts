/**
 * Phase 1 Public Intelligence read queries.
 *
 * Server-only. Reads CanonicalChangeVersion, never Alert or DailyNote.
 * Every query enforces isCurrent / PUBLISHED / reviewed / readiness
 * before returning a single byte.
 */

import { prisma } from "../db/client.js";
import { serializeCanonicalVersion } from "./serialize.js";
import type {
  CanonicalPublicRecord,
  PublicFilters,
  PublicPage,
  VersionWithEvidence,
} from "./types.js";

const MAX_LIMIT = 100;

const PUBLIC_READINESS = ["MONITORED", "VERIFIED"] as const;

function assertLimit(limit: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error(`limit must be an integer between 1 and ${MAX_LIMIT}, got ${limit}`);
  }
}

function publicBaseCondition() {
  return {
    isCurrent: true,
    editorialStatus: "PUBLISHED" as const,
    reviewedAt: { not: null },
    readiness: { in: [...PUBLIC_READINESS] },
  };
}

/**
 * The pool a caller gets when it asks for nothing in particular.
 *
 * `verified` was the original default on every surface, and it is currently
 * unreachable — VERIFIED needs reviewed PRIMARY_OFFICIAL evidence, and the
 * review desk has no action that marks evidence reviewed. The first entries a
 * human published were therefore live in the database and invisible in
 * /changes, the feeds and the API, so an RSS subscriber would have received
 * nothing, ever.
 *
 * Owner decision 2026-08-06: default to `monitored`. Verified remains an
 * explicit filter — the stronger claim stays available, it just stops being
 * the silent precondition for seeing anything at all. Distribution surfaces
 * import this rather than writing the word, because it was previously spelled
 * out in five places and the OpenAPI document drifted from the handler.
 */
export const DEFAULT_PUBLIC_POOL = "monitored" as const;

function readinessForPool(pool: "verified" | "monitored") {
  if (pool === "verified") return ["VERIFIED" as const];
  return [...PUBLIC_READINESS];
}

export function decodeCursor(cursor: string): { id: string; reviewedAt: string } | null {
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

export function encodeCursor(id: string, reviewedAt: string): string {
  return Buffer.from(JSON.stringify({ id, reviewedAt })).toString("base64url");
}

const VERSION_INCLUDE = {
  canonicalChange: { include: { versions: { orderBy: { version: "asc" as const } } } },
  evidence: {
    include: { source: { select: { name: true } } },
    orderBy: [{ role: "asc" as const }, { publishedAt: "desc" as const }],
  },
};

export async function getPublicChangeBySlug(
  slug: string,
): Promise<CanonicalPublicRecord | null> {
  const version = await prisma.canonicalChangeVersion.findFirst({
    where: {
      ...publicBaseCondition(),
      canonicalChange: { slug },
    },
    include: VERSION_INCLUDE,
    orderBy: { reviewedAt: "desc" },
  });

  if (!version) return null;

  return serializeCanonicalVersion(version as VersionWithEvidence);
}

export async function listPublicChanges(
  filters: PublicFilters,
): Promise<PublicPage> {
  assertLimit(filters.limit);

  const readinesses = readinessForPool(filters.pool);

  const where = {
    ...publicBaseCondition(),
    readiness: { in: readinesses },
  };

  const total = await prisma.canonicalChangeVersion.count({ where });

  let cursorClause: { cursor: { id: string }; skip: number } | undefined;
  if (filters.cursor) {
    const decoded = decodeCursor(filters.cursor);
    if (!decoded) {
      throw new Error(
        `invalid or undecodable cursor: ${filters.cursor.slice(0, 20)}...`,
      );
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

  const items = versions.map((v) =>
    serializeCanonicalVersion(v as unknown as VersionWithEvidence),
  );

  const nextCursor =
    items.length === filters.limit && items.length > 0
      ? encodeCursor(
          items[items.length - 1]!.versionId,
          versions[versions.length - 1]!.reviewedAt!.toISOString(),
        )
      : null;

  return { items, nextCursor, total };
}
