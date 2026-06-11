"use client";
import { useEffect, useRef, useState } from "react";

interface Account { profile: string; billing: string; settings: string; signout: string }

/**
 * Right-side account cluster: Alerts (subscribe) · Upgrade · language toggle ·
 * avatar dropdown (Profile/Billing/Settings/Sign out). The dropdown is where
 * future SaaS surfaces hang, keeping the editorial nav clean. Links are
 * placeholders for now — BL-026 wires the entry points only.
 */
export function AccountNav({
  alertsLabel, upgradeLabel, account, langHref, langLabel,
}: {
  alertsLabel: string; upgradeLabel: string; account: Account; langHref: string; langLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div className="flex items-center gap-2.5">
      <a
        href="#subscribe"
        className="ticker hidden items-center gap-1.5 rounded-md border border-linestrong px-2.5 py-1.5 text-[12px] text-muted transition-colors hover:border-signal/50 hover:text-paper sm:inline-flex"
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {alertsLabel}
      </a>
      <a href="#upgrade" className="inline-flex items-center rounded-md bg-signal px-3 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:bg-signal/90">
        {upgradeLabel}
      </a>
      <a href={langHref} className="ticker inline-flex rounded-md border border-linestrong px-2 py-1.5 text-[12px] text-paper transition-colors hover:border-signal/50">
        {langLabel}
      </a>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="ticker flex h-9 w-9 items-center justify-center rounded-full border border-linestrong bg-surface2 text-[12px] font-semibold text-signal transition-colors hover:border-signal/50"
        >
          AJ
        </button>
        {open && (
          <div role="menu" className="absolute right-0 mt-2 w-44 overflow-hidden rounded-lg border border-linestrong bg-surface2 py-1 shadow-2xl shadow-black/50">
            {[account.profile, account.billing, account.settings].map((label) => (
              <a key={label} href="#" role="menuitem" className="block px-4 py-2 text-[13px] text-muted transition-colors hover:bg-surface hover:text-paper">{label}</a>
            ))}
            <div className="my-1 h-px bg-line" />
            <a href="#" role="menuitem" className="block px-4 py-2 text-[13px] text-muted transition-colors hover:bg-surface hover:text-paper">{account.signout}</a>
          </div>
        )}
      </div>
    </div>
  );
}
