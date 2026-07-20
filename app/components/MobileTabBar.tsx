"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { addLocale, stripLocale } from "../lib/locale";
import type { Lang } from "../lib/i18n";

const PATHS: Record<string, string> = {
  home: "M3 10.5 12 3l9 7.5M5 9.5V21h14V9.5",
  wire: "M13 2 4.5 13.5H11L9.5 22 19 9.5h-6.5L13 2z",
  radar: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
  daily: "M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4zM8 9h8M8 13h8M8 17h5",
};

/** Mobile bottom tab bar (md:hidden): Home / Wire / Radar / Daily with active state. */
export function MobileTabBar({ lang, labels }: { lang: Lang; labels: { home: string; wire: string; radar: string; daily: string } }) {
  const pathname = usePathname() ?? "/";
  const cur = stripLocale(pathname);
  const tabs = [
    { key: "home", href: "/" },
    { key: "wire", href: "/wire" },
    { key: "radar", href: "/trends" },
    { key: "daily", href: "/daily" },
  ] as const;
  return (
    <nav aria-label="Mobile" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-canvas/90 backdrop-blur md:hidden">
      {tabs.map((t) => {
        const active = t.href === "/" ? cur === "/" : cur.startsWith(t.href);
        return (
          <Link
            key={t.key}
            href={addLocale(t.href, lang)}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-[3px] pb-[env(safe-area-inset-bottom)] font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
              active ? "text-signal" : "text-faint hover:text-ink"
            }`}
          >
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={PATHS[t.key]} /></svg>
            {labels[t.key]}
          </Link>
        );
      })}
    </nav>
  );
}
