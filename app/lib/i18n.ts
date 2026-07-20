import { headers } from "next/headers";

export type Lang = "en" | "zh";
export const LANGS: Lang[] = ["en", "zh"];

export interface Dict {
  nav: { home: string; wire: string; radar: string; daily: string; more: string; desk: string; sources: string };
  navUpgrade: string;
  navAlerts: string;
  navSubscribe: string;
  navTelegram: string;
  navRss: string;
  themeToggle: string;
  eyebrow: string;
  live: string;
  dispatches: string;
  actNow: string; // status-bar "N act-now"
  heroPre: string;
  heroEm: string;
  heroPost: string;
  heroSub: string;
  region: string;
  type: string;
  all: string;
  today: string;
  yesterday: string;
  last1h: string;
  last4h: string;
  last8h: string;
  empty: string;
  loadEarlier: string;
  footer: string;
  // urgency tiers
  tierAct: string;
  tierWatch: string;
  tierFyi: string;
  act: string;
  moreSources: (n: number) => string;
  // radar
  radarEyebrow: string;
  radarPre: string;
  radarEm: string;
  radarSub: string;
  diffusionSignals: string;
  risingNow: string;
  bestsellers: string;
  bestsellersSub: string;
  bestsellersEmpty: string;
  bestsellersTeaser: string;
  kpiProducts: string;
  kpiRegions: string;
  kpiFeeds: string;
  kpiSignals: string;
  viralX: string;
  viralXSub: string;
  viralXEmpty: string;
  hotX: string;
  hotXSub: string;
  hotXEmpty: string;
  // daily note
  dailyEyebrow: string;
  dailyPre: string;
  dailyEm: string;
  dailySub: string;
  dailyEmpty: string;
  kindBrief: string;
  kindRoundup: string;
  dailyBy: string;
  dailyTakeaways: string;
  dailySources: string;
  dailyBackToAll: string;
  // home (editorial front door)
  homeMastheadPre: string;
  homeMastheadEm: string;
  homeMastheadPost: string;
  homeMastheadSub: string;
  glance: string;
  seeAll: string;
  breaking: string;
  topStory: string;
  latest: string;
  earlier: string;
  streamWire: string;
  streamWireSub: string;
  streamRadar: string;
  streamRadarSub: string;
  streamX: string;
  streamXSub: string;
  streamDaily: string;
  streamDailySub: string;
  cntToday: string;
  cntMoving: string;
  cntNew: string;
  earlierOtherHint: string;
  subscribeTitle: string;
  subscribeSub: string;
  subscribeCta: string;
}

const en: Dict = {
  nav: { home: "Home", wire: "Wire", radar: "Radar", daily: "Daily Insight", more: "More", desk: "Desk", sources: "Sources" },
  navUpgrade: "Upgrade",
  navAlerts: "Alerts",
  navSubscribe: "Subscribe",
  navTelegram: "Telegram alerts",
  navRss: "RSS feed",
  themeToggle: "Toggle color theme",
  eyebrow: "◆ Intelligence Wire",
  live: "live",
  dispatches: "dispatches",
  actNow: "act-now",
  heroPre: "Cross-border ",
  heroEm: "intelligence",
  heroPost: ", on the wire.",
  heroSub: "Regulatory shifts, platform policy, logistics shocks and trend signals — across six regions, scored by how fast you need to move.",
  region: "region",
  type: "type",
  all: "All",
  today: "Earlier today",
  yesterday: "Yesterday",
  last1h: "Last hour",
  last4h: "Last 4 hours",
  last8h: "Last 8 hours",
  empty: "no dispatches match this filter",
  loadEarlier: "load earlier ↓",
  footer: "TradeLinks · 6-region cross-border intelligence · alerts are summaries — verify at source",
  tierAct: "Act now",
  tierWatch: "Worth knowing",
  tierFyi: "FYI",
  act: "act",
  moreSources: (n) => `+${n} more source${n > 1 ? "s" : ""}`,
  radarEyebrow: "◆ Trend Radar",
  radarPre: "Cross-region ",
  radarEm: "diffusion",
  radarSub: "Where a product is already hot in mature markets but still lagging elsewhere — an early window before it spreads. Signal, not prophecy.",
  diffusionSignals: "diffusion signals",
  risingNow: "rising now",
  bestsellers: "bestsellers board",
  bestsellersSub: "Top products surfacing in Amazon best-seller grids across regions — raw hot-product signal, by category.",
  bestsellersEmpty: "No bestseller data yet — run the Amazon scraper.",
  bestsellersTeaser: "Hot products across 6 regions — open the Bestsellers Radar",
  kpiProducts: "Products tracked",
  kpiRegions: "Regions",
  kpiFeeds: "Category feeds",
  kpiSignals: "Diffusion signals",
  viralX: "viral on X",
  viralXSub: "Consumer products going viral on X right now — an early social signal, often ahead of the Amazon best-seller charts.",
  viralXEmpty: "No X viral signal yet — enable the X source (X_ENABLED) to start.",
  hotX: "cross-border hot on X",
  hotXSub: "What cross-border e-commerce sellers are talking about on X — platform rule changes, customs/tariffs, logistics and marketplace moves.",
  hotXEmpty: "No cross-border topics yet — enable the X source (X_ENABLED) to start.",
  dailyEyebrow: "◆ The Daily",
  dailyPre: "Yesterday, ",
  dailyEm: "decoded",
  dailySub: "One original brief a day — the policy moves and viral-product shifts that mattered, synthesized with what to actually do. Written by our desk, fact-checked before it ships.",
  dailyEmpty: "No daily notes published yet — they appear here each morning.",
  kindBrief: "Policy Brief",
  kindRoundup: "Product Roundup",
  dailyBy: "By Agent Joey · TradeLinks",
  dailyTakeaways: "Key takeaways",
  dailySources: "Sources",
  dailyBackToAll: "← all daily notes",
  homeMastheadPre: "Global cross-border e-commerce ",
  homeMastheadEm: "intelligence",
  homeMastheadPost: ".",
  homeMastheadSub: "Policy & logistics disruptions, viral-product diffusion across regions, and one original brief a day — the three streams we track:",
  glance: "Today at a glance",
  seeAll: "See all",
  breaking: "Breaking",
  topStory: "Top story",
  latest: "Latest",
  earlier: "Earlier",
  streamWire: "Wire",
  streamWireSub: "Real-time regulatory & logistics alerts",
  streamRadar: "Radar",
  streamRadarSub: "Bestsellers & social signals",
  streamX: "Hot on X",
  streamXSub: "What sellers & operators are discussing",
  streamDaily: "Daily Insight",
  streamDailySub: "One original brief a day",
  cntToday: "today",
  cntMoving: "moving",
  cntNew: "new",
  earlierOtherHint: "Open that section for its full feed.",
  subscribeTitle: "Never miss a high-urgency alert",
  subscribeSub: "Push the alerts and categories you watch to Telegram, Slack or email.",
  subscribeCta: "Set up push",
};

const zh: Dict = {
  nav: { home: "首页", wire: "情报流", radar: "趋势雷达", daily: "每日洞察", more: "更多", desk: "审核台", sources: "信息源" },
  navUpgrade: "升级",
  navAlerts: "订阅",
  navSubscribe: "订阅",
  navTelegram: "Telegram 推送",
  navRss: "RSS 订阅",
  themeToggle: "切换明暗主题",
  eyebrow: "◆ 跨境情报电台",
  live: "实时",
  dispatches: "条情报",
  actNow: "需立即行动",
  heroPre: "跨境",
  heroEm: "情报",
  heroPost: "，即时直达。",
  heroSub: "法规变动、平台政策、物流冲击与趋势信号 —— 覆盖六大区域，按「需要多快行动」分级。",
  region: "区域",
  type: "类型",
  all: "全部",
  today: "今天早些",
  yesterday: "昨天",
  last1h: "最近 1 小时",
  last4h: "最近 4 小时",
  last8h: "最近 8 小时",
  empty: "没有符合该筛选的情报",
  loadEarlier: "加载更早 ↓",
  footer: "TradeLinks · 六大区跨境情报 · 预警为摘要 —— 请以原文为准",
  tierAct: "立即行动",
  tierWatch: "值得关注",
  tierFyi: "了解即可",
  act: "建议",
  moreSources: (n) => `另有 ${n} 个来源`,
  radarEyebrow: "◆ 趋势雷达",
  radarPre: "跨区",
  radarEm: "扩散",
  radarSub: "某品类在成熟市场已起量、在其他区域仍滞后 —— 扩散前的早期窗口。是信号，不是预言。",
  diffusionSignals: "扩散信号",
  risingNow: "正在上升",
  bestsellers: "热销榜",
  bestsellersSub: "各区域亚马逊畅销榜中正在涌现的热门产品 —— 按品类划分的原始爆品信号。",
  bestsellersEmpty: "暂无热销数据 —— 请运行亚马逊采集。",
  bestsellersTeaser: "六大区域爆品榜 —— 打开趋势雷达",
  kpiProducts: "在追踪商品",
  kpiRegions: "覆盖区域",
  kpiFeeds: "品类信息源",
  kpiSignals: "扩散信号",
  viralX: "X 爆品信号",
  viralXSub: "正在 X（推特）上走红的消费品 —— 早期社交信号，常先于亚马逊爆品榜出现。",
  viralXEmpty: "暂无 X 爆品信号 —— 开启 X 信息源（X_ENABLED）后开始采集。",
  hotX: "X 跨境热点",
  hotXSub: "跨境电商卖家正在 X 上热议的话题 —— 平台规则变动、关税清关、物流与平台动向。",
  hotXEmpty: "暂无跨境热点 —— 开启 X 信息源（X_ENABLED）后开始采集。",
  dailyEyebrow: "◆ 每日观察",
  dailyPre: "昨日，",
  dailyEm: "已解读",
  dailySub: "每天一篇原创简报 —— 把真正重要的政策变动与爆品风向综合成「该怎么做」。由编辑台撰写，发布前先做事实核查。",
  dailyEmpty: "暂未发布每日简报 —— 每天清晨在此更新。",
  kindBrief: "政策简报",
  kindRoundup: "爆品观察",
  dailyBy: "作者 Agent Joey · TradeLinks",
  dailyTakeaways: "要点速览",
  dailySources: "来源",
  dailyBackToAll: "← 返回全部简报",
  homeMastheadPre: "全球跨境电商",
  homeMastheadEm: "情报",
  homeMastheadPost: "。",
  homeMastheadSub: "预警政策与物流中断、预测爆品的跨区扩散、每天一篇原创解读 —— 我们追踪三类情报：",
  glance: "今日速览",
  seeAll: "全部",
  breaking: "突发",
  topStory: "头条",
  latest: "最新",
  earlier: "更早",
  streamWire: "预警",
  streamWireSub: "实时法规与物流预警",
  streamRadar: "爆品",
  streamRadarSub: "畅销榜 + 社媒信号",
  streamX: "X 热议",
  streamXSub: "卖家与从业者正在讨论什么",
  streamDaily: "每日洞察",
  streamDailySub: "每天一篇原创解读",
  cntToday: "今日",
  cntMoving: "异动",
  cntNew: "新",
  earlierOtherHint: "切到该板块查看完整内容流。",
  subscribeTitle: "高紧急预警不漏接",
  subscribeSub: "把你关注的预警与品类推到 Telegram、Slack 或邮件。",
  subscribeCta: "设置推送",
};

const DICTS: Record<Lang, Dict> = { en, zh };

export async function getLang(): Promise<Lang> {
  // Locale is resolved from the URL by middleware.ts and passed via x-tl-lang.
  const h = (await headers()).get("x-tl-lang");
  return h === "zh" ? "zh" : "en";
}

export async function getDict(): Promise<{ lang: Lang; t: Dict }> {
  const lang = await getLang();
  return { lang, t: DICTS[lang] };
}
