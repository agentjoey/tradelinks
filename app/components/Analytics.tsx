"use client";
import { useEffect, useState } from "react";

// GA4 measurement IDs are public; `||` so an empty env still falls back.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || "G-4E8B257NHH";
const KEY = "tl_consent";

const COPY = {
  en: { msg: "We use cookies for anonymous analytics (Google Analytics) to understand traffic. No personal data is sold.", accept: "Accept", decline: "Decline" },
  zh: { msg: "我们使用 Cookie 进行匿名流量分析（Google Analytics），不出售任何个人数据。", accept: "接受", decline: "拒绝" },
};

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

// Inject gtag once. Called directly on Accept (deterministic) or on mount if a
// prior 'granted' choice exists — NOT via a consent-dependent effect (that proved
// flaky in the production build).
function loadGtag() {
  if (typeof window === "undefined" || !GA_ID || document.getElementById("ga4-src")) return;
  const s = document.createElement("script");
  s.id = "ga4-src";
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer.push(arguments);
  };
  window.gtag("js", new Date());
  window.gtag("config", GA_ID); // sends the first pageview
}

export function Analytics() {
  const [decided, setDecided] = useState<boolean | null>(null);
  const [lang, setLang] = useState<"en" | "zh">("en");

  useEffect(() => {
    setLang(document.cookie.includes("tl_lang=zh") ? "zh" : "en");
    const v = localStorage.getItem(KEY);
    if (v === "granted") loadGtag();
    setDecided(v === "granted" || v === "denied");
  }, []);

  // Note: SPA route-change pageviews are handled by GA4 Enhanced Measurement
  // ("page changes based on browser history"). We do NOT send a manual page_view
  // per route here, or in-app navigations would be double-counted.

  const accept = () => { localStorage.setItem(KEY, "granted"); loadGtag(); setDecided(true); };
  const decline = () => { localStorage.setItem(KEY, "denied"); setDecided(true); };

  if (decided !== false) return null;
  const c = COPY[lang];
  return (
    <div className="fixed inset-x-3 bottom-16 md:bottom-3 z-40 mx-auto flex max-w-[44rem] flex-col gap-3 rounded-lg border border-line bg-surface/95 p-3.5 shadow-lg backdrop-blur sm:flex-row sm:items-center">
      <p className="flex-1 text-[12px] leading-relaxed text-muted">{c.msg}</p>
      <div className="flex shrink-0 gap-2">
        <button onClick={decline} className="ticker rounded-md border border-line px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-muted transition-colors hover:border-ink/30 hover:text-ink">{c.decline}</button>
        <button onClick={accept} className="ticker rounded-md border border-signal/50 bg-signal/15 px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-signal transition-colors hover:bg-signal/25">{c.accept}</button>
      </div>
    </div>
  );
}
