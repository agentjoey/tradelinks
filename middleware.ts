import { auth } from "./app/lib/auth";

/**
 * Neon Auth middleware — validates/refreshes the session cookie and exposes it
 * to server components for /admin/*. Without this the OAuth session set at the
 * callback isn't picked up on /admin → infinite sign-in redirect loop.
 * Allowlist enforcement stays in app/admin/layout.tsx. Scoped to /admin so the
 * public Wire/Radar stay open.
 */
export default auth
  ? auth.middleware({ loginUrl: "/auth/sign-in" })
  : function middleware() {
      /* auth unconfigured → passthrough */
    };

export const config = {
  matcher: ["/admin/:path*"],
};
