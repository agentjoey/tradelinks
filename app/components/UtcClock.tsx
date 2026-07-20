"use client";
import { useEffect, useState } from "react";

/** Ticking UTC clock (1s). Renders placeholders on SSR to avoid hydration mismatch. */
export function UtcClock({ className }: { className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const f = () => setNow(Date.now());
    f();
    const id = setInterval(f, 1000);
    return () => clearInterval(id);
  }, []);
  const d = new Date(now ?? 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    <span className={className}>
      {now === null
        ? "··:··:··"
        : `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} · ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} UTC`}
    </span>
  );
}
