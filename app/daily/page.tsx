import Link from "next/link";
import { getPublishedNotes } from "../../src/daily/db.js";
import { getDict } from "../lib/i18n";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata = {
  title: "The Daily — TradeLinks",
  description: "One original cross-border e-commerce brief a day: the policy moves and viral-product shifts that mattered, and what to do about them.",
};

function fmtDate(d: Date, lang: string): string {
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
}

export default async function DailyIndex() {
  const { lang, t } = await getDict();
  const notes = await getPublishedNotes(60, lang);

  // Date-bucketed timeline (notes already newest-first).
  const groups: { key: string; date: Date; rows: typeof notes }[] = [];
  for (const n of notes) {
    const key = new Date(n.date).toISOString().slice(0, 10);
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, date: new Date(n.date), rows: [] }; groups.push(g); }
    g.rows.push(n);
  }

  return (
    <div>
      <div className="mb-8">
        <div className="ticker text-[10px] uppercase tracking-[0.2em] text-signal/80 mb-2">{t.dailyEyebrow}</div>
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight">
          {t.dailyPre}<span className="italic text-signal">{t.dailyEm}</span>.
        </h1>
        <p className="mt-3 max-w-xl text-[15px] text-muted">{t.dailySub}</p>
      </div>

      {notes.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface/60 px-5 py-8 text-center text-sm text-faint">{t.dailyEmpty}</p>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.key}>
              <div className="ticker sticky top-16 z-[5] -mx-1 mb-3 flex items-center gap-3 bg-ink/85 px-1 py-1 backdrop-blur">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-paper">{fmtDate(g.date, lang)}</h2>
                <div className="h-px flex-1 bg-line" />
              </div>
              <div className="space-y-3">
                {g.rows.map((n) => (
                  <Link
                    key={n.slug}
                    href={`/daily/${n.slug}`}
                    className={`block rounded-lg border border-line bg-surface/60 p-5 transition-colors hover:border-signal/40 border-l-2 ${n.kind === "roundup" ? "border-l-calm" : "border-l-signal"}`}
                  >
                    <div className="ticker mb-1.5 text-[10px] uppercase tracking-[0.14em]">
                      <span className={n.kind === "roundup" ? "text-calm" : "text-signal"}>{n.kind === "roundup" ? t.kindRoundup : t.kindBrief}</span>
                    </div>
                    <h3 className="font-display text-xl leading-snug tracking-tight text-paper">{n.title}</h3>
                    {n.dek && <p className="mt-1.5 text-[14px] leading-6 text-muted">{n.dek}</p>}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
