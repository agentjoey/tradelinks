import type { HotTopicXRow } from "../../src/social/db.js";
import { SectionHeader } from "./SectionHeader";
import { TrackedLink } from "./TrackedLink";

/** Hot on X = text-forward discussion cards giving the X hot-topics track a home
 * on the front page. Teal left border keeps it visually distinct from Wire/Radar. */
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
        <p className="rounded-xl border border-line bg-surface/60 px-5 py-8 text-center text-sm text-muted">{emptyLabel}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((x, i) => (
            <TrackedLink
              key={x.link + i} href={x.link} event="hot_topic_open"
              params={{ topic: x.headline, category: x.category, author: x.author }}
              className="group rounded-xl border border-line border-l-2 border-l-calm bg-surface/60 p-4 transition-colors hover:bg-surface2"
            >
              <div className="ticker mb-2 flex items-center justify-between text-[10px] uppercase tracking-[0.12em]">
                <span className="text-calm">{x.category}</span>
                <span className="text-signal/90">♥ {x.likes.toLocaleString()}</span>
              </div>
              <div className="font-display text-[16px] font-medium leading-snug text-paper transition-colors group-hover:text-calm">{x.headline}</div>
              {x.whyHot && <p className="mt-1.5 line-clamp-2 text-[12.5px] leading-relaxed text-muted">{x.whyHot}</p>}
              <div className="ticker mt-3 flex items-center gap-2.5 text-[11px] text-faint">
                {x.author && <span className="text-signal/90">{x.author}</span>}
                <span>🔁 {x.retweets.toLocaleString()}</span>
                <span className="text-faint/70">· X</span>
              </div>
            </TrackedLink>
          ))}
        </div>
      )}
    </section>
  );
}
