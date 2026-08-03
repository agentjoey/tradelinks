import { openApiDocument } from "../../src/public-intelligence/api.js";
import { PUBLIC_CACHE } from "../../src/public-intelligence/cache.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The machine-readable contract, served with the same PUBLIC_CACHE policy as
// every other public surface.
export async function GET() {
  return new Response(JSON.stringify(openApiDocument()), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": `public, s-maxage=${PUBLIC_CACHE.liveChangesRevalidate}, stale-while-revalidate=${PUBLIC_CACHE.canonicalChangeRevalidate}`,
    },
  });
}
