-- Add imageUrl (og:image) to items + alerts.
-- NOTE: do NOT drop the pg_trgm GIN indexes from 0002 (Prisma's migrate diff
-- doesn't know about raw-SQL indexes and tries to drop them — removed here).
ALTER TABLE "alerts" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "items"  ADD COLUMN "imageUrl" TEXT;

-- re-assert trigram indexes (idempotent) so fresh deploys keep them
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS items_title_trgm    ON "items" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS items_title_en_trgm ON "items" USING GIN ("titleEn" gin_trgm_ops);
