# Public Intelligence Task 3 — Readiness-Gated Hubs

## Context

Implement Task 3 from `docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md`.

Tasks 1 and 2 are accepted. Task 1 gave you the public read contract
(`src/public-intelligence/{types,query,serialize,cache}.ts`) and the additive public-content
schema. Task 2 gave you the shell: `app/(public)/layout.tsx` exporting `PublicShell`,
`PublicNav`, `PublicFooter`, `StatePanel`, the shadcn primitives under `components/ui/`,
and the light-default theme. Legacy routes live in `app/(legacy)/` and keep their old chrome
until Task 9 retires them — do not touch them.

This task builds the hub layer: US Market, Amazon US, Shopify US, Categories, Topics, and
the public Coverage page. It does not build `/changes` (Task 4), guides or briefings
(Task 5), feeds (Task 6), or the API (Task 7).

## Approved design and decisions

The design gate closed on 2026-08-02. `DESIGN.md` and
`design/phase1-public-intelligence.html` are binding. Two surfaces in that mockup are your
targets: **Surface 2 (`/amazon-us` platform hub)** and **Surface 5 (`/coverage`)**. Match
their structure, their honesty mechanics, and their token semantics. Do not redesign.

| Decision | Owner ruling (2026-08-02) |
|---|---|
| Amazon US hub | Publishes at `MONITORED` with the incomplete-official-policy warning **above the changes list**, exactly as the mockup shows. Not hidden. |
| `Track this category` | **Not shipped in this task.** The plan routes it to `/onboarding?category=…`, which is defined only in the Private Relevance plan (Private Task 7). Shipping it now puts a 404 on a public, indexable page. Omit the entry point entirely; do not substitute `/subscribe` and do not build a placeholder route. |
| Recurring topics | The six approved tags: Import & Customs, Product Safety & Recalls, Labeling & Claims, Fees & Payments, Privacy & Consumer Protection, Listing & Account Health. |

## Models

- Worker: **Kimi Code, `kimi-code/k3`** (pact role `kimi-k3-worker`).
- Reviewer: **Claude Code, `claude-opus-5`** (pact role `claude-opus5-reviewer`), fresh context.

A worker never self-accepts. If the worker model is unavailable, stop and obtain explicit
Human Owner approval before substituting.

## Database and the real baseline

This worktree now has a `.env` (gitignored, chmod 600) pointing at Neon branch
`br-plain-truth-ao4ndjrm` / endpoint `ep-dark-resonance-aol8malu` — **non-production**,
13/13 migrations applied. Never repoint it. Production is `ep-mute-base-aotkza3n` and
staging is `ep-odd-violet-ao98q1jy`; both are off limits.

**vitest does not read `.env`.** Prisma's CLI does, vitest does not. Run DB-backed suites as:

```bash
set -a && . ./.env && set +a && pnpm test
```

You are authorised to make this permanent by adding `"dotenv/config"` to the `setupFiles`
array in `vitest.config.ts`. That file belongs to accepted Task 2; this one-line change is
the only edit to it that is in scope. If you make it, prove the DB suites pass **without**
the manual export.

**Measured baseline, 2026-08-02, with a real database:**

```
Test Files  59 passed | 1 failed (60)
Tests      573 passed | 2 failed (575)
```

Both failures are in `test/foundation-backfill.test.ts` — *"apply matches the dry-run counts
exactly on first apply and zero on replay"* and *"apply rejects a mismatched fingerprint"*.
Cause: the backfill script's in-code endpoint allowlist correctly refuses this endpoint
(`Refusing to apply backfill: … must point to the approved isolated endpoint`). That is a
safety feature behaving as designed. **Do not repair them, and do not add this endpoint to
the allowlist.** Your gate is no new failures against 573/575.

Test data hygiene: seed and clean up only rows carrying a run-scoped `test-<runId>` prefix,
in FK-safe order, exactly as the existing DB suites do.

## Scope

Create or modify only:

- `src/public-intelligence/coverage.ts`
- `app/(public)/CoveragePanel.tsx`
- `app/(public)/IntelligenceCard.tsx`
- `app/(public)/ReadinessBadge.tsx`
- `app/(public)/page.tsx` (modify)
- `app/(public)/us/page.tsx`
- `app/(public)/amazon-us/page.tsx`
- `app/(public)/shopify-us/page.tsx`
- `app/(public)/categories/page.tsx`
- `app/(public)/categories/[category]/page.tsx`
- `app/(public)/topics/page.tsx`
- `app/(public)/topics/[topic]/page.tsx`
- `app/(public)/coverage/page.tsx`
- `app/sitemap.ts` (modify — eligible hubs and supported topics only)
- `test/public-hubs.test.tsx`
- `test/public-seo.test.ts` — *plan correction: this file is named in the Step 4 gate
  command but was omitted from the plan's Files list. It is in scope.*
- `vitest.config.ts` — the single `dotenv/config` line only
- `test/public-shell.test.tsx` — **scope extension granted 2026-08-02**, see below
- this Pact task's report/evidence metadata

### Scope extension — `test/public-shell.test.tsx`

Granted by the orchestrator after the worker correctly escalated rather than deciding.

Wiring `app/(public)/page.tsx` to the real read model is mandated by the plan's own Files
list, and leaving Task 2's specimen home in place would ship fabricated content, which
PRODUCT.md forbids ("persisted or unavailable, never invented"). Making Home an async
server component necessarily breaks three accepted Task 2 tests. Tests follow the code they
describe; a test asserting scaffold content guards nothing.

You may modify **exactly these three tests** in the `public home page` describe:

- `renders exactly one h1` and `does not carry the BL-045 liveness choreography` — change
  `render(<Home />)` to `render(await Home())`. Behaviour asserted stays identical.
- `shows readiness as literal words with evidence inline` — re-aim it.

**Condition on the third test.** That assertion guards a real `DESIGN.md` invariant:
readiness is never encoded by colour alone, and evidence sits inline with its conclusion.
That invariant must remain enforced by a test that does not depend on what happens to be in
the shared database. Assert it against a deterministic seeded fixture or by rendering the
component directly with props. **Do not simply delete the assertion**, and do not replace it
with one that passes vacuously when the database returns nothing.

No other test in that file may be touched. State in your evidence, per test, what the old
assertion guarded and where that guarantee now lives.

### Scope extension — delete `app/(public)/loading.tsx`, add a 404 status gate

Granted 2026-08-02 after the worker escalated a second time with a clean A/B: with that file
present, a below-Monitored hub and an unsupported topic return **HTTP 200** with
`NEXT_NOT_FOUND` inline; with it moved aside, the same routes return **HTTP 404**. Page-level
`force-dynamic` and `notFound()` in `generateMetadata` do not override a parent `loading.tsx`
Suspense boundary in Next 14.2.35.

Delete the file. Three reasons, in order of weight:

1. A soft-200 "404" tells search engines a gated hub exists and is healthy. Honest coverage
   gating is the product's core premise — a hub below Monitored must genuinely not exist,
   not merely look absent.
2. The contract says gated hubs return 404. A soft-200 fails it.
3. The file's content is the inherited BL-045 legacy-home skeleton (12-column grid with
   thumbnails). It matches no Phase 1 surface. `DESIGN.md` §States requires skeletons that
   preserve *their own* surface's heading structure, so one group-level skeleton is wrong
   for every surface it covers.

Loading states are not being abandoned — they are being moved to where they belong.
Per-surface `loading.tsx` files belong to the tasks that own those surfaces, and must never
sit above a readiness-gated route. Record this explicitly in your report as work owed by
Tasks 4 and 5.

**Condition — lock the behaviour.** A curl check is not a gate. Add
`test/e2e/public-hubs.spec.ts` (new file, in scope) asserting real HTTP status:

- a below-Monitored category hub → `404`
- an unsupported recurring topic → `404`
- a renderable hub (`/amazon-us`) → `200` with its content present

Use Playwright's navigation response status, not page content. This must fail loudly if a
future task reintroduces a `loading.tsx` above a gated route. Do not touch Task 2's
`test/e2e/public-intelligence.spec.ts`.

Do not touch: `app/(legacy)/**`, `app/admin/**`, `middleware.ts`, Auth, Prisma schema or
migrations, `src/public-intelligence/{types,query,serialize,cache}.ts` (Task 1's accepted
contract — consume it, do not change it), workers, or cloud configuration.

## Behaviour contract

**Readiness gating.** `canRenderHub(capability)` returns true only for `MONITORED` or
`VERIFIED`. A hub below that returns 404 and stays out of the sitemap. Never render a
placeholder or an empty hub.

**Topic pages.** A topic detail page exists only when it has either three published
Monitored/Verified changes, or one reviewed guide plus one current published change.
Otherwise 404. Topics aggregate canonical versions; they do not get their own editorial
store. Risk Attribute links route to the closest explicit topic and keep the exact Risk
Attribute label as a filter.

**Every rendered hub shows**, per the plan and the mockup: overview, current changes,
federal requirements, platform considerations, recurring risk topics, guides, demand context
only when explicitly labelled Experimental, primary sources, freshness (last successful
source check), known coverage gaps, and last content review. A non-empty known-gap statement
is mandatory — an empty gap list is a bug, not a clean bill of health.

**Amazon US hub** leads with the incomplete-policy-coverage warning until that capability
reaches Monitored on its own merits.

**Experimental demand** never appears in the same stream as canonical changes and never
claims a bestseller, a launch recommendation, or an opportunity.

**Cache**: pages declare one-hour revalidation via the Task 1 cache contract. No worker call
from a request handler.

**Metadata**: unique title and description per hub, canonical URL, and the hub in
`app/sitemap.ts` only when it is renderable.

## Gates

```bash
set -a && . ./.env && set +a
pnpm vitest run test/public-hubs.test.tsx test/public-seo.test.ts
pnpm lint
pnpm test
pnpm build
pnpm test:e2e test/e2e/public-intelligence.spec.ts
```

Strict TDD: RED with the real command output, GREEN, REFACTOR with the same command rerun
unchanged.

Then Impeccable `critique` and `audit` on the built hubs, records persisted under
`.impeccable/`. Fix every P0 and P1; you may not waive your own finding.

Final-build screenshots **after** all fixes, at 390, 768 and 1440 in both themes, into
`design/shots/public-task3/`. Cover at minimum `/amazon-us`, `/categories/[category]` and
`/coverage`. Screenshots must show real rendered content — a shot of an error boundary is
not evidence that a route works, and two byte-identical files are not two pieces of
evidence.

## Evidence

Record RED/GREEN/REFACTOR with exact commands and exit codes, files changed, browser
evidence paths, Impeccable record paths, rollback notes, and `EFFICIENCY_RECORD`. Keep Pact
evidence under 4 KB and link
`.superpowers/sdd/2026-07-23-tradelinks-phase1-public-intelligence/task-3-report.md`.

Report unavailable token telemetry as `UNAVAILABLE`; never estimate it as fact. State
plainly anything you could not verify and why — a disclosed gap is accepted, an overstated
claim is not.

## Stop and report instead of deciding

Print `BLOCKED:` and stop if you hit any of these. The Task 2 round-1 rework happened
because a scope question was resolved unilaterally rather than escalated:

- Any need to touch a file outside the scope list above.
- Any disagreement with `DESIGN.md` or the approved mockup.
- Any migration, schema change, or need to repoint `.env`.
- Any need for a route that does not exist yet.
- Any destructive or irreversible command.

## Prohibited

No production or staging deployment. No Neon, Vercel or Railway mutation. No schema change
or migration. No `/zh` redirect work and no legacy route retirement (Task 9). No `0014`. No
`git push`, no merge, no `git reset --hard`, no branch deletion. No `pactify seat use` —
your identity comes from `PACT_AGENT_ID`. No claim that the seven-day P0 has passed.
