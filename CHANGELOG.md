# Changelog

All notable changes to TradeLinks. Format loosely follows [Keep a Changelog];
versioning is [SemVer]. `package.json` is the canonical version; each release is
git-tagged `vX.Y.Z` via `./scripts/release.sh`.

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
