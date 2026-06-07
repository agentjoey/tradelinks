-- prisma/migrations/0007_translations/migration.sql
CREATE TABLE "translations" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "lang" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "translations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "translations_entityType_entityId_lang_key" ON "translations"("entityType", "entityId", "lang");
CREATE INDEX "translations_entityType_lang_idx" ON "translations"("entityType", "lang");
