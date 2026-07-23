/**
 * Phase 1 explicit source contracts.
 *
 * Every schedulable source is a product contract: authority, access,
 * collection method, refresh, freshness SLA, degradation policy, and the
 * exact user promise — not just a crawler setting. Rows implement the
 * Source Readiness Matrix in
 * docs/superpowers/plans/2026-07-23-tradelinks-phase1-foundation.md.
 */

import { z } from "zod";
import { AuthorityLevel, EvidenceAccess, MarketCode, PlatformCode } from "@prisma/client";

import { RawItemSchema } from "../../queue/schemas.js";
import { PRODUCT_CATEGORIES, READINESS_LEVELS } from "./taxonomy.js";

/** How a source is collected. PAGE_DIFF = content-hash change detection (no items). */
export const FETCH_METHODS = ["RSS", "JSON", "HTML", "SCRAPER", "PAGE_DIFF"] as const;
export type FetchMethod = (typeof FETCH_METHODS)[number];

export const SourceContractSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** Canonical fetch URL (the plan's official allowlist where listed). */
    url: z.string().url(),
    market: z.nativeEnum(MarketCode),
    platforms: z.array(z.nativeEnum(PlatformCode)),
    categories: z.array(z.enum(PRODUCT_CATEGORIES)).min(1),
    authorityLevel: z.nativeEnum(AuthorityLevel),
    readiness: z.enum(READINESS_LEVELS),
    /** Access class of the underlying evidence (public page, restricted, …). */
    access: z.nativeEnum(EvidenceAccess),
    /** Licensing basis for storing/linking this source's content. */
    license: z.string().min(1),
    fetchMethod: z.enum(FETCH_METHODS),
    /**
     * True only when this source's items may serve as reviewed primary
     * evidence. Secondary reporting, openFDA discovery, and page-diff
     * monitoring can never satisfy the primary-evidence invariant.
     */
    primaryEvidenceEligible: z.boolean(),
    /** Minutes after which an overdue source is Stale. Null = no schedule. */
    freshnessSlaMinutes: z.number().int().positive().nullable(),
    refreshCron: z.string().min(1).nullable(),
    degradationPolicy: z.string().min(1),
    userPromise: z.string().min(1),
    enabled: z.boolean(),
    /**
     * Immutable offline parser fixture under test/fixtures/sources/.
     * Required for every enabled source: a parser without a fixture cannot
     * be scheduled.
     */
    fixture: z.string().min(1).nullable(),
    /** CSS selectors for HTML/SCRAPER/PAGE_DIFF parsing (cheerio contract). */
    selectors: z.record(z.string()).optional(),
    note: z.string().optional(),
  })
  .superRefine((source, ctx) => {
    if (!source.enabled) return;
    if (source.freshnessSlaMinutes === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "enabled source needs a freshness SLA" });
    }
    if (source.refreshCron === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "enabled source needs a refresh cron" });
    }
    if (source.fixture === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "enabled source needs an immutable fixture" });
    }
  });

export type SourceContract = z.infer<typeof SourceContractSchema>;

/**
 * Structured result of one source fetch. A successful empty response stays
 * `success` (an empty official feed is not a failure); blocked/failed
 * outcomes preserve a machine-readable code and retryability.
 */
export const FetchOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("success"),
    items: z.array(RawItemSchema),
    httpStatus: z.number().int(),
    contentHash: z.string().min(1),
  }),
  z.object({
    kind: z.enum(["blocked", "failed"]),
    code: z.string().min(1),
    retryable: z.boolean(),
    httpStatus: z.number().int().optional(),
  }),
]);
export type FetchOutcome = z.infer<typeof FetchOutcomeSchema>;

/**
 * May this source's items serve as reviewed primary evidence? Only
 * first-party official sources with the flag set; secondary reporting,
 * discovery feeds, and page-diff monitoring never can.
 */
export function canSatisfyPrimaryEvidence(source: SourceContract): boolean {
  if (!source.primaryEvidenceEligible) return false;
  return (
    source.authorityLevel === AuthorityLevel.GOVERNMENT_OFFICIAL ||
    source.authorityLevel === AuthorityLevel.PLATFORM_OFFICIAL ||
    source.authorityLevel === AuthorityLevel.INDUSTRY_OFFICIAL
  );
}
