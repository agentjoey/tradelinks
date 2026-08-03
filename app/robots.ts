import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

// Public Intelligence Task 8 robots policy.
//
// `/api/v1/` and `/openapi.json` are ALLOWED deliberately: Task 7 shipped
// them as public machine surfaces built for agent consumption — a public API
// that robots.txt hides is invisible to the consumers it exists for. They
// are read-only, cache-controlled and carry the same visibility gate as the
// pages. Everything else under `/api` (img-proxy, auth callbacks, internal
// routes) stays disallowed. Per RFC 9309 the longest matching rule wins, so
// `Allow: /api/v1/` beats `Disallow: /api` for exactly the public prefix.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/v1/", "/openapi.json"],
        disallow: ["/admin", "/auth", "/my", "/onboarding/preview", "/api"],
      },
    ],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
