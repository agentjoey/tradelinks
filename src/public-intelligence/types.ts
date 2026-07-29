/**
 * Phase 1 Public Intelligence DTOs — single read-model contract for all public
 * channels (pages, RSS, API, Telegram, briefings).
 */

export type CanonicalPublicRecord = {
  id: string;
  slug: string;
  versionId: string;
  version: number;
  fingerprint: string;
  title: string;
  summary: string;
  signalType: string;
  market: "US";
  regions: string[];
  platforms: string[];
  operatingStages: string[];
  productCategories: string[];
  riskAttributes: string[];
  policyTopics: string[];
  sourcePublishedAt: string;
  effectiveAt: string | null;
  urgency: number;
  readiness: "MONITORED" | "VERIFIED";
  generalImpact: string;
  generalActionTemplate: string | null;
  permalink: string;
  reviewedAt: string;
  evidence: Array<{
    sourceId: string;
    sourceName: string;
    url: string;
    role: string;
    authorityLevel: string;
    publishedAt: string | null;
    normalizedSummary: string;
    reviewedAt: string | null;
  }>;
  correctionHistory: Array<{
    version: number;
    correctionReason: string;
    createdAt: string;
  }>;
};

export type PublicFilters = {
  pool: "verified" | "monitored";
  limit: number;
  cursor?: string;
};

export type PublicPage = {
  items: CanonicalPublicRecord[];
  nextCursor: string | null;
  total: number;
};

export type VersionWithEvidence = {
  id: string;
  version: number;
  updatedAt: Date;
  isCurrent: boolean;
  editorialStatus: string;
  readiness: string;
  reviewedAt: Date | null;
  title: string;
  summary: string;
  signalType: string;
  market: string;
  regions: string[];
  platforms: string[];
  operatingStages: string[];
  productCategories: string[];
  riskAttributes: string[];
  policyTopics: string[];
  sourcePublishedAt: Date;
  effectiveAt: Date | null;
  urgency: number;
  generalImpact: string;
  generalActionTemplate: string | null;
  canonicalChange: {
    id: string;
    slug: string;
    versions: Array<{
      version: number;
      correctionReason: string | null;
      createdAt: Date;
    }>;
  };
  evidence: Array<{
    sourceId: string;
    source: { name: string };
    url: string;
    role: string;
    authorityLevel: string;
    publishedAt: Date | null;
    normalizedSummary: string;
    reviewedAt: Date | null;
  }>;
};
