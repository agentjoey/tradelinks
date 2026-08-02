/**
 * Phase 1 Public Intelligence — coverage & hub read model (Task 3).
 *
 * Server-only, read-only. Every hub is readiness-gated: it renders only
 * while its CoverageCapability is MONITORED or VERIFIED and carries a
 * non-empty known-gaps statement — an empty gap list is a data bug, so the
 * hub stays hidden rather than presenting a clean bill of health.
 * Topics aggregate canonical versions; they have no editorial store.
 */

import type {
  PlatformCode,
  PolicyTopic,
  ProductCategory,
  ReadinessLevel,
  RiskAttribute,
} from "@prisma/client";

import { prisma } from "../db/client.js";
import { isSourceOverdue } from "../canonicalize/coverage.js";
import {
  POLICY_TOPIC_LABELS,
  PRODUCT_CATEGORY_LABELS,
  RISK_ATTRIBUTE_LABELS,
} from "../domain/intelligence/taxonomy.js";
import { serializeCanonicalVersion } from "./serialize.js";
import type { CanonicalPublicRecord, VersionWithEvidence } from "./types.js";

// ---------- readiness gating ----------

export function canRenderHub(capability: { readiness: ReadinessLevel }): boolean {
  return capability.readiness === "MONITORED" || capability.readiness === "VERIFIED";
}

// ---------- shared types ----------

export type HubKind = "market" | "platform" | "category";
export type HubSlug = string;

export type PublicHubSource = {
  id: string;
  name: string;
  url: string;
  authorityLevel: string | null;
  slaMinutes: number | null;
  lastOkAt: string | null;
  isActive: boolean;
};

export type PublicHubGuide = {
  slug: string;
  title: string;
  summary: string;
  readiness: ReadinessLevel;
  lastReviewedAt: string;
};

export type PublicHubTopic = {
  topic: PolicyTopic;
  slug: string;
  label: string;
  count: number;
};

export type DemandContext = {
  readiness: "EXPERIMENTAL";
  summary: string;
  knownGaps: string[];
  lastSuccessfulCheck: string | null;
};

export type PublicHub = {
  slug: HubSlug;
  kind: HubKind;
  title: string;
  overview: string;
  readiness: "MONITORED" | "VERIFIED";
  capabilityKey: string;
  summary: string;
  knownGaps: string[];
  ceilingNote: string | null;
  warningPanel: {
    heading: string;
    body: string;
    canSee: string;
    cannotSee: string;
    consequence: string;
  } | null;
  lastContentReview: string | null;
  sources: PublicHubSource[];
  slaMinutes: number | null;
  lastSuccessfulCheck: string | null;
  overdueSources: Array<{ id: string; name: string; overdueMinutes: number | null }>;
  changes: CanonicalPublicRecord[];
  changeCount90d: number;
  federalRequirements: CanonicalPublicRecord[];
  platformConsiderations: Array<{
    platform: PlatformCode;
    label: string;
    changes: CanonicalPublicRecord[];
  }>;
  recurringTopics: PublicHubTopic[];
  guides: PublicHubGuide[];
  demand: DemandContext | null;
  asOf: string;
};

export type PublicCoverage = {
  key: string;
  kind: "market" | "platform" | "category" | "demand";
  label: string;
  readiness: ReadinessLevel;
  summary: string;
  knownGaps: string[];
  slaMinutes: number | null;
  lastSuccessfulCheck: string | null;
  sourcesWithinSla: number;
  sourceCount: number;
  overdueCount: number;
  lastContentReview: string | null;
};

export type PublicTopicHub = {
  topic: PolicyTopic;
  slug: string;
  label: string;
  changes: CanonicalPublicRecord[];
  total: number;
  guides: PublicHubGuide[];
  riskFilters: Array<{ attribute: RiskAttribute; label: string }>;
};

// ---------- topics ----------

export const POLICY_TOPICS = Object.keys(POLICY_TOPIC_LABELS) as PolicyTopic[];

export function topicSlug(topic: PolicyTopic): string {
  return topic.toLowerCase().replace(/_/g, "-");
}

export function parseTopicSlug(slug: string): PolicyTopic | null {
  for (const topic of POLICY_TOPICS) {
    if (topicSlug(topic) === slug) return topic;
  }
  return null;
}

/**
 * Risk Attribute links route to the closest explicit PolicyTopic; the exact
 * Risk Attribute label is kept as a filter on the topic page. The mapping is
 * a Task 3 design decision recorded in the task report — there is no
 * persisted risk→topic relation in the schema.
 */
export const RISK_TO_TOPIC: Record<RiskAttribute, PolicyTopic> = {
  BATTERY: "PRODUCT_SAFETY_RECALLS",
  WIRELESS_RADIO: "PRODUCT_SAFETY_RECALLS",
  CHILDREN: "PRODUCT_SAFETY_RECALLS",
  INGESTIBLE: "PRODUCT_SAFETY_RECALLS",
  TOPICAL_COSMETIC: "LABELING_CLAIMS",
  FOOD_CONTACT: "PRODUCT_SAFETY_RECALLS",
  MEDICAL_CLAIM: "LABELING_CLAIMS",
  ANIMAL_HEALTH: "PRODUCT_SAFETY_RECALLS",
  CHEMICAL_HAZMAT: "PRODUCT_SAFETY_RECALLS",
  TEXTILE_LABELING: "LABELING_CLAIMS",
  ELECTRICAL_SAFETY: "PRODUCT_SAFETY_RECALLS",
};

// ---------- demand context ----------

type DemandCapabilityFacts = {
  summary: string;
  knownGaps: string[];
  readiness: ReadinessLevel;
  sources: Array<{ source: { isActive: boolean; lastOkAt: Date | null } }>;
};

/**
 * Experimental demand is exposed only while the demand capability is
 * EXPERIMENTAL with a non-empty non-promise gap statement. Anything stronger
 * (or anything gapless) never renders as demand context.
 */
export function toDemandContext(
  capability: DemandCapabilityFacts | null,
): DemandContext | null {
  if (!capability) return null;
  if (capability.readiness !== "EXPERIMENTAL") return null;
  if (capability.knownGaps.length === 0 || capability.knownGaps.some((g) => !g.trim())) {
    return null;
  }
  const oks = capability.sources
    .filter((link) => link.source.isActive && link.source.lastOkAt != null)
    .map((link) => link.source.lastOkAt!.getTime());
  return {
    readiness: "EXPERIMENTAL",
    summary: capability.summary,
    knownGaps: capability.knownGaps,
    lastSuccessfulCheck: oks.length ? new Date(Math.max(...oks)).toISOString() : null,
  };
}

// ---------- internals ----------

const PUBLIC_READINESS = ["MONITORED", "VERIFIED"] as const;

const VERSION_INCLUDE = {
  canonicalChange: { include: { versions: { orderBy: { version: "asc" as const } } } },
  evidence: {
    include: { source: { select: { name: true } } },
    orderBy: [{ role: "asc" as const }, { publishedAt: "desc" as const }],
  },
};

function publicBaseCondition() {
  return {
    isCurrent: true,
    editorialStatus: "PUBLISHED" as const,
    reviewedAt: { not: null },
    readiness: { in: [...PUBLIC_READINESS] },
  };
}

async function queryPublicRecords(
  scope: Record<string, unknown>,
  take: number,
): Promise<CanonicalPublicRecord[]> {
  const versions = await prisma.canonicalChangeVersion.findMany({
    where: { ...publicBaseCondition(), ...scope },
    include: VERSION_INCLUDE,
    orderBy: [{ reviewedAt: "desc" }, { id: "desc" }],
    take,
  });
  return versions.map((v) => serializeCanonicalVersion(v as unknown as VersionWithEvidence));
}

const PLATFORM_LABELS: Record<PlatformCode, string> = {
  AMAZON: "Amazon US",
  SHOPIFY: "Shopify US",
};

type HubDefinition =
  | { kind: "market"; key: string; title: string }
  | { kind: "platform"; key: string; title: string; platform: PlatformCode }
  | { kind: "category"; key: string };

const STATIC_HUBS: Record<string, HubDefinition> = {
  us: { kind: "market", key: "market:us", title: "US Market" },
  "amazon-us": { kind: "platform", key: "platform:amazon-us", title: "Amazon US", platform: "AMAZON" },
  "shopify-us": { kind: "platform", key: "platform:shopify-us", title: "Shopify US", platform: "SHOPIFY" },
};

const HUB_OVERVIEWS: Record<string, string> = {
  us: "Federal rules, customs, product safety and labeling that apply regardless of where you sell.",
  "amazon-us":
    "Fee schedules, listing requirements and account-health policy for sellers on Amazon's US marketplace.",
  "shopify-us": "Payments, chargebacks, and merchant terms for sellers on Shopify in the US.",
};

/** Approved mockup copy (Surface 2) — shown while the login wall stands. */
const AMAZON_WARNING_PANEL = {
  heading: "What we can and cannot see here",
  body: "Amazon publishes most seller policy behind a Seller Central login. We do not scrape authenticated sessions, so this hub is built from public announcements, the public help centre, and reviewed secondary reporting.",
  canSee:
    "public fee announcements, public help-centre pages, and the seller forums Amazon publishes openly.",
  cannotSee:
    "the authenticated fee schedule, category-specific policy pages, and account-health thresholds.",
  consequence:
    "entries here stay Monitored. Exact numbers may lag or be restated. Confirm anything fee-critical in your own Seller Central before acting.",
};

function isoOrNull(date: Date | null): string | null {
  if (!date || date.getTime() === 0) return null;
  return date.toISOString();
}

function capabilityKind(key: string): PublicCoverage["kind"] {
  if (key.startsWith("market:")) return "market";
  if (key.startsWith("platform:")) return "platform";
  if (key.startsWith("category:")) return "category";
  return "demand";
}

// ---------- hubs ----------

export async function getHub(slug: HubSlug, now: Date = new Date()): Promise<PublicHub | null> {
  const def: HubDefinition = STATIC_HUBS[slug] ?? { kind: "category", key: `category:${slug}` };

  const capability = await prisma.coverageCapability.findUnique({
    where: { key: def.key },
    include: { sources: { include: { source: true } } },
  });
  if (!capability) return null;
  if (!canRenderHub(capability)) return null;
  // A non-empty known-gap statement is mandatory: an empty gap list is a
  // data bug, and a hub without its gaps must not render.
  if (capability.knownGaps.length === 0 || capability.knownGaps.some((g) => !g.trim())) {
    return null;
  }

  let kind: HubKind;
  let title: string;
  let scope: Record<string, unknown>;
  let platform: PlatformCode | null = null;

  if (def.kind === "market") {
    kind = "market";
    title = def.title;
    scope = {};
  } else if (def.kind === "platform") {
    kind = "platform";
    title = def.title;
    platform = def.platform;
    scope = { platforms: { has: def.platform } };
  } else {
    if (!capability.category) return null;
    kind = "category";
    title = PRODUCT_CATEGORY_LABELS[capability.category];
    scope = { productCategories: { has: capability.category } };
  }

  const federalScope: Record<string, unknown> =
    kind === "category" ? { ...scope, platforms: { isEmpty: true } } : { platforms: { isEmpty: true } };

  const [records, federal, topicRows, guides, count90d, demandCapability] =
    await Promise.all([
      queryPublicRecords(scope, 24),
      // Platform hubs pull federal (platform-less) records as a separate,
      // by-construction-disjoint set; category/market hubs slice their own
      // records below so nothing renders twice on one page.
      kind === "platform"
        ? queryPublicRecords(federalScope, 4)
        : Promise.resolve([] as CanonicalPublicRecord[]),
      prisma.canonicalChangeVersion.findMany({
        where: { ...publicBaseCondition(), ...scope },
        select: { policyTopics: true },
        take: 200,
      }),
      prisma.guide.findMany({
        where: { editorialStatus: "PUBLISHED", ...scope },
        orderBy: { lastReviewedAt: "desc" },
        take: 6,
      }),
      prisma.canonicalChangeVersion.count({
        where: {
          ...publicBaseCondition(),
          ...scope,
          reviewedAt: { not: null, gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) },
        },
      }),
      kind === "market" || platform === "SHOPIFY"
        ? Promise.resolve(null)
        : prisma.coverageCapability.findUnique({
            where: { key: "demand:amazon-bsr" },
            include: { sources: { include: { source: true } } },
          }),
    ]);

  const topicCounts = new Map<PolicyTopic, number>();
  for (const row of topicRows) {
    for (const topic of row.policyTopics) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }
  }
  const recurringTopics: PublicHubTopic[] = [...topicCounts.entries()]
    .map(([topic, count]) => ({ topic, slug: topicSlug(topic), label: POLICY_TOPIC_LABELS[topic], count }))
    .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug));

  // One page, one rendering per record: the changes window takes the first
  // six; federal/platform slices draw only from what remains.
  const changes = records.slice(0, 6);
  const shown = new Set(changes.map((record) => record.versionId));
  const remainder = records.filter((record) => !shown.has(record.versionId));

  let federalRequirements: CanonicalPublicRecord[];
  if (kind === "platform") {
    federalRequirements = federal;
  } else {
    federalRequirements = remainder.filter((record) => record.platforms.length === 0).slice(0, 4);
  }

  const platformConsiderations: PublicHub["platformConsiderations"] = [];
  if (kind !== "platform") {
    const amazon = remainder.filter((record) => record.platforms.includes("AMAZON")).slice(0, 4);
    const shopify = remainder.filter((record) => record.platforms.includes("SHOPIFY")).slice(0, 4);
    if (amazon.length > 0) {
      platformConsiderations.push({ platform: "AMAZON", label: PLATFORM_LABELS.AMAZON, changes: amazon });
    }
    if (shopify.length > 0) {
      platformConsiderations.push({ platform: "SHOPIFY", label: PLATFORM_LABELS.SHOPIFY, changes: shopify });
    }
  }

  const linkedSources = capability.sources.map((link) => link.source);
  const activeSources = linkedSources.filter((s) => s.isActive);
  const okTimes = activeSources.filter((s) => s.lastOkAt != null).map((s) => s.lastOkAt!.getTime());
  const slaValues = activeSources
    .map((s) => s.freshnessSlaMinutes)
    .filter((v): v is number => v != null);
  const overdueSources = activeSources
    .filter((s) => isSourceOverdue(s, now))
    .map((s) => ({
      id: s.id,
      name: s.name,
      overdueMinutes:
        s.lastOkAt == null || s.freshnessSlaMinutes == null
          ? null
          : Math.round((now.getTime() - s.lastOkAt.getTime() - s.freshnessSlaMinutes * 60000) / 60000),
    }));

  return {
    slug,
    kind,
    title,
    overview: HUB_OVERVIEWS[slug] ?? capability.summary,
    readiness: capability.readiness as "MONITORED" | "VERIFIED",
    capabilityKey: capability.key,
    summary: capability.summary,
    knownGaps: capability.knownGaps,
    ceilingNote: slug === "amazon-us" ? "coverage ceiling — this hub cannot reach Verified" : null,
    warningPanel:
      slug === "amazon-us" && capability.readiness !== "VERIFIED" ? AMAZON_WARNING_PANEL : null,
    lastContentReview: isoOrNull(capability.lastReviewedAt),
    sources: linkedSources.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      authorityLevel: s.authorityLevel,
      slaMinutes: s.freshnessSlaMinutes,
      lastOkAt: isoOrNull(s.lastOkAt),
      isActive: s.isActive,
    })),
    slaMinutes: slaValues.length ? Math.min(...slaValues) : null,
    lastSuccessfulCheck: okTimes.length ? new Date(Math.max(...okTimes)).toISOString() : null,
    overdueSources,
    changes,
    changeCount90d: count90d,
    federalRequirements,
    platformConsiderations,
    recurringTopics,
    guides: guides.map((g) => ({
      slug: g.slug,
      title: g.title,
      summary: g.summary,
      readiness: g.readiness,
      lastReviewedAt: g.lastReviewedAt.toISOString(),
    })),
    demand: toDemandContext(demandCapability),
    asOf: now.toISOString(),
  };
}

// ---------- coverage matrix ----------

const WORST_FIRST: Record<ReadinessLevel, number> = {
  UNAVAILABLE: 0,
  STALE: 1,
  EXPERIMENTAL: 2,
  MONITORED: 3,
  VERIFIED: 4,
};

function capabilityLabel(capability: {
  key: string;
  platform: PlatformCode | null;
  category: ProductCategory | null;
}): string {
  const kind = capabilityKind(capability.key);
  if (kind === "market") return "US Market — federal coverage";
  if (kind === "platform" && capability.platform) {
    return capability.platform === "AMAZON"
      ? "Amazon US seller policy"
      : "Shopify US merchant terms";
  }
  if (kind === "category" && capability.category) {
    return PRODUCT_CATEGORY_LABELS[capability.category];
  }
  if (capability.key === "demand:amazon-bsr") return "Amazon US demand signals (BSR)";
  return capability.key;
}

/** The public coverage matrix, worst coverage first. */
export async function getCoverageMatrix(now: Date = new Date()): Promise<PublicCoverage[]> {
  const capabilities = await prisma.coverageCapability.findMany({
    include: { sources: { include: { source: true } } },
    orderBy: { key: "asc" },
  });

  const rows = capabilities.map((capability) => {
    const linked = capability.sources.map((link) => link.source);
    const active = linked.filter((s) => s.isActive);
    const overdue = active.filter((s) => isSourceOverdue(s, now));
    const okTimes = active.filter((s) => s.lastOkAt != null).map((s) => s.lastOkAt!.getTime());
    const slaValues = active.map((s) => s.freshnessSlaMinutes).filter((v): v is number => v != null);
    return {
      key: capability.key,
      kind: capabilityKind(capability.key),
      label: capabilityLabel(capability),
      readiness: capability.readiness,
      summary: capability.summary,
      knownGaps: capability.knownGaps,
      slaMinutes: slaValues.length ? Math.min(...slaValues) : null,
      lastSuccessfulCheck: okTimes.length ? new Date(Math.max(...okTimes)).toISOString() : null,
      sourcesWithinSla: active.length - overdue.length,
      sourceCount: linked.length,
      overdueCount: overdue.length,
      lastContentReview: isoOrNull(capability.lastReviewedAt),
    } satisfies PublicCoverage;
  });

  return rows.sort(
    (a, b) => WORST_FIRST[a.readiness] - WORST_FIRST[b.readiness] || a.key.localeCompare(b.key),
  );
}

// ---------- topic hubs ----------

export async function getTopicHub(slug: string): Promise<PublicTopicHub | null> {
  const topic = parseTopicSlug(slug);
  if (!topic) return null;

  const scope = { policyTopics: { has: topic } };
  const [records, total, guides] = await Promise.all([
    queryPublicRecords(scope, 12),
    prisma.canonicalChangeVersion.count({ where: { ...publicBaseCondition(), ...scope } }),
    prisma.guide.findMany({
      where: {
        editorialStatus: "PUBLISHED",
        riskAttributes: {
          hasSome: (Object.keys(RISK_TO_TOPIC) as RiskAttribute[]).filter(
            (attribute) => RISK_TO_TOPIC[attribute] === topic,
          ),
        },
      },
      orderBy: { lastReviewedAt: "desc" },
      take: 6,
    }),
  ]);

  // A topic page exists only with three published Monitored/Verified
  // changes, or one reviewed guide plus one current published change.
  const supported = total >= 3 || (total >= 1 && guides.length >= 1);
  if (!supported) return null;

  return {
    topic,
    slug,
    label: POLICY_TOPIC_LABELS[topic],
    changes: records,
    total,
    guides: guides.map((g) => ({
      slug: g.slug,
      title: g.title,
      summary: g.summary,
      readiness: g.readiness,
      lastReviewedAt: g.lastReviewedAt.toISOString(),
    })),
    riskFilters: (Object.keys(RISK_TO_TOPIC) as RiskAttribute[])
      .filter((attribute) => RISK_TO_TOPIC[attribute] === topic)
      .map((attribute) => ({ attribute, label: RISK_ATTRIBUTE_LABELS[attribute] })),
  };
}

export type TopicSummary = {
  topic: PolicyTopic;
  slug: string;
  label: string;
  changeCount: number;
  guideCount: number;
  supported: boolean;
};

export async function listTopicSummaries(): Promise<TopicSummary[]> {
  const summaries: TopicSummary[] = [];
  for (const topic of POLICY_TOPICS) {
    const attributes = (Object.keys(RISK_TO_TOPIC) as RiskAttribute[]).filter(
      (attribute) => RISK_TO_TOPIC[attribute] === topic,
    );
    const [changeCount, guideCount] = await Promise.all([
      prisma.canonicalChangeVersion.count({
        where: { ...publicBaseCondition(), policyTopics: { has: topic } },
      }),
      attributes.length
        ? prisma.guide.count({ where: { editorialStatus: "PUBLISHED", riskAttributes: { hasSome: attributes } } })
        : Promise.resolve(0),
    ]);
    summaries.push({
      topic,
      slug: topicSlug(topic),
      label: POLICY_TOPIC_LABELS[topic],
      changeCount,
      guideCount,
      supported: changeCount >= 3 || (changeCount >= 1 && guideCount >= 1),
    });
  }
  return summaries;
}

// ---------- home briefing ----------

export async function getLatestPublishedBriefing(): Promise<{
  slug: string;
  title: string;
  summary: string;
  kind: string;
  publishedAt: string | null;
} | null> {
  const briefing = await prisma.briefing.findFirst({
    where: { editorialStatus: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
  });
  if (!briefing) return null;
  return {
    slug: briefing.slug,
    title: briefing.title,
    summary: briefing.summary,
    kind: briefing.kind,
    publishedAt: briefing.publishedAt?.toISOString() ?? null,
  };
}
