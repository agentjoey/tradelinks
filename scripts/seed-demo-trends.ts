/**
 * Seed demo trend snapshots + run the REAL diffusion algorithm over them so
 * /trends renders for review (pytrends is rate-limited; this is deterministic).
 * Run: pnpm tsx scripts/seed-demo-trends.ts   | clean: --clean
 */
import { prisma } from "../src/db/client.js";
import { upsertSnapshot, replaceSignals } from "../src/trends/db.js";
import { detectDiffusion, type RegionPoint } from "../src/trends/diffusion.js";
import { scoreSeries } from "../src/trends/score.js";
import type { Region } from "../src/config/sources.js";

// keyword -> region -> {level, slope} (signalStrength derived via scoreSeries-like calc)
const DATA: Record<string, Partial<Record<Region, [number, number]>>> = {
  "neck fan": { north_america: [82, 26], europe: [64, 14], southeast_asia: [22, 4], middle_east: [18, 6], latin_america: [12, 2] },
  "portable blender": { north_america: [58, 8], europe: [71, 18], southeast_asia: [30, 5], latin_america: [20, 9] },
  "air fryer": { north_america: [76, 3], europe: [74, 2], australia_nz: [70, 5] },
  "led strip lights": { north_america: [66, 16], europe: [40, 6], southeast_asia: [55, 22], middle_east: [20, 3] },
  "mini projector": { europe: [62, 20], north_america: [48, 9], latin_america: [18, 4], middle_east: [15, 5] },
  "sunscreen stick": { australia_nz: [80, 24], north_america: [40, 10], europe: [28, 6], southeast_asia: [22, 8] },
};

function strength(level: number, slope: number) {
  // mirror scoreSeries weighting
  return scoreSeries([
    ...Array(24).fill(Math.max(0, level - slope)),
    ...Array(24).fill(level),
  ]);
}

async function main() {
  if (process.argv.includes("--clean")) {
    const a = await prisma.trendSnapshot.deleteMany({});
    const b = await prisma.trendSignal.deleteMany({});
    console.log("cleared snapshots:", a.count, "signals:", b.count);
    return;
  }

  let n = 0;
  const signals = [];
  for (const [keyword, regions] of Object.entries(DATA)) {
    const points: RegionPoint[] = [];
    for (const [region, lv] of Object.entries(regions)) {
      const [level, slope] = lv as [number, number];
      const sc = strength(level, slope);
      // override level/slope with our intended values, keep derived signalStrength
      const score = { level, slope, signalStrength: sc.signalStrength };
      await upsertSnapshot(region as Region, keyword, score);
      points.push({ region: region as Region, ...score });
      n++;
    }
    const sig = detectDiffusion(keyword, points);
    if (sig) signals.push(sig);
  }
  await replaceSignals(signals);
  console.log(`seeded ${n} snapshots; computed ${signals.length} diffusion signals`);
  for (const s of signals) console.log(`  ${s.keyword}: ${s.originRegion} → ${s.spreadingTo.join(",")} (${Math.round(s.confidence * 100)}%)`);
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
