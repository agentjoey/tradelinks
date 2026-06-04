"use client";
import { authClient } from "../../lib/auth-client";

export default function Forbidden() {
  const signOut = async () => {
    await authClient.signOut();
    window.location.href = "/auth/sign-in";
  };
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="ticker mb-2 text-[10px] uppercase tracking-[0.2em] text-urgent">403</div>
      <h1 className="font-display text-3xl tracking-tight">Not authorised</h1>
      <p className="mt-3 max-w-sm text-[14px] text-muted">
        This account isn&apos;t on the admin allowlist. Ask an admin to add your
        email, or sign in with a different account.
      </p>
      <button
        onClick={signOut}
        className="ticker mt-6 inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-[12px] uppercase tracking-[0.15em] text-paper transition-colors hover:border-signal/50 hover:text-signal"
      >
        Sign out &amp; try another account
      </button>
    </div>
  );
}
