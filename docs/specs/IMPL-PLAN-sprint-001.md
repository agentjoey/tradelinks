# IMPL PLAN: Sprint 001

> Version: 1.0 | 2026-06-03 | Goal: data ingestion infra running end-to-end
> Reads against SPECs: data-model.md, crawler-contract.md, ai-pipeline.md

## Build order (dependency-driven)

```
Scaffold ─► T1 schema ─► T2 TS crawler ─┬─► T3 sources + ingest ─► T4 AI Stage1 ─► T5 dedup
                                        └─► T6 Python scraper svc (parallel, after contract)
```

## 0. Project Scaffold

- pnpm workspace, single package (Next.js comes Sprint 003; Sprint 001 is worker-only).
- TypeScript strict, ESM, `tsx` for running workers in dev.
- Deps: `prisma @prisma/client`, `pg-boss cron-parser`, `rss-parser`, `cheerio`,
  `zod` (validate job payloads + env), `pino` (logging), `vitest`.
- Scripts: `dev`, `worker`, `worker:run-once`, `db:migrate`, `db:gen`,
  `db:studio`, `test`, `lint`.
- `.env.example` with DATABASE_URL / DIRECT_URL / DEEPSEEK_API_KEY / QWEN_API_KEY.
- `src/` layout:
  ```
  src/
    config/       env.ts, sources.ts
    db/           client.ts
    queue/        queues.ts (pg-boss defs), schemas.ts (zod)
    workers/      scheduler.ts, crawler.ts, ingest.ts, processor.ts
    adapters/     rss.ts, fetch.ts, blocked.ts
    ai/           client.ts, prompts/*, prefilter.ts, translate.ts, categorize.ts
    lib/          logger.ts, hash.ts
  ```

## T1 — Postgres Schema  (no live DB locally)
1. `prisma/schema.prisma` per data-model.md (enums + 9 models).
2. `pnpm db:gen` → Prisma Client generates (no DB needed).
3. `prisma migrate diff --from-empty --to-schema-datamodel ... --script`
   → write `prisma/migrations/0001_init/migration.sql` offline.
4. Append `prisma/migrations/0002_trgm/migration.sql` with pg_trgm + GIN indexes.
5. **Acceptance proof:** `pnpm db:gen` ok + `prisma validate` ok + migration SQL files exist.
   (Real `migrate deploy` deferred to Railway — documented in deployment.md.)

## T2 — TS Crawler Framework
1. `queue/queues.ts`: define crawl/scrape/ingest/process queues (pg-boss, DIRECT_URL).
2. `queue/schemas.ts`: zod schemas for CrawlJob/ScrapeJob/IngestJob/RawItem.
3. `adapters/rss.ts` (rss-parser), `adapters/fetch.ts` (fetch+cheerio).
4. `adapters/blocked.ts`: blocked-detection per crawler-contract §5.
5. `workers/crawler.ts`: consume crawl-queue → adapter → on blocked route to
   scrape-queue → else enqueue ingest-queue. Retry/backoff/circuit-breaker §6.
6. `workers/scheduler.ts`: read active sources, register repeatable jobs by cron.
7. **Acceptance proof:** unit test feeds a fake RSS fixture → ingest job emitted;
   a captcha-HTML fixture → `blocked=true` → scrape-queue job emitted.

## T3 — Phase 1 Sources + Ingest
1. `config/sources.ts`: 25 S1 sources from docs/specs/sources.md (typed objects).
2. `workers/ingest.ts`: consume ingest-queue → upsert items (url unique) → status=raw.
3. `/api/img-proxy` deferred to Sprint 003 (needs Next.js); stub note only.
4. **Acceptance proof:** `worker:run-once --source=F01` (Marketplace Pulse RSS) →
   real rows in `items` (verified via a sqlite/json sink in test, or Railway).

## T4 — AI Stage 1 (DeepSeek)
1. `ai/client.ts`: DeepSeek + Qwen clients, token-usage logging.
2. `ai/prompts/*`: prefilter / translate / categorize (versioned headers).
3. `workers/processor.ts`: consume process-queue → 1.1 filter → 1.2 translate →
   1.3 categorize+tag → status=processed.
4. **Acceptance proof:** 20-item fixture set, ≥85% keep/drop accuracy, ≥98%
   region coverage, token log printed; cost extrapolation < ¥100/7d.

## T5 — Dedup / Clustering v1
1. URL exact (already enforced by unique in T3).
2. Title trigram > 0.75 in 24h → isDuplicate (raw SQL `similarity()`).
3. Grey-zone (0.5–0.75) → LLM cluster-judge → cluster merge.
4. **Acceptance proof:** 3-source same-event fixture → 1 cluster, 3 sourceUrls.

## Testing strategy (no DB/Redis locally)
- Pure logic (adapters, blocked-detection, prompt builders, region rules) →
  vitest unit tests with fixtures. **These are the Sprint 001 acceptance proofs.**
- DB/Redis integration → gated behind `TEST_INTEGRATION=1`, run on Railway later.
- Network crawls → recorded fixtures (no live hits in CI).

## Out of scope (Sprint 001)
- Next.js site, push, auth, Stripe, trends time-series, scoring → later sprints.
- `/api/img-proxy` implementation (stub; Sprint 003).
- Python service full build is T6; Sprint 001 delivers contract + minimal
  FastAPI skeleton that can stealth-fetch one source.

## Definition of Done (Sprint → v0.2.0)
- All T1–T6 acceptance checkboxes ticked with command output.
- `pnpm test` green. `pnpm db:gen` + `prisma validate` green.
- README quickstart updated. `./scripts/release.sh minor`.
