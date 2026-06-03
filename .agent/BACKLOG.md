# Product Backlog — TradeLinks
> 排入 Sprint 后从此处移除。

## 🔴 HIGH

- [ ] [EP-001] [HIGH] 爬虫框架搭建（RSS fetch + Playwright + 任务队列 BullMQ）
- [ ] [EP-001] [HIGH] Postgres schema 设计（items / alerts / trends / sources / users）
- [ ] [EP-001] [HIGH] Phase 1 信息源接入（25-30 个，见 docs/specs/sources.md S1 列）
- [ ] [EP-002] [HIGH] DeepSeek 粗筛 + 翻译 prompt（EN/ZH/PT/ES/AR → EN）
- [ ] [EP-002] [HIGH] DeepSeek 精筛 + 打分 prompt（紧急度×影响面，0-5）
- [ ] [EP-003] [HIGH] 预警分类体系（6 类）+ 区域/平台/品类标签
- [ ] [EP-003] [HIGH] 去重 / 聚类（同一事件多源合并，trigram + embedding）
- [ ] [EP-005] [HIGH] Next.js 网站骨架（timeline feed + 区域/类别过滤）
- [ ] [EP-005] [HIGH] 即时推送（Telegram Bot + Slack Webhook，高紧急≥4）
- [ ] [EP-006] [HIGH] 每日日报生成（5段式）+ Resend 邮件发送
- [ ] [EP-004] [HIGH] 趋势时序表 + Google Trends + Amazon BSR 时序摄取
- [ ] [EP-004] [HIGH] 跨区扩散信号 v1（3源交叉 + 置信度标注）
- [ ] [EP-008] [HIGH] Auth（NextAuth v5）+ Stripe（Free/Pro/Team）

## 🟡 MED

- [ ] [EP-007] [MED] RSS Feed 输出（/feed.xml）
- [ ] [EP-007] [MED] REST API 公开端点（OpenAPI 3.1 spec）
- [ ] [EP-009] [MED] 关键词监控（用户自定义，Pro 功能，最多 3 个关键词）
- [ ] [EP-001] [MED] Phase 1.5 信息源接入（30-60 个，含 SEA/ME/LatAm/AU 二级源）
- [ ] [EP-003] [MED] 物流预警（Freightos FBX 运价异动 + 航道中断事件）
- [ ] [EP-005] [MED] 趋势看板 v1（上升品类/扩散地图）

## 🟢 LOW

- [ ] [EP-005] [LOW] 中文界面切换（ZH 输出，中国卖家市场）
- [ ] [EP-007] [LOW] Agent Skill 接入（与 AIHOT 同格式）
- [ ] [EP-009] [LOW] 关键词监控扩展（Team：20 个关键词）
- [ ] [EP-007] [LOW] WhatsApp Business 推送

## 📋 研究向（未决策）

- [ ] 是否接入 PACER 侵权预警（Phase 2 高门槛功能，需付费账号+解析）
- [ ] 是否做葡/西/阿多语言输出（Phase 2，先验证英文付费意愿）
- [ ] 趋势扩散模型是否需要专用 ML pipeline 或 LLM zero-shot 足够
- [ ] Enterprise 定价和 API 限流策略

## ✅ 已完成（按 Sprint 归档）
（项目初始化 2026-06-03）
