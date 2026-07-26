/**
 * Conservative legacy backfill into the Phase 1 canonical intelligence model.
 *
 * Every eligible legacy Alert becomes an in-review Experimental draft;
 * legacy source urls and items are downgraded to SECONDARY_CONTEXT evidence.
 * Nothing is published, nothing becomes current, and nothing is upgraded to
 * Verified automatically. Rejected rows carry a machine-readable reason.
 */

import { createHash } from "node:crypto";
import type {
  AuthorityLevel,
  EvidenceRole,
  PlatformCode,
  PolicyTopic,
  Prisma,
} from "@prisma/client";

import { prisma } from "../db/client.js";
import type { SignalType } from "../domain/intelligence/taxonomy.js";

const TX_OPTIONS = { maxWait: 30_000, timeout: 120_000 } as const;

/** Approved isolated Neon endpoint for the Phase 1 foundation backfill. */
const APPROVED_APPLY_ENDPOINT = "ep-proud-dream-aotwdl52";

/**
 * Returns true only when the actual Prisma write URL is present and every
 * configured database URL points at the explicitly approved isolated branch.
 */
export function isApprovedApplyTarget(): boolean {
  const isApprovedUrl = (url: string): boolean => {
    try {
      const { hostname } = new URL(url);
      return (
        hostname.startsWith(`${APPROVED_APPLY_ENDPOINT}.`) ||
        hostname.startsWith(`${APPROVED_APPLY_ENDPOINT}-pooler.`)
      );
    } catch {
      return false;
    }
  };

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl || !isApprovedUrl(databaseUrl)) return false;

  const directUrl = process.env.DIRECT_URL;
  if (directUrl && !isApprovedUrl(directUrl)) {
    return false;
  }

  return true;
}

export interface BackfillDraftEvidence {
  url: string;
  role: "SECONDARY_CONTEXT";
  authorityLevel: string;
  sourceId: string;
}

export interface BackfillDraft {
  id: string;
  slug: string;
  title: string;
  readiness: "EXPERIMENTAL";
  editorialStatus: "IN_REVIEW";
  isCurrent: false;
  evidence: BackfillDraftEvidence[];
}

export interface BackfillReport {
  fingerprint: string;
  sourceItems: number;
  clusters: number;
  canonicalChanges: number;
  versions: number;
  evidenceRecords: number;
  rejectedRows: Array<{ table: string; id: string; reason: string }>;
  drafts: BackfillDraft[];
}

interface ProposedCluster {
  fingerprint: string;
  legacyClusterId?: string;
  memberItemIds: string[];
}

type EvidenceRecordDraft = Omit<Prisma.EvidenceRecordCreateManyInput, "changeVersionId">;

interface ProposedChange {
  slug: string;
  legacyAlertId: string;
  cluster: ProposedCluster;
  version: Prisma.CanonicalChangeVersionCreateWithoutCanonicalChangeInput;
  evidence: EvidenceRecordDraft[];
}

interface FullPlan {
  fingerprint: string;
  snapshot: LegacySnapshot;
  proposed: ProposedChange[];
  rejectedRows: BackfillReport["rejectedRows"];
}

const CATEGORY_TO_SIGNAL_TYPE: Record<string, SignalType> = {
  regulatory: "REGULATORY",
  platform_policy: "PLATFORM_POLICY",
  logistics: "LOGISTICS",
  trend: "DEMAND",
  industry: "INDUSTRY",
  tip: "PRACTICAL_GUIDANCE",
};

const CATEGORY_TO_POLICY_TOPIC: Record<string, string> = {
  regulatory: "IMPORT_CUSTOMS",
  platform_policy: "LISTING_ACCOUNT_HEALTH",
  logistics: "IMPORT_CUSTOMS",
  tip: "PRIVACY_CONSUMER_PROTECTION",
};

const PLATFORM_MAP: Record<string, PlatformCode> = {
  amazon: "AMAZON",
  shopify: "SHOPIFY",
};

function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function deriveClusterId(fingerprint: string): string {
  return sha256(fingerprint);
}

function deriveChangeId(slug: string): string {
  return sha256(slug);
}

function deriveVersionId(canonicalChangeId: string, version: number): string {
  return sha256(`${canonicalChangeId}:v${version}`);
}

function deriveEvidenceId(changeVersionId: string, ev: EvidenceRecordDraft): string {
  return sha256(
    `${changeVersionId}:${ev.sourceId}:${ev.sourceItemId ?? ""}:${ev.url}:${ev.role}`,
  );
}

function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as object).sort());
}

function clampUrgency(score: number | null | undefined): number {
  if (score == null || Number.isNaN(score)) return 1;
  return Math.min(Math.max(Math.round(score), 1), 5);
}

function mapPlatforms(platforms: string[]): PlatformCode[] {
  const mapped: PlatformCode[] = [];
  for (const p of platforms) {
    const code = PLATFORM_MAP[p.toLowerCase()];
    if (code && !mapped.includes(code)) mapped.push(code);
  }
  return mapped;
}

function legacyEvidenceAuthorityLevel(
  source: { authorityLevel: string | null } | null | undefined,
): AuthorityLevel {
  if (!source?.authorityLevel) return "REPUTABLE_SECONDARY";
  return source.authorityLevel as AuthorityLevel;
}

function normalizeMatchUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    u.hostname = u.hostname.toLowerCase();
    u.hash = "";
    return u.toString();
  } catch {
    return raw.trim().toLowerCase();
  }
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

interface SourceMatcher {
  findSourceForUrl(url: string): string | undefined;
}

function buildSourceMatcher(sources: Map<string, LegacySource>): SourceMatcher {
  const entries = [...sources.values()].map((s) => ({
    id: s.id,
    normalized: normalizeMatchUrl(s.url),
    hostname: hostnameOf(s.url),
  }));

  return {
    findSourceForUrl(url: string): string | undefined {
      const normalizedUrl = normalizeMatchUrl(url);
      const urlHostname = hostnameOf(normalizedUrl);
      if (!urlHostname) return undefined;

      const candidates = entries.filter((e) => e.hostname === urlHostname);
      if (candidates.length === 0) return undefined;

      const sorted = candidates
        .map((e) => ({
          ...e,
          isPrefix: normalizedUrl.startsWith(e.normalized),
          prefixLength: normalizedUrl.startsWith(e.normalized) ? e.normalized.length : 0,
        }))
        .sort((a, b) => {
          // Prefer prefix matches, then longest source URL, then stable id.
          if (a.isPrefix !== b.isPrefix) return a.isPrefix ? -1 : 1;
          if (b.prefixLength !== a.prefixLength) return b.prefixLength - a.prefixLength;
          if (b.normalized.length !== a.normalized.length) return b.normalized.length - a.normalized.length;
          return a.id.localeCompare(b.id);
        });

      return sorted[0]?.id;
    },
  };
}

interface LegacyItem {
  id: string;
  sourceId: string;
  url: string;
  urlHash: string;
  title: string;
  summaryEn: string | null;
  crawledAt: Date;
  clusterId: string | null;
}

interface LegacyCluster {
  id: string;
  items: LegacyItem[];
}

interface LegacyAlert {
  id: string;
  clusterId: string | null;
  title: string;
  summary: string;
  urgencyScore: number | null;
  regions: string[];
  platforms: string[];
  category: string;
  sourceUrls: string[];
  publishedAt: Date | null;
  createdAt: Date;
}

interface LegacySource {
  id: string;
  url: string;
  authorityLevel: string | null;
}

interface LegacySnapshot {
  items: LegacyItem[];
  clusters: LegacyCluster[];
  alerts: LegacyAlert[];
  sources: Map<string, LegacySource>;
}

function clusterById(snapshot: LegacySnapshot, clusterId: string | null): LegacyCluster | null {
  if (!clusterId) return null;
  return snapshot.clusters.find((c) => c.id === clusterId) ?? null;
}

function buildChangeSlug(legacyAlertId: string): string {
  return `legacy-alert:${legacyAlertId}`;
}

async function loadExistingLegacyAlertSlugs(): Promise<Set<string>> {
  const rows = await prisma.canonicalChange.findMany({
    where: { slug: { startsWith: "legacy-alert:" } },
    select: { slug: true },
  });
  return new Set(rows.map((r) => r.slug));
}

async function loadExistingLegacyClusterFingerprints(): Promise<Set<string>> {
  const rows = await prisma.evidenceCluster.findMany({
    where: { fingerprint: { startsWith: "legacy-" } },
    select: { fingerprint: true },
  });
  return new Set(rows.map((r) => r.fingerprint));
}

async function loadLegacySnapshot(): Promise<LegacySnapshot> {
  const [items, clusters, alerts, sources] = await Promise.all([
    prisma.item.findMany({
      select: {
        id: true,
        sourceId: true,
        url: true,
        urlHash: true,
        title: true,
        summaryEn: true,
        crawledAt: true,
        clusterId: true,
      },
    }),
    prisma.cluster.findMany({ select: { id: true } }),
    prisma.alert.findMany({
      select: {
        id: true,
        clusterId: true,
        title: true,
        summary: true,
        urgencyScore: true,
        regions: true,
        platforms: true,
        category: true,
        sourceUrls: true,
        publishedAt: true,
        createdAt: true,
      },
    }),
    prisma.source.findMany({ select: { id: true, url: true, authorityLevel: true } }),
  ]);

  const itemsByCluster = new Map<string, LegacyItem[]>();
  for (const item of items) {
    if (!item.clusterId) continue;
    const list = itemsByCluster.get(item.clusterId) ?? [];
    list.push(item);
    itemsByCluster.set(item.clusterId, list);
  }

  return {
    items,
    clusters: clusters.map((c) => ({ id: c.id, items: itemsByCluster.get(c.id) ?? [] })),
    alerts,
    sources: new Map(sources.map((s) => [s.id, { id: s.id, url: s.url, authorityLevel: s.authorityLevel }])),
  };
}

function computeFingerprint(snapshot: LegacySnapshot): string {
  const payload = {
    items: snapshot.items.map((i) => i.id).sort(),
    clusters: snapshot.clusters.map((c) => c.id).sort(),
    alerts: snapshot.alerts.map((a) => a.id).sort(),
  };
  return sha256(stableJson(payload));
}

function buildClusterFingerprint(
  legacyClusterId: string | undefined,
  legacyAlertId: string,
  linkedAlertCount: number,
): string {
  if (!legacyClusterId) return `legacy-alert-cluster:${legacyAlertId}`;
  if (linkedAlertCount === 1) return `legacy-cluster:${legacyClusterId}`;
  return `legacy-cluster:${legacyClusterId}:alert:${legacyAlertId}`;
}

function buildEvidenceForAlert(
  alert: LegacyAlert,
  snapshot: LegacySnapshot,
  matcher: SourceMatcher,
): {
  evidence: EvidenceRecordDraft[];
  rejectedReason?: string;
} {
  const evidence: EvidenceRecordDraft[] = [];
  const seenUrls = new Set<string>();
  const cluster = clusterById(snapshot, alert.clusterId);
  const clusterItems = cluster?.items ?? [];
  const sources = snapshot.sources;

  if (clusterItems.length === 0 && alert.sourceUrls.length === 0) {
    return { evidence, rejectedReason: "MISSING_EVIDENCE" };
  }

  for (const item of clusterItems) {
    if (seenUrls.has(item.url)) continue;
    seenUrls.add(item.url);
    const source = sources.get(item.sourceId);
    evidence.push({
      sourceId: item.sourceId,
      sourceItemId: item.id,
      url: item.url,
      role: "SECONDARY_CONTEXT" as EvidenceRole,
      authorityLevel: legacyEvidenceAuthorityLevel(source),
      access: "PUBLIC",
      licenseNote: "Legacy item evidence; role downgraded to SECONDARY_CONTEXT pending review.",
      normalizedSummary: item.summaryEn ?? item.title,
      contentHash: item.urlHash,
      fetchedAt: item.crawledAt,
    });
  }

  for (const url of alert.sourceUrls) {
    const trimmed = url.trim();
    if (!trimmed || seenUrls.has(trimmed)) continue;
    seenUrls.add(trimmed);

    const matchingClusterItem = clusterItems.find((i) => i.url === trimmed);
    if (matchingClusterItem) continue;

    // Legacy alerts are often orphan (no cluster) while the source item exists
    // in the items table with the same URL. Match by URL first, then fall back
    // to source hostname/prefix matching.
    const matchingItem = snapshot.items.find((i) => i.url === trimmed);
    if (matchingItem) {
      const source = sources.get(matchingItem.sourceId);
      evidence.push({
        sourceId: matchingItem.sourceId,
        sourceItemId: matchingItem.id,
        url: trimmed,
        role: "SECONDARY_CONTEXT" as EvidenceRole,
        authorityLevel: legacyEvidenceAuthorityLevel(source),
        access: "PUBLIC",
        licenseNote: "Legacy source URL; role downgraded to SECONDARY_CONTEXT pending review.",
        normalizedSummary: matchingItem.summaryEn ?? matchingItem.title ?? alert.summary,
        contentHash: matchingItem.urlHash,
        fetchedAt: matchingItem.crawledAt,
      });
      continue;
    }

    const sourceId = matcher.findSourceForUrl(trimmed);
    if (!sourceId) {
      return { evidence, rejectedReason: "SOURCE_NOT_FOUND" };
    }
    const source = sources.get(sourceId);
    evidence.push({
      sourceId,
      url: trimmed,
      role: "SECONDARY_CONTEXT" as EvidenceRole,
      authorityLevel: legacyEvidenceAuthorityLevel(source),
      access: "PUBLIC",
      licenseNote: "Legacy source URL; role downgraded to SECONDARY_CONTEXT pending review.",
      normalizedSummary: alert.summary,
      contentHash: sha256(`${trimmed}:${alert.summary}`),
      fetchedAt: alert.createdAt,
    });
  }

  return { evidence };
}

function buildFullPlan(
  snapshot: LegacySnapshot,
  existingSlugs: Set<string>,
): FullPlan {
  const fingerprint = computeFingerprint(snapshot);
  const proposed: ProposedChange[] = [];
  const rejectedRows: BackfillReport["rejectedRows"] = [];
  const sourceMatcher = buildSourceMatcher(snapshot.sources);
  const alertsPerCluster = new Map<string, number>();
  for (const alert of snapshot.alerts) {
    if (!alert.clusterId) continue;
    alertsPerCluster.set(alert.clusterId, (alertsPerCluster.get(alert.clusterId) ?? 0) + 1);
  }

  for (const alert of snapshot.alerts) {
    const slug = buildChangeSlug(alert.id);
    if (existingSlugs.has(slug)) continue;
    const title = alert.title.trim();
    if (title === "") {
      rejectedRows.push({ table: "alerts", id: alert.id, reason: "MISSING_TITLE" });
      continue;
    }

    const { evidence, rejectedReason } = buildEvidenceForAlert(alert, snapshot, sourceMatcher);
    if (rejectedReason) {
      rejectedRows.push({ table: "alerts", id: alert.id, reason: rejectedReason });
      continue;
    }

    const cluster = clusterById(snapshot, alert.clusterId);
    const clusterItemIds = (cluster?.items ?? []).map((i) => i.id);
    const recoveredItemIds = new Set(
      evidence.filter((e) => e.sourceItemId).map((e) => e.sourceItemId!),
    );
    const memberItemIds = [...new Set([...clusterItemIds, ...recoveredItemIds])].sort();

    const proposedCluster: ProposedCluster = {
      fingerprint: buildClusterFingerprint(
        alert.clusterId ?? undefined,
        alert.id,
        alert.clusterId ? (alertsPerCluster.get(alert.clusterId) ?? 0) : 0,
      ),
      legacyClusterId: alert.clusterId ?? undefined,
      memberItemIds,
    };

    const signalType = CATEGORY_TO_SIGNAL_TYPE[alert.category] ?? "INDUSTRY";
    const policyTopics = (CATEGORY_TO_POLICY_TOPIC[alert.category]
      ? [CATEGORY_TO_POLICY_TOPIC[alert.category]!]
      : []) as PolicyTopic[];

    proposed.push({
      slug,
      legacyAlertId: alert.id,
      cluster: proposedCluster,
      version: {
        version: 1,
        isCurrent: false,
        title,
        summary: alert.summary,
        signalType,
        market: "US",
        regions: alert.regions,
        platforms: mapPlatforms(alert.platforms),
        operatingStages: [],
        productCategories: ["ALL_PRODUCTS"],
        riskAttributes: [],
        policyTopics,
        sourcePublishedAt: alert.publishedAt ?? alert.createdAt,
        effectiveAt: null,
        urgency: clampUrgency(alert.urgencyScore),
        readiness: "EXPERIMENTAL",
        generalImpact: alert.summary || "Legacy alert backfill.",
        generalActionTemplate: null,
        editorialStatus: "IN_REVIEW",
        classificationConfidence: null,
      },
      evidence,
    });
  }

  return { fingerprint, snapshot, proposed, rejectedRows };
}

function summarizePlan(
  plan: FullPlan,
  existingClusterFingerprints: Set<string>,
): BackfillReport {
  const drafts: BackfillDraft[] = plan.proposed.map((p) => ({
    id: p.legacyAlertId,
    slug: p.slug,
    title: p.version.title as string,
    readiness: "EXPERIMENTAL",
    editorialStatus: "IN_REVIEW",
    isCurrent: false,
    evidence: p.evidence.map((e) => ({
      url: e.url,
      role: "SECONDARY_CONTEXT" as const,
      authorityLevel: e.authorityLevel as string,
      sourceId: e.sourceId as string,
    })),
  }));

  const proposedClusterFingerprints = new Set(plan.proposed.map((p) => p.cluster.fingerprint));
  const clusters = [...proposedClusterFingerprints].filter(
    (fp) => !existingClusterFingerprints.has(fp),
  ).length;
  const evidenceRecords = plan.proposed.reduce((sum, p) => sum + p.evidence.length, 0);

  const sourceItemIds = new Set<string>();
  for (const proposal of plan.proposed) {
    for (const ev of proposal.evidence) {
      if (ev.sourceItemId) sourceItemIds.add(ev.sourceItemId);
    }
  }

  return {
    fingerprint: plan.fingerprint,
    sourceItems: sourceItemIds.size,
    clusters,
    canonicalChanges: plan.proposed.length,
    versions: plan.proposed.length,
    evidenceRecords,
    rejectedRows: plan.rejectedRows,
    drafts,
  };
}

export async function planFoundationBackfill(): Promise<BackfillReport> {
  const [snapshot, existingSlugs, existingClusterFingerprints] = await Promise.all([
    loadLegacySnapshot(),
    loadExistingLegacyAlertSlugs(),
    loadExistingLegacyClusterFingerprints(),
  ]);
  const plan = buildFullPlan(snapshot, existingSlugs);
  return summarizePlan(plan, existingClusterFingerprints);
}

export async function applyFoundationBackfill(reportFingerprint: string): Promise<BackfillReport> {
  if (!isApprovedApplyTarget()) {
    throw new Error(
      "Refusing to apply backfill: DATABASE_URL is required and every configured database URL must point to the approved isolated endpoint.",
    );
  }

  const [snapshot, existingSlugs, existingClusterFingerprints] = await Promise.all([
    loadLegacySnapshot(),
    loadExistingLegacyAlertSlugs(),
    loadExistingLegacyClusterFingerprints(),
  ]);
  const plan = buildFullPlan(snapshot, existingSlugs);

  if (plan.fingerprint !== reportFingerprint) {
    throw new Error(`Fingerprint mismatch: expected ${reportFingerprint}, got ${plan.fingerprint}`);
  }

  const baseReport = summarizePlan(plan, existingClusterFingerprints);

  if (plan.proposed.length === 0) {
    return {
      ...baseReport,
      sourceItems: 0,
      clusters: 0,
      canonicalChanges: 0,
      versions: 0,
      evidenceRecords: 0,
    };
  }

  // Group by deterministic proposal cluster fingerprint for bounded bulk writes.
  const clusterProposals = new Map<string, ProposedChange[]>();
  for (const p of plan.proposed) {
    const list = clusterProposals.get(p.cluster.fingerprint) ?? [];
    list.push(p);
    clusterProposals.set(p.cluster.fingerprint, list);
  }

  const inserted = await prisma.$transaction(async (tx) => {
    // 1. Create missing EvidenceClusters.
    const proposedClusterFingerprints = [...clusterProposals.keys()].sort();
    const missingClusterFingerprints = proposedClusterFingerprints.filter(
      (fp) => !existingClusterFingerprints.has(fp),
    );
    const clusterResult =
      missingClusterFingerprints.length > 0
        ? await tx.evidenceCluster.createMany({
            data: missingClusterFingerprints.map((fingerprint) => ({
              id: deriveClusterId(fingerprint),
              fingerprint,
            })),
            skipDuplicates: true,
          })
        : { count: 0 };

    // 2. Read back cluster ids for all proposed fingerprints.
    const clusterRows = await tx.evidenceCluster.findMany({
      where: { fingerprint: { in: proposedClusterFingerprints } },
      select: { id: true, fingerprint: true },
    });
    const clusterIdByFingerprint = new Map(clusterRows.map((r) => [r.fingerprint, r.id]));

    // 3. Bulk insert cluster members (deterministic union of item ids).
    const memberInputs: Prisma.EvidenceClusterMemberCreateManyInput[] = [];
    for (const [fingerprint, proposals] of [...clusterProposals.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const itemIds = new Set<string>();
      for (const p of proposals) {
        for (const itemId of p.cluster.memberItemIds) itemIds.add(itemId);
      }
      const clusterId = clusterIdByFingerprint.get(fingerprint)!;
      for (const itemId of [...itemIds].sort()) {
        memberInputs.push({ clusterId, itemId, role: "SECONDARY_CONTEXT" });
      }
    }
    const memberResult =
      memberInputs.length > 0
        ? await tx.evidenceClusterMember.createMany({ data: memberInputs, skipDuplicates: true })
        : { count: 0 };

    // 4. Create missing CanonicalChanges.
    const proposedSlugs = plan.proposed.map((p) => p.slug).sort();
    const missingSlugs = proposedSlugs.filter((s) => !existingSlugs.has(s));
    const changeResult =
      missingSlugs.length > 0
        ? await tx.canonicalChange.createMany({
            data: missingSlugs.map((slug) => ({
              id: deriveChangeId(slug),
              slug,
              clusterId: clusterIdByFingerprint.get(
                plan.proposed.find((p) => p.slug === slug)!.cluster.fingerprint,
              )!,
            })),
            skipDuplicates: true,
          })
        : { count: 0 };

    // 5. Read back canonical change ids.
    const changeRows = await tx.canonicalChange.findMany({
      where: { slug: { in: proposedSlugs } },
      select: { id: true, slug: true },
    });
    const changeIdBySlug = new Map(changeRows.map((r) => [r.slug, r.id]));

    // 6. Create versions for all proposed changes.
    const versionInputs = plan.proposed.map((p) => ({
      id: deriveVersionId(changeIdBySlug.get(p.slug)!, p.version.version as number),
      ...p.version,
      canonicalChangeId: changeIdBySlug.get(p.slug)!,
    }));
    const versionResult =
      versionInputs.length > 0
        ? await tx.canonicalChangeVersion.createMany({ data: versionInputs, skipDuplicates: true })
        : { count: 0 };

    // 7. Read back version ids for version 1 of each change.
    const versionRows = await tx.canonicalChangeVersion.findMany({
      where: {
        canonicalChangeId: { in: [...changeIdBySlug.values()] },
        version: 1,
      },
      select: { id: true, canonicalChangeId: true },
    });
    const versionIdByChangeId = new Map(versionRows.map((r) => [r.canonicalChangeId, r.id]));

    // 8. Create evidence records.
    const evidenceInputs: Prisma.EvidenceRecordCreateManyInput[] = [];
    for (const p of plan.proposed) {
      const changeId = changeIdBySlug.get(p.slug)!;
      const versionId = versionIdByChangeId.get(changeId)!;
      for (const ev of p.evidence) {
        evidenceInputs.push({
          id: deriveEvidenceId(versionId, ev),
          ...ev,
          changeVersionId: versionId,
        });
      }
    }
    const evidenceResult =
      evidenceInputs.length > 0
        ? await tx.evidenceRecord.createMany({ data: evidenceInputs, skipDuplicates: true })
        : { count: 0 };

    return {
      clusters: clusterResult.count,
      members: memberResult.count,
      changes: changeResult.count,
      versions: versionResult.count,
      evidence: evidenceResult.count,
    };
  }, TX_OPTIONS);

  return {
    ...baseReport,
    clusters: inserted.clusters,
    canonicalChanges: inserted.changes,
    versions: inserted.versions,
    evidenceRecords: inserted.evidence,
  };
}
