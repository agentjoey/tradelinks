/**
 * Phase 1 Public Intelligence — anonymous API v1 (Task 7).
 *
 * Server-only. Thin composition over the ACCEPTED read layer:
 * searchPublicChanges / getPublicChangeBySlug / getCoverageMatrix /
 * listPublishedBriefings / listPublicChanges. This module adds no query
 * shape and never recomputes a record fingerprint — versionId, fingerprint
 * and permalink are the serializer's own bytes, pinned over the rendered
 * JSON by test/public-api-v1.test.ts.
 *
 * Two cursor schemes coexist deliberately:
 *  - the WEB cursor (query.ts encodeCursor/decodeCursor) is an unsigned
 *    internal page-through token for first-party pages;
 *  - the API cursor here is a PUBLIC, versioned, HMAC-signed token whose
 *    payload pins the filter set, so a cursor leaked or replayed under
 *    different filters is rejected instead of silently paging someone
 *    else's result set. Unifying them would either expose the unsigned web
 *    format to the public or break every cached web page link.
 * The API cursor translates into the web cursor at the read-layer boundary
 * (via the query.ts helpers) — one query implementation, two wire formats.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { PlatformCode, ProductCategory, SignalType } from "@prisma/client";

import {
  PRODUCT_CATEGORIES,
  SIGNAL_TYPES,
  parseProductCategory,
} from "../domain/intelligence/taxonomy.js";
import { listPublishedBriefings } from "./briefings.js";
import { PUBLIC_CACHE } from "./cache.js";
import { getCoverageMatrix } from "./coverage.js";
import { decodeCursor, encodeCursor, getPublicChangeBySlug, listPublicChanges } from "./query.js";
import { searchPublicChanges } from "./search.js";
import type { CanonicalPublicRecord } from "./types.js";

export const API_VERSION = "1.0" as const;
export const API_DEFAULT_LIMIT = 20;
export const API_MAX_LIMIT = 100;

const MAX_Q_LENGTH = 120;

// ---------- envelope & errors ----------

export type ApiPage<T> = {
  apiVersion: typeof API_VERSION;
  generatedAt: string;
  fingerprint: string;
  data: T[];
  page: { nextCursor: string | null; limit: number };
};

export type ApiResource<T> = {
  apiVersion: typeof API_VERSION;
  generatedAt: string;
  fingerprint: string;
  data: T;
};

export type ApiErrorCode =
  | "INVALID_LIMIT"
  | "INVALID_FILTER"
  | "INVALID_CURSOR"
  | "NOT_FOUND"
  | "CURSOR_NOT_CONFIGURED"
  | "INTERNAL_ERROR";

/** Errors are never cached: a deterministic machine code, no-store. */
export function apiError(status: number, code: ApiErrorCode, message: string): Response {
  return new Response(
    JSON.stringify({ apiVersion: API_VERSION, error: { code, message } }),
    {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

// ---------- headers / ETag ----------

/**
 * Cache policy: PUBLIC_CACHE values only — no second caching policy. The
 * ETag derives from the content fingerprint, never from a hash of the
 * serialized bytes.
 */
export function apiHeaders(
  fingerprint: string,
  lastModified: string | null,
): Record<string, string> {
  return {
    "content-type": "application/json; charset=utf-8",
    etag: `"${fingerprint}"`,
    "cache-control": `public, s-maxage=${PUBLIC_CACHE.liveChangesRevalidate}, stale-while-revalidate=${PUBLIC_CACHE.canonicalChangeRevalidate}`,
    ...(lastModified ? { "last-modified": lastModified } : {}),
  };
}

function etagMatches(ifNoneMatch: string | null, fingerprint: string): boolean {
  if (!ifNoneMatch) return false;
  const etag = `"${fingerprint}"`;
  return ifNoneMatch
    .split(",")
    .map((candidate) => candidate.trim().replace(/^W\//, ""))
    .some((candidate) => candidate === etag || candidate === "*");
}

function jsonResponse<T>(
  body: ApiPage<T> | ApiResource<T>,
  fingerprint: string,
  lastModified: string | null,
  req: Request,
): Response {
  const headers = apiHeaders(fingerprint, lastModified);
  if (etagMatches(req.headers.get("if-none-match"), fingerprint)) {
    // 304 with an EMPTY body; the validators still travel.
    return new Response(null, { status: 304, headers });
  }
  return new Response(JSON.stringify(body), { status: 200, headers });
}

/** Page-level fingerprint: derived from the serializer's per-record
 *  fingerprints and the total — an aggregate of canonical fingerprints,
 *  never a recomputation of any record's. */
function pageFingerprint(kind: string, total: number, fingerprints: string[]): string {
  return createHash("sha256")
    .update(`api-v1:${kind}:${total}:${fingerprints.join(",")}`)
    .digest("hex");
}

function latestReviewedAt(items: Array<{ reviewedAt: string }>): string | null {
  if (items.length === 0) return null;
  const max = items.map((i) => i.reviewedAt).sort().reverse()[0]!;
  return new Date(max).toUTCString();
}

// ---------- the signed API cursor ----------

export class CursorSecretUnavailableError extends Error {
  constructor() {
    super("PUBLIC_API_CURSOR_SECRET is not configured; refusing to issue or verify cursors");
    this.name = "CursorSecretUnavailableError";
  }
}

/**
 * The API cursor payload. `publishedAt` carries the record's public ordering
 * timestamp (the read layer orders reviewedAt-desc; the web cursor format
 * calls the same value `reviewedAt`). `filtersHash` pins the filter set the
 * cursor was issued under.
 */
export type ApiCursorPayload = {
  publishedAt: string;
  id: string;
  filtersHash: string;
};

function cursorSecret(): string {
  // Read at call time, not import time: tests inject their own in-process
  // value and a missing secret must fail closed at the moment of use.
  const secret = process.env.PUBLIC_API_CURSOR_SECRET;
  if (!secret) throw new CursorSecretUnavailableError();
  return secret;
}

function sign(payloadB64: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}

/** Throws CursorSecretUnavailableError when the secret is absent — fail
 *  closed, never an unsigned cursor. */
export function encodeApiCursor(payload: ApiCursorPayload): string {
  const secret = cursorSecret();
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${payloadB64}.${sign(payloadB64, secret)}`;
}

/** Null for a malformed, tampered or unsigned cursor. Throws
 *  CursorSecretUnavailableError when the secret is absent. */
export function decodeApiCursor(cursor: string): ApiCursorPayload | null {
  const secret = cursorSecret();
  const dot = cursor.indexOf(".");
  if (dot <= 0 || dot === cursor.length - 1) return null;
  const payloadB64 = cursor.slice(0, dot);
  const signature = cursor.slice(dot + 1);
  const expected = sign(payloadB64, secret);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const obj = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    if (
      typeof obj.publishedAt === "string" &&
      typeof obj.id === "string" &&
      typeof obj.filtersHash === "string"
    ) {
      return obj as ApiCursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------- list parameter parsing (strict, deterministic) ----------

export type ApiListFilters = {
  pool: "verified" | "monitored";
  signal: SignalType | null;
  platform: PlatformCode | null;
  category: ProductCategory | null;
  from: string | null;
  to: string | null;
  q: string | null;
};

const API_PLATFORMS: Record<string, PlatformCode> = {
  amazon: "AMAZON",
  "amazon-us": "AMAZON",
  shopify: "SHOPIFY",
  "shopify-us": "SHOPIFY",
};

function parseApiDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10) === value ? value : null;
}

/**
 * Hash of the filter set a cursor is issued under. `limit` is deliberately
 * excluded: it is a pagination parameter, not a filter, and changing page
 * size mid-stream must not invalidate the cursor.
 */
export function apiFiltersHash(filters: ApiListFilters): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        pool: filters.pool,
        signal: filters.signal,
        platform: filters.platform,
        category: filters.category,
        from: filters.from,
        to: filters.to,
        q: filters.q,
      }),
    )
    .digest("hex")
    .slice(0, 16);
}

type ParsedListParams = {
  filters: ApiListFilters;
  filtersHash: string;
  limit: number;
  cursor: string | null;
};

/** Strict parsing: out-of-range limits and unknown filter values are a
 *  deterministic 400, never a silent clamp or a silent default. Unknown
 *  parameters are ignored — they never reach a query. */
function parseListParams(url: URL): ParsedListParams | Response {
  const limitRaw = url.searchParams.get("limit");
  let limit = API_DEFAULT_LIMIT;
  if (limitRaw !== null) {
    const parsed = Number(limitRaw);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > API_MAX_LIMIT) {
      return apiError(
        400,
        "INVALID_LIMIT",
        `limit must be an integer between 1 and ${API_MAX_LIMIT}`,
      );
    }
    limit = parsed;
  }

  const poolRaw = url.searchParams.get("pool");
  if (poolRaw !== null && poolRaw !== "verified" && poolRaw !== "monitored") {
    return apiError(400, "INVALID_FILTER", `unknown pool: ${poolRaw}`);
  }
  const pool = poolRaw === "monitored" ? "monitored" : "verified";

  const signalRaw = url.searchParams.get("signal");
  let signal: SignalType | null = null;
  if (signalRaw !== null) {
    if (!(SIGNAL_TYPES as readonly string[]).includes(signalRaw)) {
      return apiError(400, "INVALID_FILTER", `unknown signal: ${signalRaw}`);
    }
    signal = signalRaw as SignalType;
  }

  const platformRaw = url.searchParams.get("platform");
  let platform: PlatformCode | null = null;
  if (platformRaw !== null) {
    platform = API_PLATFORMS[platformRaw.trim().toLowerCase()] ?? null;
    if (!platform) {
      return apiError(400, "INVALID_FILTER", `unknown platform: ${platformRaw}`);
    }
  }

  const categoryRaw = url.searchParams.get("category");
  let category: ProductCategory | null = null;
  if (categoryRaw !== null) {
    const parsedCategory = parseProductCategory(categoryRaw);
    if (!parsedCategory || !(PRODUCT_CATEGORIES as readonly string[]).includes(parsedCategory)) {
      return apiError(400, "INVALID_FILTER", `unknown category: ${categoryRaw}`);
    }
    category = parsedCategory;
  }

  const fromRaw = url.searchParams.get("from");
  const from = fromRaw !== null ? parseApiDate(fromRaw) : null;
  if (fromRaw !== null && from === null) {
    return apiError(400, "INVALID_FILTER", `invalid from date: ${fromRaw}`);
  }
  const toRaw = url.searchParams.get("to");
  const to = toRaw !== null ? parseApiDate(toRaw) : null;
  if (toRaw !== null && to === null) {
    return apiError(400, "INVALID_FILTER", `invalid to date: ${toRaw}`);
  }

  const qRaw = url.searchParams.get("q")?.trim() ?? "";
  if (qRaw.length > MAX_Q_LENGTH) {
    return apiError(400, "INVALID_FILTER", `q must be at most ${MAX_Q_LENGTH} characters`);
  }
  const q = qRaw === "" ? null : qRaw;

  const filters: ApiListFilters = { pool, signal, platform, category, from, to, q };
  return {
    filters,
    filtersHash: apiFiltersHash(filters),
    limit,
    cursor: url.searchParams.get("cursor"),
  };
}

// ---------- handlers ----------

/**
 * Every handler is wrapped so an UNEXPECTED failure (DB outage, driver error)
 * still answers in the documented error envelope with a stable machine code
 * — never Next's default non-JSON 500. The known fail-closed case keeps its
 * own deterministic code.
 */
function withErrorEnvelope<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof CursorSecretUnavailableError) {
        return apiError(500, "CURSOR_NOT_CONFIGURED", error.message);
      }
      console.error("api-v1 unhandled error:", error);
      return apiError(500, "INTERNAL_ERROR", "unexpected internal error");
    }
  };
}

/** Exported for the unit test that pins the fallback envelope. */
export const __withErrorEnvelopeForTest = withErrorEnvelope;

async function handleApiListChangesImpl(req: Request): Promise<Response> {
  const parsed = parseListParams(new URL(req.url));
  if (parsed instanceof Response) return parsed;
  const { filters, filtersHash, limit, cursor } = parsed;

  // Translate the public signed cursor into the internal web cursor at the
  // read-layer boundary; reject reuse under changed filters.
  let webCursor: string | null = null;
  if (cursor) {
    const payload = decodeApiCursor(cursor);
    if (!payload || payload.filtersHash !== filtersHash) {
      return apiError(400, "INVALID_CURSOR", "cursor is malformed, unsigned, or was issued under different filters");
    }
    webCursor = encodeCursor(payload.id, payload.publishedAt);
  }

  const page = await searchPublicChanges({ ...filters, limit, cursor: webCursor });

  let nextCursor: string | null = null;
  if (page.nextCursor) {
    const decoded = decodeCursor(page.nextCursor);
    if (decoded) {
      nextCursor = encodeApiCursor({
        publishedAt: decoded.reviewedAt,
        id: decoded.id,
        filtersHash,
      });
    }
  }

  const fingerprint = pageFingerprint(
    "changes",
    page.total,
    page.items.map((item) => item.fingerprint),
  );
  const body: ApiPage<CanonicalPublicRecord> = {
    apiVersion: API_VERSION,
    generatedAt: new Date().toISOString(),
    fingerprint,
    data: page.items,
    page: { nextCursor, limit },
  };
  return jsonResponse(body, fingerprint, latestReviewedAt(page.items), req);
}

export const handleApiListChanges = withErrorEnvelope(handleApiListChangesImpl);

async function handleApiGetChangeImpl(slug: string, req: Request): Promise<Response> {
  const record = await getPublicChangeBySlug(slug);
  if (!record) {
    return apiError(404, "NOT_FOUND", `no published change with slug: ${slug}`);
  }
  const body: ApiResource<CanonicalPublicRecord> = {
    apiVersion: API_VERSION,
    generatedAt: new Date().toISOString(),
    fingerprint: record.fingerprint,
    data: record,
  };
  return jsonResponse(body, record.fingerprint, new Date(record.reviewedAt).toUTCString(), req);
}

export const handleApiGetChange = withErrorEnvelope(handleApiGetChangeImpl);

async function handleApiCoverageImpl(req: Request): Promise<Response> {
  const rows = await getCoverageMatrix();
  // No per-row canonical fingerprint exists for capability rows; derive the
  // page fingerprint from the stable state projection, not the JSON bytes.
  const state = rows.map((row) => [
    row.key,
    row.readiness,
    row.lastSuccessfulCheck,
    row.sourcesWithinSla,
    row.sourceCount,
    row.overdueCount,
    row.lastContentReview,
  ]);
  const fingerprint = createHash("sha256")
    .update(`api-v1:coverage:${JSON.stringify(state)}`)
    .digest("hex");
  const lastModified =
    rows
      .flatMap((row) => [row.lastSuccessfulCheck, row.lastContentReview])
      .filter((v): v is string => v != null)
      .sort()
      .reverse()[0] ?? null;
  const body: ApiPage<(typeof rows)[number]> = {
    apiVersion: API_VERSION,
    generatedAt: new Date().toISOString(),
    fingerprint,
    data: rows,
    page: { nextCursor: null, limit: rows.length },
  };
  return jsonResponse(body, fingerprint, lastModified ? new Date(lastModified).toUTCString() : null, req);
}

export const handleApiCoverage = withErrorEnvelope(handleApiCoverageImpl);

async function handleApiBriefingsImpl(req: Request): Promise<Response> {
  const briefings = await listPublishedBriefings();
  // Derived from the accepted summaries' stable identity fields — a briefing
  // is immutable once published, so slug/publishedAt/entryCount change
  // exactly when the published set changes. Nothing is recomputed.
  const fingerprint = createHash("sha256")
    .update(
      `api-v1:briefings:${briefings.length}:` +
        briefings.map((b) => `${b.slug}@${b.publishedAt}#${b.entryCount}`).join(","),
    )
    .digest("hex");
  const lastModified = briefings.map((b) => b.publishedAt).sort().reverse()[0] ?? null;
  const body: ApiPage<(typeof briefings)[number]> = {
    apiVersion: API_VERSION,
    generatedAt: new Date().toISOString(),
    fingerprint,
    data: briefings,
    page: { nextCursor: null, limit: briefings.length },
  };
  return jsonResponse(body, fingerprint, lastModified ? new Date(lastModified).toUTCString() : null, req);
}

export const handleApiBriefings = withErrorEnvelope(handleApiBriefingsImpl);

/** Cheap content-state probe: one count + one top-row read through the
 *  accepted query layer. Lets a client poll for change without transferring
 *  a single record. Observes the whole public stream (MONITORED and
 *  VERIFIED), so totalRecords can exceed a default verified-pool list. */
async function handleApiFingerprintImpl(req: Request): Promise<Response> {
  const page = await listPublicChanges({ pool: "monitored", limit: 1 });
  const latest = page.items[0] ?? null;
  const fingerprint = createHash("sha256")
    .update(`api-v1:state:${page.total}:${latest?.fingerprint ?? "empty"}`)
    .digest("hex");
  const body: ApiResource<{
    totalRecords: number;
    latestReviewedAt: string | null;
    latestFingerprint: string | null;
  }> = {
    apiVersion: API_VERSION,
    generatedAt: new Date().toISOString(),
    fingerprint,
    data: {
      totalRecords: page.total,
      latestReviewedAt: latest?.reviewedAt ?? null,
      latestFingerprint: latest?.fingerprint ?? null,
    },
  };
  return jsonResponse(body, fingerprint, latest ? new Date(latest.reviewedAt).toUTCString() : null, req);
}

export const handleApiFingerprint = withErrorEnvelope(handleApiFingerprintImpl);

// ---------- OpenAPI 3.1 ----------

const CHANGE_SCHEMA = {
  type: "object",
  required: [
    "id", "slug", "versionId", "version", "fingerprint", "title", "summary",
    "signalType", "market", "readiness", "permalink", "reviewedAt", "evidence",
    "correctionHistory",
  ],
  properties: {
    id: { type: "string" },
    slug: { type: "string" },
    versionId: { type: "string", description: "Unique ID of this published version; the stable record identity." },
    version: { type: "integer" },
    fingerprint: { type: "string", description: "sha256 of the version identity; changes exactly when the record changes." },
    title: { type: "string" },
    summary: { type: "string" },
    signalType: { type: "string", enum: [...SIGNAL_TYPES] },
    market: { type: "string", enum: ["US"] },
    regions: { type: "array", items: { type: "string" } },
    platforms: { type: "array", items: { type: "string", enum: ["AMAZON", "SHOPIFY"] } },
    operatingStages: { type: "array", items: { type: "string" } },
    productCategories: { type: "array", items: { type: "string", enum: [...PRODUCT_CATEGORIES] } },
    riskAttributes: { type: "array", items: { type: "string" } },
    policyTopics: { type: "array", items: { type: "string" } },
    sourcePublishedAt: { type: "string", format: "date-time" },
    effectiveAt: { type: ["string", "null"], format: "date-time" },
    urgency: { type: "integer" },
    readiness: { type: "string", enum: ["MONITORED", "VERIFIED"] },
    generalImpact: { type: "string" },
    generalActionTemplate: { type: ["string", "null"] },
    permalink: { type: "string", format: "uri", description: "Canonical attribution: cite this page for every claim about the record." },
    reviewedAt: { type: "string", format: "date-time" },
    evidence: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sourceId: { type: "string" },
          sourceName: { type: "string" },
          url: { type: "string", format: "uri", description: "Official evidence link — verify important policy facts here, not in the summary." },
          role: { type: "string", enum: ["PRIMARY_OFFICIAL", "SUPPORTING_OFFICIAL", "SECONDARY_CONTEXT"] },
          authorityLevel: { type: "string" },
          publishedAt: { type: ["string", "null"], format: "date-time" },
          normalizedSummary: { type: "string" },
          reviewedAt: { type: ["string", "null"], format: "date-time" },
        },
      },
    },
    correctionHistory: {
      type: "array",
      items: {
        type: "object",
        properties: {
          version: { type: "integer" },
          correctionReason: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
    },
  },
} as const;

const ERROR_SCHEMA = {
  type: "object",
  required: ["apiVersion", "error"],
  properties: {
    apiVersion: { type: "string", enum: [API_VERSION] },
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: {
          type: "string",
          enum: ["INVALID_LIMIT", "INVALID_FILTER", "INVALID_CURSOR", "NOT_FOUND", "CURSOR_NOT_CONFIGURED", "INTERNAL_ERROR"],
        },
        message: { type: "string" },
      },
    },
  },
} as const;

function apiPageSchema(itemRef: string) {
  return {
    type: "object",
    required: ["apiVersion", "generatedAt", "fingerprint", "data", "page"],
    properties: {
      apiVersion: { type: "string", enum: [API_VERSION] },
      generatedAt: { type: "string", format: "date-time" },
      fingerprint: { type: "string", description: "Content fingerprint of this page; also the ETag." },
      data: { type: "array", items: { $ref: itemRef } },
      page: {
        type: "object",
        required: ["nextCursor", "limit"],
        properties: {
          nextCursor: {
            type: ["string", "null"],
            description: "Opaque HMAC-signed cursor. Valid only under the exact filter set it was issued with; reuse under changed filters returns 400 INVALID_CURSOR.",
          },
          limit: { type: "integer" },
        },
      },
    },
  };
}

function apiResourceSchema(itemRef: string) {
  return {
    type: "object",
    required: ["apiVersion", "generatedAt", "fingerprint", "data"],
    properties: {
      apiVersion: { type: "string", enum: [API_VERSION] },
      generatedAt: { type: "string", format: "date-time" },
      fingerprint: { type: "string" },
      data: { $ref: itemRef },
    },
  };
}

const JSON_HEADERS = {
  ETag: { schema: { type: "string" }, description: "Derived from the content fingerprint; send back as If-None-Match for a 304." },
  "Last-Modified": { schema: { type: "string" } },
  "Cache-Control": { schema: { type: "string" } },
} as const;

function errorResponses(codes: string[]) {
  const byStatus = new Map<string, string[]>();
  for (const code of codes) {
    const status = code === "NOT_FOUND" ? "404" : code === "CURSOR_NOT_CONFIGURED" || code === "INTERNAL_ERROR" ? "500" : "400";
    byStatus.set(status, [...(byStatus.get(status) ?? []), code]);
  }
  const out: Record<string, unknown> = {};
  for (const [status, statusCodes] of byStatus) {
    out[status] = {
      description: `Error envelope — one of: ${statusCodes.join(", ")}`,
      content: { "application/json": { schema: { $ref: "#/components/schemas/ApiError" } } },
    };
  }
  return out;
}

/** The OpenAPI 3.1 document. Public DTOs only — no private model is named
 *  here, and test/public-api-v1.test.ts asserts that over the string. */
export function openApiDocument(): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "TradeLinks Public Intelligence API",
      version: "1.0.0",
      description:
        "Anonymous, read-only API for canonical, evidence-backed US market policy changes for cross-border sellers. " +
        "Every record carries its canonical permalink (cite it) and official evidence links (verify against them). " +
        "All list responses are ETag-cached; send If-None-Match for a 304.",
    },
    servers: [{ url: "https://tradelinks.us" }],
    paths: {
      "/api/v1/changes": {
        get: {
          summary: "List canonical changes, filtered and paginated",
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: API_MAX_LIMIT, default: API_DEFAULT_LIMIT }, description: "Out-of-range is a 400, never a silent clamp." },
            { name: "cursor", in: "query", schema: { type: "string" }, description: "Opaque signed cursor from a previous page's nextCursor." },
            { name: "pool", in: "query", schema: { type: "string", enum: ["verified", "monitored"], default: "verified" } },
            { name: "signal", in: "query", schema: { type: "string", enum: [...SIGNAL_TYPES] } },
            { name: "platform", in: "query", schema: { type: "string", enum: ["amazon", "amazon-us", "shopify", "shopify-us"] } },
            { name: "category", in: "query", schema: { type: "string" }, description: "Category slug, e.g. pet-supplies." },
            { name: "from", in: "query", schema: { type: "string", format: "date" }, description: "Inclusive effective-date lower bound." },
            { name: "to", in: "query", schema: { type: "string", format: "date" }, description: "Inclusive effective-date upper bound." },
            { name: "q", in: "query", schema: { type: "string", maxLength: MAX_Q_LENGTH }, description: "Case-insensitive title/summary scan." },
          ],
          responses: {
            "200": {
              description: "A page of canonical changes",
              headers: JSON_HEADERS,
              content: { "application/json": { schema: apiPageSchema("#/components/schemas/Change") } },
            },
            "304": { description: "Not modified — empty body" },
            ...errorResponses(["INVALID_LIMIT", "INVALID_FILTER", "INVALID_CURSOR", "CURSOR_NOT_CONFIGURED", "INTERNAL_ERROR"]),
          },
        },
      },
      "/api/v1/changes/{slug}": {
        get: {
          summary: "One canonical change by slug",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": {
              description: "The canonical record",
              headers: JSON_HEADERS,
              content: { "application/json": { schema: apiResourceSchema("#/components/schemas/Change") } },
            },
            "304": { description: "Not modified — empty body" },
            ...errorResponses(["NOT_FOUND", "INTERNAL_ERROR"]),
          },
        },
      },
      "/api/v1/coverage": {
        get: {
          summary: "The public coverage matrix — what TradeLinks monitors, at what readiness",
          responses: {
            "200": {
              description: "Coverage rows, worst coverage first",
              headers: JSON_HEADERS,
              content: { "application/json": { schema: apiPageSchema("#/components/schemas/CoverageRow") } },
            },
            "304": { description: "Not modified — empty body" },
            ...errorResponses(["INTERNAL_ERROR"]),
          },
        },
      },
      "/api/v1/briefings": {
        get: {
          summary: "Published briefings (weekly, monthly, conditional daily)",
          responses: {
            "200": {
              description: "Published briefing summaries",
              headers: JSON_HEADERS,
              content: { "application/json": { schema: apiPageSchema("#/components/schemas/BriefingSummary") } },
            },
            "304": { description: "Not modified — empty body" },
            ...errorResponses(["INTERNAL_ERROR"]),
          },
        },
      },
      "/api/v1/fingerprint": {
        get: {
          summary: "Cheap content-state probe — poll for change without transferring records",
          description:
            "Observes the whole public stream (MONITORED and VERIFIED), so totalRecords can exceed a default verified-pool /api/v1/changes list.",
          responses: {
            "200": {
              description: "Content-state fingerprint",
              headers: JSON_HEADERS,
              content: { "application/json": { schema: apiResourceSchema("#/components/schemas/ContentState") } },
            },
            "304": { description: "Not modified — empty body" },
            ...errorResponses(["INTERNAL_ERROR"]),
          },
        },
      },
    },
    components: {
      schemas: {
        Change: CHANGE_SCHEMA,
        CoverageRow: {
          type: "object",
          properties: {
            key: { type: "string" },
            kind: { type: "string", enum: ["market", "platform", "category", "demand"] },
            label: { type: "string" },
            readiness: { type: "string", enum: ["UNAVAILABLE", "STALE", "EXPERIMENTAL", "MONITORED", "VERIFIED"] },
            summary: { type: "string" },
            knownGaps: { type: "array", items: { type: "string" } },
            slaMinutes: { type: ["integer", "null"] },
            lastSuccessfulCheck: { type: ["string", "null"], format: "date-time" },
            sourcesWithinSla: { type: "integer" },
            sourceCount: { type: "integer" },
            overdueCount: { type: "integer" },
            lastContentReview: { type: ["string", "null"], format: "date-time" },
          },
        },
        BriefingSummary: {
          type: "object",
          properties: {
            kind: { type: "string", enum: ["WEEKLY", "MONTHLY", "DAILY"] },
            periodKey: { type: "string" },
            slug: { type: "string" },
            title: { type: "string" },
            summary: { type: "string" },
            readiness: { type: "string", enum: ["MONITORED", "VERIFIED"] },
            publishedAt: { type: "string", format: "date-time" },
            entryCount: { type: "integer" },
            path: { type: "string", description: "Canonical page path for this briefing." },
          },
        },
        ContentState: {
          type: "object",
          properties: {
            totalRecords: { type: "integer" },
            latestReviewedAt: { type: ["string", "null"], format: "date-time" },
            latestFingerprint: { type: ["string", "null"] },
          },
        },
        ApiError: ERROR_SCHEMA,
      },
    },
  };
}
