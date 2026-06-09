# BL-043 — 邮件订阅 + 每周跨境简报 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans 或 subagent-driven-development。Steps 用 `- [ ]` 跟踪。
> Backlog: BL-043 · Spec: `docs/superpowers/specs/2026-06-09-bl043-newsletter-design.md`
> **ops 硬前置(开工前)**:在 Resend 验证发信域名 + 配 SPF/DKIM,`FROM_EMAIL` 设为线上域(如 `brief@tradelinks.agentjoey.ai`),否则进垃圾箱。

**Goal:** 站内双重确认邮件订阅 + 每周一英文简报(Movers 为主 + 政策预警),自建 `Subscriber` 名单,Resend 发信。**指标 = confirmed 订阅数。**

**Architecture:** Prisma `Subscriber`(自管名单)→ Next route handlers(订阅/确认/退订)→ Resend 发信(`src/email/resend.ts`,无 key 跳过)→ `composeWeeklyIssue`(纯函数,复用 `app/lib/digest.ts` 政策段 + BL-042 `getValidationHistories` Movers 段)→ `newsletter-tick` worker 周一群发。

**Tech Stack:** Next 14 route handlers · Prisma/Neon · Resend · pg-boss · vitest。
**复用:** `app/lib/digest.ts`(`buildDigest`/`renderDigestText`)· BL-042 `getValidationHistories`+`product-signal` · 路由 bot-UA gate(见 `app/api/public/alerts/route.ts`)。

---

## Task 1: `Subscriber` 模型 + migration 0009

**Files:** `prisma/schema.prisma` · `prisma/migrations/0009_subscribers/migration.sql`

- [ ] **Step 1: model**

```prisma
model Subscriber {
  id             String    @id @default(cuid())
  email          String    @unique
  status         String    @default("pending")  // pending|confirmed|unsubscribed
  lang           String    @default("en")
  confirmToken   String    @unique
  unsubToken     String    @unique
  createdAt      DateTime  @default(now())
  confirmedAt    DateTime?
  unsubscribedAt DateTime?

  @@index([status])
  @@map("subscribers")
}
```

- [ ] **Step 2: migration SQL**（`0009_subscribers/migration.sql`）—— 建表 + 3 个唯一索引(email/confirmToken/unsubToken) + status 索引,照 `0008` 风格手写。
- [ ] **Step 3:** `pnpm prisma generate && pnpm prisma migrate deploy`（⚠️ 单环境=直写生产;additive、prod-safe）。
- [ ] **Step 4: Commit** `feat(bl043): subscribers table (migration 0009)`

## Task 2: 纯函数 — token + 邮箱归一化/校验（TDD）

**Files:** `src/email/subscriber-util.ts` · `test/subscriber-util.test.ts`

- [ ] **Step 1: 失败测试**

```typescript
import { describe, it, expect } from "vitest";
import { normalizeEmail, isValidEmail, newToken } from "../src/email/subscriber-util";

describe("normalizeEmail", () => {
  it("lowercases + trims", () => {
    expect(normalizeEmail("  Joey@Example.COM ")).toBe("joey@example.com");
  });
});
describe("isValidEmail", () => {
  it("accepts valid, rejects junk", () => {
    expect(isValidEmail("a@b.co")).toBe(true);
    expect(isValidEmail("nope")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
  });
});
describe("newToken", () => {
  it("url-safe, >=32 chars, unique", () => {
    const a = newToken(), b = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: 跑→失败** → `pnpm vitest run test/subscriber-util.test.ts`
- [ ] **Step 3: 实现**

```typescript
import { randomBytes } from "node:crypto";

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
export function newToken(): string {
  return randomBytes(24).toString("base64url");
}
```

- [ ] **Step 4: 跑→通过** · **Step 5: Commit** `feat(bl043): subscriber util (token + email, pure, TDD)`

## Task 3: `composeWeeklyIssue`（纯函数，TDD）

**Files:** `src/email/compose-issue.ts` · `test/compose-issue.test.ts`

- [ ] **Step 1: 失败测试**(覆盖:有 movers / 仅政策 / 都空;退订链接必现)

```typescript
import { describe, it, expect } from "vitest";
import { composeWeeklyIssue, type IssueInput } from "../src/email/compose-issue";

const base: IssueInput = {
  date: "2026-06-09",
  unsubUrl: "https://x/unsub?token=T",
  movers: [{ title: "Mascara X", region: "north_america", category: "Beauty", why: "rank +22 · now #8" }],
  policyText: "POLICY\n- de minimis ends Monday",
};

describe("composeWeeklyIssue", () => {
  it("renders subject + movers + policy + unsub link", () => {
    const o = composeWeeklyIssue(base);
    expect(o.subject).toContain("Mascara X"); // headline = top mover
    expect(o.text).toContain("Mascara X");
    expect(o.text).toContain("de minimis");
    expect(o.html).toContain("https://x/unsub?token=T");
    expect(o.text).toContain("https://x/unsub?token=T");
  });
  it("no movers → policy-only, still valid", () => {
    const o = composeWeeklyIssue({ ...base, movers: [] });
    expect(o.text).toContain("de minimis");
    expect(o.subject.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 跑→失败**
- [ ] **Step 3: 实现**（`IssueInput { date, unsubUrl, movers:{title,region,category,why}[], policyText:string }` → `{subject, html, text}`;subject 取头条 mover 或政策首条;html 是极简内联模板 + 退订链接;text 是纯文本版 + 退订 URL）。**政策段** `policyText` 由调用处用 `renderDigestText(buildDigest(alerts,date))` 生成传入(本纯函数不碰 DB)。
- [ ] **Step 4: 跑→通过** · **Step 5: Commit** `feat(bl043): composeWeeklyIssue (pure, TDD)`

## Task 4: Resend 发信封装

**Files:** `src/email/resend.ts`

- [ ] **Step 1: 实现**（gated）

```typescript
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<"sent" | "skipped" | "failed"> {
  if (!env.RESEND_API_KEY) return "skipped";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: env.FROM_EMAIL, to, subject, html, text }),
    });
    if (!res.ok) { logger.warn({ to, status: res.status }, "resend send failed"); return "failed"; }
    return "sent";
  } catch (e) { logger.warn({ to, err: String(e) }, "resend send error"); return "failed"; }
}
```

- [ ] **Step 2: build** · **Step 3: Commit** `feat(bl043): resend send wrapper (gated)`

## Task 5: Subscriber DB 层

**Files:** `src/email/subscriber-db.ts`

- [ ] **Step 1: 实现** `upsertPending(email,lang)`(归一化+校验,生成 token,存 pending;已 confirmed 直接返回该行不动)、`confirmByToken(token)`、`unsubscribeByToken(token)`、`listConfirmed()`。无单测(DB 层),照 `src/trends/product-snapshots.ts` 风格。
- [ ] **Step 2: build** · **Step 3: Commit** `feat(bl043): subscriber db layer`

## Task 6: 三个 route handlers

**Files:** `app/api/subscribe/route.ts`(POST)· `app/api/subscribe/confirm/route.ts`(GET)· `app/api/unsubscribe/route.ts`(GET)

- [ ] **Step 1:** 照 `app/api/public/alerts/route.ts` 模板(`dynamic="force-dynamic"`、`runtime="nodejs"`、bot-UA gate)。
  - `POST /api/subscribe` `{email}` → `upsertPending` → `sendEmail(确认信,含 confirm 链接)` → 返回 `{ok:true}`(**不泄露是否已存在**,防枚举);基础 IP 限流(可用内存计数器,够 MVP)。
  - `GET /api/subscribe/confirm?token=` → `confirmByToken` → `sendEmail(欢迎信)` → 302 到成功页。
  - `GET /api/unsubscribe?token=` → `unsubscribeByToken` → 302 到退订确认页。
  - 确认/退订链接 base 用 `NEXT_PUBLIC_SITE_URL`(见 `src/push/send.ts`)。
- [ ] **Step 2: build** · **Step 3: 手测三条路由**(curl POST + 点 confirm/unsub) · **Step 4: Commit** `feat(bl043): subscribe/confirm/unsubscribe routes`

## Task 7: `<SubscribeForm/>` + 放置 + 结果页

**Files:** `app/components/SubscribeForm.tsx`(client)· 放置进首页 hero/Daily·Wire 文末 · `app/subscribe/page.tsx` · confirm/unsub 结果页

- [ ] **Step 1:** client 组件:email 输入 → `POST /api/subscribe` → 成功态("Check your inbox to confirm")。英文文案。
- [ ] **Step 2:** 放置:首页 hero 区、`app/daily/[slug]` 与 `/wire` 文末、独立 `/subscribe` 页;confirm/unsub 结果页。
- [ ] **Step 3: build** · **Step 4: Commit** `feat(bl043): SubscribeForm + placements + result pages`

## Task 8: `newsletter-tick` worker + 排程

**Files:** `src/queue/queues.ts`(加 `newsletter:"newsletter-tick"`)· `src/workers/newsletter.ts` · `src/workers/index.ts`

- [ ] **Step 1: worker** `runWeeklyNewsletter()`:取 Movers(BL-042 `getValidationHistories`+`product-signal`,同 radar-review 的算法,取 top N)→ 取本周 published 政策预警(regulatory/platform_policy/logistics)→ `policyText = renderDigestText(buildDigest(alerts,date))` → 对每个 confirmed 订阅 `composeWeeklyIssue({...,unsubUrl})` + `sendEmail`。log 发送量。无 confirmed / 无 Resend key → no-op。
- [ ] **Step 2: 注册 + 排程** `await boss.schedule(QUEUES.newsletter, "0 14 * * 1")`(周一 14:00 UTC,贴美欧工作周开端)。
- [ ] **Step 3: build** · **Step 4: Commit** `feat(bl043): weekly newsletter worker (Mon 14:00 UTC)`

## Task 9: 手动脚本 + 验收

**Files:** `scripts/newsletter-once.ts`

- [ ] **Step 1:** 脚本调 `runWeeklyNewsletter()`(本地直连生产)。先给自己 email 走一遍订阅→确认,再跑脚本确认收到。
- [ ] **Step 2: 验收清单**:
  - migration 0009 上生产;订阅→确认→收到欢迎信;退订生效。
  - `test/subscriber-util.test.ts` + `test/compose-issue.test.ts` 全绿;`pnpm build`+`pnpm vitest run` 全绿。
  - `newsletter-once.ts` 发出一封含 Movers + 政策 + 退订链接的简报。
  - worker 排程周一 14:00 UTC。

## 依赖 / 时序
- **内容头条依赖 BL-042 快照积累**(Movers);基建(Task 1–8)**可现在全建**,首封正式 issue 等数据够。周节奏正好对上。
- ⚠️ **Resend 域名验证是开工硬前置**(见顶部)。
