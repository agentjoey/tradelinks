"use client";
import { useState, type FormEvent } from "react";
import { btnPrimary, inputField } from "./ui";

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
      // 409 → "already": defensive — the API currently always returns 200 (anti-enumeration by design); ready if it ever signals duplicates.
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
          className={`${inputField} flex-1`}
        />
        <button
          type="submit"
          disabled={state === "loading"}
          className={btnPrimary}
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
