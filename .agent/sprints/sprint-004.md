# Sprint 004

Goal:      趋势时序摄取 + 跨区扩散信号(差异化卖点) + /trends 看板 + 即时推送(gated)
Period:    2026-06-04 ~ (顺延)
Version:   v0.5.0
Assignee:  claude

> 重新 scope（现实约束）：pytrends 已验证可用(169 时序点)→ 趋势主干 = Google Trends；
> TikTok CC 已门禁(ADR/sources)→ 不做 tiktok_mention；Amazon BSR 为产品级，作二级佐证；
> Telegram/Slack 无 token → 推送逻辑建好 + gated；Phase 1.5 源扩展(原 T4)延后 Sprint 005。

## Tasks

### T1: 趋势时序摄取（Google Trends） [HIGH] [claude]
**Status:** ✅ Done（管道验证；pytrends 429 限流记为生产风险）
**Epic:** EP-004
**Acceptance:**
- [x] `src/config/keywords.ts` 12 个种子关键词 + REGION_GEO(6 区) + mature/emerging 分组
- [x] `src/trends/score.ts` 纯函数 level/slope/signalStrength + 4 单测
- [x] `src/workers/trends.ts` worker：调 Python `mode=trends` → scoreSeries → 写 `trend_snapshots`；diffusion → `trend_signals`；daily schedule 02:00 UTC
- [x] 管道验证：单次 pytrends 实测可取 169 时序点；SEA 区真实取数成功
- [!] **生产风险**：pytrends 突发被 Google 429 限流（US/GB 失败）→ 已加 8s 间隔 + 3 次退避重试；高可用需 SerpAPI/DataForSEO 付费源（记 sprint 备注）
- [x] zod datetime offset bug 修复（Python isoformat 带 +00:00）

### T2: 跨区扩散信号 v1 [HIGH] [claude]
**Status:** ✅ Done
**Epic:** EP-004
**Acceptance:**
- [x] `src/trends/diffusion.ts` 纯函数：成熟区 hot+rising、新兴区滞后(gap) → 扩散信号 + 置信度 + 5 单测
- [x] `replaceSignals` 写 `trend_signals`；真实算法在演示数据上产出 5 个直观信号(neck fan NA→LatAm/ME/SEA 71% 等)
- [x] `/trends` Radar 页：扩散信号卡(来源→目标 + 置信度 + rationale) + Rising now 进度条，沿用 Wire 视觉(已截图)
- [x] 诚实定位副标题 "Signal, not prophecy."；BSR 多源佐证记为后续增强

### T3: 即时推送（Telegram/Slack，gated） [HIGH] [claude]
**Status:** ✅ Done（逻辑+wiring 完成；真实发送 gated on token）
**Epic:** EP-005
**Acceptance:**
- [x] `src/push/render.ts` Telegram text + Slack Block Kit 渲染（纯函数 + 4 单测）
- [x] `src/push/send.ts` dispatchPush：有 token 则发，无则 dry-run/log
- [x] `approveAlert` → published 后自动 dispatchPush（CLI + 审核 UI 共用）
- [~] 真实发送验证 → gated on TELEGRAM_BOT_TOKEN / SLACK_WEBHOOK_URL

### T-deferred
- Amazon BSR rank 时序佐证（产品级→关键词映射，二级信号）→ 增强
- Phase 1.5 源扩展(SEA/ME/LatAm/ANZ 35 源) → Sprint 005

## Superpowers Checkpoints
| Skill | 触发条件 | 本 Sprint |
|-------|---------|---------|
| brainstorming | 扩散算法设计前 | 设计已在 architecture.md，按文档实现 |
| verification-before-completion | Task Done 前 | ❌ 待触发 |

## Sprint 回顾
**Done:** — ｜ **Deferred:** — → Sprint 005
