-- Daily Note (BL-027): one original editorial article per day, per language, per
-- kind. Written by the editor model, fact-checked + de-AI'd by the reviewer,
-- human-approved before publish. Crawlable at /daily/[slug] — the SEO asset.
CREATE TABLE "daily_notes" (
    "id"              TEXT NOT NULL,
    "date"            DATE NOT NULL,
    "slug"            TEXT NOT NULL,
    "lang"            TEXT NOT NULL DEFAULT 'en',
    "kind"            TEXT NOT NULL DEFAULT 'brief',
    "title"           TEXT NOT NULL,
    "dek"             TEXT,
    "bodyMarkdown"    TEXT NOT NULL,
    "keyTakeaways"    TEXT[],
    "metaDescription" TEXT,
    "heroImageUrl"    TEXT,
    "tags"            TEXT[],
    "citations"       JSONB,
    "sourceAlertIds"  TEXT[],
    "status"          TEXT NOT NULL DEFAULT 'draft',
    "model"           TEXT,
    "reviewModel"     TEXT,
    "removedClaims"   TEXT[],
    "publishedAt"     TIMESTAMP(3),
    "reviewedBy"      TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "daily_notes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "daily_notes_slug_key" ON "daily_notes" ("slug");
CREATE UNIQUE INDEX "daily_notes_date_lang_kind_key" ON "daily_notes" ("date", "lang", "kind");
CREATE INDEX "daily_notes_status_publishedAt_idx" ON "daily_notes" ("status", "publishedAt");
