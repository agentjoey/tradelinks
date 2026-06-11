"use client";
import { useEffect, useState, type FormEvent } from "react";

const KEY = "tl_sub_dismissed";

/** Floating, dismissible bottom bar for non-subscribed visitors. Wired to the
 * BL-043 email subscribe endpoint (double opt-in). */
export function SubscribeBar({ title, sub, cta }: { title: string; sub: string; cta: string }) {
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== "1") setShow(true);
    } catch {
      setShow(true);
    }
  }, []);
  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("loading");
    try {
      await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } catch {
      /* neutral confirmation regardless (no enumeration) */
    }
    setState("done");
    try {
      localStorage.setItem(KEY, "1"); // don't nag after they subscribe
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40">
      <div className="relative mx-auto m-3 max-w-3xl rounded-xl border border-signal/40 bg-surface2/95 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur sm:m-4">
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="absolute right-2 top-2 px-1 text-lg leading-none text-faint transition-colors hover:text-paper"
        >
          ×
        </button>
        <div className="flex flex-col gap-3 pr-5 sm:flex-row sm:items-center sm:gap-3 sm:pr-2">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-signal/15 text-signal">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.7 21a2 2 0 0 1-3.4 0" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-semibold leading-tight text-paper">{title}</div>
              <p className="text-[12px] leading-tight text-muted">
                {state === "done" ? "Check your inbox to confirm." : sub}
              </p>
            </div>
          </div>
          {state !== "done" && (
            <form onSubmit={submit} className="flex items-center gap-2 sm:shrink-0">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                aria-label="Email address"
                className="min-w-0 flex-1 rounded-md border border-signal/30 bg-surface px-2 py-1.5 text-[12px] text-paper placeholder:text-faint sm:w-48 sm:flex-none"
              />
              <button
                type="submit"
                disabled={state === "loading"}
                className="ticker shrink-0 rounded-md bg-signal px-3 py-2 text-[12px] font-semibold text-ink transition-colors hover:bg-signal/90 disabled:opacity-50"
              >
                {state === "loading" ? "…" : cta}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
