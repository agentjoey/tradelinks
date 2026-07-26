-- Phase 1, task 6 (immutable publication): additive review facts that the
-- accepted 0011 schema cannot represent. Both columns are nullable so the
-- forward-only migration never rewrites or invalidates pre-existing rows.
--
-- - classificationConfidence: the real classifier confidence persisted on
--   classification-created drafts (never inferred from readiness, never
--   synthesized for display; null renders as "unavailable").
-- - rejectionReason: the explicit, required reason recorded when a draft is
--   rejected (trimmed, non-blank at the application layer).
--
-- Rollback is a code/read-path rollback that leaves these nullable columns in
-- place; never run a down migration (see docs/architecture.md).

ALTER TABLE "CanonicalChangeVersion" ADD COLUMN "classificationConfidence" DOUBLE PRECISION;
ALTER TABLE "CanonicalChangeVersion" ADD COLUMN "rejectionReason" TEXT;
