/** Shared hand-rolled control classes (no component lib — cva-style functions). */

export const btnPrimary =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-chipbg px-5 py-2.5 text-[0.9375rem] font-semibold text-chipink transition hover:brightness-110 active:scale-[0.97] disabled:opacity-45 disabled:pointer-events-none";

export const btnGhost =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-linestrong px-5 py-2.5 text-[0.9375rem] font-semibold text-ink transition hover:border-signal hover:text-signal active:scale-[0.97]";

export const chipFilter = (active: boolean) =>
  `ticker rounded-full px-3 py-1.5 text-label uppercase transition-colors active:scale-[0.97] ${
    active ? "bg-chipbg text-chipink" : "border border-line text-muted hover:border-linestrong hover:text-ink"
  }`;

export const inputField =
  "min-h-[44px] w-full rounded-md border border-linestrong bg-surface px-3 py-2 text-[0.9375rem] text-ink placeholder:text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal";
