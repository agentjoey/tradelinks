-- Source health snapshots — daily per-source health for the /admin/sources
-- dashboard (trend lines + regression alerts). One row per source per day.
CREATE TABLE "source_health_snapshots" (
    "id"        TEXT NOT NULL,
    "date"      DATE NOT NULL,
    "sourceId"  TEXT NOT NULL,
    "score"     INTEGER NOT NULL,
    "tier"      TEXT NOT NULL,
    "items24h"  INTEGER NOT NULL,
    "fails"     INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "source_health_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "source_health_snapshots_date_sourceId_key"
    ON "source_health_snapshots" ("date", "sourceId");

CREATE INDEX "source_health_snapshots_sourceId_date_idx"
    ON "source_health_snapshots" ("sourceId", "date");
