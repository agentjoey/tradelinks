// app/lib/locale.ts
// Pure locale URL helpers. MUST stay dependency-free (imported by edge middleware).

export const LOCALES = ["en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** The locale a request path belongs to. Only "/zh" and "/zh/..." are zh. */
export function localeFromPath(pathname: string): Locale {
  return pathname === "/zh" || pathname.startsWith("/zh/") ? "zh" : "en";
}

/** Remove the "/zh" prefix, returning the underlying (en) path. "/zh" → "/". */
export function stripLocale(pathname: string): string {
  if (pathname === "/zh") return "/";
  if (pathname.startsWith("/zh/")) return pathname.slice(3); // drop "/zh"
  return pathname;
}

/** Add the locale prefix. en is unprefixed (as-needed scheme). Expects a stripped path. */
export function addLocale(pathname: string, locale: Locale): string {
  if (locale === "en") return pathname;
  return pathname === "/" ? "/zh" : `/zh${pathname}`;
}

export interface Alternates {
  canonical: string;
  languages: Record<Locale, string>;
  xDefault: string;
}

/** hreflang/canonical URL set for any request path. xDefault points at en. */
export function alternatesFor(pathname: string, site: string): Alternates {
  const base = stripLocale(pathname);
  const enUrl = `${site}${addLocale(base, "en")}`;
  const zhUrl = `${site}${addLocale(base, "zh")}`;
  const self = localeFromPath(pathname) === "zh" ? zhUrl : enUrl;
  return { canonical: self, languages: { en: enUrl, zh: zhUrl }, xDefault: enUrl };
}
