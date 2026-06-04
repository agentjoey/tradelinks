import { auth } from "../../../lib/auth";

export const dynamic = "force-dynamic";

// Proxy all Neon Auth requests through this handler. If auth isn't configured
// (env missing), return 503 instead of crashing the route.
function unconfigured() {
  return new Response("auth not configured", { status: 503 });
}
const h = auth ? auth.handler() : null;
export const GET = h ? h.GET : unconfigured;
export const POST = h ? h.POST : unconfigured;
