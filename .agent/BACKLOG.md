# Product Backlog — TradeLinks
> 排入 Sprint 后从此处移除。

## 🔴 HIGH

- [ ] [EP-001] [HIGH] 爬虫框架搭建（RSS fetch + Playwright + 任务队列 pg-boss）
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

## 🔭 外部趋势信号（2026-06-05 评估后）

- [x] [EP-004] X 社媒信号 — **已上线**（2026-06-06）：viral 爆品 + 跨境热点 2 search 轨 + **curated-accounts 第 3 轨**(18 号时间线,存推文原文),`X_ENABLED` 已开,`X_ACCOUNTS_MAX_READS=200`。后续:BL-037 账号评分、BL-038 去重/降权 → 见 Obsidian P026 backlog
- [~] [EP-006] **Daily Note 原创日报**（≠5 段式邮件日报）— **已上线**（2026-06-06,BL-027）:editor(gemini Flex)→reviewer(deepseek) 双角色,brief+roundup 两类,`/daily` 可爬页+JSON-LD+sitemap,autopublish ON。后续:BL-034 editor 检索、BL-035 料仓 → 见 Obsidian P026 backlog
- [ ] [EP-004] [MED] **TikTok 病毒商品信号** — on-hold：需付费第三方 API（EnsembleData / TikAPI，~$50–300/mo），Phase 2，待选供应商+预算（爆品真正引擎，门槛最高）
- [ ] [EP-004] [MED] **Exploding Topics 趋势话题** — on-hold：免费页仅"橱窗"（实测样本太小），价值在 **$99/mo Investor API**；待付费决策
- [x] ImportGenius / TradeKey — 已评估：ImportGenius 高价值但是独立付费"贸易流情报"模块(新数据模型，Phase2+)；TradeKey 数据质量差，**跳过**

## 📋 研究向（未决策）

- [ ] 是否接入 PACER 侵权预警（Phase 2 高门槛功能，需付费账号+解析）
- [ ] 是否做葡/西/阿多语言输出（Phase 2，先验证英文付费意愿）
- [ ] 趋势扩散模型是否需要专用 ML pipeline 或 LLM zero-shot 足够
- [ ] Enterprise 定价和 API 限流策略

## ✅ 已完成（按 Sprint 归档）
（项目初始化 2026-06-03）
