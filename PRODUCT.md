# Product

## Register

product

## Platform

web

## Product Purpose

TradeLinks 帮助跨境卖家判断如何进入并运营美国市场。它把分散的政府规则、平台政策、合规变化、物流信息和有限的市场信号整理成可追溯的规范化情报，再根据卖家的经营阶段、平台和商品大类提供相关性排序与行动提示。

产品不把“商品趋势”作为主承诺。政策、合规、平台规则和市场进入判断必须明确区分来源 authority、readiness、证据强度和已知缺口。

## Users

### Public seller visitor

正在评估或经营美国市场的跨境卖家。他们需要无需登录即可阅读、搜索和引用的市场、平台、政策、合规及类目事实，并能追溯每条结论的来源与生效时间。

### Authenticated seller

免费 Seller Profile 用户。Profile 保持简化：经营阶段、美国目标市场、Amazon/Shopify 平台，以及最多两个商品品类。用户需要聚焦自身情况的 Briefing、Actions 和邮件，而不是更多通用资讯。

### Administrator / editor

负责来源契约、coverage readiness、证据审核和规范化内容发布的 TradeLinks 编辑。发布记录不可原地改写；纠错通过新版本向前推进，因此审核界面必须同时显示版本差异、结构化证据、有效日期、分类置信度和行动模板状态。

## Positioning

**Evidence-backed market entry intelligence for cross-border sellers.**

- **Public Intelligence** 建立公开、可索引、可追溯的事实与判断层。
- **Private Relevance** 用 Seller Profile 过滤并排序 Briefing、Actions 与邮件。
- 后续 Plus 销售个性化、行动建议、速度与深度，目标价格 `$5–15/月`；公开事实、RSS 与基础内容保持免费。

## Phase 1 Scope

- 市场：United States。
- 平台：Amazon US、Shopify US。
- 首发公开类目：Consumer Electronics、Pet Supplies、Beauty & Personal Care、Toys & Children's Products、Home & Kitchen、Apparel & Accessories。
- Public 页面必须为 SEO、RSS 和未来广告变现保留性能空间，但 Google Ads 不属于当前开发范围。
- 跨境开店/运营 Agent 属于 Phase 2，不进入 Phase 1。

## Promise Boundaries

- `MONITORED` 或 `VERIFIED` coverage 才能支撑公开解释。
- `VERIFIED` 结论必须具有已审核的 `PRIMARY_OFFICIAL` 证据。
- 行动建议必须同时具备 Verified evidence 与已审核 action template。
- Amazon 商品需求/BSR 在当前阶段最多是 `EXPERIMENTAL`，不能表述为保证销量、确定机会或完整市场覆盖。
- source 不可用时必须显示降级、已知缺口或拒绝原因，不能用模型补造事实。

## Current Delivery State — 2026-07-28

Phase 1 Foundation 已开发并由独立 reviewer 接受：taxonomy、source contracts、collection runs、canonicalization、immutable publication、coverage readiness 与 legacy backfill 均已完成。Draft PR 为 [#3](https://github.com/agentjoey/tradelinks/pull/3)。

Foundation 已部署到受 Vercel Deployment Protection 保护的 staging Preview，Neon staging schema 已迁移；legacy backfill 在 staging 仅 dry-run、未 apply。Public Intelligence 与 Private Relevance 尚未切换，production 未部署。现有 Wire/Radar/Daily 公开体验继续服务线上流量，直到后续公开产品计划通过迁移、SEO、性能和连续 7 天稳定性门禁。

## Design Principles

- **Evidence before action**：证据、readiness、已知缺口和后果在行动控制附近可见。
- **Public facts, private relevance**：公开事实可搜索、可引用；登录只用于相关性与分发，不把基础事实锁进付费墙。
- **Persisted or unavailable, never invented**：只显示已持久化字段；旧数据缺失时明确显示 unavailable。
- **Forward-only correction**：发布历史不可改写；纠错创建新版本并保留旧版本。
- **Quiet intelligence desk**：高密度、克制、精确，不使用娱乐化 feed 或装饰性 AI 视觉。
- **Accessible by default**：WCAG AA、键盘可操作、明确焦点、reduced-motion、暗色与亮色主题、响应式布局。
