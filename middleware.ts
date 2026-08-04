import { NextRequest, NextResponse } from "next/server";
import { auth } from "./app/lib/auth";
import { localeFromPath, stripLocale } from "./app/lib/locale";
import { getLegacyRedirect } from "./src/public-intelligence/legacy-redirects";

/**
 * Three concerns in one middleware:
 *  - /admin/*  → Neon Auth (session refresh; allowlist still enforced in the page).
 *  - legacy public routes, ONLY when PUBLIC_CUTOVER_ENABLED → 308 to the public
 *    contract target (Task 9b). Admin is matched first so it can never be
 *    redirected. The matcher excludes /api/, so the two API v0 entries in the
 *    map are handled in their own route files instead.
 *  - everything else → locale routing: detect /zh, rewrite to the underlying route,
 *    and inject x-tl-lang / x-tl-path so server components can read the active
 *    locale and the original path (for hreflang + the language toggle).
 *
 * The cutover is a config flip, not a code deploy: with the flag off this file
 * behaves exactly as it did before Task 9b, and flipping it back off restores
 * the legacy routes instantly. `/daily/[slug]` has no LegacyRedirect rows to
 * consult here — resolving them would mean a database round trip on every
 * request — so those fall back to the briefing index, which is the documented
 * behaviour of getLegacyRedirect for an unmapped slug.
 */
const authMiddleware = auth ? auth.middleware({ loginUrl: "/auth/sign-in" }) : null;

function cutoverEnabled(): boolean {
  const v = process.env.PUBLIC_CUTOVER_ENABLED;
  return v === "true" || v === "1";
}

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin")) {
    if (!authMiddleware) return NextResponse.next();
    // Task6-T3-r4: Neon Auth's get-session endpoint only answers GET — an
    // admin Server Action (POST) probed with its own method gets a 404 and a
    // spurious sign-in redirect even with a valid session. Check non-GET
    // admin requests with a GET probe carrying the same URL and headers; the
    // auth result (next/redirect/deny) is returned unchanged and never
    // replaces the original request method. requireAdmin() in each Server
    // Action remains the second authorization layer.
    if (req.method === "GET" || req.method === "HEAD") {
      return authMiddleware(req);
    }
    const probe = new NextRequest(req.url, {
      method: "GET",
      headers: req.headers,
    });
    return authMiddleware(probe);
  }

  if (cutoverEnabled()) {
    const redirect = getLegacyRedirect(pathname);
    if (redirect) {
      const url = new URL(redirect.target, req.nextUrl.origin);
      return NextResponse.redirect(url, redirect.status);
    }
  }

  const lang = localeFromPath(pathname);
  const headers = new Headers(req.headers);
  headers.set("x-tl-lang", lang);
  headers.set("x-tl-path", pathname);

  if (lang === "zh") {
    const url = req.nextUrl.clone();
    url.pathname = stripLocale(pathname);
    return NextResponse.rewrite(url, { request: { headers } });
  }
  return NextResponse.next({ request: { headers } });
}

// Run on admin + all public routes; skip Next internals, api, and static files.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|api/).*)"],
};
