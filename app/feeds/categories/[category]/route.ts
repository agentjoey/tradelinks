import {
  renderPublicFeed,
  resolveCategoryScope,
} from "../../../../src/public-intelligence/feeds.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The param arrives with the .xml suffix (e.g. "pet-supplies.xml"). Unknown
// scopes and missing suffixes are a 404, never an empty feed.
export async function GET(_req: Request, ctx: { params: { category: string } }) {
  const scope = resolveCategoryScope(ctx.params.category);
  if (!scope) {
    return new Response("Not found\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return renderPublicFeed(scope);
}
