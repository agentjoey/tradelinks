# BL-042 爆品趋势验证 — Phase 1 实施计划（产品快照底座 + 速度/跨区信号 + 每日 Telegram 复盘）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> Backlog: BL-042 · Spec: `docs/superpowers/specs/2026-06-08-bestseller-trend-validation-design.md`

**Goal:** 从今天起为 Beauty+Toys 畅销品**逐日存历史快照**，用纯函数算出"在动的品"（排名速度 + 新进 + 跨区差异 − 常青惩罚），每天一条 Telegram 复盘供人工滚动校验。

**Architecture:** 复用现有 BSR 抓取/ingest 管线，在 ingest 的 bestseller 分支**额外写一行 `product_snapshots`**（按 `(date, asin, region)` 幂等）。信号全是 DB-free 纯函数（TDD）。一个 `radar-review-tick` worker 每日读快照→算分→`telegramSend()` 发到 admin chat。**不改 Python 抓取、不接 AI、不动 /radar**（那些是 Phase 2）。

**Tech Stack:** TypeScript / Prisma + Neon Postgres / pg-boss / vitest。

**范围锁定（Phase 1）：** 仅 `VALIDATION_SOURCE_IDS = {D33,D42,D51,D61 (Beauty×4区), D32 (Toys US)}`。
**显式不做（→ Phase 2/3）：** review_count/price 富集（改 `scraper-py`）、S3 评论速度、evidence-bound AI 洞察卡、/radar 改版、S2（BSR×Trends，需先复活 06-04 起哑掉的趋势轨 = 并行 P0，单独计划）。

**诚实预期：** ASIN 跨区重叠低（实测 27/661），故 Phase 1 真正发力的是**区内排名速度（Day 2+）+ 新进榜 + 常青压制**；跨区差异（S1）按 ASIN 精确匹配，命中即报、不强求。Day-1 复盘偏薄（多为"新进 + 过滤常青"），随每日积累变厚。

---

## File Structure

| 文件 | 职责 | 新建/改 |
|---|---|---|
| `prisma/schema.prisma` | `ProductSnapshot` model | 改 |
| `prisma/migrations/0008_product_snapshots/migration.sql` | 建表 SQL（additive，prod-safe） | 新建 |
| `src/config/sources.ts` | 导出 `VALIDATION_SOURCE_IDS` | 改 |
| `src/trends/product-signal.ts` | **纯函数**：extractAsin / isCommodity / rankDelta / reviewDelta / crossRegionDivergence / evergreenPenalty / trendScoreV1 / renderRadarReview | 新建 |
| `src/trends/product-snapshots.ts` | DB 层：upsertProductSnapshot / getValidationHistories | 新建 |
| `src/workers/ingest.ts` | bestseller 分支写快照 | 改 |
| `src/queue/queues.ts` | 加 `radarReview` 队列 | 改 |
| `src/workers/radar-review.ts` | 每日复盘 worker | 新建 |
| `src/workers/index.ts` | 注册 + 排程 worker | 改 |
| `scripts/radar-review-once.ts` | 手动跑一次（验收用） | 新建 |
| `test/product-signal.test.ts` | 纯函数测试 | 新建 |

---

## Task 1: ProductSnapshot 表 + migration

**Files:**
- Modify: `prisma/schema.prisma`（在 `TrendSnapshot` model 后插入）
- Create: `prisma/migrations/0008_product_snapshots/migration.sql`

- [ ] **Step 1: 加 Prisma model**

在 `prisma/schema.prisma` 的 `model TrendSnapshot { … }` 之后加：

```prisma
model ProductSnapshot {
  id          String   @id @default(cuid())
  date        DateTime @db.Date
  asin        String
  region      Region
  category    String                     // 真实品类标签（"Beauty"/"Toys & Games"），非 categoryHint
  rank        Int?
  reviewCount Int?                        // Phase 2 富集，Phase 1 恒 null
  rating      Float?                      // Phase 2
  price       Float?                      // Phase 2
  title       String
  imageUrl    String?
  isCommodity Boolean  @default(false)
  sourceId    String
  createdAt   DateTime @default(now())

  @@unique([date, asin, region])
  @@index([asin, date])
  @@index([region, category, date])
  @@map("product_snapshots")
}
```

- [ ] **Step 2: 写 migration SQL**

`prisma/migrations/0008_product_snapshots/migration.sql`：

```sql
-- prisma/migrations/0008_product_snapshots/migration.sql
CREATE TABLE "product_snapshots" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "asin" TEXT NOT NULL,
    "region" "Region" NOT NULL,
    "category" TEXT NOT NULL,
    "rank" INTEGER,
    "reviewCount" INTEGER,
    "rating" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "title" TEXT NOT NULL,
    "imageUrl" TEXT,
    "isCommodity" BOOLEAN NOT NULL DEFAULT false,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "product_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "product_snapshots_date_asin_region_key" ON "product_snapshots"("date", "asin", "region");
CREATE INDEX "product_snapshots_asin_date_idx" ON "product_snapshots"("asin", "date");
CREATE INDEX "product_snapshots_region_category_date_idx" ON "product_snapshots"("region", "category", "date");
```

- [ ] **Step 3: 生成 client + 应用迁移**

⚠️ **单环境 MVP：本地 `pnpm db:migrate` 直接写生产 Neon**。SQL 是纯 additive（CREATE TABLE），prod-safe；应用前核对一遍。

Run: `pnpm prisma generate && pnpm prisma migrate deploy`
Expected: `0008_product_snapshots` applied; `npx prisma db pull` 能看到表 / `pnpm build` 通过。

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/0008_product_snapshots/
git commit -m "feat(bl042): product_snapshots table (history substrate)"
```

---

## Task 2: 纯函数 `extractAsin` + `isCommodity`（TDD）

**Files:**
- Create: `src/trends/product-signal.ts`
- Test: `test/product-signal.test.ts`

- [ ] **Step 1: 写失败测试**

`test/product-signal.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { extractAsin, isCommodity } from "../src/trends/product-signal";

describe("extractAsin", () => {
  it("pulls ASIN from a /dp/ url", () => {
    expect(extractAsin("https://www.amazon.com/dp/B09L7MDNH6")).toBe("B09L7MDNH6");
  });
  it("returns null when no ASIN", () => {
    expect(extractAsin("https://www.amazon.com/gp/bestsellers/beauty/")).toBeNull();
  });
});

describe("isCommodity", () => {
  it("flags commodity titles", () => {
    expect(isCommodity("One Beat 10Ft Extension Cord with Multiple Outlets")).toBe(true);
    expect(isCommodity("Anker Surge Protector Power Strip")).toBe(true);
    expect(isCommodity("Cable Zip Ties 400 Pack")).toBe(true);
  });
  it("does not flag a normal beauty/toy product", () => {
    expect(isCommodity("L'Oreal Paris Telescopic Mascara")).toBe(false);
    expect(isCommodity("LEGO Botanical Collection Orchid")).toBe(false);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run test/product-signal.test.ts`
Expected: FAIL（`extractAsin is not a function`）。

- [ ] **Step 3: 最小实现**

`src/trends/product-signal.ts`：

```typescript
// BL-042 Phase 1 — 爆品信号纯函数（DB-free，TDD）。
import type { Region } from "../config/sources.js";

export function extractAsin(url: string): string | null {
  const m = url.match(/\/dp\/([A-Z0-9]{10})/i);
  return m ? m[1]!.toUpperCase() : null;
}

// 大宗/常青商品关键词：命中即"打标不删"（仍存排名当对照，不进精分析）。
const COMMODITY_RE =
  /\b(cable|cord|charger|battery|batteries|surge protector|power strip|zip ties?|extension cord|adapter|mount|screen protector|hdmi|usb|wire|outlet)\b/i;

export function isCommodity(title: string): boolean {
  return COMMODITY_RE.test(title);
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run test/product-signal.test.ts`
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/trends/product-signal.ts test/product-signal.test.ts
git commit -m "feat(bl042): extractAsin + commodity denylist (pure, TDD)"
```

---

## Task 3: 类型 + `rankDelta` / `reviewDelta`（TDD）

**Files:**
- Modify: `src/trends/product-signal.ts`
- Test: `test/product-signal.test.ts`

- [ ] **Step 1: 追加失败测试**

在 `test/product-signal.test.ts` 末尾追加：

```typescript
import { rankDelta, reviewDelta, type ProductHistory } from "../src/trends/product-signal";

const hist = (rank: (number | null)[], reviews: (number | null)[] = []): ProductHistory => ({
  asin: "B000",
  region: "north_america",
  category: "Beauty",
  title: "Test",
  isCommodity: false,
  points: rank.map((r, i) => ({
    date: `2026-06-0${i + 1}`,
    rank: r,
    reviewCount: reviews[i] ?? null,
  })),
});

describe("rankDelta", () => {
  it("positive = climbed (older minus newer rank)", () => {
    expect(rankDelta(hist([30, 8]))).toBe(22);
  });
  it("null when <2 ranked points", () => {
    expect(rankDelta(hist([null, 8]))).toBeNull();
    expect(rankDelta(hist([8]))).toBeNull();
  });
});

describe("reviewDelta", () => {
  it("newer minus oldest review count", () => {
    expect(reviewDelta(hist([1, 1], [1000, 1180]))).toBe(180);
  });
  it("null when reviews absent (Phase 1)", () => {
    expect(reviewDelta(hist([1, 1]))).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm vitest run test/product-signal.test.ts`
Expected: FAIL（类型/函数缺失）。

- [ ] **Step 3: 实现**

在 `src/trends/product-signal.ts` 追加：

```typescript
export interface SnapshotPoint {
  date: string; // YYYY-MM-DD，升序
  rank: number | null;
  reviewCount: number | null;
}

export interface ProductHistory {
  asin: string;
  region: Region;
  category: string;
  title: string;
  isCommodity: boolean;
  points: SnapshotPoint[]; // 按 date 升序
}

/** 排名提升 = 最早 − 最新（正 = 爬升）。需 ≥2 个有排名的点。 */
export function rankDelta(h: ProductHistory): number | null {
  const ranked = h.points.filter((p) => p.rank != null);
  if (ranked.length < 2) return null;
  const first = ranked[0]!.rank!;
  const last = ranked[ranked.length - 1]!.rank!;
  return first - last;
}

/** 评论增量 = 最新 − 最早（Phase 1 无数据 → null）。 */
export function reviewDelta(h: ProductHistory): number | null {
  const withR = h.points.filter((p) => p.reviewCount != null);
  if (withR.length < 2) return null;
  return withR[withR.length - 1]!.reviewCount! - withR[0]!.reviewCount!;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm vitest run test/product-signal.test.ts` → PASS

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(bl042): ProductHistory + rank/review delta (pure, TDD)"
```

---

## Task 4: `evergreenPenalty` + `crossRegionDivergence`（TDD）

**Files:**
- Modify: `src/trends/product-signal.ts`
- Test: `test/product-signal.test.ts`

- [ ] **Step 1: 追加失败测试**

```typescript
import { evergreenPenalty, crossRegionDivergence } from "../src/trends/product-signal";

describe("evergreenPenalty", () => {
  it("high & flat rank → strong penalty", () => {
    // 一直 top-10、几乎不动 = 常青
    expect(evergreenPenalty(hist([5, 6, 5, 4]))).toBeGreaterThan(0.5);
  });
  it("commodity flag alone → penalty 1", () => {
    const h = { ...hist([20, 19]), isCommodity: true };
    expect(evergreenPenalty(h)).toBe(1);
  });
  it("moving product → low penalty", () => {
    expect(evergreenPenalty(hist([40, 8]))).toBeLessThan(0.3);
  });
});

describe("crossRegionDivergence", () => {
  it("strong in one region, absent in another → divergence + spreadingTo", () => {
    const r = crossRegionDivergence(
      new Map([
        ["north_america", 3],
        ["europe", null],
      ]),
    );
    expect(r.score).toBeGreaterThan(0);
    expect(r.spreadingTo).toContain("europe");
  });
  it("present & similar everywhere → ~0 divergence", () => {
    const r = crossRegionDivergence(
      new Map([
        ["north_america", 5],
        ["europe", 6],
      ]),
    );
    expect(r.score).toBeLessThan(0.2);
    expect(r.spreadingTo).toEqual([]);
  });
});
```

- [ ] **Step 2: 跑测试确认失败** → `pnpm vitest run test/product-signal.test.ts`

- [ ] **Step 3: 实现**

```typescript
/**
 * 常青惩罚 ∈ [0,1]：commodity 直接 1；否则"高排名 × 低波动" → 高惩罚。
 * 需 ≥2 点才能判波动；点不足时按平均排名给保守惩罚。
 */
export function evergreenPenalty(h: ProductHistory): number {
  if (h.isCommodity) return 1;
  const ranks = h.points.map((p) => p.rank).filter((r): r is number => r != null);
  if (ranks.length === 0) return 0.5;
  const avg = ranks.reduce((a, b) => a + b, 0) / ranks.length;
  const highRank = Math.max(0, 1 - avg / 50); // top-1 → ~1，rank-50+ → 0
  if (ranks.length < 2) return 0.5 * highRank;
  const spread = Math.max(...ranks) - Math.min(...ranks);
  const flat = Math.max(0, 1 - spread / 20); // 波动≥20 名 → 0，几乎不动 → 1
  return Number((highRank * flat).toFixed(3));
}

export interface CrossRegion {
  score: number; // 0..1
  spreadingTo: Region[]; // 该品强势但缺席/弱势的区
}

/**
 * 跨区差异（S1）：传入 同一 ASIN 在各区的当前 rank（null = 不在榜）。
 * 某区强势(rank 小)、另区缺席 → 扩散预测（spreadingTo）。
 */
export function crossRegionDivergence(byRegion: Map<Region, number | null>): CrossRegion {
  const entries = [...byRegion.entries()];
  const present = entries.filter(([, r]) => r != null) as [Region, number][];
  if (present.length === 0) return { score: 0, spreadingTo: [] };
  const best = Math.min(...present.map(([, r]) => r));
  const strong = best <= 20; // 在某区进了前 20 才算"火"
  const spreadingTo = entries.filter(([, r]) => r == null).map(([reg]) => reg);
  if (!strong || spreadingTo.length === 0) {
    // 都在榜：差异 = 排名分散度（小）
    const ranks = present.map(([, r]) => r);
    const spread = Math.max(...ranks) - Math.min(...ranks);
    return { score: Math.min(0.19, spread / 200), spreadingTo: [] };
  }
  const strength = 1 - best / 20; // best=1 → ~1
  return { score: Number((0.4 + 0.6 * strength).toFixed(3)), spreadingTo };
}
```

- [ ] **Step 4: 跑测试确认通过** → PASS

- [ ] **Step 5: Commit** → `git commit -am "feat(bl042): evergreen penalty + cross-region divergence (pure, TDD)"`

---

## Task 5: `trendScoreV1` + `renderRadarReview`（TDD）

**Files:**
- Modify: `src/trends/product-signal.ts`
- Test: `test/product-signal.test.ts`

- [ ] **Step 1: 追加失败测试**

```typescript
import { trendScoreV1, renderRadarReview, type Mover } from "../src/trends/product-signal";

describe("trendScoreV1", () => {
  it("climbing non-commodity outscores flat evergreen", () => {
    const climber = trendScoreV1({ history: hist([40, 8]), isNewEntrant: false, cross: { score: 0, spreadingTo: [] } });
    const evergreen = trendScoreV1({ history: hist([5, 5, 5]), isNewEntrant: false, cross: { score: 0, spreadingTo: [] } });
    expect(climber).toBeGreaterThan(evergreen);
  });
  it("new entrant gets novelty credit", () => {
    const s = trendScoreV1({ history: hist([12]), isNewEntrant: true, cross: { score: 0, spreadingTo: [] } });
    expect(s).toBeGreaterThan(0);
  });
});

describe("renderRadarReview", () => {
  it("renders header + per-mover why lines, escapes nothing weird", () => {
    const movers: Mover[] = [
      { asin: "B1", title: "Mascara X", region: "north_america", category: "Beauty", score: 0.8,
        rankDelta: 22, reviewDelta: null, isNewEntrant: false, currentRank: 8, spreadingTo: ["europe"] },
    ];
    const txt = renderRadarReview(movers, "2026-06-09");
    expect(txt).toContain("2026-06-09");
    expect(txt).toContain("Mascara X");
    expect(txt).toContain("+22"); // 排名变化证据
  });
  it("empty → explicit 'no movers' line", () => {
    expect(renderRadarReview([], "2026-06-09")).toContain("无");
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现**

```typescript
export interface TrendScoreInput {
  history: ProductHistory;
  isNewEntrant: boolean;
  cross: CrossRegion;
}

/**
 * Trend Score v1（Phase 1 可用的信号；review 速度 Phase 2 加权）：
 * velocity(rank_delta) + novelty(new_entrant + cross-region) − evergreen_penalty。
 * 输出 ∈ 约 [0,1]，clamp。
 */
export function trendScoreV1(inp: TrendScoreInput): number {
  const rd = rankDelta(inp.history) ?? 0;
  const velocity = Math.max(0, Math.min(1, rd / 25)); // +25 名 → 满分
  const novelty = (inp.isNewEntrant ? 0.4 : 0) + inp.cross.score * 0.6;
  // 新进只有 1 个点，无从判"低波动"，不施常青惩罚（commodity 仍 1）。
  const penalty = inp.history.isCommodity ? 1 : inp.isNewEntrant ? 0 : evergreenPenalty(inp.history);
  const raw = velocity * 0.6 + novelty * 0.4 - penalty * 0.5;
  return Number(Math.max(0, Math.min(1, raw)).toFixed(3));
}

export interface Mover {
  asin: string;
  title: string;
  region: Region;
  category: string;
  score: number;
  rankDelta: number | null;
  reviewDelta: number | null;
  isNewEntrant: boolean;
  currentRank: number | null;
  spreadingTo: Region[];
}

/** 纯文本渲染每日复盘（telegramSend 用，HTML parse_mode 关闭 → 纯文本安全）。 */
export function renderRadarReview(movers: Mover[], date: string): string {
  const head = `📈 爆品复盘 ${date}（Beauty+Toys 验证）`;
  if (movers.length === 0) return `${head}\n\n今日无显著在动的品（多为新进/常青已过滤）。`;
  const lines = movers.map((m, i) => {
    const why: string[] = [];
    if (m.rankDelta != null) why.push(`排名 ${m.rankDelta >= 0 ? "+" : ""}${m.rankDelta}`);
    if (m.currentRank != null) why.push(`现#${m.currentRank}`);
    if (m.isNewEntrant) why.push("新进榜");
    if (m.reviewDelta != null) why.push(`评论 +${m.reviewDelta}`);
    if (m.spreadingTo.length) why.push(`或扩散→${m.spreadingTo.join("/")}`);
    return `${i + 1}. [${m.region}·${m.category}] ${m.title}\n   分 ${m.score} · ${why.join(" · ")}`;
  });
  return `${head}\n\n${lines.join("\n\n")}`;
}
```

- [ ] **Step 4: 跑测试确认通过** → PASS（同时 `pnpm vitest run test/product-signal.test.ts` 全绿）

- [ ] **Step 5: Commit** → `git commit -am "feat(bl042): trendScoreV1 + daily review renderer (pure, TDD)"`

---

## Task 6: `VALIDATION_SOURCE_IDS` 导出

**Files:**
- Modify: `src/config/sources.ts`（在 `BESTSELLER_SOURCE_IDS` 定义附近）

- [ ] **Step 1: 加导出**

```typescript
/** BL-042 Phase 1 验证范围：Beauty×4 区 + Toys US（仅这些源写 product_snapshots）。 */
export const VALIDATION_SOURCE_IDS = new Set(["D33", "D42", "D51", "D61", "D32"]);
```

- [ ] **Step 2: 验证 build** → `pnpm build`（tsc 通过，noUnusedLocals 无碍）

- [ ] **Step 3: Commit** → `git commit -am "feat(bl042): VALIDATION_SOURCE_IDS (Beauty x4 + Toys US)"`

---

## Task 7: DB 层 `product-snapshots.ts`（无 TDD — 纯 DB，遵循"只纯函数 TDD"）

**Files:**
- Create: `src/trends/product-snapshots.ts`

- [ ] **Step 1: 实现写入 + 查询**

参照 `src/trends/db.ts` 的 `upsertSnapshot` 与 `getBestsellers` 写法：

```typescript
// BL-042 Phase 1 — product_snapshots 写入 + 验证集历史查询。
import { prisma } from "../db/client.js";
import type { Region } from "../config/sources.js";
import { VALIDATION_SOURCE_IDS } from "../config/sources.js";
import type { ProductHistory } from "./product-signal.js";

function today(): Date {
  return new Date(new Date().toISOString().slice(0, 10)); // UTC date
}

export interface SnapshotWrite {
  asin: string;
  region: Region;
  category: string;
  rank: number | null;
  title: string;
  imageUrl: string | null;
  isCommodity: boolean;
  sourceId: string;
}

/** 幂等写当日快照（同 date+asin+region 覆盖 rank/title/image）。 */
export async function upsertProductSnapshot(s: SnapshotWrite, date = today()): Promise<void> {
  await prisma.productSnapshot.upsert({
    where: { date_asin_region: { date, asin: s.asin, region: s.region as never } },
    update: { rank: s.rank, title: s.title, imageUrl: s.imageUrl, isCommodity: s.isCommodity },
    create: {
      date,
      asin: s.asin,
      region: s.region as never,
      category: s.category,
      rank: s.rank,
      title: s.title,
      imageUrl: s.imageUrl,
      isCommodity: s.isCommodity,
      sourceId: s.sourceId,
    },
  });
}

/** 取验证集近 N 天快照，按 asin+region 聚成 ProductHistory（points 升序）。 */
export async function getValidationHistories(lookbackDays = 14): Promise<ProductHistory[]> {
  const since = new Date(Date.now() - lookbackDays * 864e5);
  const rows = await prisma.productSnapshot.findMany({
    where: { sourceId: { in: [...VALIDATION_SOURCE_IDS] }, date: { gte: since } },
    orderBy: { date: "asc" },
    select: { asin: true, region: true, category: true, title: true, isCommodity: true, rank: true, reviewCount: true, date: true },
  });
  const map = new Map<string, ProductHistory>();
  for (const r of rows) {
    const key = `${r.asin}|${r.region}`;
    let h = map.get(key);
    if (!h) {
      h = { asin: r.asin, region: r.region as Region, category: r.category, title: r.title, isCommodity: r.isCommodity, points: [] };
      map.set(key, h);
    }
    h.title = r.title; // 用最新标题
    h.points.push({ date: r.date.toISOString().slice(0, 10), rank: r.rank, reviewCount: r.reviewCount });
  }
  return [...map.values()];
}
```

- [ ] **Step 2: 验证 build** → `pnpm build`

- [ ] **Step 3: Commit** → `git commit -am "feat(bl042): product-snapshots db layer (upsert + history)"`

---

## Task 8: ingest 写快照（验证集）

**Files:**
- Modify: `src/workers/ingest.ts`

- [ ] **Step 1: 引入依赖**

顶部 import 区加：

```typescript
import { VALIDATION_SOURCE_IDS } from "../config/sources.js";
import { extractAsin, isCommodity } from "../trends/product-signal.js";
import { upsertProductSnapshot } from "../trends/product-snapshots.js";
```

- [ ] **Step 2: 抽一个写快照的小helper（放在 registerIngestWorker 之外，文件内）**

```typescript
/** BL-042: 验证集 bestseller 写当日 product_snapshot（幂等）。失败不阻塞 ingest。 */
async function recordValidationSnapshot(
  sourceId: string,
  url: string,
  title: string,
  rawContent: unknown,
  imageUrl: string | null,
): Promise<void> {
  if (!VALIDATION_SOURCE_IDS.has(sourceId)) return;
  const asin = extractAsin(url);
  if (!asin) return;
  const src = SOURCES_BY_ID.get(sourceId);
  const category = src?.name.match(/\(([^)]+)\)\s*$/)?.[1] ?? src?.name ?? sourceId;
  const region = (src?.regions[0] as string) ?? "north_america";
  const rc = rawContent as { rank?: unknown } | null;
  const m = rc?.rank != null ? String(rc.rank).match(/\d+/) : null;
  const rank = m ? Number(m[0]) : null;
  try {
    await upsertProductSnapshot({
      asin, region: region as never, category, rank, title, imageUrl, isCommodity: isCommodity(title), sourceId,
    });
  } catch (e) {
    logger.warn({ sourceId, asin, err: String(e) }, "snapshot write failed");
  }
}
```

- [ ] **Step 3: 在 bestseller 的 create 与 update 两条路径都调用**

在 `if (isBestseller) { await prisma.item.update(...) }`（existing 分支）之后、`continue` 之前加：
```typescript
            await recordValidationSnapshot(sourceId, url, raw.title, raw.rawContent ?? null, bsImage);
```
在 `const item = await prisma.item.create(...)` 之后（bestseller 也会走到这里 / create 新品时），加：
```typescript
        if (isBestseller) await recordValidationSnapshot(sourceId, url, raw.title, raw.rawContent ?? null, bsImage);
```

- [ ] **Step 4: 验证 build + 现有测试不回归**

Run: `pnpm build && pnpm vitest run`
Expected: tsc 通过；全测试绿（无新纯函数被破坏）。

- [ ] **Step 5: Commit** → `git commit -am "feat(bl042): write product_snapshots on validation bestseller ingest"`

---

## Task 9: `radar-review` 队列 + worker

**Files:**
- Modify: `src/queue/queues.ts`
- Create: `src/workers/radar-review.ts`

- [ ] **Step 1: 加队列名**

`src/queue/queues.ts` 的 `QUEUES` 对象里加一行（translate 之后）：
```typescript
  radarReview: "radar-review-tick",
```

- [ ] **Step 2: 实现 worker**

`src/workers/radar-review.ts`：

```typescript
import type PgBoss from "pg-boss";
import { QUEUES } from "../queue/queues.js";
import { sendOpsAlert } from "../push/send.js"; // → admin Telegram chat（wraps 私有 telegramSend）
import { getValidationHistories } from "../trends/product-snapshots.js";
import { trendScoreV1, crossRegionDivergence, renderRadarReview, type Mover } from "../trends/product-signal.js";
import type { Region } from "../config/sources.js";
import { logger } from "../lib/logger.js";

const TOP_N = 8;
const MIN_SCORE = 0.15;

/** 算今日 movers 并发一条 Telegram 复盘（admin chat）。可被 script 直接调用。 */
export async function runRadarReview(date = new Date().toISOString().slice(0, 10)): Promise<{ movers: number }> {
  const histories = await getValidationHistories(14);

  // 跨区：按 (category, asin) 收集各区当前 rank（取每个历史最后一个有排名的点）
  const byCatAsin = new Map<string, Map<Region, number | null>>();
  for (const h of histories) {
    const cur = [...h.points].reverse().find((p) => p.rank != null)?.rank ?? null;
    const key = `${h.category}|${h.asin}`;
    const reg = byCatAsin.get(key) ?? new Map<Region, number | null>();
    reg.set(h.region, cur);
    byCatAsin.set(key, reg);
  }

  const movers: Mover[] = [];
  for (const h of histories) {
    if (h.isCommodity) continue; // 对照样本不进复盘
    const isNewEntrant = h.points.length === 1; // 只见过一天 = 新进
    const cross = crossRegionDivergence(byCatAsin.get(`${h.category}|${h.asin}`) ?? new Map());
    const score = trendScoreV1({ history: h, isNewEntrant, cross });
    if (score < MIN_SCORE) continue;
    const ranked = h.points.filter((p) => p.rank != null);
    const currentRank = ranked.length ? ranked[ranked.length - 1]!.rank : null;
    const rd = ranked.length >= 2 ? ranked[0]!.rank! - ranked[ranked.length - 1]!.rank! : null;
    movers.push({
      asin: h.asin, title: h.title, region: h.region, category: h.category, score,
      rankDelta: rd, reviewDelta: null, isNewEntrant, currentRank, spreadingTo: cross.spreadingTo,
    });
  }

  movers.sort((a, b) => b.score - a.score);
  const top = movers.slice(0, TOP_N);
  const result = await sendOpsAlert(renderRadarReview(top, date));
  logger.info({ movers: top.length, telegram: result }, "radar review sent");
  return { movers: top.length };
}

export function registerRadarReviewWorker(boss: PgBoss) {
  return boss.work(QUEUES.radarReview, async () => {
    await runRadarReview();
  });
}
```

- [ ] **Step 3: 验证 build** → `pnpm build`

- [ ] **Step 4: Commit** → `git commit -am "feat(bl042): radar-review worker (daily movers → Telegram)"`

---

## Task 10: 注册 + 排程 worker

**Files:**
- Modify: `src/workers/index.ts`

- [ ] **Step 1: import + 注册 + 排程**

在 import 区加：
```typescript
import { registerRadarReviewWorker } from "./radar-review.js";
```
在 `await registerTranslateWorker(boss);` 之后加：
```typescript
  await registerRadarReviewWorker(boss);
```
在排程区（`await boss.schedule(QUEUES.translate, "*/15 * * * *");` 之后）加：
```typescript
  // BL-042 爆品每日复盘 13:30 UTC（在 ~12:xx 的 BSR 抓取批次之后）
  await boss.schedule(QUEUES.radarReview, "30 13 * * *");
```
并把末尾 `logger.info("workers online: …")` 串里补 ` + radar-review`。

- [ ] **Step 2: 验证 build** → `pnpm build`

- [ ] **Step 3: Commit** → `git commit -am "feat(bl042): register + schedule radar-review (13:30 UTC)"`

---

## Task 11: 手动运行脚本（验收）

**Files:**
- Create: `scripts/radar-review-once.ts`

- [ ] **Step 1: 写脚本**

参照现有 `scripts/x-run-once.ts` 等：

```typescript
// 手动跑一次爆品复盘（发到 admin Telegram）。本地 .env 直连生产（单环境）。
import { runRadarReview } from "../src/workers/radar-review.js";

const r = await runRadarReview();
console.log("RADAR_REVIEW_DONE", JSON.stringify(r));
process.exit(0);
```

- [ ] **Step 2: 跑一次**

Run: `pnpm tsx scripts/radar-review-once.ts`
Expected: 打印 `RADAR_REVIEW_DONE {"movers":N}`；Telegram admin chat 收到一条复盘（Day-1 可能 movers=0 或全是新进 —— 符合预期，因为还没有第二天的 delta）。

- [ ] **Step 3: 验证快照在累积**

Run（确认表里有验证集的当日行）：
```bash
pnpm tsx -e "import {prisma} from './src/db/client.js'; console.log(await prisma.productSnapshot.groupBy({by:['region','category'], _count:true}))"
```
Expected: 出现 Beauty(×4 区) + Toys & Games(US) 的计数行。

- [ ] **Step 4: Commit** → `git commit -am "chore(bl042): radar-review-once script + manual run"`

---

## 验收清单（Phase 1 完成判据）

- [ ] `0008_product_snapshots` 已上生产，`product_snapshots` 表存在。
- [ ] 一次真实 BSR 抓取后，验证集（Beauty×4 + Toys US）当天有快照行；隔日再抓 → 同 asin 第二行（不同 date），delta 可算。
- [ ] `test/product-signal.test.ts` 全绿；`pnpm build` + `pnpm vitest run` 全绿。
- [ ] `scripts/radar-review-once.ts` 能发出 Telegram 复盘；常青/commodity 不出现在榜上。
- [ ] worker 已排程 13:30 UTC；Railway 部署后每日自动复盘。

## 接 Phase 2（不在本计划）

- `scraper-py/scrapers/stealth.py` 富集 `reviewCount/rating/price` → 填 `product_snapshots` 对应列 → 启用 S3 评论速度 + 验证判据（§9）。
- evidence-bound AI 洞察卡（复用 editor/reviewer）+ /radar 改版（按扩散阶段分组、Insight Card）。
- 并行 P0：排查趋势轨为何 06-04 停（`scraper-py/scrapers/trends.py` / Railway / pytrends 封禁）、复活后启用 S2（BSR×Trends 背离）。
