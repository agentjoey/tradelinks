-- pg_trgm extension + GIN trigram indexes for fuzzy title dedup/search
-- See docs/specs/data-model.md and ai-pipeline.md (dedup level 2).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS items_title_trgm
  ON "items" USING GIN ("title" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS items_title_en_trgm
  ON "items" USING GIN ("titleEn" gin_trgm_ops);
