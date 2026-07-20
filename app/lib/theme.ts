export type Theme = "dark" | "light";
export const THEME_COOKIE = "tl-theme";

/** Cookie/localStorage value → theme. Dark is the default; anything else → dark. */
export function parseTheme(v: string | undefined | null): Theme {
  return v === "light" ? "light" : "dark";
}
