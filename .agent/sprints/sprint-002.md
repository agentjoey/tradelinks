# Sprint 002

Goal:      AI 精筛/打分管道 + 预警分类 + 区域标签 + 去重 + 人工审核队列
Period:    2026-06-17 ~ 2026-07-01
Version:   v0.3.0
Assignee:  claude

## Tasks

### T1: DeepSeek 精筛 + 打分 Prompt [HIGH] [claude]
**Status:** 🔲 Todo
**Epic:** EP-002
**Acceptance:**
- [ ] `src/ai/scorer.ts` 实现 urgencyScore (0.0-5.0) + impactScope + recommendation 三字段输出
- [ ] Prompt 覆盖 6 个预警分类（regulatory / platform-policy / logistics / trend / industry / tip）
- [ ] 测试集：20 条已知高/低价值 item，scorer 准确率 ≥ 85%
- [ ] DeepSeek V4 Pro 每条 item token 消耗 < 800 tokens（含 prompt）

### T2: 区域 + 平台 + 品类三维标签 [HIGH] [claude]
**Status:** 🔲 Todo
**Epic:** EP-003
**Acceptance:**
- [ ] 每条 item 有 `regions[]`（6 区枚举）+ `platforms[]`（可选）+ `category`
- [ ] 多区域 item（如"欧盟+英国 VAT 变更"）正确打 `[europe]` 标签
- [ ] 标签覆盖率：从 Phase 1 源摄取的 item 中，98% 有至少一个 region 标签

### T3: 事件聚类 + 去重 v1 [HIGH] [claude]
**Status:** 🔲 Todo
**Epic:** EP-002
**Acceptance:**
- [ ] 同一事件 24h 内来自 3 个源 → 合并为 1 个 Alert，保留 `sourceUrls[]`
- [ ] trigram 相似度 > 0.75 → `isDuplicate=true`，不重复推送
- [ ] 验证：同一 Amazon 费用变更消息（来自 Marketplace Pulse + 雨果跨境 + Reddit）正确聚合

### T4: 人工审核队列（高紧急预警） [MED] [claude]
**Status:** 🔲 Todo
**Epic:** EP-003
**Acceptance:**
- [ ] urgencyScore ≥ 4 的 alert → 进入 `review_queue` 表，状态 `pending_review`
- [ ] 简单管理 UI（`/admin/review`）展示待审核 alert，支持 approve/reject/edit
- [ ] approved alert → 触发即时推送管道

## Superpowers Checkpoints
| Skill | 触发条件 | 本 Sprint |
|-------|---------|---------|
| brainstorming | Prompt 设计前 | ❌ 待触发 |
| verification-before-completion | Task Done 前 | ❌ 待触发 |
| systematic-debugging | 发现 Bug 时 | N/A |

## Sprint 回顾
**Done:** — ｜ **Deferred:** — → Sprint 003
