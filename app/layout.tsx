import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Schibsted_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { getDict } from "./lib/i18n";
import { Analytics } from "./components/Analytics";
import { MainNav } from "./components/MainNav";
import { AccountNav } from "./components/AccountNav";
import "./globals.css";

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

export const metadata: Metadata = {
  title: "TradeLinks — Cross-Border Intelligence Wire",
  description:
    "Real-time regulatory, platform-policy, logistics and trend alerts for cross-border sellers across 6 regions.",
  openGraph: {
    title: "TradeLinks",
    description: "Global cross-border e-commerce alerts & trend signals.",
    type: "website",
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { lang, t } = await getDict();
  const other: "en" | "zh" = lang === "zh" ? "en" : "zh";
  return (
    <html lang={lang} className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen font-sans antialiased">
        {/* live signal bar */}
        <div className="fixed top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-signal/70 to-transparent animate-pulse-bar z-30" />

        <div className="relative z-10">
          <header className="sticky top-0 z-30 border-b border-line bg-ink/85 backdrop-blur">
            <div className="mx-auto max-w-[64rem] px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
              <div className="flex items-center gap-8">
                <Link href="/" className="leading-none">
                  <div className="ticker text-[9px] uppercase tracking-[0.3em] text-signal/80 mb-1">
                    {t.eyebrow}
                  </div>
                  <div className="font-display text-[22px] leading-none tracking-tight">
                    Trade<span className="italic text-signal">Links</span>
                  </div>
                </Link>
                <MainNav
                  items={[
                    { href: "/", label: t.nav.home },
                    { href: "/wire", label: t.nav.wire },
                    { href: "/trends", label: t.nav.radar },
                    { href: "/daily", label: t.nav.daily },
                  ]}
                  moreLabel={t.nav.more}
                />
              </div>
              <AccountNav
                alertsLabel={t.navAlerts}
                upgradeLabel={t.navUpgrade}
                account={t.account}
                langHref={`/api/lang?l=${other}`}
                langLabel={other === "zh" ? "ZH" : "EN"}
              />
            </div>
          </header>

          <main className="mx-auto max-w-[64rem] px-5 sm:px-8 py-8">{children}</main>

          <footer className="mx-auto max-w-[64rem] px-5 sm:px-8 py-10 mt-6 border-t border-line flex flex-wrap items-center justify-between gap-3">
            <p className="ticker text-[10px] uppercase tracking-[0.2em] text-faint">{t.footer}</p>
            <a href="/feed.xml" className="ticker text-[10px] uppercase tracking-[0.2em] text-faint transition-colors hover:text-signal">RSS</a>
          </footer>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
