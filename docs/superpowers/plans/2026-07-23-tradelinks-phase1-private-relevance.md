# TradeLinks Phase 1 Private Relevance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete free seller experience: profile-first personalized preview, one-time Magic Link identity, explainable My Briefing, account-backed watchlist and actions, default weekly email, feedback, cross-device state, and privacy-safe deletion.

**Architecture:** Existing Neon Auth remains the admin identity boundary at `/api/auth`; seller identity is a separate minimal passwordless subsystem because the installed managed Neon Auth integration has no verified Magic Link plugin contract. A signed short-lived preview cookie carries non-identity choices until email submission; a hashed one-time token then verifies the email and atomically creates the Seller Profile. Deterministic relevance matches only current reviewed Verified changes, persists version-pinned assessments, and powers web/email/action views without entering public caches or APIs.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript 5, Prisma 6.2, PostgreSQL/Neon, Node.js `crypto`, Zod, Resend, shadcn/ui, Vitest, Playwright through the project browser-verification workflow.

## Global Constraints

- This plan depends on accepted Foundation and Public Intelligence features and a passing P0 seven-day operations report.
- Seller Profile contains only operating stage, market fixed to United States, platform Amazon/Shopify/both, and at most two Product Categories.
- Email and account identifiers belong to identity records, not Seller Profile.
- Free weekly email preference belongs to Subscription Settings, not Seller Profile.
- Phase 1 requests no store credentials, Amazon/Shopify OAuth, orders, catalog, inventory, advertising data, financial data, or manually selected Risk Attributes.
- Personalized assessment and delivery use current reviewed Verified changes only; a Stale capability suppresses new assessments, actions, and email entries.
- A Personal Action is created only after the user selects `Create Action`; Phase 1 never executes externally.
- Due dates exist only when evidence supports a specific effective/deadline date.
- Magic Links are one-time, expire after 15 minutes, and raw tokens are never stored.
- Seller Profile, relevance, watchlist, actions, sessions, and interaction events never enter public APIs, RSS, ISR output, shared caches, logs, or analytics payloads.
- Free experience includes one Seller Profile and default weekly email; Plus, payments, instant/daily alerts, deadline reminders, private RSS, personalized Telegram, and private Agent/API are excluded.
- This is a T3 change because it adds authentication, personal data, new pages, and destructive account deletion. Human Owner approval plus independent security, design review, and browser verification are mandatory.
- Private UI reuses the Public plan's approved shadcn registry and uses only CSS state transitions; React Bits and anime.js are not added. Every transition has a reduced-motion alternative.
- This planning session changes no product code, database, email provider, or cloud configuration.

---

## Delivery Boundary

### Goals

- Complete the exact three-step profile, personalized preview, email, and Magic Link journey.
- Preserve cross-device profile, watchlist, action, and briefing state.
- Make every relevance decision explainable by market, platform, category, stage, urgency, and evidence readiness.
- Support save, dismiss-as-irrelevant, Create Action, complete, archive, restore, and correction warning.
- Deliver idempotent weekly email and measure Weekly Relevant Seller Profiles.
- Support unsubscribe and complete private-data deletion.

### Non-goals

- OAuth with seller platforms, store integrations, automatic action execution, legal/tax advice, multi-profile/team accounts, paid entitlements, private feeds, API tokens, AI chat, or Phase 2 agents.
- Opaque model-generated relevance scores.
- Persisting anonymous preview state indefinitely or creating browser-only bookmarks.

### Risks and controls

| Risk | Control |
|---|---|
| Custom passwordless identity is implemented incorrectly | Narrow protocol, hashed random tokens, one-time transaction, Origin check, rate limit, secure cookies, session rotation, security test matrix, independent reviewer. |
| Admin and seller auth boundaries become confused | Separate cookie name, route namespace, middleware functions, account tables, and tests proving seller sessions cannot reach `/admin`. |
| Preview leaks private selections into shared cache | Signed HttpOnly cookie, `private, no-store`, dynamic private routes, no query-string profile payload. |
| Relevance overstates uncertain content | Verified-only input, capability-stale suppression, persisted matched dimensions, no model in the score path. |
| Corrected change leaves an unsafe action | Action pins version and receives a review warning when the current version changes materially. |
| Duplicate weekly emails | Database idempotency key precedes provider send; retries reconcile provider message ID. |
| Deletion leaves personal rows | Database cascades, provider/contact cleanup, verification query, and audit event containing no email/profile ID. |

### Acceptance standard

- A visitor completes three steps, sees three-to-five current relevant Verified changes plus explanations/readiness/example action/weekly preview before registration, submits email, and completes one-time Magic Link verification on another device.
- The saved Seller Profile has market US, one platform choice, one or two supported categories, and no email/cadence fields.
- My Briefing explains every match; Stale or corrected sources visibly suppress or warn.
- Watchlist and actions persist across devices; Create Action, complete, archive, and restore are idempotent.
- Weekly email sends once per account/ISO week/fingerprint, links to the same canonical versions, and unsubscribe works.
- Account deletion revokes sessions and removes identity/profile/relevance/action/delivery/event rows.
- Public HTML, cache payloads, RSS, API, and Skill remain free of all private types and values.

## Seller Authentication Decision

The implementation specified here is an application-owned passwordless seller session:

- Existing `@neondatabase/auth` Google flow remains unchanged for `/admin`.
- Seller endpoints live under `/api/seller-auth/*`.
- Magic Link and session tokens are 32 random bytes, base64url encoded for transport, and stored only as SHA-256 hashes.
- Preview cookie signatures and IP hashing use `SELLER_AUTH_SECRET`, a 32-byte secret stored in Vercel/Railway secrets.
- Magic Link expires in 15 minutes; Seller Session expires after 30 days and rotates after successful verification.
- Cookie is `__Host-tl_seller_session`, `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
- Request Link accepts only same-origin POST, rate-limited to 5/email/hour and 20/IP/hour; response is always generic.
- Verify consumes the token and creates/updates profile in one database transaction.

This avoids asserting that the current managed Neon Auth package supports a Magic Link plugin. If the Human Owner prefers one identity provider for admin and seller accounts, stop before Task 1 and replace this document with a verified managed-provider design; workers must not improvise a second branch during implementation.

## Private URL Contract

| Capability | Route |
|---|---|
| Profile steps | `/onboarding` |
| Personalized preview and email capture | `/onboarding/preview` |
| Request Magic Link | `POST /api/seller-auth/request-link` |
| Verify Magic Link | `GET /api/seller-auth/verify?token=…&returnTo=…` |
| Sign out | `POST /api/seller-auth/sign-out` |
| My Briefing | `/my/briefing` |
| Actions | `/my/actions` |
| Watchlist | `/my/watchlist` |
| Profile and subscription settings | `/my/profile` |
| Feedback | `POST /api/my/relevance/[assessmentId]/feedback` |
| Create/update action | `POST /api/my/actions`, `PATCH /api/my/actions/[actionId]` |
| Save/remove change | `POST /api/my/watchlist`, `DELETE /api/my/watchlist/[changeId]` |
| Track/replace a profile category | `POST /api/my/profile/categories` |
| One-click weekly email unsubscribe | `GET /api/my/email/unsubscribe?account=[accountId]&token=[signature]` |
| Delete account | `POST /api/my/account/delete-request`, `POST /api/my/account/delete-confirm` |

All `/my/*` pages and endpoints use `Cache-Control: private, no-store`.

## File Map

### Create: schema, identity, and privacy

- `prisma/migrations/0014_phase1_private_relevance/migration.sql`
- `prisma/migrations/0015_retire_legacy_private_models/migration.sql`
- `src/seller-auth/types.ts`
- `src/seller-auth/crypto.ts`
- `src/seller-auth/rate-limit.ts`
- `src/seller-auth/magic-link.ts`
- `src/seller-auth/session.ts`
- `src/seller-auth/guards.ts`
- `src/seller-auth/deletion.ts`
- `app/api/seller-auth/request-link/route.ts`
- `app/api/seller-auth/verify/route.ts`
- `app/api/seller-auth/sign-out/route.ts`
- `app/api/my/account/delete-request/route.ts`
- `app/api/my/account/delete-confirm/route.ts`
- `test/seller-auth-crypto.test.ts`
- `test/seller-auth-routes.test.ts`
- `test/seller-auth-boundary.test.ts`
- `test/account-deletion.test.ts`

### Create: onboarding and private product

- `src/onboarding/profile-input.ts`
- `src/onboarding/preview-cookie.ts`
- `src/onboarding/preview.ts`
- `app/(onboarding)/onboarding/page.tsx`
- `app/(onboarding)/onboarding/preview/page.tsx`
- `app/(onboarding)/onboarding/ProfileWizard.tsx`
- `app/(onboarding)/onboarding/PreviewCard.tsx`
- `app/(private)/layout.tsx`
- `app/(private)/my/PrivateNav.tsx`
- `app/(private)/my/briefing/page.tsx`
- `app/(private)/my/actions/page.tsx`
- `app/(private)/my/watchlist/page.tsx`
- `app/(private)/my/profile/page.tsx`
- `app/(private)/my/loading.tsx`
- `app/(private)/my/error.tsx`
- `test/onboarding.test.ts`
- `test/private-shell.test.tsx`

### Create: relevance, briefing, and actions

- `src/relevance/types.ts`
- `src/relevance/score.ts`
- `src/relevance/explain.ts`
- `src/relevance/preferences.ts`
- `src/relevance/assess.ts`
- `src/relevance/briefing.ts`
- `src/relevance/actions.ts`
- `src/relevance/watchlist.ts`
- `src/relevance/corrections.ts`
- `app/api/my/relevance/[assessmentId]/feedback/route.ts`
- `app/api/my/interactions/route.ts`
- `app/api/my/actions/route.ts`
- `app/api/my/actions/[actionId]/route.ts`
- `app/api/my/watchlist/route.ts`
- `app/api/my/watchlist/[changeId]/route.ts`
- `app/api/my/profile/categories/route.ts`
- `test/relevance-score.test.ts`
- `test/relevance-assess.test.ts`
- `test/personal-actions.test.ts`
- `test/private-corrections.test.ts`

### Create: email and metrics

- `src/email/my-weekly-briefing.ts`
- `src/email/private-delivery.ts`
- `src/email/unsubscribe.ts`
- `src/metrics/weekly-relevant-seller-profiles.ts`
- `src/jobs/private-weekly-briefing.ts`
- `test/private-weekly-email.test.ts`
- `test/weekly-relevant-seller-profiles.test.ts`
- `test/profile-settings.test.ts`

### Create: design and end-to-end evidence

- `design/phase1-private-relevance.html`
- `design/shots/phase1-private-final/`
- `test/e2e/private-relevance.spec.ts`
- `docs/security/seller-auth-threat-model.md`
- `docs/privacy/private-data-map.md`

### Modify

- `prisma/schema.prisma`
- `src/config/env.ts`
- `middleware.ts`
- `app/(public)/changes/[slug]/page.tsx`
- `app/(public)/categories/[category]/page.tsx`
- `src/jobs/registry.ts`
- `src/jobs/types.ts`
- `app/subscribe/page.tsx`
- `app/subscribe/confirmed/page.tsx`
- `app/subscribe/unsubscribed/page.tsx`
- `app/api/subscribe/route.ts`
- `app/api/subscribe/confirm/route.ts`
- `app/api/unsubscribe/route.ts`
- `docs/architecture.md`
- `docs/railway-setup.md`
- `.env.example`
- `.agent/CURRENT.md`

## Private Data Model

`0014_phase1_private_relevance/migration.sql` adds:

```prisma
enum RelevanceFeedback { NONE HELPFUL IRRELEVANT }
enum SellerMagicLinkPurpose { VERIFY_EMAIL DELETE_ACCOUNT }
enum PersonalActionStatus { OPEN COMPLETE ARCHIVED }
enum DeliveryChannel { EMAIL }
enum DeliveryStatus { PENDING SENT FAILED SUPPRESSED }
enum InteractionType {
  OPENED
  SAVED
  UNSAVED
  DISMISSED_IRRELEVANT
  ACTION_CREATED
  ACTION_COMPLETED
  ACTION_ARCHIVED
}

model SellerAccount {
  id              String               @id @default(cuid())
  email           String               @unique
  emailVerifiedAt DateTime?
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt
  profile         SellerProfile?
  sessions        SellerSession[]
  magicLinks      SellerMagicLink[]
  settings        SubscriptionSetting?
  deliveries      BriefingDelivery[]
}

model SellerMagicLink {
  id                String        @id @default(cuid())
  accountId         String
  tokenHash         String        @unique
  purpose           SellerMagicLinkPurpose
  profilePayload    Json?
  returnTo          String
  expiresAt         DateTime
  consumedAt        DateTime?
  requestedIpHash   String
  requestedAgentHash String
  createdAt         DateTime      @default(now())
  account           SellerAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
}

model SellerSession {
  id         String        @id @default(cuid())
  accountId  String
  tokenHash  String        @unique
  expiresAt  DateTime
  lastSeenAt DateTime      @default(now())
  revokedAt  DateTime?
  createdAt  DateTime      @default(now())
  account    SellerAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
}

model SellerAuthRateLimit {
  keyHash     String
  windowStart DateTime
  count       Int
  expiresAt   DateTime
  @@id([keyHash, windowStart])
}

model SellerProfile {
  id                String               @id @default(cuid())
  accountId         String               @unique
  operatingStage    OperatingStage
  market            MarketCode           @default(US)
  platforms         PlatformCode[]
  productCategories ProductCategory[]
  completedAt       DateTime
  createdAt         DateTime             @default(now())
  updatedAt         DateTime             @updatedAt
  account           SellerAccount        @relation(fields: [accountId], references: [id], onDelete: Cascade)
  assessments       RelevanceAssessment[]
  preferences       RelevancePreference[]
  savedChanges      SavedChange[]
  actions           PersonalAction[]
  interactions      InteractionEvent[]
}

model SubscriptionSetting {
  accountId          String        @id
  weeklyEmailEnabled Boolean       @default(true)
  unsubscribedAt     DateTime?
  updatedAt          DateTime      @updatedAt
  account            SellerAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
}

model RelevanceAssessment {
  id                  String            @id @default(cuid())
  profileId           String
  changeVersionId     String
  score               Int
  matchedDimensions   Json
  explanation         String
  recommendedNextStep String
  generatedAt         DateTime          @default(now())
  reviewedAt          DateTime?
  feedback            RelevanceFeedback @default(NONE)
  feedbackAt          DateTime?
  profile             SellerProfile     @relation(fields: [profileId], references: [id], onDelete: Cascade)
  changeVersion       CanonicalChangeVersion @relation(fields: [changeVersionId], references: [id])
  @@unique([profileId, changeVersionId])
}

model RelevancePreference {
  profileId    String
  dimensionKey String
  adjustment   Int
  updatedAt    DateTime @updatedAt
  profile      SellerProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  @@id([profileId, dimensionKey])
}

model SavedChange {
  profileId       String
  canonicalChangeId String
  createdAt       DateTime @default(now())
  profile         SellerProfile  @relation(fields: [profileId], references: [id], onDelete: Cascade)
  canonicalChange CanonicalChange @relation(fields: [canonicalChangeId], references: [id])
  @@id([profileId, canonicalChangeId])
}

model PersonalAction {
  id                  String               @id @default(cuid())
  profileId           String
  canonicalChangeId   String
  changeVersionId     String
  title               String
  description         String
  dueAt               DateTime?
  dueAtEvidenceId     String?
  status              PersonalActionStatus @default(OPEN)
  completionNote      String?
  versionWarningAt    DateTime?
  createdAt           DateTime              @default(now())
  updatedAt           DateTime              @updatedAt
  profile             SellerProfile         @relation(fields: [profileId], references: [id], onDelete: Cascade)
  canonicalChange     CanonicalChange        @relation(fields: [canonicalChangeId], references: [id])
  changeVersion       CanonicalChangeVersion @relation(fields: [changeVersionId], references: [id])
  dueAtEvidence       EvidenceRecord?        @relation(fields: [dueAtEvidenceId], references: [id])
  @@unique([profileId, canonicalChangeId])
}

model BriefingDelivery {
  id                String         @id @default(cuid())
  accountId         String
  periodKey         String
  channel           DeliveryChannel
  briefingFingerprint String
  idempotencyKey    String         @unique
  status            DeliveryStatus @default(PENDING)
  providerMessageId String?
  errorCode         String?
  sentAt            DateTime?
  createdAt         DateTime       @default(now())
  account           SellerAccount  @relation(fields: [accountId], references: [id], onDelete: Cascade)
  @@unique([accountId, periodKey, channel])
}

model InteractionEvent {
  id                String          @id @default(cuid())
  profileId         String
  canonicalChangeId String?
  assessmentId      String?
  dedupeKey         String?         @unique
  type              InteractionType
  occurredAt        DateTime        @default(now())
  profile           SellerProfile   @relation(fields: [profileId], references: [id], onDelete: Cascade)
  @@index([profileId, occurredAt])
}
```

`OperatingStage` is created by Foundation migration `0011_phase1_intelligence_foundation` because canonical versions also carry applicable stages; `0014` reuses the same enum.

Add PostgreSQL checks in the migration:

```sql
ALTER TABLE "SellerProfile"
ADD CONSTRAINT "SellerProfile_one_or_two_categories"
CHECK (cardinality("productCategories") BETWEEN 1 AND 2);

ALTER TABLE "SellerProfile"
ADD CONSTRAINT "SellerProfile_one_or_two_platforms"
CHECK (
  cardinality("platforms") BETWEEN 1 AND 2
  AND "platforms" <@ ARRAY['AMAZON','SHOPIFY']::"PlatformCode"[]
);

ALTER TABLE "SellerProfile"
ADD CONSTRAINT "SellerProfile_us_only"
CHECK ("market" = 'US');

ALTER TABLE "SellerAccount"
ADD CONSTRAINT "SellerAccount_normalized_email"
CHECK ("email" = lower(btrim("email")));

ALTER TABLE "RelevanceAssessment"
ADD CONSTRAINT "RelevanceAssessment_score_range"
CHECK ("score" BETWEEN 0 AND 100);
```

The final schema must include inverse relations on `CanonicalChange`, `CanonicalChangeVersion`, and `EvidenceRecord`.

## Relevance Contract

Only a current, Published, Verified version whose required capabilities are not Stale is eligible.

```ts
export type RelevanceScore = {
  total: number;
  matched: {
    market: true;
    platform: { points: 15 | 30; labels: PlatformCode[] };
    category: { points: 20 | 30; labels: ProductCategory[] };
    stage: { points: 0 | 15; label: OperatingStage | null };
    urgency: { points: number; value: number };
    readiness: { points: 10; value: "VERIFIED" };
    preferenceAdjustment: number;
  };
  explanation: string;
};
```

Scoring:

- market mismatch: ineligible;
- exact platform intersection: 30; an all-platform general change: 15;
- exact category intersection: 30; `ALL_PRODUCTS`: 20;
- operating stage listed on the canonical version: 15; otherwise 0;
- urgency: `round(clamp(urgency, 0, 100) × 0.15)`;
- Verified: 10;
- learned preference adjustment: -10 to +5;
- clamp total to 0–100.

Preview threshold is 55 and returns the top three-to-five. My Briefing and weekly email threshold is 60. Ties sort by urgency, effective date, source-published date, then stable change ID. An `IRRELEVANT` feedback excludes the exact assessment and sets `-10` for `signal:[type]:category:[category]`; `HELPFUL` sets `+5`; repeated feedback overwrites rather than accumulates.

## Pactify Execution Contract

Use feature id `phase1-private-relevance` only after public routes/read model are accepted and P0 passes:

```bash
PACT_AGENT_ID=codex pactify plan \
  --feature phase1-private-relevance \
  --planner-kind codex-cli \
  "Execute docs/superpowers/plans/2026-07-23-tradelinks-phase1-private-relevance.md exactly. One plan task per Pactify task; assign every implementation task to kimi and every review to claude; enforce fresh-context T3 design, security, review, and verification gates."
pactify plan apply phase1-private-relevance
```

Codex 5.6 Sol orchestrates, Kimi Code K3 implements, and Claude Code Opus 5 reviews, following the owner's 2026-07-28 reviewer-model decision. Security review and final verification use fresh Claude Code sessions with no implementation context; no task can be self-accepted. Task 8 depends on Tasks 1–7 and a fresh production-shaped migration branch.

### Task 1: Add the Private Schema and Privacy Boundaries

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/0014_phase1_private_relevance/migration.sql`
- Create: `src/seller-auth/types.ts`
- Create: `docs/privacy/private-data-map.md`
- Modify: `docs/architecture.md`
- Test: `test/private-schema.test.ts`
- Test: `test/public-private-boundary.test.ts`

**Interfaces:**

- Produces: Prisma clients and enum names in Private Data Model; `SellerProfileInput`.
- Consumes: Foundation enums and canonical models.

- [ ] **Step 1: Write schema and public-leak failures**

```ts
it("rejects more than two profile categories", async () => {
  await expect(createProfile({ productCategories: threeCategories }))
    .rejects.toMatchObject({ code: expect.any(String) });
});

it("keeps private field names out of public serializers", async () => {
  expect(JSON.stringify(await listPublicChanges({ pool: "verified", limit: 20 })))
    .not.toMatch(/email|profileId|assessmentId|actionId|session/i);
});
```

- [ ] **Step 2: Confirm the current schema has no private product**

Run: `pnpm vitest run test/private-schema.test.ts test/public-private-boundary.test.ts`

Expected: FAIL because private models are absent.

- [ ] **Step 3: Create the forward migration and data map**

Create Neon branch `phase1-private-pre-migration`, add the exact models/checks, run Prisma generation, and document each field's purpose, retention, reader/writer, cache policy, log policy, deletion behavior, and processor in `docs/privacy/private-data-map.md`.

```ts
export const SellerProfileInputSchema = z.object({
  operatingStage: z.enum(["EXPLORING_US", "PREPARING_TO_LAUNCH", "ALREADY_SELLING"]),
  market: z.literal("US"),
  platforms: z.array(z.enum(["AMAZON", "SHOPIFY"])).min(1).max(2),
  productCategories: z.array(InitialProductCategorySchema).min(1).max(2),
});
```

- [ ] **Step 4: Validate migration and isolation**

Run: `pnpm db:validate && pnpm vitest run test/private-schema.test.ts test/public-private-boundary.test.ts`

Expected: PASS; database checks reject invalid profiles and all public serialization tests remain unchanged.

- [ ] **Step 5: Commit schema and privacy map**

```bash
git add prisma/schema.prisma prisma/migrations/0014_phase1_private_relevance src/seller-auth/types.ts docs/privacy/private-data-map.md docs/architecture.md test/private-schema.test.ts test/public-private-boundary.test.ts
git commit -m "feat: add private relevance data model"
```

**Definition of done:** Profile constraints exist at application and database layers, cascades are explicit, and every private field has a documented lifecycle.

### Task 2: Implement One-Time Seller Magic Link and Sessions

**Files:**

- Create: `src/seller-auth/crypto.ts`
- Create: `src/seller-auth/rate-limit.ts`
- Create: `src/seller-auth/magic-link.ts`
- Create: `src/seller-auth/session.ts`
- Create: `src/seller-auth/guards.ts`
- Create: `app/api/seller-auth/request-link/route.ts`
- Create: `app/api/seller-auth/verify/route.ts`
- Create: `app/api/seller-auth/sign-out/route.ts`
- Modify: `src/config/env.ts`
- Modify: `.env.example`
- Modify: `middleware.ts`
- Create: `docs/security/seller-auth-threat-model.md`
- Test: `test/seller-auth-crypto.test.ts`
- Test: `test/seller-auth-routes.test.ts`
- Test: `test/seller-auth-boundary.test.ts`

**Interfaces:**

- Produces: `issueMagicLink`, `consumeMagicLink`, `createSellerSession`, `getSellerSession`, `requireSellerSession`, `revokeSellerSession`.
- Consumes: `SellerProfileInput`, Resend transactional sender.

- [ ] **Step 1: Write expiry, replay, enumeration, and auth-boundary failures**

```ts
it("consumes a magic link only once", async () => {
  const link = await issueTestMagicLink();
  expect((await consumeMagicLink(link.rawToken)).status).toBe("VERIFIED");
  expect((await consumeMagicLink(link.rawToken)).status).toBe("INVALID_OR_EXPIRED");
});

it("uses the same response for known and unknown email", async () => {
  expect(await requestLink("known@example.com")).toEqual(await requestLink("unknown@example.com"));
});

it("saves an eligible requested change after cross-device verification", async () => {
  const link = await issueTestMagicLink({ requestedChangeId: verifiedChange.id });
  const result = await consumeMagicLink(link.rawToken);
  expect(await loadSavedChange(result.profileId, verifiedChange.id)).toBeTruthy();
});

it("does not authorize a seller session for admin", async () => {
  expect((await requestAdminWithSellerCookie()).status).toBe(403);
});
```

- [ ] **Step 2: Confirm seller auth is absent**

Run: `pnpm vitest run test/seller-auth-crypto.test.ts test/seller-auth-routes.test.ts test/seller-auth-boundary.test.ts`

Expected: FAIL because seller-auth modules/routes do not exist.

- [ ] **Step 3: Implement the narrow protocol**

```ts
export function generateOpaqueToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}
```

Normalize email with trim/lowercase and reject invalid syntax/length. Validate `Origin`, use generic `202`, rate-limit hashed email/IP, store no raw token, allow only `/my/*` return paths, and log only request/result code plus token row ID. Verification locks the token row, checks `consumedAt`/expiry, creates profile/settings/session, optionally saves the eligible `requestedChangeId`, and sets consumed time in one transaction. Other valid device sessions remain active; sign-out revokes the current session and account deletion revokes all sessions.

- [ ] **Step 4: Verify security matrix**

Run:

```bash
pnpm vitest run test/seller-auth-crypto.test.ts test/seller-auth-routes.test.ts test/seller-auth-boundary.test.ts
pnpm lint
```

Expected: PASS for expiry, replay, race, open redirect, enumeration, rate limit, cookie flags, session revocation, CSRF Origin, and admin/seller separation.

- [ ] **Step 5: Commit identity with threat model**

```bash
git add src/seller-auth app/api/seller-auth src/config/env.ts .env.example middleware.ts docs/security/seller-auth-threat-model.md test/seller-auth-crypto.test.ts test/seller-auth-routes.test.ts test/seller-auth-boundary.test.ts
git commit -m "feat: add seller magic link identity"
```

**Definition of done:** Tokens are one-time/short-lived/hashed, sessions are revocable and secure, enumeration/open redirects are blocked, and admin auth remains separate.

### Task 3: Build Profile-First Preview without Public Data Leakage

**Files:**

- Create: `src/onboarding/profile-input.ts`
- Create: `src/onboarding/preview-cookie.ts`
- Create: `src/onboarding/preview.ts`
- Create: `app/(onboarding)/onboarding/ProfileWizard.tsx`
- Create: `app/(onboarding)/onboarding/PreviewCard.tsx`
- Create: `app/(onboarding)/onboarding/page.tsx`
- Create: `app/(onboarding)/onboarding/preview/page.tsx`
- Modify: `app/(public)/categories/[category]/page.tsx`
- Test: `test/onboarding.test.ts`

**Interfaces:**

- Produces: `setPreviewCookie`, `readPreviewCookie`, `getPersonalizedPreview`, `ProfileWizard`.
- Consumes: public canonical records, Relevance score function contract from Task 4, seller Magic Link request.

- [ ] **Step 1: Write three-step and cookie-boundary failures**

```ts
it("accepts one or two launch categories and rejects three", () => {
  expect(ProfileInputSchema.safeParse(validTwoCategoryProfile).success).toBe(true);
  expect(ProfileInputSchema.safeParse(threeCategoryProfile).success).toBe(false);
});

it("does not expose profile values in the preview URL or shared cache", async () => {
  const response = await submitWizard(validProfile);
  expect(response.headers.location).toBe("/onboarding/preview");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
});

it("prefills an allowlisted category without accepting a third category", async () => {
  const wizard = await openOnboarding("?category=consumer-electronics");
  expect(wizard.selectedCategories).toEqual(["CONSUMER_ELECTRONICS"]);
  expect(applyCategoryQuery(wizard, "unknown")).toEqual(wizard);
});
```

- [ ] **Step 2: Confirm onboarding routes are absent**

Run: `pnpm vitest run test/onboarding.test.ts`

Expected: FAIL before onboarding modules exist.

- [ ] **Step 3: Implement signed 30-minute preview state**

```ts
type PreviewEnvelope = {
  version: 1;
  expiresAt: string;
  profile: SellerProfileInput;
  requestedChangeId: string | null;
};
```

Sign serialized data with HMAC-SHA256 using `SELLER_AUTH_SECRET`; verify signature with constant-time comparison. Cookie `tl_profile_preview` is HttpOnly, Secure, SameSite=Lax, 30-minute max-age, and cleared after verification. An allowlisted `category` query preselects one launch category, but the signed profile still enforces one-to-two choices. The preview shows three-to-five Verified changes at score ≥55, plain explanations, readiness, one evidence-supported example action, and a representative weekly-email preview.

- [ ] **Step 4: Verify no-store behavior and accessible journey**

Run: `pnpm vitest run test/onboarding.test.ts && pnpm lint && pnpm build`

Expected: PASS; direct preview without valid cookie redirects to `/onboarding`, query strings contain no profile fields, and keyboard users can complete all three steps.

- [ ] **Step 5: Commit onboarding**

```bash
git add src/onboarding app/\(onboarding\)/onboarding app/\(public\)/categories/\[category\]/page.tsx test/onboarding.test.ts
git commit -m "feat: add profile-first seller preview"
```

**Definition of done:** Preview precedes registration, is useful and explainable, expires, and never enters a public cache or URL.

### Task 4: Implement Deterministic Explainable Relevance

**Files:**

- Create: `src/relevance/types.ts`
- Create: `src/relevance/score.ts`
- Create: `src/relevance/explain.ts`
- Create: `src/relevance/preferences.ts`
- Create: `src/relevance/assess.ts`
- Test: `test/relevance-score.test.ts`
- Test: `test/relevance-assess.test.ts`
- Create: `test/fixtures/relevance/gold-profiles.json`
- Create: `test/fixtures/relevance/gold-changes.json`
- Create: `test/fixtures/relevance/expected.json`

**Interfaces:**

- Produces: `scoreRelevance`, `explainRelevance`, `assessProfile`, `recordRelevanceFeedback`.
- Consumes: Relevance Contract, current Verified canonical records, capability status.

- [ ] **Step 1: Write gold-profile and stale-suppression tests**

```ts
it.each(loadExpectedAssessments())("$profile × $change => $expected", ({ profile, change, expected }) => {
  expect(scoreRelevance(profile, change)).toMatchObject(expected);
});

it("does not assess a change whose critical capability is stale", async () => {
  await seedCapabilityFor(change, "STALE");
  expect(await assessProfile(profile.id, [change.id])).toEqual([]);
});
```

- [ ] **Step 2: Confirm no relevance engine exists**

Run: `pnpm vitest run test/relevance-score.test.ts test/relevance-assess.test.ts`

Expected: FAIL because relevance modules are absent.

- [ ] **Step 3: Implement pure scoring and persisted assessments**

```ts
export function scoreRelevance(profile: ProfileFacts, change: ChangeFacts): RelevanceScore | null {
  if (change.market !== profile.market || change.readiness !== "VERIFIED" || change.capabilityStale) return null;
  const total = clamp(
    platformPoints(profile, change)
    + categoryPoints(profile, change)
    + stagePoints(profile, change)
    + Math.round(clamp(change.urgency, 0, 100) * 0.15)
    + 10
    + preferenceAdjustment(profile, change),
    0,
    100,
  );
  return buildExplanation(total, profile, change);
}
```

Persist a version-pinned assessment by `[profileId, changeVersionId]`. Explanation names matched market/platform/category/stage, urgency implication, and Verified source status. Feedback overwrites the one scoped preference adjustment and writes one interaction event.

- [ ] **Step 4: Verify determinism and gold coverage**

Run: `pnpm vitest run test/relevance-score.test.ts test/relevance-assess.test.ts`

Expected: PASS; all three operating stages, both platforms, six launch categories, `ALL_PRODUCTS`, mismatch, Stale, helpful, and irrelevant cases match fixtures.

- [ ] **Step 5: Commit relevance**

```bash
git add src/relevance/types.ts src/relevance/score.ts src/relevance/explain.ts src/relevance/preferences.ts src/relevance/assess.ts test/relevance-score.test.ts test/relevance-assess.test.ts test/fixtures/relevance
git commit -m "feat: add explainable seller relevance"
```

**Definition of done:** Relevance is deterministic, transparent, feedback-aware, Verified-only, and fully represented by gold fixtures.

### Task 5: Build My Briefing and Feedback

**Files:**

- Create: `src/relevance/briefing.ts`
- Create: `app/(private)/layout.tsx`
- Create: `app/(private)/my/PrivateNav.tsx`
- Create: `app/(private)/my/briefing/page.tsx`
- Create: `app/(private)/my/loading.tsx`
- Create: `app/(private)/my/error.tsx`
- Create: `app/api/my/relevance/[assessmentId]/feedback/route.ts`
- Create: `app/api/my/interactions/route.ts`
- Test: `test/my-briefing.test.tsx`
- Test: `test/private-shell.test.tsx`

**Interfaces:**

- Produces: `getMyBriefing(profileId: string, period: WeekPeriod): Promise<MyBriefing>`, `recordPrivateInteraction`, protected private shell, feedback and interaction endpoints.
- Consumes: persisted assessments at score ≥60 and seller session guard.

- [ ] **Step 1: Write private-cache, explanation, and dismissal tests**

```tsx
it("shows why each change matches without exposing an opaque-only score", async () => {
  render(await MyBriefingPage());
  expect(screen.getByText(/Matched: Amazon, Consumer Electronics, Preparing to launch/i)).toBeVisible();
});

it("dismisses only the signed-in profile assessment", async () => {
  await postFeedback(otherProfilesAssessmentId, sellerSession);
  expect(lastResponse.status).toBe(404);
});

it("records one opened interaction per profile, assessment, and UTC day", async () => {
  await recordOpened(assessment.id, sellerSession);
  await recordOpened(assessment.id, sellerSession);
  expect(await countOpened(assessment.id, utcToday)).toBe(1);
});
```

- [ ] **Step 2: Confirm no private briefing surface exists**

Run: `pnpm vitest run test/my-briefing.test.tsx test/private-shell.test.tsx`

Expected: FAIL because private layout/repository are absent.

- [ ] **Step 3: Implement private briefing states**

```ts
export async function getMyBriefing(profileId: string, period: WeekPeriod) {
  const assessments = await prisma.relevanceAssessment.findMany({
    where: { profileId, score: { gte: 60 }, feedback: { not: "IRRELEVANT" }, changeVersion: verifiedCurrentWhere(period) },
    orderBy: [{ score: "desc" }, { changeVersion: { urgency: "desc" } }],
  });
  return buildMyBriefing(period, assessments);
}
```

States include loading, no current matches, source Stale suppression notice, error with no public cache fallback, and correction warning. Feedback checks ownership and accepts only `HELPFUL` or `IRRELEVANT`. After a briefing item becomes visible, a same-origin no-store POST records `OPENED`; the endpoint checks assessment ownership and upserts one event per profile/assessment/UTC day so React retries do not inflate the north-star metric.

- [ ] **Step 4: Verify session/cache boundaries**

Run: `pnpm vitest run test/my-briefing.test.tsx test/private-shell.test.tsx test/public-private-boundary.test.ts && pnpm build`

Expected: PASS; unauthenticated request redirects to onboarding, all private responses are no-store, and explanations/feedback are scoped to the session.

- [ ] **Step 5: Commit My Briefing**

```bash
git add src/relevance/briefing.ts app/\(private\)/layout.tsx app/\(private\)/my app/api/my/relevance app/api/my/interactions test/my-briefing.test.tsx test/private-shell.test.tsx
git commit -m "feat: add private seller briefing"
```

**Definition of done:** My Briefing is cross-device, explainable, feedback-capable, and protected from public caches.

### Task 6: Add Watchlist, Personal Actions, and Corrections

**Files:**

- Create: `src/relevance/watchlist.ts`
- Create: `src/relevance/actions.ts`
- Create: `src/relevance/corrections.ts`
- Modify: `src/canonicalize/publish.ts`
- Create: `app/(private)/my/watchlist/page.tsx`
- Create: `app/(private)/my/actions/page.tsx`
- Create: `app/api/my/watchlist/route.ts`
- Create: `app/api/my/watchlist/[changeId]/route.ts`
- Create: `app/api/my/actions/route.ts`
- Create: `app/api/my/actions/[actionId]/route.ts`
- Modify: `app/(public)/changes/[slug]/page.tsx`
- Test: `test/personal-actions.test.ts`
- Test: `test/private-corrections.test.ts`

**Interfaces:**

- Produces: `saveChange`, `removeSavedChange`, `createPersonalAction`, `updatePersonalAction`, `markActionsForCorrectionReview`.
- Consumes: seller ownership, current Verified canonical version, reviewed action template, due-date evidence.

- [ ] **Step 1: Write ownership, due-date, idempotency, and correction tests**

```ts
it("creates one action only after explicit request", async () => {
  expect(await countActions(profile.id)).toBe(0);
  const first = await createPersonalAction(profile.id, change.id);
  const second = await createPersonalAction(profile.id, change.id);
  expect(second.id).toBe(first.id);
});

it("omits dueAt without evidence", async () => {
  expect(await createPersonalAction(profile.id, changeWithoutDeadline.id))
    .toMatchObject({ dueAt: null, dueAtEvidenceId: null });
});

it("warns an action when its pinned version is corrected", async () => {
  await publishCorrection(change.id);
  expect(await loadAction(action.id)).toMatchObject({ versionWarningAt: expect.any(Date) });
});
```

- [ ] **Step 2: Confirm account-backed action workflow is absent**

Run: `pnpm vitest run test/personal-actions.test.ts test/private-corrections.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement server-owned state transitions**

Allowed action transitions:

```ts
const ACTION_TRANSITIONS = {
  OPEN: ["COMPLETE", "ARCHIVED"],
  COMPLETE: ["OPEN", "ARCHIVED"],
  ARCHIVED: ["OPEN"],
} as const;
```

Create uses the current Verified version and reviewed general action template. It derives `dueAt` only when a reviewed EvidenceRecord is explicitly linked to the effective/deadline date. Save/remove and action writes are idempotent and scoped by the session profile. On a materially corrected or retracted version, the canonical publication path calls `markActionsForCorrectionReview` after the new version commits; it sets `versionWarningAt` on actions pinned to earlier versions and never rewrites the pinned description silently. The weekly-email job preflight repairs missed warnings by comparing each action version to the current version.

- [ ] **Step 4: Verify the complete state machine**

Run: `pnpm vitest run test/personal-actions.test.ts test/private-corrections.test.ts test/canonical-publish.test.ts && pnpm lint`

Expected: PASS for save/remove, create, complete, reopen, archive, restore, forbidden transition, cross-profile access, evidence-supported due dates, and correction warnings.

- [ ] **Step 5: Commit private workflow**

```bash
git add src/relevance/watchlist.ts src/relevance/actions.ts src/relevance/corrections.ts src/canonicalize/publish.ts app/\(private\)/my/watchlist app/\(private\)/my/actions app/api/my/watchlist app/api/my/actions app/\(public\)/changes/\[slug\]/page.tsx test/personal-actions.test.ts test/private-corrections.test.ts
git commit -m "feat: add seller watchlist and actions"
```

**Definition of done:** State is account-backed and cross-device, actions are explicit/evidence-bound, and corrections never silently change prior commitments.

### Task 7: Deliver Weekly Email, Preferences, Metrics, and Deletion

**Files:**

- Create: `src/email/my-weekly-briefing.ts`
- Create: `src/email/private-delivery.ts`
- Create: `src/email/unsubscribe.ts`
- Create: `src/metrics/weekly-relevant-seller-profiles.ts`
- Create: `src/jobs/private-weekly-briefing.ts`
- Create: `app/api/my/email/unsubscribe/route.ts`
- Create: `src/seller-auth/deletion.ts`
- Create: `app/(private)/my/profile/page.tsx`
- Create: `app/api/my/account/delete-request/route.ts`
- Create: `app/api/my/account/delete-confirm/route.ts`
- Create: `app/api/my/profile/categories/route.ts`
- Create: `prisma/migrations/0015_retire_legacy_private_models/migration.sql`
- Modify: `prisma/schema.prisma`
- Modify: `src/jobs/registry.ts`
- Modify: `src/jobs/types.ts`
- Replace: `app/subscribe/page.tsx`
- Replace: `app/subscribe/confirmed/page.tsx`
- Replace: `app/subscribe/unsubscribed/page.tsx`
- Replace: `app/api/subscribe/route.ts`
- Replace: `app/api/subscribe/confirm/route.ts`
- Replace: `app/api/unsubscribe/route.ts`
- Delete: `src/workers/newsletter.ts`
- Delete: `src/email/subscriber-db.ts`
- Delete: `src/email/subscriber-util.ts`
- Delete: `src/email/compose-issue.ts`
- Delete: `app/components/SubscribeForm.tsx`
- Delete: `app/components/SubscribeBar.tsx`
- Delete: `test/subscriber-util.test.ts`
- Delete: `test/compose-issue.test.ts`
- Modify: `docs/railway-setup.md`
- Test: `test/private-weekly-email.test.ts`
- Test: `test/weekly-relevant-seller-profiles.test.ts`
- Test: `test/profile-settings.test.ts`
- Test: `test/account-deletion.test.ts`

**Interfaces:**

- Produces: `composeMyWeeklyBriefing`, `deliverMyWeeklyBriefing`, `countWeeklyRelevantSellerProfiles`, `updateSellerProfile`, `trackCategory`, `requestAccountDeletion`, `confirmAccountDeletion`.
- Consumes: My Briefing, Resend, subscription settings, interaction events, seller Magic Link primitives.

- [ ] **Step 1: Write delivery, metric, unsubscribe, and deletion failures**

```ts
it("sends one email per account, ISO week, and fingerprint", async () => {
  await deliverMyWeeklyBriefing(account.id, "2026-W31");
  await deliverMyWeeklyBriefing(account.id, "2026-W31");
  expect(resendSendCount()).toBe(1);
  expect(lastResendOptions().idempotencyKey).toBe(await storedDeliveryKey(account.id, "2026-W31"));
});

it("counts only completed profiles with a relevant delivery and interaction", async () => {
  expect(await countWeeklyRelevantSellerProfiles(window)).toBe(1);
});

it("unsubscribes once with a valid signed account token", async () => {
  const url = weeklyUnsubscribeUrl(account.id);
  expect((await GET(request(url))).status).toBe(200);
  expect((await GET(request(url))).status).toBe(200);
  expect(await loadSettings(account.id)).toMatchObject({ weeklyEmailEnabled: false });
});

it("removes every private row and revokes access", async () => {
  await confirmAccountDeletion(validDeletionToken);
  expect(await countPrivateRowsFor(account.id)).toBe(0);
  expect((await requestWithOldSession()).status).toBe(401);
});

it("recomputes current assessments after a valid profile edit", async () => {
  await updateSellerProfile(profile.id, shopifyBeautyProfile);
  expect(await assessmentScore(profile.id, amazonElectronicsChange.id)).toBeNull();
  expect(await assessmentScore(profile.id, shopifyBeautyChange.id)).toBeGreaterThanOrEqual(60);
});

it("requires an explicit replacement when tracking a third category", async () => {
  const response = await trackCategory(profileWithTwoCategories.id, "PET_SUPPLIES");
  expect(response).toMatchObject({
    status: "REPLACEMENT_REQUIRED",
    current: ["CONSUMER_ELECTRONICS", "HOME_KITCHEN"],
  });
});
```

- [ ] **Step 2: Confirm generic newsletter cannot satisfy the contract**

Run: `pnpm vitest run test/private-weekly-email.test.ts test/weekly-relevant-seller-profiles.test.ts test/account-deletion.test.ts`

Expected: FAIL before private delivery/metrics/deletion modules exist.

- [ ] **Step 3: Implement idempotent Monday delivery**

```ts
const idempotencyKey = stableHash(`weekly:${accountId}:${periodKey}:${briefing.fingerprint}`);
const delivery = await prisma.briefingDelivery.upsert({
  where: { idempotencyKey },
  create: { accountId, periodKey, channel: "EMAIL", briefingFingerprint: briefing.fingerprint, idempotencyKey, status: "PENDING" },
  update: {},
});
```

Pass the same `idempotencyKey` to `resend.emails.send(payload, { idempotencyKey })`; the database key protects all future retries and Resend protects the provider side effect during its 24-hour idempotency window. Add `private-weekly-briefing` to `JobName`/registry and configure Railway Cron `0 9 * * 1` UTC with start command `pnpm job --name private-weekly-briefing`, after the public weekly briefing. If there are no qualifying matches, send a concise “No new Verified changes matched this week” account email without inventing content. Every email includes `/api/my/email/unsubscribe?account=[accountId]&token=[HMAC-SHA256]`; `src/email/unsubscribe.ts` verifies the HMAC in constant time, responds generically, and idempotently disables weekly email without creating a session. Suppress delivery when unsubscribed or any critical capability is Stale. Store provider message ID after success and reconcile a retry before sending again.

Weekly Relevant Seller Profiles counts distinct completed profiles in the rolling seven-day window that have at least one score ≥60 assessment included in a successful delivery and at least one `OPENED`, `SAVED`, `DISMISSED_IRRELEVANT`, `ACTION_CREATED`, `ACTION_COMPLETED`, or `ACTION_ARCHIVED` event.

- [ ] **Step 4: Implement preference and deletion controls**

Profile page edits only operating stage, platforms, up to two categories, and weekly email enabled state. `POST /api/my/profile/categories` tracks a launch category; when two are already selected it returns `409 REPLACEMENT_REQUIRED` with the current choices, and a second request must name exactly one `replaceCategory`. A profile edit transaction re-runs current 30-day Verified assessments, preserves explicit feedback, removes newly ineligible entries from My Briefing, and never rewrites existing Personal Actions. Deletion request uses a fresh one-time 15-minute confirmation token. Confirmation deletes SellerAccount with cascades, revokes provider contact state, clears cookies, and emits only an aggregate `account_deleted` counter without account/email/profile identifiers.

Replace `/subscribe`, `/subscribe/confirmed`, and `/subscribe/unsubscribed` with permanent redirects to `/onboarding`. The legacy subscription POST/confirm/unsubscribe APIs return `410` with `{ "code": "SUBSCRIBE_REPLACED", "onboarding": "/onboarding" }`; remove the generic newsletter worker and subscriber helpers. The migration blocks rather than drops `Subscriber`, legacy `User`, or `KeywordWatch` if the repository assumption of no production users/subscribers is false.

`0015_retire_legacy_private_models/migration.sql` contains:

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "Subscriber" LIMIT 1)
     OR EXISTS (SELECT 1 FROM "User" LIMIT 1)
     OR EXISTS (SELECT 1 FROM "KeywordWatch" LIMIT 1) THEN
    RAISE EXCEPTION 'Legacy private tables are not empty; stop migration and reconcile identity, consent, and watches before retirement';
  END IF;
END $$;

DROP TABLE "KeywordWatch";
DROP TABLE "User";
DROP TABLE "Subscriber";
```

Run: `pnpm vitest run test/private-weekly-email.test.ts test/weekly-relevant-seller-profiles.test.ts test/profile-settings.test.ts test/account-deletion.test.ts`

Expected: PASS for retry, suppression, unsubscribe, empty week, metric window, delete expiry/replay/cascade, and old-session rejection.

- [ ] **Step 5: Commit retention loop and privacy controls**

```bash
git add prisma/schema.prisma prisma/migrations/0015_retire_legacy_private_models src/email/my-weekly-briefing.ts src/email/private-delivery.ts src/email/unsubscribe.ts src/metrics src/jobs/private-weekly-briefing.ts src/jobs/registry.ts src/jobs/types.ts src/seller-auth/deletion.ts app/\(private\)/my/profile app/api/my/account app/api/my/profile app/api/my/email app/subscribe app/api/subscribe app/api/unsubscribe docs/railway-setup.md test/private-weekly-email.test.ts test/weekly-relevant-seller-profiles.test.ts test/profile-settings.test.ts test/account-deletion.test.ts
git add -u src/workers/newsletter.ts src/email/subscriber-db.ts src/email/subscriber-util.ts src/email/compose-issue.ts app/components/SubscribeForm.tsx app/components/SubscribeBar.tsx test/subscriber-util.test.ts test/compose-issue.test.ts
git commit -m "feat: add weekly seller retention loop"
```

**Definition of done:** Email is version-consistent/idempotent/unsubscribable, the north-star metric is queryable, and deletion removes private state.

### Task 8: Pass T3 Design, Security, End-to-End, and Release Gates

**Files:**

- Create: `design/phase1-private-relevance.html`
- Create: `test/e2e/private-relevance.spec.ts`
- Modify: `docs/security/seller-auth-threat-model.md`
- Modify: `docs/privacy/private-data-map.md`
- Create final screenshots under: `design/shots/phase1-private-final/`
- Modify: `.agent/CURRENT.md`

**Interfaces:**

- Produces: accepted T3 Brief, state matrix, security review, browser evidence, production-shaped migration evidence.
- Consumes: Tasks 1–7 and Public final build.

- [ ] **Step 1: Obtain Human Owner approval before UI integration**

The T3 Brief states:

```yaml
primary_journey: "Profile → Preview → Magic Link → My Briefing → Create Action → Complete"
destructive_journey: "Profile → Delete account request → one-time confirmation → signed out"
private_nav: ["My Briefing", "Actions", "Watchlist", "Profile"]
data_minimization: "stage, US, platform, up to two categories; no store data"
trust: ["why matched", "Verified evidence", "stale/correction warnings", "no automatic external action"]
```

The UI worker runs the Impeccable context script, reads `reference/shape.md`, and runs `$impeccable shape private-relevance`. The HTML mockup covers onboarding steps, preview, inbox-style Magic Link confirmation state, My Briefing, relevance explanation, actions, watchlist, profile, unsubscribe, delete confirmation, desktop 1440×900, and mobile 390×844.

- [ ] **Step 2: Approve the private state matrix**

| Surface | Loading | Empty | Error | Stale/corrected | Unauthorized | Destructive |
|---|---|---|---|---|---|---|
| Onboarding | local step transition | validation copy | retry without lost choices | preview suppresses stale | not applicable | reset choices |
| Magic Link | sending/verifying | generic response | expired/replayed route to resend | not applicable | invalid token | session rotation |
| My Briefing | private skeleton | no relevant Verified changes | no-store retry | suppression/warning | redirect onboarding | dismiss confirmation |
| Actions | private skeleton | “No actions created” | retry | version review warning | 404 cross-profile | archive/restore |
| Watchlist | private skeleton | “Nothing saved” | retry | source warning | 404 cross-profile | remove confirmation |
| Profile | private skeleton | impossible after auth | retry | not applicable | redirect onboarding | typed account-delete confirmation |

- [ ] **Step 3: Write and run the complete end-to-end journey**

```ts
test("seller preview, magic link, briefing, and action", async ({ page, email }) => {
  await page.goto("/onboarding");
  await completeProfile(page, "PREPARING_TO_LAUNCH", ["AMAZON"], ["CONSUMER_ELECTRONICS"]);
  await expect(page).toHaveURL("/onboarding/preview");
  await expect(page.getByText(/Why this matches/i).first()).toBeVisible();
  await requestAndOpenMagicLinkOnFreshContext(page, email);
  await expect(page).toHaveURL("/my/briefing");
  await page.getByRole("button", { name: "Create Action" }).first().click();
  await page.goto("/my/actions");
  await page.getByRole("button", { name: "Mark complete" }).first().click();
  await expect(page.getByText("Complete").first()).toBeVisible();
});
```

Also test weekly email → canonical page → account action, stale suppression, corrected version warning, unsubscribe, cross-device session, expired/replayed link, and delete-account confirmation.

- [ ] **Step 4: Run independent security and T3 reviews**

A fresh security reviewer verifies the threat model, token storage, rate limits, cookie flags, CSRF/open redirect/enumeration/race controls, admin/seller separation, public/private cache separation, logging, and deletion. A fresh design reviewer runs `$impeccable critique private-relevance` against the approved state matrix and Design Quality Model. A different verifier runs `$impeccable audit private-relevance`; after fixes, the implementation owner runs `$impeccable polish private-relevance` and the verifier repeats the audit. None of these reviewers owned Tasks 1–7.

Run:

```bash
pnpm db:validate
pnpm lint
pnpm test
pnpm build
pnpm test:e2e test/e2e/private-relevance.spec.ts
```

Expected: all commands exit 0 and both reviews are accepted in Pactify.

- [ ] **Step 5: Verify final build in browsers**

From the final build, capture each primary state at 1440×900 and 390×844 in `design/shots/phase1-private-final/`. Verify keyboard-only use, screen-reader names, focus restoration, reduced motion, error recovery, no horizontal overflow, no private cache headers, and no secret/profile data in page source or network logs.

- [ ] **Step 6: Pass migration and rollback checkpoint**

Apply `0014` to the production-shaped branch, run constraint/cascade/auth tests, take `phase1-private-pre-production`, then deploy. Rollback is the prior public-only application release with private routes disabled; leave additive private tables intact, revoke all new sessions if identity behavior is unsafe, and repair forward. No down migration is run.

- [ ] **Step 7: Commit accepted evidence and milestone**

```bash
git add design/phase1-private-relevance.html design/shots/phase1-private-final test/e2e/private-relevance.spec.ts docs/security/seller-auth-threat-model.md docs/privacy/private-data-map.md .agent/CURRENT.md
git commit -m "feat: complete phase1 private relevance"
```

**Definition of done:** The full journey passes in a fresh browser, independent security/design reviewers accept it, rollback is exercised on a branch, and final screenshots come from the accepted build.

## Monitoring and Rollback

- **Identity:** request/verify counts, generic failure codes, expiry, replay, rate-limit hits, session creation/revocation; no raw email/token/IP in logs.
- **Relevance:** eligible Verified count, assessment count, score distribution, stale suppression, feedback, correction warnings.
- **Actions:** create/complete/archive counts, due-date evidence coverage, cross-profile authorization failures.
- **Email:** candidate accounts, suppressed reasons, pending/sent/failed, provider reconciliation, duplicate-prevented count.
- **North star:** rolling Weekly Relevant Seller Profiles plus component counts; no user-level export from operational dashboards.
- **Privacy:** deletion requests/confirmations, cascade verification, stale session rejection, public/private boundary canary.
- **Schema checkpoint:** `phase1-private-pre-migration` before `0014`; `phase1-private-pre-production` before traffic.
- **Application rollback:** deploy public-only release, disable private routes and weekly cron, revoke seller sessions when auth is implicated, preserve rows for investigation, then ship forward fixes.
- **Data rollback:** restore the pre-production branch into a new recovery branch only; never overwrite production or resurrect deleted identities automatically.

## Full Verification Gate

```bash
pnpm db:validate
pnpm lint
pnpm test
pnpm build
pnpm test:e2e test/e2e/private-relevance.spec.ts
```

Expected: all commands exit 0; public-private boundary tests pass; Magic Link replay/expiry/race tests pass; weekly email is idempotent; account deletion leaves zero private rows; final browser screenshots match the accepted build.

## Product Spec Coverage Check

- [x] Seller Profile contains stage, US, Amazon/Shopify/both, up to two categories: Tasks 1 and 3.
- [x] Email/account separate from profile and cadence separate in settings: Task 1.
- [x] Three-step profile-first preview before registration: Task 3.
- [x] Preview has three-to-five changes, explanations, readiness, example action, weekly preview: Task 3.
- [x] One-time expiring Magic Link and cross-device state: Task 2.
- [x] My Briefing, Actions, Watchlist, Profile navigation: Tasks 5–8.
- [x] Deterministic Market × Platform × Category × Stage × Urgency relevance: Task 4.
- [x] Persisted score, dimensions, explanation, next step, timestamps, feedback: Tasks 1 and 4.
- [x] Verified-only personalization and stale suppression: Tasks 4–7.
- [x] Save, dismiss, Create Action, complete, archive, restore: Tasks 5 and 6.
- [x] Public category → profile prefill/account-backed track with two-category replacement: Tasks 3 and 7.
- [x] Due date only with evidence and version correction warning: Task 6.
- [x] Free My Weekly Briefing, idempotent delivery, unsubscribe: Task 7.
- [x] Weekly Relevant Seller Profiles metric: Task 7.
- [x] Private state absent from public APIs/caches: Tasks 1, 2, 5, and 8.
- [x] Account deletion: Tasks 7 and 8.
- [x] Legacy generic Subscriber/User/KeywordWatch storage is retired without dual writes: Task 7.
- [x] No store data/OAuth/external action: Global Constraints and Non-goals.
- [x] T3 design, security, review, and final-build browser verification: Task 8.
- [x] Plus/private RSS/personal Telegram/private API/Phase 2 excluded: Global Constraints.

## Decisions Requiring Human Owner Confirmation

1. **Seller identity architecture:** approve the application-owned Magic Link/session subsystem while keeping Neon Auth for admin only. Recommendation: approve for Phase 1 because it is explicit and testable; require an independent security reviewer. If a verified managed Magic Link capability is chosen, revise this plan before any schema work.
2. **Weekly send time:** approve Monday 09:00 UTC without asking for timezone in the minimal profile. Recommendation: approve; add timezones only after delivery engagement proves the need.
3. **Zero-match weekly email:** approve sending an honest “No new Verified changes matched” message rather than skipping delivery. Recommendation: approve during free-product validation to make system health and cadence visible.
4. **Relevance thresholds/weights:** approve preview ≥55, My Briefing/email ≥60, and the explicit 30/30/15/15/10 weights. Recommendation: approve as a deterministic baseline and change only through versioned gold-set evidence.
5. **Feedback effect:** approve exact-item dismissal plus a bounded -10/+5 signal-and-category preference adjustment. Recommendation: approve; it is understandable and reversible without opaque ML.
6. **Deletion policy:** approve immediate hard deletion of private account data after one-time confirmation, with only anonymous aggregate counters retained. Recommendation: approve while there are no paid/regulated retention obligations.
7. **No production-user migration assumption:** approve leaving existing confirmed generic subscribers outside the seller account system; `/subscribe` redirects to onboarding and no account is created without a Magic Link. Recommendation: approve because a newsletter consent is not a Seller Profile or verified product account.
