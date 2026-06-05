import "server-only";
import { createNeonAuth } from "@neondatabase/auth/next/server";
import { redirect } from "next/navigation";

/**
 * Neon Auth (Better Auth) server instance — gates /admin/* (ADR-006).
 * Built lazily: if the env isn't set yet (e.g. before Vercel envs land), `auth`
 * is null so the build still succeeds and only /admin + /api/auth degrade.
 */
const baseUrl = process.env.NEON_AUTH_BASE_URL;
const secret = process.env.NEON_AUTH_COOKIE_SECRET;

export const auth =
  baseUrl && secret
    ? createNeonAuth({
        baseUrl,
        // sameSite: "lax" is required for OAuth — the default "strict" drops the
        // session cookie on the cross-site navigation back from Google/Neon, so
        // /admin would never see the session → infinite sign-in redirect loop.
        cookies: { secret, sameSite: "lax" },
      })
    : null;

/** Admin allowlist (invite-only authorization) — comma-separated emails. */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export interface AdminUser {
  email: string;
  name?: string | null;
}

/**
 * Server-side gate for /admin/* pages: must be signed in (Neon Auth / Google)
 * AND on the email allowlist. Redirects otherwise. `redirect()` returns `never`,
 * so `auth` is narrowed to non-null after the first guard.
 */
export async function requireAdmin(): Promise<AdminUser> {
  if (!auth) redirect("/auth/sign-in?reason=not-configured");
  const { data: session } = await auth.getSession();
  const email = session?.user?.email?.toLowerCase();
  if (!email) redirect("/auth/sign-in");
  if (!adminEmails().includes(email)) redirect("/auth/forbidden");
  return { email, name: session?.user?.name };
}
