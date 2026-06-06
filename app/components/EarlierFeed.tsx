"use client";
import { useState } from "react";
import Link from "next/link";
import type { AlertRow as Row } from "../lib/alerts";
import { bucketAlerts, type BucketLabels } from "../lib/buckets";
import { AlertRow } from "./AlertRow";
import type { Tiers } from "./alert-style";

type Filter = "all" | "wire" | "radar" | "daily";

export interface EarlierStrings {
  earlier: string; all: string; wire: string; radar: string; daily: string;
  loadEarlier: string; otherHint: string;
}

/** The page continues past today: a filterable, date-bucketed feed of earlier
 * alerts. Radar/Daily filters route to their own pages (slice 1 feed = alerts). */
export function EarlierFeed({ alerts, labels, lang, tiers, strings }: {
  alerts: Row[]; labels: BucketLabels; lang: "en" | "zh"; tiers: Tiers; strings: EarlierStrings;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const buckets = bucketAlerts(alerts, labels, lang);
  const showAlerts = filter === "all" || filter === "wire";
  const href = filter === "radar" ? "/trends" : filter === "daily" ? "/daily" : "/wire";

  const chip = (f: Filter, label: string) => (
    <button
      key={f}
      onClick={() => setFilter(f)}
      className={`ticker rounded-full px-3 py-1.5 text-[11px] uppercase tracking-wider transition-colors ${
        filter === f
          ? "bg-signal text-ink"
          : "border border-line text-muted hover:border-signal/40 hover:text-paper"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center justify-between gap-3 border-t border-line pt-7">
        <h2 className="font-display text-[22px] font-medium text-paper">{strings.earlier}</h2>
        <div className="flex flex-wrap items-center gap-1.5">
          {chip("all", strings.all)}
          {chip("wire", strings.wire)}
          {chip("radar", strings.radar)}
          {chip("daily", strings.daily)}
        </div>
      </div>

      {showAlerts ? (
        buckets.map((b) => (
          <div key={b.key}>
            <div className="ticker sticky top-16 z-[5] -mx-1 mb-3 mt-6 flex items-center gap-3 bg-ink/85 px-1 py-1 backdrop-blur first:mt-0">
              <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-paper">{b.label}</span>
              <span className="text-[10px] text-faint">{b.rows.length}</span>
              <div className="h-px flex-1 bg-line" />
            </div>
            <div className="space-y-2">
              {b.rows.map((a) => <AlertRow key={a.id} a={a} tiers={tiers} />)}
            </div>
          </div>
        ))
      ) : (
        <p className="rounded-xl border border-line bg-surface/60 px-5 py-8 text-center text-sm text-muted">{strings.otherHint}</p>
      )}

      <div className="mt-7 text-center">
        <Link href={href} className="ticker inline-block rounded-md border border-line px-5 py-2.5 text-[11px] uppercase tracking-[0.2em] text-muted transition-colors hover:border-signal/40 hover:text-signal">
          {strings.loadEarlier}
        </Link>
      </div>
    </section>
  );
}
