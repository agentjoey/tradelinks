---
name: daily-patrol
description: Run the daily TradeLinks source & content inspection (信号源/内容巡检) and write the report. Use when asked to do the daily patrol, 巡检, source/content health review, or "复盘昨天的信号源和内容".
---

# Daily Patrol — 信号源 & 内容巡检

Produce the standing daily inspection report for TradeLinks from live production
data. The heavy lifting is one script; your job is to **run it, judge the
numbers against the rules below, and synthesise a tight report** — not to dump
raw output.

## Steps

1. **Run the patrol script** from the repo root (`~/Playground/Codex/tradelinks-mvp`):
   ```bash
   pnpm patrol            # yesterday (D-1 UTC) — the default
   pnpm patrol 2026-06-10 # a specific UTC day
   ```
   It is read-only (hits the production Neon DB; local `.env` already points at
   prod). Always exits 0. If it fails, the DB env or `pnpm install` is the
   first suspect.

2. **Read the structured output** — eight sections: source health, items,
   alerts, daily notes, 爆品轨 (snapshots + movers), 趋势轨, distribution,
   subscribers.

3. **Judge it against the rules below**, then **write the report** in the format
   shown. Lead with a one-line health verdict (绿灯/黄灯/红灯). Keep the whole
   thing scannable — tables and short lines, no walls of text.

4. **Offer to save** the report to Obsidian
   `Brain#2/.../P026-TradeLinks/research/patrol-<date>.md` for the record.

## Interpretation rules (what is normal vs. a problem)

**Source health**
- `FAILING (consecutiveFailures>=3)` → **P1, always flag** with source ids.
- `SILENT active sources`: if `lastOk` is today/yesterday these are low-frequency
  feeds that just didn't emit in the window — **not alarming, mention in one
  line**. Only flag a silent source whose `lastOk` is several days stale.
- `INACTIVE` list is mostly intentional (X/social paused via `X_ENABLED=false`,
  un-built adapters). Two standing gaps worth naming when present:
  - EU first-party regulatory off — `B04` EU Official Journal, `B05` EUR-Lex
    GPSR/REACH, `B07` German LUCID. Their absence is a main driver of the NA skew.
  - Chinese content off — `F09` 雨果跨境, `F10` 亿邦动力 (the "缺少中文内容直接接入" gap).

**Alerts**
- `NA share > ~60%` → **flag region skew** (target is broader coverage). Tie it
  back to which first-party regional sources are inactive.
- `weak summary > 0` → flag (pipeline quality regression).
- `possible low-quality` list: single-product recall titles (ACCC) are expected
  — they're already excluded from the home hero. Anything else product-like in
  a non-trend category is worth a look.
- `urgency>=4` count near 0 is normal on a quiet day; note what the top story is.

**爆品轨 (snapshots + movers)**
- Healthy day: ~150+ snapshots across the tracked region|category cells, 4+
  consecutive `recent snapshot dates`.
- `enrichment`: reviewCount/rating should be ~100%. `price` is JS-lazy and
  flaky — **~75–85% is expected**, only flag if it drops well below.
- `movers ... with reviewDelta`: this is the maturing signal. Was 0 while
  review enrichment was <2 days old; as it climbs, reviewDelta becomes the
  primary signal and mover scores spread out. Report the trend, not just the count.
- Low mover scores (0–0.2) with mostly ±1–3 rank moves = thin signal, normal
  early in a tracking window. Don't over-claim hot products that aren't there.

**趋势轨 (Google Trends)**
- Known gap: NA/EU/SEA frequently 429-rate-limited on the free tier; ME usually
  gets through. Sparse `recent trend dates` is the **BL-045** (paid Trends
  source) issue — flag as a standing P1, don't re-diagnose each day.

**Distribution / subscribers** — informational; note pushes count and confirmed
subscriber count.

## Report format

```markdown
# 信号源 & 内容巡检报告 · <DATE>

> 数据窗口 <DATE> 00:00–23:59 UTC / 生产库实测

## 总览
<one-line 绿/黄/红 verdict + the 1–2 things that actually matter today>

## 1. 信号源        <table: configured/active/fired, failing, silent, notable inactive>
## 2. 内容产出      <alerts by cat/region + NA share, daily notes, quality flags>
## 3. 爆品轨        <snapshots, enrichment %, movers + reviewDelta trend>
## 4. 趋势轨        <coverage + BL-045 status>
## 5. 分发          <pushes, subscribers>

## 问题清单(按优先级)
| P | 问题 | 状态/建议 |

**一句话**: <what needs a human decision vs. what self-resolves>
```

## Notes
- Date math is UTC. "昨天" = D-1 UTC; the script defaults to it.
- This is inspection only. For pipeline liveness (is the worker alive right now?)
  use `scripts/health.ts`, not this.
- Don't edit production data during a patrol. Read, judge, report.
