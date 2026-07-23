import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";

import {
  beginRun,
  deriveRunStatus,
  finishRun,
  recordSourceOutcome,
} from "../src/collection/run.js";

// Contract coverage for Phase 1 plan task 4: idempotent collection runs and
// per-source checks. Same scheduled slot reuses one run; successful-empty is
// distinct from failure; source freshness advances only on successful checks;
// replay never duplicates items or counts.
//
// Requires DATABASE_URL pointing at an isolated branch with migration
// 0011_phase1_intelligence_foundation applied.

const prisma = new PrismaClient();

const runId = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
let seedSeq = 0;

function nextSeed() {
  return `${runId}-${++seedSeq}`;
}

function seedSource(seedId: string, lastOkAt: Date | null = null) {
  return prisma.source.create({
    data: {
      id: `${seedId}-source`,
      name: "Collection Run Test Source",
      url: `https://example.com/${seedId}`,
      adapter: "rss",
      frequencyCron: "0 * * * *",
      language: "en",
      regions: ["north_america"],
      platforms: [],
      lastOkAt,
    },
  });
}

function beginCollectRun(seedId: string, scheduledFor: Date) {
  return beginRun({
    jobType: "COLLECT",
    scopeKey: `${seedId}-scope`,
    scheduledFor,
    runnerVersion: "test",
  });
}

afterAll(async () => {
  // FK-safe order (relations use ON DELETE RESTRICT): checks → runs → items → sources.
  await prisma.sourceCheck.deleteMany({ where: { run: { scopeKey: { startsWith: runId } } } });
  await prisma.pipelineRun.deleteMany({ where: { scopeKey: { startsWith: runId } } });
  await prisma.item.deleteMany({ where: { sourceId: { startsWith: runId } } });
  await prisma.source.deleteMany({ where: { id: { startsWith: runId } } });
  await prisma.$disconnect();
}, 60000);

describe("deriveRunStatus (pure)", () => {
  it("derives an explicit status from the check set", () => {
    expect(deriveRunStatus([])).toBe("FAILED");
    expect(deriveRunStatus([{ status: "SUCCEEDED_ITEMS", itemCount: 3 }])).toBe("SUCCEEDED_ITEMS");
    expect(deriveRunStatus([{ status: "SUCCEEDED_EMPTY", itemCount: 0 }])).toBe("SUCCEEDED_EMPTY");
    expect(
      deriveRunStatus([
        { status: "SUCCEEDED_ITEMS", itemCount: 2 },
        { status: "SUCCEEDED_EMPTY", itemCount: 0 },
      ]),
    ).toBe("SUCCEEDED_ITEMS");
    expect(
      deriveRunStatus([
        { status: "SUCCEEDED_EMPTY", itemCount: 0 },
        { status: "FAILED", itemCount: 0 },
      ]),
    ).toBe("PARTIAL");
    expect(deriveRunStatus([{ status: "BLOCKED", itemCount: 0 }])).toBe("BLOCKED");
    expect(
      deriveRunStatus([
        { status: "BLOCKED", itemCount: 0 },
        { status: "FAILED", itemCount: 0 },
      ]),
    ).toBe("FAILED");
    expect(deriveRunStatus([{ status: "FAILED", itemCount: 0 }])).toBe("FAILED");
  });
});

describe("beginRun", () => {
  it("reuses a run for the same job and scheduled slot", async () => {
    const seedId = nextSeed();
    const slot = new Date("2026-07-20T08:00:00Z");
    const input = {
      jobType: "COLLECT" as const,
      scopeKey: `${seedId}-scope`,
      scheduledFor: slot,
      runnerVersion: "abc",
    };
    const first = await beginRun(input);
    const second = await beginRun(input);
    expect(second.id).toBe(first.id);
    expect(first.status).toBe("RUNNING");
  }, 60000);

  it("keeps distinct scheduled slots distinct", async () => {
    const seedId = nextSeed();
    const morning = await beginCollectRun(seedId, new Date("2026-07-20T08:00:00Z"));
    const evening = await beginCollectRun(seedId, new Date("2026-07-20T20:00:00Z"));
    expect(evening.id).not.toBe(morning.id);
  }, 60000);
});

describe("recordSourceOutcome", () => {
  it("records an empty success without moving source freshness backward", async () => {
    const seedId = nextSeed();
    const source = await seedSource(seedId);
    const run = await beginCollectRun(seedId, new Date("2026-07-20T08:00:00Z"));

    const check = await recordSourceOutcome(run.id, source.id, {
      kind: "success",
      items: [],
      httpStatus: 200,
      contentHash: "empty-hash",
    });
    expect(check.status).toBe("SUCCEEDED_EMPTY");
    expect(check.itemCount).toBe(0);
    expect(check.httpStatus).toBe(200);
    expect(check.contentHash).toBe("empty-hash");

    const after = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    expect(after.lastOkAt).not.toBeNull();
    expect(after.lastCrawledAt).not.toBeNull();

    // Replay: same check row, count stays 0, freshness never moves backward.
    const replay = await recordSourceOutcome(run.id, source.id, {
      kind: "success",
      items: [],
      httpStatus: 200,
      contentHash: "empty-hash",
    });
    expect(replay.id).toBe(check.id);
    expect(replay.itemCount).toBe(0);
    const afterReplay = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    expect(afterReplay.lastOkAt!.getTime()).toBeGreaterThanOrEqual(after.lastOkAt!.getTime());
  }, 60000);

  it("inserts items once and keeps ids and counts stable across replay", async () => {
    const seedId = nextSeed();
    const source = await seedSource(seedId);
    const run = await beginCollectRun(seedId, new Date("2026-07-20T08:00:00Z"));
    const outcome = {
      kind: "success" as const,
      items: [
        { url: `https://example.com/${seedId}/a`, title: "Item A" },
        { url: `https://example.com/${seedId}/b?utm_source=feed`, title: "Item B" },
      ],
      httpStatus: 200,
      contentHash: "items-hash",
    };

    const check = await recordSourceOutcome(run.id, source.id, outcome);
    expect(check.status).toBe("SUCCEEDED_ITEMS");
    expect(check.itemCount).toBe(2);

    const items = await prisma.item.findMany({
      where: { sourceId: source.id },
      orderBy: { url: "asc" },
    });
    expect(items).toHaveLength(2);
    const ids = items.map((i) => i.id);

    const replay = await recordSourceOutcome(run.id, source.id, outcome);
    expect(replay.id).toBe(check.id);
    expect(replay.itemCount).toBe(2);
    const afterReplay = await prisma.item.findMany({
      where: { sourceId: source.id },
      orderBy: { url: "asc" },
    });
    expect(afterReplay.map((i) => i.id)).toEqual(ids);
  }, 60000);

  it("adds only newly inserted items to an existing check", async () => {
    const seedId = nextSeed();
    const source = await seedSource(seedId);
    const run = await beginCollectRun(seedId, new Date("2026-07-20T08:00:00Z"));

    // A failed/blocked attempt first: no items, no freshness advance.
    const failed = await recordSourceOutcome(run.id, source.id, {
      kind: "failed",
      code: "HTTP_503",
      retryable: true,
      httpStatus: 503,
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.itemCount).toBe(0);
    expect(failed.error).toContain("HTTP_503");

    // A successful retry adds its insertion count to the same check row.
    const retried = await recordSourceOutcome(run.id, source.id, {
      kind: "success",
      items: [
        { url: `https://example.com/${seedId}/a`, title: "Item A" },
        { url: `https://example.com/${seedId}/b`, title: "Item B" },
      ],
      httpStatus: 200,
      contentHash: "retry-hash",
    });
    expect(retried.id).toBe(failed.id);
    expect(retried.status).toBe("SUCCEEDED_ITEMS");
    expect(retried.itemCount).toBe(2);

    // A later success carrying one more item increments by the new inserts only.
    const extended = await recordSourceOutcome(run.id, source.id, {
      kind: "success",
      items: [
        { url: `https://example.com/${seedId}/a`, title: "Item A" },
        { url: `https://example.com/${seedId}/b`, title: "Item B" },
        { url: `https://example.com/${seedId}/c`, title: "Item C" },
      ],
      httpStatus: 200,
      contentHash: "extended-hash",
    });
    expect(extended.id).toBe(failed.id);
    expect(extended.itemCount).toBe(3);
    expect(await prisma.item.count({ where: { sourceId: source.id } })).toBe(3);
  }, 60000);

  it("never advances source freshness for blocked or failed outcomes", async () => {
    const seedId = nextSeed();
    const lastOk = new Date("2026-07-01T00:00:00Z");
    const source = await seedSource(seedId, lastOk);
    const run = await beginCollectRun(seedId, new Date("2026-07-20T08:00:00Z"));

    const blocked = await recordSourceOutcome(run.id, source.id, {
      kind: "blocked",
      code: "BOT_WALL",
      retryable: false,
      httpStatus: 403,
    });
    expect(blocked.status).toBe("BLOCKED");
    expect(blocked.error).toContain("BOT_WALL");

    const failed = await recordSourceOutcome(run.id, source.id, {
      kind: "failed",
      code: "HTTP_500",
      retryable: true,
      httpStatus: 500,
    });
    expect(failed.id).toBe(blocked.id);
    expect(failed.status).toBe("FAILED");

    const after = await prisma.source.findUniqueOrThrow({ where: { id: source.id } });
    expect(after.lastOkAt?.getTime()).toBe(lastOk.getTime());
    expect(await prisma.item.count({ where: { sourceId: source.id } })).toBe(0);
  }, 60000);
});

describe("finishRun", () => {
  it("derives the run status from its checks and aggregates counts", async () => {
    const seedId = nextSeed();
    const okSource = await seedSource(`${seedId}-ok`);
    const badSource = await seedSource(`${seedId}-bad`);
    const run = await beginCollectRun(seedId, new Date("2026-07-20T08:00:00Z"));

    await recordSourceOutcome(run.id, okSource.id, {
      kind: "success",
      items: [{ url: `https://example.com/${seedId}/a`, title: "Item A" }],
      httpStatus: 200,
      contentHash: "ok-hash",
    });
    await recordSourceOutcome(run.id, badSource.id, {
      kind: "failed",
      code: "HTTP_500",
      retryable: true,
      httpStatus: 500,
    });

    const finished = await finishRun(run.id);
    expect(finished.status).toBe("PARTIAL");
    expect(finished.itemCount).toBe(1);
    expect(finished.finishedAt).not.toBeNull();

    // finishRun is itself idempotent: same status and count when recomputed.
    const refinshed = await finishRun(run.id);
    expect(refinshed.status).toBe("PARTIAL");
    expect(refinshed.itemCount).toBe(1);
  }, 60000);

  it("marks a fully empty-success run SUCCEEDED_EMPTY", async () => {
    const seedId = nextSeed();
    const source = await seedSource(seedId);
    const run = await beginCollectRun(seedId, new Date("2026-07-20T08:00:00Z"));
    await recordSourceOutcome(run.id, source.id, {
      kind: "success",
      items: [],
      httpStatus: 200,
      contentHash: "empty-hash",
    });
    const finished = await finishRun(run.id);
    expect(finished.status).toBe("SUCCEEDED_EMPTY");
    expect(finished.itemCount).toBe(0);
  }, 60000);
});
