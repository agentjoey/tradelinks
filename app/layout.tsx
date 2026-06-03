import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "TradeLinks — Global Cross-Border E-commerce Alerts",
  description:
    "Real-time regulatory, platform-policy, logistics and trend alerts for cross-border sellers across 6 regions.",
  openGraph: {
    title: "TradeLinks",
    description: "Global cross-border e-commerce alerts & trend signals.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <header className="border-b border-border bg-panel/60 backdrop-blur sticky top-0 z-10">
          <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
            <Link href="/" className="font-semibold tracking-tight">
              Trade<span className="text-emerald-400">Links</span>
            </Link>
            <nav className="text-sm text-muted flex gap-4">
              <Link href="/" className="hover:text-ink">Alerts</Link>
              <Link href="/feed.xml" className="hover:text-ink">RSS</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-5xl px-4 py-8 text-xs text-muted">
          TradeLinks · 6-region cross-border intelligence · alerts are summaries; verify at source.
        </footer>
      </body>
    </html>
  );
}
