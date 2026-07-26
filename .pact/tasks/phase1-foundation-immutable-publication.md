# Phase 1 Foundation — Task 6: Immutable Publication and Structured Evidence

Owner: `kimi`  
Reviewer: `claude`  
Orchestrator: `codex` (coordination only; no implementation or task acceptance)  
Plan source: Task 6 in `docs/superpowers/plans/2026-07-23-tradelinks-phase1-foundation.md`

Kimi K3 is the Human Owner-designated sole implementation worker for this task.
It must perform the implementation and worker verification directly and may not
delegate any portion to subagents or alternate models. Claude Opus 4.8 remains
the independent reviewer only.

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
- Create `app/admin/review/review-controls.tsx`
- Create or modify `test/canonical-publish.test.ts` only for publication behavior owned by this task
- Create root `PRODUCT.md` as the Human Owner-approved Impeccable product-context bootstrap for this task
- Modify `docs/architecture.md` only to document the two additive review fields and rollback checkpoint
- Modify `middleware.ts` only for the Human Owner-approved `Task6-T3-r4`
  non-GET admin-session probe described below
- Create `test/middleware-auth.test.ts` only for the `Task6-T3-r4` middleware
  regression contract described below

Do not create `DESIGN.md` or Impeccable live-mode configuration in this task. Do not add routes, modify `app/lib/auth.ts`, change the admin allowlist or cookie configuration, change global design tokens, edit translation registries, deploy, or touch production data. The only authorized middleware change is the exact `Task6-T3-r4` request-method normalization below; it may not bypass or weaken either middleware or server-action authorization. If correct implementation requires another file, stop and request a scope revision.

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

The legacy functions in `src/alerts/review.ts` are still consumed by the
out-of-scope Telegram webhook and CLI. Preserve the runtime behavior and public
signatures of `listPending`, `approveAlert`, `rejectAlert`, and `getAlertBrief`.
Replacing legacy approval is limited to the authenticated admin web surface:
`app/admin/review/actions.ts` must stop importing/calling legacy Alert approval
or rejection and operate only on canonical draft/version IDs.
`src/alerts/review.ts` may add canonical review-queue reads for the page. A
legacy Alert ID passed to canonical publication must fail as
`CANONICAL_DRAFT_NOT_FOUND` (or an equivalently explicit canonical-not-found
error), and the Alert row must remain unchanged.

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

Pre-implementation inspection then confirmed that the existing server
`page.tsx` and `"use server"` actions module cannot implement in-flight feedback
and duplicate-submit prevention without a client boundary, and the repository
has no reusable form-status primitive. The orchestrator again stopped the worker
before any product-code edit. The Human Owner explicitly approved reopened
`Task6-T3-r3` and one new file,
`app/admin/review/review-controls.tsx`, on 2026-07-23. This client component is
limited to accessible form state, pending/duplicate-submit prevention,
validation errors, and recovery feedback. Data loading remains in the protected
server page and authorization remains in the server layout/actions. It may not
add a route, dependency, auth bypass, or global style.

Kimi must still run the required Impeccable shape command and record how its output conforms to this approved revision before writing product code. It must create `PRODUCT.md` first from the confirmed strategic context above because the Impeccable context check reported `NO_PRODUCT_MD`. The final-build Human Owner walkthrough and rollback confirmation remain pending and cannot be satisfied by this approval.

### Human Owner-approved authenticated-mutation revision

`Task6-T3-r4` was explicitly approved by the Human Owner on 2026-07-26 after
the real-session final-build walkthrough proved that every admin Server Action
failed before its business transaction. Runtime diagnostics established the
exact upstream interaction without exposing cookie values:

- an authenticated page `GET` called Neon Auth `get-session` with `GET` and
  received `200`;
- the same authenticated browser's Server Action caused Neon Auth middleware
  to call `get-session` with the original request method `POST`, received
  `404`, and redirected `/admin/review` to `/auth/sign-in` with `307`;
- the forwarded request retained both the session-token and session-data
  cookies, so this was not a browser/session-loss failure;
- the canonical fixture rows remained unchanged, proving the failure occurred
  before the publication transaction.

The approved fix is deliberately narrow and retains both authorization layers:

- In `middleware.ts`, continue to run the existing Neon Auth middleware for
  every `/admin/**` request.
- For an admin request whose method is neither `GET` nor `HEAD`, pass that auth
  middleware a cloned `NextRequest` with the same URL and headers but method
  `GET`. Returning `NextResponse.next()` from that auth probe continues the
  original request; it does not replace the original Server Action method.
- If the auth probe redirects or denies, propagate that response unchanged.
  Never allow a request merely because it carries an action header, and never
  special-case a missing/invalid session as allowed.
- Keep normal admin `GET`/`HEAD` behavior unchanged. Keep public locale routing
  unchanged.
- Every canonical mutation Server Action must continue calling
  `requireAdmin()` before validation or database access. Do not alter
  `app/lib/auth.ts`, cookie settings, allowlist behavior, or the action-level
  authorization call.

Create `test/middleware-auth.test.ts` with deterministic unit coverage proving:

- authenticated/allowed admin `POST` is checked by the existing auth
  middleware as a `GET` probe with the original cookie and relevant headers,
  while the middleware result allows the original request to proceed;
- unauthenticated/denied admin `POST` propagates the auth middleware redirect
  and is never converted to `NextResponse.next()`;
- admin `GET` and `HEAD` retain their original methods when checked;
- non-admin locale rewrite/header behavior is unchanged.

For this regression, record a separate TDD cycle before rerunning the task gate:

- RED: `pnpm vitest run test/middleware-auth.test.ts` must fail because the
  current middleware passes the admin `POST` method through to Neon Auth.
- GREEN/REFACTOR: the same command passes with no auth bypass and no unrelated
  middleware behavior change.

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

`pnpm db:validate && pnpm exec prisma migrate status && pnpm vitest run test/canonical-publish.test.ts test/alert-route.test.ts test/middleware-auth.test.ts && pnpm lint`

Record migration identity/status, confidence persistence, required rejection
reason, publication, correction, old-Alert rejection, server-action typing,
action-level authorization, and the non-GET middleware regression coverage
passing.

### REFACTOR

Simplify transaction/invariant/UI composition without weakening evidence fields or states, rerun the exact GREEN machine gate unchanged, and record stable behavior.

## 最终 build 浏览器验证 / Final-build browser verification

After tests and fixes, run `pnpm build`, start that exact production build locally with non-production fixture/test data, and verify `/admin/review` in a real browser before checkpointing. Capture final-build screenshots at mobile, intermediate, and desktop widths in both supported themes where applicable; verify keyboard/focus, permission denial, reduced motion, all applicable states above, blocked Verified publication, valid publication, correction history, and rejection reason. Screenshots and browser results must come from the post-fix final build and contain no secrets.

No committed or temporary auth bypass, stubbed `requireAdmin`, alternate
auth-disabled build, fixture route, or second screenshot build is allowed.
Without a real authenticated local Neon Auth session, the worker may verify the
permission-denial journey on the one final build and prepare the authenticated
fixture data, but must then stop at the Human Owner walkthrough gate. The Human
Owner uses a real session on that same still-running final build; subsequent
screenshots and interaction evidence must target that exact build.

Claude must review and verify in a **fresh context/session**, starting only from this Brief, target commit/diff, and evidence. Claude must independently rerun the machine gate and browser critical journeys rather than inheriting Kimi's conclusions. If Claude edits implementation, a new fresh-context Claude review is required for the affected diff. Human Owner must personally walk the critical local journey and confirm the rollback path before acceptance; this does not authorize deployment.

## 自审 / Self-review

Before checkpointing, Kimi must review invariant ordering, transaction atomicity, correction immutability, evidence completeness, auth preservation, server-action validation, state matrix, keyboard/a11y/responsiveness, TradeLinks token consistency, reduced motion, bounded files, and unrelated diff noise. Record a T3 Verification Record in the Pact evidence with Brief revision, target commit/build, checks, screenshots, independent-review result, Owner walkthrough, rollback, and waivers.

## 安全边界 / Safety

No deployment, production publication, production database mutation, auth reconfiguration, or cloud configuration is authorized. Browser actions must target non-production fixture/test data. Migration rollback is a code/read-path rollback that leaves the nullable additive columns in place; never run a down migration. Published-content rollback is application traffic/read-path rollback plus forward correction; never mutate a published historical version.

## 验收 / Acceptance

Review dimension: **ux**.

Claude confirms the reviewer can understand evidence and consequences before acting, every action/state is accessible and unambiguous, final-build browser evidence matches the target commit, and all T3 gates above are present. Missing fresh-context review, Owner walkthrough, final-build screenshots, keyboard/permission checks, or a release-blocking finding blocks acceptance.

verify: pnpm db:validate && pnpm exec prisma migrate status && pnpm vitest run test/canonical-publish.test.ts test/alert-route.test.ts test/middleware-auth.test.ts && pnpm lint

## Handoff Record — Kimi session restart 2026-07-23

- Task / Brief / revision: `immutable-publication` / `Task6-T3-r3`.
- Agent role / harness / session: Kimi K3 sole worker; prior Kimi session was
  interrupted by Codex after the first TypeScript check produced actionable
  test-fixture errors and the session then emitted no progress for more than
  five minutes. No agent-role change or implementation delegation occurred.
- Branch / base / current commit: `feat-phase1-foundation`; uncommitted work is
  based on `b4ffca0`.
- Files changed: `PRODUCT.md`, the approved Prisma schema/0012 migration,
  canonical domain/publication modules, canonical queue read, admin
  actions/page/client controls, publication tests, and the bounded architecture
  note listed in this task's scope.
- Decisions and assumptions: Shape is bound to approved `Task6-T3-r3`;
  legacy Telegram/CLI Alert review remains unchanged; database URLs are
  process-scoped to the approved isolated branch.
- Commands/evidence: the original two schema tests passed as a baseline; after
  new publication tests were added, the exact RED command failed on missing
  `canonical-change.js` as expected; Neon metadata and endpoint ownership were
  proven; `0012_phase1_publication_review_fields` was applied only to
  `br-plain-shadow-aoknpdf3`; `pnpm db:validate` and `pnpm db:gen` passed.
- Known failures / uncommitted state: `pnpm lint` currently reports five
  TypeScript errors only in `test/canonical-publish.test.ts`: four optional
  spread values in pure invariant fixtures and two possibly-undefined evidence
  array elements. No GREEN gate, Impeccable critique/audit/polish, build, or
  browser verification has been claimed.
- Next safe action: verify `b4ffca0` and the uncommitted file list, fix only the
  five test type errors, rerun `pnpm lint`, then continue the exact GREEN gate.

## Handoff Record — Kimi session restart 2026-07-26

- Task / Brief / revision: `immutable-publication` / `Task6-T3-r3`; the
  no-auth-bypass final-build clarification is committed at `4edcd8d`.
- Agent role / harness / session: Kimi K3 remains the sole implementation
  worker. Codex performed coordination and read-only verification only; no
  product-code edit or implementation delegation occurred.
- Branch / base / current commit: `feat-phase1-foundation`; product work remains
  uncommitted on top of `4edcd8d`.
- Files changed: exactly the in-scope product, migration, test, and architecture
  paths listed above. `git diff --check` is clean; auth files are untouched.
- Commands/evidence: on the approved isolated Neon branch, the fresh exact GREEN
  gate passed on 2026-07-26: schema valid, 12 migrations up to date,
  `test/canonical-publish.test.ts` plus `test/alert-route.test.ts` passed 22/22,
  and `pnpm lint` exited 0. The DB-backed suite took 231 seconds because of
  remote Neon latency.
- Known risk requiring worker resolution before design review: the correction
  UI currently accepts a changed action template, while
  `correctCanonicalChange` correctly invalidates the old template-review
  timestamp and then immediately applies the publication invariant. This makes
  that visible correction input non-actionable. Resolve the product path within
  the approved files and cover the chosen behavior with TDD; do not weaken the
  action-template review invariant.
- Remaining gates: run Impeccable critique and audit, fix every finding, run
  Impeccable polish, rerun the exact GREEN gate, create one final `pnpm build`,
  then verify the unauthenticated permission-denial journey on that build. Do
  not create any auth bypass or alternate build. Prepare non-production fixture
  data and stop at the Human Owner authenticated-walkthrough gate without
  checkpointing or launching Claude review.

## Handoff Record — Task6-T3-r4 authenticated-mutation fix 2026-07-26

- Task / Brief / revision: `immutable-publication` / `Task6-T3-r4`, explicitly
  approved by the Human Owner after the authenticated walkthrough failure.
- Agent role / harness / session: Kimi K3 remains the sole worker. Codex traced
  the runtime failure without editing product code or business data.
- Current branch/state: `feat-phase1-foundation`; the previously passing Task 6
  implementation remains uncommitted. `middleware.ts` is still unchanged at
  handoff time.
- Root-cause evidence: authenticated admin page GETs called Neon Auth
  `/get-session` with GET and returned 200. Admin Server Action POSTs caused
  Neon Auth middleware to call the same endpoint with POST and return 404;
  `/admin/review` then returned a 307 login redirect and Next reported
  `failed to forward action response`. Internal forwarding retained session
  token and session-data cookies. No fixture row changed.
- Authorized scope addition: modify only `middleware.ts` and create only
  `test/middleware-auth.test.ts` for the exact method-normalization contract in
  `Task6-T3-r4`. Do not alter `app/lib/auth.ts`, action-level `requireAdmin()`,
  cookie options, allowlists, routes, dependencies, or cloud configuration.
- Next safe action: record the specified middleware test RED, implement the
  smallest GET auth-probe adaptation, make the regression test GREEN, refactor,
  then rerun the expanded exact machine gate and `pnpm build`. Return to Codex
  before checkpointing so the same real session can rerun all owner journeys.
