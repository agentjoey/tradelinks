"use client";
import { useState } from "react";

export default function SignIn() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Call the Neon Auth proxy directly and navigate ourselves. The SDK client's
  // signIn.social() auto-redirect doesn't fire reliably here (the promise hangs
  // on "Redirecting…"), so we POST and use the returned { url } deterministically.
  const signIn = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          provider: "google",
          callbackURL: `${window.location.origin}/admin/sources`,
        }),
      });
      if (!r.ok) {
        setErr(`Sign-in failed (HTTP ${r.status})`);
        setBusy(false);
        return;
      }
      const data = (await r.json()) as { url?: string };
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      setErr("No redirect URL returned.");
      setBusy(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed.");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="ticker mb-2 text-[10px] uppercase tracking-[0.2em] text-signal/80">◆ The Desk</div>
      <h1 className="font-display text-3xl tracking-tight">Admin sign-in</h1>
      <p className="mt-3 max-w-sm text-[14px] text-muted">
        The desk (review queue + source health) is invite-only. Sign in with an
        authorised Google account.
      </p>
      <button
        onClick={signIn}
        disabled={busy}
        className="ticker mt-6 inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-[12px] uppercase tracking-[0.15em] text-paper transition-colors hover:border-signal/50 hover:text-signal disabled:opacity-50"
      >
        {busy ? "Redirecting…" : "Sign in with Google"}
      </button>
      {err && <p className="mt-4 max-w-sm text-[13px] text-urgent">{err}</p>}
    </div>
  );
}
