/**
 * Phase 1 coverage capabilities: seeding and readiness transitions.
 *
 * A `CoverageCapability` is the public promise unit (a market, platform,
 * category, or demand stream). Its stored `readiness` is the REVIEWED
 * CEILING: only human review (recorded via `lastReviewedAt`) may raise it.
 *
 * `recomputeCapabilityReadiness` derives the effective readiness from the
 * freshness of the capability's required sources (every linked, enabled
 * source with a freshness SLA). A required source that never succeeded or
 * whose `lastOkAt` is older than its SLA makes the whole capability STALE.
 * The transition is one-way for automation: healthy sources never promote a
 * capability above its ceiling, and a STALE capability stays STALE until
 * re-review — automated checks can only lower, never lift.
 *
 * `seedPhase1Coverage` upserts the ten Phase 1 capability keys from the
 * Source Readiness Matrix. It is idempotent and NEVER rewrites a stored
 * readiness that carries meaning beyond the seed: a human review
 * (`lastReviewedAt` past the epoch sentinel) or an automated STALE
 * transition always survives re-seeding. A never-reviewed, non-STALE row
 * merely holds the seed's reviewed ceiling, so re-seeding syncs it when the
 * contract's ceiling changes (owner decision 4 of 2026-08-02 regraded
 * platform:amazon-us UNAVAILABLE → MONITORED this way).
 *
 * `CAPABILITY_HARD_CEILINGS` pins grades no automated path may cross:
 * platform:amazon-us can never reach VERIFIED while the authoritative
 * Seller Central channel is login-walled. The clamp runs inside
 * `recomputeCapabilityReadiness`, so it holds even against an erroneous
 * stored raise.
 */

import type { Prisma } from "@prisma/client";

import { prisma } from "../db/client.js";
import { logger } from "../lib/logger.js";
import { PHASE1_SOURCES_BY_ID } from "../config/phase1-sources.js";
import type { SourceContract } from "../domain/intelligence/source-contract.js";
import type { ReadinessLevel } from "../domain/intelligence/taxonomy.js";

interface CapabilitySeed {
  key: string;
  platform?: "AMAZON" | "SHOPIFY";
  category?: Prisma.CoverageCapabilityCreateInput["category"];
  /** Reviewed ceiling. Seeding never raises it on existing rows. */
  readiness: ReadinessLevel;
  summary: string;
  knownGaps: string[];
  /** Required sources — Phase 1 contract ids. */
  sources: string[];
}

const CAPABILITY_SEEDS: CapabilitySeed[] = [
  {
    key: "market:us",
    readiness: "MONITORED",
    summary: "US federal trade, safety, and consumer-protection coverage.",
    knownGaps: [
      "CPSC recall REST (US-CPSC-RECALLS) disabled until its parser and fixture land",
      "FDA official recall notices (US-FDA-RECALLS) disabled pending official-notice reconciliation",
      "No US state-level regulatory coverage in Phase 1",
    ],
    sources: ["B01", "B02", "B03", "US-CPSC-RSS", "US-FTC-CONSUMER", "US-FTC-ALL", "US-FCC-FR", "US-APHIS"],
  },
  {
    key: "platform:amazon-us",
    platform: "AMAZON",
    // Owner decision 4 (2026-08-02): a lawful public route exists (public
    // announcements, pricing-page diffs, F01/F11) but the authoritative
    // Seller Central channel is login-walled — that is MONITORED by the
    // coverage page's own glossary, and the hard ceiling below keeps it
    // from ever reaching VERIFIED while the login wall stands.
    readiness: "MONITORED",
    summary: "Amazon US seller-policy coverage.",
    knownGaps: [
      "No authorized Seller Central policy channel — public announcements and pricing-page diffs only",
      "Amazon Movers & Shakers is bot-gated (D03 disabled)",
      "Secondary sources (F01/F11) can never satisfy primary evidence",
    ],
    sources: ["AMZ-ANNOUNCEMENTS", "AMZ-PRICING-PAGE", "F01", "F11"],
  },
  {
    key: "platform:shopify-us",
    platform: "SHOPIFY",
    readiness: "MONITORED",
    summary: "Shopify US seller-facing platform changes.",
    knownGaps: [
      "Official public changelog only — not every Shopify policy page",
      "No Shopify seller-center channel in Phase 1",
    ],
    sources: ["A02"],
  },
  {
    key: "category:consumer-electronics",
    category: "CONSUMER_ELECTRONICS",
    readiness: "MONITORED",
    summary: "Consumer electronics safety, regulatory, and demand coverage.",
    knownGaps: [
      "CPSC recall REST (US-CPSC-RECALLS) disabled until its parser and fixture land",
      "Amazon Movers & Shakers electronics is bot-gated (D03 disabled)",
    ],
    sources: ["US-CPSC-RSS", "US-FCC-FR", "D02"],
  },
  {
    key: "category:pet-supplies",
    category: "PET_SUPPLIES",
    readiness: "MONITORED",
    summary: "Pet supplies safety, animal-health, and demand coverage.",
    knownGaps: [
      "Amazon Pet Supplies BSR (AMZ-BSR-PET-SUPPLIES) disabled until its fixtures pass",
      "FDA animal-food recall notices disabled pending official-notice reconciliation",
    ],
    sources: ["US-CPSC-RSS", "US-APHIS"],
  },
  {
    key: "category:beauty-personal-care",
    category: "BEAUTY_PERSONAL_CARE",
    readiness: "MONITORED",
    summary: "Beauty & personal care safety, regulatory, and demand coverage.",
    knownGaps: [
      "FDA cosmetics recall notices (US-FDA-RECALLS) disabled pending official-notice reconciliation",
    ],
    sources: ["US-CPSC-RSS", "D33"],
  },
  {
    key: "category:toys-childrens-products",
    category: "TOYS_CHILDRENS_PRODUCTS",
    readiness: "MONITORED",
    summary: "Toys & children's products safety, regulatory, and demand coverage.",
    knownGaps: [
      "CPSC recall REST (US-CPSC-RECALLS) disabled — children's-product recall depth is RSS-only",
    ],
    sources: ["US-CPSC-RSS", "D32"],
  },
  {
    key: "category:home-kitchen",
    category: "HOME_KITCHEN",
    readiness: "MONITORED",
    summary: "Home & kitchen safety, regulatory, and demand coverage.",
    knownGaps: [
      "USDA FSIS recalls (US-FSIS-RECALLS) disabled — food-contact coverage is CPSC RSS only",
    ],
    sources: ["US-CPSC-RSS", "D30", "D31"],
  },
  {
    key: "category:apparel-accessories",
    category: "APPAREL_ACCESSORIES",
    readiness: "MONITORED",
    summary: "Apparel & accessories safety, labeling, and demand coverage.",
    knownGaps: [
      "Amazon Fashion BSR (AMZ-BSR-FASHION) disabled until its fixtures pass",
      "No dedicated FTC textile-labeling feed — covered only via general FTC press",
    ],
    sources: ["US-CPSC-RSS"],
  },
  {
    key: "demand:amazon-bsr",
    platform: "AMAZON",
    readiness: "EXPERIMENTAL",
    summary: "Amazon US best-seller rank movement observation.",
    knownGaps: [
      "Pet Supplies and Fashion BSR disabled until their fixtures pass",
      "Best-seller rank movement observation only — no completeness or sales-volume claim",
      "Amazon Movers & Shakers is bot-gated (D03 disabled)",
    ],
    sources: ["D02", "D30", "D31", "D32", "D33", "D34"],
  },
];

export const PHASE1_CAPABILITY_KEYS = CAPABILITY_SEEDS.map((seed) => seed.key);

/**
 * Grades no path in this module may cross, regardless of source health or a
 * stored raise. `platform:amazon-us`: the authoritative Seller Central
 * channel is login-walled, so VERIFIED is unreachable by definition — the
 * coverage page glossary reserves VERIFIED for confirmed-to-that-standard
 * coverage. STALE is a transitional state, never a ceiling target.
 */
export const CAPABILITY_HARD_CEILINGS: Readonly<Record<string, ReadinessLevel>> = {
  "platform:amazon-us": "MONITORED",
};

const GRADE_RANK: Partial<Record<ReadinessLevel, number>> = {
  UNAVAILABLE: 0,
  EXPERIMENTAL: 1,
  MONITORED: 2,
  VERIFIED: 3,
};

/** Clamp a grade to the capability's hard ceiling (no-op when none is set). */
export function clampToHardCeiling(key: string, readiness: ReadinessLevel): ReadinessLevel {
  const ceiling = CAPABILITY_HARD_CEILINGS[key];
  if (!ceiling) return readiness;
  const rank = GRADE_RANK[readiness];
  const ceilingRank = GRADE_RANK[ceiling]!;
  // STALE has no rank: it is a transitional state, not a grade to clamp.
  if (rank == null) return readiness;
  return rank > ceilingRank ? ceiling : readiness;
}

// Fail fast at module load: a capability must never reference a source that
// has no Phase 1 contract, and every capability must carry an explicit gap.
for (const seed of CAPABILITY_SEEDS) {
  if (seed.knownGaps.length === 0) {
    throw new Error(`capability ${seed.key} has an empty known-gaps list`);
  }
  for (const sourceId of seed.sources) {
    if (!PHASE1_SOURCES_BY_ID.has(sourceId)) {
      throw new Error(`capability ${seed.key} references uncontracted source ${sourceId}`);
    }
  }
}

/** Legacy `Adapter` enum has no page-diff/json distinction; map conservatively. */
const ADAPTER_BY_FETCH_METHOD: Record<SourceContract["fetchMethod"], "rss" | "fetch" | "scrapling"> = {
  RSS: "rss",
  JSON: "fetch",
  HTML: "fetch",
  PAGE_DIFF: "fetch",
  SCRAPER: "scrapling",
};

/**
 * Upsert one Source row per Phase 1 contract, populating the additive
 * contract fields. Legacy rows keep their scheduling fields on update;
 * contract-only sources (US-CPSC-RSS, AMZ-*, …) are created with conservative
 * legacy placeholders. The contract wins on `isActive`.
 */
function contractSourceUpsert(contract: SourceContract) {
  const contractFields = {
    isActive: contract.enabled,
    authorityLevel: contract.authorityLevel,
    readiness: contract.readiness,
    freshnessSlaMinutes: contract.freshnessSlaMinutes,
    fetchMethod: contract.fetchMethod,
    degradationPolicy: contract.degradationPolicy,
    userPromise: contract.userPromise,
    readinessReason: contract.note ?? null,
  } satisfies Prisma.SourceUpdateInput;

  return prisma.source.upsert({
    where: { id: contract.id },
    update: contractFields,
    create: {
      id: contract.id,
      name: contract.name,
      url: contract.url,
      adapter: ADAPTER_BY_FETCH_METHOD[contract.fetchMethod],
      frequencyCron: contract.refreshCron ?? "0 */12 * * *",
      language: "en",
      regions: ["north_america"],
      platforms: contract.platforms.map((p) => p.toLowerCase()),
      ...contractFields,
    },
  });
}

/**
 * Seed the ten Phase 1 coverage capabilities plus the Source rows they link
 * to. Idempotent: re-runs keep row ids and NEVER touch a stored readiness
 * (an automated STALE transition or a human review must survive re-seeding).
 * Rows that already match the contract are skipped, so the steady-state
 * worker-boot path is two reads and no writes.
 */
export async function seedPhase1Coverage(): Promise<void> {
  const contracts = [...PHASE1_SOURCES_BY_ID.values()];
  const existingSources = await prisma.source.findMany({
    where: { id: { in: contracts.map((c) => c.id) } },
  });
  const sourceById = new Map(existingSources.map((s) => [s.id, s]));
  const sourceWrites = contracts.filter((c) => {
    const e = sourceById.get(c.id);
    if (!e) return true;
    return (
      e.isActive !== c.enabled ||
      e.authorityLevel !== c.authorityLevel ||
      e.readiness !== c.readiness ||
      e.freshnessSlaMinutes !== c.freshnessSlaMinutes ||
      e.fetchMethod !== c.fetchMethod ||
      e.degradationPolicy !== c.degradationPolicy ||
      e.userPromise !== c.userPromise ||
      e.readinessReason !== (c.note ?? null)
    );
  });
  if (sourceWrites.length > 0) {
    await prisma.$transaction(sourceWrites.map((contract) => contractSourceUpsert(contract)));
  }

  const existingCaps = await prisma.coverageCapability.findMany({
    where: { key: { in: PHASE1_CAPABILITY_KEYS } },
    include: { sources: true },
  });
  const capByKey = new Map(existingCaps.map((c) => [c.key, c]));

  for (const seed of CAPABILITY_SEEDS) {
    const wanted = new Set(seed.sources);
    const existing = capByKey.get(seed.key);
    // A stored readiness is rewritten by seeding ONLY when it carries no
    // meaning beyond the seed: never human-reviewed (the epoch sentinel) and
    // not holding an automated STALE transition. Human reviews and STALE
    // rows always survive re-seeding.
    const syncSeedCeiling =
      existing != null &&
      existing.lastReviewedAt.getTime() === 0 &&
      existing.readiness !== "STALE" &&
      existing.readiness !== seed.readiness;
    const capability = existing &&
      !syncSeedCeiling &&
      existing.platform === (seed.platform ?? null) &&
      existing.category === (seed.category ?? null) &&
      existing.summary === seed.summary &&
      existing.knownGaps.join("\n") === seed.knownGaps.join("\n")
      ? existing
      : await prisma.coverageCapability.upsert({
          where: { key: seed.key },
          // Never rewrite a human-reviewed or STALE readiness — those belong
          // to review and to automated stale transitions, not to seeding.
          update: {
            platform: seed.platform ?? null,
            category: seed.category ?? null,
            summary: seed.summary,
            knownGaps: seed.knownGaps,
            ...(syncSeedCeiling
              ? { readiness: clampToHardCeiling(seed.key, seed.readiness) }
              : {}),
          },
          create: {
            key: seed.key,
            market: "US",
            platform: seed.platform ?? null,
            category: seed.category ?? null,
            readiness: clampToHardCeiling(seed.key, seed.readiness),
            summary: seed.summary,
            knownGaps: seed.knownGaps,
            lastReviewedAt: new Date(0), // seeded, never human-reviewed yet
          },
        });

    const links = existing?.id === capability.id ? existing.sources : [];
    const linksCurrent =
      links.length === wanted.size && links.every((link) => wanted.has(link.sourceId));
    if (linksCurrent) continue;
    await prisma.$transaction([
      prisma.capabilitySource.deleteMany({
        where: { capabilityId: capability.id, sourceId: { notIn: [...wanted] } },
      }),
      ...[...wanted].map((sourceId) =>
        prisma.capabilitySource.upsert({
          where: { capabilityId_sourceId: { capabilityId: capability.id, sourceId } },
          update: {},
          create: { capabilityId: capability.id, sourceId },
        }),
      ),
    ]);
  }
  logger.info(
    { capabilities: CAPABILITY_SEEDS.length, sourceWrites: sourceWrites.length },
    "phase 1 coverage seeded",
  );
}

type RequiredSourceFacts = {
  isActive: boolean;
  freshnessSlaMinutes: number | null;
  lastOkAt: Date | null;
};

/** A required source is overdue when it never succeeded or beat its SLA. */
export function isSourceOverdue(source: RequiredSourceFacts, now: Date): boolean {
  if (!source.isActive || source.freshnessSlaMinutes == null) return false;
  if (source.lastOkAt == null) return true;
  return now.getTime() - source.lastOkAt.getTime() > source.freshnessSlaMinutes * 60000;
}

/**
 * Recompute one capability's effective readiness from its required sources.
 * Accepts the capability id or key. Persists the STALE transition; never
 * promotes — a healthy capability keeps its reviewed ceiling, and a STALE
 * one stays STALE until human re-review. Clock is injected for determinism.
 */
export async function recomputeCapabilityReadiness(
  capabilityId: string,
  now: Date,
): Promise<ReadinessLevel> {
  const capability = await prisma.coverageCapability.findFirst({
    where: { OR: [{ id: capabilityId }, { key: capabilityId }] },
    include: { sources: { include: { source: true } } },
  });
  if (!capability) throw new Error(`unknown capability: ${capabilityId}`);

  const stale = capability.readiness !== "STALE" &&
    capability.sources.some((link) => isSourceOverdue(link.source, now));
  // The hard ceiling applies last: even an erroneous stored raise (e.g. a
  // VERIFIED that snuck past review) is clamped back — automated checks only
  // ever lower, and the ceiling defines how far they may leave a grade.
  const effective: ReadinessLevel = clampToHardCeiling(
    capability.key,
    stale ? "STALE" : capability.readiness,
  );

  if (effective !== capability.readiness) {
    await prisma.coverageCapability.update({
      where: { id: capability.id },
      data: { readiness: effective },
    });
  }
  return effective;
}

/** Recompute every stored capability at the injected clock. */
export async function recomputeAllCapabilityReadiness(
  now: Date,
): Promise<Array<{ id: string; key: string; readiness: ReadinessLevel }>> {
  const capabilities = await prisma.coverageCapability.findMany({
    select: { id: true, key: true },
    orderBy: { key: "asc" },
  });
  const results: Array<{ id: string; key: string; readiness: ReadinessLevel }> = [];
  for (const capability of capabilities) {
    const readiness = await recomputeCapabilityReadiness(capability.id, now);
    results.push({ id: capability.id, key: capability.key, readiness });
  }
  return results;
}
