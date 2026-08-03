import { handleApiListChanges } from "../../../../src/public-intelligence/api.js";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Anonymous public API v1. No user-agent gate: curl and other non-browser
// clients get the same 200 a browser would.
export async function GET(req: Request) {
  return handleApiListChanges(req);
}
