# Current Status — TradeLinks

Version:        v0.12.0
Sprint:         006 (Ops hardening + Source-health monitoring)
Sprint Status:  ✅ 全链路稳定化 + 内容再平衡 + 源监控页上线
Last Updated:   2026-07-28 by Task 8 worker/Codex (Phase 1 Foundation legacy backfill 最终验证完成，待 reviewer 接受)
Sprint File:    .agent/sprints/sprint-005.md

## Phase 1 Foundation 状态（2026-07-28，未部署）

- Prisma migration `0011_phase1_intelligence_foundation` 已在获批的非生产 Neon 隔离分支验证；未变更生产数据库、云端配置或部署。
- Legacy backfill 重复 dry-run 指纹稳定为 `7b91ebd2cf2a6179c42c7f67af964cc3ae38318e96b3a1b905a87880c7ec5332`；五项待写入计数均为 0；显式拒绝 18 行，原因均为 `SOURCE_NOT_FOUND`。
- 隔离分支 apply/replay 幂等；回填草稿保持 `EXPERIMENTAL` / `IN_REVIEW` / 非 current，证据保持 `SECONDARY_CONTEXT`。中断测试夹具已按唯一 runId 精确清理并确认五类记录零残留。
- 最终门禁：Prisma schema valid、TypeScript lint 通过、53 个测试文件 / 426 个测试通过、Next.js production build 成功。
- Public Intelligence cutover 尚未开始；旧公开页面、生产流量与部署状态均未切换。

## 🆕 本轮新增（2026-07-19）：BL-045 前端重设计（已上线 main `17aa648`，frontend-harness-workflow Tier 3 全流程）

- **BL-045 前端重设计（已合并 main，生产冒烟通过）** — 公开五页（首页/Wire/Radar/Daily/订阅）系统性提质，按 frontend-harness-workflow v3.1 走完全流程：brainstorm → spec → 双 mockup（v1 布局/token + v2 动效）→ 18 任务 SDD（每任务实现+spec/质量双审）→ 全分支终审 → Human Owner 走查 → 合并。
  - **设计系统地基**：语义 token 双层（`:root` 暗色默认 + `[data-theme="light"]` 纸感亮色，对比度全部预验证 ≥4.5:1，`faint` 3.1:1 缺陷修复）；type scale 六档（label/meta/body/lede/title/headline）+ 圆角三档；类名 codemod（text-paper→text-ink、bg-ink→bg-canvas）。
  - **主题机制**：cookie `tl-theme`（1y, SameSite=Lax）SSR 直渲 `data-theme` 无闪烁 + localStorage 兜底脚本；header 日/月切换钮（DOM 惰性初始化）。
  - **Chrome**：移动端底部 tab bar（Home/Wire/Radar/Daily，`aria-current`，safe-area 适配）；Radix More 下拉（Subscribe/Telegram/RSS，键盘全可达）；Alerts/Upgrade 指向真实 `/subscribe`；头像菜单指向 admin；skip-link；浮条层叠规则（订阅条移动端隐藏 + consent 未决时让位）。
  - **组件/状态层**：`labels.ts` 单一来源（5 份 REGION_LABEL 复制消除）；`SignalCard` 统一 5 种卡片（保留 `alert_open`/`bestseller_open`/`hot_topic_open` 埋点 + imageLayout 大图变体）；`PageHeader`/`EmptyState`/`Skeleton`；全路由 loading/error + 全站 not-found（**soft-404 修复**：`(home)` 路由组让首页有骨架且 daily 死链回真 404）；`ui.ts` 共享控件类；Filters 丢 locale bug 修复。
  - **Instrument Panel 动效**：编排式 masthead 开场（遮罩行升起 + 品牌词对焦，~1.3s 一次）+ 电报纸带 + UTC 实时钟 + 雷达扫描 glyph + 扩散弧 + 新鲜插入（服务端 isFresh，不造假轮换）+ 卡片 hover 扫描；全部 reduced-motion 降级。
  - **订阅页主题断裂修复**（浅色样式 → 语义 token）+ 表单五态（409 already 为防御性死代码，API 永远 200，已注释说明）。
  - **无 >1px 侧边色条**（impeccable 禁令）：tier 全部由 chip + 1px 细边框承载，`tierStyle.rail` 裸 hex 已删。
  - 子代理驱动 TDD，18 任务 ×（实现+双审），全分支终审（skip-link/lazy-loading 合并前修复）；**297 测试绿 / tsc/build 干净**；零 schema/env 变更；唯一新依赖 `@radix-ui/react-dropdown-menu`。
  - spec `docs/superpowers/specs/2026-07-19-bl045-frontend-redesign-design.md` · plan `…/plans/2026-07-19-bl045-frontend-redesign.md` · 验证记录 `…/verification/2026-07-19-bl045-verification.md` · mockups `design/bl045-mockup-v{1,2}.html`。
  - **后续 backlog**（终审 minors）：错误/404 文案中文化、`liveLabel` 硬编码、dead eyebrow token、toneOf 去重、段落化错误文案、cookie Secure 属性、skeleton role=status、mover 弧线上数据验证（当前 prod movers 全 `spreadingTo:[]`）、Measurement window：上线后 7 天 GA（跳出/订阅转化/移动端占比）。

## 🆕 本轮新增（2026-06-10）：BL-044 The Movers v1（爆品洞察卡持久化 + /radar 门面）

- **BL-044 The Movers v1（已合并 main `3547ce1`，第一刀切片）** — 把 BL-042 的爆品洞察引擎接上站内门面，给爆品/跨区扩散数据一个有名字的旗舰系列。
  - **接上引擎**：`generateInsight`（此前从未被调用）正式接进 `radar-review` worker —— rank → 逐个生成 evidence-bound 洞察卡（what/why-now/trajectory/so-what）→ 持久化 → 照常发 admin Telegram；逐 mover 失败隔离。
  - **持久化**：新增 `MoverInsight` 模型 + migration `0010_mover_insights`（**已上 prod**，手写 SQL 与模型逐字段一致、无 drift）。
  - **门面**：`/radar` 新增「The Movers」服务端区块（`getMovers()` 取最新一天、按分排序），卡片显示标题 + ▲rankDelta/区域/品类/#rank/NEW/扩散箭头 + whyNow + soWhat。已用真实数据 preview 验证（8 张卡在线）。
  - **标题公式**：「[变化] — [对卖家的后果]」进 roundup prompt；mover 卡 `so_what` 要求以**具体卖家动作**开头。
  - **重构**：抽出纯函数 `rankMovers(histories)→{mover,evidence}[]`，收敛 radar-review 与 `computeTopMovers` 的重复循环。
  - 子代理驱动 TDD，7 任务逐个 spec+质量双审 + 整体终审；**287 测试绿 / tsc 干净**。spec `…/specs/2026-06-09-bl044-content-franchising-design.md` · plan `…/plans/2026-06-10-bl044-the-movers-v1.md`。
  - **⚠️ 待 worker 部署生效**：13:30 UTC 的 `radar-review` cron 需 Railway 带上新 main 后才走「生成+持久化卡」新逻辑（在此之前仍为旧的纯 Telegram 文本，不落卡）。
  - **后续切片（BL-044 未完）**：Wire 多维 Briefing、5 个主题 hub、副线策展、China Supply、命名定稿、区块 i18n。数据随每日快照 + BL-042 评分成熟而变厚。

## 🆕 本轮新增（2026-06-10）：BL-033 写作模块库（depth+voice+grounding 解耦）

- **BL-033 v2 写作模块库（已合并 main，PR #2）** — 把内联在 editor prompt 里的写作标准拆成可组合的运行时 prompt 模块 `src/ai/writing/`，为后续复用/开源铺路。
  - **core.ts**：领域无关写作核心（`DEPTH`/`VOICE`/`GROUNDING`/`ESCALATION` + `writingCore()`）；`BANNED_PHRASES` 单一来源；**零业务依赖、可开源**（测试守边界）。VOICE 增强正面技法（展开推理 / 有据预期反转 / 主线收口 / 升番排序）。
  - **topic-gate.ts**：泛化 `passesTopicGate(input, config)` 谓词 + `topicGateBlock()` 深度门 prompt。
  - **self-check.ts**：reviewer rubric `selfCheckRubric()`，banned 列表从 core 取（**消除 review.ts 的重复**）。
  - **columns/**：daily-brief / daily-roundup / movers-insight 的 `ColumnSpec` + `composeSystemPrompt()` 装配器。
  - 三个消费方（`compose.ts` / `mover-insight.ts` / `review.ts`）迁移到模块，删除旧 `writing-standard.ts`。
  - 子代理驱动 TDD，每任务双审（spec + 质量）；沿途修两处缺陷：列 import 路径少一层 `../`、补回"内部分数不外露"护栏。
  - **实测**：真实 D-1 数据跑生产链路（草稿）验证文风——升番排序 / 有据预期反转 / 机制+非显风险肉眼可见；抓到并修复 **confidence 分数泄漏进正文**：`confidenceBand()` 在源头把分数桶化成 strong/moderate/tentative，editor/reviewer 不再看到裸浮点。
  - **282 测试绿 / tsc 干净**；无 schema 变更；无新生产开关（daily-note 仍 **03:30 UTC**、`DAILY_NOTE_AUTOPUBLISH` 默认 ON）。
  - spec/plan：`docs/superpowers/{specs,plans}/2026-06-10-writing-modules*`。

## 🆕 本轮新增（2026-06-08）：多语言/中文化 (BL-041 P1+P2)，v0.12.0

- **BL-041 多语言内容（P1+P2 已上线 main）** — 从"中文 UI + 英文内容"升级为可被搜索收录的中文站。
  - **路由/SEO**：英文留根、中文走 `/zh`（as-needed prefix）。middleware 解析 locale + 重写 `/zh/*` + 注入 `x-tl-lang`/`x-tl-path`；`getLang()` 改读 header（cookie 降级）。每页 `hreflang`/`canonical`(en/zh-Hans/x-default) + `og:locale`；sitemap 列 `/zh`。
  - **预警中文（P1）**：通用 `Translation` 表(migration `0007`，N 语言键 `alert:<id>` 等) + `translate-content-tick` worker（DeepSeek + 跨境术语表，`sourceHash` 幂等）；读取层中文覆盖 + 逐字段英文兜底（首页 + `/wire`）。
  - **Daily 中文（P2）**：英文笔记翻译（保 markdown）→ 复用 reviewer 去 AI 腔 → 存 `(date,"zh",kind)`，slug 派生自**英文兄弟 slug**；`/zh/daily(/[slug])` 可爬；文章页 hreflang 按兄弟 slug 配对；首页 Daily 区 lang + 英文兜底。
  - **全站 locale-aware 导航**：内链全部带 `/zh` 前缀，`MainNav` active 态 locale 无关（修 P1 内链缺口）。
  - 开发 opencode、Claude review+验收（发现并修了中文 slug 用 slugify 产生垃圾/碰撞的缺陷）。测试 **220 绿**、tsc/build 干净；真实中文预警 + Daily 落地、hreflang 端到端验过。
  - spec/plan：`docs/superpowers/specs/2026-06-07-multilingual-content-design.md` · `…/plans/2026-06-07-bl041-multilingual-phase{1,2}.md`。
  - **⚠️ 生产开关**：Railway worker 已设 `TRANSLATE_ENABLED=true`（+ `DEEPSEEK_API_KEY`）→ 生产开始产出中文。`TRANSLATE_TARGET_LANGS`(默认 zh)/`TRANSLATE_LOOKBACK_DAYS`/`TRANSLATE_MAX_PER_RUN` 控成本。
  - **P3 待续**：Radar 爵品 / X 热点惰性翻译（X 部分需先恢复 X API）。

## 🆕 上一轮（2026-06-07）：编辑式首页 v2 (BL-026) + Google News/channelId (BL-040)

- **BL-026 编辑式首页 v2（已上线）** — 借鉴 mining-technology 的版式重做首页。
  - 顶部簇：**lead hero**(高分要闻,图为主,无则回退最新日报) + **2 张次级 highlight** + 实时 **Latest 列**(Wire+Radar+X 按时间混排)。
  - 板块差异化:Wire(featured+列表)、Radar(#1 大卡+网格)、**Hot on X**(讨论卡,给 `getHotTopicsX` 首页落点)、Daily Insight;原"Earlier"并入各板块。
  - 容器加宽 `max-w-[64rem]→[88rem]`;Daily→**Daily Insight**;纯函数 `pickHero`/`buildLatest`(TDD);X 行暴露 `createdAt`;删 `BreakingStrip`/`EarlierFeed`/`StreamBand`。
  - spec/plan：`docs/superpowers/{specs,plans}/2026-06-07-bl026-home-editorial-v2*`;mockup `design/home-mockup-v5…v9.html`。
- **BL-040 Google News 源处理 + channelId 归一化（已上线）**
  - **GN(③)**：`news.google.com/rss/articles/CBMi…` 跳转链在 **ingest** 经 Google `batchexecute` 解析为真实媒体 URL → url/urlHash、点击目标、og:image 都取真文(不再是 Google "G" logo)。`ogimage` 兜底过滤该 logo。`scripts/backfill-gnews.ts` 已修 **54/54** 现有预警(44 条拿到真图)。
  - **channelId(②)**：`resolveChannelId`(@username→数字 chat id) 稳定去重键;`alreadyPushedKeys/pushedTodayCount` 支持新旧键并集,过渡不重推。
  - 测试 **189 绿**;`tsc` 干净。
  - **待 worker 部署生效**：新抓取的 GN 文需 Railway worker 带上本次代码后才走解析(旧文已 backfill)。

## 🆕 上一轮（2026-06-07）：Telegram 频道精选推送 (BL-039 slice 1)

- **BL-039 Curated Telegram Channel Push（已完成开发，待部署）** — 每日精选 6–8 条 Wire 预警 + Radar 爆品推送到公开 Telegram 频道。
  - **纯函数**：`channel-render.ts`(HTML 渲染) + `channel-select.ts`(排序+混合+预算控制)，42 单测全覆盖。
  - **DB**：`ChannelPush` 模型(migration 0006) + `channel-db.ts`(候选收集/已推跟踪/记录)。
  - **Worker**：`channel-push-tick`(3×/天，02:00/10:00/16:00 UTC)，与 admin review 完全分离。
  - **配置**：`TELEGRAM_CHANNEL_ID`、`CHANNEL_PUSH_ENABLED`、`CHANNEL_PUSH_DAILY_MAX`(8)、`CHANNEL_PUSH_RUN_MAX`(3)、`CHANNEL_PUSH_MIN_URGENCY`(2)。
  - **待上线**：设置 `TELEGRAM_CHANNEL_ID` + `CHANNEL_PUSH_ENABLED=true` 后运行 migration 即可。

## 🆕 本轮新增（2026-06-06）：Daily Note 原创日报 + X 信源扩展

- **BL-027 Daily Note（原创日报，已上生产）** — 每日基于前一天信号生成原创编辑文章，主打 SEO 内容资产。
  - **双角色**：editor=`gemini-3.5-flash` **Flex 档**（deepseek 兜底，写深度+反 AI 腔）→ reviewer=`deepseek-v4-flash`（核事实+去 AI 腔）。
  - **两类**：`brief`(政策解读) + `roundup`(爆品选品)，各有 prompt+质量门；富信号日各出一篇。
  - **页面**：`/daily` + `/daily/[slug]` 可爬页 + `NewsArticle` JSON-LD/canonical/OG + 新增 `app/sitemap.ts`/`app/robots.ts`。署名 Agent Joey。
  - **worker**：`daily-note-tick` @ **03:30 UTC**；`DAILY_NOTE_AUTOPUBLISH` **默认 ON**(暂无审批 UI)。migration `0005_daily_notes` 已上生产。
  - 脚本：`bench-daily-note`(4 模型对比)、`daily-note-pipeline`、`daily-note-seed`。
- **X 信源扩展（已上生产 + 已 X_ENABLED）**
  - BL-013 viral/topic 两 search 轨已启用；**BL-036 curated-accounts 第 3 轨**：18 个核验账号时间线(since-cursor 增量、`X_ACCOUNTS_MAX_READS=200≈$1/天`)，**存推文原文**(BL-035 料仓雏形)。
  - 修：`extractProducts/Topics` 批量化(25/批)防 JSON 截断；`scripts/{x-accounts-probe,x-run-once,x-report}.ts`。
  - 实测：**accounts 轨信号远强于 search**(真·关税/海关/平台动向)。
- **加固**：`extractJson` 容错(尾部多余括号 + 字符串内裸控制符)；AI client 加 `editorClient()`/`reviewerClient()` + 可配超时 + Gemini OpenAI-compat(reasoning_effort:none / Flex)。
- 总测试 135 绿 / lint 0。spec：`docs/superpowers/specs/2026-06-06-daily-note-design.md`。
- **待办线**：BL-034(editor 按需检索)·BL-035(料仓+检索索引)·BL-037(账号评分→高分优先)·BL-038(products 去重 + search 降权)。明天拉 `x-report` 看首批跑批数据。

## 🚀 LIVE
- **生产**: https://tradelinks-mvp.vercel.app （Wire `/` · Radar `/trends` · **每日 `/daily`** · 审核台 `/admin/review` · 源监控 `/admin/sources`）
- **GitHub**: agentjoey/tradelinks-mvp（main）
- **DB**: Neon **production** branch `ep-mute-base-aotkza3n` / `neondb`
  - `DIRECT_URL` 也用 **pooled host**；pg-boss 连接已 pin `sslmode=verify-full`
  - **History retention 调低（~0–1h）** 控制计费存储；**勿在 Neon 上 VACUUM FULL**（会增 history/WAL）
  - schema 已加 `source_health_snapshots`（migration 0004）+ `daily_notes`（migration 0005，BL-027），均已上生产
- **部署分工**: Vercel=只读前端+API；worker + Python scraper → Railway
  - scraper 12h 才用一次，闲时 Serverless **休眠＝正常**（非崩溃）；Wire 内容不依赖 scraper

## 数据源现状（25 active / 16 disabled）— 详见 docs/specs/sources.md（live registry）
- **法规 B(5)**：B01/B02/B03/B06/B16 —— 已 4–6h→**12h** 限流降占比
- **平台 A(4)**：A02 Shopify、**A04 TikTok Shop(Google News RSS,新增)**、F04 Tamebay、A01 eBay(选择器已修)
- **物流 E(2,新增)**：E01 Supply Chain Dive、E02 FreightWaves（此前物流类目为空）
- **行业/媒体 F(4)**：**F11 EcommerceBytes(新增,平台政策主力)**、F12 Practical Ecommerce(新增)、F02、F03、F01(选择器已修)
- **爆品 D(10,BSR)**：D02/D04/D05/D06 + D30-34 —— **不进 Wire，进 Radar**；URL 按 /dp/ASIN 规范化去重（18330→268）
- **停用**：A03(消费PR非卖家政策)、D03(Movers&Shakers 无头渲染不出网格)、D01(trends-tick 专管)、反爬/死源若干
- **Wire 占比**：法规 61%→**48%**，物流 7%→12%(真源)，平台 7%→13%，行业 14%→18%

## Open Bugs（P0/P1）
🟢 无 P0/P1。
- ⚠️ `/admin/*`（review + sources）**无鉴权**，待加 Auth
- TikTok Shop 官方卖家中心需登录态（A04 用 Google News 兜底）

## 本轮硬化要点（2026-06-05）
- **稳定性**：scraper 串行(单 Chromium) + disable_resources + --disable-dev-shm-usage + 队列 batchSize=1 → 修复 driver 崩溃与日志洪水
- **成本/存储**：bestsellers 移出 Wire；BSR 12h 错峰；pg-boss 短保留(30min) → 存储 325MB→29MB
- **监控**：`/admin/sources` 源健康评分(0–100/五档) + 每日快照 + 转🔴/💀 Telegram 告警
- 工具脚本：`scripts/{health,db-size,db-cleanup,dedup-amazon}.ts`

## Next TODOs（优先级）
1. ✅ **F01/A01 恢复验证**：scraper 00:00 UTC 唤醒正常,F01 已恢复(选择器修复生效);A01 06:00 UTC cron(低频)
2. ✅ **/admin/* 鉴权已上线**（ADR-006，Neon Auth=Better Auth + Google OAuth + `ADMIN_EMAILS` 白名单 + 邀请制）
   - 踩坑沉淀（**关键**）：① 自定义域名必须加进 Neon Auth **trusted_origins**（否则 CSRF 403）② 会话 cookie 必须 **`sameSite:"lax"`**（默认 strict 会在 OAuth 跨站跳回时丢 cookie→死循环）③ **必须挂 `auth.middleware()`**(scoped `/admin`)来校验/刷新会话并喂给 server component,否则 session 建了但页面读不到→循环 ④ Vercel 偶发漏触发 webhook→空提交重推或手动 Redeploy
2b. **UI 深度优化**：
   - ✅ Wire 时间线改为「最近1h/4h/8h/今天/昨天/日期」递进分桶（2026-06-05）
   - 待办：移动端布局与卡片密度（tab bar 已上线）、urgency 视觉层级（tier chip 统一 ✅）、Radar 爆品卡（缩略图/榜位/区域 chip ✅ SignalCard）、骨架屏/加载态（✅ 路由 loading）、空态与错误态（✅ EmptyState/error.tsx）、字体与间距打磨（✅ type scale 六档）、暗色对比度可达性（✅ faint 3.1→5.2:1）
3. **物流/平台再补源**：EU 稳定法规 feed（替 B04/B05）、ME/LatAm/SEA 平台与物流覆盖
4. **反爬 backlog（Phase 2，需付费API/代理）**：Temu(D21)/AliExpress(D23)/MercadoLibre(D20)/Noon(D22)/CIFNews(F09)/Ebrun(F10)
5. **Radar 深化**：BSR rank delta 时序（目前 first-seen rank）+ 三源扩散佐证
6. **D03 Movers&Shakers**（可选）：非无头/交互式抓取方案
7. 收尾：F01 “Read more” 噪声项、Neon retention 最终值

## Sprint 004 Summary（趋势 + 扩散 + 推送）
T1 趋势摄取 ✅（keywords + score.ts + trends worker + daily schedule；pytrends 单次取 169 点验证；**429 限流记为生产风险**，已加退避，高可用需付费源）
T2 跨区扩散 ✅（diffusion.ts lead-lag 算法 + 5 单测；真实算法产出 5 个直观信号；**/trends Radar 页已上线**，沿用 Wire 视觉）
T3 即时推送 ✅（Telegram/Slack 渲染+发送，approve→dispatchPush；真实发送 gated on token）
延后：Amazon BSR 多源佐证、Phase 1.5 源扩展 → Sprint 005。
69 单测 / lint 0 / next build ✓ / 真实 Neon+pytrends 管道验证。

## Sprint 003 Summary（Web + 分发）
Next.js 14 + Tailwind 接入(与 worker 共存，webpack extensionAlias 解析 .js→.ts)。
T1 时间线 + 过滤器 ✅ / T2 REST API + UA 门禁 ✅ / T3 日报生成(5段)+Resend(gated) ✅ / T4 RSS ✅ / T5 审核 UI ✅。
**真实验证(next start + Neon)**：API 返回 2 条预警、bot UA→403/browser→200、首页渲染、过滤器(regulatory→1/europe→0)、审核页、RSS、日报 dry-run。
`next build` ✓ / 56 单测 / lint 0。
延后项：read-state/24h-delay/auth(→S005)、daily-by-date/openapi/rate-limit、cron、真实发信(RESEND key)、Feedly 手动确认。

## Sprint 002 Summary（评分与预警生成）
T1 Stage-2 评分 ✅（score prompt + stage2 + MiniMax 真实验证：de minimis→5/GPSR→4/tips→1）
T2 Alert 生成 ✅（score-queue + scoring worker + 聚类合并 + 状态路由；真实验证 pending_review/published）
T3 审核队列后端 ✅（review CLI list/approve/reject，真实 approve 验证）
管道现已贯通：crawl→ingest→Stage1(deepseek-flash)→dedup→Stage2(MiniMax 评分)→alerts(状态路由)→人工审核。
反爬源：Amazon BSR(D02/D03) 选择器已验证；TikTok CC(D07) 门禁停用。
49 单测 / lint 0 / 真实 Neon+模型 e2e 全过。

## (历史) Sprint 001 Summary
Sprint 001（数据摄取基础设施）**全部完成并真实验证** —— T1 Schema✅ / T2 爬虫框架(pg-boss)✅ / T3 源接入✅ / T4 AI 粗筛翻译(deepseek-v4-flash)✅ / T5 去重聚类✅ / T6 Python Scraper✅。
真实 e2e 验证：
- Neon dev：migrate(9表)、pg_trgm、RSS 抓取→入库、trigram 查询
- AI：deepseek-v4-flash 关思考(bench 后定，ADR-005)，粗筛/译英/分类全通；MiniMax 留作 Sprint-002 打分
- Python：py3.11 + scrapling[fetchers] 0.4.8 + Chromium，FastAPI /scrape + Node 桥接打通(10 items)
单测 40 passed / lint 0 error。
调优项：prefilter recall 偏严（ai-pipeline.md 记录）；各反爬源选择器线上迭代。
密钥在 .env(gitignored)：Neon、MINIMAX(打分)、DEEPSEEK(Stage-1)。
SPEC/PLAN：docs/specs/{data-model,crawler-contract,ai-pipeline,IMPL-PLAN-sprint-001}.md。ADR-001~004 见 Obsidian。
测试现状：`pnpm test` 40 passed / `pnpm lint` 0 error / `pnpm db:validate` ok / py_compile ok。
**基础设施已定（ADR-003/004）**：Neon(PG, pooled+direct 双 URL，并承载 pg-boss 队列) + Railway(workers) + Vercel(前端)。**已删 Redis/Upstash**——队列改用 pg-boss(纯 SQL，跑在 Neon)，组件 4→3。本地连 Neon dev 分支（无本地 PG）。**需 provision**：Neon 项目+dev分支、DeepSeek key — 到位后 T3 入库 / T5 trigram 可真验证。

## Next Sprint Candidates（Sprint 005：账户 + 变现 + 扩源）
- [ ] [EP-008] [HIGH] Auth(NextAuth v5)：登录 + 管理页鉴权 + 用户订阅设置
- [ ] [EP-008] [HIGH] Stripe 订阅(Free/Pro/Team) + 计费页
- [ ] [EP-009] [MED] 关键词监控(Pro)：自定义品类/品牌/竞品盯防
- [ ] [EP-001] [MED] Phase 1.5 源扩展(SEA/ME/LatAm/ANZ 35 源)
- [ ] [EP-005] [LOW] UI 增强：urgency 排序/已读置灰/中英切换


## Version History（最近 6 版）
| Version | Date | Summary |
|---------|------|---------|
| v0.12.0+ | 2026-07-19 | BL-045 前端重设计（workflow T3）：双主题 token 体系 + cookie 主题机制 + 移动端 tab bar + Radix More 下拉 + labels/SignalCard/PageHeader/EmptyState/ui.ts 组件层 + 路由状态层 + Instrument Panel 动效 + 订阅页修复（297 测试；merged main `17aa648`，生产冒烟通过） |
| v0.12.0+ | 2026-06-10 | BL-044 The Movers v1：洞察引擎接进 radar-review（生成+持久化 `MoverInsight`，migration 0010 上 prod）+ /radar「The Movers」门面 + 标题公式 + 纯函数 `rankMovers`（287 测试；merged main `3547ce1`） |
| v0.12.0+ | 2026-06-10 | BL-033 写作模块库：core/topic-gate/self-check/columns 拆分 + 三消费方迁移、单一 `BANNED_PHRASES`、confidence 桶化修复（282 测试；merged main PR #2，未单独 tag） |
| v0.12.0 | 2026-06-08 | BL-041 多语言/中文化 P1+P2:`/zh` 子路径+hreflang/canonical、Translation 表(migration 0007)+预警/Daily 中文翻译(DeepSeek+术语表+reviewer)、locale-aware 导航(220 测试) |
| v0.11.0 | 2026-06-07 | BL-026 编辑式首页 v2(hero+次级+Latest 簇 / 板块差异化 / Hot on X)+ BL-040 Google News 真 URL 解析 + channelId 归一化(189 测试) |
| v0.10.0 | 2026-06-07 | BL-026 UI 改版 + BL-040 频道大图新闻卡(sendPhoto+按钮 / 来源美化 / cap 12) |
| v0.9.0 | 2026-06-07 | BL-039 slice 1 上线 + 频道卡片首版 |
| v0.8.1 | 2026-06-07 | BL-039 slice 1: Telegram 频道精选推送(Wire+Radar 混合,6-8条/天,3×/天 cron,纯函数+42单测) |
| v0.8.0 | 2026-06-06 | Daily Note 原创日报 + X 信源扩展(18 核验账号) + 管道加固 + /admin/sources 源监控 |
| v0.6.0 | 2026-06-04 | 上线 Vercel + Web v2(时间线分段/紧急度档位/标题跳转/og:image)+ JsonAdapter + Amazon多区品类 + cap |
| v0.5.3 | 2026-06-04 | 平台爆品源扩展：Amazon BSR UK/UAE/AU 验证上线(各30条)+ Temu/MELI/Noon backlog |
| v0.5.2 | 2026-06-04 | JsonAdapter(Federal Register 20条上线)+ 死源清理(EU OJ/LUCID/Momentum/Ebrun/Reddit 停用) |
| v0.5.1 | 2026-06-04 | 修复 3 个死源(USTR/ACCC 换 RSS、CIFNews 停用)+ Prisma Neon 冷启动重试 |
| v0.5.0 | 2026-06-04 | Sprint 004：趋势摄取(pytrends)+跨区扩散信号(/trends Radar)+即时推送(gated)，差异化卖点上线 |
| v0.4.1 | 2026-06-04 | UI 重做：Intelligence Wire 编辑风(Fraunces+Plex Mono+琥珀信号色)，用户确认采用 + Neon 连接池修复 |
| v0.4.0 | 2026-06-03 | Sprint 003：Next.js Web(时间线+过滤)+REST API+RSS+审核UI+日报生成，真实验证 |
| v0.3.0 | 2026-06-03 | Sprint 002：评分(MiniMax)+Alert生成+状态路由+审核队列，全链真实验证 |
| v0.2.0 | 2026-06-03 | Sprint 001 完成：数据摄取管道（pg-boss/Neon + deepseek-v4-flash + Scrapling）全链真实验证 |
| v0.1.0 | 2026-06-03 | 项目立项，规范初始化，数据源清单确认 |
