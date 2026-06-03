# Sprint 002

Goal:      预警评分与生成（Stage-2）——processed items → urgency 评分 → alerts 表，含审核队列后端
Period:    2026-06-03 ~ (Sprint 001 提前完成，顺延)
Version:   v0.3.0
Assignee:  claude

> 重新 scope：原计划的 T2(区域/平台/品类标签) 与 T3(去重聚类) 已在 Sprint 001
> T4/T5 提前完成。本 Sprint 聚焦 Stage-2 评分 + Alert 生成 + 审核队列后端。
> 评分用 MiniMax 推理模型（ADR-005 `scoringClient()`）；审核 UI 延至 Sprint 003(需 Next.js)。

## Tasks

### T1: Stage-2 urgency 评分 [HIGH] [claude]
**Status:** ✅ Done
**Epic:** EP-002
**Acceptance:**
- [x] `src/ai/prompts/score.ts`（v1）输出 `urgencyScore`(0-5) + `impactScope` + `recommendation`（schema 容忍越界 + clamp）
- [x] `src/ai/stage2.ts` 编排（DB 无关，注入 LlmClient）用 `scoringClient()`（MiniMax 推理）
- [x] 单测 ai-stage2.test.ts：golden set 高>低、parse 健壮（clamp/fenced/缺字段）
- [x] **真实验证** verify-score.ts：de minimis→5、GPSR→4、photo tips→1，impact/action 具体准确

### T2: Alert 生成管道 [HIGH] [claude]
**Status:** ✅ Done
**Epic:** EP-003
**Acceptance:**
- [x] 新增 `score-queue`；processor 处理完(非 duplicate) → 入 score-queue
- [x] `scoring.ts` worker：Stage-2 评分 → 写 item urgencyScore/impactScope/recommendation → `upsertAlertForItem`
- [x] 聚类合并：`alerts/db.ts` 同 cluster 合并 `sourceUrls[]` + 取 max urgency（不重复建 alert）
- [x] 状态路由 `alerts/route.ts`：urgency≥4 → `pending_review`，否则 `published`；`pushTier` 备 Sprint 004
- [x] 单测 alert-route.test.ts（状态路由 + pushTier 分桶）
- [x] **真实验证** verify-alert.ts：de minimis(5)→pending_review、tips(1)→published

### T3: 审核队列后端 [MED] [claude]
**Status:** ✅ Done
**Epic:** EP-003
**Acceptance:**
- [x] `scripts/review.ts` + `src/alerts/review.ts`：list / approve / reject `pending_review`
- [x] approve → `published`(+publishedAt+reviewedBy)；reject → `rejected`（推送 Sprint 004 接）
- [x] **真实验证**：列出 de minimis 待审 → approve → 队列清空、状态翻转

### T-done（Sprint 001 提前完成，记录）
- 区域/平台/品类标签 → Sprint 001 T4（categorize）✅
- 事件聚类 + trigram 去重 → Sprint 001 T5 ✅

## Superpowers Checkpoints
| Skill | 触发条件 | 本 Sprint |
|-------|---------|---------|
| brainstorming | 评分 prompt 设计前 | ❌ 待触发 |
| verification-before-completion | Task Done 前 | ❌ 待触发 |
| systematic-debugging | 发现 Bug 时 | N/A |

## Sprint 回顾
**Done:** — ｜ **Deferred:** — → Sprint 003
