"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ThemeToggle } from "../components/ThemeToggle";
import type { Theme } from "../lib/theme";

export const PUBLIC_NAV_ITEMS = [
  { href: "/us", label: "US Market" },
  { href: "/amazon-us", label: "Amazon US" },
  { href: "/shopify-us", label: "Shopify US" },
  { href: "/categories", label: "Categories" },
  { href: "/changes", label: "Changes" },
  { href: "/guides", label: "Guides" },
  { href: "/briefings", label: "Briefings" },
  { href: "/coverage", label: "Coverage" },
] as const;

function isActive(href: string, pathname: string): boolean {
  // The home page is the US-market overview, so US Market carries current on "/".
  if (href === "/us") return pathname === "/" || pathname.startsWith("/us");
  return pathname.startsWith(href);
}

/**
 * Phase 1 public primary navigation (DESIGN.md): the approved eight items in
 * a single row that collapses to a horizontally scrollable row on narrow
 * viewports — structural, never a hamburger. English-only for Phase 1.
 */
export function PublicNav({ initialTheme }: { initialTheme: Theme }) {
  const pathname = usePathname() ?? "/";
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-[88rem] flex-col gap-3 px-5 py-3.5 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:gap-9">
          <Link href="/" className="leading-none">
            <div className="ticker mb-1 text-[9px] uppercase tracking-[0.3em] text-signal">
              US market intelligence
            </div>
            <div className="font-display text-[22px] leading-none tracking-tight">
              Trade<span className="italic text-signal">Links</span>
            </div>
          </Link>
          <nav
            aria-label="Primary"
            className="-mx-1 flex gap-5 overflow-x-auto px-1 pb-0.5 lg:gap-6"
          >
            {PUBLIC_NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(item.href, pathname) ? "page" : undefined}
                className="whitespace-nowrap border-b border-transparent py-2 text-meta text-muted transition-colors duration-200 hover:text-ink aria-[current=page]:border-signal aria-[current=page]:font-medium aria-[current=page]:text-ink lg:py-0.5"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex flex-none items-center justify-end gap-3">
          <ThemeToggle initial={initialTheme} label="Toggle theme" />
          <span className="ticker text-label uppercase tracking-[0.08em] text-faint">EN</span>
        </div>
      </div>
    </header>
  );
}
