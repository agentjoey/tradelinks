import React from "react";

/** Inline: render **bold** spans; everything else is plain text. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const parts = text.split(/\*\*(.+?)\*\*/g); // odd indices = bolded
  parts.forEach((p, i) => {
    if (!p) return;
    out.push(i % 2 === 1 ? <strong key={`${keyBase}-${i}`} className="font-semibold text-ink">{p}</strong> : <React.Fragment key={`${keyBase}-${i}`}>{p}</React.Fragment>);
  });
  return out;
}

/**
 * Minimal, dependency-free markdown for daily-note bodies. Supports h2/h3,
 * unordered (`- `) and ordered (`1. `) lists, and paragraphs with **bold**.
 * The editor prompt forbids raw URLs in the body, so no link parsing is needed.
 */
export function Markdown({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={`p${blocks.length}`} className="my-4 leading-7 text-[15.5px] text-muted">{inline(para.join(" "), `p${blocks.length}`)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => <li key={i} className="my-1.5 leading-7">{inline(it, `li${blocks.length}-${i}`)}</li>);
      blocks.push(
        list.ordered
          ? <ol key={`l${blocks.length}`} className="my-4 list-decimal pl-5 text-[15.5px] text-muted marker:text-faint">{items}</ol>
          : <ul key={`l${blocks.length}`} className="my-4 list-disc pl-5 text-[15.5px] text-muted marker:text-faint">{items}</ul>,
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushList(); continue; }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushPara(); flushList();
      const txt = h[2]!;
      blocks.push(
        h[1]!.length <= 2
          ? <h2 key={`h${blocks.length}`} className="mt-8 mb-2 font-display text-2xl tracking-tight text-ink">{inline(txt, `h${blocks.length}`)}</h2>
          : <h3 key={`h${blocks.length}`} className="mt-6 mb-2 font-display text-xl tracking-tight text-ink">{inline(txt, `h${blocks.length}`)}</h3>,
      );
      continue;
    }

    const ol = line.match(/^\d+\.\s+(.*)$/);
    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ol || ul) {
      flushPara();
      const ordered = !!ol;
      const item = (ol ? ol[1] : ul![1])!;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push(item);
      continue;
    }

    flushList();
    para.push(line);
  }
  flushPara();
  flushList();

  return <div>{blocks}</div>;
}
