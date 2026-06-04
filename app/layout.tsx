import type { Metadata } from "next";
import Link from "next/link";
import { Fraunces, Schibsted_Grotesk, IBM_Plex_Mono } from "next/font/google";
import { getDict } from "./lib/i18n";
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
          <header className="border-b border-line">
            <div className="mx-auto max-w-[64rem] px-5 sm:px-8 py-4 flex items-end justify-between">
              <Link href="/" className="leading-none">
                <div className="ticker text-[10px] uppercase tracking-[0.34em] text-signal/80 mb-1.5">
                  {t.eyebrow}
                </div>
                <div className="font-display text-[26px] leading-none tracking-tight">
                  Trade<span className="italic text-signal">Links</span>
                </div>
              </Link>
              <nav className="ticker text-[11px] uppercase tracking-[0.2em] text-muted flex items-center gap-5">
                <Link href="/" className="hover:text-paper transition-colors">{t.nav.wire}</Link>
                <Link href="/trends" className="hover:text-paper transition-colors">{t.nav.radar}</Link>
                <Link href="/admin/review" className="hover:text-paper transition-colors">{t.nav.desk}</Link>
                <a href="/feed.xml" className="hover:text-paper transition-colors">RSS</a>
                <a href={`/api/lang?l=${other}`}
                   className="rounded-sm border border-line px-1.5 py-0.5 text-paper/70 hover:border-signal/40 hover:text-signal transition-colors">
                  {other === "zh" ? "中" : "EN"}
                </a>
              </nav>
            </div>
          </header>

          <main className="mx-auto max-w-[64rem] px-5 sm:px-8 py-8">{children}</main>

          <footer className="mx-auto max-w-[64rem] px-5 sm:px-8 py-10 mt-6 border-t border-line">
            <p className="ticker text-[10px] uppercase tracking-[0.2em] text-faint">{t.footer}</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
