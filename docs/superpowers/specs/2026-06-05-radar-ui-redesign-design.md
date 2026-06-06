# Radar UI redesign — design spec

> Date: 2026-06-05 · Status: approved (brainstorm) · Scope: `/trends` (Radar) only
> Backlog: BL-009 (shipped) — see Obsidian `P026-TradeLinks/Backlog-待办`.

## Goal

The Radar (`/trends`) should feel like a real analytics surface ("data energy"),
while the Wire (`/`) keeps its editorial identity. The whole app stays **one
product**: the Radar adopts analytics layout patterns *inside the existing dark +
amber shell* (no palette divergence, no SaaS-blue theme).

Decided directions (from brainstorm):
- **Wire = unchanged** (editorial: Fraunces serif + amber + dark).
- **Radar = analytics energy**, **visual/layout only** using data we have today.
  Rank **movement (▲▼)**, per-product sparklines, and a "Top movers" section are
  **deferred** — they need rank history we don't capture yet.

## Non-goals (explicit)

- No rank-history table / daily rank snapshots in this iteration (deferred path A).
- No ▲▼ movement, per-product trajectory sparklines, or "Top movers" yet.
- No changes to the Wire, Desk, or auth.
- No new color palette — reuse existing tokens (`ink`/`surface`/`paper`/`signal`
  amber/`calm`/`line`/`muted`/`faint`).

## Layout (top → bottom)

1. **Header** — existing editorial eyebrow + serif title + sub (unchanged shell).
2. **KPI strip** — 4 stat tiles: Products tracked · Regions · Category feeds ·
   Diffusion signals. The Regions tile carries a tiny region-mix sparkline (bars).
3. **Region filter chips** — `All` + one per region, each with a count. Instant
   client-side filter (already implemented in `BestsellersBoard`).
4. **Bestsellers board** — per category (within the selected region): a category
   header (name + `top N` + regions covered), then a **3-column image-card grid**,
   **top 12 by rank**. Card = thumbnail + rank badge + 2–3-line name + `BSR #N ·
   REGION`. (Cards already enlarged + top-12 capped — keep.)
5. **Cross-region diffusion** — existing `trend_signals` restyled as analytics
   cards (origin region badge → spreading-to + confidence). This is the genuine
   "movement" data we already produce (trends-tick).

**Removed:** the plain "rising now" keyword list (sparse, pytrends-429-prone).
Data stays in `trend_snapshots`; the list can return later if wanted.

## Components & data

| Piece | Source | Status |
|---|---|---|
| KPI numbers | new `getRadarKpis()` in `src/trends/db.ts` — count bestseller items, distinct regions, active bestseller source count, `trend_signals` count | new (small count queries) |
| Region chip counts + region-mix sparkline | derived client-side from `getBestsellers()` rows (already returns `region`) | exists |
| Bestsellers cards | `getBestsellers()` (region × category, rank, image, title, url) | exists |
| Diffusion cards | `getTrendsView().signals` | exists (restyle only) |

- `app/trends/page.tsx` (server): fetch `getRadarKpis()` + `getTrendsView()` +
  `getBestsellers()`; render header, KPI strip, `<BestsellersBoard>`, diffusion cards.
- `app/trends/BestsellersBoard.tsx` (client): region chips + category groups +
  cards (keep; minor: ensure region-mix data available for the KPI sparkline, or
  compute KPI region mix server-side and pass in).
- New small presentational pieces: KPI tile, diffusion card — can live inline in
  `page.tsx` or a tiny `app/trends/RadarKpis.tsx`. Keep server-rendered where no
  interactivity is needed.

## Visual treatment

- Tiles/cards: `bg-surface` + `border-line`, rounded; numbers in `font-display`
  (Fraunces), labels in `ticker` (mono, uppercase, `text-faint`).
- Accent = existing `signal` amber for emphasis/sparkline bars; `calm` for region
  badges. No new colors.
- Keep spacing generous; section labels in the existing `ticker` style.

## Testing / acceptance

- `pnpm lint` + `pnpm build` clean; `/trends` renders.
- KPI numbers come from real queries (not hardcoded); match DB counts.
- Region filter switches the visible categories/cards instantly; counts correct.
- Cards show real Amazon images + rank; long titles clamp (no raw long string).
- Diffusion cards render existing signals (empty-state if none).
- Wire (`/`) visually unchanged.

## Follow-up (separate spec)

Path A — daily `bsr_snapshot` (rank per product per day) to unlock ▲▼ movement,
per-product sparklines, and a "Top movers" section on the Radar.
