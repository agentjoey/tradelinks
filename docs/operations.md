# TradeLinks — Operations Manual

> Last updated: 2026-07-28 · v0.12.0 + Phase 1 Foundation (not deployed)

## Environment matrix

| Component | Dev (local / PR) | Staging | Production |
|-----------|------------------|---------|------------|
| Git branch | `main` (PRs) | `staging` | `production` |
| Neon DB branch | `dev` (`ep-super-mountain-aoh4zjj9`) | `staging` (`ep-odd-violet-ao98q1jy`) | `production` (`ep-mute-base-aotkza3n`) |
| Next.js app | `pnpm dev` / Vercel Preview | Vercel staging project | Vercel production project |
| Node worker | `pnpm worker` (on demand) | local only (no hosted staging worker) | Railway worker service |
| Python scraper | `http://localhost:8000` | `http://scraper.railway.internal:8000` (shared prod scraper) | Railway scraper service |
| pg-boss queue | dev branch | staging branch | production branch |
| Promotion | push to `main` | auto from `main` via GitHub Action | PR/merge from `staging` |

Local `.env` points to dev; staging/production require explicit commands (`pnpm db:migrate:staging` / `pnpm db:migrate:prod`).

## Phase 1 Foundation rollout status

- Repository: complete; 8/8 Pact tasks accepted; Draft PR [#3](https://github.com/agentjoey/tradelinks/pull/3).
- Database: migrations `0011` and `0012` plus legacy backfill verified only on approved isolated branch `br-plain-shadow-aoknpdf3`.
- Production: unchanged. Do not run the Foundation backfill or migrations against production from this document.
- Next operational gate: merge/review Public Intelligence and the Railway Cron/short-lived worker cutover, then complete seven consecutive days of source-SLA and global-gap monitoring before P0 acceptance.
- The checkpoint branch expires on 2026-07-30; any later rollout requires a fresh Neon backup/branch checkpoint rather than treating the old branch as a durable backup.

## Source health dashboard

**`/admin/sources`** is the primary health view — every source with its data flow,
cadence and a 0–100 score, worst-first. Tiers: 🟢 Healthy / 🟡 Degraded / 🔴 Unhealthy /
💀 **Silent** (active but 0 items — the "200 OK but empty" detector) / ⏸ Disabled.
A daily `source-health-tick` (02:30 UTC) snapshots health and Telegram-pings any source
newly crossing into 🔴/💀. `/admin/*` is protected by Neon Auth / Better Auth and the
`ADMIN_EMAILS` allowlist; do not expose review data through a route that bypasses
`requireAdmin()` or the admin middleware probe.

## Ops scripts

```bash
pnpm patrol                         # daily 信号源&内容巡检 — read-only inspection of D-1 (see below)
pnpm tsx scripts/health.ts          # pipeline alive? (worker heartbeat / items / scrapling)
pnpm tsx scripts/db-size.ts         # storage breakdown by relation (catches bloat)
pnpm tsx scripts/db-cleanup.ts      # purge finished pg-boss jobs + VACUUM (safe, re-runnable)
pnpm tsx scripts/dedup-amazon.ts    # one-off: collapse Amazon dup items by /dp/<ASIN>
# items ingested last 24h, by source:
psql "$DATABASE_URL" -c "SELECT \"sourceId\", count(*) FROM items WHERE \"crawledAt\" > now()-'24h'::interval GROUP BY 1 ORDER BY 2 DESC;"
```

## Daily patrol (信号源 & 内容巡检)

The standing daily inspection: source health, content quality, the 爆品/趋势 tracks,
distribution. Read-only against the production Neon DB (always exits 0 — it's an
inspection, not a liveness gate; use `scripts/health.ts` for liveness).

```bash
pnpm patrol              # yesterday (D-1 UTC) — the default
pnpm patrol 2026-06-10   # a specific UTC day
```

`scripts/patrol.ts` prints eight sections; the **`daily-patrol` skill**
(`.claude/skills/daily-patrol/`) encodes the interpretation rules (what is normal
vs. a problem) so any agent runs the script and synthesises a consistent markdown
report rather than a raw dump. The skill is auto-discovered by Claude Code when the
repo is the working directory — no install step.

### Running it on another dev machine

The script and skill live in git; the only thing not in git is `.env` (secrets).

```bash
# one-time
git clone https://github.com/agentjoey/tradelinks.git && cd tradelinks
pnpm install                       # Node ≥20 + pnpm
cp .env.example .env               # then set DATABASE_URL (+ DIRECT_URL) — patrol only hard-needs DATABASE_URL.
                                   # Use the Neon `dev` branch URLs by default.
pnpm db:gen                        # prisma generate — a fresh clone has no generated client
pnpm patrol 2026-06-10             # verify against a known day

# daily
git pull && pnpm patrol            # pull first to pick up script/skill changes
```

Notes:
- `.env` is gitignored — copy it securely (`scp .env user@box:~/tradelinks-mvp/.env`),
  never commit. It now carries **dev** credentials by default; production credentials
  live in `.env.production` (also gitignored).
- patrol is read-only and safe. Write scripts (translations/backfills) hit the branch
  that `.env` points to — dev by default. For deliberate production writes, use
  `dotenv -e .env.production -- pnpm tsx scripts/xxx.ts`.
- Every env var except `DATABASE_URL` is optional with a default, so a minimal
  `.env` is enough for patrol.

## Alert Monitoring

- High-urgency alerts (score ≥ 4) that haven't been published after 30min → manual review queue
- Dedup false-positive rate should be <5% — check weekly with `pnpm ops:dedup-report`

## Cost Monitoring

- Phase 1 free-validation target for core infrastructure: **about $25–50/month**.
- LLM target: <$15/week (≈$60/month)
- If DeepSeek cost spikes: check for crawl loop bug or runaway retries in pg-boss
- **Neon compute (ADR-004):** the current production queue still lives in Postgres.
  Long-lived pg-boss fallback polling can prevent scale-to-zero. The Phase 1 operations
  plan therefore prefers Railway Cron batches, short-lived workers, a sleepable scraper,
  and cached/ISR public reads; that cutover is not implemented by Foundation alone.
- pg-boss maintenance: it auto-archives/expires completed jobs in its `pgboss`
  schema; watch table growth if dead jobs accumulate.
- **Prisma connection pool (Neon):** the pooled `DATABASE_URL` should carry
  `connection_limit` — `5` for the long-lived worker, `1` for Vercel serverless
  functions. Without it, bursts (or Next dev HMR) can hit "Timed out fetching a
  new connection from the connection pool". Neon's pgbouncer already pools, so
  keep Prisma's own pool small.

## Storage & cost playbook (Neon 0.5 GB / Railway credit)

Incidents on 2026-06-04/05 and their root causes — keep these in mind:

- **Neon storage near full.** ~95% was pg-boss: ingest jobs store the full scraped
  items array as JSONB, and at default retention finished jobs piled up (~300 MB).
  Fix shipped: short retention (`retentionMinutes:30` + maintenance every 5 min).
  To reclaim now: `db-cleanup.ts`. **Don't `VACUUM FULL` on Neon** — it rewrites
  pages → inflates *history*/WAL, which Neon bills. Lower **history retention**
  (Neon console → Storage; we run ~0–1h) to drop billed storage fast.
- **Railway credit burned by Chromium.** The scraper launches a browser per request;
  concurrent launches crashed the driver and ran up compute. Fix: serialized
  (one Chromium, worker `batchSize:1`), `disable_resources`, BSR crons 4–6h→12h.
  The scraper idle-sleeps between the 12h crawls (Serverless) — "shut down" in
  Railway is usually idle, not a crash. The Wire does **not** need the scraper
  (only Radar/trends/BSR do).
- **Item table bloat** from Amazon URL dedup failure — fixed by `/dp/<ASIN>`
  canonicalization (`normalizeUrl`) + `dedup-amazon.ts`.

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Source shows 💀 Silent on /admin/sources | feed returns 200 but selectors match 0 | fix selectors / route via scrapling / disable |
| No new items for >4h | Worker crashed / Neon unreachable | `railway restart`; check `DIRECT_URL`; `scripts/health.ts` |
| scraper `/scrape` 500 flood + driver crashes | concurrent Chromium / tiny /dev/shm | serialized lock + `--disable-dev-shm-usage` (shipped) |
| Neon storage near limit | pg-boss job bloat / WAL history | `db-size.ts` → `db-cleanup.ts`; lower Neon history retention |
| items table growing fast | Amazon URL dedup failure | `dedup-amazon.ts`; ensure `normalizeUrl` canonicalizes |
| AI 429 / empty MiniMax response | rate limit / reasoning token exhaustion | widen retry delay; floor max_tokens |
| Telegram push not firing | Bot token / chat ID wrong | re-check `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` |
| pg SSL warning in logs | `sslmode=require` v9 deprecation | pinned to `verify-full` in queues.ts (shipped) |

## Neon CU 验证（P1 节奏修正后必做）

P1（`scheduler-tick` 1min→15min、`maintenanceIntervalMinutes` 5→15、`pollingIntervalSeconds: 300`）的目标是让 Neon 大部分时段 scale-to-zero（免费帽 100 CU-h/月）。

1. 部署后 24h 看 Neon Console → 目标 compute 的 **CU 曲线**：应出现大段 0 CU 区间；月化估算 < 100 CU-h。
2. 若仍不睡眠：用 `pg_stat_activity` 抓残余活跃源——
   ```sql
   SELECT application_name, state, count(*)
   FROM pg_stat_activity WHERE datname = current_database()
   GROUP BY 1, 2 ORDER BY 3 DESC;
   ```
   常见残余：某 worker 的 polling 未生效、pg-boss LISTEN 连接（idle 属正常，不计活跃）。
3. 功能验收：30–60min 内 `items` 表应有新抓取（源频率 4–12h，等不到属正常，看 `lastCrawledAt` 是否在 15min 粒度推进即可）；9 个 cron 由 `pgboss.schedule` 驱动，不受本改动影响。
4. 若 Neon Console 的 **autosuspend 被禁用**，先开回（默认 ~5min），否则 P1 无效。
