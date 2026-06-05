import { auth, adminEmails } from "../../lib/auth";
import { SignOutButton } from "./signout";

export const dynamic = "force-dynamic";

export default async function Forbidden() {
  let email: string | undefined | null;
  if (auth) {
    const { data } = await auth.getSession();
    email = data?.user?.email;
  }
  const list = adminEmails();
  const match = !!email && list.includes(email.toLowerCase());

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center">
      <div className="ticker mb-2 text-[10px] uppercase tracking-[0.2em] text-urgent">403</div>
      <h1 className="font-display text-3xl tracking-tight">Not authorised</h1>
      <p className="mt-3 max-w-sm text-[14px] text-muted">
        {email ? (
          <>
            You&apos;re signed in as <span className="text-paper">{email}</span>, but that
            address isn&apos;t on the admin allowlist.
          </>
        ) : (
          <>This account isn&apos;t on the admin allowlist.</>
        )}
      </p>
      <p className="ticker mt-3 text-[11px] text-faint">
        runtime allowlist entries: <span className="text-paper">{list.length}</span> · match:{" "}
        <span className="text-paper">{match ? "yes" : "no"}</span>
      </p>
      <SignOutButton />
    </div>
  );
}
