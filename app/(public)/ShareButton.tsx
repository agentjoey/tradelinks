"use client";

import { useState } from "react";

import type { CanonicalPublicRecord } from "../../src/public-intelligence/types.js";

/**
 * The share contract (plan Task 4): only the canonical permalink is ever
 * shared — no query string, no tracking parameters, no filter state.
 */
export function canonicalSharePayload(
  record: Pick<CanonicalPublicRecord, "title" | "permalink">,
): { title: string; url: string } {
  return { title: record.title, url: record.permalink };
}

/**
 * Shares the canonical permalink via navigator.share when available and
 * copies it otherwise. Progressive enhancement only — the permalink itself
 * is always visible and copyable in the aside without JavaScript.
 */
export function ShareButton({
  record,
}: {
  record: Pick<CanonicalPublicRecord, "title" | "permalink">;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const payload = canonicalSharePayload(record);
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share(payload);
        return;
      } catch {
        // A dismissed share sheet is not an error; fall through to copy.
      }
    }
    try {
      await navigator.clipboard.writeText(payload.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions, insecure context) — the visible
      // permalink in the aside remains the no-JS path.
    }
  }

  return (
    <button
      type="button"
      onClick={share}
      className="inline-flex items-center justify-center rounded-md border border-line px-3 py-1.5 text-meta text-ink transition-colors duration-200 hover:border-linestrong hover:text-signal focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal"
    >
      {copied ? "Link copied" : "Share canonical link"}
    </button>
  );
}
