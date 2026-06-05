import { auth } from "../../lib/auth";
import { SignOutButton } from "./signout";

export const dynamic = "force-dynamic";

export default async function Forbidden() {
  let email: string | undefined | null;
  if (auth) {
    const { data } = await auth.getSession();
    email = data?.user?.email;
  }
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="ticker mb-2 text-[10px] uppercase tracking-[0.2em] text-urgent">403</div>
      <h1 className="font-display text-3xl tracking-tight">Not authorised</h1>
      <p className="mt-3 max-w-sm text-[14px] text-muted">
        {email ? (
          <>
            You&apos;re signed in as <span className="text-paper">{email}</span>, but that
            address isn&apos;t on the admin allowlist. Add it to <code className="text-paper">ADMIN_EMAILS</code>,
            or sign in with an authorised account.
          </>
        ) : (
          <>This account isn&apos;t on the admin allowlist.</>
        )}
      </p>
      <SignOutButton />
    </div>
  );
}
