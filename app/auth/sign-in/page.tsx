"use client";
import { useState } from "react";
import { authClient } from "../../lib/auth-client";

export default function SignIn() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const signIn = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = (await authClient.signIn.social({
        provider: "google",
        callbackURL: `${window.location.origin}/admin/sources`,
      })) as unknown as { data?: { url?: string }; url?: string; error?: { message?: string } };
      // The client returns { url, redirect:true } but doesn't always auto-navigate
      // (observed with @neondatabase/auth) — do it ourselves.
      const url = res?.data?.url ?? res?.url;
      if (url) {
        window.location.href = url;
        return;
      }
      setErr(res?.error?.message ?? "Could not start Google sign-in.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed.");
    }
    setBusy(false);
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
