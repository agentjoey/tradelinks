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
  return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(d);
}

export default async function DailyIndex() {
  const { lang, t } = await getDict();
  const notes = await getPublishedNotes(60, lang);

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
        <div className="space-y-3">
          {notes.map((n) => (
            <Link
              key={n.slug}
              href={`/daily/${n.slug}`}
              className={`block rounded-lg border border-line bg-surface/60 p-5 transition-colors hover:border-signal/40 border-l-2 ${n.kind === "roundup" ? "border-l-calm" : "border-l-signal"}`}
            >
              <div className="ticker mb-1.5 flex items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-faint">
                <span>{fmtDate(n.date, lang)}</span>
                <span className="text-line">·</span>
                <span className={n.kind === "roundup" ? "text-calm" : "text-signal"}>{n.kind === "roundup" ? t.kindRoundup : t.kindBrief}</span>
              </div>
              <h2 className="font-display text-xl leading-snug tracking-tight text-paper">{n.title}</h2>
              {n.dek && <p className="mt-1.5 text-[14px] leading-6 text-muted">{n.dek}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
