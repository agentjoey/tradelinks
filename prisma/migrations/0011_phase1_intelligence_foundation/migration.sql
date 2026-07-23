-- CreateEnum
CREATE TYPE "MarketCode" AS ENUM ('US');

-- CreateEnum
CREATE TYPE "PlatformCode" AS ENUM ('AMAZON', 'SHOPIFY');

-- CreateEnum
CREATE TYPE "OperatingStage" AS ENUM ('EXPLORING_US', 'PREPARING_TO_LAUNCH', 'ALREADY_SELLING');

-- CreateEnum
CREATE TYPE "SignalType" AS ENUM ('REGULATORY', 'PLATFORM_POLICY', 'LOGISTICS', 'DEMAND', 'INDUSTRY', 'PRACTICAL_GUIDANCE');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('ALL_PRODUCTS', 'CONSUMER_ELECTRONICS', 'PET_SUPPLIES', 'BEAUTY_PERSONAL_CARE', 'TOYS_CHILDRENS_PRODUCTS', 'HOME_KITCHEN', 'APPAREL_ACCESSORIES', 'HEALTH_SUPPLEMENTS', 'FOOD_BEVERAGE', 'SPORTS_OUTDOORS', 'AUTOMOTIVE_TOOLS');

-- CreateEnum
CREATE TYPE "RiskAttribute" AS ENUM ('BATTERY', 'WIRELESS_RADIO', 'CHILDREN', 'INGESTIBLE', 'TOPICAL_COSMETIC', 'FOOD_CONTACT', 'MEDICAL_CLAIM', 'ANIMAL_HEALTH', 'CHEMICAL_HAZMAT', 'TEXTILE_LABELING', 'ELECTRICAL_SAFETY');

-- CreateEnum
CREATE TYPE "PolicyTopic" AS ENUM ('IMPORT_CUSTOMS', 'PRODUCT_SAFETY_RECALLS', 'LABELING_CLAIMS', 'FEES_PAYMENTS', 'PRIVACY_CONSUMER_PROTECTION', 'LISTING_ACCOUNT_HEALTH');

-- CreateEnum
CREATE TYPE "ReadinessLevel" AS ENUM ('UNAVAILABLE', 'EXPERIMENTAL', 'MONITORED', 'VERIFIED', 'STALE');

-- CreateEnum
CREATE TYPE "EvidenceRole" AS ENUM ('PRIMARY_OFFICIAL', 'SUPPORTING_OFFICIAL', 'SECONDARY_CONTEXT');

-- CreateEnum
CREATE TYPE "AuthorityLevel" AS ENUM ('GOVERNMENT_OFFICIAL', 'PLATFORM_OFFICIAL', 'INDUSTRY_OFFICIAL', 'REPUTABLE_SECONDARY', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "EvidenceAccess" AS ENUM ('PUBLIC', 'RESTRICTED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "EditorialStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'PUBLISHED', 'REJECTED', 'RETRACTED');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'SUCCEEDED_EMPTY', 'SUCCEEDED_ITEMS', 'PARTIAL', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PipelineJobType" AS ENUM ('COLLECT', 'CANONICALIZE', 'PUBLISH', 'BRIEFING', 'EMAIL', 'HEALTH');

-- NOTE: do NOT drop the pg_trgm GIN indexes from 0002 (Prisma's migrate diff
-- doesn't know about raw-SQL indexes and tries to drop them — removed here,
-- same as 0003_image_url). This migration is additive only.

-- AlterTable
ALTER TABLE "sources" ADD COLUMN     "authorityLevel" "AuthorityLevel",
ADD COLUMN     "degradationPolicy" TEXT,
ADD COLUMN     "fetchMethod" TEXT,
ADD COLUMN     "freshnessSlaMinutes" INTEGER,
ADD COLUMN     "lastReviewedAt" TIMESTAMP(3),
ADD COLUMN     "readiness" "ReadinessLevel",
ADD COLUMN     "readinessReason" TEXT,
ADD COLUMN     "userPromise" TEXT;

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "jobType" "PipelineJobType" NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" "RunStatus" NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "outputFingerprint" TEXT,
    "metadata" JSONB,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "runnerVersion" TEXT NOT NULL,

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SourceCheck" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "httpStatus" INTEGER,
    "contentHash" TEXT,
    "failureCode" TEXT,
    "error" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceCluster" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "status" "EditorialStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EvidenceCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceClusterMember" (
    "clusterId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "role" "EvidenceRole" NOT NULL,

    CONSTRAINT "EvidenceClusterMember_pkey" PRIMARY KEY ("clusterId","itemId")
);

-- CreateTable
CREATE TABLE "CanonicalChange" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CanonicalChangeVersion" (
    "id" TEXT NOT NULL,
    "canonicalChangeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT false,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "signalType" "SignalType" NOT NULL,
    "market" "MarketCode" NOT NULL DEFAULT 'US',
    "regions" TEXT[],
    "platforms" "PlatformCode"[],
    "operatingStages" "OperatingStage"[],
    "productCategories" "ProductCategory"[],
    "riskAttributes" "RiskAttribute"[],
    "policyTopics" "PolicyTopic"[],
    "sourcePublishedAt" TIMESTAMP(3) NOT NULL,
    "effectiveAt" TIMESTAMP(3),
    "urgency" INTEGER NOT NULL,
    "readiness" "ReadinessLevel" NOT NULL,
    "generalImpact" TEXT NOT NULL,
    "generalActionTemplate" TEXT,
    "actionTemplateReviewedAt" TIMESTAMP(3),
    "actionTemplateReviewedBy" TEXT,
    "editorialStatus" "EditorialStatus" NOT NULL DEFAULT 'DRAFT',
    "correctionReason" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CanonicalChangeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceRecord" (
    "id" TEXT NOT NULL,
    "changeVersionId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceItemId" TEXT,
    "url" TEXT NOT NULL,
    "role" "EvidenceRole" NOT NULL,
    "authorityLevel" "AuthorityLevel" NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "access" "EvidenceAccess" NOT NULL,
    "licenseNote" TEXT NOT NULL,
    "excerpt" TEXT,
    "normalizedSummary" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "retractedAt" TIMESTAMP(3),

    CONSTRAINT "EvidenceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoverageCapability" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "market" "MarketCode" NOT NULL,
    "platform" "PlatformCode",
    "category" "ProductCategory",
    "readiness" "ReadinessLevel" NOT NULL,
    "summary" TEXT NOT NULL,
    "knownGaps" TEXT[],
    "lastReviewedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CoverageCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CapabilitySource" (
    "capabilityId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,

    CONSTRAINT "CapabilitySource_pkey" PRIMARY KEY ("capabilityId","sourceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PipelineRun_jobType_scopeKey_scheduledFor_key" ON "PipelineRun"("jobType", "scopeKey", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "SourceCheck_runId_sourceId_key" ON "SourceCheck"("runId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceCluster_fingerprint_key" ON "EvidenceCluster"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalChange_slug_key" ON "CanonicalChange"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalChange_clusterId_key" ON "CanonicalChange"("clusterId");

-- CreateIndex
CREATE UNIQUE INDEX "CanonicalChangeVersion_canonicalChangeId_version_key" ON "CanonicalChangeVersion"("canonicalChangeId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceRecord_changeVersionId_url_key" ON "EvidenceRecord"("changeVersionId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "CoverageCapability_key_key" ON "CoverageCapability"("key");

-- AddForeignKey
ALTER TABLE "SourceCheck" ADD CONSTRAINT "SourceCheck_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PipelineRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SourceCheck" ADD CONSTRAINT "SourceCheck_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceClusterMember" ADD CONSTRAINT "EvidenceClusterMember_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "EvidenceCluster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceClusterMember" ADD CONSTRAINT "EvidenceClusterMember_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalChange" ADD CONSTRAINT "CanonicalChange_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "EvidenceCluster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CanonicalChangeVersion" ADD CONSTRAINT "CanonicalChangeVersion_canonicalChangeId_fkey" FOREIGN KEY ("canonicalChangeId") REFERENCES "CanonicalChange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRecord" ADD CONSTRAINT "EvidenceRecord_changeVersionId_fkey" FOREIGN KEY ("changeVersionId") REFERENCES "CanonicalChangeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRecord" ADD CONSTRAINT "EvidenceRecord_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceRecord" ADD CONSTRAINT "EvidenceRecord_sourceItemId_fkey" FOREIGN KEY ("sourceItemId") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilitySource" ADD CONSTRAINT "CapabilitySource_capabilityId_fkey" FOREIGN KEY ("capabilityId") REFERENCES "CoverageCapability"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CapabilitySource" ADD CONSTRAINT "CapabilitySource_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex: at most one current version per canonical change (forward-only
-- publication invariant; not expressible in the Prisma datamodel, so added as
-- raw SQL like 0002's trigram indexes).
CREATE UNIQUE INDEX "CanonicalChangeVersion_one_current"
ON "CanonicalChangeVersion" ("canonicalChangeId")
WHERE "isCurrent" = true;
