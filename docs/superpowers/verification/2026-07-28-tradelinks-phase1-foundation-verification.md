# TradeLinks Phase 1 Foundation Verification

Date: 2026-07-28

Feature: `phase1-foundation`

Branch: `feat-phase1-foundation`

Draft PR: [#3 — Phase 1 foundation: evidence-ready intelligence model](https://github.com/agentjoey/tradelinks/pull/3)

Release state: **accepted in repository; not deployed**

## Outcome

All eight Pact tasks are `accepted`:

1. taxonomy and readiness policy
2. forward-only foundation schema
3. source contracts and offline fixtures
4. collection runs and source checks
5. canonical clustering and classification
6. immutable publication and forward correction
7. coverage readiness and admin visibility
8. deterministic legacy backfill

Claude Opus 5 independently accepted Task 8 and confirmed the complete feature ledger. Kimi Code was the designated worker; its K2.7 provider exhausted quota during the final Task 8 rework, so a fresh Codex 5.6 Sol fallback worker made only the bounded concurrent-test correction. The Pact evidence records that substitution.

## Integrated machine gate

The following gate passed on the integrated feature branch and again after the local fast-forward merge to `main`:

```bash
pnpm db:validate
pnpm lint
pnpm test
pnpm build
pnpm tsx scripts/backfill-phase1-foundation.ts --dry-run
```

Results:

- Prisma schema valid.
- TypeScript `tsc --noEmit` clean.
- Vitest: 53 files passed; 426/426 tests passed.
- Next.js production build compiled and generated 18/18 static pages.
- No diagnostic scripts or generated Prisma artifacts were committed.

## Database isolation and migrations

Database writes were limited to the owner-approved, non-production Neon branch:

- branch id: `br-plain-shadow-aoknpdf3`
- branch name: `phase1-foundation-pre-migration`
- parent: production branch `br-autumn-smoke-aof5n7pe`
- approved endpoint prefix: `ep-proud-dream-aotwdl52`
- default branch: false
- protected: false under explicit owner approval
- expiry: 2026-07-30T12:00:00Z

Forward-only migrations validated there:

- `0011_phase1_intelligence_foundation`
- `0012_phase1_publication_review_fields`

No down migration, production database mutation, branch restore, cloud configuration change, or deployment occurred. Because the checkpoint branch expires, a later rollout must create a fresh Neon checkpoint; it must not treat this branch as a durable production backup.

## Legacy backfill verification

Final repeated dry-run fingerprint:

```text
7b91ebd2cf2a6179c42c7f67af964cc3ae38318e96b3a1b905a87880c7ec5332
```

Final state:

| Counter | Value |
|---------|------:|
| sourceItems | 0 |
| clusters | 0 |
| canonicalChanges | 0 |
| versions | 0 |
| evidenceRecords | 0 |
| rejectedRows | 18 |

All 18 rejected rows were explicitly classified as `SOURCE_NOT_FOUND`. Apply and immediate replay were idempotent. The imported legacy set accounted for 552 converted Alerts plus 18 rejected Alerts, matching the 570 legacy Alerts on the isolated branch; no silent drop was found.

Trust-state audit of the converted rows:

- every generated version is version 1
- every generated version is `EXPERIMENTAL`
- every generated version is `IN_REVIEW`
- no generated version is current
- every inherited evidence record is `SECONDARY_CONTEXT`

The endpoint allowlist is enforced inside `applyFoundationBackfill()`, not only in the CLI. Tests reject substring attacks such as `attacker-ep-proud-dream-aotwdl52.example.com`.

## Fixture hygiene

An interrupted integration run left a uniquely identified test run. Exact signature-checked, FK-safe cleanup removed only that run's rows. After the final reviewer gate, the Task 8 namespace `legacy-backfill-test-*` was rechecked across Source, Item, legacy Cluster, Alert, EvidenceCluster, and CanonicalChange; all six counts were zero.

## Product and operational boundary

Foundation does not complete Phase 1 P0. The following remain unimplemented or unreleased:

- Public Intelligence market/platform/category pages and canonical public APIs/RSS
- Seller Profile and Private Relevance Briefing/Actions/email
- Railway Cron and short-lived worker cost cutover
- public SEO/performance verification on the replacement routes
- a continuous seven-day source-SLA and global-gap stability run
- staging/production migration and deployment approval

The next implementation plan is `docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md`.

## Non-blocking reviewer notes

- The backfill fingerprint intentionally hashes source row identifiers rather than all mutable content. Apply always replans from live data, preventing stale writes; a future hardening change may include selected content hashes if reviewed counts must also prove text immutability.
- Existing 552 branch rows carry CUIDs from an earlier accepted revision, while the corrected insert path uses stable hash-derived ids for new rows. Replay safely reuses stored ids, and the largest bounded `createMany` batch remained below practical parameter limits.
