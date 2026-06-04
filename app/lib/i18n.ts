import { cookies } from "next/headers";

export type Lang = "en" | "zh";
export const LANGS: Lang[] = ["en", "zh"];

export interface Dict {
  nav: { wire: string; radar: string; desk: string };
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
}

const en: Dict = {
  nav: { wire: "Wire", radar: "Radar", desk: "Desk" },
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
  today: "Today",
  yesterday: "Yesterday",
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
};

const zh: Dict = {
  nav: { wire: "情报流", radar: "趋势雷达", desk: "审核台" },
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
  today: "今天",
  yesterday: "昨天",
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
};

const DICTS: Record<Lang, Dict> = { en, zh };

export async function getLang(): Promise<Lang> {
  const c = (await cookies()).get("tl_lang")?.value;
  return c === "zh" ? "zh" : "en";
}

export async function getDict(): Promise<{ lang: Lang; t: Dict }> {
  const lang = await getLang();
  return { lang, t: DICTS[lang] };
}
