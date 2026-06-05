"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

// GA4 measurement IDs are public (embedded in client JS); env override optional.
const GA_ID = process.env.NEXT_PUBLIC_GA_ID ?? "G-4E8B257NHH";
const KEY = "tl_consent";

const COPY = {
  en: {
    msg: "We use cookies for anonymous analytics (Google Analytics) to understand traffic. No personal data is sold.",
    accept: "Accept",
    decline: "Decline",
  },
  zh: {
    msg: "我们使用 Cookie 进行匿名流量分析（Google Analytics），不出售任何个人数据。",
    accept: "接受",
    decline: "拒绝",
  },
};

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

/**
 * Minimal cookie-consent gate for GA4. We inject gtag MANUALLY once the visitor
 * accepts (next/third-parties' <GoogleAnalytics> doesn't reliably inject when
 * mounted client-side after a consent toggle). No analytics until consent.
 * `/admin` + `/auth` are excluded from pageview tracking.
 */
export function Analytics() {
  const [consent, setConsent] = useState<"granted" | "denied" | null | undefined>(undefined);
  const [lang, setLang] = useState<"en" | "zh">("en");
  const pathname = usePathname();
  const tracked = !pathname?.startsWith("/admin") && !pathname?.startsWith("/auth");

  useEffect(() => {
    const v = localStorage.getItem(KEY);
    setConsent(v === "granted" ? "granted" : v === "denied" ? "denied" : null);
    setLang(document.cookie.includes("tl_lang=zh") ? "zh" : "en");
  }, []);

  // Load gtag once, after consent is granted.
  useEffect(() => {
    if (consent !== "granted" || !GA_ID) return;
    if (document.getElementById("ga4-src")) return;
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
    window.gtag("config", GA_ID, { send_page_view: false });
  }, [consent]);

  // Send a pageview on each tracked route (and the first allowed view).
  useEffect(() => {
    if (consent !== "granted" || !GA_ID || !tracked) return;
    window.gtag?.("event", "page_view", { page_path: pathname, page_location: window.location.href });
  }, [pathname, consent, tracked]);

  const choose = (v: "granted" | "denied") => {
    localStorage.setItem(KEY, v);
    setConsent(v);
  };

  const c = COPY[lang];
  if (consent !== null) return null;
  return (
    <div className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-[44rem] flex-col gap-3 rounded-lg border border-line bg-surface/95 p-3.5 shadow-lg backdrop-blur sm:flex-row sm:items-center">
      <p className="flex-1 text-[12px] leading-relaxed text-muted">{c.msg}</p>
      <div className="flex shrink-0 gap-2">
        <button
          onClick={() => choose("denied")}
          className="ticker rounded-md border border-line px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-muted transition-colors hover:border-paper/30 hover:text-paper"
        >
          {c.decline}
        </button>
        <button
          onClick={() => choose("granted")}
          className="ticker rounded-md border border-signal/50 bg-signal/15 px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] text-signal transition-colors hover:bg-signal/25"
        >
          {c.accept}
        </button>
      </div>
    </div>
  );
}
