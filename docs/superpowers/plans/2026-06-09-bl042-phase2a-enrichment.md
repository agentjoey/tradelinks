# BL-042 Phase 2a — BSR 富集（review_count / price / rating）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans 或 subagent-driven-development，逐任务执行。Steps 用 `- [ ]` 跟踪。
> Backlog: BL-042 · Spec: `docs/superpowers/specs/2026-06-08-bestseller-trend-validation-design.md`
> 前序：Phase 1 已上线（`product_snapshots` 含 nullable `reviewCount/rating/price` 列，现恒 null）。

**Goal:** 让 BSR 抓取额外取 **评论数 / 价格 / 评分**，写入 `product_snapshots` 已留好的空列 —— 开启 S3(评论速度=销量代理)的数据采集。**止损式:每天不抓就永久丢失这天的评论速度基线。**

**Architecture:** 改 Python `scrapers/stealth.py` 抽取网格卡的 rating/review/price **原始文本** → 进 `rawContent`;TS 侧纯函数解析成数值 → 复用 Phase 1 的 `recordValidationSnapshot` 写进快照列。**先 PoC 探明网格卡到底有什么**,再富集。

**Tech Stack:** Python(Scrapling)· TypeScript · Prisma · vitest

**范围:** 仅验证集源(`VALIDATION_SOURCE_IDS` = D33/D42/D51/D61/D32)。**不做:** S3 评分逻辑(P2b)、AI 洞察卡 / radar 改版(P2b)、S2(P2c)。

---

## Task 1: PoC — 探明 BSR 网格卡可抽字段（gate，先做）

**Files:** 无(临时脚本,跑完删)

- [ ] **Step 1: 抓一页真实 BSR 网格,dump 一张卡的 HTML**

在 `scraper-py` 下写临时脚本 `_poc_bsr.py`：

```python
from scrapling.fetchers import StealthyFetcher
StealthyFetcher.adaptive = True
page = StealthyFetcher.fetch("https://www.amazon.com/gp/bestsellers/beauty/",
    headless=True, network_idle=True, timeout=90000,
    disable_resources=True, extra_flags=["--disable-dev-shm-usage"])
cards = page.css("#gridItemRoot")
print("cards:", len(cards))
print(cards[0].html_content[:4000] if cards else "NONE")
```

Run: `.venv/bin/python _poc_bsr.py`（在 `scraper-py/` 下）

- [ ] **Step 2: 判定可抽字段 + 记录 selector**

从 dump 的 HTML 找以下三项的 selector（Amazon 常见但因品类/改版而异）：
- **rating**：星级,常见 `i[class*='a-icon-star'] .a-icon-alt::text`（文本如 "4.5 out of 5 stars"）
- **reviewCount**：评论数链接,常见 `a.a-link-normal[class*='a-size-small']::text` 或卡内 `span.a-size-small::text`（如 "1,234"）
- **price**：常见 `span[class*='p13n-sc-price']::text` 或 `.a-color-price::text`（如 "$12.99"）

**判定门**：
- 若三项都在网格卡 → 继续 Task 2（理想）。
- 若 **reviewCount 不在网格卡**(只有 rating/price) → 仍富集 rating/price;reviewCount 标记为"需 PDP 二跳"→ **停下报告**,让 Claude 决策(PDP 二跳成本高,可能改用 rating 趋势或延后)。
- 记录实测 selector(下面 Task 用)。删除 `_poc_bsr.py`。

- [ ] **Step 3: 报告 checkpoint** —— 把"三项可抽性 + 实测 selector"发出来，等 Claude 确认再进 Task 2。

---

## Task 2: 纯函数解析 review/price/rating（TDD）

**Files:**
- Create: `src/trends/parse-bsr.ts`
- Test: `test/parse-bsr.test.ts`

- [ ] **Step 1: 写失败测试**

`test/parse-bsr.test.ts`：

```typescript
import { describe, it, expect } from "vitest";
import { parseReviewCount, parsePrice, parseRating } from "../src/trends/parse-bsr";

describe("parseReviewCount", () => {
  it("strips commas / words", () => {
    expect(parseReviewCount("1,234")).toBe(1234);
    expect(parseReviewCount("12,345 ratings")).toBe(12345);
    expect(parseReviewCount("(8,901)")).toBe(8901);
  });
  it("null on junk", () => {
    expect(parseReviewCount(null)).toBeNull();
    expect(parseReviewCount("no reviews")).toBeNull();
  });
});

describe("parsePrice", () => {
  it("pulls the number from common formats", () => {
    expect(parsePrice("$12.99")).toBe(12.99);
    expect(parsePrice("$1,299.00")).toBe(1299);
    expect(parsePrice("£8.50")).toBe(8.5);
  });
  it("null on junk", () => {
    expect(parsePrice(null)).toBeNull();
    expect(parsePrice("")).toBeNull();
  });
});

describe("parseRating", () => {
  it("pulls the leading decimal", () => {
    expect(parseRating("4.5 out of 5 stars")).toBe(4.5);
    expect(parseRating("4 out of 5")).toBe(4);
  });
  it("null on junk", () => {
    expect(parseRating(null)).toBeNull();
    expect(parseRating("stars")).toBeNull();
  });
});
```

- [ ] **Step 2: 跑测试确认失败** → `pnpm vitest run test/parse-bsr.test.ts`（FAIL: 函数缺失）

- [ ] **Step 3: 实现**

`src/trends/parse-bsr.ts`：

```typescript
// BL-042 P2a — BSR 富集字段解析（DB-free 纯函数）。

/** "1,234 ratings" / "(8,901)" → 1234 / 8901；无数字 → null。 */
export function parseReviewCount(raw: string | null): number | null {
  if (!raw) return null;
  const digits = raw.replace(/,/g, "").match(/\d+/);
  return digits ? Number(digits[0]) : null;
}

/** "$1,299.00" / "£8.50" → 1299 / 8.5；无数字 → null。 */
export function parsePrice(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

/** "4.5 out of 5 stars" → 4.5；无数字 → null。 */
export function parseRating(raw: string | null): number | null {
  if (!raw) return null;
  const m = raw.match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}
```

- [ ] **Step 4: 跑测试确认通过** → PASS

- [ ] **Step 5: Commit** → `git commit -am "feat(bl042-p2a): parse review/price/rating (pure, TDD)"`

---

## Task 3: BSR 源加富集 selector

**Files:** Modify `src/config/sources.ts`

- [ ] **Step 1: 扩 scrapeSelectors 类型 + 给验证集源加 selector**

把 `scrapeSelectors?` 类型(约 sources.ts:43)扩为可选 `rating? / reviewCount? / price?`：

```typescript
  scrapeSelectors?: { item: string; title: string; link?: string; rank?: string; rating?: string; reviewCount?: string; price?: string };
```

给 BSR 源的 `scrapeSelectors` 加上 **Task 1 PoC 实测的** rating/reviewCount/price selector（示例,以 PoC 为准）：

```typescript
    scrapeSelectors: { item: "#gridItemRoot", title: "div[class*='line-clamp']", link: "a.a-link-normal[href*='/dp/']", rank: ".zg-bdg-text",
      rating: "i[class*='a-icon-star'] .a-icon-alt", reviewCount: "a[class*='a-size-small']", price: "span[class*='p13n-sc-price']" },
```

> 先给 5 个验证集源加即可(D33/D42/D51/D61/D32);稳定后再推广全 BSR。

- [ ] **Step 2: build** → `pnpm build`（tsc 通过）

- [ ] **Step 3: Commit** → `git commit -am "feat(bl042-p2a): add rating/review/price BSR selectors (validation sources)"`

---

## Task 4: scraper 抽取富集字段

**Files:** Modify `scraper-py/scrapers/stealth.py`

- [ ] **Step 1: 读取新 selector + 抽取（graceful，缺则省略）**

在 `scrape_stealth` 里，`rank_sel`/`image_sel` 之后加：

```python
    rating_sel = selectors.get("rating")
    review_sel = selectors.get("reviewCount")
    price_sel = selectors.get("price")
```

在卡循环里、`raw["image"]` 之后加：

```python
        if rating_sel:
            v = _first_text(node, rating_sel)
            if v: raw["ratingText"] = v.strip()
        if review_sel:
            v = _first_text(node, review_sel)
            if v: raw["reviewText"] = v.strip()
        if price_sel:
            v = _first_text(node, price_sel)
            if v: raw["priceText"] = v.strip()
```

（原始文本进 `rawContent`，数值解析放 TS 侧，和 `rank` 的处理一致。）

- [ ] **Step 2: 本地验证抽取**（用 Task 1 的 venv）

临时脚本调 `scrape_stealth("https://www.amazon.com/gp/bestsellers/beauty/", {<含新 selector>})`，打印前 3 张卡的 `rawContent`，确认 `ratingText/reviewText/priceText` 有值。删除临时脚本。

- [ ] **Step 3: Commit** → `git commit -am "feat(bl042-p2a): extract rating/review/price text in stealth scraper"`

---

## Task 5: ingest 写入富集列

**Files:** Modify `src/workers/ingest.ts`（`recordValidationSnapshot`）

- [ ] **Step 1: 解析并写入**

顶部 import 加 `import { parseReviewCount, parsePrice, parseRating } from "../trends/parse-bsr.js";`

在 `recordValidationSnapshot` 里，`rank` 计算之后，从 `rawContent` 取文本并解析：

```typescript
  const rc2 = rawContent as { ratingText?: string; reviewText?: string; priceText?: string } | null;
  const rating = parseRating(rc2?.ratingText ?? null);
  const reviewCount = parseReviewCount(rc2?.reviewText ?? null);
  const price = parsePrice(rc2?.priceText ?? null);
```

把 `upsertProductSnapshot({...})` 调用补上 `reviewCount, rating, price`。

- [ ] **Step 2: 扩 `SnapshotWrite` + `upsertProductSnapshot`**（`src/trends/product-snapshots.ts`）

给 `SnapshotWrite` 接口加 `reviewCount/rating/price: number | null`；在 `upsertProductSnapshot` 的 `update`/`create` 里写这三列。

- [ ] **Step 3: build + 现有测试不回归** → `pnpm build && pnpm vitest run`（全绿）

- [ ] **Step 4: Commit** → `git commit -am "feat(bl042-p2a): write review/rating/price into product_snapshots"`

---

## Task 6: 端到端验证（手动触发一源）

- [ ] **Step 1: 部署后触发一个验证集源抓取**

合并部署后(Railway 重建 worker + scraper),投一个 crawl job(参考 Phase 1 验收的 `_trigger-d33.ts`)或等自然抓取。

- [ ] **Step 2: 查快照富集列已填**

```sql
SELECT count(*) AS rows, count("reviewCount") AS w_review, count(price) AS w_price, count(rating) AS w_rating
FROM product_snapshots WHERE date = (SELECT max(date) FROM product_snapshots) AND "sourceId"='D33';
```
Expected: `w_review/w_price/w_rating` 接近 rows（多数卡有评论/价格/评分）。

- [ ] **Step 3: 确认隔日可算 review-velocity** —— 次日同源再抓 → 同 asin 第二天 `reviewCount` → `reviewDelta` 有值。

## 验收清单（P2a 完成判据）

- [ ] PoC 已确认网格卡可抽字段 + 实测 selector 落地。
- [ ] `test/parse-bsr.test.ts` 全绿；`pnpm build` + `pnpm vitest run` 全绿。
- [ ] 一次真实抓取后,`product_snapshots` 富集列(review/price/rating)多数有值。
- [ ] 隔日 `reviewDelta` 可算（S3 数据采集已启动）。

## 接 P2b / P2c（不在本计划）

- **P2b**：S3 评论速度纳入 `trendScoreV1` 评分 + §9 验证判据;evidence-bound AI 洞察卡 + /radar 改版。
- **P2c**：S2 BSR×Trends 背离(趋势轨已复活 `114f299`,但 NA/EU 覆盖待 BL-045 付费源稳)。
