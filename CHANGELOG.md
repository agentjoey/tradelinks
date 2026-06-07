# Changelog

All notable changes to TradeLinks. Format loosely follows [Keep a Changelog];
versioning is [SemVer]. `package.json` is the canonical version; each release is
git-tagged `vX.Y.Z` via `./scripts/release.sh`.

## [0.12.0] — 2026-06-08

### Added
- **Multilingual content — Chinese (`/zh`) site (BL-041, Phases 1+2)** — TradeLinks goes
  from "Chinese UI + English content" to a genuinely multilingual, **crawlable** Chinese
  surface. English stays unprefixed at the root; Chinese lives under `/zh` ("as-needed
  prefix"): a Next.js **middleware** resolves the locale from the path, rewrites `/zh/*`
  to the underlying route, and injects `x-tl-lang`/`x-tl-path` so `getLang()` reads the
  locale from the request (cookie demoted). Every page emits `hreflang`/`canonical`
  (`en`/`zh-Hans`/`x-default`) + `og:locale`; `sitemap.ts` lists the `/zh` routes.
- **Translated Wire alerts (P1)** — a generic `Translation` table (migration `0007`,
  keyed `alert:<id>`/`bestseller:<url>`/… for N languages) + a `translate-content-tick`
  worker translates published alerts to `zh` via DeepSeek with a cross-border **glossary**,
  idempotent through a `sourceHash`. The read layer overlays `zh` fields with per-field
  English fallback on the home + `/wire`. Pure logic (`localeFromPath`/`stripLocale`/
  `addLocale`/`alternatesFor`, `glossaryBlock`, `sourceHashOf`, `applyAlertTranslation`,
  alert-translation parser) is unit-tested (TDD).
- **Chinese Daily Notes (P2)** — each published English note is translated
  (structure-preserving, glossary-bound) then run through the existing **reviewer** pass to
  de-AI/localize, and persisted as its own `(date, "zh", kind)` row with an
  **English-sibling-derived slug** (descriptive, unique, stable). `/zh/daily` +
  `/zh/daily/<slug>` are crawlable; per-note `hreflang` pairs en↔zh by the **sibling slug**
  (not a naive path swap); the home Daily section uses the active language with English
  fallback; the sitemap lists `zh` slugs.

### Changed
- **Locale-aware navigation** — internal `<Link>`s (global nav, logo, "See all", teasers,
  load-earlier, daily cards, back link) are locale-prefixed so navigating inside `/zh`
  stays in Chinese chrome; `MainNav` active-state compares locale-independently.

### Ops
- Translation is gated by **`TRANSLATE_ENABLED`** (off = zero LLM cost); production Chinese
  content requires `TRANSLATE_ENABLED=true` on the Railway worker (+ `DEEPSEEK_API_KEY`).
  `TRANSLATE_TARGET_LANGS` (default `zh`), `TRANSLATE_LOOKBACK_DAYS`, `TRANSLATE_MAX_PER_RUN`
  bound cost. **Phase 3** (Radar product / X-topic lazy translation) is not yet built.

## [0.11.0] — 2026-06-07

### Changed
- **Editorial Home v2 — mining-technology layout (BL-026)** — `/` reworked into a wider
  editorial front: a top cluster of **lead hero** (top-scored story, image-forward; falls
  back to the latest Daily note) + **2 secondary highlights** + a live **Latest** rail
  (Wire + Radar + X, chronological), then **visually distinct** sections — Wire
  *featured + list*, Radar *#1 leader + grid*, **Hot on X** discussion cards, and Daily
  Insight — with the standalone Earlier feed folded into each. Container widened
  `max-w-[64rem]→[88rem]`; "The Daily" → "Daily Insight". New pure selectors
  `pickHero`/`buildLatest` (TDD); `createdAt` exposed on X rows; removed `BreakingStrip`,
  `EarlierFeed`, `StreamBand`.

### Added
- **Hot on X on the home page** — the X hot-topics track (`getHotTopicsX`) now has a
  front-page home (was `/trends`-only).

### Fixed
- **Google News source resolution (BL-040 ③)** — `news.google.com/rss/articles/CBMi…`
  redirect links are resolved to the real publisher URL via Google's `batchexecute`
  endpoint at ingest, so `url`/`urlHash`, the tap target, and og:image all come from the
  article instead of the generic Google News "G" logo (also filtered in `ogimage` as a
  fallback). `scripts/backfill-gnews.ts` repaired 54/54 existing published alerts.
- **channelId normalization (BL-040 ②)** — `resolveChannelId` maps `@username` → numeric
  chat id (getChat) for stable dedup keys; `alreadyPushedKeys`/`pushedTodayCount` accept a
  union so the one-time switch doesn't re-push items recorded under the old key.

## [0.10.0] — 2026-06-07

### Added
- **Editorial Home redesign (BL-026)** — `/` is now an editorial front door: a breaking
  strip (top urgency≥4 alert) → masthead positioning → **Today at a glance** three streams
  (Wire / Radar / Daily, image-forward top cards with source/platform labels) → a
  filterable, date-bucketed **Earlier** feed → a dismissible bottom subscribe bar.
- Scalable top nav + **account cluster** (Upgrade · Alerts · avatar → Profile/Billing/
  Settings) — entry points for future SaaS surfaces; admin links out of public nav.
- Wire moved to `/wire`; secondary pages keep a **timeline** design (Daily now
  date-bucketed). Dual-mode alert cards (image card / compact row — no fake images).
  Pure `pickBreaking`/`topAlerts`/`cardMode` with tests. English surface is zero-Chinese.

### Changed
- **Channel posts are now news cards (BL-040)** — `sendPhoto` big image + source (bold
  link) / headline / summary / action, replacing the plain-text format. Raw image →
  img-proxy → text fallback; alert candidates now carry `imageUrl`.
- Channel candidate recency uses `createdAt` so Wire alerts (publishedAt mostly null)
  reach the channel; long titles clamped.

## [0.9.0] — 2026-06-07

### Added
- **Curated Telegram channel push (BL-039 slice 1)** — a `channel-push-tick` worker
  (3×/day, 02/10/16 UTC) posts a blended, de-duped batch of published Wire alerts +
  Radar bestseller/viral products to a public Telegram channel, **separate** from the
  admin-review push (`sendToChannel` → `TELEGRAM_CHANNEL_ID`; review keeps
  `TELEGRAM_CHAT_ID`). Daily cap 8 / run cap 3, never padded.
- `ChannelPush` dedup table (migration `0006_channel_pushes`); pure `channel-select`
  (rank/blend/budget) + `channel-render` (public HTML) with 44 unit tests.
- Config: `TELEGRAM_CHANNEL_ID`, `CHANNEL_PUSH_ENABLED`, `CHANNEL_PUSH_DAILY_MAX`,
  `CHANNEL_PUSH_RUN_MAX`, `CHANNEL_PUSH_MIN_URGENCY`. Gated: no token/channel → dry-run.
- `scripts/channel-dryrun.ts` — read-only preview of the next batch (no send).

### Fixed
- Channel candidate window uses `createdAt` (most published alerts have a null
  `publishedAt`) so Wire alerts actually reach the channel.
- Clamp over-long product/alert titles in channel posts.

## [0.8.0] — 2026-06-06

### Added
- **Daily Note (BL-027)** — one original editorial article per day, the SEO content asset.
  Two-role pipeline: **editor** (`gemini-3.5-flash`, Flex tier) writes depth → **reviewer**
  (`deepseek-v4-flash`) fact-checks against the source set and de-AIs the prose. Two kinds —
  `brief` (policy) + `roundup` (viral-product) — each with its own prompt + quality gate;
  a rich day yields both.
- `/daily` + `/daily/[slug]` crawlable pages with `NewsArticle` JSON-LD, canonical, OpenGraph;
  new `app/sitemap.ts` + `app/robots.ts`; dependency-free markdown renderer; nav entry.
- `daily-note-tick` worker @ 03:30 UTC; `DAILY_NOTE_AUTOPUBLISH` (default on),
  `DAILY_NOTE_MIN_ITEMS`. Prisma `DailyNote` model + migration `0005_daily_notes`.
- **X curated-accounts track (BL-036)** — poll 18 verified high-signal account timelines
  (incremental `start_time` cursor, `X_ACCOUNTS_MAX_READS=200`), storing tweet text
  (BL-035 substrate). `resolveUserIds` / `fetchUserTimeline` / `fetchAccountsTweets`.
- AI client: `editorClient()` / `reviewerClient()`, Gemini via OpenAI-compat
  (`reasoning_effort:none`, Flex `service_tier`), configurable request timeouts.
- Scripts: `bench-daily-note`, `daily-note-pipeline`, `daily-note-seed`, `x-accounts-probe`,
  `x-run-once`, `x-report`.

### Changed
- X (Twitter) source enabled in production (`X_ENABLED`); 2 search tracks + accounts track.

### Fixed
- `extractJson` hardened: balanced-brace extraction + repair of trailing braces and raw
  control characters inside strings (LLM/Gemini-Flex quirks).
- Batch tweet extraction (25/call) so large account pulls can't overflow `maxTokens` and
  truncate the JSON response.

## [0.7.0] — 2026-06-05

### Added
- Source-health monitoring: `/admin/sources` dashboard (0–100 score, daily snapshots,
  regression → Telegram alerts); `source_health_snapshots` (migration 0004).
- Admin auth (ADR-006): Neon Auth / Better Auth + Google OAuth + `ADMIN_EMAILS` allowlist.
- GA4 analytics behind a cookie-consent gate + custom click events.
- X viral-products source (Radar-only) and ME/LatAm/SEA coverage via Google News RSS.
- Radar UI redesign — analytics layout (KPI strip + diffusion cards).

### Changed
- Ops hardening: serial scraper, pg-boss short retention (storage 325MB→29MB), BSR 12h
  off-peak; Wire content rebalance (regulatory 61%→48%, logistics/platform up).

## Earlier

v0.2.0 – v0.6.0 are git-tagged; see `git tag` and `.agent/sprints/` for sprint history
(crawler + AI pipeline + Next.js web + trends/diffusion + push).

[Keep a Changelog]: https://keepachangelog.com/
[SemVer]: https://semver.org/
