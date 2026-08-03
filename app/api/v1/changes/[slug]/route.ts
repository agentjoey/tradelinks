import { handleApiGetChange } from "../../../../../src/public-intelligence/api.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, ctx: { params: { slug: string } }) {
  return handleApiGetChange(ctx.params.slug, req);
}
