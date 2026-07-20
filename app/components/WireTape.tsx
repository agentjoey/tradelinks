import type { LatestItem } from "../lib/home";
import { hhmm } from "./alert-style";

function Seq({ items, hidden, prefix }: { items: LatestItem[]; hidden?: boolean; prefix: string }) {
  return (
    <>
      {items.map((it, i) => (
        <span key={`${prefix}:${i}`} className="tp" aria-hidden={hidden || undefined}>
          <span className="sep">◆</span>
          {hhmm(new Date(it.time))} <b>{it.title}</b>
        </span>
      ))}
    </>
  );
}

/** The wire ticker tape: latest stream rows scrolling seamlessly (track ×2). */
export function WireTape({ items, liveLabel }: { items: LatestItem[]; liveLabel: string }) {
  if (items.length === 0) return null;
  return (
    <div className="tape">
      <div className="mx-auto flex h-[34px] max-w-[88rem] items-center gap-3.5 px-5 sm:px-8">
        <span className="tape-live"><span className="live-dot" aria-hidden="true" />{liveLabel}</span>
        <div className="tape-viewport">
          <div className="tape-track">
            <Seq items={items} prefix="a" />
            <Seq items={items} hidden prefix="b" />
          </div>
        </div>
      </div>
    </div>
  );
}
