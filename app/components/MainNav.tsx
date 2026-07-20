"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { addLocale, stripLocale } from "../lib/locale";
import type { Lang } from "../lib/i18n";

const ITEM_CLS =
  "flex items-center justify-between gap-4 rounded-sm px-3 py-2 text-[13px] text-muted outline-none transition-colors data-[highlighted]:bg-surface data-[highlighted]:text-ink";

/** Desktop content nav with active-route highlight + real More menu (Radix). */
export function MainNav({
  items, moreLabel, lang, menu,
}: {
  items: { href: string; label: string }[];
  moreLabel: string;
  lang: Lang;
  menu: { subscribe: string; telegram: string; rss: string };
}) {
  const path = usePathname() ?? "/";
  const active = (href: string) => {
    const p = stripLocale(path);
    const h = stripLocale(href);
    return h === "/" ? p === "/" : p.startsWith(h);
  };
  return (
    <nav className="hidden items-center gap-6 text-[14px] md:flex">
      {items.map((it) => (
        <Link
          key={it.href}
          href={it.href}
          className={active(it.href) ? "font-semibold text-ink" : "text-muted transition-colors hover:text-ink"}
        >
          {it.label}
        </Link>
      ))}
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger className="text-faint transition-colors hover:text-ink focus-visible:text-ink data-[state=open]:text-ink">
          {moreLabel} ▾
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={8}
            className="z-50 min-w-[12.5rem] rounded-md border border-linestrong bg-surface2 py-1 shadow-2xl shadow-black/50"
          >
            <DropdownMenu.Item asChild><Link href={addLocale("/subscribe", lang)} className={ITEM_CLS}>{menu.subscribe}<span className="ticker text-label text-faint">email</span></Link></DropdownMenu.Item>
            <DropdownMenu.Item asChild><Link href={addLocale("/subscribe", lang)} className={ITEM_CLS}>{menu.telegram}<span className="ticker text-label text-faint">bot</span></Link></DropdownMenu.Item>
            <DropdownMenu.Item asChild><a href="/feed.xml" className={ITEM_CLS}>{menu.rss}<span className="ticker text-label text-faint">xml</span></a></DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </nav>
  );
}
