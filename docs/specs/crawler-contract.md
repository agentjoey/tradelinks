# SPEC: Crawler Contract

> Version: 1.0 | 2026-06-03 | Owner: Sprint 001 T2 + T6
> Defines adapter interface, queue schemas, Node↔Python contract, blocked-detection.
> Architecture: ADR-002 (polyglot — TS for rss/fetch, Python Scrapling for anti-bot).

## 1. Queues (pg-boss on Neon Postgres — ADR-004, no Redis)

| Queue | Producer | Consumer | Purpose |
|-------|----------|----------|---------|
| `crawl-queue` | scheduler (cron) | TS crawler worker | dispatch a source crawl |
| `scrape-queue` | TS crawler worker | Python Scrapling service | hard/anti-bot sources |
| `ingest-queue` | TS worker + Python svc | TS ingest worker | normalized items → DB |
| `process-queue` | ingest worker | AI processor (Sprint 002) | filter/translate/score |

## 2. Job Payloads

### `crawl-queue` job
```ts
interface CrawlJob {
  sourceId: string;        // -> sources.id
  url: string;
  adapter: "rss" | "fetch" | "scrapling";
  attempt?: number;        // for blocked re-route bookkeeping
}
```

### `scrape-queue` job (Node → Python)
```ts
interface ScrapeJob {
  sourceId: string;
  url: string;
  mode: "stealth" | "trends"; // stealth=StealthyFetcher, trends=pytrends
  selectors?: Record<string,string>; // optional CSS hints; Python self-heals
  trendsKeywords?: string[];  // when mode=trends
  geo?: string;               // when mode=trends, region code
}
```

### `ingest-queue` job (both producers → same schema)
```ts
interface IngestJob {
  sourceId: string;
  items: RawItem[];
}
interface RawItem {
  url: string;
  title: string;
  publishedAt?: string;   // ISO 8601; ingest defaults to now() if absent
  rawContent?: unknown;   // adapter-specific payload
  lang?: string;          // detected/known source language
}
```

> **Contract invariant:** TS adapters and the Python service MUST both emit
> `IngestJob` with identical `RawItem` shape. Downstream code never knows
> which adapter produced an item.

## 3. TS Adapter Interface

```ts
interface CrawlResult {
  ok: boolean;
  blocked: boolean;        // 200 but bot-wall (see §5)
  items: RawItem[];
  error?: string;
}
interface SourceAdapter {
  readonly kind: "rss" | "fetch";
  crawl(job: CrawlJob): Promise<CrawlResult>;
}
```

- `RssAdapter`: parse via `rss-parser`. Maps `<item>` → RawItem.
- `FetchAdapter`: `fetch()` + `cheerio`. Per-source CSS config in `sources.ts`.
- On `blocked: true` → worker enqueues a `scrape-queue` job (mode=stealth) and
  marks the original crawl as deferred (does NOT count as a hard failure).

## 4. Python Scraper Service (T6)

- FastAPI app `scraper-py/`, also a pg-boss consumer of `scrape-queue` (Postgres).
- `POST /scrape` (sync, for debugging) and queue consumer (production path).
- Uses Scrapling `StealthyFetcher(solve_cloudflare=True)` + adaptive mode
  (Smart Element Tracking, auto-save) so selectors self-heal on redesign.
- `mode=trends` → pytrends; returns RawItem[] where each item is a keyword
  snapshot (rawContent carries the numeric series).
- On success → produces `ingest-queue` job (same IngestJob schema).
- On failure/block → writes `scrape_failures` log; does NOT loop back to TS.

## 5. Blocked Detection (TS, before declaring success)

A HTTP 200 is treated as **blocked** (not a real failure, do NOT naive-retry) when ANY:
- body length < 512 bytes AND contains none of the expected selectors
- body matches `/cf-browser-verification|cf-challenge|Just a moment|Checking your browser/i`
- body matches `/captcha|g-recaptcha|hcaptcha|turnstile/i`
- `<title>` matches `/access denied|attention required/i`

Action: set item-source `blocked`, route to `scrape-queue mode=stealth`.

## 6. Retry & Circuit Breaker

| Condition | Behavior |
|-----------|----------|
| network error / 5xx / timeout (30s) | pg-boss retry ×3, exp backoff (retryDelay=2s, retryBackoff) |
| 200 blocked | no retry; route to scrape-queue |
| 3× hard failure in a row | `sources.consecutiveFailures++`; ≥5 → mark `isActive=false` + ops alert |
| success | reset `consecutiveFailures=0`, set `lastOkAt` |

## 7. Politeness

- Per-domain politeness via scheduler fan-out + jitter (pg-boss has no group key; serialize same-host by spacing crawl dispatch).
- Random 1–4s jitter between requests to same host.
- Respect `frequencyCron` per source (no tighter polling).
- TS fetch sends realistic browser headers (UA, Accept-Language).
- `/api/img-proxy?u=` rewrites X/Twitter & blocked media (Vercel edge).
