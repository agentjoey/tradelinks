import { handleApiCoverage } from "../../../../src/public-intelligence/api.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  return handleApiCoverage(req);
}
