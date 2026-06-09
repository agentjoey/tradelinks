# BL-044 内容栏目化规范 — Design Spec

> Backlog: BL-044 · [[Backlog-待办#-now--next]]
> Date: 2026-06-09 · Status: draft（v1 方向已定，命名为 working name 后调）
> 关联：竞品研究 Modern Retail · 数据源 BL-042 · 分发 BL-043 · 首页 BL-026 · Daily BL-027
> 增长上下文：Obsidian `P026-TradeLinks/Growth-增长方案.md`（英文卖家滩头）

## 1. 背景与定位（Why）

研究 Modern Retail 后的结论:它靠**栏目化招牌系列（"Marketplace Briefing" 等)+ 标题纪律 + 主题 hub + newsletter→会员漏斗**做成从业者 B2B 媒体;但它是**记者驱动、西方滞后端**,且**没有中国供给侧情报**(隔着玻璃看中国卖家)。

TradeLinks 的打法不同:**数据/AI 驱动 + 更早 + 跨区 + 中国供给侧**。本规范把现有 Wire/Radar/Daily 三面**叠一层"栏目包装"**(不重构 IA),核心是把**专有数据(BL-042 爆品/跨区扩散)做成有名字、成系列、固定节奏的旗舰内容**,并立纪律(标题公式)+ 建主题 hub(SEO 簇)。

**单位 = 自有名单增长(英文卖家滩头)**;本规范是内容侧的承接,与 BL-043 周报同源。

## 2. 目标与非目标

**目标**
- 给现有三面赋予**栏目身份 + 节奏 + 标题纪律**,不动信息架构。
- 立**旗舰系列 "The Movers"**(working name):专有爆品/扩散数据的深度系列。
- 加 **Radar 副线**:高频策展高价值外部动态。
- 把 **Wire** 从"预警"拓为**多维度跨境情报**(平台/政策/物流)。
- 建 **主题 hub**(SEO 簇)。

**非目标(本期不做)**
- 不重构 IA、不大改前端布局(BL-026 的版式不动)。
- 不建会员/付费层(未来,open-core)。
- China Supply hub 的**真内容**(依赖中文信源接入,第二步)。
- 命名定稿(working name,后调)。

## 3. 已锁决策（2026-06-09）

| 项 | 决策 |
|---|---|
| 旗舰核心 | **爆品/跨区扩散(专有数据,吃 BL-042)** |
| 深度 | **现有三面叠包装层**,不重构 IA |
| 旗舰名 | **The Movers**(working name,后调) |
| Radar 节奏 | 旗舰**周起→数据丰富提频**;**副线高频**填空档 |
| 副线源 | **人工策展为主(即刻)→ 复活 X-accounts 轨 → 拓 Reddit/其他**(分步) |
| Wire | 多维度(平台/政策/物流),预警是其一 |
| 语言 | 英文(滩头聚焦) |

## 4. 栏目系统

### 4.1 Radar = 两条线
- **主/旗舰 "The Movers"**(深):每期配方 ——
  - **在动的品**(真爬升 / 真新进 / 跨区扩散,来自 BL-042 的 `qualifiesAsMover`/`trendScoreV1`)
  - **为什么**(证据绑定:排名速度、契合季节/事件;不可幻觉)
  - **往哪扩散**(起源区 → 蔓延到,阶段判断)— Modern Retail 给不了的
  - **卖家怎么办**(备货窗口 / 饱和风险 = 可变现的一句)
  - 节奏:**周起**;BL-042 数据丰富后提频。
- **副线**(快,working name 待定):**搬运/策展**社媒及其他渠道的高价值动态/观察 + 一句我们的判断。高频,保持 Radar 鲜度。
  - 源分步:① **人工策展**(创始人/agent 从 X/Reddit/小红书/新闻挑高价值,即刻可跑);② **复活 X curated-accounts 轨**(BL-036 已存 18 高信号账号推文,**需先恢复 X API**,见 [[x-api-paused]]);③ **拓 Reddit/其他**(BL-029 调研过)。

### 4.2 Wire = 多维度跨境情报(不只预警)
围绕 **平台 / 政策 / 物流** 维度的信息流:预警(urgency 高)只是其一,更广覆盖平台变动、法规、物流动态。够料时凝成命名 **Briefing**(如 "Policy Briefing")。对齐 Modern Retail 的 Operations 垂类 + Briefing 打法,但信息更早、带 so-what。

### 4.3 Daily
roundup 并入 **The Movers**(成为旗舰的叙事载体);brief 归 **Policy beat**。Daily 管线(editor→reviewer)不变,只是产出挂到栏目身份上。

## 5. 标题公式(全站纪律)

**"[变化] + [对卖家的后果]"** —— 陈述"移动"+ 一句"意味着什么",不是"某某发布某某"。写进各 AI 编辑/生成 prompt。示例(用自有数据):
- *"Korean glass-skin masks are climbing US Beauty — and just surfaced in the UK"*
- *"A $12 collagen mask is spreading US→UK→AU: the pattern sellers should front-run"*
- Wire:*"New EU GPSR rule hits non-EU sellers Monday — what to fix this week"*

## 6. 主题 hub(SEO 簇 + 导航)

锁一组 beat 落地页(URL 簇 + nav):
**Tariffs & Trade · Platform Policy · Logistics · China Supply · Movers(旗舰 hub)**
- **China Supply 现在就占坑**(哪怕内容薄)—— Modern Retail 的结构性盲区、TradeLinks 的护城河领地。

## 7. 链路:一条数据 → 两个分发

```
BL-042（专有 movers + 跨区扩散数据）
      → The Movers（编辑包装:为什么/往哪/怎么办 + 标题公式）
            → /radar 头条系列（站内）
            → BL-043 newsletter 头条内容（邮件）
```
一个数据引擎喂两个分发口。

## 8. 实施触点（轻;主要是编辑/prompt + 轻标签,不动 IA）

| 触点 | 改动 | 类型 |
|---|---|---|
| Daily roundup prompt | 注入 BL-042 movers + "往哪扩散/怎么办" + 标题公式,产出挂 "The Movers" | 编辑/prompt |
| Wire 归类 | 平台/政策/物流维度标签;Briefing 摘要(够料时) | 编辑 + 轻代码 |
| 标题公式 | 写进所有生成 prompt(Daily/Wire/Movers) | prompt |
| 主题 hub 页 | 5 个 hub 落地页 + nav 入口(可复用现有 tag/category 路由) | 轻前端 |
| 栏目标签 | /radar 上 "The Movers" 系列标识 + 副线区块 | 轻前端 |
| 副线产出 | 人工策展先手动发;后接 X-accounts/Reddit 源 | 编辑 → 后续代码 |

## 9. 依赖 / 时序

- **The Movers**:现在可起(已有 movers + 区内速度);跨区"往哪扩散"随 BL-042 数据成熟变厚。
- **副线**:人工策展即刻可跑;**X-accounts 复活前置 = 恢复 X API**(现停);Reddit/其他需建采集。
- **China Supply hub**:占坑现在做,真内容等中文信源(第二步)。
- 与 **BL-043** 对齐:The Movers = 周报头条。

## 10. 验收 / 落地判据（v1）

- 三面都有栏目身份 + 节奏;The Movers 首期(吃当前 BL-042 数据)产出并上 /radar + 周报。
- 标题公式进入 Daily/Wire/Movers 生成 prompt。
- 5 个主题 hub 落地页 + nav 可达;China Supply 占坑页存在。
- 副线人工策展跑起至少一期。

## 11. Follow-ups（→ backlog ⚫ Later）

- 副线自动化源:X-accounts 轨复活(依赖 X API)、Reddit/其他采集。
- China Supply 真内容(中文信源接入,第二步)。
- 会员/付费层(open-core,远期)。
- 命名定稿(The Movers + 副线名)。
