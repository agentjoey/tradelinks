# Public Intelligence Task 7 — Anonymous API v1, OpenAPI, Fingerprint, Agent Skill

## Context

Implement Task 7 from `docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md`.

Tasks 1–6 are accepted. This task ships the machine-readable contract: a versioned anonymous
REST API, its OpenAPI 3.1 document, a content fingerprint endpoint, and the Agent Skill.

Worktree: `/Users/xtation/AgentWorks/worktrees/tradelinks-phase1-public-intelligence`.
Never write anything irreplaceable under `/private/tmp`.

## Models

- Worker: **Kimi Code, `kimi-code/k3`** (pact role `kimi-k3-worker`).
- Reviewer: **Claude Code, `claude-opus-5`**, fresh context.

A worker never self-accepts.

## Owner decision 6 — API abuse posture

Approved as the plan recommends: **cached anonymous reads with strict page and query limits,
plus operational request-volume alerting. No per-request database rate-limit write.**

Rationale, recorded so it is not mistaken for an oversight: paying a Neon write on every
anonymous read buys protection against traffic nobody has observed yet. Cap result size and
query complexity in code, lean on CDN caching, and add a CDN or firewall limit only when real
traffic justifies its cost.

## The cursor collision — read this before writing any code

The plan's Interfaces line says Task 7 *produces* `encodeCursor` and `decodeCursor`. **It does
not.** Those already exist, exported from `src/public-intelligence/query.ts` (Task 1's accepted
contract) and consumed by `search.ts`. Task 4 was sent back for duplicating exactly these two
functions, on the grounds that two copies of a wire format drift.

Do **not** redefine them, do not re-export them under an API name, and do not modify
`query.ts`.

The API cursor is a **different contract**, not a copy:

| | Web cursor (`query.ts`, existing) | API cursor (this task, new) |
|---|---|---|
| Payload | `{ id, reviewedAt }` | `{ publishedAt, id, filtersHash }` |
| Signed | no | yes, HMAC with `PUBLIC_API_CURSOR_SECRET` |
| Audience | internal page-through | public, versioned, must reject reuse under changed filters |

Name yours distinctly — `encodeApiCursor` / `decodeApiCursor` — and keep them in `api.ts`.
State in your report, in one sentence, why two cursor schemes legitimately coexist, so a later
reader does not "unify" them and silently break one of the two contracts.

A cursor presented with a different `filtersHash` than it was issued for returns
`400 INVALID_CURSOR`. A malformed or unsigned cursor returns the same.

## `PUBLIC_API_CURSOR_SECRET`

A 32-byte secret. Add it to the `EnvSchema` in `src/config/env.ts` and to `.env.example` with a
placeholder — never a real value in the repo.

The orchestrator has already added a dev value to this worktree's gitignored `.env`, so builds
and local runs work. **Do not modify `.env`.** Tests must supply their own value in-process
rather than depending on the ambient one, so they pass on a clean checkout.

Fail closed: if the secret is absent at runtime, the API returns a deterministic error rather
than issuing unsigned cursors.

## The plan's file map is unreliable — Task 6 proved it

Task 6 discovered that `app/feeds/platforms/[platform].xml/route.ts` is framework-impossible:
Next.js treats a segment as dynamic only when it both starts with `[` and ends with `]`, so
`[platform].xml` registers as a static segment. The paths in this task's list use plain
`[slug]` segments and are fine — but verify each route actually resolves before building on it,
and do not invent a `[param].ext` folder.

## Contract

Routes:

- `GET /api/v1/changes` — list, filtered and paginated
- `GET /api/v1/changes/[slug]` — one canonical record
- `GET /api/v1/coverage` — the coverage matrix
- `GET /api/v1/briefings` — published briefings
- `GET /api/v1/fingerprint` — a cheap content-state probe
- `GET /openapi.json` — OpenAPI 3.1
- `/agent/tradelinks/SKILL.md` — served from `public/agent/tradelinks/SKILL.md`

Success envelope, exactly:

```ts
type ApiPage<T> = {
  apiVersion: "1.0";
  generatedAt: string;
  fingerprint: string;
  data: T[];
  page: { nextCursor: string | null; limit: number };
};
```

Hard rules:

- **Limits 1–100, default 20.** Out-of-range is a deterministic `400`, not a silent clamp.
- **Serves non-browser clients.** `curl` with no browser headers gets `200`. There is no
  user-agent gate on `/api/v1`. The legacy `/api/public/*` routes keep theirs — do not touch
  them; Task 9 owns their retirement.
- **`ETag`, `Last-Modified`, `Cache-Control`.** The ETag derives from the canonical
  fingerprint, not from a hash of the serialized bytes. A matching `If-None-Match` returns
  **304 with an empty body**.
- **Canonical attribution** on every record: the permalink and the evidence links.
- **No private data anywhere.** No seller profile, relevance assessment, personal action,
  draft, rejected, non-current or below-Monitored record. The OpenAPI document must not
  contain the strings `SellerProfile`, `PersonalAction` or `RelevanceAssessment` — assert that.
- **Reuse the accepted read layer.** Consume `search.ts` / `query.ts` / `serialize.ts` /
  `coverage.ts` / `briefings.ts`. No new query shape, no recomputed fingerprint. The same
  invariant Task 6 pinned for XML applies here: assert over the **rendered JSON** that
  `versionId`, `fingerprint` and permalink are byte-identical to the serializer's output.
- Error responses carry a stable machine `code` and an HTTP status that matches it.

## The Agent Skill

`public/agent/tradelinks/SKILL.md`, version `1.0.0`. It instructs an agent to:

- query current API data rather than answer from model memory;
- preserve the time window the user asked for instead of silently widening it;
- cite the canonical TradeLinks page for every claim;
- verify any important policy fact against the official evidence links, not the summary;
- state the readiness level with every conclusion;
- return a clear unavailable-or-stale result when the API cannot be reached, never a
  remembered answer.

Its declared endpoints and version must match the OpenAPI document. Assert that in a test —
a Skill that documents a route the API does not serve is worse than no Skill.

## Scope

Create or modify only:

- `src/public-intelligence/api.ts`
- `app/api/v1/changes/route.ts`
- `app/api/v1/changes/[slug]/route.ts`
- `app/api/v1/coverage/route.ts`
- `app/api/v1/briefings/route.ts`
- `app/api/v1/fingerprint/route.ts`
- `app/openapi.json/route.ts`
- `public/agent/tradelinks/SKILL.md`
- `src/config/env.ts` (additive: the one new key)
- `.env.example` (additive: the one new key, placeholder value)
- `test/public-api-v1.test.ts`
- `test/public-agent-skill.test.ts`
- this Pact task's report/evidence metadata

Do not touch: `src/public-intelligence/{types,query,serialize,cache,coverage,search,guides,briefings,feeds}.ts`
(accepted contracts — consume them), `app/(public)/**`, `app/(legacy)/**`, `app/api/public/**`,
`app/feeds/**`, `app/admin/**`, `middleware.ts`, Auth, Prisma schema or migrations, `.env`,
`vitest.config.ts`, `playwright.config.ts`, earlier tasks' tests, or cloud configuration.

## Standing rules from earlier tasks

- Any test invoking a function that recomputes or refreshes **all** rows of a shared table must
  snapshot and restore it. Keep fixtures run-scoped and clean them FK-safe.
- Parallel suites share one Neon branch. If you hit `Inconsistent query result`, that is the
  known cross-suite artifact; a retry anchored to that exact string is acceptable in test code
  only, never in product code.

## Gates

```bash
cd /Users/xtation/AgentWorks/worktrees/tradelinks-phase1-public-intelligence
set -a && . ./.env && set +a
pnpm exec prisma migrate status          # warms the Neon compute; do this first
pnpm vitest run test/public-api-v1.test.ts test/public-agent-skill.test.ts test/public-channel-consistency.test.ts
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Baseline: **685 passed / 2 failed (687)**, 65/66 files, only `test/foundation-backfill.test.ts`
failing (endpoint allowlist, by design). Do not repair it. No new failures, no drop in
collected files. Run the full suite **twice** and show both failure sets.

Strict TDD: RED with real output, GREEN, REFACTOR with the same command rerun unchanged.

Then Impeccable `critique` and `audit`, scoped to what applies to JSON endpoints — correctness,
headers, error states, contract clarity. Do not invent UI findings.

No screenshots. Capture `curl -i` for every route into your report: status, content type, cache
headers, and for the list routes the item count. Include the 304 round-trip and a
`400 INVALID_CURSOR` case.

## Evidence

RED/GREEN/REFACTOR with exact commands and exit codes, files changed, the `curl -i` captures,
confirmation that JSON `versionId`/`fingerprint`/permalink are byte-identical to the
serializer's, the one-sentence justification for two cursor schemes, Impeccable record paths,
rollback notes, `EFFICIENCY_RECORD`. Keep Pact evidence under 4 KB and link
`.superpowers/sdd/2026-07-23-tradelinks-phase1-public-intelligence/task-7-report.md`.

Report unavailable token telemetry as `UNAVAILABLE`. State plainly anything you could not
verify.

## This task retires the last dead internal link

`/api/v1/changes` is currently linked from the public pages and returns 404. It is the last
one. Task 8 still owes a site-wide internal-link integrity crawl, and Task 9 must not cut over
while any public-page internal link returns 404 — but after this task there should be none.
Confirm that in your report by listing the internal links on public pages and their statuses.

## Stop and report instead of deciding

Print `BLOCKED:` and stop. Four of your escalations have been upheld; the one scope question
you resolved alone was sent back.

- Any need to touch a file outside the scope list.
- Any need for a migration or schema change.
- Any disagreement with an accepted contract.
- Any temptation to redefine or "unify" the cursor helpers.
- Any destructive or irreversible command.

## Prohibited

No production or staging deployment. No Neon, Vercel or Railway mutation. No migration. No
legacy route retirement, no `/zh` work, no `0014`. No `git push`, no merge, no
`git reset --hard`. No `pactify seat use`. No real secret committed. No claim that the
seven-day P0 has passed.
