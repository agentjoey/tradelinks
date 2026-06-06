# BL-039 (slice 1) — Curated Telegram Channel Push (Wire + Radar)

> Backlog: BL-039 · [[Backlog-待办#-now--next]]
> Status: spec for implementation (handoff to opencode; reviewed by Claude)
> Reuses: `src/push/*` (Sprint 004-T3 / 006). Related: BL-026 (subscribe entry points).

## Goal

Broadcast a small **curated** stream of the day's best **Wire alerts** and **Radar
products (爆品)** to a public **Telegram channel** — about **6–8 items/day** — completely
**separate from the admin-review chat**.

This is the first, minimal slice of BL-039 (manual/curated → later automatic → later
per-user). It ships a working public channel feed with the smallest reliable mechanism.

### In scope
- Wire alerts (only `status = published` — i.e. already passed review) and Radar products
  (bestsellers + viral-X), pushed to one public Telegram channel.
- Automatic curation + de-dup + a daily cap of 6–8.
- A dedicated channel id, send path, public render format, worker, and schedule — all
  distinct from the existing ops/review push.

### Non-goals (later)
- The Daily original briefs (slice 2).
- Per-user subscriptions / preference routing (future epic; BL-026 wires the entry points).
- Slack channel mirroring, inline approve buttons (channel posts are public, no approval).
- Editing/deleting already-posted messages.

## Separation from admin review (important)

| | Admin review (existing) | Channel push (this spec) |
|---|---|---|
| Env target | `TELEGRAM_CHAT_ID` (operator chat) | **`TELEGRAM_CHANNEL_ID`** (public channel) |
| Send fn | `telegramSend` / `pushAlertForReview` | **`sendToChannel`** (new) |
| Buttons | Approve/Reject inline keyboard | none |
| Trigger | scoring pipeline (high-urgency → review) | **`channel-push-tick`** worker (new queue) |
| Content | candidate alerts awaiting decision | already-**published** alerts + public products |
| Render | `renderTelegramText` (ops format) | **`renderChannelAlert` / `renderChannelProduct`** (public format) |

The review flow is untouched. Channel push is strictly **downstream**: it only broadcasts
items that are already public (published alerts / public product rankings).

## Architecture

```
channel-push-tick (pg-boss cron)
  └─ runChannelPush()
       1. gatherChannelCandidates()      → { alerts[], products[] }  (DB, reuse existing queries)
       2. alreadyPushedKeys(), pushedTodayCount()                    (ChannelPush table)
       3. selectChannelBatch(candidates, opts)  [PURE, tested]       → ordered items ≤ budget
       4. for each item:
            render (renderChannelAlert | renderChannelProduct) [PURE, tested]
            sendToChannel(text)                                       (Telegram Bot API)
            on "sent" → recordChannelPush(item, messageId)
```

### New / changed files

| File | Change |
|------|--------|
| `src/config/env.ts` | add `TELEGRAM_CHANNEL_ID`, `CHANNEL_PUSH_ENABLED`, `CHANNEL_PUSH_DAILY_MAX` (8), `CHANNEL_PUSH_RUN_MAX` (3), `CHANNEL_PUSH_MIN_URGENCY` (2) |
| `src/push/send.ts` | add `sendToChannel(text)` → posts to `TELEGRAM_CHANNEL_ID`, returns `{ status, messageId? }` (parse `result.message_id`). Gated: no token/channel id → `"skipped"` (dry-run log). |
| `src/push/channel-render.ts` (new) | `renderChannelAlert(a)`, `renderChannelProduct(p)` — public HTML format. PURE. |
| `src/push/channel-select.ts` (new) | `selectChannelBatch(candidates, opts)` + helpers `rankAlerts`, `rankProducts`. PURE. |
| `src/push/channel-db.ts` (new) | `gatherChannelCandidates()`, `alreadyPushedKeys()`, `pushedTodayCount()`, `recordChannelPush(item, messageId)` |
| `src/workers/channel-push.ts` (new) | `runChannelPush()`, `registerChannelPushWorker(boss)` |
| `src/config/queues.ts` (or wherever `QUEUES` lives) | add `channelPush` queue |
| scheduler (`scheduler-tick` config) | schedule `channel-push-tick` (default 3×/day, configurable) |
| `prisma/schema.prisma` + migration `0006_channel_pushes` | `ChannelPush` model |
| tests | `channel-select.test.ts`, `channel-render.test.ts` |

## Data model

```prisma
model ChannelPush {
  id        String   @id @default(cuid())
  itemType  String   // "alert" | "product"
  itemId    String   // alert.id  OR  stable product key (see below)
  channelId String   // TELEGRAM_CHANNEL_ID at push time (so changing channels re-allows)
  messageId String?  // telegram message_id, for future edit/delete
  pushedAt  DateTime @default(now())

  @@unique([itemType, itemId, channelId])
  @@index([pushedAt])
}
```

- **Stable product key**: bestseller → normalized product url (or ASIN); viral-X → the
  tweet/permalink url. `itemId = "bestseller:<key>"` / `"viral:<key>"`. Alerts → `alert.id`.
- The `@@unique` makes re-push impossible; `pushedAt` drives the daily budget.

## Selection (pure, TDD)

`selectChannelBatch(candidates, opts)`:

```ts
type CandidateAlert   = { id; title; summary; urgencyScore; category; regions; actionRequired; sourceUrls }
type CandidateProduct = { key; kind:"bestseller"|"viral"; title; platform; rank?; likes?; region?; url; imageUrl? }
type Opts = { alreadyPushed:Set<string>; pushedToday:number; dailyMax:number; runMax:number; minUrgency:number }
```

1. Drop candidates whose `itemId` is in `alreadyPushed`.
2. Drop alerts with `urgencyScore < minUrgency`.
3. Rank:
   - alerts: `urgencyScore` desc, then recency.
   - products: bestsellers by `rank` asc; viral by `likes` desc; combine via a normalized
     score so a #1 bestseller and a high-like viral interleave fairly.
4. **Blend** so a run/day isn't all one type: alternate alert / product while taking from
   the ranked lists.
5. Cap the batch at `min(runMax, dailyMax − pushedToday)`. If fewer quality candidates
   exist, **push fewer — never pad** (6 is a soft floor, 8 the hard daily cap).

Returns an ordered `ChannelItem[]`. No DB, no I/O — fully unit-tested.

## Candidate gathering (`gatherChannelCandidates`)

Reuse existing queries; no new scraping:
- **alerts**: published alerts from the last ~48h (the same data behind `/wire`).
- **bestsellers**: `getBestsellers()` (top by rank, recent).
- **viral**: `getViralX()` (top by likes, recent).

Map each into the `Candidate*` shapes with their stable `itemId`.

## Render (public format, pure)

HTML (`parse_mode=HTML`), concise, branded, no urgency decimals/no internal scores.

**Alert** (`renderChannelAlert`):
```
🚨 <b>TikTok Shop US lifts seller commission to 9%</b>
<i>Platform · NA</i>

Effective Jul 1 for non-managed shops; budget your margins now.
➤ <b>Re-check your fee assumptions before July</b>

🔗 modernretail.co
— via TradeLinks · tradelinks-mvp.vercel.app
```
Tier emoji: ≥4 🚨 / ≥2 ⚠️ / else 🔹. Include `summary` (trimmed) + `actionRequired` if present
+ first source link + brand footer (site URL from `NEXT_PUBLIC_SITE_URL`).

**Product** (`renderChannelProduct`):
```
📈 <b>Portable neck fan, bladeless</b>
<i>Amazon · BSR #1 · NA</i>

🔗 amazon.com/dp/…
— via TradeLinks Radar · tradelinks-mvp.vercel.app
```
Viral variant: `<i>X · ♥ 18.2k · trending</i>`.

`disable_web_page_preview: false` so the channel shows the link's image card. (Optional
later: `sendPhoto` with `imageUrl` for products — out of scope for slice 1.)

## Worker + schedule

- `runChannelPush()`:
  1. if `!CHANNEL_PUSH_ENABLED || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHANNEL_ID` → log + return.
  2. gather → compute `alreadyPushed` + `pushedToday` → `selectChannelBatch`.
  3. send each (≈1.5s spacing); record `ChannelPush` **only on `"sent"`** (failures retry
     next tick, unique constraint prevents doubles).
  4. log `{ posted, skipped, failed, pushedToday }`.
- **Schedule**: pg-boss cron, default **3 runs/day** (e.g. `0 2,10,16 * * *` UTC),
  configurable. Each run posts ≤ `runMax` new items, bounded by the daily budget → an
  organic "不定时" feel capped at 6–8/day. (One run/day also works; the budget logic is
  cadence-agnostic.)

## Config / env

| Key | Default | Meaning |
|-----|---------|---------|
| `TELEGRAM_CHANNEL_ID` | — (gated) | `@publicname` or `-100…`; channel the bot admins |
| `CHANNEL_PUSH_ENABLED` | `false` | master switch |
| `CHANNEL_PUSH_DAILY_MAX` | `8` | hard daily cap |
| `CHANNEL_PUSH_RUN_MAX` | `3` | max items per run (spreads across the day) |
| `CHANNEL_PUSH_MIN_URGENCY` | `2` | drop alerts below this urgency |

Reuses existing `TELEGRAM_BOT_TOKEN`. Without token+channel id → dry-run (logs the rendered
messages, sends nothing).

## Failure / idempotency / rate-limit

- Record only on confirmed `"sent"`; the `@@unique([itemType,itemId,channelId])` guards
  against concurrent/duplicate posts.
- ~1.5s spacing between messages (well under Telegram channel limits; volume is tiny).
- A failed send is simply re-attempted on the next tick (still within budget if same day).

## Testing (TDD; project convention: pure fns tested, worker/DB not unit-tested)

- `channel-select.test.ts`: filters already-pushed; drops below-min-urgency; ranks alerts &
  products; blends types; respects `runMax` and remaining daily budget; pushes fewer (not
  padded) when candidates are scarce.
- `channel-render.test.ts`: alert & product HTML — tier emoji, escaping, optional
  summary/action/link, brand footer; viral vs bestseller variant.

## Acceptance / definition of done

- [ ] With `CHANNEL_PUSH_ENABLED=true` + bot admin on a test channel + `TELEGRAM_CHANNEL_ID`
      set, a tick posts a blended batch of published alerts + products to the channel.
- [ ] No item is ever posted twice (verified via `ChannelPush` unique).
- [ ] Daily total never exceeds `CHANNEL_PUSH_DAILY_MAX`; per run ≤ `CHANNEL_PUSH_RUN_MAX`.
- [ ] Admin-review push (`TELEGRAM_CHAT_ID` flow) is unchanged.
- [ ] Without env tokens, runs are a clean dry-run (no send, logs rendered text).
- [ ] `pnpm test` green (new pure-fn tests), `pnpm lint` clean, migration applies.

## Ops runbook (human, before enabling)

1. Create the Telegram channel; add the bot as **admin** with "Post messages".
2. Get the channel id: public → `@username`; private → numeric `-100…` (e.g. via
   `getChat`/forwarding a message to `@userinfobot`).
3. Set `TELEGRAM_CHANNEL_ID` + `CHANNEL_PUSH_ENABLED=true` in the worker env (Railway).
4. Watch the first tick; tune `CHANNEL_PUSH_*` caps.

## Follow-ups (BL-039 later slices)

- Add Daily briefs to the channel.
- Event-triggered cadence (post breaking items immediately, still budget-capped).
- Per-user subscription routing + the BL-026 subscribe entry points → real backend.
- Optional `sendPhoto` for product cards; message edit/delete via stored `messageId`.
