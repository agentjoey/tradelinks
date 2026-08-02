import Link from "next/link";
import { cookies, headers } from "next/headers";
import { requireAdmin } from "../lib/auth";
import { getDict } from "../lib/i18n";
import { addLocale, stripLocale } from "../lib/locale";
import { parseTheme, THEME_COOKIE } from "../lib/theme";
import { AccountNav } from "../components/AccountNav";
import { ThemeToggle } from "../components/ThemeToggle";

// Gate every /admin/* route: signed in (Neon Auth / Google) + on the allowlist.
export const dynamic = "force-dynamic";

/**
 * Admin chrome. The root layout is providers/metadata only, so the desk owns
 * its navigation here — AccountNav (alerts / upgrade / language / desk menu)
 * moved down from the old root header. Public navigation never renders on
 * admin surfaces.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const { lang, t } = await getDict();
  const other: "en" | "zh" = lang === "zh" ? "en" : "zh";
  const curPath = (await headers()).get("x-tl-path") ?? "/";
  const toggleHref = addLocale(stripLocale(curPath), other);
  const cookieTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = cookieTheme ? parseTheme(cookieTheme) : "light";
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[88rem] items-center justify-between gap-4 px-5 sm:px-8">
          <Link href={addLocale("/", lang)} className="leading-none">
            <div className="ticker mb-1 text-[9px] uppercase tracking-[0.3em] text-signal/80">{t.eyebrow}</div>
            <div className="font-display text-[22px] leading-none tracking-tight">
              Trade<span className="italic text-signal">Links</span>
            </div>
          </Link>
          <div className="flex items-center gap-2.5">
            <ThemeToggle initial={theme} label={t.themeToggle} />
            <AccountNav
              alertsLabel={t.navAlerts}
              upgradeLabel={t.navUpgrade}
              deskLabel={t.nav.desk}
              sourcesLabel={t.nav.sources}
              langHref={toggleHref}
              langLabel={other === "zh" ? "ZH" : "EN"}
            />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto max-w-[88rem] px-5 py-8 sm:px-8">
        {children}
      </main>
    </>
  );
}
