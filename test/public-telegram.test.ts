import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  PUBLIC_TELEGRAM_ITEM_TYPE,
  PUBLIC_TELEGRAM_MIN_URGENCY,
  publicTelegramItemId,
  renderPublicTelegramMessage,
  runPublicTelegramPush,
  selectPublicTelegramChanges,
} from "../src/public-intelligence/telegram.js";
import type { CanonicalPublicRecord } from "../src/public-intelligence/types.js";
import type { ChannelSendResult } from "../src/push/send.js";
import { canonicalBase } from "../src/public-intelligence/site-url.js";

// Public Intelligence Task 8 — public Telegram distribution.
//
// Sends only VERIFIED, current, reviewed versions with urgency >= 70, once
// per version per channel (ChannelPush idempotency). The message carries
// title, concise public impact, readiness, effective date and the
// serializer's canonical permalink — never personal impact, relevance or
// actions. All sends in this file go through a FAKE sender; no real
// Telegram call is possible here.
//
// Requires DATABASE_URL pointing at an isolated branch with migration 0012+.
// Fixture strategy matches test/public-feeds.test.ts: one beforeAll burst,
// run-scoped ids, far-future reviewedAt, FK-safe teardown. The `q` filter
// (the read model's own vocabulary — not a new query shape) isolates this
// suite's fixtures from rows earlier files left on this worker's schema.

const prisma = new PrismaClient();

const runId = `testpt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const CHANNEL_ID = `${runId}-channel`;
let seedSeq = 0;

function nextSeed() {
  return `${runId}-${++seedSeq}`;
}

type SeedOverrides = {
  title?: string;
  urgency?: number;
  readiness?: "VERIFIED" | "MONITORED";
  editorialStatus?: "PUBLISHED" | "DRAFT";
  isCurrent?: boolean;
  reviewed?: boolean;
  generalImpact?: string;
  generalActionTemplate?: string | null;
};

async function seedVersion(overrides: SeedOverrides = {}): Promise<CanonicalPublicRecord> {
  const seedId = nextSeed();
  const source = await prisma.source.create({
    data: {
      id: `${seedId}-source`,
      name: "Telegram Test Source",
      url: `https://example.com/${seedId}`,
      adapter: "rss",
      frequencyCron: "0 * * * *",
      language: "en",
      regions: ["north_america"],
      platforms: [],
    },
  });
  const item = await prisma.item.create({
    data: {
      sourceId: source.id,
      url: `https://example.com/${seedId}/item`,
      urlHash: `${seedId}-hash`,
      title: `Telegram test item ${seedId}`,
      publishedAt: new Date("2026-07-01T00:00:00Z"),
      regions: ["north_america"],
      platforms: [],
      lang: "en",
    },
  });
  const cluster = await prisma.evidenceCluster.create({
    data: {
      fingerprint: `${seedId}-fp`,
      members: { create: [{ itemId: item.id, role: "PRIMARY_OFFICIAL" }] },
    },
  });
  const change = await prisma.canonicalChange.create({
    data: { slug: `${seedId}-change`, clusterId: cluster.id },
  });
  const version = await prisma.canonicalChangeVersion.create({
    data: {
      canonicalChangeId: change.id,
      version: 1,
      isCurrent: overrides.isCurrent ?? true,
      // Every fixture title carries the runId so the read model's own `q`
      // filter can isolate this suite from other files' rows on the schema.
      title: overrides.title ?? `${runId} eligible change ${seedId}`,
      summary: "A concise public summary",
      signalType: "REGULATORY",
      regions: ["north_america"],
      platforms: ["AMAZON"] as any,
      operatingStages: ["PREPARING_TO_LAUNCH"],
      productCategories: ["PET_SUPPLIES"] as any,
      riskAttributes: ["BATTERY"],
      policyTopics: ["IMPORT_CUSTOMS"],
      sourcePublishedAt: new Date("2026-07-15T00:00:00Z"),
      effectiveAt: new Date("2026-08-01T00:00:00Z"),
      urgency: overrides.urgency ?? 85,
      readiness: overrides.readiness ?? "VERIFIED",
      generalImpact: overrides.generalImpact ?? "New import documentation required",
      generalActionTemplate:
        overrides.generalActionTemplate === undefined
          ? "ACTION TEMPLATE MUST NEVER BE SENT"
          : overrides.generalActionTemplate,
      editorialStatus: overrides.editorialStatus ?? "PUBLISHED",
      // Fixed PAST review date: this suite isolates its fixtures with the
      // q-filter, so they never need to sort to the top of the unscoped
      // verified pool — and a past date keeps them clear of any unscoped
      // top-N window an earlier file on this worker may have asserted on.
      reviewedAt: overrides.reviewed === false ? null : new Date("2026-07-20T00:00:00Z"),
      reviewedBy: "reviewer-telegram-1",
    },
  });
  await prisma.evidenceRecord.create({
    data: {
      changeVersionId: version.id,
      sourceId: source.id,
      sourceItemId: item.id,
      url: `https://official.example/${seedId}/rule`,
      role: "PRIMARY_OFFICIAL",
      authorityLevel: "GOVERNMENT_OFFICIAL",
      publishedAt: new Date("2026-07-10T00:00:00Z"),
      access: "PUBLIC",
      licenseNote: "",
      excerpt: "raw excerpt",
      normalizedSummary: "Normalized official summary, safe to quote",
      contentHash: `${seedId}-ch`,
      fetchedAt: new Date("2026-07-18T00:00:00Z"),
      reviewedAt: new Date("2026-07-19T00:00:00Z"),
    },
  });
  // Ineligible fixtures (draft / non-current / unreviewed) cannot be
  // serialized — the serializer enforces the visibility gate — and the
  // assertions only need ids from eligible records anyway.
  const serializable =
    (overrides.isCurrent ?? true) &&
    (overrides.editorialStatus ?? "PUBLISHED") === "PUBLISHED" &&
    (overrides.reviewed ?? true);
  if (!serializable) return { versionId: version.id } as unknown as CanonicalPublicRecord;
  const { serializeCanonicalVersion } = await import("../src/public-intelligence/serialize.js");
  const full = await prisma.canonicalChangeVersion.findUniqueOrThrow({
    where: { id: version.id },
    include: {
      canonicalChange: { include: { versions: { orderBy: { version: "asc" } } } },
      evidence: { include: { source: true }, orderBy: [{ role: "asc" }, { publishedAt: "desc" }] },
    },
  });
  return serializeCanonicalVersion(full as any);
}

let eligibleA: CanonicalPublicRecord;
let eligibleB: CanonicalPublicRecord;
let hostile: CanonicalPublicRecord;

beforeAll(async () => {
  eligibleA = await seedVersion({ urgency: 85 });
  eligibleB = await seedVersion({ urgency: 72 });
  hostile = await seedVersion({
    title: `${runId} Cats & "Dogs" <Deluxe> Sale`,
    urgency: 91,
    generalImpact: `Impact with a > b & "quotes"`,
  });
  // Ineligible fixtures — same q-scope, each violating exactly one gate.
  await seedVersion({ urgency: PUBLIC_TELEGRAM_MIN_URGENCY - 1 }); // below urgency floor
  await seedVersion({ readiness: "MONITORED", urgency: 99 }); // not VERIFIED
  await seedVersion({ editorialStatus: "DRAFT", urgency: 99 }); // draft
  await seedVersion({ isCurrent: false, urgency: 99 }); // non-current
  await seedVersion({ reviewed: false, urgency: 99 }); // unreviewed
}, 180000);

afterAll(async () => {
  await prisma.channelPush.deleteMany({ where: { channelId: { startsWith: runId } } });
  await prisma.evidenceRecord.deleteMany({ where: { changeVersion: { canonicalChange: { slug: { startsWith: runId } } } } });
  await prisma.canonicalChangeVersion.deleteMany({ where: { canonicalChange: { slug: { startsWith: runId } } } });
  await prisma.canonicalChange.deleteMany({ where: { slug: { startsWith: runId } } });
  await prisma.evidenceClusterMember.deleteMany({ where: { cluster: { fingerprint: { startsWith: runId } } } });
  await prisma.evidenceCluster.deleteMany({ where: { fingerprint: { startsWith: runId } } });
  await prisma.item.deleteMany({ where: { sourceId: { startsWith: runId } } });
  await prisma.source.deleteMany({ where: { id: { startsWith: runId } } });
  // Prove the teardown is complete — interrupted runs have polluted this
  // branch before; zero residue is an assertion, not a hope.
  const residue = await prisma.canonicalChange.count({ where: { slug: { startsWith: runId } } });
  expect(residue).toBe(0);
  await prisma.$disconnect();
}, 120000);

function fakeSender(sent: Array<{ text: string; opts: unknown }>) {
  return async (text: string, opts: unknown): Promise<ChannelSendResult> => {
    sent.push({ text, opts });
    return { status: "sent", messageId: sent.length };
  };
}

describe("selectPublicTelegramChanges", () => {
  it("selects only VERIFIED current reviewed versions at or above the urgency floor", async () => {
    const selected = await selectPublicTelegramChanges({
      alreadyPushed: new Set(),
      q: runId,
      limit: 10,
    });
    const ids = selected.map((r) => r.versionId);
    expect(ids).toContain(eligibleA.versionId);
    expect(ids).toContain(eligibleB.versionId);
    expect(ids).toContain(hostile.versionId);
    // Exactly the three eligible fixtures: every other seeded row violates
    // one gate (urgency, readiness, status, currency, review).
    expect(selected).toHaveLength(3);
    for (const record of selected) {
      expect(record.readiness).toBe("VERIFIED");
      expect(record.urgency).toBeGreaterThanOrEqual(PUBLIC_TELEGRAM_MIN_URGENCY);
    }
  }, 60000);

  it("respects the per-run limit and the already-pushed set", async () => {
    const capped = await selectPublicTelegramChanges({ alreadyPushed: new Set(), q: runId, limit: 1 });
    expect(capped).toHaveLength(1);

    const withoutA = await selectPublicTelegramChanges({
      alreadyPushed: new Set([publicTelegramItemId(eligibleA), publicTelegramItemId(hostile)]),
      q: runId,
      limit: 10,
    });
    expect(withoutA.map((r) => r.versionId)).toEqual([eligibleB.versionId]);
  }, 60000);
});

describe("renderPublicTelegramMessage", () => {
  it("carries title, public impact, readiness, effective date and the canonical permalink", () => {
    const text = renderPublicTelegramMessage(eligibleA);
    expect(text).toContain(`<b>${eligibleA.title}</b>`);
    expect(text).toContain(eligibleA.generalImpact);
    expect(text).toContain("Verified");
    expect(text).toContain("2026-08-01"); // effective date
    expect(text).toContain(eligibleA.permalink);
    // The permalink is the serializer's own bytes.
    expect(eligibleA.permalink).toBe(`${canonicalBase()}/changes/${eligibleA.slug}`);
  });

  it("never carries actions or personal impact, and escapes HTML", () => {
    const text = renderPublicTelegramMessage(eligibleA);
    expect(text).not.toContain("ACTION TEMPLATE MUST NEVER BE SENT");

    const hostileText = renderPublicTelegramMessage(hostile);
    expect(hostileText).not.toContain("<Deluxe>");
    expect(hostileText).toContain("&lt;Deluxe&gt;");
    expect(hostileText).toContain("Cats &amp;"); // first & escaped in title
    expect(hostileText).toContain("a &gt; b &amp;");
  });
});

describe("runPublicTelegramPush", () => {
  it("sends each eligible version once per channel and is idempotent on re-run", async () => {
    const sent: Array<{ text: string; opts: unknown }> = [];
    const first = await runPublicTelegramPush({
      sender: fakeSender(sent),
      channelId: CHANNEL_ID,
      q: runId,
      limit: 10,
    });
    expect(first.posted).toBe(3);
    expect(sent).toHaveLength(3);
    // The tappable link preview is the canonical permalink, never a source URL.
    for (const call of sent) {
      expect((call.opts as { previewUrl?: string }).previewUrl).toMatch(
        new RegExp(`^${canonicalBase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/changes/`),
      );
    }

    const tracked = await prisma.channelPush.findMany({
      where: { channelId: CHANNEL_ID, itemType: PUBLIC_TELEGRAM_ITEM_TYPE },
    });
    expect(tracked).toHaveLength(3);
    expect(new Set(tracked.map((r) => r.itemId)).size).toBe(3);

    // Second run, same channel: nothing is re-sent.
    const sentAgain: Array<{ text: string; opts: unknown }> = [];
    const second = await runPublicTelegramPush({
      sender: fakeSender(sentAgain),
      channelId: CHANNEL_ID,
      q: runId,
      limit: 10,
    });
    expect(second.posted).toBe(0);
    expect(sentAgain).toHaveLength(0);

    // A different channel is a different idempotency scope.
    const sentOther: Array<{ text: string; opts: unknown }> = [];
    const third = await runPublicTelegramPush({
      sender: fakeSender(sentOther),
      channelId: `${CHANNEL_ID}-2`,
      q: runId,
      limit: 10,
    });
    expect(third.posted).toBe(3);
    expect(sentOther).toHaveLength(3);
  }, 120000);

  it("a failed send is not tracked, so the next run retries it", async () => {
    const channelId = `${runId}-flaky`;
    const failing = await runPublicTelegramPush({
      sender: async () => ({ status: "failed" }) as ChannelSendResult,
      channelId,
      q: runId,
      limit: 1,
    });
    expect(failing.posted).toBe(0);
    expect(failing.failed).toBe(1);
    const tracked = await prisma.channelPush.count({ where: { channelId } });
    expect(tracked).toBe(0);

    const sent: Array<{ text: string; opts: unknown }> = [];
    const retry = await runPublicTelegramPush({
      sender: fakeSender(sent),
      channelId,
      q: runId,
      limit: 1,
    });
    expect(retry.posted).toBe(1);
    expect(sent).toHaveLength(1);
  }, 120000);
});
