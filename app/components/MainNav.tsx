"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Horizontal content nav with active-route highlight. `More` is a placeholder
 * for overflow as sections grow. */
export function MainNav({ items, moreLabel }: { items: { href: string; label: string }[]; moreLabel: string }) {
  const path = usePathname() ?? "/";
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <nav className="hidden items-center gap-6 text-[14px] md:flex">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={active(it.href) ? "font-semibold text-paper" : "text-muted transition-colors hover:text-paper"}
        >
          {it.label}
        </Link>
      ))}
      <span className="cursor-default select-none text-faint">{moreLabel} ▾</span>
    </nav>
  );
}
