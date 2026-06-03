-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Region" AS ENUM ('north_america', 'europe', 'southeast_asia', 'middle_east', 'latin_america', 'australia_nz');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('regulatory', 'platform_policy', 'logistics', 'trend', 'industry', 'tip');

-- CreateEnum
CREATE TYPE "Adapter" AS ENUM ('rss', 'fetch', 'scrapling');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('raw', 'processed', 'filtered', 'failed');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('pending_review', 'published', 'rejected');

-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('free', 'pro', 'team', 'enterprise');

-- CreateEnum
CREATE TYPE "PushChannel" AS ENUM ('email', 'telegram', 'slack');

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "adapter" "Adapter" NOT NULL,
    "frequencyCron" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "regions" "Region"[],
    "platforms" TEXT[],
    "categoryHint" "Category",
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastCrawledAt" TIMESTAMP(3),
    "lastOkAt" TIMESTAMP(3),
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "urlHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEn" TEXT,
    "summaryEn" TEXT,
    "rawContent" JSONB,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "crawledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ItemStatus" NOT NULL DEFAULT 'raw',
    "regions" "Region"[],
    "platforms" TEXT[],
    "category" "Category",
    "lang" TEXT NOT NULL,
    "isDuplicate" BOOLEAN NOT NULL DEFAULT false,
    "clusterId" TEXT,
    "urgencyScore" DOUBLE PRECISION,
    "impactScope" TEXT,
    "recommendation" TEXT,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clusters" (
    "id" TEXT NOT NULL,
    "representativeItemId" TEXT NOT NULL,
    "sourceUrls" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clusters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" TEXT NOT NULL,
    "clusterId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "urgencyScore" DOUBLE PRECISION NOT NULL,
    "regions" "Region"[],
    "platforms" TEXT[],
    "category" "Category" NOT NULL,
    "affectedSkus" TEXT[],
    "actionRequired" TEXT,
    "sourceUrls" TEXT[],
    "status" "AlertStatus" NOT NULL DEFAULT 'pending_review',
    "publishedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_snapshots" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "region" "Region" NOT NULL,
    "category" "Category",
    "keyword" TEXT NOT NULL,
    "rankAmazonBsr" INTEGER,
    "trendsScoreGoogle" INTEGER,
    "tiktokMentionCount" INTEGER,
    "signalStrength" DOUBLE PRECISION,

    CONSTRAINT "trend_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trend_signals" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "originRegion" "Region" NOT NULL,
    "spreadingTo" "Region"[],
    "confidence" DOUBLE PRECISION NOT NULL,
    "signalBasis" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trend_signals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tier" "Tier" NOT NULL DEFAULT 'free',
    "stripeCustomerId" TEXT,
    "subRegions" "Region"[],
    "subPlatforms" TEXT[],
    "subCategories" "Category"[],
    "pushChannels" "PushChannel"[],
    "telegramChatId" TEXT,
    "slackWebhookUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "keyword_watches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_watches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "items_url_key" ON "items"("url");

-- CreateIndex
CREATE UNIQUE INDEX "items_urlHash_key" ON "items"("urlHash");

-- CreateIndex
CREATE INDEX "items_sourceId_crawledAt_idx" ON "items"("sourceId", "crawledAt");

-- CreateIndex
CREATE INDEX "items_status_idx" ON "items"("status");

-- CreateIndex
CREATE INDEX "items_publishedAt_idx" ON "items"("publishedAt");

-- CreateIndex
CREATE INDEX "items_clusterId_idx" ON "items"("clusterId");

-- CreateIndex
CREATE INDEX "alerts_status_urgencyScore_idx" ON "alerts"("status", "urgencyScore");

-- CreateIndex
CREATE INDEX "alerts_publishedAt_idx" ON "alerts"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "trend_snapshots_date_region_keyword_key" ON "trend_snapshots"("date", "region", "keyword");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "keyword_watches_userId_idx" ON "keyword_watches"("userId");

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "clusters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_watches" ADD CONSTRAINT "keyword_watches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

