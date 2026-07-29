/**
 * Canonical public serializer — one DTO shape, one visibility policy.
 *
 * All later public channels (web, RSS, API, Telegram, briefings) consume
 * CanonicalPublicRecord. The serializer enforces the visibility invariant
 * in code, not in the caller.
 */

import { createHash } from "node:crypto";

import type { CanonicalPublicRecord, VersionWithEvidence } from "./types.js";

const PUBLIC_READINESS: ReadonlySet<string> = new Set(["MONITORED", "VERIFIED"]);

export class SerializationError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "SerializationError";
  }
}

export function assertPublicVersion(
  version: Pick<VersionWithEvidence, "isCurrent" | "editorialStatus" | "readiness" | "reviewedAt">,
): void {
  if (!version.isCurrent) {
    throw new SerializationError(
      "NOT_CURRENT",
      "non-current versions are not publicly visible",
    );
  }
  if (version.editorialStatus !== "PUBLISHED") {
    throw new SerializationError(
      "NOT_PUBLISHED",
      `version has editorialStatus ${version.editorialStatus}, expected PUBLISHED`,
    );
  }
  if (version.reviewedAt == null) {
    throw new SerializationError(
      "NOT_REVIEWED",
      "version has not been reviewed",
    );
  }
  if (!PUBLIC_READINESS.has(version.readiness)) {
    throw new SerializationError(
      "NOT_PUBLIC_READINESS",
      `version readiness is ${version.readiness}, must be MONITORED or VERIFIED`,
    );
  }
}

export function serializeCanonicalVersion(
  version: VersionWithEvidence,
): CanonicalPublicRecord {
  assertPublicVersion(version);

  const permalink = `https://tradelinks.us/changes/${version.canonicalChange.slug}`;
  const fingerprint = createHash("sha256")
    .update(`${version.id}|${version.version}|${version.updatedAt.toISOString()}`)
    .digest("hex");

  const orderedEvidence = [...version.evidence].sort((a, b) => {
    const roleOrder: Record<string, number> = {
      PRIMARY_OFFICIAL: 0,
      SUPPORTING_OFFICIAL: 1,
      SECONDARY_CONTEXT: 2,
    };
    const aRole = roleOrder[a.role] ?? 99;
    const bRole = roleOrder[b.role] ?? 99;
    if (aRole !== bRole) return aRole - bRole;
    // Within the same role, more recent publishedAt first, nulls last
    const aPub = a.publishedAt?.getTime() ?? 0;
    const bPub = b.publishedAt?.getTime() ?? 0;
    return bPub - aPub;
  });

  const correctionHistory = version.canonicalChange.versions
    .filter((v) => v.correctionReason != null)
    .map((v) => ({
      version: v.version,
      correctionReason: v.correctionReason!,
      createdAt: v.createdAt.toISOString(),
    }))
    .sort((a, b) => a.version - b.version);

  return {
    id: version.canonicalChange.id,
    slug: version.canonicalChange.slug,
    versionId: version.id,
    version: version.version,
    fingerprint,
    title: version.title,
    summary: version.summary,
    signalType: version.signalType,
    market: version.market as "US",
    regions: version.regions,
    platforms: version.platforms,
    operatingStages: version.operatingStages,
    productCategories: version.productCategories,
    riskAttributes: version.riskAttributes,
    policyTopics: version.policyTopics,
    sourcePublishedAt: version.sourcePublishedAt.toISOString(),
    effectiveAt: version.effectiveAt?.toISOString() ?? null,
    urgency: version.urgency,
    readiness: version.readiness as "MONITORED" | "VERIFIED",
    generalImpact: version.generalImpact,
    generalActionTemplate: version.generalActionTemplate,
    permalink,
    reviewedAt: version.reviewedAt!.toISOString(),
    evidence: orderedEvidence.map((e) => ({
      sourceId: e.sourceId,
      sourceName: e.source.name,
      url: e.url,
      role: e.role,
      authorityLevel: e.authorityLevel,
      publishedAt: e.publishedAt?.toISOString() ?? null,
      normalizedSummary: e.normalizedSummary,
      reviewedAt: e.reviewedAt?.toISOString() ?? null,
    })),
    correctionHistory,
  };
}
