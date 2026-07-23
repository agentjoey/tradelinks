# TradeLinks Phase 1 Public Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Launch a fast, indexable, evidence-traceable public US market intelligence product with market/platform/category hubs, canonical changes, evergreen guides, briefings, coverage visibility, RSS, anonymous API, Agent Skill, and public Telegram distribution.

**Architecture:** Public pages, feeds, API responses, reports, and Telegram messages all read the same immutable published `CanonicalChangeVersion` records through one server-only read model. Next.js App Router pages use ISR and tag invalidation; anonymous API routes use cursor pagination, ETag, Last-Modified, and a lightweight fingerprint without browser-user-agent blocking. Wire/Radar/Daily routes redirect only after replacement pages are usable, and their obsolete database structures are retired in a forward migration after verified backfill.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript 5, Tailwind CSS 3.4, shadcn/ui official registry, Prisma 6.2, PostgreSQL/Neon, Vitest, Playwright through the project browser-verification workflow, RSS XML, OpenAPI 3.1.

## Global Constraints

- This plan depends on accepted Foundation Tasks 1–8 and Operations Tasks 1–5; production exposure also depends on a passing seven-day P0 report.
- Public market is the United States and public platforms are Amazon US and Shopify US.
- Initial public Category Hubs are Consumer Electronics, Pet Supplies, Beauty & Personal Care, Toys & Children's Products, Home & Kitchen, and Apparel & Accessories, but a hub is visible only at Monitored or Verified.
- Default `/changes` view is Verified; All Monitored excludes unreviewed, duplicate, inaccessible, disallowed, unsupported, and low-value content.
- Experimental demand appears in a separate labeled surface and may not claim a bestseller or launch opportunity.
- Every public representation renders the same current canonical version and links to its stable TradeLinks permalink and evidence.
- Public RSS and API are timely and free; neither contains Seller Profiles, relevance assessments, personal actions, or private state.
- Public API is anonymous read-only GET and accepts identifiable non-browser clients.
- Phase 1 redesigned IA is English-only; existing `/zh` URLs receive permanent redirects to their English equivalents. This execution choice must be reconfirmed by the Human Owner before Task 2.
- Google Ads, Plus paywalls, private RSS, daily/instant personalized alerts, store connections, and Phase 2 execution are excluded.
- This is a T3 frontend change because it adds pages and changes core navigation. The T3 Brief, Human Owner approval, state matrix, independent Review/Verification agents, and final-build screenshots are mandatory.
- UI primitives come from the approved official shadcn registry; Phase 1 public pages use only CSS state transitions, so React Bits and anime.js are not added to this milestone. Every transition has a reduced-motion alternative.

---

## Delivery Boundary

### Goals

- Replace the three old product identities with a coherent public IA.
- Make coverage limits, readiness, dates, corrections, and primary evidence visible.
- Publish stable, searchable canonical pages and evidence-backed long-lived hubs.
- Offer weekly and monthly reports; daily is conditional and cannot be manufactured to fill a date.
- Ship versioned public RSS/API/Skill contracts and canonical-link Telegram messages.
- Preserve SEO equity with explicit permanent redirects and stable new permalinks.

### Non-goals

- Seller Profile persistence, personalized impact, My Briefing, account actions, seller email identity, Plus, payments, Ads code, personalized Telegram, authenticated APIs, or autonomous agents.
- Complete Amazon Seller Central policy coverage or reliable Shopify demand data.
- Reusing current Alert/DailyNote payloads as the new public contract.

### Risks and controls

| Risk | Control |
|---|---|
| Empty or weak hubs undermine trust | Hub repository refuses publication below Monitored or without minimum content/coverage fields. |
| Web, RSS, API, and report disagree after correction | All accept a `CanonicalPublicRecord` built from one current version; contract snapshots compare channels. |
| Public pages wake Neon on every request | ISR/tag caching, bounded static params for recent content, and no worker call from request handlers. |
| API clients are rejected as bots | Remove browser-UA gate from `/api/v1`; apply rate limits by IP/client ID, not browser identity. |
| Third-party text is republished | Evidence records supply normalized summaries; feeds/API never expose scraped full text. |
| SEO is lost at cutover | 308 route redirects, sitemap transition, canonical URLs, redirect table, and pre/post crawl diff. |
| T3 redesign hides failure states | Required state matrix, mockup walk-through, browser verification, and reduced-motion/accessibility checks. |

### Acceptance standard

- No public hub is empty or below Monitored; every hub shows coverage, known gaps, last successful source check, and last content review.
- `/changes` defaults to Verified and a user can explicitly select All Monitored or Experimental Demand.
- A canonical change page shows version, readiness, published/effective dates, general impact, reviewed action template when allowed, primary/supporting evidence, correction history, and last review.
- Web, briefing, RSS, API, Agent Skill, and Telegram contract tests reference the same version ID/fingerprint/permalink.
- Public pages are indexable, canonicalized, cacheable, accessible, and remain useful with JavaScript disabled.
- Normal non-browser API clients receive data, caching headers, cursor pagination, attribution, and deterministic errors.
- `/wire`, `/trends`, `/daily`, legacy daily slugs, and `/zh` return intended 308 redirects only after replacement routes pass production smoke tests.

## Public URL Contract

| Capability | Stable route |
|---|---|
| Home | `/` |
| US Market hub | `/us` |
| Amazon US hub | `/amazon-us` |
| Shopify US hub | `/shopify-us` |
| Category index | `/categories` |
| Category hub | `/categories/[category]` |
| Recurring topic index/detail | `/topics`, `/topics/[topic]` |
| Verified/Monitored changes | `/changes` |
| Canonical change | `/changes/[slug]` |
| Guide index/detail | `/guides`, `/guides/[slug]` |
| Briefing index | `/briefings` |
| Weekly report | `/briefings/weekly/[year]/[week]` |
| Monthly report | `/briefings/monthly/[year]/[month]` |
| Conditional daily report | `/briefings/daily/[date]` |
| Coverage & Readiness | `/coverage` |
| RSS feeds | `/feeds/changes.xml`, `/feeds/platforms/[platform].xml`, `/feeds/categories/[category].xml`, `/feeds/briefings.xml` |
| Public REST API | `/api/v1/changes`, `/api/v1/changes/[slug]`, `/api/v1/coverage`, `/api/v1/briefings`, `/api/v1/fingerprint` |
| OpenAPI | `/openapi.json` |
| Agent Skill | `/agent/tradelinks/SKILL.md` |

Canonical URL base is `https://tradelinks.us`. Slugs never include readiness or category so reclassification does not break permalinks.

## File Map

### Create: data and contracts

- `src/public-intelligence/types.ts` — `CanonicalPublicRecord`, filters, cursors, and reports.
- `src/public-intelligence/query.ts` — Prisma queries and readiness filters.
- `src/public-intelligence/serialize.ts` — one canonical serializer for all channels.
- `src/public-intelligence/cache.ts` — cache tags and revalidation intervals.
- `src/public-intelligence/search.ts` — PostgreSQL search/filter parser.
- `src/public-intelligence/guides.ts` — guide repository and evidence checks.
- `src/public-intelligence/briefings.ts` — report generation and immutable publication.
- `src/public-intelligence/coverage.ts` — hub readiness projection.
- `src/public-intelligence/feeds.ts` — RSS projection.
- `src/public-intelligence/api.ts` — cursor, headers, errors, and fingerprint.
- `src/public-intelligence/telegram.ts` — public message projection and idempotency.
- `src/public-intelligence/legacy-redirects.ts` — redirect import and lookup.
- `scripts/backfill-public-content.ts` — DailyNote/Alert mapping and redirect report.
- `scripts/seed-phase1-guides.ts` — validates and imports the reviewed guide corpus.
- `content/guides/us-market-entry-basics.md`
- `content/guides/amazon-us-selling-basics.md`
- `content/guides/shopify-us-selling-basics.md`
- `content/guides/consumer-electronics-us-requirements.md`
- `content/guides/pet-supplies-us-requirements.md`
- `content/guides/beauty-personal-care-us-requirements.md`
- `content/guides/toys-childrens-products-us-requirements.md`
- `content/guides/home-kitchen-us-requirements.md`
- `content/guides/apparel-accessories-us-requirements.md`
- `prisma/migrations/0012_phase1_public_content/migration.sql`
- `prisma/migrations/0013_retire_wire_radar_daily/migration.sql`

### Create: routes and components

- `app/(public)/layout.tsx`
- `app/(public)/PublicNav.tsx`
- `app/(public)/PublicFooter.tsx`
- `app/(public)/IntelligenceCard.tsx`
- `app/(public)/ReadinessBadge.tsx`
- `app/(public)/EvidenceList.tsx`
- `app/(public)/CoveragePanel.tsx`
- `app/(public)/FilterBar.tsx`
- `app/(public)/ShareButton.tsx`
- `app/(public)/ReportCard.tsx`
- `app/(public)/StatePanel.tsx`
- `app/(public)/page.tsx`
- `app/(public)/us/page.tsx`
- `app/(public)/amazon-us/page.tsx`
- `app/(public)/shopify-us/page.tsx`
- `app/(public)/categories/page.tsx`
- `app/(public)/categories/[category]/page.tsx`
- `app/(public)/topics/page.tsx`
- `app/(public)/topics/[topic]/page.tsx`
- `app/(public)/changes/page.tsx`
- `app/(public)/changes/[slug]/page.tsx`
- `app/(public)/guides/page.tsx`
- `app/(public)/guides/[slug]/page.tsx`
- `app/(public)/briefings/page.tsx`
- `app/(public)/briefings/weekly/[year]/[week]/page.tsx`
- `app/(public)/briefings/monthly/[year]/[month]/page.tsx`
- `app/(public)/briefings/daily/[date]/page.tsx`
- `app/(public)/coverage/page.tsx`
- `app/feeds/changes.xml/route.ts`
- `app/feeds/platforms/[platform].xml/route.ts`
- `app/feeds/categories/[category].xml/route.ts`
- `app/feeds/briefings.xml/route.ts`
- `app/api/v1/changes/route.ts`
- `app/api/v1/changes/[slug]/route.ts`
- `app/api/v1/coverage/route.ts`
- `app/api/v1/briefings/route.ts`
- `app/api/v1/fingerprint/route.ts`
- `app/openapi.json/route.ts`
- `public/agent/tradelinks/SKILL.md`

### Create: tests and design evidence

- `test/public-read-model.test.ts`
- `test/public-search.test.ts`
- `test/public-hubs.test.tsx`
- `test/canonical-change-page.test.tsx`
- `test/guides-briefings.test.ts`
- `test/public-feeds.test.ts`
- `test/public-api-v1.test.ts`
- `test/public-agent-skill.test.ts`
- `test/public-telegram.test.ts`
- `test/public-seo.test.ts`
- `test/legacy-redirects.test.ts`
- `test/public-channel-consistency.test.ts`
- `test/e2e/public-intelligence.spec.ts`
- `test/setup-dom.ts`
- `test/fixtures/public/`
- `design/phase1-public-intelligence.html`
- `design/shots/phase1-public-final/`
- `vitest.config.ts`
- `playwright.config.ts`
- `PRODUCT.md`
- `DESIGN.md`

### Modify

- `prisma/schema.prisma`
- `package.json`
- `pnpm-lock.yaml`
- `app/layout.tsx`
- `app/globals.css`
- `app/sitemap.ts`
- `app/robots.ts`
- `app/components/MainNav.tsx`
- `middleware.ts`
- `next.config.mjs`
- `src/config/env.ts`
- `.env.example`
- `src/push/channel-select.ts`
- `src/push/channel-render.ts`
- `src/push/send.ts`
- `docs/architecture.md`
- `.agent/CURRENT.md`

### Move, replace, or redirect

- Move `app/(home)/page.tsx` to `app/(public)/page.tsx` when the new shell is created, so two route groups never define `/` simultaneously.
- `app/wire/page.tsx`
- `app/trends/page.tsx`
- `app/daily/page.tsx`
- `app/daily/[slug]/page.tsx`
- `app/feed.xml/route.ts`
- `app/api/public/alerts/route.ts`
- `app/api/public/daily/route.ts`

## Public Data Model

`0012_phase1_public_content/migration.sql` adds:

```prisma
enum BriefingKind { WEEKLY MONTHLY DAILY }

model Guide {
  id                String            @id @default(cuid())
  slug              String            @unique
  title             String
  summary           String
  bodyMarkdown      String
  market            MarketCode        @default(US)
  platforms         PlatformCode[]
  productCategories ProductCategory[]
  riskAttributes    RiskAttribute[]
  readiness         ReadinessLevel
  editorialStatus   EditorialStatus   @default(DRAFT)
  lastReviewedAt    DateTime
  reviewedBy        String
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
  evidence          GuideEvidence[]
}

model GuideEvidence {
  id                String         @id @default(cuid())
  guideId           String
  sourceId          String
  url               String
  authorityLevel    AuthorityLevel
  access            EvidenceAccess
  licenseNote       String
  normalizedSummary String
  publishedAt       DateTime?
  reviewedAt        DateTime
  position          Int
  guide             Guide          @relation(fields: [guideId], references: [id])
  source            Source         @relation(fields: [sourceId], references: [id])
  @@unique([guideId, url])
  @@unique([guideId, position])
}

model Briefing {
  id              String          @id @default(cuid())
  kind            BriefingKind
  periodKey       String
  slug            String          @unique
  title           String
  summary         String
  bodyMarkdown    String
  readiness       ReadinessLevel
  editorialStatus EditorialStatus @default(DRAFT)
  fingerprint     String
  publishedAt     DateTime?
  reviewedAt      DateTime?
  reviewedBy      String?
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt
  entries         BriefingEntry[]
  @@unique([kind, periodKey])
}

model BriefingEntry {
  briefingId     String
  changeVersionId String
  position       Int
  commentary     String
  briefing       Briefing               @relation(fields: [briefingId], references: [id])
  changeVersion  CanonicalChangeVersion @relation(fields: [changeVersionId], references: [id])
  @@id([briefingId, changeVersionId])
  @@unique([briefingId, position])
}

model LegacyRedirect {
  fromPath  String   @id
  toPath    String
  status    Int      @default(308)
  createdAt DateTime @default(now())
}
```

`0013_retire_wire_radar_daily/migration.sql` removes `Alert`, legacy `Cluster`, and `DailyNote` only after:

1. every eligible Alert has a canonical-change mapping or a recorded rejection;
2. every published DailyNote has a Briefing or `LegacyRedirect`;
3. Item-to-new-cluster membership counts reconcile;
4. production redirects pass;
5. the previous application release is preserved as the bounded traffic rollback checkpoint.

Keep `ProductSnapshot`, `TrendSignal`, and `MoverInsight` as Experimental demand observations; they are no longer a top-level Radar product.

## Read Model Contract

```ts
export type CanonicalPublicRecord = {
  id: string;
  slug: string;
  versionId: string;
  version: number;
  fingerprint: string;
  title: string;
  summary: string;
  signalType: SignalType;
  market: "US";
  regions: string[];
  platforms: PlatformCode[];
  operatingStages: OperatingStage[];
  productCategories: ProductCategory[];
  riskAttributes: RiskAttribute[];
  policyTopics: PolicyTopic[];
  sourcePublishedAt: string;
  effectiveAt: string | null;
  urgency: number;
  readiness: "MONITORED" | "VERIFIED";
  generalImpact: string;
  generalActionTemplate: string | null;
  permalink: string;
  reviewedAt: string;
  evidence: Array<{
    sourceId: string;
    sourceName: string;
    url: string;
    role: EvidenceRole;
    authorityLevel: AuthorityLevel;
    publishedAt: string | null;
    normalizedSummary: string;
    reviewedAt: string | null;
  }>;
  correctionHistory: Array<{
    version: number;
    correctionReason: string;
    createdAt: string;
  }>;
};
```

The serializer omits evidence excerpts that cannot be republished and never serializes internal model prompts, reviewer email, source access credentials, private identity, or unpublished drafts.

## Cache Contract

| Surface | Revalidation | Tags |
|---|---:|---|
| Home/live changes | 15 minutes | `changes`, `briefings`, `coverage` |
| Market/platform/category hubs | 1 hour | `changes`, `coverage`, scoped hub tag |
| Canonical change | 1 hour plus publish-time invalidation | `change:[id]` |
| Guides | 24 hours plus editorial invalidation | `guide:[id]` |
| Briefings | immutable URL; invalidate only on correction | `briefing:[id]` |
| Coverage | 1 hour | `coverage` |
| RSS/API | `s-maxage=900, stale-while-revalidate=3600` | fingerprint from selected versions |

When sources become Stale, new personalized work is suppressed by the private plan, but public historical pages remain cacheable and display the new coverage warning.

## Pactify Execution Contract

Use feature id `phase1-public-intelligence` after Foundation acceptance. Development can start against fixtures while the P0 clock runs; production exposure depends on P0:

```bash
PACT_AGENT_ID=codex pactify plan \
  --feature phase1-public-intelligence \
  --planner-kind codex-cli \
  "Execute docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md exactly. One plan task per Pactify task; assign every implementation task to kimi and every review to claude; enforce the T3 owner approval and fresh-context verification gates."
pactify plan apply phase1-public-intelligence
```

Codex 5.6 Sol orchestrates, Kimi Code K3 implements, and Claude Code Opus 4.8 reviews. The T3 UI implementation owner cannot review or verify Tasks 2–5; use a clean worktree and a fresh Claude Code session for independent review and browser verification. Task 9 depends on all preceding tasks plus a passing P0 report.

### Task 1: Add Public Content Schema and One Canonical Read Model

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/0012_phase1_public_content/migration.sql`
- Create: `src/public-intelligence/types.ts`
- Create: `src/public-intelligence/query.ts`
- Create: `src/public-intelligence/serialize.ts`
- Create: `src/public-intelligence/cache.ts`
- Test: `test/public-read-model.test.ts`
- Test: `test/public-channel-consistency.test.ts`

**Interfaces:**

- Produces: `getPublicChangeBySlug(slug: string): Promise<CanonicalPublicRecord | null>`, `listPublicChanges(filters: PublicFilters): Promise<PublicPage>`, `serializeCanonicalVersion(version: VersionWithEvidence): CanonicalPublicRecord`, `PUBLIC_CACHE`.
- Consumes: Foundation current published versions and evidence invariants.

- [ ] **Step 1: Write visibility and consistency failures**

```ts
it("returns only current reviewed monitored-or-verified versions", async () => {
  const page = await listPublicChanges({ pool: "verified", limit: 20 });
  expect(page.items.every((item) => item.readiness === "VERIFIED")).toBe(true);
  expect(page.items.map((item) => item.versionId)).not.toContain(draftVersionId);
});

it("creates the same fingerprint for every channel projection", async () => {
  const record = await getPublicChangeBySlug("battery-label-rule");
  expect(rssProjection(record!).fingerprint).toBe(apiProjection(record!).fingerprint);
});
```

- [ ] **Step 2: Confirm legacy Alert readers cannot satisfy the contract**

Run: `pnpm vitest run test/public-read-model.test.ts test/public-channel-consistency.test.ts`

Expected: FAIL because the public read model is absent.

- [ ] **Step 3: Add the schema and serializer**

```ts
export function serializeCanonicalVersion(version: VersionWithEvidence): CanonicalPublicRecord {
  assertPublicVersion(version);
  const permalink = `https://tradelinks.us/changes/${version.canonicalChange.slug}`;
  const fingerprint = stableHash(`${version.id}|${version.version}|${version.updatedAt.toISOString()}`);
  return {
    id: version.canonicalChange.id,
    slug: version.canonicalChange.slug,
    versionId: version.id,
    version: version.version,
    fingerprint,
    title: version.title,
    summary: version.summary,
    signalType: version.signalType,
    market: version.market,
    regions: version.regions,
    platforms: version.platforms,
    operatingStages: version.operatingStages,
    productCategories: version.productCategories,
    riskAttributes: version.riskAttributes,
    policyTopics: version.policyTopics,
    sourcePublishedAt: version.sourcePublishedAt.toISOString(),
    effectiveAt: version.effectiveAt?.toISOString() ?? null,
    urgency: version.urgency,
    readiness: version.readiness,
    generalImpact: version.generalImpact,
    generalActionTemplate: version.generalActionTemplate,
    permalink,
    reviewedAt: version.reviewedAt!.toISOString(),
    evidence: version.evidence.map((item) => ({
      sourceId: item.sourceId,
      sourceName: item.source.name,
      url: item.url,
      role: item.role,
      authorityLevel: item.authorityLevel,
      publishedAt: item.publishedAt?.toISOString() ?? null,
      normalizedSummary: item.normalizedSummary,
      reviewedAt: item.reviewedAt?.toISOString() ?? null,
    })),
    correctionHistory: version.canonicalChange.versions
      .filter((item) => item.correctionReason !== null)
      .map((item) => ({
        version: item.version,
        correctionReason: item.correctionReason!,
        createdAt: item.createdAt.toISOString(),
      })),
  };
}
```

Create a Neon branch `phase1-public-pre-migration`, apply `0012`, validate constraints, and implement queries that require `isCurrent`, `PUBLISHED`, and readiness. Experimental demand uses a separate query and never enters `CanonicalPublicRecord`.

- [ ] **Step 4: Verify migration and read contract**

Run:

```bash
pnpm db:validate
pnpm vitest run test/public-read-model.test.ts test/public-channel-consistency.test.ts
```

Expected: schema exits 0; tests PASS and prove unpublished/private data cannot serialize.

- [ ] **Step 5: Commit schema and read model**

```bash
git add prisma/schema.prisma prisma/migrations/0012_phase1_public_content src/public-intelligence test/public-read-model.test.ts test/public-channel-consistency.test.ts
git commit -m "feat: add public intelligence read model"
```

**Definition of done:** All later public channels have one immutable DTO and one visibility policy.

### Task 2: Pass the T3 Public IA Design Gate

**Files:**

- Create: `PRODUCT.md`
- Create: `DESIGN.md`
- Create: `design/phase1-public-intelligence.html`
- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Create: `test/setup-dom.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `app/globals.css`
- Modify: `app/layout.tsx`
- Modify: `app/admin/layout.tsx`
- Move: `app/(home)/page.tsx` to `app/(public)/page.tsx`
- Create: `app/(public)/layout.tsx`
- Create: `app/(public)/PublicNav.tsx`
- Create: `app/(public)/PublicFooter.tsx`
- Create: `app/(public)/StatePanel.tsx`
- Test: `test/public-shell.test.tsx`
- Test: `test/e2e/public-intelligence.spec.ts`

**Interfaces:**

- Produces: `PublicShell`, `PublicNav`, `PublicFooter`, `StatePanel`.
- Consumes: existing semantic tokens in `app/globals.css`; approved Public URL Contract.

- [ ] **Step 1: Initialize Impeccable context, then write and approve the T3 Brief**

The repository currently has no `PRODUCT.md` or `DESIGN.md`. The UI worker runs Impeccable context, reads `reference/init.md` and `reference/shape.md`, then uses `$impeccable init` to create those two files from the approved product spec before `$impeccable shape public-intelligence`. No UI code begins before these artifacts are reviewed.

Record the following in the Pactify task spec before code:

```yaml
tier: T3
primary_user: "Global English-speaking seller entering or operating in the US"
primary_task: "Find a credible change, understand why it matters, inspect evidence, and track it"
navigation: ["US Market", "Amazon US", "Shopify US", "Categories", "Changes", "Guides", "Briefings", "Coverage"]
trust_requirements: ["readiness always visible", "primary evidence one click away", "dates explicit", "coverage gaps explicit"]
prohibited: ["bestseller promise", "legal advice", "fake real-time status", "Ads placement", "private data"]
```

The Human Owner approves the T3 Brief, English-only route behavior, and shadcn official registry/style before implementation.

- [ ] **Step 2: Install the exact test harness and create an inspectable mockup/state matrix**

```bash
pnpm add --save-dev --save-exact \
  @playwright/test@1.61.1 \
  @testing-library/jest-dom@6.9.1 \
  @testing-library/react@16.3.0 \
  jsdom@26.1.0
pnpm exec playwright install chromium
```

Add `"test:e2e": "playwright test"` to `package.json`. `vitest.config.ts` excludes `test/e2e/**` and uses jsdom for `*.test.tsx`; `playwright.config.ts` targets `test/e2e`, uses `http://127.0.0.1:3000`, and starts `pnpm start` after a production build.

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["test/e2e/**", "node_modules/**"],
    environmentMatchGlobs: [["**/*.test.tsx", "jsdom"]],
    setupFiles: ["test/setup-dom.ts"],
  },
});
```

```ts
// test/setup-dom.ts
import "@testing-library/jest-dom/vitest";
```

```ts
// playwright.config.ts
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "test/e2e",
  use: { baseURL: "http://127.0.0.1:3000", trace: "retain-on-failure" },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } } },
  ],
  webServer: { command: "pnpm start", url: "http://127.0.0.1:3000", reuseExistingServer: false },
});
```

The mockup covers desktop 1440×900 and mobile 390×844 for home, hub, changes, detail, and coverage. The approved state matrix is:

| Surface | Loading | Empty | Error | Stale | Restricted |
|---|---|---|---|---|---|
| Hub | skeleton preserving headings | hub hidden below Monitored | cached shell + retry | last-updated warning | not applicable |
| Changes | card skeletons | “No qualified changes in this filter” | cached prior page | coverage banner | monitored view requires explicit selection |
| Change detail | title/evidence skeleton | 404 | cached version | source-stale warning | inaccessible evidence labeled |
| Guides/Briefings | list skeleton | honest absence copy | cached list | last-review warning | draft never public |
| Coverage | row skeletons | configuration error | cached matrix | Stale badge + implication | admin details omitted |

Run: open `design/phase1-public-intelligence.html` in the in-app browser and complete a Human Owner walk-through produced by `$impeccable shape public-intelligence`.

Expected: explicit approval recorded in the Pactify log before source implementation.

- [ ] **Step 3: Add the shell with shadcn primitives**

Use the project `shadcn` skill/MCP to initialize the approved official registry only if `components.json` is still absent. Add Button, Badge, Card, Tabs, Select, Sheet, Skeleton, Tooltip, and Separator. Keep existing TradeLinks semantic colors and typography unless the approved mockup changes them. Make root `app/layout.tsx` provider/metadata-only, move `AccountNav` into `app/admin/layout.tsx`, and let the public/private/admin route-group layouts own their navigation so two nav systems never render together.

```tsx
export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <PublicNav />
      <main id="main">{children}</main>
      <PublicFooter />
    </>
  );
}
```

- [ ] **Step 4: Verify shell accessibility and responsive navigation**

```ts
// test/e2e/public-intelligence.spec.ts
import { expect, test } from "@playwright/test";

test("public shell is keyboard-usable without horizontal overflow", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await expect(page.getByRole("navigation")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
```

Run: `pnpm vitest run test/public-shell.test.tsx && pnpm lint && pnpm build && pnpm test:e2e test/e2e/public-intelligence.spec.ts`

Expected: PASS; one H1 per page fixture, keyboard skip link works, focus is visible, mobile menu is operable, and no horizontal scroll appears at 390px.

- [ ] **Step 5: Commit the approved shell**

```bash
git add PRODUCT.md DESIGN.md design/phase1-public-intelligence.html app/globals.css app/layout.tsx app/admin/layout.tsx app/\(public\) components.json vitest.config.ts playwright.config.ts package.json pnpm-lock.yaml test/setup-dom.ts test/public-shell.test.tsx test/e2e/public-intelligence.spec.ts
git add -u app/\(home\)/page.tsx
git commit -m "feat: add approved public intelligence shell"
```

**Definition of done:** T3 approval is recorded, mockup/state matrix exist, official shadcn components are used, and shell verification passes.

### Task 3: Build Market, Platform, Category, and Coverage Hubs

**Files:**

- Create: `src/public-intelligence/coverage.ts`
- Create: `app/(public)/CoveragePanel.tsx`
- Create: `app/(public)/IntelligenceCard.tsx`
- Create: `app/(public)/ReadinessBadge.tsx`
- Modify: `app/(public)/page.tsx`
- Create: `app/(public)/us/page.tsx`
- Create: `app/(public)/amazon-us/page.tsx`
- Create: `app/(public)/shopify-us/page.tsx`
- Create: `app/(public)/categories/page.tsx`
- Create: `app/(public)/categories/[category]/page.tsx`
- Create: `app/(public)/topics/page.tsx`
- Create: `app/(public)/topics/[topic]/page.tsx`
- Create: `app/(public)/coverage/page.tsx`
- Test: `test/public-hubs.test.tsx`

**Interfaces:**

- Produces: `getHub(slug: HubSlug): Promise<PublicHub | null>`, `getCoverageMatrix(): Promise<PublicCoverage[]>`.
- Consumes: capability readiness, canonical public record, initial category constants, cache contract.

- [ ] **Step 1: Write hub publication failures**

```tsx
it("does not publish a category below monitored", async () => {
  seedCapability("category:pet-supplies", "EXPERIMENTAL");
  expect(await getHub("pet-supplies")).toBeNull();
});

it("hides an unsupported recurring topic page", async () => {
  expect(await getTopicHub("listing-account-health")).toBeNull();
});

it("shows known gaps and freshness for a monitored hub", async () => {
  render(await CategoryPage({ params: { category: "consumer-electronics" } }));
  expect(screen.getByText(/Known coverage gaps/i)).toBeVisible();
  expect(screen.getByText(/Last successful check/i)).toBeVisible();
});
```

- [ ] **Step 2: Confirm hub routes are absent**

Run: `pnpm vitest run test/public-hubs.test.tsx`

Expected: FAIL because coverage repository and pages do not exist.

- [ ] **Step 3: Implement minimum viable hub content**

```ts
export function canRenderHub(capability: CoverageCapabilityPublic): boolean {
  return capability.readiness === "MONITORED" || capability.readiness === "VERIFIED";
}
```

Each rendered category hub contains overview, current changes, federal requirements, platform considerations for Amazon/Shopify, recurring risk topics, guides, demand context only when Experimental label is present, primary sources, freshness, known gaps, and last review. Amazon hub leads with the explicit incomplete-policy-coverage warning until that capability becomes Monitored.

`/topics` exposes the six Foundation `PolicyTopic` tags. A topic detail page exists only with either three published Monitored/Verified changes, or one reviewed guide plus one current published change; it aggregates canonical versions instead of creating a separate editorial database. Risk Attribute links on change/category pages route to the closest explicit topic and retain the exact Risk Attribute label as a filter.

Every category hub has a `Track this category` entry point. Anonymous users go to `/onboarding?category=[category-slug]`; signed-in persistence and the two-category replacement dialog are implemented by Private Task 7. The public page stores no browser-only tracking state.

- [ ] **Step 4: Verify routes, cache, metadata, and empty behavior**

Run: `pnpm vitest run test/public-hubs.test.tsx test/public-seo.test.ts && pnpm build`

Expected: PASS; all eligible hubs/topics build, below-Monitored or unsupported routes return 404 and stay out of sitemap, metadata is unique, and pages declare one-hour revalidation.

- [ ] **Step 5: Commit hubs**

```bash
git add src/public-intelligence/coverage.ts app/\(public\) test/public-hubs.test.tsx test/public-seo.test.ts
git commit -m "feat: add readiness-gated intelligence hubs"
```

**Definition of done:** Every public hub is substantive, transparent about gaps, and gated by capability readiness.

### Task 4: Build Changes Search and Canonical Detail Pages

**Files:**

- Create: `src/public-intelligence/search.ts`
- Create: `app/(public)/FilterBar.tsx`
- Create: `app/(public)/ShareButton.tsx`
- Create: `app/(public)/EvidenceList.tsx`
- Create: `app/(public)/changes/page.tsx`
- Create: `app/(public)/changes/[slug]/page.tsx`
- Test: `test/public-search.test.ts`
- Test: `test/canonical-change-page.test.tsx`

**Interfaces:**

- Produces: `parsePublicSearchParams(input: URLSearchParams): PublicFilters`, `searchPublicChanges(filters: PublicFilters): Promise<PublicPage>`, `canonicalSharePayload(record: CanonicalPublicRecord): ShareData`.
- Consumes: public query/serializer, taxonomy labels, opaque cursor helper from Task 7.

- [ ] **Step 1: Write default-pool, filter, and evidence tests**

```ts
it("defaults to verified even when pool is omitted or invalid", () => {
  expect(parsePublicSearchParams(new URLSearchParams()).pool).toBe("verified");
  expect(parsePublicSearchParams(new URLSearchParams("pool=draft")).pool).toBe("verified");
});

it("renders primary evidence before secondary context", async () => {
  render(await ChangePage({ params: { slug: "battery-label-rule" } }));
  const roles = screen.getAllByTestId("evidence-role").map((node) => node.textContent);
  expect(roles).toEqual(["Primary official", "Supporting official", "Secondary context"]);
});

it("shares only the canonical permalink", async () => {
  expect(canonicalSharePayload(record)).toEqual({
    title: record.title,
    url: record.permalink,
  });
});
```

- [ ] **Step 2: Confirm current `/wire` cannot satisfy the new detail contract**

Run: `pnpm vitest run test/public-search.test.ts test/canonical-change-page.test.tsx`

Expected: FAIL because the search/detail routes do not exist.

- [ ] **Step 3: Implement typed filters and stable details**

Allowed filters are `pool`, `signal`, `platform`, `category`, `from`, `to`, `q`, and `cursor`. Search uses PostgreSQL full-text/trigram indexes over current published title/summary and adds structured filters. `pool=experimental-demand` queries the separate demand repository and always renders the boundary copy.

```tsx
<EvidenceList
  evidence={record.evidence}
  order={["PRIMARY_OFFICIAL", "SUPPORTING_OFFICIAL", "SECONDARY_CONTEXT"]}
/>
```

The `Track this change` button points anonymous users to `/onboarding?change=[id]`; it never stores browser-only state. Signed-in persistence is Private Task 6.

`ShareButton` uses `navigator.share({ title, url: permalink })` when available and copies only the canonical permalink otherwise; query filters and tracking parameters never enter the shared URL.

- [ ] **Step 4: Verify search, accessibility, and canonical metadata**

Run: `pnpm vitest run test/public-search.test.ts test/canonical-change-page.test.tsx && pnpm lint && pnpm build`

Expected: PASS; invalid filters do not leak drafts, evidence order is stable, correction history is visible, and the detail page canonical URL excludes filters.

- [ ] **Step 5: Commit changes experience**

```bash
git add src/public-intelligence/search.ts app/\(public\)/FilterBar.tsx app/\(public\)/ShareButton.tsx app/\(public\)/EvidenceList.tsx app/\(public\)/changes test/public-search.test.ts test/canonical-change-page.test.tsx
git commit -m "feat: add canonical changes experience"
```

**Definition of done:** Verified is the safe default, expert filtering is explicit, and every conclusion is traceable to structured evidence.

### Task 5: Publish Evidence-Backed Guides and Briefings

**Files:**

- Create: `src/public-intelligence/guides.ts`
- Create: `src/public-intelligence/briefings.ts`
- Create: `scripts/seed-phase1-guides.ts`
- Create nine files under: `content/guides/`
- Create: `app/(public)/ReportCard.tsx`
- Create: `app/(public)/guides/page.tsx`
- Create: `app/(public)/guides/[slug]/page.tsx`
- Create: `app/(public)/briefings/page.tsx`
- Create: `app/(public)/briefings/weekly/[year]/[week]/page.tsx`
- Create: `app/(public)/briefings/monthly/[year]/[month]/page.tsx`
- Create: `app/(public)/briefings/daily/[date]/page.tsx`
- Test: `test/guides-briefings.test.ts`

**Interfaces:**

- Produces: `publishGuide(draftId: string, reviewerId: string): Promise<Guide>`, `generateBriefing(input: BriefingInput): Promise<BriefingDraft | "NO_QUALIFIED_CONTENT">`, `publishBriefing(id: string, reviewerId: string): Promise<Briefing>`.
- Consumes: canonical public records, structured evidence, and Operations `qualifyWeeklyBriefing` run metadata/fingerprint.

- [ ] **Step 1: Write guide evidence and report threshold failures**

```ts
it("blocks a guide without evidence and a review date", async () => {
  await expect(publishGuide(unsupportedGuide.id, "reviewer"))
    .rejects.toThrow("GUIDE_REQUIRES_EVIDENCE_AND_REVIEW_DATE");
});

it("provides one reviewed guide for every launch hub", async () => {
  const report = await validateGuideCorpus("content/guides");
  expect(report.missingLaunchCategories).toEqual([]);
  expect(report.invalidEvidence).toEqual([]);
});

it("does not manufacture a daily briefing below threshold", async () => {
  expect(await generateBriefing({ kind: "DAILY", from, to }))
    .toBe("NO_QUALIFIED_CONTENT");
});

it("pins the same ordered versions as the accepted shadow qualification", async () => {
  const draft = await generateBriefing({ kind: "WEEKLY", qualificationRunId });
  expect(draft.changeVersionIds).toEqual(qualificationRun.metadata.changeVersionIds);
  expect(draft.fingerprint).toBe(qualificationRun.outputFingerprint);
});
```

- [ ] **Step 2: Confirm existing DailyNote behavior differs**

Run: `pnpm vitest run test/guides-briefings.test.ts test/daily-note.test.ts`

Expected: the new test FAILS before report repository exists.

- [ ] **Step 3: Implement immutable, version-pinned reports**

```ts
const qualified = changes.filter((change) =>
  change.readiness === "VERIFIED" || (input.kind !== "DAILY" && change.readiness === "MONITORED")
);
if (input.kind === "DAILY" && qualified.length < 3) return "NO_QUALIFIED_CONTENT";
```

Weekly is generated for Monday–Sunday UTC and is the primary report. Its draft must consume the accepted Operations shadow-qualification run and preserve its ordered version IDs/fingerprint. Monthly uses calendar month UTC. Daily requires at least three qualified changes including one Verified, otherwise no route is created. Every `BriefingEntry` pins a version ID; correction creates a new briefing fingerprint and review event.

The nine exact Markdown files in the File Map form the initial corpus. Each has validated frontmatter for slug, title, summary, market, platforms, categories, risk attributes, Policy Topics, readiness, `lastReviewedAt`, `reviewedBy`, and at least two official source records. Body sections are `Who this is for`, `What changes the decision`, `US requirements`, `Amazon US`, `Shopify US`, `Evidence and limits`, and `Review history`; each file is 900–1,800 English words. `scripts/seed-phase1-guides.ts --check` rejects missing sections, launch-category gaps, non-official primary sources, stale review dates, or duplicate slugs before it can import.

- [ ] **Step 4: Verify period URLs and evidence**

Run: `pnpm tsx scripts/seed-phase1-guides.ts --check && pnpm vitest run test/guides-briefings.test.ts && pnpm lint && pnpm build`

Expected: PASS; period parsing rejects invalid dates, no empty daily route is emitted, guide evidence and review dates render, and reports use pinned canonical versions.

- [ ] **Step 5: Commit guides and briefings**

```bash
git add src/public-intelligence/guides.ts src/public-intelligence/briefings.ts scripts/seed-phase1-guides.ts content/guides app/\(public\)/ReportCard.tsx app/\(public\)/guides app/\(public\)/briefings test/guides-briefings.test.ts
git commit -m "feat: add guides and public briefings"
```

**Definition of done:** Guides are reviewed and sourced; weekly/monthly are stable; daily exists only above the explicit quality threshold.

### Task 6: Replace RSS with Canonical, Scoped Feeds

**Files:**

- Create: `src/public-intelligence/feeds.ts`
- Create: `app/feeds/changes.xml/route.ts`
- Create: `app/feeds/platforms/[platform].xml/route.ts`
- Create: `app/feeds/categories/[category].xml/route.ts`
- Create: `app/feeds/briefings.xml/route.ts`
- Replace: `app/feed.xml/route.ts`
- Test: `test/public-feeds.test.ts`

**Interfaces:**

- Produces: `renderPublicFeed(input: FeedInput): Promise<FeedResponse>`.
- Consumes: canonical serializer and public briefings.

- [ ] **Step 1: Define feed privacy and canonical-link expectations**

```ts
it("links to TradeLinks canonical pages and includes original evidence", async () => {
  const xml = await renderFeed("/feeds/changes.xml");
  expect(xml).toContain("https://tradelinks.us/changes/battery-label-rule");
  expect(xml).toContain("https://official.example/rule");
  expect(xml).not.toContain("<profileId>");
});

it("does not include third-party full text", async () => {
  expect(await renderFeed("/feeds/changes.xml")).not.toContain(licensedFullTextFixture);
});
```

- [ ] **Step 2: Confirm current feed links directly to original sources**

Run: `pnpm vitest run test/public-feeds.test.ts`

Expected: FAIL against current `app/feed.xml/route.ts`.

- [ ] **Step 3: Implement scoped feeds**

Each item includes title, concise public summary, market, platform, Product Categories, readiness, published/effective dates, canonical permalink, and evidence links. Use version ID as GUID, canonical page as `<link>`, normalized summary only, maximum 50 items, and cache headers from the Cache Contract.

`/feed.xml` returns 308 to `/feeds/changes.xml`.

- [ ] **Step 4: Validate XML, filters, and channel consistency**

Run: `pnpm vitest run test/public-feeds.test.ts test/public-channel-consistency.test.ts`

Expected: PASS; all feeds are valid XML, scopes exclude unrelated records, and fingerprints/permalinks equal web projections.

- [ ] **Step 5: Commit RSS**

```bash
git add src/public-intelligence/feeds.ts app/feeds app/feed.xml/route.ts test/public-feeds.test.ts
git commit -m "feat: publish canonical public rss feeds"
```

**Definition of done:** RSS distributes public facts promptly, preserves attribution, and exposes no private or unauthorized full-text content.

### Task 7: Ship Anonymous API v1, OpenAPI, Fingerprint, and Agent Skill

**Files:**

- Create: `src/public-intelligence/api.ts`
- Create: `app/api/v1/changes/route.ts`
- Create: `app/api/v1/changes/[slug]/route.ts`
- Create: `app/api/v1/coverage/route.ts`
- Create: `app/api/v1/briefings/route.ts`
- Create: `app/api/v1/fingerprint/route.ts`
- Create: `app/openapi.json/route.ts`
- Create: `public/agent/tradelinks/SKILL.md`
- Modify: `src/config/env.ts`
- Modify: `.env.example`
- Test: `test/public-api-v1.test.ts`
- Test: `test/public-agent-skill.test.ts`

**Interfaces:**

- Produces: `encodeCursor`, `decodeCursor`, `apiHeaders`, `apiError`, OpenAPI 3.1 document, Skill version `1.0.0`.
- Consumes: public query/serializer; no seller models.

- [ ] **Step 1: Write client, cursor, cache, and privacy failures**

```ts
it("serves curl without browser headers", async () => {
  const response = await GET(request("/api/v1/changes", { "user-agent": "curl/8.0" }));
  expect(response.status).toBe(200);
});

it("returns 304 for a matching etag", async () => {
  const first = await getChanges();
  const second = await getChanges({ "if-none-match": first.headers.get("etag")! });
  expect(second.status).toBe(304);
});

it("never includes private schema names in OpenAPI", async () => {
  expect(JSON.stringify(await openApiDocument())).not.toMatch(/SellerProfile|PersonalAction|RelevanceAssessment/);
});
```

- [ ] **Step 2: Confirm old public APIs block or expose legacy contracts**

Run: `pnpm vitest run test/public-api-v1.test.ts test/public-agent-skill.test.ts`

Expected: FAIL because v1 routes and Skill are absent.

- [ ] **Step 3: Implement the versioned contract**

Success envelope:

```ts
type ApiPage<T> = {
  apiVersion: "1.0";
  generatedAt: string;
  fingerprint: string;
  data: T[];
  page: { nextCursor: string | null; limit: number };
};
```

Limits are 1–100, default 20. Cursor is opaque base64url over `{publishedAt,id,filtersHash}` signed with `PUBLIC_API_CURSOR_SECRET`; mismatched filters return `400 INVALID_CURSOR`. Add that 32-byte secret to `src/config/env.ts` and `.env.example`. Add `ETag`, `Last-Modified`, `Cache-Control`, canonical attribution, and error codes. Cap result size and query complexity in code; rely on CDN caching and operational request-volume alerts during validation rather than adding a database rate-limit write to every anonymous read.

The Skill instructs agents to query current API data, preserve requested time windows, cite canonical pages, verify important policy facts against official evidence links, label readiness, and return a clear unavailable/stale result instead of model memory.

- [ ] **Step 4: Verify API/Skill/OpenAPI parity**

Run: `pnpm vitest run test/public-api-v1.test.ts test/public-agent-skill.test.ts test/public-channel-consistency.test.ts && pnpm build`

Expected: PASS; OpenAPI validates, every documented example passes schema, curl works, 304 works, and Skill endpoints/version match OpenAPI.

- [ ] **Step 5: Commit public machine contracts**

```bash
git add src/public-intelligence/api.ts app/api/v1 app/openapi.json public/agent/tradelinks/SKILL.md src/config/env.ts .env.example test/public-api-v1.test.ts test/public-agent-skill.test.ts
git commit -m "feat: publish public intelligence api and skill"
```

**Definition of done:** Machine clients have a stable, cache-efficient, anonymous current-data contract with no private data.

### Task 8: Add Public Telegram and Complete SEO/Performance

**Files:**

- Create: `src/public-intelligence/telegram.ts`
- Modify: `src/push/channel-select.ts`
- Modify: `src/push/channel-render.ts`
- Modify: `src/push/send.ts`
- Modify: `app/sitemap.ts`
- Modify: `app/robots.ts`
- Modify: `app/layout.tsx`
- Modify: `middleware.ts`
- Test: `test/public-telegram.test.ts`
- Test: `test/public-seo.test.ts`

**Interfaces:**

- Produces: `selectPublicTelegramChanges`, `renderPublicTelegramMessage`.
- Consumes: Verified canonical records only, channel idempotency, Public URL Contract.

- [ ] **Step 1: Define Telegram and SEO failures**

```ts
it("selects only high-priority verified current versions", async () => {
  expect((await selectPublicTelegramChanges()).every((item) =>
    item.readiness === "VERIFIED" && item.urgency >= 70
  )).toBe(true);
});

it("keeps unavailable hubs and private routes out of sitemap", async () => {
  const urls = await sitemap();
  expect(urls).not.toContainEqual(expect.objectContaining({ url: expect.stringContaining("/my/") }));
  expect(urls).not.toContainEqual(expect.objectContaining({ url: expect.stringContaining("pet-supplies") }));
});
```

- [ ] **Step 2: Confirm current sitemap/navigation reflects legacy IA**

Run: `pnpm vitest run test/public-telegram.test.ts test/public-seo.test.ts`

Expected: FAIL before public selection and sitemap rewrite.

- [ ] **Step 3: Implement channel and metadata policy**

Public Telegram sends only urgency ≥70 Verified versions, once per version/channel, with title, concise impact, readiness, effective date, and canonical link. It does not send personal impact or actions.

Sitemap includes public hubs at Monitored+, supported recurring topics, published changes/guides/briefings, API documentation, and no filter URLs. Robots allows public pages and blocks `/admin`, `/my`, `/onboarding/preview`, and non-public APIs. Metadata uses canonical URLs, unique descriptions, and structured `Article`/`BreadcrumbList` JSON-LD without unsupported claims.

- [ ] **Step 4: Verify performance and browser behavior**

Run:

```bash
pnpm vitest run test/public-telegram.test.ts test/public-seo.test.ts
pnpm build
pnpm start
```

In a fresh browser verification session, inspect desktop 1440×900 and mobile 390×844 for home, US, Amazon, Shopify, one category, changes, one detail, guides, briefings, and coverage. Verify keyboard navigation, reduced motion, JavaScript-disabled content, no layout shift from evidence blocks, and no request to a worker endpoint.

Expected: tests/build PASS and browser evidence is captured from this final build.

- [ ] **Step 5: Commit distribution and SEO**

```bash
git add src/public-intelligence/telegram.ts src/push app/sitemap.ts app/robots.ts app/layout.tsx middleware.ts test/public-telegram.test.ts test/public-seo.test.ts
git commit -m "feat: complete public distribution and seo"
```

**Definition of done:** Public Telegram is evidence-safe/idempotent, public pages are indexable and cached, and final-build browser evidence exists.

### Task 9: Cut Over Routes and Retire Wire/Radar/Daily Storage

**Files:**

- Create: `src/public-intelligence/legacy-redirects.ts`
- Create: `scripts/backfill-public-content.ts`
- Create: `prisma/migrations/0013_retire_wire_radar_daily/migration.sql`
- Modify: `prisma/schema.prisma`
- Replace: `app/wire/page.tsx`
- Replace: `app/trends/page.tsx`
- Replace: `app/daily/page.tsx`
- Replace: `app/daily/[slug]/page.tsx`
- Replace: `app/api/public/alerts/route.ts`
- Replace: `app/api/public/daily/route.ts`
- Delete: `app/wire/error.tsx`
- Delete: `app/wire/loading.tsx`
- Delete: `app/trends/BestsellersBoard.tsx`
- Delete: `app/trends/error.tsx`
- Delete: `app/trends/loading.tsx`
- Delete: `app/daily/Markdown.tsx`
- Delete: `app/daily/error.tsx`
- Delete: `app/components/DiffusionArc.tsx`
- Delete: `app/components/EmptyState.tsx`
- Delete: `app/components/Filters.tsx`
- Delete: `app/components/HeroLead.tsx`
- Delete: `app/components/HotOnX.tsx`
- Delete: `app/components/LatestRail.tsx`
- Delete: `app/components/MainNav.tsx`
- Delete: `app/components/MobileTabBar.tsx`
- Delete: `app/components/PageHeader.tsx`
- Delete: `app/components/RadarGlyph.tsx`
- Delete: `app/components/RadarSection.tsx`
- Delete: `app/components/SecondaryHighlights.tsx`
- Delete: `app/components/SectionHeader.tsx`
- Delete: `app/components/SignalCard.tsx`
- Delete: `app/components/StreamCard.tsx`
- Delete: `app/components/Skeleton.tsx`
- Delete: `app/components/UtcClock.tsx`
- Delete: `app/components/WireSection.tsx`
- Delete: `app/components/WireTape.tsx`
- Delete: `app/components/alert-style.ts`
- Delete: `app/(home)/loading.tsx`
- Delete: `app/lib/alerts.ts`
- Delete: `app/lib/buckets.ts`
- Delete: `app/lib/digest.ts`
- Delete: `app/lib/home-data.ts`
- Delete: `app/lib/home.ts`
- Delete: `src/alerts/db.ts`
- Delete: `src/alerts/review.ts`
- Delete: `src/alerts/route.ts`
- Delete: `src/daily/compose.ts`
- Delete: `src/daily/db.ts`
- Delete: `src/daily/review.ts`
- Delete: `src/daily/translate.ts`
- Delete: `scripts/send-digest.ts`
- Delete: `scripts/daily-demo-data.ts`
- Delete: `scripts/daily-note-pipeline.ts`
- Delete: `scripts/daily-note-seed.ts`
- Delete: `test/alert-route.test.ts`
- Delete: `test/daily-note.test.ts`
- Delete: `test/daily-note-review.test.ts`
- Delete: `test/digest.test.ts`
- Delete: `test/home-select.test.ts`
- Modify: `next.config.mjs`
- Modify: `middleware.ts`
- Test: `test/legacy-redirects.test.ts`
- Modify: `docs/architecture.md`
- Modify: `.agent/CURRENT.md`

**Interfaces:**

- Produces: `planPublicBackfill`, `applyPublicBackfill`, `getLegacyRedirect`.
- Consumes: accepted replacement routes, public schema, P0 pass report.

- [ ] **Step 1: Write redirect and reconciliation failures**

```ts
it.each([
  ["/wire", "/changes"],
  ["/trends", "/amazon-us?view=demand-signals"],
  ["/daily", "/briefings"],
  ["/zh/wire", "/changes"],
])("redirects %s permanently", async (from, to) => {
  const response = await requestRoute(from);
  expect(response.status).toBe(308);
  expect(response.headers.location).toBe(to);
});

it("accounts for every legacy public row before retirement", async () => {
  const report = await planPublicBackfill();
  expect(report.unmappedAlerts).toEqual([]);
  expect(report.unmappedPublishedDailyNotes).toEqual([]);
});
```

- [ ] **Step 2: Confirm replacement and reconciliation are incomplete**

Run: `pnpm vitest run test/legacy-redirects.test.ts`

Expected: FAIL until route cutover/backfill exists.

- [ ] **Step 3: Backfill public content and permanent redirects**

```ts
type PublicBackfillReport = {
  fingerprint: string;
  mappedAlerts: number;
  mappedDailyNotes: number;
  redirects: number;
  unmappedAlerts: Array<{ id: string; reason: string }>;
  unmappedPublishedDailyNotes: Array<{ id: string; reason: string }>;
};
```

Map eligible legacy daily notes to reviewed Briefing drafts and each old slug to its new briefing route. API v0 routes return 308 to API v1 documentation, not legacy JSON. The home page uses the public shell. Use a dry-run fingerprint before apply.

After redirects and backfill succeed, delete the listed legacy UI/data modules and update every surviving import to the canonical/public-intelligence modules. This command is the dead-contract gate:

```bash
rg -n "from [\"'].*(src/alerts|/alerts|src/daily|/daily)|prisma\\.(alert|dailyNote|cluster)\\b|href=.*\"/(wire|trends|daily)" app src scripts test \
  --glob '!app/wire/**' \
  --glob '!app/trends/**' \
  --glob '!app/daily/**' \
  --glob '!src/public-intelligence/legacy-redirects.ts' \
  --glob '!test/legacy-redirects.test.ts'
```

Expected: no output. The redirect-only route files use target constants without importing legacy models.

- [ ] **Step 4: Pass cutover and forward migration checkpoints**

Preconditions:

```text
Foundation feature accepted
Operations P0 report pass=true
Public Tasks 1–8 accepted
Public backfill unmapped arrays empty
Production smoke tests pass on replacement deployment
Neon branch phase1-public-pre-retirement created
```

Apply `0013` to the branch, verify Item membership/canonical counts, then production. If any check fails, stop traffic cutover, redeploy the prior app, and leave old tables intact. After production migration, rollback uses the preserved pre-retirement Neon branch into a new recovery branch plus the prior app release; no down migration is run.

- [ ] **Step 5: Verify final routes, schema, and production build**

Run:

```bash
pnpm db:validate
pnpm vitest run test/legacy-redirects.test.ts test/public-channel-consistency.test.ts
pnpm lint
pnpm test
pnpm build
```

Expected: all exit 0; Prisma has no Alert/legacy Cluster/DailyNote model, all legacy URLs 308, and new canonical routes return 200.

- [ ] **Step 6: Run independent T3 review and verification**

One fresh reviewer runs `$impeccable critique public-intelligence` against information architecture, readiness copy, evidence traceability, responsive/accessibility behavior, and scope. A different fresh verifier runs `$impeccable audit public-intelligence` against the final build and writes screenshots to `design/shots/phase1-public-final/`. The implementation owner fixes every finding or records Human Owner acceptance, then runs `$impeccable polish public-intelligence` and the verifier reruns the full matrix.

- [ ] **Step 7: Commit retirement and milestone**

```bash
git add prisma/schema.prisma prisma/migrations/0013_retire_wire_radar_daily src/public-intelligence/legacy-redirects.ts scripts/backfill-public-content.ts app next.config.mjs middleware.ts test/legacy-redirects.test.ts docs/architecture.md .agent/CURRENT.md design/shots/phase1-public-final
git add -u src/alerts src/daily scripts/send-digest.ts scripts/daily-demo-data.ts scripts/daily-note-pipeline.ts scripts/daily-note-seed.ts test/alert-route.test.ts test/daily-note.test.ts test/daily-note-review.test.ts test/digest.test.ts test/home-select.test.ts
git commit -m "feat: cut over phase1 public intelligence"
```

**Definition of done:** New public routes own all traffic, permanent redirects preserve old links, obsolete product storage is removed by a verified forward migration, and independent final-build evidence is accepted.

## Monitoring and Rollback

- Monitor public cache hit ratio, origin query count, route errors, 404 rate, API latency/status, feed generation failures, sitemap size, Telegram idempotency, and canonical-version mismatch.
- Coverage pages show source and capability status from cached historical data when collection is degraded.
- Before `0012`, create `phase1-public-pre-migration`; before `0013`, create `phase1-public-pre-retirement`.
- Before redirects, capture sitemap/canonical inventory and top legacy URLs.
- Before retirement, retain the last legacy-compatible application release and database branch.
- Route rollback before `0013`: deploy the old release and remove redirect config.
- Data rollback after `0013`: restore the pre-retirement branch into a new branch, point the old release at that branch under operator control, diagnose, and ship a forward corrective migration. Do not overwrite production or mutate canonical history.

## Full Verification Gate

```bash
pnpm db:validate
pnpm lint
pnpm test
pnpm build
pnpm test:e2e test/e2e/public-intelligence.spec.ts
pnpm tsx scripts/backfill-public-content.ts --dry-run
```

Then run browser verification from the final build at 1440×900 and 390×844, validate RSS XML, validate OpenAPI 3.1, request API v1 with curl, and crawl all sitemap URLs. Expected: every automated check exits 0, the dry-run has no unmapped published rows, public routes return 200, legacy routes return 308, and no private fields appear in HTML/feed/API/cache payloads.

## Product Spec Coverage Check

- [x] US Market, Amazon US, Shopify US, Categories, Changes, Guides, Briefings, Coverage IA: Tasks 2–5.
- [x] Six initial hubs gated at Monitored: Task 3.
- [x] Long-lived recurring-policy and Risk Attribute topic aggregation: Task 3.
- [x] Verified default, All Monitored expert view, Experimental separation: Tasks 1 and 4.
- [x] Canonical evidence/version/correction page: Task 4.
- [x] Evergreen sourced guides and review date: Task 5.
- [x] Live Changes, weekly, monthly, conditional daily: Tasks 4 and 5.
- [x] Stable SEO URLs, sitemap, canonical metadata, 308 redirects: Tasks 8 and 9.
- [x] Free public RSS with canonical/evidence links and no private/full text: Task 6.
- [x] Anonymous REST API, OpenAPI, ETag, Last-Modified, fingerprint, opaque cursor: Task 7.
- [x] Normal non-browser clients: Task 7.
- [x] Versioned Agent Skill with current-data/source-verification/failure instructions: Task 7.
- [x] Public Telegram high-priority Verified changes: Task 8.
- [x] One canonical version across web/report/RSS/API/Skill/Telegram: Tasks 1 and 6–8.
- [x] Search, share, and account-backed track entry point: Task 4; persistence completes in Private Task 6.
- [x] Public page cache/performance capacity for later Ads evaluation: Cache Contract and Task 8; no Ads code.
- [x] Wire/Radar/Daily reframing and no long compatibility layer: Task 9.
- [x] T3 design/review/verification gate: Tasks 2, 8, and 9.
- [x] Plus and Phase 2 remain excluded: Global Constraints and Non-goals.

## Decisions Requiring Human Owner Confirmation

1. **English-only cutover:** approve 308 redirects from `/zh` routes to English rather than shipping a partially translated new IA. Recommendation: approve for Phase 1 and retain translation data for a later full locale milestone.
2. **Canonical URL vocabulary:** approve `/us`, `/amazon-us`, `/shopify-us`, `/categories`, `/changes`, `/guides`, `/briefings`, and `/coverage`. Recommendation: approve before mockup work because redirects and API links depend on it.
3. **T3 visual direction and shadcn style:** approve the T3 Brief and HTML mockup before component work. Recommendation: retain the current editorial visual identity and semantic tokens, using shadcn only as accessible primitives.
4. **Amazon hub availability:** approve publishing an Amazon hub at Monitored with an explicit incomplete-official-policy warning, or keep it hidden until the critical source is Verified. Recommendation: publish only if public announcements/page monitoring reach Monitored and put the limitation above the fold.
5. **Conditional daily threshold:** approve at least three qualified changes including one Verified. Recommendation: approve; absence is more trustworthy than manufactured volume.
6. **Public API abuse posture:** approve cached anonymous reads with strict page/query limits and request-volume alerts, without a per-request Neon rate-limit write. Recommendation: approve for validation; add a CDN/firewall limit only when observed traffic justifies its cost.
7. **Old page retirement timing:** approve executing `0013` immediately after P0 plus public smoke/reconciliation gates, rather than preserving old tables for a release cycle. Recommendation: approve because there are no production users and permanent redirects preserve URLs.
8. **Recurring topic vocabulary:** approve Import & Customs, Product Safety & Recalls, Labeling & Claims, Fees & Payments, Privacy & Consumer Protection, and Listing & Account Health. Recommendation: approve as the stable Phase 1 aggregation set; Risk Attributes remain the more granular content-side classification.
