# X (Twitter) viral-products signal — design spec

> Date: 2026-06-05 · Status: approved (brainstorm) · Scope: new Radar input + ingestion
> Budget: **≤ $0.50 / day** (hard cap).

## Goal & business value

Surface **viral consumer products** mentioned on X as an *early* trend signal — social
virality often precedes Amazon BSR movement, which fits the Radar's "trend prediction /
early window" thesis. Shown on the **Radar only** (not the Wire — social is noisy).

## Auth & cost model

- **Auth:** app-only **Bearer token** → `GET /2/tweets/search/recent` (last 7 days).
  Stored as **`X_BEARER_TOKEN`** env on the Railway worker. Never committed. (The
  consumer key/secret in the user's file are not needed for app-only read.)
- **Cost:** X is pay-per-use (~**$0.005 / post read**). Cap reads at **≤100/day** →
  worst case **$0.50/day**. Enforced by config, not trust.
- **Tier unknown** — the cap protects us regardless (pay-per-use or legacy Basic).

## Acquisition strategy (cost-capped)

- **Frequency:** once/day (a new `x-tick` pg-boss schedule, e.g. `0 3 * * *`).
- **Queries (high-signal, few):** e.g.
  - `#TikTokMadeMeBuyIt -is:retweet lang:en`
  - `(#AmazonFinds OR #amazonmusthaves) -is:retweet lang:en`
  - `("viral product" OR "tiktok made me buy") -is:retweet lang:en`
- **Read budget:** total returned tweets/day **≤ `X_MAX_READS_PER_DAY` (default 100)**.
  e.g. 3 queries × `max_results` ~33, accumulate and stop at the cap.
- **Quality pre-filter (before AI):** keep only tweets with `public_metrics.like_count ≥ 50`
  (request `tweet.fields=public_metrics,created_at,entities`, `expansions=attachments.media_keys`,
  `media.fields=preview_image_url,url`). Cuts noise → fewer AI calls.
- **Kill-switch:** `X_ENABLED` (default off until token set); 429 → back off, stop for the day.

## Processing & storage

- **AI extraction** (reuse existing client): tweet text → `{ product/brand, category,
  why_viral (1 line), link, engagement }`. Drop non-product tweets. Cluster by product.
- **Storage (reuse items, Radar-only — like bestsellers):** upsert into `items` under a
  new source **`X01` "Social — X viral"**, `status=processed`, `category=trend`,
  `platforms=["x"]`, `title=product/brand`, `imageUrl=tweet media (if any)`,
  `rawContent={ tweetId, author, likes, retweets, why_viral, query }`. **Not** enqueued to
  the AI/Wire pipeline (same fork as bestsellers).
- One row per product (url = tweet permalink or a product key); upsert refreshes engagement.

## Display (Radar)

- New **"Viral on X"** section on `/trends`: analytics cards — product/brand + a
  representative tweet snippet + engagement (♥/🔁) + link out. Reuse the card styling.
- Also feed these products as an **early input to diffusion** later (optional, separate).

## Components

| Piece | File | Notes |
|---|---|---|
| X client | `src/social/x.ts` | bearer search/recent, query+cap+filter; pure-ish (mock fetch in tests) |
| extraction | `src/social/extract.ts` | tweet → product via AI; testable with a stub |
| worker | `src/workers/x.ts` + `QUEUES.x = "x-tick"` | daily; budget-bounded; upsert items |
| query | `getViralX()` in `src/social/db.ts` or trends/db | recent X01 items for the Radar |
| UI | `app/trends` "Viral on X" section | cards |
| env | `X_BEARER_TOKEN`, `X_ENABLED`, `X_MAX_READS_PER_DAY=100` | Railway |

## Testing / acceptance

- `pnpm lint` + `pnpm build` clean; unit tests (DB-free) for the **read-cap accounting**
  and the **engagement pre-filter** (mock fetch).
- A one-off dry-run script (`scripts/x-probe.ts`) hits `search/recent` with the bearer for
  ONE small query to confirm auth + parse (and reveal the tier/limits) before enabling.
- With `X_ENABLED=false` the worker no-ops (zero cost). Wire unaffected.

## Non-goals

- No filtered-stream, no historical/full-archive search, no posting.
- Not shown on the Wire. No TikTok / Exploding Topics here (backlog).

## Follow-ups (backlog)

- TikTok viral signal via a paid 3rd-party API (EnsembleData/TikAPI) — same Radar layer.
- Exploding Topics $99/mo API as a curated trend input.
