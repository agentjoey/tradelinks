// Shared demo input sets for the daily-note scripts (pipeline + seed). Pure data,
// no execution. `policy` → brief, `product` → roundup. The product set carries the
// richer detail an editor would fetch at write time (lever A): tweet gist, price/
// FOB, rank-delta size, historical diffusion lag.
import type { DailyNoteInput, DailyNoteKind } from "../src/daily/compose.js";

export const datasets: Record<string, Omit<DailyNoteInput, "lang">> = {
  policy: {
    date: "2026-06-05",
    alerts: [
      { id: "a1", title: "EU lowers de-minimis: €0 customs threshold for parcels from 2026", summary: "All imports become dutiable; IOSS registration effectively mandatory for marketplaces.", category: "regulatory", regions: ["europe"], urgencyScore: 4.6, actionRequired: "Register for IOSS and re-price EU SKUs to absorb duty", sourceUrl: "https://example.com/eu-deminimis" },
      { id: "a2", title: "Amazon raises EU FBA fulfilment fees 4–7% effective July", summary: "Size-tier reshuffle hits small-and-light worst.", category: "platform_policy", regions: ["europe"], urgencyScore: 3.2, actionRequired: "Audit small-and-light SKUs for margin", sourceUrl: "https://example.com/amazon-fba-eu" },
      { id: "a3", title: "Red Sea diversions push Asia–Europe ocean rates up 28%", summary: "Transit times +10–14 days into Q3.", category: "logistics", regions: ["europe", "southeast_asia"], urgencyScore: 3.5, actionRequired: "Pull forward Q3 inventory; book early", sourceUrl: "https://example.com/redsea-rates" },
      { id: "a4", title: "Indonesia tightens cross-border import licensing on TikTok Shop", summary: "Local-entity requirement expands.", category: "regulatory", regions: ["southeast_asia"], urgencyScore: 3.0, actionRequired: "Confirm local partner / entity status", sourceUrl: "https://example.com/id-tiktok" },
    ],
    signals: [
      { keyword: "portable neck fan", originRegion: "north_america", spreadingTo: ["southeast_asia", "middle_east"], confidence: 0.74 },
      { keyword: "collagen lip mask", originRegion: "europe", spreadingTo: ["north_america"], confidence: 0.61 },
    ],
    radar: [
      { kind: "product", title: "TikTokMadeMeBuyIt: magnetic phone-mount ring light", link: "https://x.com/i/web/status/1", likes: 412 },
      { kind: "bestseller", title: "Amazon Movers: mini portable blender +180 ranks (Home)", link: "https://example.com/bsr" },
    ],
    recentTitles: ["Jun 4: SEA logistics squeeze and the rise of the $7 gadget"],
  },
  product: {
    date: "2026-06-05",
    alerts: [
      { id: "p0", title: "TikTok Shop US cuts new-seller commission to 2% (from 8%) through Aug 31", summary: "Promo to pull sellers off Amazon; applies to first $50k GMV per new shop.", category: "platform_policy", regions: ["north_america"], urgencyScore: 2.3, actionRequired: null, sourceUrl: "https://example.com/tiktok-commission" },
    ],
    signals: [
      { keyword: "portable neck fan (bladeless, ~$18 retail / ~$3.20 FOB)", originRegion: "north_america", spreadingTo: ["southeast_asia", "middle_east"], confidence: 0.81 },
      { keyword: "collagen lip mask (~$12 / 5-pack)", originRegion: "europe", spreadingTo: ["north_america"], confidence: 0.66 },
      { keyword: "LED sunset projector lamp (~$23 retail / ~$5 FOB)", originRegion: "north_america", spreadingTo: ["europe", "southeast_asia"], confidence: 0.72 },
      { keyword: "ice roller facial (~$9 retail)", originRegion: "north_america", spreadingTo: ["middle_east"], confidence: 0.58 },
    ],
    radar: [
      { kind: "product", title: '#TikTokMadeMeBuyIt mini portable blender, USB-C, one-charge: top reply "took it on a 6h flight, blended frozen mango at the gate" — comments asking where to buy', link: "https://x.com/i/web/status/101", likes: 4200 },
      { kind: "product", title: "#AmazonFinds collapsible silicone travel cup, ~$14, pitched as plane/commute carry; review velocity +90% week-over-week", link: "https://x.com/i/web/status/102", likes: 1800 },
      { kind: "product", title: 'LED sunset projector lamp back in #roomtour cycle: "third summer it goes viral" — saturation risk flagged by a creator', link: "https://x.com/i/web/status/103", likes: 3100 },
      { kind: "bestseller", title: "Amazon Movers: portable neck fan +240 ranks to #14 in Home & Kitchen; top 3 listings all sub-$20, generic, no brand moat", link: "https://example.com/bsr-neckfan" },
      { kind: "bestseller", title: "Amazon Movers: ice roller +160 ranks in Beauty; ME average order value runs ~30% above US for self-care per prior diffusion notes", link: "https://example.com/bsr-iceroller" },
      { kind: "topic", title: "Diffusion history: last summer the neck-fan NA→SEA handoff took ~6 weeks; sellers who pre-positioned in week 1–2 caught the margin window before price collapse", link: "https://x.com/i/web/status/104", likes: 130 },
    ],
    recentTitles: ["Jun 4: SEA logistics squeeze and the rise of the $7 gadget"],
  },
};

export const kindFor: Record<string, DailyNoteKind> = { policy: "brief", product: "roundup" };
