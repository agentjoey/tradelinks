import { cookies } from "next/headers";
import { parseTheme, THEME_COOKIE } from "../lib/theme";
import type { Theme } from "../lib/theme";
import { PublicNav } from "./PublicNav";
import { PublicFooter } from "./PublicFooter";

/**
 * PublicShell: skip link → PublicNav → <main id="main"> → PublicFooter
 * (DESIGN.md §Layout). Public and admin navigation never render together —
 * this shell is the only chrome inside the (public) route group. `wide`
 * switches the reading column to the coverage/index width.
 */
export function PublicShell({
  children,
  initialTheme,
  wide = false,
}: {
  children: React.ReactNode;
  initialTheme: Theme;
  wide?: boolean;
}) {
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <PublicNav initialTheme={initialTheme} />
      <main id="main" className={`mx-auto w-full px-5 py-7 sm:px-8 ${wide ? "max-w-[88rem]" : "max-w-[64rem]"}`}>
        {children}
      </main>
      <PublicFooter />
    </>
  );
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const cookieTheme = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = cookieTheme ? parseTheme(cookieTheme) : "light";
  return <PublicShell initialTheme={theme}>{children}</PublicShell>;
}
