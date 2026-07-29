-- CreateEnum
CREATE TYPE "BriefingKind" AS ENUM ('WEEKLY', 'MONTHLY', 'DAILY');

-- CreateTable
CREATE TABLE "Guide" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "market" "MarketCode" NOT NULL DEFAULT 'US',
    "platforms" "PlatformCode"[],
    "productCategories" "ProductCategory"[],
    "riskAttributes" "RiskAttribute"[],
    "readiness" "ReadinessLevel" NOT NULL,
    "editorialStatus" "EditorialStatus" NOT NULL DEFAULT 'DRAFT',
    "lastReviewedAt" TIMESTAMP(3) NOT NULL,
    "reviewedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideEvidence" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "authorityLevel" "AuthorityLevel" NOT NULL,
    "access" "EvidenceAccess" NOT NULL,
    "licenseNote" TEXT NOT NULL,
    "normalizedSummary" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "GuideEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Briefing" (
    "id" TEXT NOT NULL,
    "kind" "BriefingKind" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "bodyMarkdown" TEXT NOT NULL,
    "readiness" "ReadinessLevel" NOT NULL,
    "editorialStatus" "EditorialStatus" NOT NULL DEFAULT 'DRAFT',
    "fingerprint" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Briefing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BriefingEntry" (
    "briefingId" TEXT NOT NULL,
    "changeVersionId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "commentary" TEXT NOT NULL,

    CONSTRAINT "BriefingEntry_pkey" PRIMARY KEY ("briefingId","changeVersionId")
);

-- CreateTable
CREATE TABLE "LegacyRedirect" (
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 308,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyRedirect_pkey" PRIMARY KEY ("fromPath")
);

-- CreateIndex
CREATE UNIQUE INDEX "Guide_slug_key" ON "Guide"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "GuideEvidence_guideId_url_key" ON "GuideEvidence"("guideId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "GuideEvidence_guideId_position_key" ON "GuideEvidence"("guideId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "Briefing_slug_key" ON "Briefing"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Briefing_kind_periodKey_key" ON "Briefing"("kind", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "BriefingEntry_briefingId_position_key" ON "BriefingEntry"("briefingId", "position");

-- AddForeignKey
ALTER TABLE "GuideEvidence" ADD CONSTRAINT "GuideEvidence_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "Guide"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideEvidence" ADD CONSTRAINT "GuideEvidence_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingEntry" ADD CONSTRAINT "BriefingEntry_briefingId_fkey" FOREIGN KEY ("briefingId") REFERENCES "Briefing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BriefingEntry" ADD CONSTRAINT "BriefingEntry_changeVersionId_fkey" FOREIGN KEY ("changeVersionId") REFERENCES "CanonicalChangeVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
