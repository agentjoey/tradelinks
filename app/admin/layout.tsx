import { requireAdmin } from "../lib/auth";

// Gate every /admin/* route: signed in (Neon Auth / Google) + on the allowlist.
export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return <>{children}</>;
}
