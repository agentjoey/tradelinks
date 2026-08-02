/**
 * Phase 1 Public Intelligence — weekly / monthly / conditional-daily briefings.
 *
 * Briefings consume Track A's qualification output through the Foundation
 * `PipelineRun` table ONLY (jobType BRIEFING, scopeKey, status,
 * outputFingerprint, metadata.changeVersionIds as the ordered pinned
 * version IDs). Nothing here imports from, reads, or computes an ordering
 * of its own: if no finished qualification run exists for a period,
 * `generateBriefing` returns NO_QUALIFIED_CONTENT rather than diverging
 * from what Operations qualified.
 *
 * Owner Decision 5: a daily briefing requires at least three qualified
 * changes including at least one Verified — otherwise no briefing is
 * generated and no route exists.
 */

import { createHash } from "node:crypto";

import { prisma } from "../db/client.js";
import type { Briefing, ReadinessLevel } from "@prisma/client";
import type { CanonicalPublicRecord, VersionWithEvidence } from "./types.js";

export const NO_QUALIFIED_CONTENT = "NO_QUALIFIED_CONTENT";
export type NoQualifiedContent = typeof NO_QUALIFIED_CONTENT;

export type BriefingKind = "WEEKLY" | "MONTHLY" | "DAILY";

/** Owner Decision 5 — the conditional daily threshold. */
export const DAILY_MIN_QUALIFIED = 3;
export const DAILY_MIN_VERIFIED = 1;

export type BriefingInput = {
  kind: BriefingKind;
  periodKey: string;
  qualificationRunId?: string;
};

export type BriefingDraft = {
  id: string;
  kind: BriefingKind;
  periodKey: string;
  slug: string;
  title: string;
  summary: string;
  fingerprint: string;
  changeVersionIds: string[];
  qualificationRunId: string;
};

// ---------- period keys ----------

export function briefingScopeKey(kind: BriefingKind, periodKey: string): string {
  return `${kind.toLowerCase()}:${periodKey}`;
}

export function parseWeeklyPeriod(year: string, week: string): string | null {
  if (!/^\d{4}$/.test(year)) return null;
  if (!/^\d{1,2}$/.test(week)) return null;
  const w = Number(week);
  if (w < 1 || w > 53) return null;
  return `${year}-W${String(w).padStart(2, "0")}`;
}

export function parseMonthlyPeriod(year: string, month: string): string | null {
  if (!/^\d{4}$/.test(year)) return null;
  if (!/^\d{1,2}$/.test(month)) return null;
  const m = Number(month);
  if (m < 1 || m > 12) return null;
  return `${year}-${String(m).padStart(2, "0")}`;
}

export function parseDailyPeriod(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Round-trip: rejects impossible dates like 2026-02-29.
  return parsed.toISOString().slice(0, 10) === date ? date : null;
}

/** The public route for a period — the inverse of the parse functions. */
export function briefingPath(kind: BriefingKind, periodKey: string): string {
  if (kind === "WEEKLY") {
    const [year, w] = periodKey.split("-W");
    return `/briefings/weekly/${year}/${Number(w)}`;
  }
  if (kind === "MONTHLY") {
    const [year, month] = periodKey.split("-");
    return `/briefings/monthly/${year}/${Number(month)}`;
  }
  return `/briefings/daily/${periodKey}`;
}

const KIND_LABELS: Record<BriefingKind, string> = {
  WEEKLY: "Weekly briefing",
  MONTHLY: "Monthly briefing",
  DAILY: "Daily briefing",
};

// ---------- the PipelineRun integration contract ----------

type QualificationRun = {
  id: string;
  status: string;
  finishedAt: Date | null;
  outputFingerprint: string | null;
  metadata: unknown;
};

function parseRunMetadata(run: QualificationRun): { changeVersionIds: string[]; fingerprint: string } {
  const metadata = run.metadata;
  const ids =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? (metadata as Record<string, unknown>).changeVersionIds
      : undefined;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((id) => typeof id === "string")) {
    throw new Error(
      `BRIEFING_RUN_METADATA_INVALID: run ${run.id} metadata.changeVersionIds is not a non-empty string array`,
    );
  }
  if (typeof run.outputFingerprint !== "string" || run.outputFingerprint === "") {
    throw new Error(`BRIEFING_RUN_METADATA_INVALID: run ${run.id} has no outputFingerprint`);
  }
  return { changeVersionIds: ids as string[], fingerprint: run.outputFingerprint };
}

async function findFinishedRun(
  kind: BriefingKind,
  periodKey: string,
  qualificationRunId?: string,
): Promise<QualificationRun | null> {
  const scopeKey = briefingScopeKey(kind, periodKey);
  if (qualificationRunId) {
    const run = await prisma.pipelineRun.findUnique({ where: { id: qualificationRunId } });
    if (!run) return null;
    if (run.jobType !== "BRIEFING" || run.scopeKey !== scopeKey) {
      throw new Error(
        `BRIEFING_RUN_SCOPE_MISMATCH: run ${run.id} is ${run.jobType}/${run.scopeKey}, expected BRIEFING/${scopeKey}`,
      );
    }
    if (run.status !== "SUCCEEDED_ITEMS" || run.finishedAt == null) return null;
    return run;
  }
  return prisma.pipelineRun.findFirst({
    where: {
      jobType: "BRIEFING",
      scopeKey,
      status: "SUCCEEDED_ITEMS",
      finishedAt: { not: null },
    },
    orderBy: { scheduledFor: "desc" },
  });
}

// ---------- generation ----------

/**
 * Generates (or regenerates, while still a draft) the briefing for one
 * period from its finished qualification run. Entries pin the run's exact
 * ordered version IDs; the run's outputFingerprint becomes the briefing
 * fingerprint. A published briefing is never rewritten — a correction is a
 * new fingerprint and a new review event, never an edit.
 */
export async function generateBriefing(
  input: BriefingInput,
): Promise<BriefingDraft | NoQualifiedContent> {
  const { kind, periodKey } = input;
  const run = await findFinishedRun(kind, periodKey, input.qualificationRunId);
  if (!run) return NO_QUALIFIED_CONTENT;

  const { changeVersionIds, fingerprint } = parseRunMetadata(run);

  const versions = await prisma.canonicalChangeVersion.findMany({
    where: { id: { in: changeVersionIds } },
    select: { id: true, readiness: true, title: true },
  });
  const byId = new Map(versions.map((v) => [v.id, v]));
  for (const id of changeVersionIds) {
    if (!byId.has(id)) {
      throw new Error(
        `BRIEFING_RUN_METADATA_INVALID: run ${run.id} pins unknown change version ${id}`,
      );
    }
  }

  if (kind === "DAILY") {
    const qualified = changeVersionIds.filter((id) => {
      const readiness = byId.get(id)!.readiness;
      return readiness === "MONITORED" || readiness === "VERIFIED";
    });
    const verified = qualified.filter((id) => byId.get(id)!.readiness === "VERIFIED");
    if (qualified.length < DAILY_MIN_QUALIFIED || verified.length < DAILY_MIN_VERIFIED) {
      // Owner Decision 5 — no route is created, not even a stub row.
      return NO_QUALIFIED_CONTENT;
    }
  }

  const existing = await prisma.briefing.findUnique({
    where: { kind_periodKey: { kind, periodKey } },
  });
  if (existing?.editorialStatus === "PUBLISHED") {
    throw new Error(
      `BRIEFING_ALREADY_PUBLISHED: ${kind}/${periodKey} is published (fingerprint ${existing.fingerprint}); a correction is a new fingerprint and a new review event, never an edit`,
    );
  }

  const verifiedCount = changeVersionIds.filter((id) => byId.get(id)!.readiness === "VERIFIED").length;
  const monitoredCount = changeVersionIds.length - verifiedCount;
  const title = `${KIND_LABELS[kind]} — ${periodKey}`;
  // Summaries name subjects, not just counts — the index card must let a
  // reader judge relevance without opening every report.
  const headlines = changeVersionIds.slice(0, 2).map((id) => byId.get(id)!.title);
  const remainder = changeVersionIds.length - headlines.length;
  const summary =
    `${changeVersionIds.length} qualified change${changeVersionIds.length === 1 ? "" : "s"} ` +
    `(${verifiedCount} Verified, ${monitoredCount} Monitored): ` +
    headlines.join("; ") +
    (remainder > 0 ? `; ${remainder} more` : "") +
    `. Pinned to the Operations qualification run for ${periodKey}.`;
  const slug = `${kind.toLowerCase()}-${periodKey.toLowerCase()}`;
  const readiness = monitoredCount === 0 ? "VERIFIED" : "MONITORED";
  // Deterministic body from the pinned entries only — nothing invented.
  const bodyMarkdown =
    `${summary}\n\n` +
    changeVersionIds
      .map((id, index) => `${index + 1}. ${byId.get(id)!.title}`)
      .join("\n");

  const briefing = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.briefingEntry.deleteMany({ where: { briefingId: existing.id } });
    }
    return tx.briefing.upsert({
      where: { kind_periodKey: { kind, periodKey } },
      create: {
        kind,
        periodKey,
        slug,
        title,
        summary,
        bodyMarkdown,
        readiness: readiness as any,
        editorialStatus: "DRAFT",
        fingerprint,
        entries: {
          create: changeVersionIds.map((changeVersionId, position) => ({
            changeVersionId,
            position,
            commentary: "",
          })),
        },
      },
      update: {
        slug,
        title,
        summary,
        bodyMarkdown,
        readiness: readiness as any,
        fingerprint,
        entries: {
          create: changeVersionIds.map((changeVersionId, position) => ({
            changeVersionId,
            position,
            commentary: "",
          })),
        },
      },
    });
  });

  return {
    id: briefing.id,
    kind,
    periodKey,
    slug,
    title,
    summary,
    fingerprint,
    changeVersionIds,
    qualificationRunId: run.id,
  };
}

/** Publishes a generated draft. A review event is recorded, once. */
export async function publishBriefing(id: string, reviewerId: string): Promise<Briefing> {
  const briefing = await prisma.briefing.findUnique({
    where: { id },
    include: { entries: true },
  });
  if (!briefing) throw new Error(`BRIEFING_NOT_FOUND: ${id}`);
  if (briefing.editorialStatus === "PUBLISHED") {
    throw new Error(`BRIEFING_ALREADY_PUBLISHED: ${id} was already published`);
  }
  if (briefing.entries.length === 0) {
    throw new Error(`BRIEFING_HAS_NO_ENTRIES: ${id}`);
  }
  const now = new Date();
  return prisma.briefing.update({
    where: { id },
    data: {
      editorialStatus: "PUBLISHED",
      publishedAt: now,
      reviewedAt: now,
      reviewedBy: reviewerId,
    },
  });
}

// ---------- public read path ----------

/**
 * Serializes a pinned version for briefing rendering. Mirrors
 * serializeCanonicalVersion's mapping WITHOUT the public visibility
 * assertion: a briefing is a historical record and must keep rendering the
 * exact versions Operations pinned, even after a forward-only correction
 * makes a version non-current. The canonical public gate still applies to
 * the /changes pages the records link to.
 */
function serializePinnedVersion(version: VersionWithEvidence): CanonicalPublicRecord {
  const correctionHistory = version.canonicalChange.versions
    .filter((v) => v.correctionReason != null && v.editorialStatus === "PUBLISHED")
    .map((v) => ({
      version: v.version,
      correctionReason: v.correctionReason!,
      createdAt: v.createdAt.toISOString(),
    }))
    .sort((a, b) => a.version - b.version);

  return {
    id: version.canonicalChange.id,
    slug: version.canonicalChange.slug,
    versionId: version.id,
    version: version.version,
    // Same fingerprint scheme as the canonical serializer — a pinned record
    // quotes its version identity, never an empty placeholder.
    fingerprint: createHash("sha256")
      .update(`${version.id}|${version.version}|${version.updatedAt.toISOString()}`)
      .digest("hex"),
    title: version.title,
    summary: version.summary,
    signalType: version.signalType,
    market: "US",
    regions: version.regions,
    platforms: version.platforms,
    operatingStages: version.operatingStages,
    productCategories: version.productCategories,
    riskAttributes: version.riskAttributes,
    policyTopics: version.policyTopics,
    sourcePublishedAt: version.sourcePublishedAt.toISOString(),
    effectiveAt: version.effectiveAt?.toISOString() ?? null,
    urgency: version.urgency,
    readiness: version.readiness as "MONITORED" | "VERIFIED",
    generalImpact: version.generalImpact,
    generalActionTemplate: version.generalActionTemplate,
    permalink: `https://tradelinks.us/changes/${version.canonicalChange.slug}`,
    reviewedAt: version.reviewedAt?.toISOString() ?? "",
    evidence: version.evidence.map((e) => ({
      sourceId: e.sourceId,
      sourceName: e.source.name,
      url: e.url,
      role: e.role,
      authorityLevel: e.authorityLevel,
      publishedAt: e.publishedAt?.toISOString() ?? null,
      normalizedSummary: e.normalizedSummary,
      reviewedAt: e.reviewedAt?.toISOString() ?? null,
    })),
    correctionHistory,
  };
}

const PINNED_VERSION_INCLUDE = {
  canonicalChange: { include: { versions: { orderBy: { version: "asc" as const } } } },
  evidence: {
    include: { source: { select: { name: true } } },
    orderBy: [{ role: "asc" as const }, { publishedAt: "desc" as const }],
  },
};

export type PublishedBriefingEntry = {
  position: number;
  changeVersionId: string;
  record: CanonicalPublicRecord;
};

export type PublishedBriefing = {
  id: string;
  kind: BriefingKind;
  periodKey: string;
  slug: string;
  title: string;
  summary: string;
  readiness: ReadinessLevel;
  fingerprint: string;
  publishedAt: string;
  reviewedBy: string | null;
  path: string;
  entries: PublishedBriefingEntry[];
};

/** Published briefings only. Drafts and empty periods return null. */
export async function getPublishedBriefing(
  kind: BriefingKind,
  periodKey: string,
): Promise<PublishedBriefing | null> {
  const briefing = await prisma.briefing.findFirst({
    where: { kind, periodKey, editorialStatus: "PUBLISHED" },
    include: {
      entries: {
        orderBy: { position: "asc" },
        include: { changeVersion: { include: PINNED_VERSION_INCLUDE } },
      },
    },
  });
  if (!briefing) return null;
  return {
    id: briefing.id,
    kind: briefing.kind as BriefingKind,
    periodKey: briefing.periodKey,
    slug: briefing.slug,
    title: briefing.title,
    summary: briefing.summary,
    readiness: briefing.readiness,
    fingerprint: briefing.fingerprint,
    publishedAt: briefing.publishedAt!.toISOString(),
    reviewedBy: briefing.reviewedBy,
    path: briefingPath(briefing.kind as BriefingKind, briefing.periodKey),
    entries: briefing.entries.map((entry) => ({
      position: entry.position,
      changeVersionId: entry.changeVersionId,
      record: serializePinnedVersion(entry.changeVersion as unknown as VersionWithEvidence),
    })),
  };
}

export type PublishedBriefingSummary = {
  kind: BriefingKind;
  periodKey: string;
  slug: string;
  title: string;
  summary: string;
  readiness: ReadinessLevel;
  publishedAt: string;
  entryCount: number;
  path: string;
};

export async function listPublishedBriefings(): Promise<PublishedBriefingSummary[]> {
  const rows = await prisma.briefing.findMany({
    where: { editorialStatus: "PUBLISHED" },
    include: { _count: { select: { entries: true } } },
    orderBy: [{ periodKey: "desc" }, { kind: "asc" }],
  });
  return rows.map((row) => ({
    kind: row.kind as BriefingKind,
    periodKey: row.periodKey,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    readiness: row.readiness,
    publishedAt: row.publishedAt!.toISOString(),
    entryCount: row._count.entries,
    path: briefingPath(row.kind as BriefingKind, row.periodKey),
  }));
}
