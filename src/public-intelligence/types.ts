/**
 * Phase 1 Public Intelligence DTOs — single read-model contract for all public
 * channels (pages, RSS, API, Telegram, briefings).
 */

import type {
  AuthorityLevel,
  EvidenceRole,
  EditorialStatus,
  MarketCode,
  OperatingStage,
  PlatformCode,
  PolicyTopic,
  ProductCategory,
  ReadinessLevel,
  RiskAttribute,
  SignalType,
} from "@prisma/client";

export type CanonicalPublicRecord = {
  id: string;
  slug: string;
  versionId: string;
  version: number;
  fingerprint: string;
  title: string;
  summary: string;
  signalType: SignalType;
  market: "US";
  regions: string[];
  platforms: PlatformCode[];
  operatingStages: OperatingStage[];
  productCategories: ProductCategory[];
  riskAttributes: RiskAttribute[];
  policyTopics: PolicyTopic[];
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
    role: EvidenceRole;
    authorityLevel: AuthorityLevel;
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
  editorialStatus: EditorialStatus;
  readiness: ReadinessLevel;
  reviewedAt: Date | null;
  title: string;
  summary: string;
  signalType: SignalType;
  market: MarketCode;
  regions: string[];
  platforms: PlatformCode[];
  operatingStages: OperatingStage[];
  productCategories: ProductCategory[];
  riskAttributes: RiskAttribute[];
  policyTopics: PolicyTopic[];
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
      editorialStatus: EditorialStatus;
    }>;
  };
  evidence: Array<{
    sourceId: string;
    source: { name: string };
    url: string;
    role: EvidenceRole;
    authorityLevel: AuthorityLevel;
    publishedAt: Date | null;
    normalizedSummary: string;
    reviewedAt: Date | null;
  }>;
};
