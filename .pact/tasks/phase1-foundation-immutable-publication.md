# Phase 1 Foundation — Task 6: Immutable Publication and Structured Evidence

Owner: `kimi`  
Reviewer: `claude`  
Orchestrator: `codex` (coordination only; no implementation or task acceptance)  
Plan source: Task 6 in `docs/superpowers/plans/2026-07-23-tradelinks-phase1-foundation.md`

## 目标 / Goal

Publish reviewed canonical drafts through one invariant-checked transaction, preserve structured evidence, create immutable correction versions, and replace legacy Alert approval on the authenticated admin review surface. The admin UI work is fixed at repository **Tier 3** because it crosses authentication and publication/data-integrity boundaries; it may not be downgraded by an agent.

## 改文件 / Files

Only these files are in scope:

- Modify `prisma/schema.prisma`
- Create `prisma/migrations/0012_phase1_publication_review_fields/migration.sql`
- Create `src/domain/intelligence/canonical-change.ts`
- Create `src/domain/intelligence/evidence.ts`
- Create `src/canonicalize/publish.ts`
- Modify `src/alerts/review.ts`
- Modify `app/admin/review/actions.ts`
- Modify `app/admin/review/page.tsx`
- Create or modify `test/canonical-publish.test.ts` only for publication behavior owned by this task
- Create root `PRODUCT.md` as the Human Owner-approved Impeccable product-context bootstrap for this task
- Modify `docs/architecture.md` only to document the two additive review fields and rollback checkpoint

Do not create `DESIGN.md` or Impeccable live-mode configuration in this task. Do not add routes, alter auth middleware, change global design tokens, edit translation registries, deploy, or touch production data. If correct implementation requires another file, stop and request a scope revision.

## 契约 / Contract

Produce:

- `publishCanonicalDraft(draftId: string, reviewerId: string): Promise<CanonicalChangeVersion>`
- `correctCanonicalChange(input: CorrectionInput): Promise<CanonicalChangeVersion>`
- `rejectCanonicalDraft(draftId: string, reviewerId: string, reason: string): Promise<CanonicalChangeVersion>`
- `reviewCanonicalActionTemplate(draftId: string, reviewerId: string): Promise<CanonicalChangeVersion>`
- `assertPublishableVersion(input: VersionWithEvidence): void`

Before the transaction, `assertPublishableVersion` must enforce that Verified publication has reviewed `PRIMARY_OFFICIAL` evidence from a government/platform official source and that action recommendations have a reviewed action template. Publication clears the previous current version and publishes exactly one current version. Corrections require a non-empty `correctionReason` and preserve all older versions. Evidence preserves source ID, original URL, role, authority, access, license note, normalized summary, content hash, fetch time, and review time.

The accepted `0011` migration cannot represent two required review facts. Add a
new forward-only `0012` migration; never edit or replay `0011`:

- `CanonicalChangeVersion.classificationConfidence Float?`
- `CanonicalChangeVersion.rejectionReason String?`

New classification-created drafts must persist their real classifier confidence;
never infer it from readiness or synthesize a display value. Rejecting a draft
requires a non-blank reason and persists it on that immutable version together
with `reviewedAt` and `reviewedBy`. The fields are nullable only so the additive
migration does not rewrite or invalidate pre-existing rows on the isolated
branch.

Rejecting a draft sets `editorialStatus: REJECTED`, records the trimmed reason
and reviewer metadata, and never makes that version current. Reviewing an action
template requires a non-blank template and records
`actionTemplateReviewedAt/actionTemplateReviewedBy`; it does not publish the
draft.

The UI must show version diff, source readiness, evidence role/authority/access, primary-source link, effective-date provenance, classification confidence, action-template review control, and explicit rejection reason while remaining protected by existing Neon Auth.

## T3 frontend workflow

The task spec itself is the canonical T3 Brief. Before implementation, Kimi must use `/skill:impeccable shape app/admin/review/page.tsx`, document the intended information hierarchy and one deliberate design choice, and obtain Human Owner confirmation of this Brief/revision. Preserve the existing TradeLinks tokens and admin product register; do not introduce prohibited side rails over 1px, gradient text, decorative glass, or decorative motion.

### Human Owner-approved Brief revision

`Task6-T3-r1` was explicitly approved by the Human Owner on 2026-07-23 before implementation. The same approval authorizes root `PRODUCT.md` and declines `DESIGN.md` and Impeccable live-mode configuration for this task.

During pre-implementation inspection, the approved UI requirements exposed that
the accepted `0011` schema had no persisted classification-confidence or
rejection-reason fields. The orchestrator stopped the worker before any
product-code edit. The Human Owner explicitly approved the reopened
`Task6-T3-r2` and its forward-only
`0012_phase1_publication_review_fields` migration on 2026-07-23. Bind
implementation to this exact revision:

- Register/platform: product UI on responsive web.
- Primary user: an authenticated TradeLinks administrator/editor reviewing canonical intelligence before publication.
- Primary task: inspect version differences, source readiness, structured evidence, effective-date provenance, classification confidence, and the action template before safely publishing, correcting, or rejecting a canonical change.
- Information hierarchy: publication constraints first; then version diff; primary evidence and source properties; effective-date/classification details; action-template review; and finally publish/correct/reject controls with consequences.
- Visual direction: preserve the existing TradeLinks intelligence-desk tokens and use a restrained, high-density product interface. Reference qualities are GitHub Review's inspectable diffs/history, Stripe Dashboard's risk/action clarity, and Linear's focused information density.
- Deliberate design choice: place immutable version history and `PRIMARY_OFFICIAL` evidence adjacent to the publication action so the editor sees the basis and consequences before acting.
- Scope/fidelity: one existing authenticated page, production-ready behavior, responsive mobile/intermediate/desktop layouts, and both existing themes; no new route.
- Data contract: show only persisted `classificationConfidence`; require and persist an explicit `rejectionReason`. Older null values render as clearly unavailable, never as an invented score or reason.

Kimi must still run the required Impeccable shape command and record how its output conforms to this approved revision before writing product code. It must create `PRODUCT.md` first from the confirmed strategic context above because the Impeccable context check reported `NO_PRODUCT_MD`. The final-build Human Owner walkthrough and rollback confirmation remain pending and cannot be satisfied by this approval.

Cover this state matrix with the specified files and tests:

- loading/pending: mutation feedback and duplicate-submit prevention
- empty: no drafts awaiting review
- error: failed publish/reject/correct preserves context and explains recovery
- success: inspectable draft, version diff, and evidence
- validation: correction/rejection/action-template requirements
- disabled: invariant-blocked or in-flight actions
- permission: unauthenticated/unauthorized access reveals no review data

Component work must reuse existing primitives/tokens. If a new primitive is truly required, inspect shadcn configuration first, search the configured registry, preview with `--dry-run`, and review generated code/dependencies/accessibility; an unspecified registry requires Human Owner direction. Motion is limited to state feedback, uses CSS first, and must have a `prefers-reduced-motion` fallback.

After implementation, Kimi must run `/skill:impeccable critique app/admin/review/page.tsx`, `/skill:impeccable audit app/admin/review/page.tsx`, fix every finding or obtain an explicit Human Owner waiver for non-blocking findings, then run `/skill:impeccable polish app/admin/review/page.tsx`.

## RED-GREEN-REFACTOR evidence

The Pact checkpoint must include commands, exit codes, and concise output evidence for all three phases.

### RED

Run the plan's exact RED command before implementation:

`pnpm vitest run test/canonical-publish.test.ts`

Record the expected failure on the missing publication API/invariant.

### GREEN

Implement the smallest invariant-safe publication/UI flow.

Before applying `0012`, prove with Neon metadata that the target is exactly
project `steep-bird-11404641`, branch `br-plain-shadow-aoknpdf3`
(`phase1-foundation-pre-migration`), parent `br-autumn-smoke-aof5n7pe`,
non-default, unprotected under the approved exception, and expiring
`2026-07-30T12:00:00Z`. Keep both database URLs process-scoped and secret.
Run `pnpm db:gen`, then `pnpm exec prisma migrate deploy` only on that branch.

Run the exact GREEN machine gate:

`pnpm db:validate && pnpm exec prisma migrate status && pnpm vitest run test/canonical-publish.test.ts test/alert-route.test.ts && pnpm lint`

Record migration identity/status, confidence persistence, required rejection
reason, publication, correction, old-Alert rejection, server-action typing, and
auth-related coverage passing.

### REFACTOR

Simplify transaction/invariant/UI composition without weakening evidence fields or states, rerun the exact GREEN machine gate unchanged, and record stable behavior.

## 最终 build 浏览器验证 / Final-build browser verification

After tests and fixes, run `pnpm build`, start that exact production build locally with non-production fixture/test data, and verify `/admin/review` in a real browser before checkpointing. Capture final-build screenshots at mobile, intermediate, and desktop widths in both supported themes where applicable; verify keyboard/focus, permission denial, reduced motion, all applicable states above, blocked Verified publication, valid publication, correction history, and rejection reason. Screenshots and browser results must come from the post-fix final build and contain no secrets.

Claude must review and verify in a **fresh context/session**, starting only from this Brief, target commit/diff, and evidence. Claude must independently rerun the machine gate and browser critical journeys rather than inheriting Kimi's conclusions. If Claude edits implementation, a new fresh-context Claude review is required for the affected diff. Human Owner must personally walk the critical local journey and confirm the rollback path before acceptance; this does not authorize deployment.

## 自审 / Self-review

Before checkpointing, Kimi must review invariant ordering, transaction atomicity, correction immutability, evidence completeness, auth preservation, server-action validation, state matrix, keyboard/a11y/responsiveness, TradeLinks token consistency, reduced motion, bounded files, and unrelated diff noise. Record a T3 Verification Record in the Pact evidence with Brief revision, target commit/build, checks, screenshots, independent-review result, Owner walkthrough, rollback, and waivers.

## 安全边界 / Safety

No deployment, production publication, production database mutation, auth reconfiguration, or cloud configuration is authorized. Browser actions must target non-production fixture/test data. Migration rollback is a code/read-path rollback that leaves the nullable additive columns in place; never run a down migration. Published-content rollback is application traffic/read-path rollback plus forward correction; never mutate a published historical version.

## 验收 / Acceptance

Review dimension: **ux**.

Claude confirms the reviewer can understand evidence and consequences before acting, every action/state is accessible and unambiguous, final-build browser evidence matches the target commit, and all T3 gates above are present. Missing fresh-context review, Owner walkthrough, final-build screenshots, keyboard/permission checks, or a release-blocking finding blocks acceptance.

verify: pnpm db:validate && pnpm exec prisma migrate status && pnpm vitest run test/canonical-publish.test.ts test/alert-route.test.ts && pnpm lint
