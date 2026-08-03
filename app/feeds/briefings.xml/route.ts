import { renderPublicFeed } from "../../../src/public-intelligence/feeds.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return renderPublicFeed({ kind: "briefings" });
}
