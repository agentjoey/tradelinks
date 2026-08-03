import type { Metadata } from "next";
import { Fraunces, Schibsted_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { getDict } from "./lib/i18n";
import { Analytics } from "./components/Analytics";
import "./globals.css";
import { cookies, headers } from "next/headers";
import Script from "next/script";
import { alternatesFor } from "./lib/locale";
import { parseTheme, THEME_COOKIE } from "./lib/theme";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";

const display = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display",
});
const sans = Schibsted_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export async function generateMetadata(): Promise<Metadata> {
  const path = (await headers()).get("x-tl-path") ?? "/";
  const lang = (await headers()).get("x-tl-lang") === "zh" ? "zh" : "en";
  const alt = alternatesFor(path, SITE);
  return {
    metadataBase: new URL(SITE),
    title: "TradeLinks — Cross-Border Intelligence Wire",
    description:
      "Evidence-backed US market-entry intelligence for cross-border sellers — regulatory, platform-policy and compliance changes with sources, readiness and review dates.",
    alternates: {
      canonical: alt.canonical,
      languages: { en: alt.languages.en, "zh-Hans": alt.languages.zh, "x-default": alt.xDefault },
    },
    openGraph: {
      title: "TradeLinks",
      description: "Evidence-backed US market intelligence for cross-border sellers.",
      type: "website",
      locale: lang === "zh" ? "zh_CN" : "en_US",
    },
  };
}

/**
 * Root layout: providers and metadata only. Navigation chrome is owned by the
 * route-group layouts (public / admin) so two nav systems never render
 * together. Light is the default theme: an absent tl-theme cookie resolves to
 * "light" here; parseTheme stays the cookie-value parser (dark is only ever
 * an explicit choice).
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang } = await getDict();
  const cookieTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = cookieTheme ? parseTheme(cookieTheme) : "light";
  return (
    <html lang={lang} data-theme={theme} suppressHydrationWarning className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        <Script id="theme-init" strategy="beforeInteractive">{`
          try {
            if (!/(^| )${THEME_COOKIE}=/.test(document.cookie)) {
              var t = localStorage.getItem("${THEME_COOKIE}");
              if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
            }
          } catch (e) {}
        `}</Script>
        {/* grain overlay sits at z-0; content stays above it */}
        <div className="relative z-10">{children}</div>
        <Analytics />
      </body>
    </html>
  );
}
