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
Sprint 001 目标：搭建数据摄取基础设施。**代码全部完成**：T1 Schema ✅、T2 爬虫框架 ✅（RSS 实测 1508 条）、T3 源接入 🔄（25 源+ingest，DB 入库待 provision）、T4 AI 粗筛/翻译 ✅、T5 去重聚类 ✅、T6 Python Scraper 骨架+Node 桥接 ✅。
**整条管道 code-complete + 单测验证（40 tests）**。**Neon dev 分支已接入并验证**：migrate deploy 成功（9 表）、pg_trgm 可用、真实 RSS 抓取→入库、trigram 去重查询均通过（scripts/verify-db.ts）。**仅剩 AI 处理(T4) 待 MiniMax key + Python 服务(T6) 待 venv/Chromium**，补齐即可端到端跑通并发 v0.2.0。
连接：DATABASE_URL=Neon pooled(channel_binding 兼容)、DIRECT_URL=direct(migrate+pg-boss)；均在 .env(gitignored)。
SPEC/PLAN：docs/specs/{data-model,crawler-contract,ai-pipeline,IMPL-PLAN-sprint-001}.md。ADR-001~004 见 Obsidian。
测试现状：`pnpm test` 40 passed / `pnpm lint` 0 error / `pnpm db:validate` ok / py_compile ok。
**基础设施已定（ADR-003/004）**：Neon(PG, pooled+direct 双 URL，并承载 pg-boss 队列) + Railway(workers) + Vercel(前端)。**已删 Redis/Upstash**——队列改用 pg-boss(纯 SQL，跑在 Neon)，组件 4→3。本地连 Neon dev 分支（无本地 PG）。**需 provision**：Neon 项目+dev分支、DeepSeek key — 到位后 T3 入库 / T5 trigram 可真验证。

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
