import { listPending } from "../../../src/alerts/review.js";
import { approve, reject } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REGION_LABEL: Record<string, string> = {
  north_america: "NA", europe: "EU", southeast_asia: "SEA",
  middle_east: "ME", latin_america: "LatAm", australia_nz: "ANZ",
};

export default async function ReviewPage() {
  const pending = await listPending();

  return (
    <div>
      <h1 className="text-lg font-semibold mb-1">Review queue</h1>
      <p className="text-sm text-muted mb-5">
        High-urgency alerts (≥4) awaiting sign-off before they publish.
      </p>

      {pending.length === 0 ? (
        <p className="text-muted text-sm py-12 text-center">✅ Queue empty.</p>
      ) : (
        <div className="space-y-3">
          {pending.map((a) => (
            <article key={a.id} className="rounded-lg border border-border bg-panel p-4">
              <div className="flex items-center gap-2 text-xs mb-2">
                <span className="rounded border border-red-500/30 bg-red-500/15 text-red-300 px-1.5 py-0.5 font-mono">
                  ⚠ {a.urgencyScore.toFixed(1)}
                </span>
                <span className="rounded bg-emerald-500/10 text-emerald-300 px-1.5 py-0.5">{a.category}</span>
                {a.regions.map((r) => (
                  <span key={r} className="rounded bg-sky-500/10 text-sky-300 px-1.5 py-0.5">
                    {REGION_LABEL[r] ?? r}
                  </span>
                ))}
              </div>
              <h2 className="font-medium leading-snug">{a.title}</h2>
              {a.actionRequired && (
                <p className="mt-1 text-sm"><span className="text-emerald-400">→ </span>{a.actionRequired}</p>
              )}
              <div className="mt-3 flex gap-2">
                <form action={approve}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="rounded bg-emerald-600/80 hover:bg-emerald-600 px-3 py-1 text-sm">
                    Approve &amp; publish
                  </button>
                </form>
                <form action={reject}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="rounded border border-border hover:border-red-500/50 px-3 py-1 text-sm text-muted hover:text-red-300">
                    Reject
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
