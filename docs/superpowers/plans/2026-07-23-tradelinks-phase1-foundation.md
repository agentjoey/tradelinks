# TradeLinks Phase 1 Intelligence Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Wire/Radar/Daily content core with a versioned, evidence-first US market intelligence foundation whose taxonomy, source readiness, canonical changes, and review gates can support every later public and private surface.

**Architecture:** Keep the existing adapters, source observations, Prisma client, dedup utilities, queue retry knowledge, and review UI patterns, but introduce explicit domain contracts around them. `Source` and immutable `SourceItem` records feed `EvidenceCluster`, versioned `CanonicalChange`, structured `EvidenceRecord`, and `CoverageCapability`; only reviewed versions cross readiness gates. The first migration is additive and forward-only, while a later public cutover migration retires obsolete Alert/Cluster/Daily structures after their replacements are live.

**Tech Stack:** TypeScript 5, Node.js 20, Prisma 6.2, PostgreSQL/Neon, Vitest, Next.js 14 App Router, Zod, existing OpenAI-compatible model client.

## Global Constraints

- Phase 1 market is the United States; Phase 1 platforms are Amazon US and Shopify US.
- Stable Product Category taxonomy has eleven values; only Consumer Electronics, Pet Supplies, Beauty & Personal Care, Toys & Children's Products, Home & Kitchen, and Apparel & Accessories may become initial public hubs.
- Signal Type, Product Category, and Risk Attribute are separate fields and separate types.
- Recurring policy topics use six stable aggregation tags: Import & Customs, Product Safety & Recalls, Labeling & Claims, Fees & Payments, Privacy & Consumer Protection, and Listing & Account Health.
- Public explanations require Monitored or Verified capability; personal relevance requires critical sources Verified; action recommendations require Verified evidence and a reviewed action template.
- Experimental demand signals stay separate and may not claim a bestseller, launch recommendation, or guaranteed opportunity.
- All database changes use forward Prisma migrations with a Neon backup/branch checkpoint; no reverse migration is run against production data.
- No production user compatibility layer, dual writes, or new Wire/Radar/Daily UI is maintained.
- Core infrastructure cannot depend on paid proxies or commercial market-data feeds.
- P0 remains blocked until seven consecutive days of production collection meet every source SLA and every global-gap check.
- This plan changes product code only during a later execution. The present planning session changes no product code, database, or cloud configuration.

---

## Current Capability and Gap Analysis

### Reusable capabilities

| Existing path | Reusable capability | Foundation treatment |
|---|---|---|
| `src/adapters/rss.ts`, `src/adapters/json.ts`, `src/adapters/fetch.ts`, `src/adapters/blocked.ts` | RSS/JSON/HTML extraction and blocked-source handling | Preserve adapter boundary; add fixture contracts and explicit fetch outcomes. |
| `src/config/sources.ts` | Source inventory with adapter, cadence, regions, platforms, and category hint | Replace registry records with authority, readiness, SLA, fetch method, degradation, and user-promise fields. |
| `src/workers/ingest.ts` | URL normalization, Google News resolution, immutable item ingestion, coarse dedup | Keep immutable source observations; move identity and retry tracking into the new run model. |
| `src/dedup/classify.ts`, `src/dedup/resolve.ts`, `src/dedup/db.ts` | Trigram and model-assisted duplicate decisions | Wrap in deterministic cluster contracts and gold-pair tests. |
| `src/ai/stage1.ts`, `src/ai/stage2.ts` | Classification and scoring prompts | Replace the overloaded `Category` output with typed classification and manual-review thresholds. |
| `src/alerts/review.ts`, `app/admin/review/page.tsx` | Human review workflow | Reuse the review pattern for canonical version approval and evidence/action-template review. |
| `src/monitoring/health.ts`, `app/admin/sources/page.tsx` | Source freshness snapshots and admin visibility | Retain as input; replace item-count-only health with source checks, run gaps, collapse detection, and readiness transitions. |
| `src/trends/product-snapshots.ts`, `src/trends/parse-bsr.ts` | Amazon BSR observations and historical snapshots | Keep as Experimental demand evidence only, isolated from policy/compliance conclusions. |
| `app/lib/auth.ts`, `middleware.ts` | Neon Auth for the current admin surface | Preserve for admin reviewers; seller identity is specified separately in the private plan. |
| `src/email/`, `app/feed.xml/route.ts`, `app/sitemap.ts`, `app/robots.ts` | Email, RSS, sitemap, robots, canonical metadata patterns | Consume canonical versions later; do not keep current Alert/Daily payloads as a compatibility contract. |

### Material gaps

| Required capability | Current evidence in the repository | Gap closed by |
|---|---|---|
| Canonical, versioned intelligence | `Alert.sourceUrls` and `Cluster.sourceUrls` are unstructured arrays | Tasks 2, 4, and 6 |
| Separate taxonomy dimensions | Prisma `Category` mixes event kind and business topic | Task 1 |
| Readiness and coverage promises | `Source` has no authority, readiness, SLA, degradation, or promise fields | Tasks 1, 3, and 7 |
| Authoritative evidence roles | No primary/supporting/secondary role, access, licensing, excerpt, review, or retraction record | Tasks 2 and 6 |
| Reliable low-frequency checks | Health infers success from new-item volume and `lastOk`; successful-empty checks are not first-class | Tasks 2 and 7 |
| US/category source coverage | Existing official coverage is mostly USTR, CBP, Federal Register, and Shopify; Amazon official seller-policy coverage is incomplete | Tasks 3 and 7 |
| Safe classification and clustering | Model output can flow to `Alert` without a new evidence-readiness editorial gate | Tasks 4 and 5 |
| Legacy retirement | `/wire`, `/trends`, `/daily`, Alert, DailyNote, and old Cluster are still primary product structures | Public plan Task 9 after Tasks 1–8 here |

## Delivery Boundary

### Goals

- Produce a complete domain model and migration for source contracts, runs, canonical changes, versions, structured evidence, clusters, and capability coverage.
- Establish a US/Amazon/Shopify source matrix with explicit refresh, degradation, and promise behavior.
- Make duplicate merging, classification, version correction, and publication deterministic and reviewable.
- Provide a safe backfill that never silently upgrades legacy alerts to Verified.

### Non-goals

- Public product routes, RSS/API contracts, Seller Profiles, personalized relevance, seller authentication, payments, Ads, Telegram, and Phase 2 execution.
- Claiming complete Amazon seller-policy coverage or validated product demand.
- Removing existing public routes before the replacement public surfaces pass their own release gate.

### Principal risks and controls

| Risk | Control |
|---|---|
| A secondary article becomes the basis of a compliance action | Database evidence roles plus a publication invariant requiring reviewed primary official evidence for Verified. |
| Similar headlines merge unrelated regulatory events | Gold merge/non-merge sets; effective date, authority, market, and platform are part of the cluster decision. |
| Legacy data gains unsupported certainty | Backfill assigns `EXPERIMENTAL`, `IN_REVIEW`, and `SECONDARY_CONTEXT` unless a reviewer supplies authoritative evidence. |
| Amazon coverage is marketed more strongly than sources support | `CoverageCapability` starts `UNAVAILABLE` or `EXPERIMENTAL`, and the registry user-promise explicitly disallows completeness. |
| A source silently changes shape | Fixture contract, content hash, parsed-count baseline, collapse alert, and automatic `STALE` transition. |
| Migration cannot be safely reversed | Pre-migration Neon branch, additive first migration, row-count/checksum verification, forward corrective migration, and a documented traffic rollback checkpoint. |

### Acceptance standard

- Every published Verified `CanonicalChangeVersion` has at least one reviewed `PRIMARY_OFFICIAL` evidence record from a `GOVERNMENT_OFFICIAL` or `PLATFORM_OFFICIAL` source.
- Every canonical version has independent Signal Type, Product Categories, Risk Attributes, market, platform, applicable operating stages, urgency, readiness, and editorial state.
- Replaying any source batch or canonicalization batch does not create duplicate source items, clusters, canonical changes, versions, or evidence records.
- Corrections create a new immutable version; the prior version remains queryable and ceases to be current.
- Each initial category has a coverage capability with known gaps, linked sources, freshness, and readiness; no initial category begins above Monitored.
- All legacy rows are backfilled or explicitly recorded as rejected; none is silently dropped during the additive migration.

## Pactify Execution Contract

Use feature id `phase1-foundation`. Generate worker task specs from this reviewed document, inspect the generated manifest, then apply it:

```bash
PACT_AGENT_ID=codex pactify plan \
  --feature phase1-foundation \
  --planner-kind codex-cli \
  "Execute docs/superpowers/plans/2026-07-23-tradelinks-phase1-foundation.md exactly; one plan task per Pactify task; assign every implementation task to kimi and every review to claude; keep dependencies serial."
pactify plan apply phase1-foundation
```

Codex 5.6 Sol is the orchestrator/planner, Kimi Code K3 owns every implementation task, and Claude Code Opus 4.8 independently reviews every task. Every acting seat uses a separate worktree, the worker cannot self-accept, and a new reviewer session is used for each task. The feature cannot be accepted until `pnpm db:validate && pnpm lint && pnpm test && pnpm build` passes on the integrated branch.

## File Map

### Create

- `src/domain/intelligence/taxonomy.ts` — stable enums, labels, slugs, and parse guards.
- `src/domain/intelligence/readiness.ts` — readiness transition and publication policy.
- `src/domain/intelligence/source-contract.ts` — source registry schema and fetch outcomes.
- `src/domain/intelligence/canonical-change.ts` — canonical draft/version interfaces and invariants.
- `src/domain/intelligence/evidence.ts` — evidence role, authority, and Verified checks.
- `src/config/phase1-sources.ts` — complete Phase 1 source registry.
- `src/collection/run.ts` — idempotent run and source-check persistence.
- `src/canonicalize/fingerprint.ts` — deterministic event identity candidates.
- `src/canonicalize/cluster.ts` — gold-tested merge decision.
- `src/canonicalize/classify.ts` — taxonomy classification and review routing.
- `src/canonicalize/publish.ts` — immutable version publication transaction.
- `src/canonicalize/backfill.ts` — legacy Alert/Cluster conversion.
- `scripts/backfill-phase1-foundation.ts` — dry-run and apply entry point.
- `test/intelligence-taxonomy.test.ts`
- `test/readiness-policy.test.ts`
- `test/source-registry.test.ts`
- `test/collection-run.test.ts`
- `test/canonical-cluster.test.ts`
- `test/canonical-classify.test.ts`
- `test/canonical-publish.test.ts`
- `test/foundation-backfill.test.ts`
- `test/fixtures/sources/` — one immutable fixture directory per active parser.
- `test/fixtures/canonical/merge.json`
- `test/fixtures/canonical/separate.json`
- `test/fixtures/canonical/classification.json`
- `prisma/migrations/0011_phase1_intelligence_foundation/migration.sql`

### Modify

- `prisma/schema.prisma` — add Phase 1 enums/models/relations and additive fields on `Source` and `Item`.
- `src/adapters/types.ts` — return structured fetch outcome, not an ambiguous empty array.
- `src/adapters/index.ts` — resolve Phase 1 registry fetch methods.
- `src/config/sources.ts` — re-export the Phase 1 registry during the additive cutover.
- `src/workers/ingest.ts` — persist run/source-check identity and immutable observations.
- `src/dedup/resolve.ts` — delegate canonical merge to the new domain function.
- `src/ai/prompts/categorize.ts` — emit separate typed dimensions with evidence references.
- `src/alerts/review.ts` — move approval behavior to canonical publication.
- `app/admin/review/actions.ts` — approve/reject a canonical version draft.
- `app/admin/review/page.tsx` — display evidence roles, readiness, and version diff.
- `docs/architecture.md` — replace legacy content-chain documentation after the additive migration is accepted.
- `.agent/CURRENT.md` — record the foundation milestone only after code execution is complete.

## Data Model Contract

The Prisma schema must expose these names so downstream plans do not invent alternate types:

```prisma
enum MarketCode { US }
enum PlatformCode { AMAZON SHOPIFY }
enum OperatingStage { EXPLORING_US PREPARING_TO_LAUNCH ALREADY_SELLING }
enum SignalType {
  REGULATORY
  PLATFORM_POLICY
  LOGISTICS
  DEMAND
  INDUSTRY
  PRACTICAL_GUIDANCE
}
enum ProductCategory {
  ALL_PRODUCTS
  CONSUMER_ELECTRONICS
  PET_SUPPLIES
  BEAUTY_PERSONAL_CARE
  TOYS_CHILDRENS_PRODUCTS
  HOME_KITCHEN
  APPAREL_ACCESSORIES
  HEALTH_SUPPLEMENTS
  FOOD_BEVERAGE
  SPORTS_OUTDOORS
  AUTOMOTIVE_TOOLS
}
enum RiskAttribute {
  BATTERY
  WIRELESS_RADIO
  CHILDREN
  INGESTIBLE
  TOPICAL_COSMETIC
  FOOD_CONTACT
  MEDICAL_CLAIM
  ANIMAL_HEALTH
  CHEMICAL_HAZMAT
  TEXTILE_LABELING
  ELECTRICAL_SAFETY
}
enum PolicyTopic {
  IMPORT_CUSTOMS
  PRODUCT_SAFETY_RECALLS
  LABELING_CLAIMS
  FEES_PAYMENTS
  PRIVACY_CONSUMER_PROTECTION
  LISTING_ACCOUNT_HEALTH
}
enum ReadinessLevel { UNAVAILABLE EXPERIMENTAL MONITORED VERIFIED STALE }
enum EvidenceRole { PRIMARY_OFFICIAL SUPPORTING_OFFICIAL SECONDARY_CONTEXT }
enum AuthorityLevel {
  GOVERNMENT_OFFICIAL
  PLATFORM_OFFICIAL
  INDUSTRY_OFFICIAL
  REPUTABLE_SECONDARY
  COMMUNITY
}
enum EvidenceAccess { PUBLIC RESTRICTED UNAVAILABLE }
enum EditorialStatus { DRAFT IN_REVIEW PUBLISHED REJECTED RETRACTED }
enum RunStatus {
  RUNNING
  SUCCEEDED_EMPTY
  SUCCEEDED_ITEMS
  PARTIAL
  FAILED
  BLOCKED
}
enum PipelineJobType { COLLECT CANONICALIZE PUBLISH BRIEFING EMAIL HEALTH }

model PipelineRun {
  id            String          @id @default(cuid())
  jobType       PipelineJobType
  scopeKey      String
  scheduledFor  DateTime
  startedAt     DateTime        @default(now())
  finishedAt    DateTime?
  status        RunStatus
  itemCount     Int             @default(0)
  outputFingerprint String?
  metadata      Json?
  errorCode     String?
  errorMessage  String?
  runnerVersion String
  sourceChecks  SourceCheck[]
  @@unique([jobType, scopeKey, scheduledFor])
}

model SourceCheck {
  id          String    @id @default(cuid())
  runId       String
  sourceId    String
  status      RunStatus
  itemCount   Int       @default(0)
  httpStatus  Int?
  contentHash String?
  failureCode String?
  error       String?
  checkedAt   DateTime  @default(now())
  run         PipelineRun @relation(fields: [runId], references: [id])
  source      Source      @relation(fields: [sourceId], references: [id])
  @@unique([runId, sourceId])
}

model EvidenceCluster {
  id             String                  @id @default(cuid())
  fingerprint    String                  @unique
  status         EditorialStatus         @default(DRAFT)
  members        EvidenceClusterMember[]
  canonicalChange CanonicalChange?
  createdAt      DateTime                @default(now())
  updatedAt      DateTime                @updatedAt
}

model EvidenceClusterMember {
  clusterId String
  itemId    String
  role      EvidenceRole
  cluster   EvidenceCluster @relation(fields: [clusterId], references: [id])
  item      Item            @relation(fields: [itemId], references: [id])
  @@id([clusterId, itemId])
}

model CanonicalChange {
  id        String                   @id @default(cuid())
  slug      String                   @unique
  clusterId String                   @unique
  cluster   EvidenceCluster          @relation(fields: [clusterId], references: [id])
  versions  CanonicalChangeVersion[]
  createdAt DateTime                 @default(now())
  updatedAt DateTime                 @updatedAt
}

model CanonicalChangeVersion {
  id                    String            @id @default(cuid())
  canonicalChangeId     String
  version               Int
  isCurrent             Boolean           @default(false)
  title                 String
  summary               String
  signalType            SignalType
  market                MarketCode        @default(US)
  regions               String[]
  platforms             PlatformCode[]
  operatingStages       OperatingStage[]
  productCategories     ProductCategory[]
  riskAttributes        RiskAttribute[]
  policyTopics          PolicyTopic[]
  classificationConfidence Float?
  sourcePublishedAt     DateTime
  effectiveAt           DateTime?
  urgency               Int
  readiness             ReadinessLevel
  generalImpact         String
  generalActionTemplate String?
  actionTemplateReviewedAt DateTime?
  actionTemplateReviewedBy String?
  editorialStatus       EditorialStatus   @default(DRAFT)
  correctionReason      String?
  rejectionReason       String?
  reviewedAt            DateTime?
  reviewedBy            String?
  createdAt             DateTime          @default(now())
  updatedAt             DateTime          @updatedAt
  canonicalChange       CanonicalChange   @relation(fields: [canonicalChangeId], references: [id])
  evidence              EvidenceRecord[]
  @@unique([canonicalChangeId, version])
}

model EvidenceRecord {
  id                    String          @id @default(cuid())
  changeVersionId       String
  sourceId              String
  sourceItemId          String?
  url                   String
  role                  EvidenceRole
  authorityLevel        AuthorityLevel
  publishedAt           DateTime?
  access                EvidenceAccess
  licenseNote           String
  excerpt               String?
  normalizedSummary     String
  contentHash           String
  fetchedAt             DateTime
  reviewedAt            DateTime?
  retractedAt           DateTime?
  changeVersion         CanonicalChangeVersion @relation(fields: [changeVersionId], references: [id])
  source                Source                 @relation(fields: [sourceId], references: [id])
  sourceItem            Item?                  @relation(fields: [sourceItemId], references: [id])
  @@unique([changeVersionId, url])
}

model CoverageCapability {
  id             String            @id @default(cuid())
  key            String            @unique
  market         MarketCode
  platform       PlatformCode?
  category       ProductCategory?
  readiness      ReadinessLevel
  summary        String
  knownGaps      String[]
  lastReviewedAt DateTime
  sources        CapabilitySource[]
}

model CapabilitySource {
  capabilityId String
  sourceId     String
  capability   CoverageCapability @relation(fields: [capabilityId], references: [id])
  source       Source             @relation(fields: [sourceId], references: [id])
  @@id([capabilityId, sourceId])
}
```

`0011_phase1_intelligence_foundation/migration.sql` must also create a partial unique index so a canonical change has at most one current version:

```sql
CREATE UNIQUE INDEX "CanonicalChangeVersion_one_current"
ON "CanonicalChangeVersion" ("canonicalChangeId")
WHERE "isCurrent" = true;
```

Extend `Source` with `authorityLevel`, `readiness`, `freshnessSlaMinutes`, `fetchMethod`, `degradationPolicy`, `userPromise`, `readinessReason`, and `lastReviewedAt`. Keep `adapter` and `frequencyCron` until the operations cutover because they are consumed by the existing worker.

## Source Readiness Matrix

Every entry is a product contract, not only a crawler setting:

| Registry ID / source | Authority and fetch | Refresh | Initial readiness | Degradation | User promise |
|---|---|---:|---|---|---|
| `B01` USTR RSS | Government official, RSS | 12h | Monitored after fixture and 7-day checks | Stale after 24h overdue; preserve history | US trade-policy context, not complete customs advice |
| `B02` CBP RSS | Government official, RSS | 12h | Monitored after fixture and 7-day checks | Stale after 24h overdue | Official CBP announcements, not personalized customs advice |
| `B03` Federal Register API | Government official, JSON with agency/term filters | 12h | Monitored; individual reviewed rules can be Verified | Retry next cron; Stale at 24h overdue | Federal rule/change coverage for configured agencies and terms |
| `US-CPSC-RECALLS` | Government official, CPSC recall REST JSON plus recall RSS corroboration | 4h | Experimental until fixtures and 7-day checks; then Monitored | REST failure falls back to official RSS; Stale at 8h overdue | Recall notices in covered categories; no legal determination |
| `US-FDA-RECALLS` | Government official, FDA recall notices; openFDA enforcement only as discovery context | 6h | Monitored only after official-notice reconciliation | Suppress action when official notice is unavailable | FDA notices with official-page verification; openFDA alone never triggers an action |
| `US-FTC-CONSUMER` | Government official, consumer-protection RSS | 6h | Experimental, then Monitored | Stale at 12h overdue | Seller-relevant consumer-protection changes selected by review |
| `US-FCC-FR` | Government official, Federal Register FCC filter | 12h | Experimental | No fallback to secondary claims; Stale at 24h | Configured federal FCC rule coverage, not all FCC guidance |
| `US-FSIS-RECALLS` | Government official, FSIS recall REST JSON | 6h | Experimental | Keep Food & Beverage hub unavailable if source is Stale | Recall context for the non-launch taxonomy category |
| `US-APHIS` | Government official APHIS Announcements HTML | 24h | Experimental | Manual review; no new actions when overdue | Animal/plant health context; no completeness claim |
| `A02` Shopify Changelog | Platform official, RSS | 4h | Monitored; reviewed seller changes can be Verified | Stale after 8h overdue | Official public changelog items, not every Shopify policy page |
| `AMZ-ANNOUNCEMENTS` | Platform official, public announcements HTML | 6h | Monitored | Mark Stale after 12h; retain current Amazon capability gap | Public announcements only; not complete Seller Central policy coverage |
| `AMZ-PRICING-PAGE` | Platform official, allowlisted public pricing page with content hash | 24h | Experimental | Any hash change creates review draft; fetch failure never creates a change | Pricing-page change detection only; no broader policy promise |
| `F01`, `F11` Amazon secondary reporting | Reputable secondary, RSS/HTML | 6h | Monitored as context | Never satisfy Verified primary-evidence invariant | Discovery and context only |
| `E01`, `E02` logistics reporting | Reputable secondary, RSS | 6h | Monitored as context | Official CBP/USTR evidence required for action | Operational context only |
| `D02`, `D30`–`D34`, `AMZ-BSR-PET-SUPPLIES`, `AMZ-BSR-FASHION` | Amazon public BSR pages, short-lived scraper | 12h | Experimental; new Pet/Fashion IDs stay disabled until fixtures pass | Hide new demand cards when overdue; do not affect policy pages | Rank movement observation only |
| `D03` Amazon Movers & Shakers | Bot-gated public page | No production schedule | Unavailable | No automated fallback or proxy | No Phase 1 promise |
| Google Trends | Unproven public access | No production schedule | Unavailable | No fallback source | No Phase 1 demand promise |

All non-US or unsupported registry entries (`B04`–`B07`, `B16`, `D04`–`D07`, `D11`, `D12`, `D20`–`D23`, `D40`–`D62`, `F04`, `F05`, `F09`, `F10`, `F13`–`F15`, `A01`, `A03`, `A04`, `X01`) are disabled, marked `UNAVAILABLE`, and excluded from user promises. US secondary discovery sources `F02`, `F03`, and `F12` may remain Monitored context but cannot satisfy primary evidence.

The new registry uses this exact official allowlist:

```text
US-CPSC-RECALLS  https://www.saferproducts.gov/RestWebServices/Recall?format=json
US-CPSC-RSS      https://www.cpsc.gov/Newsroom/CPSC-RSS-Feed/Recalls-RSS
US-FDA-ENFORCEMENT-DISCOVERY https://api.fda.gov/food/enforcement.json
US-FTC-CONSUMER  https://www.ftc.gov/feeds/press-release-consumer-protection.xml
US-FTC-ALL       https://www.ftc.gov/feeds/press-release.xml
US-FCC-FR        https://www.federalregister.gov/api/v1/documents.json?conditions[agencies][]=federal-communications-commission
US-FSIS-RECALLS  https://www.fsis.usda.gov/fsis/api/recall/v/1
US-APHIS         https://www.aphis.usda.gov/news/releases
A02              https://changelog.shopify.com/feed.xml
AMZ-ANNOUNCEMENTS https://sell.amazon.com/blog/announcements
AMZ-PRICING-PAGE https://sell.amazon.com/pricing
AMZ-BSR-PET-SUPPLIES https://www.amazon.com/gp/bestsellers/pet-supplies/
AMZ-BSR-FASHION https://www.amazon.com/gp/bestsellers/fashion/
```

FDA enforcement is discovery-only because the official API warns against using openFDA alone to issue public alerts or track a recall lifecycle. `AMZ-PRICING-PAGE` remains Experimental and any content-hash change creates an in-review draft; it does not satisfy complete seller-policy coverage.

### Task 1: Lock the Taxonomy and Readiness Policy

**Files:**

- Create: `src/domain/intelligence/taxonomy.ts`
- Create: `src/domain/intelligence/readiness.ts`
- Test: `test/intelligence-taxonomy.test.ts`
- Test: `test/readiness-policy.test.ts`

**Interfaces:**

- Produces: `parseProductCategory(value: string): ProductCategory | null`, `categorySlug(category: ProductCategory): string`, `canPublishPublic(readiness: ReadinessLevel): boolean`, `canPersonalize(change: PublicationFacts): boolean`, `canRecommendAction(change: PublicationFacts): boolean`.
- Consumes: Prisma enum names defined in the Data Model Contract.

- [ ] **Step 1: Write taxonomy and readiness failures**

```ts
it("keeps signal, category, and risk dimensions independent", () => {
  expect(categorySlug("TOYS_CHILDRENS_PRODUCTS")).toBe("toys-childrens-products");
  expect(parseProductCategory("regulatory")).toBeNull();
});

it("requires reviewed primary evidence for an action", () => {
  expect(canRecommendAction({
    readiness: "VERIFIED",
    hasReviewedPrimaryOfficialEvidence: true,
    actionTemplateReviewed: true,
  })).toBe(true);
  expect(canRecommendAction({
    readiness: "MONITORED",
    hasReviewedPrimaryOfficialEvidence: true,
    actionTemplateReviewed: true,
  })).toBe(false);
});
```

- [ ] **Step 2: Confirm the tests fail**

Run: `pnpm vitest run test/intelligence-taxonomy.test.ts test/readiness-policy.test.ts`

Expected: FAIL because the intelligence domain modules do not exist.

- [ ] **Step 3: Implement exhaustive constants and pure policy**

```ts
export const INITIAL_PUBLIC_CATEGORIES = [
  "CONSUMER_ELECTRONICS",
  "PET_SUPPLIES",
  "BEAUTY_PERSONAL_CARE",
  "TOYS_CHILDRENS_PRODUCTS",
  "HOME_KITCHEN",
  "APPAREL_ACCESSORIES",
] as const;

export function canRecommendAction(facts: PublicationFacts): boolean {
  return facts.readiness === "VERIFIED"
    && facts.hasReviewedPrimaryOfficialEvidence
    && facts.actionTemplateReviewed;
}
```

Implement every enum value and label from the approved spec; use exhaustive `satisfies Record<ProductCategory, string>`, `satisfies Record<RiskAttribute, string>`, and `satisfies Record<PolicyTopic, string>` maps so a missing taxonomy value fails TypeScript.

- [ ] **Step 4: Verify the domain contract**

Run: `pnpm vitest run test/intelligence-taxonomy.test.ts test/readiness-policy.test.ts && pnpm lint`

Expected: both test files PASS and TypeScript exits 0.

- [ ] **Step 5: Commit the independently reviewable contract**

```bash
git add src/domain/intelligence test/intelligence-taxonomy.test.ts test/readiness-policy.test.ts
git commit -m "feat: define phase1 intelligence taxonomy"
```

**Definition of done:** All spec taxonomy values are exhaustive, the six launch categories are an explicit subset, and pure tests prove each readiness gate.

### Task 2: Add the Forward-Only Intelligence Schema

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/0011_phase1_intelligence_foundation/migration.sql`
- Test: `test/canonical-publish.test.ts`
- Modify: `docs/architecture.md`

**Interfaces:**

- Consumes: exact enum and model names in the Data Model Contract.
- Produces: Prisma clients for `pipelineRun`, `sourceCheck`, `evidenceCluster`, `canonicalChange`, `canonicalChangeVersion`, `evidenceRecord`, and `coverageCapability`.

- [ ] **Step 1: Add a schema-contract test before changing Prisma**

```ts
it("rejects a second current version for one change", async () => {
  const change = await seedCanonicalChange();
  await seedVersion(change.id, { version: 1, isCurrent: true });
  await expect(seedVersion(change.id, { version: 2, isCurrent: true }))
    .rejects.toMatchObject({ code: "P2002" });
});
```

- [ ] **Step 2: Confirm the schema cannot satisfy the test**

Run: `pnpm db:validate && pnpm vitest run test/canonical-publish.test.ts`

Expected: validation may pass for the old schema, but the test FAILS because canonical models are absent.

- [ ] **Step 3: Create a protected Neon checkpoint and migration**

Execution precondition:

```bash
neon branches create --name phase1-foundation-pre-migration --project-id "$NEON_PROJECT_ID" --parent production
pnpm db:gen
pnpm exec prisma migrate dev --name phase1_intelligence_foundation
```

Use a project-scoped `NEON_PROJECT_ID`; never print connection strings. Add the partial unique index shown above to the generated SQL. The migration is additive: it does not drop or rename current tables.

- [ ] **Step 4: Validate locally and against an isolated Neon branch**

Run:

```bash
pnpm db:validate
pnpm exec prisma migrate status
pnpm vitest run test/canonical-publish.test.ts
```

Expected: schema validation exits 0, migration status reports up to date, and the partial-uniqueness test PASSes.

- [ ] **Step 5: Document the new content chain and rollback checkpoint**

Add to `docs/architecture.md`:

```text
Source → Item → EvidenceCluster → CanonicalChange → CanonicalChangeVersion
                                           └────→ EvidenceRecord
SourceCheck and PipelineRun record checks independently from new-item volume.
```

Rollback procedure: stop new writers, route readers back to the pre-cutover public release, retain additive tables, compare row counts/content hashes, and ship a forward corrective migration. Restore the `phase1-foundation-pre-migration` branch only into a new branch for investigation; never overwrite production in place.

- [ ] **Step 6: Commit schema and architecture together**

```bash
git add prisma/schema.prisma prisma/migrations/0011_phase1_intelligence_foundation docs/architecture.md test/canonical-publish.test.ts
git commit -m "feat: add canonical intelligence schema"
```

**Definition of done:** The additive migration applies to a production-shaped branch, all constraints are verified, legacy tables remain untouched, and architecture documentation matches Prisma.

### Task 3: Replace the Source Registry with Explicit Contracts

**Files:**

- Create: `src/domain/intelligence/source-contract.ts`
- Create: `src/config/phase1-sources.ts`
- Modify: `src/config/sources.ts`
- Modify: `src/adapters/types.ts`
- Modify: `src/adapters/index.ts`
- Test: `test/source-registry.test.ts`
- Create fixtures under: `test/fixtures/sources/`

**Interfaces:**

- Produces: `SourceContractSchema`, `PHASE1_SOURCES`, `FetchOutcome = { kind: "success"; items: RawItem[]; httpStatus: number; contentHash: string } | { kind: "blocked" | "failed"; code: string; retryable: boolean; httpStatus?: number }`.
- Consumes: `MarketCode`, `PlatformCode`, `ProductCategory`, `ReadinessLevel`, and `AuthorityLevel`.

- [ ] **Step 1: Encode registry and fetch-outcome expectations**

```ts
it("gives every enabled source an SLA and a truthful promise", () => {
  for (const source of PHASE1_SOURCES.filter((value) => value.enabled)) {
    expect(source.freshnessSlaMinutes).toBeGreaterThan(0);
    expect(source.userPromise.length).toBeGreaterThan(20);
    expect(source.degradationPolicy.length).toBeGreaterThan(20);
  }
});

it("does not treat an empty official feed as a failure", async () => {
  const outcome = await parseFixture("B03", "empty.json");
  expect(outcome).toMatchObject({ kind: "success", items: [] });
});
```

- [ ] **Step 2: Prove current types cannot express the contract**

Run: `pnpm vitest run test/source-registry.test.ts`

Expected: FAIL on missing `PHASE1_SOURCES` and `FetchOutcome`.

- [ ] **Step 3: Implement the source matrix exactly**

```ts
export const PHASE1_SOURCES = SourceContractSchema.array().parse([
  {
    id: "B03",
    name: "Federal Register",
    market: "US",
    platforms: [],
    categories: ["ALL_PRODUCTS"],
    authorityLevel: "GOVERNMENT_OFFICIAL",
    readiness: "MONITORED",
    fetchMethod: "JSON",
    freshnessSlaMinutes: 1440,
    refreshCron: "17 */12 * * *",
    degradationPolicy: "Retry on the next cron; mark stale after 24 hours without a successful check.",
    userPromise: "Federal rule coverage for the configured agencies and seller-relevant terms.",
    enabled: true,
  },
]);
```

Add every row from the Source Readiness Matrix and explicitly disable every listed out-of-scope registry ID. Implement official CPSC, FDA, FTC, FCC-via-Federal-Register, FSIS, APHIS probe, Amazon public announcements/page-diff, and Shopify fixtures before enabling their schedules.

- [ ] **Step 4: Verify parsing, license/access, and failure semantics**

Run: `pnpm vitest run test/source-registry.test.ts test/adapters.test.ts test/json-adapter.test.ts test/blocked.test.ts`

Expected: PASS with snapshots proving every active parser yields normalized items, a successful-empty outcome remains successful, and blocked/failed outcomes retain retryability.

- [ ] **Step 5: Commit registry and fixtures**

```bash
git add src/domain/intelligence/source-contract.ts src/config/phase1-sources.ts src/config/sources.ts src/adapters test/source-registry.test.ts test/fixtures/sources
git commit -m "feat: define phase1 source contracts"
```

**Definition of done:** Every source states readiness, authority, collection method, refresh, SLA, degradation, and user promise; a parser fixture exists before a source can be scheduled.

### Task 4: Make Collection Runs and Source Checks Idempotent

**Files:**

- Create: `src/collection/run.ts`
- Modify: `src/workers/ingest.ts`
- Test: `test/collection-run.test.ts`

**Interfaces:**

- Produces: `beginRun(input: BeginRunInput & { scopeKey: string }): Promise<PipelineRun>`, `recordSourceOutcome(runId: string, sourceId: string, outcome: FetchOutcome): Promise<SourceCheck>`, `finishRun(runId: string): Promise<PipelineRun>`.
- Consumes: `FetchOutcome`, Prisma run/check models, existing item URL/hash dedup.

- [ ] **Step 1: Specify retries and successful-empty checks**

```ts
it("reuses a run for the same job and scheduled slot", async () => {
  const first = await beginRun({ jobType: "COLLECT", scopeKey: "fast", scheduledFor: slot, runnerVersion: "abc" });
  const second = await beginRun({ jobType: "COLLECT", scopeKey: "fast", scheduledFor: slot, runnerVersion: "abc" });
  expect(second.id).toBe(first.id);
});

it("records an empty success without moving source freshness backward", async () => {
  const check = await recordSourceOutcome(run.id, "B03", {
    kind: "success", items: [], httpStatus: 200, contentHash: "empty-hash",
  });
  expect(check.status).toBe("SUCCEEDED_EMPTY");
});
```

- [ ] **Step 2: Confirm the run ledger is absent**

Run: `pnpm vitest run test/collection-run.test.ts`

Expected: FAIL because run persistence functions are missing.

- [ ] **Step 3: Implement transaction and idempotency keys**

```ts
export async function beginRun(input: BeginRunInput) {
  return prisma.pipelineRun.upsert({
    where: {
      jobType_scopeKey_scheduledFor: {
        jobType: input.jobType,
        scopeKey: input.scopeKey,
        scheduledFor: input.scheduledFor,
      },
    },
    create: { ...input, status: "RUNNING" },
    update: {},
  });
}
```

In `recordSourceOutcome`, upsert on `[runId, sourceId]`, set `Source.lastOk` for both `SUCCEEDED_EMPTY` and `SUCCEEDED_ITEMS`, never set it for blocked/failed outcomes, and increment inserted item count only after item transaction success.

- [ ] **Step 4: Verify replay behavior**

Run: `pnpm vitest run test/collection-run.test.ts test/source-hash.test.ts test/gnews.test.ts`

Expected: PASS; executing the same run twice leaves stable counts and stable item IDs.

- [ ] **Step 5: Commit the ledger**

```bash
git add src/collection/run.ts src/workers/ingest.ts test/collection-run.test.ts
git commit -m "feat: record idempotent collection runs"
```

**Definition of done:** Every collection attempt is diagnosable, successful-empty is distinct from failure, and retries do not duplicate work.

### Task 5: Build Gold-Tested Clustering and Classification

**Files:**

- Create: `src/canonicalize/fingerprint.ts`
- Create: `src/canonicalize/cluster.ts`
- Create: `src/canonicalize/classify.ts`
- Modify: `src/dedup/resolve.ts`
- Modify: `src/ai/prompts/categorize.ts`
- Test: `test/canonical-cluster.test.ts`
- Test: `test/canonical-classify.test.ts`
- Create: `test/fixtures/canonical/merge.json`
- Create: `test/fixtures/canonical/separate.json`
- Create: `test/fixtures/canonical/classification.json`

**Interfaces:**

- Produces: `candidateFingerprint(item: SourceItemFacts): string`, `decideCluster(input: ClusterInput): Promise<ClusterDecision>`, `classifyChange(input: ClusterFacts): Promise<ClassificationDecision>`.
- `ClassificationDecision` is `{ signalType; productCategories; riskAttributes; policyTopics; market; platforms; operatingStages; confidence; evidenceItemIds; requiresReview }`.
- Consumes: immutable `Item`, source authority, existing trigram/LLM duplicate helpers.

- [ ] **Step 1: Add merge, separation, and ambiguity gold tests**

```ts
it.each(loadPairs("merge.json"))("merges $name", async ({ left, right }) => {
  expect((await decideCluster({ left, right })).decision).toBe("MERGE");
});

it.each(loadPairs("separate.json"))("keeps $name separate", async ({ left, right }) => {
  expect((await decideCluster({ left, right })).decision).toBe("SEPARATE");
});

it("routes low-confidence category output to review", async () => {
  expect((await classifyChange(ambiguousFixture)).requiresReview).toBe(true);
});
```

- [ ] **Step 2: Observe the failing gold suite**

Run: `pnpm vitest run test/canonical-cluster.test.ts test/canonical-classify.test.ts`

Expected: FAIL because the canonicalization modules and fixtures do not exist.

- [ ] **Step 3: Implement deterministic-first decisions**

```ts
export function candidateFingerprint(item: SourceItemFacts): string {
  return stableHash([
    item.market,
    item.authorityEventId ?? normalizeTitle(item.title),
    isoDate(item.effectiveAt ?? item.publishedAt),
  ].join("|"));
}
```

Use exact official event/recall/rule IDs first. Otherwise require compatible market/platform/effective-date windows before trigram or model comparison. Classification confidence below `0.80`, ambiguous operating-stage impact, multiple incompatible categories, unsupported dates, or missing evidence item IDs sets `requiresReview: true`.

- [ ] **Step 4: Verify the gold sets and existing dedup behavior**

Run: `pnpm vitest run test/canonical-cluster.test.ts test/canonical-classify.test.ts test/dedup.test.ts`

Expected: PASS with 100% of merge/separate gold pairs correct and all ambiguous classifications routed to review.

- [ ] **Step 5: Commit canonicalization**

```bash
git add src/canonicalize src/dedup/resolve.ts src/ai/prompts/categorize.ts test/canonical-cluster.test.ts test/canonical-classify.test.ts test/fixtures/canonical
git commit -m "feat: canonicalize intelligence evidence"
```

**Definition of done:** Official identifiers dominate clustering, false merges are protected by the separation set, and no low-confidence classification auto-publishes.

### Task 6: Publish Immutable Versions with Structured Evidence

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/0012_phase1_publication_review_fields/migration.sql`
- Create: `src/domain/intelligence/canonical-change.ts`
- Create: `src/domain/intelligence/evidence.ts`
- Create: `src/canonicalize/publish.ts`
- Modify: `src/alerts/review.ts`
- Modify: `app/admin/review/actions.ts`
- Modify: `app/admin/review/page.tsx`
- Create: `app/admin/review/review-controls.tsx`
- Test: `test/canonical-publish.test.ts`
- Modify: `docs/architecture.md`

**Interfaces:**

- Produces: `publishCanonicalDraft(draftId: string, reviewerId: string): Promise<CanonicalChangeVersion>`, `correctCanonicalChange(input: CorrectionInput): Promise<CanonicalChangeVersion>`, `rejectCanonicalDraft(draftId: string, reviewerId: string, reason: string): Promise<CanonicalChangeVersion>`, `reviewCanonicalActionTemplate(draftId: string, reviewerId: string): Promise<CanonicalChangeVersion>`, `assertPublishableVersion(input: VersionWithEvidence): void`.
- Consumes: readiness policy, classification decision, evidence records, current admin auth.

- [ ] **Step 1: Add publication and correction failures**

```ts
it("blocks Verified publication without reviewed primary official evidence", async () => {
  await expect(publishCanonicalDraft(secondaryOnlyDraft.id, "reviewer-1"))
    .rejects.toThrow("VERIFIED_REQUIRES_REVIEWED_PRIMARY_OFFICIAL_EVIDENCE");
});

it("creates version 2 and preserves version 1 on correction", async () => {
  const corrected = await correctCanonicalChange(correction);
  expect(corrected.version).toBe(2);
  expect(await loadVersion(change.id, 1)).toMatchObject({ isCurrent: false });
});

it("requires and persists an explicit canonical rejection reason", async () => {
  await expect(rejectCanonicalDraft(draft.id, "reviewer-1", " "))
    .rejects.toThrow("REJECTION_REASON_REQUIRED");
});
```

- [ ] **Step 2: Confirm unsafe legacy approval still fails the new contract**

Run: `pnpm vitest run test/canonical-publish.test.ts`

Expected: FAIL on missing publication API.

- [ ] **Step 3: Implement one publication transaction**

Add a forward-only `0012_phase1_publication_review_fields` migration with
nullable `classificationConfidence Float?` and `rejectionReason String?`. Do
not edit the already-applied `0011` migration. Apply and verify `0012` only on
the approved isolated Neon branch after checking its exact project, parent,
branch identity, non-default status, and expiry.

```ts
await tx.canonicalChangeVersion.updateMany({
  where: { canonicalChangeId: draft.canonicalChangeId, isCurrent: true },
  data: { isCurrent: false },
});
return tx.canonicalChangeVersion.update({
  where: { id: draft.id },
  data: {
    isCurrent: true,
    editorialStatus: "PUBLISHED",
    reviewedAt: new Date(),
    reviewedBy: reviewerId,
  },
});
```

Call `assertPublishableVersion` before the transaction. Evidence must preserve source ID, original URL, role, authority, access, license note, normalized summary, content hash, fetch time, and review time. A correction requires a non-empty `correctionReason`.

- [ ] **Step 4: Update the admin review surface**

Render a version diff, the source readiness, evidence role/authority/access, primary-source link, effective-date provenance, classification confidence, action-template review control, and explicit rejection reason. The admin route remains protected by existing Neon Auth.

Run: `pnpm db:validate && pnpm exec prisma migrate status && pnpm vitest run test/canonical-publish.test.ts test/alert-route.test.ts && pnpm lint`

Expected: PASS; TypeScript verifies the server actions, and no old Alert can be approved through the updated action.

Preserve the existing Telegram/CLI `approveAlert`, `rejectAlert`, `listPending`,
and `getAlertBrief` runtime contracts. The retirement applies only to the admin
web actions: they accept canonical draft/version IDs and must leave a legacy
Alert unchanged when given its ID.

- [ ] **Step 5: Commit publication and review**

```bash
git add prisma/schema.prisma prisma/migrations/0012_phase1_publication_review_fields src/domain/intelligence src/canonicalize/publish.ts src/alerts/review.ts app/admin/review test/canonical-publish.test.ts docs/architecture.md PRODUCT.md
git commit -m "feat: publish reviewed canonical versions"
```

**Definition of done:** Verified publication is impossible without authoritative reviewed evidence, corrections are immutable versions, and the reviewer can inspect every field used downstream.

### Task 7: Seed Coverage Capabilities and Enforce Readiness Transitions

**Files:**

- Create: `src/canonicalize/coverage.ts`
- Modify: `src/workers/seed-sources.ts`
- Modify: `src/monitoring/health.ts`
- Test: `test/coverage-readiness.test.ts`
- Modify: `app/admin/sources/page.tsx`

**Interfaces:**

- Produces: `recomputeCapabilityReadiness(capabilityId: string, now: Date): Promise<ReadinessLevel>`, `seedPhase1Coverage(): Promise<void>`.
- Consumes: `PHASE1_SOURCES`, source checks, readiness transition policy.

- [ ] **Step 1: Test stale transitions and launch-hub minimums**

```ts
it("makes a capability stale when a required source misses its SLA", async () => {
  await seedCapability({ readiness: "MONITORED", requiredSourceLastOk: hoursAgo(30), slaHours: 24 });
  expect(await recomputeCapabilityReadiness("us-regulatory", now)).toBe("STALE");
});

it("never seeds an initial category above monitored", async () => {
  await seedPhase1Coverage();
  expect(await loadLaunchCategoryReadiness()).not.toContain("VERIFIED");
});
```

- [ ] **Step 2: Confirm health snapshots cannot drive the required transitions**

Run: `pnpm vitest run test/coverage-readiness.test.ts test/health.test.ts`

Expected: the new coverage test FAILS.

- [ ] **Step 3: Seed explicit capability records**

Create capability keys:

```ts
[
  "market:us",
  "platform:amazon-us",
  "platform:shopify-us",
  "category:consumer-electronics",
  "category:pet-supplies",
  "category:beauty-personal-care",
  "category:toys-childrens-products",
  "category:home-kitchen",
  "category:apparel-accessories",
  "demand:amazon-bsr",
]
```

Seed Amazon policy as `UNAVAILABLE`, Amazon BSR as `EXPERIMENTAL`, Shopify updates and US market as no higher than `MONITORED`, and each category with its agency/platform sources plus a non-empty known-gaps list.

- [ ] **Step 4: Verify transitions and admin visibility**

Run: `pnpm vitest run test/coverage-readiness.test.ts test/health.test.ts && pnpm lint`

Expected: PASS; stale required sources lower capability readiness, and the admin page renders source SLA, last successful check, promise, degradation, and linked capabilities.

- [ ] **Step 5: Commit capability readiness**

```bash
git add src/canonicalize/coverage.ts src/workers/seed-sources.ts src/monitoring/health.ts app/admin/sources/page.tsx test/coverage-readiness.test.ts
git commit -m "feat: enforce source coverage readiness"
```

**Definition of done:** Capability readiness is data-driven but cannot auto-promote above its reviewed ceiling; all launch-category gaps are visible.

### Task 8: Backfill Legacy Intelligence without Upgrading Trust

**Files:**

- Create: `src/canonicalize/backfill.ts`
- Create: `scripts/backfill-phase1-foundation.ts`
- Test: `test/foundation-backfill.test.ts`
- Modify: `.agent/CURRENT.md`

**Interfaces:**

- Produces: `planFoundationBackfill(): Promise<BackfillReport>`, `applyFoundationBackfill(reportFingerprint: string): Promise<BackfillReport>`.
- Consumes: existing `Item`, `Cluster`, `Alert`, source registry, canonical publication primitives.

- [ ] **Step 1: Test dry-run stability and conservative trust**

```ts
it("maps a legacy alert to an in-review experimental draft", async () => {
  const report = await planFoundationBackfill();
  expect(report.drafts[0]).toMatchObject({
    readiness: "EXPERIMENTAL",
    editorialStatus: "IN_REVIEW",
  });
});

it("produces the same fingerprint on repeated dry runs", async () => {
  expect((await planFoundationBackfill()).fingerprint)
    .toBe((await planFoundationBackfill()).fingerprint);
});
```

- [ ] **Step 2: Confirm no backfill exists**

Run: `pnpm vitest run test/foundation-backfill.test.ts`

Expected: FAIL because the backfill module is missing.

- [ ] **Step 3: Implement dry-run, apply, and audit report**

```ts
type BackfillReport = {
  fingerprint: string;
  sourceItems: number;
  clusters: number;
  canonicalChanges: number;
  versions: number;
  evidenceRecords: number;
  rejectedRows: Array<{ table: string; id: string; reason: string }>;
};
```

Legacy `sourceUrls` become `SECONDARY_CONTEXT` unless a URL maps to an enabled government/platform official Source and a reviewer subsequently approves it. No backfilled row becomes current Published or Verified automatically. `--apply` requires the exact dry-run fingerprint.

- [ ] **Step 4: Verify on a production-shaped branch**

Run:

```bash
pnpm tsx scripts/backfill-phase1-foundation.ts --dry-run --output /tmp/tradelinks-foundation-backfill.json
pnpm tsx scripts/backfill-phase1-foundation.ts --apply --fingerprint "$(jq -r .fingerprint /tmp/tradelinks-foundation-backfill.json)"
pnpm vitest run test/foundation-backfill.test.ts
```

Expected: apply counts equal dry-run counts, rejected rows carry reasons, a second apply inserts zero additional records, and tests PASS.

- [ ] **Step 5: Record the milestone and commit**

Update `.agent/CURRENT.md` only after the integrated verification gate succeeds, including migration name, backfill fingerprint, rejected-row count, and the fact that public cutover has not started.

```bash
git add src/canonicalize/backfill.ts scripts/backfill-phase1-foundation.ts test/foundation-backfill.test.ts .agent/CURRENT.md
git commit -m "feat: backfill canonical intelligence drafts"
```

**Definition of done:** Every eligible legacy record is accounted for, all trust upgrades require review, and replay is idempotent.

## Monitoring and Rollback Checkpoints

1. **Before migration:** create Neon branch `phase1-foundation-pre-migration`; record schema checksum, Source/Item/Cluster/Alert/DailyNote row counts, and latest timestamps.
2. **After `0011`:** verify all old readers still work because the migration is additive; compare counts and run `pnpm db:validate`.
3. **After backfill:** compare dry-run/apply fingerprint, inspect every rejected reason class, and review a sample of 20 canonical drafts covering all six launch categories.
4. **Before public cutover:** require source-run dashboards and the P0 seven-day evidence described in the operations plan.
5. **Traffic rollback:** deploy the prior application release, stop canonical writers, leave additive tables intact, investigate against the Neon checkpoint, then repair forward.
6. **Data correction:** create a new canonical version or corrective migration; never mutate a published historical version or run a destructive down migration.

## Full Verification Gate

Run in this order:

```bash
pnpm db:validate
pnpm lint
pnpm test
pnpm build
pnpm tsx scripts/backfill-phase1-foundation.ts --dry-run
```

Expected: all commands exit 0; the dry-run prints deterministic counts and a fingerprint; no production connection is used by tests.

## Product Spec Coverage Check

- [x] Canonical Source → Source Item → Evidence Cluster → Canonical Change chain: Tasks 2, 4, 5, 6.
- [x] Immutable versions, correction, and evidence preservation: Tasks 2 and 6.
- [x] Structured evidence roles, authority, access, license, fetch/review times: Tasks 2 and 6.
- [x] Separate Signal Type, Product Category, and Risk Attribute: Tasks 1, 2, and 5.
- [x] Complete taxonomy and six launch category capabilities: Tasks 1 and 7.
- [x] Readiness levels and publication/action gates: Tasks 1, 6, and 7.
- [x] Official-source-first clustering and manual review: Tasks 5 and 6.
- [x] Source fixtures, empty-success checks, retries, idempotency, freshness: Tasks 3, 4, and 7.
- [x] Amazon demand boundary and official-policy gap: Source Readiness Matrix and Task 7.
- [x] Forward migration, Neon branch, backfill, and rollback: Tasks 2 and 8.
- [x] No long-term Wire/Radar/Daily compatibility: additive foundation here; public plan Task 9 performs the gated retirement.
- [x] No paid proxy/commercial source dependency: Source Readiness Matrix.
- [x] Phase 2 external execution excluded: Global Constraints and Non-goals.

## Decisions Requiring Human Owner Confirmation

1. **Amazon public promise:** approve the wording “public Amazon announcements and allowlisted page-change monitoring; not complete Seller Central policy coverage.” Recommendation: approve and keep the Amazon policy capability Unavailable until an authorized first-party channel passes the Verified gate.
2. **Launch-category readiness:** approve hiding any of the six category hubs that fails Monitored, even if this means fewer than six are public on launch day. Recommendation: approve readiness over symmetry.
3. **Legacy history:** approve preserving legacy Alerts as in-review Experimental drafts rather than publishing them. Recommendation: approve; it prevents unsupported trust upgrades.
4. **English-only Phase 1:** approve keeping stored source language and translation infrastructure while making the redesigned public IA English-only. Recommendation: approve; locale behavior and redirects are finalized in the public plan.
5. **Demand surface:** approve retaining BSR only as a visibly separate Experimental stream with no launch recommendation. Recommendation: approve; suppress it entirely if the 30-day/second-signal criteria remain unmet.
