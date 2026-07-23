# Phase 1 Foundation — Task 6: Immutable Publication and Structured Evidence

Owner: `kimi`  
Reviewer: `claude`  
Orchestrator: `codex` (coordination only; no implementation or task acceptance)  
Plan source: Task 6 in `docs/superpowers/plans/2026-07-23-tradelinks-phase1-foundation.md`

## 目标 / Goal

Publish reviewed canonical drafts through one invariant-checked transaction, preserve structured evidence, create immutable correction versions, and replace legacy Alert approval on the authenticated admin review surface. The admin UI work is fixed at repository **Tier 3** because it crosses authentication and publication/data-integrity boundaries; it may not be downgraded by an agent.

## 改文件 / Files

Only these files are in scope:

- Create `src/domain/intelligence/canonical-change.ts`
- Create `src/domain/intelligence/evidence.ts`
- Create `src/canonicalize/publish.ts`
- Modify `src/alerts/review.ts`
- Modify `app/admin/review/actions.ts`
- Modify `app/admin/review/page.tsx`
- Create or modify `test/canonical-publish.test.ts` only for publication behavior owned by this task

Do not add routes, alter auth middleware, change global design tokens, edit translation registries, deploy, or touch production data. If correct implementation requires another file, stop and request a scope revision.

## 契约 / Contract

Produce:

- `publishCanonicalDraft(draftId: string, reviewerId: string): Promise<CanonicalChangeVersion>`
- `correctCanonicalChange(input: CorrectionInput): Promise<CanonicalChangeVersion>`
- `assertPublishableVersion(input: VersionWithEvidence): void`

Before the transaction, `assertPublishableVersion` must enforce that Verified publication has reviewed `PRIMARY_OFFICIAL` evidence from a government/platform official source and that action recommendations have a reviewed action template. Publication clears the previous current version and publishes exactly one current version. Corrections require a non-empty `correctionReason` and preserve all older versions. Evidence preserves source ID, original URL, role, authority, access, license note, normalized summary, content hash, fetch time, and review time.

The UI must show version diff, source readiness, evidence role/authority/access, primary-source link, effective-date provenance, classification confidence, action-template review control, and explicit rejection reason while remaining protected by existing Neon Auth.

## T3 frontend workflow

The task spec itself is the canonical T3 Brief. Before implementation, Kimi must use `/skill:impeccable shape app/admin/review/page.tsx`, document the intended information hierarchy and one deliberate design choice, and obtain Human Owner confirmation of this Brief/revision. Preserve the existing TradeLinks tokens and admin product register; do not introduce prohibited side rails over 1px, gradient text, decorative glass, or decorative motion.

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

Implement the smallest invariant-safe publication/UI flow and run the plan's exact GREEN command:

`pnpm vitest run test/canonical-publish.test.ts test/alert-route.test.ts && pnpm lint`

Record publication, correction, old-Alert rejection, server-action typing, and auth-related coverage passing.

### REFACTOR

Simplify transaction/invariant/UI composition without weakening evidence fields or states, rerun the exact GREEN command unchanged, and record stable behavior.

## 最终 build 浏览器验证 / Final-build browser verification

After tests and fixes, run `pnpm build`, start that exact production build locally with non-production fixture/test data, and verify `/admin/review` in a real browser before checkpointing. Capture final-build screenshots at mobile, intermediate, and desktop widths in both supported themes where applicable; verify keyboard/focus, permission denial, reduced motion, all applicable states above, blocked Verified publication, valid publication, correction history, and rejection reason. Screenshots and browser results must come from the post-fix final build and contain no secrets.

Claude must review and verify in a **fresh context/session**, starting only from this Brief, target commit/diff, and evidence. Claude must independently rerun the machine gate and browser critical journeys rather than inheriting Kimi's conclusions. If Claude edits implementation, a new fresh-context Claude review is required for the affected diff. Human Owner must personally walk the critical local journey and confirm the rollback path before acceptance; this does not authorize deployment.

## 自审 / Self-review

Before checkpointing, Kimi must review invariant ordering, transaction atomicity, correction immutability, evidence completeness, auth preservation, server-action validation, state matrix, keyboard/a11y/responsiveness, TradeLinks token consistency, reduced motion, bounded files, and unrelated diff noise. Record a T3 Verification Record in the Pact evidence with Brief revision, target commit/build, checks, screenshots, independent-review result, Owner walkthrough, rollback, and waivers.

## 安全边界 / Safety

No deployment, production publication, production database mutation, auth reconfiguration, or cloud configuration is authorized. Browser actions must target non-production fixture/test data. Rollback is application traffic/read-path rollback plus forward correction; never mutate a published historical version.

## 验收 / Acceptance

Review dimension: **ux**.

Claude confirms the reviewer can understand evidence and consequences before acting, every action/state is accessible and unambiguous, final-build browser evidence matches the target commit, and all T3 gates above are present. Missing fresh-context review, Owner walkthrough, final-build screenshots, keyboard/permission checks, or a release-blocking finding blocks acceptance.

verify: pnpm vitest run test/canonical-publish.test.ts test/alert-route.test.ts && pnpm lint
