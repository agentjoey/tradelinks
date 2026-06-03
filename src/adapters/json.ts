import type { CrawlJob, RawItem } from "../queue/schemas.js";
import type { CrawlResult, SourceAdapter } from "./types.js";

export type JsonShape = "federal_register" | "reddit";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** US Federal Register documents.json → RawItem[]. Pure, unit-tested. */
export function parseFederalRegister(json: unknown): RawItem[] {
  const results = (json as { results?: unknown[] })?.results ?? [];
  const items: RawItem[] = [];
  for (const r of results) {
    const d = r as { title?: string; html_url?: string; publication_date?: string; abstract?: string };
    if (!d.title || !d.html_url) continue;
    const pub = d.publication_date ? new Date(`${d.publication_date}T00:00:00Z`) : null;
    items.push({
      url: d.html_url,
      title: d.title,
      publishedAt: pub && !Number.isNaN(pub.getTime()) ? pub.toISOString() : undefined,
      lang: "en",
      rawContent: { contentSnippet: d.abstract },
    });
  }
  return items;
}

/** Reddit r/<sub>.json → RawItem[]. Pure, unit-tested. */
export function parseReddit(json: unknown): RawItem[] {
  const children = (json as { data?: { children?: unknown[] } })?.data?.children ?? [];
  const items: RawItem[] = [];
  for (const c of children) {
    const d = (c as { data?: Record<string, unknown> })?.data;
    if (!d) continue;
    const title = d.title as string | undefined;
    const permalink = d.permalink as string | undefined;
    if (!title || !permalink) continue;
    const created = typeof d.created_utc === "number" ? new Date(d.created_utc * 1000) : null;
    items.push({
      url: `https://www.reddit.com${permalink}`,
      title,
      publishedAt: created ? created.toISOString() : undefined,
      lang: "en",
      rawContent: { contentSnippet: (d.selftext as string | undefined)?.slice(0, 500), score: d.score },
    });
  }
  return items;
}

const PARSERS: Record<JsonShape, (j: unknown) => RawItem[]> = {
  federal_register: parseFederalRegister,
  reddit: parseReddit,
};

/** Adapter for JSON-API sources (Federal Register, Reddit). */
export class JsonAdapter implements SourceAdapter {
  readonly kind = "fetch" as const;
  constructor(private readonly shape: JsonShape, private readonly lang?: string) {}

  async crawl(job: CrawlJob): Promise<CrawlResult> {
    try {
      const res = await fetch(job.url, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        // 403/429 from Reddit etc. — treat as a hard failure (not bot-wall HTML)
        return { ok: false, blocked: false, items: [], error: `HTTP ${res.status}` };
      }
      const json = await res.json();
      const items = PARSERS[this.shape](json).map((it) => ({ ...it, lang: it.lang ?? this.lang }));
      return { ok: true, blocked: false, items };
    } catch (err) {
      return { ok: false, blocked: false, items: [], error: err instanceof Error ? err.message : String(err) };
    }
  }
}
