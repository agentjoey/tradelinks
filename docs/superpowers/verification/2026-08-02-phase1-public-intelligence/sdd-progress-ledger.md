# SDD ledger — plan: docs/superpowers/plans/2026-07-23-tradelinks-phase1-public-intelligence.md

Task 1: in progress — public-content-schema
Task 1: base a963a62b65a06bd1595650bf7826e751253f875c
Task 1: risk HIGH_RISK — warning 20000000, hard 30000000 gross tokens
Task 1: plan correction — public-content migration renumbered from occupied 0012 to forward-only 0013; later retirement becomes 0014
Task 1: production exposure blocked — no staging/production mutation or deployment
Task 1: Neon checkpoint — br-plain-truth-ao4ndjrm phase1-public-pre-migration, parent br-autumn-smoke-aof5n7pe; existing 0011/0012 applied before implementation
Task 1: telemetry — Pactify provider token fields currently unavailable; record UNAVAILABLE, one worker run and one reviewer run targeted
Task 1: fix round 1/3 — migration path, enum DTO, tracked efficiency record, and Neon identity corrected (commit f993418)
Task 1: fix round 2/3 — DB-backed schema/relation tests and real cursor pagination added (commit 0546632)
Task 1: reviewer accepted — Claude Opus 5, 76/76 targeted tests
Task 1: incident recovery — temporary Neon branch reset from parent after reviewer shadow-database misuse; migrations 0011–0013 replayed
Task 1: complete (commits a963a62..0546632, review accepted; final verification/docs follow-up pending integration)

Task 2: design gate — orchestrator handed from Codex 5.6 Sol to Claude Opus 5 on 2026-08-02
Task 2: seats — orchestrator claude(claude-opus-5), worker kimi(kimi-code/k3, new role profile kimi-k3-worker), reviewer claude(claude-opus-5)
Task 2: worker model changed from Task 1's opencode deepseek/deepseek-v4-pro to Kimi K3 by explicit Human Owner direction, not provider failure
Task 2: owner decision 1 — English-only launch, /zh gets permanent 308 redirects, translation data retained
Task 2: owner decision 2 — plan's Public URL Contract approved verbatim, canonical base https://tradelinks.us
Task 2: owner decision 3 — Direction A palette x Direction B3 evidence-card structure, chosen from rendered HTML comparison; light is the default theme
Task 2: owner decision 8 — six fixed topics approved (Import & Customs, Product Safety & Recalls, Labeling & Claims, Fees & Payments, Privacy & Consumer Protection, Listing & Account Health)
Task 2: owner decisions 4/5/6/7 deferred to their owning tasks (3/5/7/9), not pre-empted
Task 2: design gate APPROVED by Human Owner 2026-08-02 on rendered artifacts, before any product code
Task 2: artifacts — DESIGN.md (new), design/phase1-public-intelligence.html (5 surfaces x 2 viewports + state matrix), design/phase1-public-intelligence-directions.html (rejected lanes), design/shots/{public-mockup,direction-probe}/ (20 renders)
Task 2: plan correction — repo has no vitest.config.ts; the plan's exclude snippet would replace vitest's default exclude list, dropping dist/.cache/.git/.idea. Spread configDefaults.exclude instead.
Task 2: plan correction — PRODUCT.md already exists (Foundation Task 6 artifact); $impeccable init must not overwrite it. DESIGN.md was absent and is now written.
Task 2: scope note — BL-045 liveness motion is removed from the public shell render path but its CSS stays in globals.css while legacy /wire,/trends,/daily still consume it (retired in Task 9)
Task 2: scope note — theme default inversion in globals.css (:root becomes light, [data-theme="dark"] becomes the override); cookie/SSR/localStorage mechanism unchanged
Task 2: seat resolution — pactify derives the roster solely from the one-time init event; there is no verb to change an existing seat's roles, so `seat add claude --roles orchestrator` is impossible. Human Owner authorised a one-off codex-identity roster change; the closest honest form was adding a NEW orchestrator seat rather than logging every future orchestration action as codex.
Task 2: new seat `claude-orch` (roles: orchestrator, kind claude-code) added under PACT_AGENT_ID=codex by Claude Opus 5 acting on explicit Human Owner authorisation on 2026-08-02. Actual executor was Claude Opus 5, not Codex. Role profile claude-opus5-orchestrator = claude-code/claude-opus-5.
Task 2: seat `claude` remains worker+reviewer and is the task reviewer; seat `claude-orch` performs assign/merge. Both are backed by claude-opus-5.
Task 2: assigned — public-ia-design-gate, owner kimi, reviewer claude, deps [public-content-schema], spec .pact/tasks/phase1-public-intelligence-public-ia-design-gate.md
Task 2: spec correction — Task 1 evidence records pnpm test at 540/542 with 2 pre-existing failures on this branch. The gate is "no new failures vs that baseline", not 542/542. Worker must name the 2 failures before changing anything and must not repair them.
Task 2: worker launch prompt at .agent/handoffs/2026-08-02-public-task2-kimi-worker-prompt.md (root working copy, untracked)
Task 2: round 1 changes_requested by reviewer — B1 legacy routes lost all chrome (measured 0 header/nav/footer on /subscribe vs 1/2/1 on /), B2 legacy screenshots were byte-identical DB-error boundaries, C1 test-results committed, C2 worker brief committed
Task 2: round 2 accepted 2026-08-02 — app/(legacy)/layout.tsx restores prior chrome verbatim; reviewer reproduced every gate on its own build (port 3299): all legacy routes 1/2/1 skip=2 http 200; lint 0; targeted 20/20; build 0; e2e 10/10
Task 2: /daily 500s with no chrome — verified PRE-EXISTING (diff vs 9ead343 shows only import-depth changes; cause is missing DATABASE_URL in prisma.dailyNote.findMany), not a Task 2 regression
Task 2: orchestrator error — a malformed redirect in the worker dispatch created a file literally named $LOG which the worker swept into the round-2 checkpoint; removed by the reviewer in a follow-up commit

Env: branch feat-phase1-public-intelligence PUSHED to origin 2026-08-02 on Human Owner authorisation (no PR, no staging/production touched). Task 1+2 work now has off-machine backup.
Env: no .env existed anywhere for this project — only .env.example. Neon `dev` (br-rapid-math-aohxjdng) was checked and holds ONLY legacy tables; 0011/0012/0013 are absent there, so pointing at dev would not have worked and migrating dev would mutate shared state used by other tracks.
Env: worktree .env provisioned 2026-08-02 against br-plain-truth-ao4ndjrm (phase1-public-pre-migration, endpoint ep-dark-resonance-aol8malu), non-production, 13/13 migrations up to date. Deliberate deviation from the Human Owner's literal "point at dev" answer, made to satisfy the stated intent without mutating shared dev; disclosed at the time. chmod 600, gitignored. Production ep-mute-base-aotkza3n and staging ep-odd-violet-ao98q1jy were confirmed unused.
Env: vitest does NOT load .env (Prisma CLI does). DB-backed suites need the vars exported into the process, e.g. `set -a && . ./.env && set +a && pnpm test`. Task 3 is authorised to add `dotenv/config` to vitest.config.ts setupFiles as the permanent fix.
Env: TRUE BASELINE measured for the first time 2026-08-02 with a real database — Test Files 59 passed / 1 failed (60), Tests 573 passed / 2 failed (575), duration ~247s. The 2 failures are both test/foundation-backfill.test.ts ("apply matches the dry-run counts exactly on first apply and zero on replay", "apply rejects a mismatched fingerprint"). Cause: the backfill script's in-code endpoint allowlist correctly refuses this endpoint ("Refusing to apply backfill: ... must point to the approved isolated endpoint"). This is the safety feature working as designed, NOT a defect, and it retroactively confirms the Task 2 worker's inference was accurate.

Task 3: owner decision 4 — Amazon US hub publishes at MONITORED with the incomplete-official-policy warning above the fold, matching the approved mockup. Not hidden.
Task 3: owner decision — the `Track this category` entry point is NOT shipped in Task 3. The plan routes it to /onboarding, which is defined only in the Private Relevance plan (Private Task 7) and would be a 404 on a public indexable page for this entire milestone. Deferred until that route exists.
Task 3: plan correction — test/public-seo.test.ts appears in the Step 4 gate command but is missing from the Task 3 Files list; it is in scope.
Task 3: accepted 2026-08-02 round 1. Two worker escalations, both correct and both upheld: (a) wiring Home to the real read model breaks three accepted Task 2 tests — ruled Option A with the condition that the readiness/evidence invariant stay enforced by a deterministic fixture, not a vacuous assertion; (b) app/(public)/loading.tsx made every gated 404 a soft-200 — ruled delete, with a Playwright status gate locking it.
Task 3: RULE — a loading.tsx must never sit above a readiness-gated route. A route-group loading.tsx flushes the shell before notFound() runs. Per-surface skeletons only, or a Suspense boundary inside the page. Locked by test/e2e/public-hubs.spec.ts.
Task 3: reviewer error, recorded — a leftover-fixture check filtered `id LIKE 'test-%'` while those fixtures prefix `slug` and use CUID ids; the 12 rows it found were created by the reviewer's own in-flight test run. Nearly charged the worker with a hygiene failure that did not exist. Check the column the fixture actually prefixes, and finish your own runs before reading shared state.
Task 3: accepted debt — app/(public)/ links to /changes, /guides, /briefings and /api/v1/changes, none of which exist yet. Three arrived with PublicNav in Task 2 and the reviewer did not check for dead links then. NOT blocking (branch undeployed, cutover is Task 9, sitemap excludes them) but now two hard requirements: Task 8 must run a site-wide internal-link integrity crawl failing on any non-200 internal link, and Task 9 must not proceed while any public-page internal link returns 404.

Env: DB-suite flakiness was ORCHESTRATOR-CAUSED and is now fixed. Symptom: non-deterministic PrismaClientInitializationError across different test files on every run. Root cause: Neon compute auto-suspends; parallel vitest workers connecting during wake fail without a connect timeout.
Env: the fix is `connect_timeout=30` on both URLs, plus warming the compute with `pnpm exec prisma migrate status` before a run. Nothing else.
Env: DO NOT re-add `pgbouncer=true`, `connection_limit=1` or `pool_timeout`. The orchestrator added all three speculatively; `connection_limit=1` deadlocks against this project's interactive transactions (a transaction holds the only connection while its inner queries need another), turning random failures into deterministic hangs. Isolate one variable at a time — the same standard the workers are held to.
Env: STABLE BASELINE 2026-08-02 after the fix — full suite 632 passed / 7 skipped / 639 collected, 63/64 files, only test/foundation-backfill.test.ts failing (endpoint allowlist, by design). Four DB-heavy suites ran 59/59 three consecutive times.
Env: this figure is byte-identical to what the Task 4 worker reported. The reviewer's N1 ("evidence overstates stability") was half wrong and was formally downgraded in the fix-round dispatch — the worker's number was correct, the environment was not. Leaving an unfair criticism on the record teaches the wrong lesson and corrupts the baseline every later task is read against.

Task 4: plan corrections — the opaque cursor helper already existed in query.ts (the plan wrongly attributes it to Task 7); search ships unindexed in Phase 1 by decision with the index deferred to Task 8 (no index exists on CanonicalChangeVersion; the only pg_trgm GIN indexes are on `items` from migration 0002); `Track this change` is not shipped because /onboarding belongs to Private Relevance.
Task 4: round 1 changes_requested — encodeCursor/decodeCursor were duplicated verbatim into search.ts instead of escalating that they are module-private in an out-of-scope file. Blocking because Task 7 owns the public cursor contract and two copies of a wire format drift, which would make web and API pagination disagree — a direct violation of the one-canonical-version-per-channel invariant.
Task 4: round 2 — fixed by exporting both helpers from query.ts (diff is exactly two `export` keywords, no behaviour change) and importing them in search.ts.
