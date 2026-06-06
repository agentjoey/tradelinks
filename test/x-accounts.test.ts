import { describe, it, expect, vi } from "vitest";
import { resolveUserIds, fetchUserTimeline, fetchAccountsTweets } from "../src/social/x.js";

/** Fake X v2 endpoints: /2/users/by (handle→id) and /2/users/:id/tweets. */
function makeFetch(timeline: (userId: string, max: number, startTime: string | null) => Array<{ id: string; likes?: number }>) {
  return vi.fn(async (url: string | URL, _init?: RequestInit) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/users/by")) {
      const names = (u.searchParams.get("usernames") ?? "").split(",").filter(Boolean);
      const data = names.map((n) => ({ id: `id_${n.toLowerCase()}`, username: n.replace(/^@/, "") }));
      return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    const m = u.pathname.match(/\/users\/([^/]+)\/tweets$/);
    if (m) {
      const userId = m[1]!;
      const max = Number(u.searchParams.get("max_results") ?? "10");
      const startTime = u.searchParams.get("start_time");
      const rows = timeline(userId, max, startTime);
      const data = rows.map((r) => ({
        id: r.id,
        text: `tweet ${r.id}`,
        author_id: userId,
        created_at: "2026-06-05T00:00:00.000Z",
        public_metrics: { like_count: r.likes ?? 5, retweet_count: 0 },
      }));
      return new Response(JSON.stringify({ data, meta: { result_count: data.length } }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response("not found", { status: 404 });
  });
}

describe("resolveUserIds", () => {
  it("batches handles and maps them to ids", async () => {
    const fetchImpl = makeFetch(() => []);
    const out = await resolveUserIds(["@JungleScout", "helium10"], { bearer: "TKN", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual([
      { handle: "JungleScout", id: "id_junglescout" },
      { handle: "helium10", id: "id_helium10" },
    ]);
    // single batched request (usernames=… ), bearer sent
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer TKN");
  });

  it("skips malformed handles so one bad name can't 400 the whole batch", async () => {
    const fetchImpl = makeFetch(() => []);
    await resolveUserIds(["good_one", "thisnameiswaytoolong123", "bad-dash", "ok15charname123"], { bearer: "TKN", fetchImpl: fetchImpl as unknown as typeof fetch });
    const url = String(fetchImpl.mock.calls[0]![0]);
    expect(url).toContain("usernames=good_one");
    expect(url).toContain("ok15charname123");
    expect(url).not.toContain("waytoolong");
    expect(url).not.toContain("bad-dash");
  });
});

describe("fetchUserTimeline", () => {
  it("hits /users/:id/tweets, forwards start_time, parses tweets", async () => {
    const fetchImpl = makeFetch(() => [{ id: "1", likes: 12 }, { id: "2", likes: 3 }]);
    const page = await fetchUserTimeline("id_abc", { bearer: "TKN", maxResults: 10, startTime: "2026-06-04T00:00:00.000Z", fetchImpl: fetchImpl as unknown as typeof fetch });

    const calledUrl = String(fetchImpl.mock.calls[0]![0]);
    expect(calledUrl).toContain("/users/id_abc/tweets");
    expect(calledUrl).toContain("start_time=2026-06-04");
    expect(page).toHaveLength(2);
    expect(page[0]).toMatchObject({ id: "1", likes: 12, author: "id_abc" });
    expect(page[0]!.link).toContain("1");
  });

  it("throws on non-200 so the worker can back off", async () => {
    const fetchImpl = vi.fn(async () => new Response("rate limited", { status: 429 }));
    await expect(
      fetchUserTimeline("id_abc", { bearer: "TKN", maxResults: 10, fetchImpl: fetchImpl as unknown as typeof fetch }),
    ).rejects.toThrow(/429/);
  });
});

describe("fetchAccountsTweets — budget + tagging", () => {
  it("stops once the read budget is reached and tags tweets with @handle", async () => {
    const fetchImpl = makeFetch((uid, max) => Array.from({ length: max }, (_, i) => ({ id: `${uid}-${i}`, likes: 10 })));
    const { reads, tweets } = await fetchAccountsTweets({
      accounts: [
        { handle: "a", id: "id_a" },
        { handle: "b", id: "id_b" },
        { handle: "c", id: "id_c" },
      ],
      maxReads: 10,
      maxResultsPerAccount: 4,
      bearer: "TKN",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    // 4 + 4 + (remaining 2) = 10, third account clamped, never over-reads
    expect(reads).toBe(10);
    expect(tweets).toHaveLength(10);
    expect(tweets.every((t) => t.query.startsWith("@"))).toBe(true);
    expect(tweets.find((t) => t.id === "id_a-0")!.query).toBe("@a");
  });
});
