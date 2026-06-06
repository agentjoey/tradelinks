# Changelog

All notable changes to TradeLinks. Format loosely follows [Keep a Changelog];
versioning is [SemVer]. `package.json` is the canonical version; each release is
git-tagged `vX.Y.Z` via `./scripts/release.sh`.

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
