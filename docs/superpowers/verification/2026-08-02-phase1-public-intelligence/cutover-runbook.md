# Cutover Runbook — Phase 1 Public Intelligence (Task 9b)

**Audience:** whoever executes the production cutover. Possibly not the author, possibly
months after 2026-08-03. Read this top to bottom before touching anything. Every check is a
copy-pasteable command with its expected output. If a check fails, **stop** — do not
"work around" it at 2am.

**What this cutover is:** the legacy site (`/wire`, `/trends`, `/daily`, API v0) is replaced
by the public-intelligence site (`/changes`, `/briefings`, hubs, API v1). Legacy URLs 308 to
their replacements. The legacy tables (`alerts`, `daily_notes`, `items`, legacy `clusters`)
are dropped by migration **0014**.

**What was already done (Task 9a, accepted):** the redirect map
(`src/public-intelligence/legacy-redirects.ts`, pure, wired into nothing), the
`PUBLIC_CUTOVER_ENABLED` env flag (default **off**), the dry-run reconciliation
(`scripts/backfill-public-content.ts`), and this runbook. Nothing irreversible has happened.

> **Naming trap:** the plan calls the retirement migration `0013_retire_wire_radar_daily`.
> `0013` is taken by the public content schema. The retirement migration is **0014**.
> If you find yourself writing `prisma/migrations/0013_*`, stop and re-read this line.

---

## 1. Preconditions — check every one, in order

Run these from the repo root of the release branch you intend to cut over from.
`set -a && . ./.env && set +a` first where a command needs the database.

### P1 — Public Tasks 1–8 are accepted. **MET as of 2026-08-03.**
```bash
pactify status   # or: cat .pact/STATE.yml
```
Expected: every `phase1-public-intelligence-*` task through Task 8 shows `accepted`.
If any is missing, stop: the replacement site is not verified.

### P2 — The Foundation feature is accepted. **MET as of 2026-08-03.**
Same command as P1. Expected: all `phase1-foundation` tasks `accepted`.

### P3 — The Operations P0 seven-day stability report exists with pass=true. **⛔ UNMET.**
The P0 requires seven consecutive stable Operations days and a written report with
`pass=true`. As of 2026-08-03 **this report has not run at all.**
```bash
ls docs/superpowers/verification/ | grep -i operations
```
Expected: a report file whose conclusion is `pass=true`. If it is absent or says anything
else, stop. Do not cut over on "it's been fine lately."

### P4 — Production has publishable canonical records. **⛔ UNMET — this is the big one.**
The public read contract (`src/public-intelligence/query.ts:28-35`) requires
`isCurrent` + `editorialStatus: PUBLISHED` + `reviewedAt not null` + readiness
`MONITORED|VERIFIED`. Measured read-only on production 2026-08-03:

| table | rows |
|---|---|
| `CanonicalChange` | **0** |
| `CanonicalChangeVersion` `isCurrent` | **0** |
| versions satisfying the public contract | **0** |
| legacy `alerts` / `daily_notes` / `items` | 570 / 22 / 3,743 |

Check it yourself against the **production** database (read-only):
```bash
DATABASE_URL=<production-pooled-url> pnpm tsx -e "
import { prisma } from './src/db/client.js';
async function main() {
  const n = await prisma.canonicalChangeVersion.count({ where: {
    isCurrent: true, editorialStatus: 'PUBLISHED',
    reviewedAt: { not: null }, readiness: { in: ['MONITORED','VERIFIED'] } } });
  console.log('publishable:', n);
  await prisma.\$disconnect();
}
main();"
```
Expected before cutover: a number well above zero — enough that `/changes` and the hubs
look like a site, not a placeholder. If it is 0, stop and read §2.

### P5 — The backfill reconciliation reports empty unmapped arrays **with rows present**. **⛔ UNMET.**
```bash
pnpm tsx scripts/backfill-public-content.ts --dry-run
```
Expected: `unmappedAlerts: 0` and `unmappedPublishedDailyNotes: 0` **while the mapped
counts are non-trivial**. An empty unmapped array on a database with zero legacy rows
proves nothing — check `mappedAlerts` is in the hundreds, not that the unmapped count
happens to be 0. As of 2026-08-03 the branch run reports **571 unmapped alerts and 22
unmapped published daily notes, 0 mapped** (fingerprint
`d93efa22b887dc1e3dd0ed34798df6a77e705143fa28c540338617512d088565`, stable across two runs).

### P6 — The pre-retirement Neon branch exists.
```bash
# Neon console or CLI: a branch named phase1-public-pre-retirement
# forked from production AFTER the backfill writes, BEFORE 0014.
```
Expected: branch exists and its compute endpoint is recorded in the change ticket.
This branch is your only post-0014 rollback (see §5). Do not proceed without it.

---

## 2. The content problem, stated plainly

**Cutting over today replaces a working site with an empty one.**

Production serves 570 alerts, 22 daily notes and 3,743 items through the legacy routes.
The public-intelligence routes read only canonical versions that a human has reviewed and
published. Today that number is **zero**, and nothing in any pipeline produces publishable
content automatically:

- The Foundation backfill (`src/canonicalize/backfill.ts`) deliberately produces
  `EXPERIMENTAL` readiness, `IN_REVIEW` status, non-current versions with
  `SECONDARY_CONTEXT` evidence. That output **fails the public read contract by design.**
- Only human editorial review through `/admin/review` moves a version to
  `PUBLISHED` + `reviewedAt` + `MONITORED|VERIFIED` + `isCurrent`.

**Records needing human review before cutover:** on the order of **570 alerts** (each maps
to at most one canonical change; the exact count comes from
`pnpm tsx scripts/backfill-phase1-foundation.ts --dry-run` at execution time — the staging
dry-run estimated 552 changes from 570 alerts, with 18 rows rejected `SOURCE_NOT_FOUND`),
plus **22 published daily notes** that need reviewed DAILY Briefing equivalents (Owner
Decision 5: a daily briefing needs ≥3 qualified changes including ≥1 Verified for its
date, or no briefing exists and the old slug 308s to `/briefings`).

This is weeks of editorial work, not a deploy step. Budget for it or do not cut over.

---

## 3. Execution steps — each is reversible until Step 8

Do them in order. After each step, run its check. If a check fails, use §5 for that step
and stop.

**Step 1 — Preconditions.** §1, all six green. Reversible: nothing has happened.

**Step 2 — Content.** Run the Foundation backfill (its own runbook), then do the human
editorial review in `/admin/review` until P4 gives a publishable count the Human Owner has
explicitly accepted as "enough." Record that acceptance in the change ticket.
Reversible: canonical rows are additive; legacy routes are untouched.

**Step 3 — Public-content backfill.** Run the apply path of the public-content backfill
(Task 9b work — Task 9a deliberately shipped dry-run only): map eligible daily notes to
reviewed Briefing drafts and write the `LegacyRedirect` rows. Then re-run:
```bash
pnpm tsx scripts/backfill-public-content.ts --dry-run
```
Expected: unmapped arrays empty, `mappedAlerts`/`mappedDailyNotes` non-trivial, and the
fingerprint recorded in the ticket. Reversible: the written rows are additive; deleting
them restores the prior state.

**Step 4 — Pre-retirement Neon branch.** Create `phase1-public-pre-retirement` from
production **now** (after Step 3, before anything below). Record its endpoint.
Reversible: branch creation changes nothing.

**Step 5 — Deploy the redirect-capable release with the flag OFF.** The release wires
`getLegacyRedirect()` into middleware/route files gated on `PUBLIC_CUTOVER_ENABLED`.
Deploy with `PUBLIC_CUTOVER_ENABLED=false`. Check:
```bash
curl -s -o /dev/null -w '%{http_code}\n' https://tradelinks.us/wire    # expect 200 (flag off)
curl -s -o /dev/null -w '%{http_code}\n' https://tradelinks.us/changes # expect 200
```
Reversible: redeploy the prior release.

**Step 6 — Flip the flag.** Set `PUBLIC_CUTOVER_ENABLED=true` (env change + redeploy/restart
— a config flip, not a code change; this is why the flag exists). Check §6 smoke commands:
every legacy URL 308s to its contract target, every public route 200s.
Reversible: set the flag back to `false` and redeploy. Legacy routes serve again — the
legacy code and tables are still present.

**Step 7 — Soak.** Monitor for the agreed window (see "Monitoring and Rollback" in the
plan): public cache hit ratio, route errors, 404 rate, API status/latency, sitemap, feed
generation. Crawl the sitemap. Confirm the link-integrity suite stays green.
Reversible: flag back to `false`.

**Step 8 — ⛔ POINT OF NO RETURN: migration 0014.** Apply
`prisma/migrations/0014_*/migration.sql`, which drops the legacy models from
`prisma/schema.prisma` and their tables from the database, **in the same release** that
deletes the ~50 legacy files the schema change forces (every module importing
`prisma.alert` / `prisma.dailyNote` / `prisma.cluster` stops compiling the moment the
models leave the schema — schema change, migration and file deletion are one indivisible
act). After this step there is no flag to flip and no prior release to redeploy against
this database. Rollback is §5 Stage D only.

**Step 9 — Post-cutover verification.** §6, every command green, plus the plan's
full-verification gate and the independent T3 review (`$impeccable critique/audit`).

---

## 4. The point of no return, named exactly

**Migration 0014 dropping the legacy tables.** Everything before it is a config flip or a
redeploy. After it, the legacy rows exist only in the `phase1-public-pre-retirement` Neon
branch. Never run a down migration against production.

## 5. Rollback, per stage

- **Stage A — during Steps 1–4:** stop. Nothing user-visible has changed. If Step 3 wrote
  wrong rows, delete the run-scoped Briefing drafts and `LegacyRedirect` rows it created.
- **Stage B — after Step 5 (flag off):** redeploy the prior release.
- **Stage C — after Steps 6–7 (flag on, pre-0014):** set `PUBLIC_CUTOVER_ENABLED=false`
  and redeploy. Legacy routes immediately serve again; legacy tables are intact. Then
  diagnose before retrying.
- **Stage D — after 0014 (point of no return):** restore the
  `phase1-public-pre-retirement` Neon branch into a **new recovery branch** (never
  overwrite production), deploy the **prior app release** pointed at that recovery branch
  under operator control, diagnose, then ship a **forward corrective migration**. Do not
  run a down migration. Do not mutate canonical history.

## 6. Post-cutover smoke checks — runnable commands

Against the production base URL (substitute if different). Expected output is after each
`#`.

```bash
# Legacy URLs redirect permanently to their contract targets
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://tradelinks.us/wire
# 308 https://tradelinks.us/changes
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' 'https://tradelinks.us/trends'
# 308 https://tradelinks.us/amazon-us?view=demand-signals
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://tradelinks.us/daily
# 308 https://tradelinks.us/briefings
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://tradelinks.us/zh/wire
# 308 https://tradelinks.us/changes
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://tradelinks.us/api/public/alerts
# 308 https://tradelinks.us/openapi.json

# A mapped legacy daily slug lands on its briefing; an unmapped one lands on the index
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://tradelinks.us/daily/<a-mapped-slug>
# 308 https://tradelinks.us/briefings/daily/<date>

# Public routes serve
for p in / /us /amazon-us /shopify-us /categories /topics /changes /briefings /guides /coverage; do
  printf '%s ' "$p"; curl -s -o /dev/null -w '%{http_code}\n' "https://tradelinks.us$p"
done
# every line: 200

# Public API, feeds, OpenAPI, sitemap
curl -s -o /dev/null -w '%{http_code}\n' https://tradelinks.us/api/v1/changes        # 200
curl -s -o /dev/null -w '%{http_code}\n' https://tradelinks.us/api/v1/coverage       # 200
curl -s -o /dev/null -w '%{http_code}\n' https://tradelinks.us/feeds/changes.xml     # 200
curl -s -o /dev/null -w '%{http_code}\n' https://tradelinks.us/openapi.json          # 200
curl -s https://tradelinks.us/sitemap.xml | head -5                                  # XML, no /wire /trends /daily URLs
```

From the repo (release branch), the automated gates:

```bash
set -a && . ./.env && set +a
pnpm exec prisma migrate status        # 0014 applied; no legacy models remain
pnpm lint && pnpm test && pnpm build   # all exit 0
pnpm vitest run test/legacy-redirects.test.ts   # map still contract-true
pnpm tsx scripts/backfill-public-content.ts --dry-run   # unmapped arrays empty WITH rows mapped
pnpm test:e2e                          # incl. test/e2e/public-link-integrity.spec.ts — green
# Dead-contract gate from the plan: this must print NOTHING
rg -n "from [\"'].*(src/alerts|/alerts|src/daily|/daily)|prisma\.(alert|dailyNote|cluster)\b|href=.*\"/(wire|trends|daily)" app src scripts test \
  --glob '!app/wire/**' --glob '!app/trends/**' --glob '!app/daily/**' \
  --glob '!src/public-intelligence/legacy-redirects.ts' --glob '!test/legacy-redirects.test.ts'
```

If any smoke check fails **after 0014**, you are in Stage D rollback (§5). Do not improvise.

---

*Task 9a evidence: reconciliation on the non-production branch (571 alerts / 22 published
notes — mirrors production's 570/22) reported 0 mapped / 571 + 22 unmapped with reasons,
fingerprint `d93efa22b887dc1e3dd0ed34798df6a77e705143fa28c540338617512d088565` identical
across two runs. Legacy routes `/wire` `/trends` `/daily` `/subscribe` still serve 200 with
chrome; the Task 8 link-integrity crawl stayed green.*
