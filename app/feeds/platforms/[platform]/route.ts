import {
  renderPublicFeed,
  resolvePlatformScope,
} from "../../../../src/public-intelligence/feeds.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The param arrives with the .xml suffix (e.g. "amazon-us.xml"). Unknown
// scopes and missing suffixes are a 404, never an empty feed.
export async function GET(_req: Request, ctx: { params: { platform: string } }) {
  const scope = resolvePlatformScope(ctx.params.platform);
  if (!scope) {
    return new Response("Not found\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return renderPublicFeed(scope);
}
