// 手动跑一次爆品复盘（发到 admin Telegram）。本地 .env 直连生产（单环境）。
import { runRadarReview } from "../src/workers/radar-review.js";

const r = await runRadarReview();
console.log("RADAR_REVIEW_DONE", JSON.stringify(r));
process.exit(0);
