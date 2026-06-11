-- CreateTable
CREATE TABLE "mover_insights" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "asin" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "category" TEXT NOT NULL,
    "rank" INTEGER,
    "rankDelta" INTEGER,
    "reviewDelta" INTEGER,
    "isNewEntrant" BOOLEAN NOT NULL DEFAULT false,
    "score" DOUBLE PRECISION NOT NULL,
    "spreadingTo" "Region"[],
    "title" TEXT NOT NULL,
    "whatItIs" TEXT NOT NULL,
    "whyNow" TEXT NOT NULL,
    "trajectory" TEXT NOT NULL,
    "soWhat" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mover_insights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mover_insights_date_asin_region_key" ON "mover_insights"("date", "asin", "region");

-- CreateIndex
CREATE INDEX "mover_insights_date_score_idx" ON "mover_insights"("date", "score");
