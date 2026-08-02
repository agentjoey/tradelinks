"use client";
import { authClient } from "../../../lib/auth-client";

export function SignOutButton() {
  const signOut = async () => {
    await authClient.signOut();
    window.location.href = "/auth/sign-in";
  };
  return (
    <button
      onClick={signOut}
      className="ticker mt-6 inline-flex items-center gap-2 rounded-md border border-line bg-surface px-4 py-2 text-[12px] uppercase tracking-[0.15em] text-ink transition-colors hover:border-signal/50 hover:text-signal"
    >
      Sign out &amp; try another account
    </button>
  );
}
