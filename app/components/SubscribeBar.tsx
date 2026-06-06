"use client";
import { useEffect, useState } from "react";

const KEY = "tl_sub_dismissed";

/** Floating, dismissible bottom bar shown to non-subscribed visitors, inviting
 * push setup. Entry point only — wiring lands with BL-039. */
export function SubscribeBar({ title, sub, cta }: { title: string; sub: string; cta: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem(KEY) !== "1") setShow(true); } catch { setShow(true); }
  }, []);
  if (!show) return null;

  const dismiss = () => {
    try { localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
    setShow(false);
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-40">
      <div className="mx-auto m-3 flex max-w-3xl items-center gap-3 rounded-xl border border-signal/40 bg-surface2/95 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur sm:m-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-signal/15 text-signal">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold leading-tight text-paper">{title}</div>
          <p className="text-[12px] leading-tight text-muted">{sub}</p>
        </div>
        <a href="#upgrade" className="ticker shrink-0 rounded-md bg-signal px-3 py-2 text-[12px] font-semibold text-ink transition-colors hover:bg-signal/90">{cta}</a>
        <button onClick={dismiss} aria-label="Dismiss" className="shrink-0 px-1 text-lg leading-none text-faint transition-colors hover:text-paper">×</button>
      </div>
    </div>
  );
}
