export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Cutover (Task 6): the legacy Wire-alert feed permanently moves to the
// canonical changes feed. 308 preserves the method and tells readers to
// update the stored URL. Existing RSS subscribers move from Wire alerts to
// canonical changes the moment this branch deploys — Task 9's cutover
// checklist owns announcing it.
export async function GET(req: Request) {
  const url = new URL(req.url);
  return new Response(null, {
    status: 308,
    headers: { location: `${url.origin}/feeds/changes.xml` },
  });
}
