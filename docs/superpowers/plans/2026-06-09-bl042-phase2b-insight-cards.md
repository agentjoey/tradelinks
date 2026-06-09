# BL-042 Phase 2b — evidence-bound AI 洞察卡（The Movers 内容引擎）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans 或 subagent-driven-development。Steps 用 `- [ ]`。
> Backlog: BL-042 · Spec: `docs/superpowers/specs/2026-06-08-bestseller-trend-validation-design.md` §7
> 复用：BL-033 写作标准(`src/ai/prompts/writing-standard.ts`)· `computeTopMovers`(`src/trends/movers.ts`)· AI 客户端(`editorClient()`,`src/ai/client.ts`)· compose 模式(system+user+json+extractJson)

**Goal:** 把一个 mover + 它的快照证据,经 AI 编辑生成**证据绑定**的结构化洞察卡(**是什么 / 为什么现在 / 趋势走向 / 卖家怎么办**)。这是 **The Movers(BL-044)旗舰内容的引擎**,也喂 BL-043 周报头条。

**Architecture:** `Mover` + `ProductHistory` → `buildMoverEvidence`(纯函数,从快照抽事实)→ 喂 `editorClient().complete`(system 复用写作标准 + Movers angle;**只用提供的证据,不得幻觉**)→ 解析成 `InsightCard` → 幂等存 `mover_insights`(供 /radar + 周报复用,不重复调 LLM)。

**Tech Stack:** TypeScript · LLM(deepseek/gemini via editorClient)· Prisma · vitest。

**范围（P2b）：** 洞察卡**生成引擎 + 持久化**。**不做(→ P2c)：** S3 评论速度纳入 `trendScoreV1` 评分 + 验证判据;/radar 改版(BL-044 包装);Wire 多维度。

**诚实预期：** P2a 评论数刚开始攒,`reviewDelta`/跨区证据仍薄 → 早期卡偏"新进+排名"。**Task 4 PoC 先验质量**,引擎先建、随数据变厚(同 radar-review 的路子)。

---

## Task 1: 证据组装 `buildMoverEvidence`（纯函数，TDD）

**Files:** `src/movers/evidence.ts` · `test/mover-evidence.test.ts`

证据 = 从 `ProductHistory`(含 P2a 的 reviewCount/rating/price)抽出喂 LLM 的结构化事实。

- [ ] **Step 1: 失败测试**

```typescript
import { describe, it, expect } from "vitest";
import { buildMoverEvidence } from "../src/movers/evidence";
import type { ProductHistory } from "../src/trends/product-signal";

const h: ProductHistory = {
  asin: "B1", region: "north_america", category: "Beauty", title: "Glow Serum", isCommodity: false,
  points: [
    { date: "2026-06-08", rank: 30, reviewCount: 1000 },
    { date: "2026-06-09", rank: 8, reviewCount: 1200 },
  ] as never,
};

describe("buildMoverEvidence", () => {
  it("extracts rank trajectory + deltas + latest review/rating/price", () => {
    const e = buildMoverEvidence(h, { spreadingTo: ["europe"] });
    expect(e.title).toBe("Glow Serum");
    expect(e.rankDelta).toBe(22);          // 30→8
    expect(e.reviewDelta).toBe(200);       // 1000→1200
    expect(e.currentRank).toBe(8);
    expect(e.rankTrajectory).toEqual([30, 8]);
    expect(e.spreadingTo).toEqual(["europe"]);
  });
  it("nulls where data is thin (single day)", () => {
    const e = buildMoverEvidence({ ...h, points: [{ date: "2026-06-09", rank: 5, reviewCount: null }] as never }, { spreadingTo: [] });
    expect(e.rankDelta).toBeNull();
    expect(e.reviewDelta).toBeNull();
    expect(e.isNewEntrant).toBe(true);
  });
});
```

- [ ] **Step 2: 跑→失败** · **Step 3: 实现**

```typescript
import { rankDelta, reviewDelta, type ProductHistory } from "../trends/product-signal.js";
import type { Region } from "../config/sources.js";

export interface MoverEvidence {
  asin: string;
  title: string;
  region: Region;
  category: string;
  rankTrajectory: number[];          // 时间序的 rank（仅有值的）
  currentRank: number | null;
  rankDelta: number | null;          // 正=爬升
  reviewDelta: number | null;        // 评论增量（销量代理）
  reviewCount: number | null;        // 最新
  rating: number | null;             // 最新
  price: number | null;              // 最新
  isNewEntrant: boolean;
  daysTracked: number;
  spreadingTo: Region[];
}

export function buildMoverEvidence(h: ProductHistory, opts: { spreadingTo: Region[] }): MoverEvidence {
  const ranked = h.points.filter((p) => p.rank != null);
  const last = h.points[h.points.length - 1];
  return {
    asin: h.asin,
    title: h.title,
    region: h.region,
    category: h.category,
    rankTrajectory: ranked.map((p) => p.rank as number),
    currentRank: ranked.length ? (ranked[ranked.length - 1]!.rank as number) : null,
    rankDelta: rankDelta(h),
    reviewDelta: reviewDelta(h),
    reviewCount: last?.reviewCount ?? null,
    rating: (last as { rating?: number | null } | undefined)?.rating ?? null,
    price: (last as { price?: number | null } | undefined)?.price ?? null,
    isNewEntrant: h.points.length === 1,
    daysTracked: new Set(h.points.map((p) => p.date)).size,
    spreadingTo: opts.spreadingTo,
  };
}
```

> 注：`SnapshotPoint`(product-signal)目前只有 `rank/reviewCount`;`rating/price` 在 `getValidationHistories` 的 points 里**也要带上**(见 Task 2 前置:扩 `SnapshotPoint` + `getValidationHistories` select rating/price)。

- [ ] **Step 4: 跑→通过** · **Step 5: Commit**

---

## Task 1.5: 让 history 带上 rating/price（前置）

**Files:** `src/trends/product-signal.ts`(`SnapshotPoint` 加 `rating?/price?`)· `src/trends/product-snapshots.ts`(`getValidationHistories` select + 填 rating/price)

- [ ] 扩 `SnapshotPoint`:`rating: number | null; price: number | null;`(可选,默认 null);`getValidationHistories` 的 `select` 加 `rating: true, price: true`,points 里填上。`buildMoverEvidence` 才取得到。build + 现有测试不回归。Commit。

## Task 2: 洞察卡 prompt + 解析（纯函数，TDD）

**Files:** `src/ai/prompts/mover-insight.ts` · `test/mover-insight-prompt.test.ts`

- [ ] **Step 1: 失败测试**(prompt 含证据数字 + 写作标准;parser 解析四段)

```typescript
import { describe, it, expect } from "vitest";
import { buildMoverInsightPrompt, parseMoverInsight } from "../src/ai/prompts/mover-insight";
import type { MoverEvidence } from "../src/movers/evidence";

const ev: MoverEvidence = {
  asin: "B1", title: "Glow Serum", region: "north_america", category: "Beauty",
  rankTrajectory: [30, 8], currentRank: 8, rankDelta: 22, reviewDelta: 200,
  reviewCount: 1200, rating: 4.6, price: 18.9, isNewEntrant: false, daysTracked: 2, spreadingTo: ["europe"],
};

describe("buildMoverInsightPrompt", () => {
  it("system carries the writing standard; user carries the evidence numbers", () => {
    const p = buildMoverInsightPrompt(ev);
    expect(p.system).toContain("ANALYTICAL DEPTH");   // from writing-standard
    expect(p.user).toContain("Glow Serum");
    expect(p.user).toContain("+22");                  // rank delta
    expect(p.user).toContain("200");                  // review delta
  });
});

describe("parseMoverInsight", () => {
  it("parses the four sections", () => {
    const c = parseMoverInsight(JSON.stringify({
      what_it_is: "A Korean glow serum", why_now: "rank +22 in a day", trajectory: "US→EU", so_what: "source now",
    }));
    expect(c.whatItIs).toContain("serum");
    expect(c.soWhat).toContain("source");
  });
});
```

- [ ] **Step 2: 跑→失败** · **Step 3: 实现**

```typescript
import { ANALYTICAL_DEPTH, HUMAN_VOICE, GROUNDING } from "./writing-standard.js";
import { extractJson } from "../json.js";
import type { MoverEvidence } from "../../movers/evidence.js";

export interface InsightCard {
  whatItIs: string;
  whyNow: string;
  trajectory: string;
  soWhat: string;
}

export function buildMoverInsightPrompt(ev: MoverEvidence): { system: string; user: string } {
  const system = `You are the lead analyst of TradeLinks. Write a SHORT insight card for ONE product that is moving on Amazon, for cross-border sellers.

${ANALYTICAL_DEPTH}

${HUMAN_VOICE}

${GROUNDING}
- 2–3 sentences per field. No headers in the values.

Respond ONLY with JSON: {"what_it_is","why_now","trajectory","so_what"}`;

  const facts: string[] = [
    `Product: ${ev.title}`,
    `Category/region: ${ev.category} · ${ev.region}`,
    ev.currentRank != null ? `Current BSR rank: #${ev.currentRank}` : "",
    ev.rankDelta != null ? `Rank change: ${ev.rankDelta >= 0 ? "+" : ""}${ev.rankDelta} (positive = climbing)` : "",
    ev.rankTrajectory.length ? `Rank trajectory: ${ev.rankTrajectory.join(" → ")}` : "",
    ev.reviewDelta != null ? `Review-count change: +${ev.reviewDelta} (sales proxy)` : "",
    ev.reviewCount != null ? `Reviews: ${ev.reviewCount}` : "",
    ev.rating != null ? `Rating: ${ev.rating}` : "",
    ev.price != null ? `Price: $${ev.price}` : "",
    ev.isNewEntrant ? "New entrant to the top list (not present a day earlier)." : "",
    ev.spreadingTo.length ? `Strong here, absent in: ${ev.spreadingTo.join(", ")} (possible diffusion target)` : "",
    `Days tracked: ${ev.daysTracked}`,
  ].filter(Boolean);
  const user = `FACTS (use only these — do not invent):\n${facts.map((f) => `- ${f}`).join("\n")}`;
  return { system, user };
}

export function parseMoverInsight(raw: string): InsightCard {
  const j = extractJson(raw) as Record<string, unknown>;
  return {
    whatItIs: String(j.what_it_is ?? ""),
    whyNow: String(j.why_now ?? ""),
    trajectory: String(j.trajectory ?? ""),
    soWhat: String(j.so_what ?? ""),
  };
}
```

- [ ] **Step 4: 跑→通过** · **Step 5: Commit**

## Task 3: 生成函数

**Files:** `src/movers/insight.ts`

- [ ] **Step 1: 实现**(同 compose 模式)

```typescript
import type { LlmClient } from "../ai/client.js";
import { buildMoverInsightPrompt, parseMoverInsight, type InsightCard } from "../ai/prompts/mover-insight.js";
import type { MoverEvidence } from "./evidence.js";

export async function generateInsight(client: LlmClient, ev: MoverEvidence): Promise<InsightCard> {
  const { system, user } = buildMoverInsightPrompt(ev);
  const res = await client.complete({ system, user, json: true, maxTokens: 700, temperature: 0.4 });
  return parseMoverInsight(res.text);
}
```

- [ ] **Step 2: build** · **Step 3: Commit**

## Task 4: PoC — 真数据跑一遍，眼看质量（checkpoint，停下报告）

**Files:** 临时脚本(跑完删)

- [ ] **Step 1:** 脚本:`computeTopMovers(6)` → 对每个取其 `ProductHistory`(getValidationHistories)→ `buildMoverEvidence` → `generateInsight(editorClient(), ev)` → 打印卡四段。
- [ ] **Step 2: 眼看判定**:卡是否**言之有物、证据绑定(不幻觉)、so-what 可变现**?数据是否够厚?
  - 好 → 进 Task 5(持久化)。
  - 薄/幻觉 → **停下报告 Claude**:调 prompt / 等数据再攒几天 / 调 maxTokens。
- [ ] **Step 3: 报告 checkpoint。**

## Task 5: 持久化 `mover_insights`（幂等）

**Files:** `prisma/schema.prisma`(+ migration 0010)· `src/movers/insight-db.ts`

- [ ] **Step 1: model**`MoverInsight`:`id, date @db.Date, asin, region, category, whatItIs, whyNow, trajectory, soWhat, sourceHash, model, createdAt`,`@@unique([date, asin])`。migration 0010 手写。
- [ ] **Step 2: db 层**:`sourceHash`(证据 sha256,同 P1 套路)→ 已存且 hash 未变则跳过(不重复调 LLM);`upsertInsight` / `getInsights(date)`。
- [ ] **Step 3: 生成 worker/脚本**:扩 `radar-review`(或新 `mover-insights-tick`):算 movers → 生成卡(仅未变的)→ 存。**gated**:无 AI key → skip。
- [ ] **Step 4: build + 测试绿 · Commit**

## Task 6: 喂 BL-043 周报（小接线）

**Files:** `src/workers/newsletter.ts`

- [ ] 周报的 `IssueMover.why` 从 `moverWhyEn`(机械)升级为**卡的 `whyNow` + `soWhat`**(若当天有 insight);无则回退 `moverWhyEn`。build + 测试。Commit。

## 验收清单（P2b）
- [ ] 纯函数(evidence/prompt/parser)TDD 全绿;`pnpm build`+`pnpm vitest run` 全绿。
- [ ] PoC 卡言之有物、证据绑定、so-what 可变现(或已就"数据薄"达成共识)。
- [ ] `mover_insights` 表 + 幂等生成上生产;一次真实跑后有当日卡。
- [ ] 周报头条用上卡的 why(有则)。

## 接 P2c / BL-044
- **P2c**：S3 评论速度纳入 `trendScoreV1` 评分 + §9 验证判据;/radar 改版按扩散阶段展示卡。
- **BL-044**：The Movers 系列把这些卡命名/成系列/上 /radar 头条 + 周报头条。
