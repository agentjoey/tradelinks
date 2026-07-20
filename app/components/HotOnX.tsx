import type { HotTopicXRow } from "../../src/social/db.js";
import { SectionHeader } from "./SectionHeader";
import { SignalCard } from "./SignalCard";

/** Hot on X = text-forward discussion cards giving the X hot-topics track a home
 * on the front page. Calm tone keeps it visually distinct from Wire/Radar. */
export function HotOnX({
  topics, title, sublabel, seeAllLabel, href, emptyLabel,
}: {
  topics: HotTopicXRow[];
  title: string;
  sublabel: string;
  seeAllLabel: string;
  href: string;
  emptyLabel: string;
}) {
  return (
    <section className="mb-12">
      <SectionHeader accent="bg-calm" title={title} sublabel={sublabel} href={href} seeAllLabel={seeAllLabel} />
      {topics.length === 0 ? (
        <p className="rounded-lg border border-line bg-surface/60 px-5 py-8 text-center text-sm text-muted">{emptyLabel}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((x, i) => (
            <SignalCard
              key={x.link + i}
              href={x.link} external tone="calm"
              tierLabel={x.category}
              meta={`${x.author ? `@${x.author.replace(/^@/, "")} · ` : ""}♥ ${x.likes.toLocaleString()}`}
              title={x.headline}
              dek={x.whyHot || undefined}
              foot={
                <span className="ticker text-meta text-faint">🔁 {x.retweets.toLocaleString()} · X</span>
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
