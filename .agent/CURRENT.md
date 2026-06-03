# Current Status — TradeLinks

Version:        v0.1.0
Sprint:         001
Sprint Status:  🔄 In Progress
Last Updated:   2026-06-03 by claude-opus-4-8
Sprint File:    .agent/sprints/sprint-001.md

## Open Bugs（P0/P1 必须本 Sprint 修复）
🟢 无已知 P0/P1 bug。
- 注：F01 Marketplace Pulse 无公开 RSS（已改 fetch adapter，选择器待线上验证，非阻塞）

## Current Sprint Summary
Sprint 001 目标：搭建数据摄取基础设施。**进度**：T1 Schema ✅、T2 爬虫框架 ✅（RSS 实测 1508 条）、T3 源接入 🔄（25 源+ingest，DB 入库待 Railway）、T4 AI 粗筛/翻译 ✅（client+prompts+stage1+processor，24 单测全过，成本测算 ~¥1.8/周）。**剩余**：T5 去重聚类、T6 Python Scraper 服务。
SPEC/PLAN 文档已就绪：docs/specs/{data-model,crawler-contract,ai-pipeline,IMPL-PLAN-sprint-001}.md。
测试现状：`pnpm test` 24 passed / `pnpm lint` 0 error / `pnpm db:validate` ok。
**基础设施已定（ADR-003）**：Neon(PG, pooled+direct 双 URL) + Upstash(Redis) + Railway(workers) + Vercel(前端)。本地连 Neon dev 分支（无本地 PG）。**需 provision**：Neon 项目+dev分支、Upstash Redis、DeepSeek key — 这些到位后 T3 入库 / T5 trigram 可真验证。

## Next Sprint Candidates
- [ ] [EP-002] [HIGH] AI 精筛/打分管道（Sprint 002）
- [ ] [EP-003] [HIGH] 预警分类 + 区域标签 + Push 系统（Sprint 002）
- [ ] [EP-005] [HIGH] Next.js 网站骨架 + 时间线 feed（Sprint 003）
- [ ] [EP-006] [MED] 每日日报生成 + 邮件发送（Sprint 003）
- [ ] [EP-004] [HIGH] 趋势看板 + 跨区扩散信号 v1（Sprint 004）

## Version History（最近 5 版）
| Version | Date | Summary |
|---------|------|---------|
| v0.1.0 | 2026-06-03 | 项目立项，规范初始化，数据源清单确认 |
