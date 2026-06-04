# TradeLinks — Operations Manual

> Last updated: 2026-06-05 v0.7.0

## Source health dashboard

**`/admin/sources`** is the primary health view — every source with its data flow,
cadence and a 0–100 score, worst-first. Tiers: 🟢 Healthy / 🟡 Degraded / 🔴 Unhealthy /
💀 **Silent** (active but 0 items — the "200 OK but empty" detector) / ⏸ Disabled.
A daily `source-health-tick` (02:30 UTC) snapshots health and Telegram-pings any source
newly crossing into 🔴/💀. ⚠️ `/admin/*` has no auth yet — add before exposing.

## Ops scripts

```bash
pnpm tsx scripts/health.ts          # pipeline alive? (worker heartbeat / items / scrapling)
pnpm tsx scripts/db-size.ts         # storage breakdown by relation (catches bloat)
pnpm tsx scripts/db-cleanup.ts      # purge finished pg-boss jobs + VACUUM (safe, re-runnable)
pnpm tsx scripts/dedup-amazon.ts    # one-off: collapse Amazon dup items by /dp/<ASIN>
# items ingested last 24h, by source:
psql "$DATABASE_URL" -c "SELECT \"sourceId\", count(*) FROM items WHERE \"crawledAt\" > now()-'24h'::interval GROUP BY 1 ORDER BY 2 DESC;"
```

## Alert Monitoring

- High-urgency alerts (score ≥ 4) that haven't been published after 30min → manual review queue
- Dedup false-positive rate should be <5% — check weekly with `pnpm ops:dedup-report`

## Cost Monitoring

- LLM target: <$15/week (≈$60/month)
- If DeepSeek cost spikes: check for crawl loop bug or runaway retries in pg-boss
- **Neon compute (ADR-004):** queue lives in Postgres now (pg-boss), and the
  `scheduler-tick` polls every minute → Neon never scales to zero while workers run.
  Monitor compute-hours; the pg-boss poll interval can be widened if cost is an issue.
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
