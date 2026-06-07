import { NextResponse, type NextRequest, type NextFetchEvent } from "next/server";
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

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/admin")) {
    return authMiddleware ? authMiddleware(req, event) : NextResponse.next();
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
