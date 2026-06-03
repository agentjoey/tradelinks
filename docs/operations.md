# TradeLinks — Operations Manual

> Last updated: 2026-06-03 v0.1.0

## Daily Health Checks

```bash
# Check worker is running
railway logs --service worker --tail 50

# Check crawl queue depth (should be near 0 most of the time)
pnpm worker:queue-stats

# Check LLM cost this week
pnpm ops:llm-cost-report

# Check items ingested last 24h
psql $DATABASE_URL -c "SELECT source_id, count(*) FROM items WHERE crawled_at > now()-'24h'::interval GROUP BY source_id ORDER BY count DESC;"
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

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| No new items for >4h | Worker crashed / Neon unreachable | `railway restart --service worker`; check DIRECT_URL |
| 403 on playwright sources | IP blocked | Rotate proxy / reduce frequency |
| DeepSeek 429 | Rate limit hit | Widen pg-boss poll/retry delay; reduce work batchSize |
| Telegram push not firing | Bot token expired or chat ID wrong | Re-check `TELEGRAM_BOT_TOKEN` env var |
