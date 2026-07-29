/**
 * Contract tests for briefing-batch job (Operations Task 3 — Weekly Briefing).
 *
 * Tests call createBriefingBatch(deps) — the factory — not the production
 * qualifyWeeklyBriefing.  All deps are injectable for credential-free execution.
 */

import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import type { JobArgs } from "../src/jobs/types.js";
import {
  createBriefingBatch,
  loadOperationalAlert,
  setOperationalAlertStore,
  type BriefingBatchDeps,
  type OperationalAlertStore,
} from "../src/jobs/briefing-batch.js";

function baseArgs(overrides?: Partial<JobArgs>): JobArgs {
  return {
    scheduledFor: new Date("2026-07-29T08:00:00Z"),
    runnerVersion: "test",
    dryRun: false,
    ...overrides,
  };
}

/** Monday = 2026-07-27 (Monday UTC) */
function mondayArgs(): JobArgs {
  return baseArgs({ scheduledFor: new Date("2026-07-27T08:00:00Z") });
}

/** Monday 03:10 UTC (the cron time) */
function mondayCronArgs(): JobArgs {
  return baseArgs({ scheduledFor: new Date("2026-07-27T03:10:00Z") });
}

/** Sunday = 2026-08-02 (Sunday UTC) */
function sundayArgs(): JobArgs {
  return baseArgs({ scheduledFor: new Date("2026-08-02T08:00:00Z") });
}

class InMemoryAlertStore implements OperationalAlertStore {
  readonly alerts = new Map<string, boolean>();
  readonly recordCounts = new Map<string, number>();
  async record(key: string) {
    this.alerts.set(key, true);
    this.recordCounts.set(key, (this.recordCounts.get(key) ?? 0) + 1);
  }
  async load(key: string) {
    return this.alerts.has(key);
  }
}

function makeBriefinger(deps: Partial<BriefingBatchDeps> = {}) {
  const alertStore = new InMemoryAlertStore();
  setOperationalAlertStore(alertStore);

  let nextRunId = 1;
  const runStore = new Map<
    string,
    {
      status: string;
      itemCount: number;
      metadata: unknown;
      outputFingerprint: string;
      finished: boolean;
    }
  >();

  return {
    alertStore,
    call: createBriefingBatch({
      selectQualifiedVersions:
        deps.selectQualifiedVersions ?? (async () => []),
      beginRun: deps.beginRun ?? (async () => `run-${nextRunId++}`),
      finishRun:
        deps.finishRun ??
        (async (runId, summary) => {
          runStore.set(runId, { ...summary, finished: true });
        }),
      existingSummary:
        deps.existingSummary ??
        (async (runId) => {
          const r = runStore.get(runId);
          if (!r || !r.finished) return null;
          return {
            ...r,
            versionIds: (r.metadata as any)?.versionIds ?? [],
          };
        }),
      recordOperationalAlert:
        deps.recordOperationalAlert ??
        (async (key) => {
          alertStore.alerts.set(key, true);
          alertStore.recordCounts.set(
            key,
            (alertStore.recordCounts.get(key) ?? 0) + 1,
          );
        }),
    }),
  };
}

// ============================ weekly absence ====================

describe("briefingBatch — weekly absence", () => {
  it("records briefing absence when the weekly window has no qualified content", async () => {
    const { call } = makeBriefinger();
    const result = await call(mondayArgs());
    expect(result).toMatchObject({ status: "BLOCKED", exitCode: 2 });
    expect(await loadOperationalAlert("BRIEFING_ABSENT")).toBe(true);
  });
});

// ============================ daily absence =====================

describe("briefingBatch — daily absence", () => {
  it("returns SUCCEEDED_EMPTY on non-Monday with no qualified content", async () => {
    const { call } = makeBriefinger();
    const result = await call(
      baseArgs({ scheduledFor: new Date("2026-07-29T08:00:00Z") }),
    );
    expect(result.status).toBe("SUCCEEDED_EMPTY");
    expect(result.exitCode).toBe(0);
  });

  it("does not record BRIEFING_ABSENT on non-Monday with no qualified content", async () => {
    const { call } = makeBriefinger();
    await call(
      baseArgs({ scheduledFor: new Date("2026-07-30T08:00:00Z") }),
    );
    expect(await loadOperationalAlert("BRIEFING_ABSENT")).toBe(false);
  });

  it("returns SUCCEEDED_EMPTY on Sunday with no qualified content", async () => {
    const { call } = makeBriefinger();
    const result = await call(sundayArgs());
    expect(result.status).toBe("SUCCEEDED_EMPTY");
    expect(result.exitCode).toBe(0);
  });
});

// ============================ weekly qualification ==============

describe("briefingBatch — weekly qualification", () => {
  it("qualifies versions with Monitored or Verified readiness", async () => {
    const { call } = makeBriefinger({
      selectQualifiedVersions: async (opts) => {
        expect(opts.readinessLevels).toEqual(["MONITORED", "VERIFIED"]);
        return [
          { versionId: "v-003" },
          { versionId: "v-001" },
          { versionId: "v-002" },
        ];
      },
    });
    const result = await call(mondayArgs());
    expect(result.status).toBe("SUCCEEDED_ITEMS");
    expect(result.itemCount).toBe(3);
    expect(result.exitCode).toBe(0);
  }, 10000);

  it("stores ordered version IDs and a stable outputFingerprint in metadata", async () => {
    let capturedSummary: any = null;
    const { call } = makeBriefinger({
      selectQualifiedVersions: async () => [
        { versionId: "v-003" },
        { versionId: "v-001" },
        { versionId: "v-002" },
      ],
      finishRun: async (_rid, summary) => {
        capturedSummary = summary;
      },
    });
    await call(mondayArgs());
    expect(capturedSummary).not.toBeNull();
    expect(capturedSummary.status).toBe("SUCCEEDED_ITEMS");
    expect(capturedSummary.itemCount).toBe(3);
    const meta = capturedSummary.metadata as { versionIds: string[] };
    expect(meta.versionIds).toEqual(["v-001", "v-002", "v-003"]);
    expect(capturedSummary.outputFingerprint).toBe(
      createHash("sha256").update("v-001,v-002,v-003").digest("hex"),
    );
  }, 10000);

  // ---- window tests: Monday selects the PRECEDING completed week ----

  it("Monday at 08:00 selects the previous Monday-Sunday window", async () => {
    const captured: { windowStart?: string; windowEnd?: string } = {};
    const { call } = makeBriefinger({
      selectQualifiedVersions: async (_opts) => [],
      finishRun: async (_rid, summary) => {
        const m = summary.metadata as {
          windowStart: string;
          windowEnd: string;
        };
        captured.windowStart = m.windowStart;
        captured.windowEnd = m.windowEnd;
      },
    });
    // Monday 2026-07-27T08:00Z → previous week 2026-07-20 to 2026-07-27
    await call(mondayArgs());
    expect(captured.windowStart).toBe("2026-07-20T00:00:00.000Z");
    expect(captured.windowEnd).toBe("2026-07-27T00:00:00.000Z");
  }, 10000);

  it("Monday cron time 03:10 selects the previous Monday-Sunday window", async () => {
    const captured: { windowStart?: string; windowEnd?: string } = {};
    const { call } = makeBriefinger({
      selectQualifiedVersions: async (_opts) => [],
      finishRun: async (_rid, summary) => {
        const m = summary.metadata as {
          windowStart: string;
          windowEnd: string;
        };
        captured.windowStart = m.windowStart;
        captured.windowEnd = m.windowEnd;
      },
    });
    // Monday 2026-07-27T03:10Z (cron) → previous week 2026-07-20 to 2026-07-27
    await call(mondayCronArgs());
    expect(captured.windowStart).toBe("2026-07-20T00:00:00.000Z");
    expect(captured.windowEnd).toBe("2026-07-27T00:00:00.000Z");
  }, 10000);

  it("mid-week date selects the current Monday-Sunday window", async () => {
    const captured: { windowStart?: string; windowEnd?: string } = {};
    const { call } = makeBriefinger({
      selectQualifiedVersions: async (_opts) => [],
      finishRun: async (_rid, summary) => {
        const m = summary.metadata as {
          windowStart: string;
          windowEnd: string;
        };
        captured.windowStart = m.windowStart;
        captured.windowEnd = m.windowEnd;
      },
    });
    // Wednesday 2026-07-29 → current week 2026-07-27 to 2026-08-03
    await call(baseArgs());
    expect(captured.windowStart).toBe("2026-07-27T00:00:00.000Z");
    expect(captured.windowEnd).toBe("2026-08-03T00:00:00.000Z");
  }, 10000);

  it("Sunday selects the current Monday-Sunday window", async () => {
    const captured: { windowStart?: string; windowEnd?: string } = {};
    const { call } = makeBriefinger({
      selectQualifiedVersions: async (_opts) => [],
      finishRun: async (_rid, summary) => {
        const m = summary.metadata as {
          windowStart: string;
          windowEnd: string;
        };
        captured.windowStart = m.windowStart;
        captured.windowEnd = m.windowEnd;
      },
    });
    // Sunday 2026-08-02 → current week 2026-07-27 to 2026-08-03
    await call(sundayArgs());
    expect(captured.windowStart).toBe("2026-07-27T00:00:00.000Z");
    expect(captured.windowEnd).toBe("2026-08-03T00:00:00.000Z");
  }, 10000);
});

// ============================ replay idempotency ================

describe("briefingBatch — replay idempotency", () => {
  it("replay returns persisted cumulative result and fingerprint", async () => {
    let prior: any = null;
    const { call } = makeBriefinger({
      selectQualifiedVersions: async () => [
        { versionId: "v-a" },
        { versionId: "v-b" },
      ],
      finishRun: async (_rid, summary) => {
        prior = {
          ...summary,
          versionIds: (summary.metadata as any)?.versionIds ?? [],
        };
      },
      existingSummary: async () => prior,
    });
    const first = await call(mondayArgs());
    expect(first.status).toBe("SUCCEEDED_ITEMS");
    expect(first.itemCount).toBe(2);
    expect(first.exitCode).toBe(0);

    // Replay should return the same result
    const second = await call(mondayArgs());
    expect(second.status).toBe("SUCCEEDED_ITEMS");
    expect(second.itemCount).toBe(2);
    expect(second.exitCode).toBe(0);
  }, 10000);
});

// ============================ absent replay =====================

describe("briefingBatch — absent replay", () => {
  it("replay preserves BLOCKED status for absent week", async () => {
    let prior: any = null;
    const { call } = makeBriefinger({
      selectQualifiedVersions: async () => [],
      finishRun: async (_rid, summary) => {
        prior = { ...summary, versionIds: [] };
      },
      existingSummary: async () => prior,
    });
    const first = await call(mondayArgs());
    expect(first.status).toBe("BLOCKED");
    expect(first.exitCode).toBe(2);

    // Replay should preserve BLOCKED
    const second = await call(mondayArgs());
    expect(second.status).toBe("BLOCKED");
    expect(second.exitCode).toBe(2);
  }, 10000);

  it("records BRIEFING_ABSENT exactly once across replay of the same slot", async () => {
    let prior: any = null;
    const { call, alertStore } = makeBriefinger({
      selectQualifiedVersions: async () => [],
      finishRun: async (_rid, summary) => {
        prior = { ...summary, versionIds: [] };
      },
      existingSummary: async () => prior,
    });

    // First run records the alert
    await call(mondayArgs());
    expect(alertStore.recordCounts.get("BRIEFING_ABSENT")).toBe(1);

    // Replay must NOT re-record the alert
    await call(mondayArgs());
    expect(alertStore.recordCounts.get("BRIEFING_ABSENT")).toBe(1);
  }, 10000);
});

// ============================ zero qualified ====================

describe("briefingBatch — zero qualified", () => {
  it("weekly with zero qualified entries emits BRIEFING_ABSENT and BLOCKED", async () => {
    const { call } = makeBriefinger({
      selectQualifiedVersions: async () => [],
    });
    const result = await call(mondayArgs());
    expect(result.status).toBe("BLOCKED");
    expect(result.exitCode).toBe(2);
    expect(result.itemCount).toBe(0);
    expect(await loadOperationalAlert("BRIEFING_ABSENT")).toBe(true);
  }, 10000);
});

// ============================ not weekly ========================

describe("briefingBatch — not weekly", () => {
  it("mid-week run with content still qualifies but does not emit BRIEFING_ABSENT", async () => {
    const { call } = makeBriefinger({
      selectQualifiedVersions: async () => [{ versionId: "v-1" }],
    });
    const result = await call(baseArgs()); // Wednesday
    expect(result.status).toBe("SUCCEEDED_ITEMS");
    expect(result.exitCode).toBe(0);
    expect(await loadOperationalAlert("BRIEFING_ABSENT")).toBe(false);
  }, 10000);
});
