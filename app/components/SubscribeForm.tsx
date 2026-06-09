"use client";
import { useState, type FormEvent } from "react";

export function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

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
      // network error — still show the neutral confirmation (no enumeration)
    }
    setState("done");
  }

  if (state === "done") {
    return <p className="text-sm text-neutral-600">Check your inbox to confirm your subscription.</p>;
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com"
        className="flex-1 rounded border border-neutral-300 px-3 py-2 text-sm"
        aria-label="Email address"
      />
      <button
        type="submit"
        disabled={state === "loading"}
        className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {state === "loading" ? "…" : "Get the brief"}
      </button>
    </form>
  );
}
