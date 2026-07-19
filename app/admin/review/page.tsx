import { listPending } from "../../../src/alerts/review.js";
import { approve, reject } from "./actions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REGION_LABEL: Record<string, string> = {
  north_america: "NA", europe: "EU", southeast_asia: "SEA",
  middle_east: "ME", latin_america: "LATAM", australia_nz: "ANZ",
};

export default async function ReviewPage() {
  const pending = await listPending();

  return (
    <div>
      <div className="mb-7">
        <div className="ticker text-[10px] uppercase tracking-[0.2em] text-signal/80 mb-2">◆ The Desk</div>
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight">
          Review <span className="italic text-signal">queue</span>
        </h1>
        <p className="mt-3 text-[15px] text-muted">
          Critical alerts (≥4) held for an editor's sign-off before they hit the wire.
        </p>
      </div>

      {pending.length === 0 ? (
        <div className="py-20 text-center">
          <p className="ticker text-[11px] uppercase tracking-[0.2em] text-faint">✓ queue clear</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {pending.map((a, i) => (
            <article
              key={a.id}
              className="animate-rise relative overflow-hidden rounded-md border border-line bg-surface/70 p-4 pl-5"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <div className="absolute left-0 top-0 h-full w-[3px] bg-urgent" />
              <div className="ticker mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.12em]">
                <span className="text-urgent text-base font-semibold">{a.urgencyScore.toFixed(1)}</span>
                <span className="text-signal">{a.category}</span>
                <span className="text-faint">/</span>
                {a.regions.map((r) => (
                  <span key={r} className="text-muted">{REGION_LABEL[r] ?? r}</span>
                ))}
              </div>
              <h2 className="font-display text-[19px] font-medium leading-snug text-ink">{a.title}</h2>
              {a.actionRequired && (
                <div className="mt-2 flex gap-2 border-l border-signal/30 pl-3 text-[13px]">
                  <span className="ticker shrink-0 pt-0.5 text-[10px] uppercase tracking-wider text-signal">act</span>
                  <span className="text-ink/90">{a.actionRequired}</span>
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <form action={approve}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="ticker rounded-sm bg-signal px-3.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-chipink transition-opacity hover:opacity-90">
                    Approve → publish
                  </button>
                </form>
                <form action={reject}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="ticker rounded-sm border border-line px-3.5 py-1.5 text-[10px] uppercase tracking-[0.12em] text-muted transition-colors hover:border-urgent/40 hover:text-urgent">
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
