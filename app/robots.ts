import type { MetadataRoute } from "next";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api", "/auth"] }],
    sitemap: `${SITE}/sitemap.xml`,
    host: SITE,
  };
}
