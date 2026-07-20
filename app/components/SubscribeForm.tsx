"use client";
import { useState, type FormEvent } from "react";

type State = "idle" | "loading" | "done" | "already" | "error";

export function SubscribeForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.status === 409) setState("already");
      else if (res.ok) setState("done");
      else setState("error");
    } catch {
      setState("error");
    }
  }

  if (state === "done") {
    return <p className="text-meta text-calm">✓ Check your inbox to confirm your subscription.</p>;
  }
  if (state === "already") {
    return <p className="text-meta text-muted">You&apos;re already on the list — the next brief lands as scheduled.</p>;
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@company.com"
          aria-label="Email address"
          aria-invalid={state === "error"}
          aria-describedby={state === "error" ? "sub-err" : undefined}
          className="min-h-[44px] flex-1 rounded-md border border-linestrong bg-surface px-3 py-2 text-[15px] text-ink placeholder:text-faint focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className="min-h-[44px] rounded-md bg-chipbg px-4 py-2 text-[15px] font-semibold text-chipink transition hover:brightness-110 disabled:opacity-50"
        >
          {state === "loading" ? "…" : "Get the brief"}
        </button>
      </div>
      {state === "error" && (
        <p id="sub-err" className="text-meta text-urgent">
          Something went wrong on our end — try again in a moment.
        </p>
      )}
    </form>
  );
}
