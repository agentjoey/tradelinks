import Link from "next/link";
import { cookies, headers } from "next/headers";
import { getDict } from "../lib/i18n";
import { addLocale, stripLocale } from "../lib/locale";
import { parseTheme, THEME_COOKIE } from "../lib/theme";
import { MainNav } from "../components/MainNav";
import { MobileTabBar } from "../components/MobileTabBar";
import { AccountNav } from "../components/AccountNav";
import { ThemeToggle } from "../components/ThemeToggle";

/**
 * Legacy chrome. Before the public-shell inversion these routes (/wire,
 * /trends, /daily, /subscribe, /auth) inherited the root layout's header,
 * footer, skip link and max-w-[88rem] container. Task 2 reduced the root
 * layout to providers/metadata, so that chrome is restored here unchanged
 * until Task 9 retires these routes. Only the theme default follows the new
 * rule (absent cookie resolves to light); everything else is the pre-Task-2
 * markup verbatim.
 */
export default async function LegacyLayout({ children }: { children: React.ReactNode }) {
  const { lang, t } = await getDict();
  const other: "en" | "zh" = lang === "zh" ? "en" : "zh";
  const curPath = (await headers()).get("x-tl-path") ?? "/";
  const toggleHref = addLocale(stripLocale(curPath), other);
  const cookieTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = cookieTheme ? parseTheme(cookieTheme) : "light";
  return (
    <>
      {/* live signal bar */}
      <div className="fixed top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-signal/70 to-transparent animate-pulse-bar z-30" />

      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-chipbg focus:px-4 focus:py-2 focus:text-meta focus:font-semibold focus:text-chipink">
        Skip to content
      </a>
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 backdrop-blur">
        <div className="mx-auto max-w-[88rem] px-5 sm:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <Link href={addLocale("/", lang)} className="leading-none">
              <div className="ticker text-[9px] uppercase tracking-[0.3em] text-signal/80 mb-1">
                {t.eyebrow}
              </div>
              <div className="font-display text-[22px] leading-none tracking-tight">
                Trade<span className="italic text-signal">Links</span>
              </div>
            </Link>
            <MainNav
              items={[
                { href: addLocale("/", lang), label: t.nav.home },
                { href: addLocale("/wire", lang), label: t.nav.wire },
                { href: addLocale("/trends", lang), label: t.nav.radar },
                { href: addLocale("/daily", lang), label: t.nav.daily },
              ]}
              moreLabel={t.nav.more}
              lang={lang}
              menu={{ subscribe: t.navSubscribe, telegram: t.navTelegram, rss: t.navRss }}
            />
          </div>
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

      <main id="main" className="mx-auto max-w-[88rem] px-5 sm:px-8 py-8 pb-24 md:pb-8">{children}</main>

      <footer className="mx-auto max-w-[88rem] px-5 sm:px-8 py-10 mt-6 border-t border-line flex flex-wrap items-center justify-between gap-3">
        <p className="ticker text-[10px] uppercase tracking-[0.2em] text-faint">{t.footer}</p>
        <a href="/feed.xml" className="ticker text-[10px] uppercase tracking-[0.2em] text-faint transition-colors hover:text-signal">RSS</a>
      </footer>
      <MobileTabBar lang={lang} labels={{ home: t.nav.home, wire: t.nav.wire, radar: t.nav.radar, daily: t.nav.daily }} />
    </>
  );
}
