import { NextRequest, NextResponse } from "next/server";
import { auth } from "./app/lib/auth";
import { localeFromPath, stripLocale } from "./app/lib/locale";

/**
 * Two concerns in one middleware:
 *  - /admin/*  → Neon Auth (session refresh; allowlist still enforced in the page).
 *  - everything else → locale routing: detect /zh, rewrite to the underlying route,
 *    and inject x-tl-lang / x-tl-path so server components can read the active
 *    locale and the original path (for hreflang + the language toggle).
 */
const authMiddleware = auth ? auth.middleware({ loginUrl: "/auth/sign-in" }) : null;

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
