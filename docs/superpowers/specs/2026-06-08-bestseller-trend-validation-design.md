# 爆品趋势验证 MVP — Design Spec

> Backlog: BL-042 · [[Backlog-待办#-now--next]]
> Date: 2026-06-08 · Status: draft (待 review)

## 1. 背景与定位（Why）

当前爆品（Radar）逻辑是**亚马逊 BSR 的滞后镜像**：按绝对排名排序，数学上必然只能捞到充电插排、扎带、电池这类常青大宗货。支撑"更聪明"的机器其实都建了但**已死**：

- 单品只存 `{rank, image}`，无价格/评分/评论数。
- `items` 按 `urlHash` 原地覆盖，**排名历史全部丢弃**，算不出"在动"。
- `trend_snapshots`（本该是时间序列底座）只有 24 行、全是 2026-06-04 一天、TikTok 提及恒 0。
- `trend_signals`（本该产出"为什么爆"）5 行、空。

**重新定位**：爆品模块的任务不是"列出畅销品"，而是 **找到正在动的品 → 解释为什么动 → 说清趋势走向 → 给出该怎么做**。质胜于量。从"滞后的西方市场绝对排名"转向**横截面差异**（跨区、供给×需求）这一类领先信号。

## 1b. 与 BL-028 的关系（必须先对齐）

本条与 **BL-028（历史汇总 → 趋势追踪 → 趋势预测，PRD 核心护城河）** 是**同一护城河的两个不同粒度**，不能各建一套互不相干的历史层：

- **BL-028**：**关键词/品类级**扩散（`TrendSnapshot` 按 date×region×keyword；`TrendSignal` 扩散）。其 **P① 地基 spec**（`docs/superpowers/specs/2026-06-06-trend-data-foundation-design.md`，状态 = draft，**尚未实现**）要解决的正是"别每天毁历史、补 outcome 捕获、加时序访问层"。
- **本条（爆品）**：**产品 / ASIN 级**畅销-速度（`product_snapshots` 按 date×asin×region）。

三个后果：

1. **同一"先存历史"原则** —— `product_snapshots` 设计成 `TrendSnapshot` 的**产品级姊妹表**：append-only、按唯一键幂等、永久保留（沿用 BL-028 retention 策略）。
2. **S2 有依赖，不是"免费"** —— "Google Trends 已在抓"这句不准确：趋势轨快照**停在 2026-06-04**（`trend_snapshots` / `trend_signals` 均最后 06-04）。即 **S2（BSR×Trends 背离）依赖的需求端数据当前是停的**，需先确认/复活 BL-028 趋势轨，否则 S2 无数据。
3. **顺带采纳 outcome 捕获** —— BL-028 P① 的"记录预测 → 事后核验是否真扩散"理念，产品级也该有（某品 A 区起、预测扩散到 B 区 → 事后看 B 区是否真涨）。这是护城河 / 可预测性的种子，趁现在数据小先埋。

## 2. 目标与非目标（Scope）

**目标**
- 验证 **"评论数增量"作为销量代理** 的信号强度（判别力 / 预测力 / 分离度，详见 §9）。
- 用**已有 4 区 BSR + 已抓的 Google Trends**，从 **Day 1** 就产出"在动的品 + 为什么"。
- **边跑边上 /radar**，并每日 **Telegram 复盘**供人工眼校、滚动优化。

**非目标（本期不做）**
- 上游中国/社交源（1688 / 抖音 / TikTok velocity）—— 后置，不在本期。
- TikTok mention 接入 —— 现为死信号，本期**不依赖**。
- 全 6 类全量 —— 只做 **Beauty + Toys & Games × 4 区**。
- 把严格统计检验当**开工前提** —— 每日人工校验为主，统计为事后确认。

## 3. 范围锁定

- **品类**：Beauty、Toys & Games（高动态、潮流/季节驱动）。**区**：US / UK / AU / UAE。= **8 个抓取目标**（抓取负载约为现状 1/3）。
- **商品级 denylist（打标不删）**：标题命中 commodity 关键词（`charger / cable / battery / surge / zip tie / extension cord / adapter / mount / screen protector / case` 等）的品 **打 `isCommodity` 标**。被标的**只廉价存排名**（不富集评论/价格、不喂 AI），既省贵的部分，又**保留对照样本**用于"数据驱动的 evergreen 过滤"。
- **可选 negative control**：钉一小撮已知常青 ASIN（如扎带）当负对照，专门用来验证指标能否把它们与真风起品分开。

## 4. 数据模型与底座（keystone）

历史时间序列是一切的基石（现状把它丢了）。新建 `product_snapshots`：

| 字段 | 说明 |
|---|---|
| `date` | 快照日 |
| `asin` | 产品身份（URL 为干净 `/dp/ASIN`，实测 100% 可提取） |
| `region`, `category` | 榜单维度 |
| `rank` | BSR 排名（整数，由 `#30` 解析） |
| `reviewCount`, `rating`, `price` | 富集字段（commodity 品可空） |
| `title`, `imageUrl` | 展示 + 跨区标题匹配用 |
| `isCommodity` | denylist 标记 |
| `sourceId` | 来源源 |

唯一键 `(date, asin, region, category)`。`items` 仍是 canonical 最新态；`product_snapshots` 承载历史，deltas 第二天即可计算。

**抓取富集**：扩展 scrapling BSR adapter，对**非 commodity** 品额外抓 `reviewCount / rating / price`（+ 可选 `dateFirstAvailable`，用 `reviewCount / 上架天数` 做即时"终身速度"快速预检，先判断字段有无区分度，不必等两周）。

## 5. 信号设计（三信号，错峰上线）

**横截面（Day 1，单快照即可出）**
- **S1 跨区差异**：同 ASIN（精确）在各区的 rank 差 / 有无 → 扩散信号（A 区火、B 区未火 ⇒ 给 B 区的提前量；四区齐涨 ⇒ 真动能；某区独涨 ⇒ 本地/季节特异）。
- **S2 供给×需求背离**：BSR rank（供给端）× Google Trends 斜率（需求端，**来自 BL-028 趋势轨，当前停在 06-04，需先复活** —— 见 §1b）。**背离即洞察**：Trends 涨而 BSR 未动 = 早期机会；BSR 高而 Trends 平 = 可能饱和；两者齐涨 = 确认。

**时间序列（Day 2+，每天变强）**
- **S3 评论速度 + 排名速度**：`reviewCount` delta / `rank` delta over days → 速度信号。**这是本期被验证的对象。**

**Evergreen 惩罚**：长期高排名 + 低波动 → 压制（解决"电池/扎带"问题）。

## 6. 评分（Trend Score）

复合分（纯函数，可单测）：

```
score = velocity(rank_delta + review_velocity)
      + novelty(new_entrant + new_region)
      × corroboration(S2 一致 → 放大；缺失/背离 → 折扣)
      − evergreen_penalty(persistence × low_variance)
```

产出**精选短名单**（在动的品），而非整张榜。Day 1 评分只含 S1+S2（横截面）；S3 随天数加入并逐步加权。

## 7. "为什么"生成（evidence-bound，防幻觉）

对每个入选 ASIN，先组装 **evidence bundle**（排名轨迹、rank/review delta、跨区分布、Trends 斜率、季节/新闻钩子），喂给 AI 编辑并**要求逐条引用证据**，否则会重蹈 `trend_signals` 编故事的覆辙。产出 **Insight Card**：

- **What** — 产品 / 品类 / 在哪个区排到哪、动到哪
- **Why now** — 因果叙事，**引用证据**（"rank +22/5d；review +180/wk；Trends 'X' +60% MoM；契合 [季节/事件]"）
- **Trajectory** — 起源区 → 扩散到，阶段（emerging / accelerating / peaking / saturating）
- **So what** — 对卖家：现在备货 / 利润窗口 / 饱和风险（**可变现的一句**）

复用现有 editor/reviewer 客户端；用类 `sourceHash` 做幂等。

## 8. 输出面（surfaces）

- **/radar**：展示 ranked moving-product 的 Insight Card，**按扩散阶段分组**，砍掉常青网格与裸排名。内容稀薄时**优雅降级**（不硬凑），可加 "experimental" 标识控风险（因边跑边上、信号未完全验证）。
- **Telegram 每日复盘**：每日一条 "今日上升榜 Top N + 每个的一句为什么 + 证据要点"，发到现有 channel/chat，供人工眼校。是滚动优化的输入。

## 9. 节奏与判据（cadence + promote/kill）

**节奏**
- **Day 1**：埋点上线 + 横截面信号（S1/S2）产出 + 首次 /radar + 首条 Telegram。
- **Day 2+**：S3 deltas 折叠进评分；每日 Telegram 复盘；**每日**调阈值 + denylist。

**评论速度（S3）验证判据**（~7–14 天后事后确认）
- **判别力**：review-velocity 跨品方差显著（非全平）。
- **预测力**：T 时刻 review-velocity 与 T+k 的 rank-delta 正相关（领先-滞后）。
- **分离度**：能把 denylist/常青对照 与 入选风起品 干净分开。
- **晋级**：三项通过 → 评论速度纳入正式评分权重。
- **杀死**：平淡 / 噪声大 / 不领先排名 → 移除评论速度，退回 S1+S2（rank-delta + 跨区 + Trends 背离）。评论速度从"赌注"变为"锦上添花"——证伪也不影响主线。

## 10. 测试策略

- **纯函数 TDD（DB-free）**：trend-score 计算、rank/review delta、evergreen 判定、denylist 匹配、跨区 divergence、evidence-bundle 组装、insight 解析。
- 抓取富集 + AI 生成走集成/手测。

## 11. 工程注意 / 风险

- **跨区匹配**：ASIN 精确匹配覆盖低（实测 661 条里仅 27 个 ASIN 跨源重复 —— 亚马逊各站点常用不同 ASIN）。一期以 **ASIN 精确 + 区内历史**为主；**标题 trigram 相似度匹配**作为二期补全（已有 `items_title_trgm` 索引可复用）。
- **AI "why" 幻觉**：必须 evidence-bound + 引用，否则重蹈 trend_signals。
- **边跑边上 /radar**：未完全验证的信号会暴露给用户 → 阈值保守 + thin 降级 + experimental 标识。
- **TikTok 死信号**：本期不依赖；要么后续单独修，要么从 consensus 公式剔除。

## 12. 建议的实施切分（供 writing-plans 参考）

- **P0（前置，与 BL-028 对齐）**：确认/复活 BL-028 趋势轨（让 `trend_snapshots` 重新每日产出 Google Trends，S2 才有数据）；按 BL-028 P① 的 append-only/幂等/永久保留原则定 `product_snapshots`，并对齐 outcome 捕获理念。**S1（纯跨区）不依赖此前置，可独立先跑。**
- **P1（Day-1 可跑）**：`product_snapshots` 底座 + 抓取富集 + denylist 打标 + 横截面信号 S1（+ S2 若趋势轨已复活）+ Trend Score(v1) + Insight Card 生成 + /radar 接入 + Telegram 每日复盘。
- **P2**：评论速度 S3 纳入评分 + 每日滚动阈值 + 验证判据落地。
- **P3**：标题相似度跨区匹配；（更后）上游中国/社交源接入。
