// X (Twitter) viral-products client — app-only Bearer search of the last 7 days.
// Pure-ish: `fetch` and the bearer token are injected so the worker is testable
// without network or env (see test/x.test.ts). Cost protection lives here: every
// returned post is a paid read (~$0.005), so callers pass a hard `maxReads` cap
// and we stop issuing queries the moment the cumulative budget is reached.
import { logger } from "../lib/logger.js";

const SEARCH_URL = "https://api.x.com/2/tweets/search/recent";

/** A normalized viral tweet (one product candidate, pre-AI). */
export interface ViralTweet {
  id: string;
  text: string;
  author: string; // author_id (resolved to @handle later if expansions present)
  likes: number;
  retweets: number;
  createdAt: string | null;
  link: string; // permalink
  mediaUrl: string | null;
  query: string; // which acquisition query surfaced this tweet
}

export interface SearchRecentOpts {
  bearer: string;
  /** X API page size (valid range 10–100). The worker keeps this in range. */
  maxResults: number;
  fetchImpl?: typeof fetch;
}

interface RawTweet {
  id: string;
  text?: string;
  author_id?: string;
  created_at?: string;
  public_metrics?: { like_count?: number; retweet_count?: number };
  attachments?: { media_keys?: string[] };
}
interface RawMedia {
  media_key: string;
  preview_image_url?: string;
  url?: string;
}

/** One page of `search/recent`. Throws on non-200 so the worker can back off. */
export async function searchRecent(query: string, opts: SearchRecentOpts): Promise<Omit<ViralTweet, "query">[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    query,
    max_results: String(opts.maxResults),
    // relevancy (not the default recency): newest tweets are seconds-old with ~0
    // engagement, so recency + a like-threshold returns nothing. relevancy
    // surfaces the most-engaged tweets in the 7-day window (verified via probe).
    sort_order: "relevancy",
    "tweet.fields": "public_metrics,created_at,entities",
    expansions: "attachments.media_keys",
    "media.fields": "preview_image_url,url",
  });
  const res = await doFetch(`${SEARCH_URL}?${params}`, {
    headers: { Authorization: `Bearer ${opts.bearer}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`x search/recent HTTP ${res.status}: ${await res.text()}`);
  }
  return parseTweets((await res.json()) as TweetsBody);
}

interface TweetsBody {
  data?: RawTweet[];
  includes?: { media?: RawMedia[] };
}

/** Parse an X v2 tweets envelope (data + includes.media) into ViralTweets. */
function parseTweets(body: TweetsBody): Omit<ViralTweet, "query">[] {
  const mediaByKey = new Map((body.includes?.media ?? []).map((m) => [m.media_key, m]));
  return (body.data ?? []).map((t) => {
    const mk = t.attachments?.media_keys?.[0];
    const media = mk ? mediaByKey.get(mk) : undefined;
    return {
      id: t.id,
      text: t.text ?? "",
      author: t.author_id ?? "",
      likes: t.public_metrics?.like_count ?? 0,
      retweets: t.public_metrics?.retweet_count ?? 0,
      createdAt: t.created_at ?? null,
      link: `https://x.com/i/web/status/${t.id}`,
      mediaUrl: media?.preview_image_url ?? media?.url ?? null,
    };
  });
}

const USERS_URL = "https://api.x.com/2/users";
const TWEET_PARAMS = {
  "tweet.fields": "public_metrics,created_at,entities",
  expansions: "attachments.media_keys",
  "media.fields": "preview_image_url,url",
};

export interface ResolvedAccount {
  handle: string;
  id: string;
}

/**
 * Resolve @handles → numeric user ids in one batched call (≤100/request).
 * One read regardless of count. Unknown/suspended handles are simply dropped.
 */
export async function resolveUserIds(handles: string[], opts: { bearer: string; fetchImpl?: typeof fetch }): Promise<ResolvedAccount[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  // X usernames are ^[A-Za-z0-9_]{1,15}$; one malformed name 400s the whole batch,
  // so drop invalid ones up front (they'll just be absent from the result).
  const names = handles.map((h) => h.replace(/^@/, "")).filter((h) => /^[A-Za-z0-9_]{1,15}$/.test(h));
  if (names.length === 0) return [];
  const params = new URLSearchParams({ usernames: names.join(",") });
  const res = await doFetch(`${USERS_URL}/by?${params}`, {
    headers: { Authorization: `Bearer ${opts.bearer}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`x users/by HTTP ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as { data?: { id: string; username: string }[] };
  return (body.data ?? []).map((u) => ({ handle: u.username, id: u.id }));
}

export interface TimelineOpts {
  bearer: string;
  maxResults: number; // 5–100
  startTime?: string; // ISO — only tweets after this (incremental cursor)
  fetchImpl?: typeof fetch;
}

/** One page of a user's timeline (`/2/users/:id/tweets`, originals only). */
export async function fetchUserTimeline(userId: string, opts: TimelineOpts): Promise<Omit<ViralTweet, "query">[]> {
  const doFetch = opts.fetchImpl ?? fetch;
  const params = new URLSearchParams({
    max_results: String(opts.maxResults),
    exclude: "retweets,replies",
    ...TWEET_PARAMS,
    ...(opts.startTime ? { start_time: opts.startTime } : {}),
  });
  const res = await doFetch(`${USERS_URL}/${userId}/tweets?${params}`, {
    headers: { Authorization: `Bearer ${opts.bearer}` },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`x users/:id/tweets HTTP ${res.status}: ${await res.text()}`);
  return parseTweets((await res.json()) as TweetsBody);
}

export interface FetchAccountsOpts {
  /** curated accounts to poll; startTime = incremental cursor (last seen). */
  accounts: { handle: string; id: string; startTime?: string }[];
  /** hard cap on total posts read across all accounts (cost protection). */
  maxReads: number;
  /** per-account page size (X API range 5–100). */
  maxResultsPerAccount: number;
  bearer: string;
  fetchImpl?: typeof fetch;
}

/**
 * Poll curated account timelines in order until the read budget is spent. The
 * final page is clamped to the remaining budget so the cap is never exceeded.
 * Each tweet is tagged with its originating @handle.
 */
export async function fetchAccountsTweets(opts: FetchAccountsOpts): Promise<FetchViralResult> {
  let reads = 0;
  const tweets: ViralTweet[] = [];

  for (const acct of opts.accounts) {
    const remaining = opts.maxReads - reads;
    if (remaining <= 0) break;
    const pageSize = Math.max(5, Math.min(opts.maxResultsPerAccount, remaining));
    let page;
    try {
      page = await fetchUserTimeline(acct.id, { bearer: opts.bearer, maxResults: pageSize, startTime: acct.startTime, fetchImpl: opts.fetchImpl });
    } catch (e) {
      logger.error({ handle: acct.handle, err: String(e) }, "x timeline fetch failed; skipping account");
      continue;
    }
    // clamp to the remaining budget (a page can exceed it when remaining < 5).
    const within = page.slice(0, remaining);
    reads += within.length;
    for (const t of within) tweets.push({ ...t, query: `@${acct.handle}` });
  }

  return { reads, tweets };
}

export interface FetchViralOpts {
  queries: string[];
  /** hard cap on total posts read across all queries (cost protection). */
  maxReads: number;
  /** engagement pre-filter: keep only tweets with like_count ≥ minLikes. */
  minLikes: number;
  /** per-query page size (X API range 10–100). */
  maxResultsPerQuery: number;
  bearer: string;
  fetchImpl?: typeof fetch;
}

export interface FetchViralResult {
  /** total posts read (each counts toward the daily cost cap). */
  reads: number;
  /** tweets that passed the engagement pre-filter, tagged with their query. */
  tweets: ViralTweet[];
}

/**
 * Run the high-signal queries in order, accumulating tweets until the read
 * budget is spent. The final page is clamped to the remaining budget so the
 * cap is never exceeded. Low-engagement tweets are dropped from the result but
 * still counted as reads (the API already charged us for them).
 */
export async function fetchViralTweets(opts: FetchViralOpts): Promise<FetchViralResult> {
  let reads = 0;
  const tweets: ViralTweet[] = [];

  for (const query of opts.queries) {
    const remaining = opts.maxReads - reads;
    if (remaining <= 0) break;
    const pageSize = Math.min(opts.maxResultsPerQuery, remaining);
    let page;
    try {
      page = await searchRecent(query, { bearer: opts.bearer, maxResults: pageSize, fetchImpl: opts.fetchImpl });
    } catch (e) {
      logger.error({ query, err: String(e) }, "x search failed; stopping for this run");
      break; // 429 / auth / network → back off, stop for the day
    }
    reads += page.length;
    for (const t of page) {
      if (t.likes >= opts.minLikes) tweets.push({ ...t, query });
    }
  }

  return { reads, tweets };
}
