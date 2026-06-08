-- prisma/migrations/0008_product_snapshots/migration.sql
CREATE TABLE "product_snapshots" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "asin" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "category" TEXT NOT NULL,
    "rank" INTEGER,
    "reviewCount" INTEGER,
    "rating" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isCommodity" BOOLEAN NOT NULL DEFAULT false,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_snapshots_date_asin_region_key" ON "product_snapshots"("date", "asin", "region");
CREATE INDEX "product_snapshots_asin_date_idx" ON "product_snapshots"("asin", "date");
CREATE INDEX "product_snapshots_region_category_date_idx" ON "product_snapshots"("region", "category", "date");
