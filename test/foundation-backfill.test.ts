import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "../src/db/client.js";
import {
  applyFoundationBackfill,
  isApprovedApplyTarget,
  planFoundationBackfill,
  type BackfillReport,
} from "../src/canonicalize/backfill.js";

const RUN_ID = randomUUID();

const SOURCE_ID = `legacy-backfill-test-source-${RUN_ID}`;
const ITEM_ID = `legacy-backfill-test-item-${RUN_ID}`;
const CLUSTER_ID = `legacy-backfill-test-cluster-${RUN_ID}`;
const ALERT_ID = `legacy-backfill-test-alert-${RUN_ID}`;
const ALERT_SHARED_CLUSTER_ID = `legacy-backfill-test-alert-shared-cluster-${RUN_ID}`;
const ALERT_MISSING_TITLE_ID = `legacy-backfill-test-alert-missing-title-${RUN_ID}`;
const ALERT_ORPHAN_ID = `legacy-backfill-test-alert-orphan-${RUN_ID}`;

const SLUG_CONVERTIBLE = `legacy-alert:${ALERT_ID}`;
const SLUG_SHARED_CLUSTER = `legacy-alert:${ALERT_SHARED_CLUSTER_ID}`;
const SLUG_MISSING_TITLE = `legacy-alert:${ALERT_MISSING_TITLE_ID}`;
const SLUG_ORPHAN = `legacy-alert:${ALERT_ORPHAN_ID}`;
const CLUSTER_FINGERPRINT = `legacy-cluster:${CLUSTER_ID}:alert:${ALERT_ID}`;
const SHARED_CLUSTER_FINGERPRINT =
  `legacy-cluster:${CLUSTER_ID}:alert:${ALERT_SHARED_CLUSTER_ID}`;
const ORPHAN_CLUSTER_FINGERPRINT = `legacy-alert-cluster:${ALERT_ORPHAN_ID}`;

const FIXTURE_SLUGS = [
  SLUG_CONVERTIBLE,
  SLUG_SHARED_CLUSTER,
  SLUG_MISSING_TITLE,
  SLUG_ORPHAN,
];
const FIXTURE_CLUSTER_FINGERPRINTS = [
  CLUSTER_FINGERPRINT,
  SHARED_CLUSTER_FINGERPRINT,
  ORPHAN_CLUSTER_FINGERPRINT,
];
const SOURCE_URL = `https://example.com/backfill-test/source-${RUN_ID}`;
const ITEM_URL = `https://example.com/backfill-test/item-${RUN_ID}`;
const ITEM_URL_HASH = `legacy-backfill-test-hash-${RUN_ID}`;

let fixturePlan: BackfillReport;

async function cleanupFixtureRows() {
  const versions = await prisma.canonicalChangeVersion.findMany({
    where: {
      canonicalChange: {
        slug: { in: FIXTURE_SLUGS },
      },
    },
    select: { id: true },
  });
  const versionIds = versions.map((v) => v.id);

  await prisma.evidenceRecord.deleteMany({
    where: { changeVersionId: { in: versionIds } },
  });
  await prisma.canonicalChangeVersion.deleteMany({
    where: { id: { in: versionIds } },
  });
  await prisma.canonicalChange.deleteMany({
    where: { slug: { in: FIXTURE_SLUGS } },
  });
  await prisma.evidenceClusterMember.deleteMany({
    where: { itemId: ITEM_ID },
  });
  await prisma.evidenceCluster.deleteMany({
    where: {
      fingerprint: {
        in: FIXTURE_CLUSTER_FINGERPRINTS,
      },
    },
  });
  await prisma.alert.deleteMany({
    where: {
      id: {
        in: [ALERT_ID, ALERT_SHARED_CLUSTER_ID, ALERT_MISSING_TITLE_ID, ALERT_ORPHAN_ID],
      },
    },
  });
  await prisma.cluster.deleteMany({ where: { id: CLUSTER_ID } });
  await prisma.item.deleteMany({
    where: { OR: [{ id: ITEM_ID }, { url: ITEM_URL }, { urlHash: ITEM_URL_HASH }] },
  });
  await prisma.source.deleteMany({
    where: { OR: [{ id: SOURCE_ID }, { url: SOURCE_URL }] },
  });
}

async function seedFixtures() {
  await prisma.source.create({
    data: {
      id: SOURCE_ID,
      name: "Backfill Test Source",
      url: SOURCE_URL,
      adapter: "rss",
      frequencyCron: "0 * * * *",
      language: "en",
      regions: ["north_america"],
      platforms: [],
    },
  });
  await prisma.item.create({
    data: {
      id: ITEM_ID,
      sourceId: SOURCE_ID,
      url: ITEM_URL,
      urlHash: ITEM_URL_HASH,
      title: "Backfill test item",
      publishedAt: new Date("2026-07-01T00:00:00Z"),
      regions: ["north_america"],
      platforms: [],
      lang: "en",
    },
  });
  await prisma.cluster.create({
    data: {
      id: CLUSTER_ID,
      representativeItemId: ITEM_ID,
      sourceUrls: [ITEM_URL],
      items: { connect: { id: ITEM_ID } },
    },
  });
  await prisma.alert.create({
    data: {
      id: ALERT_ID,
      clusterId: CLUSTER_ID,
      title: "Legacy backfill test alert",
      summary: "Backfill test alert summary",
      urgencyScore: 5,
      regions: ["north_america"],
      platforms: [],
      category: "regulatory",
      affectedSkus: [],
      sourceUrls: [ITEM_URL],
      status: "published",
      publishedAt: new Date("2026-07-01T00:00:00Z"),
    },
  });
  await prisma.alert.create({
    data: {
      id: ALERT_SHARED_CLUSTER_ID,
      clusterId: CLUSTER_ID,
      title: "Second legacy alert sharing a cluster",
      summary: "Second alert on the same legacy cluster",
      urgencyScore: 3,
      regions: ["north_america"],
      platforms: [],
      category: "regulatory",
      affectedSkus: [],
      sourceUrls: [ITEM_URL],
      status: "published",
      publishedAt: new Date("2026-07-01T00:00:00Z"),
    },
  });
  await prisma.alert.create({
    data: {
      id: ALERT_MISSING_TITLE_ID,
      title: "   ",
      summary: "missing title",
      urgencyScore: 1,
      regions: [],
      platforms: [],
      category: "regulatory",
      affectedSkus: [],
      sourceUrls: [],
      status: "pending_review",
    },
  });
  await prisma.alert.create({
    data: {
      id: ALERT_ORPHAN_ID,
      title: "Legacy orphan alert",
      summary: "orphan alert summary",
      urgencyScore: 2,
      regions: ["north_america"],
      platforms: [],
      category: "platform_policy",
      affectedSkus: [],
      sourceUrls: [ITEM_URL],
      status: "published",
      publishedAt: new Date("2026-07-01T00:00:00Z"),
    },
  });
}

async function stablePair(
  timeoutMs = 240000,
): Promise<{ first: BackfillReport; second: BackfillReport }> {
  const deadline = Date.now() + timeoutMs;
  let first = await planFoundationBackfill();
  while (Date.now() < deadline) {
    const second = await planFoundationBackfill();
    if (second.fingerprint === first.fingerprint) {
      return { first, second };
    }
    first = second;
  }
  throw new Error(`Could not obtain stable backfill plan pair within ${timeoutMs}ms`);
}

function isFingerprintMismatch(error: unknown): error is Error {
  return (
    error instanceof Error &&
    /^Fingerprint mismatch: expected [0-9a-f]{64}, got [0-9a-f]{64}$/.test(error.message)
  );
}

function expectFirstApplyMatchesPlan(plan: BackfillReport, applied: BackfillReport) {
  expect(applied.fingerprint).toBe(plan.fingerprint);
  expect(applied.sourceItems).toBe(plan.sourceItems);
  expect(applied.clusters).toBe(plan.clusters);
  expect(applied.canonicalChanges).toBe(plan.canonicalChanges);
  expect(applied.versions).toBe(plan.versions);
  expect(applied.evidenceRecords).toBe(plan.evidenceRecords);
  expect(applied.rejectedRows).toEqual(plan.rejectedRows);
}

function expectReplayIsEmpty(plan: BackfillReport, replay: BackfillReport) {
  expect(replay.fingerprint).toBe(plan.fingerprint);
  expect(replay.sourceItems).toBe(0);
  expect(replay.clusters).toBe(0);
  expect(replay.canonicalChanges).toBe(0);
  expect(replay.versions).toBe(0);
  expect(replay.evidenceRecords).toBe(0);
  expect(replay.rejectedRows).toEqual(plan.rejectedRows);
}

async function expectAppliedFixtureState() {
  const created = await prisma.canonicalChange.findUnique({
    where: { slug: SLUG_CONVERTIBLE },
    include: {
      versions: {
        include: { evidence: true },
      },
    },
  });
  expect(created).not.toBeNull();
  expect(created!.versions.length).toBe(1);
  expect(created!.versions[0]!.editorialStatus).toBe("IN_REVIEW");
  expect(created!.versions[0]!.readiness).toBe("EXPERIMENTAL");
  expect(created!.versions[0]!.isCurrent).toBe(false);
  expect(created!.versions[0]!.evidence.length).toBeGreaterThan(0);
  expect(
    created!.versions[0]!.evidence.every((e) => e.role === "SECONDARY_CONTEXT"),
  ).toBe(true);

  const sharedClusterChanges = await prisma.canonicalChange.findMany({
    where: { slug: { in: [SLUG_CONVERTIBLE, SLUG_SHARED_CLUSTER] } },
    include: { cluster: true },
    orderBy: { slug: "asc" },
  });
  expect(sharedClusterChanges).toHaveLength(2);
  expect(new Set(sharedClusterChanges.map((change) => change.clusterId)).size).toBe(2);
  expect(sharedClusterChanges.map((change) => change.cluster.fingerprint).sort()).toEqual(
    [CLUSTER_FINGERPRINT, SHARED_CLUSTER_FINGERPRINT].sort(),
  );

  const orphanCluster = await prisma.evidenceCluster.findUnique({
    where: { fingerprint: ORPHAN_CLUSTER_FINGERPRINT },
    include: { members: true },
  });
  expect(orphanCluster).not.toBeNull();
  expect(
    orphanCluster!.members.some(
      (member) => member.itemId === ITEM_ID && member.role === "SECONDARY_CONTEXT",
    ),
  ).toBe(true);
}

async function expectApplyAndReplayWithRetry(
  timeoutMs = 540000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await cleanupFixtureRows();
    await seedFixtures();
    const { second: plan } = await stablePair(Math.max(1, deadline - Date.now()));

    let applied: BackfillReport;
    try {
      applied = await applyFoundationBackfill(plan.fingerprint);
    } catch (error) {
      if (!isFingerprintMismatch(error)) throw error;
      continue;
    }

    expectFirstApplyMatchesPlan(plan, applied);
    await expectAppliedFixtureState();

    let replay: BackfillReport;
    try {
      replay = await applyFoundationBackfill(applied.fingerprint);
    } catch (error) {
      if (!isFingerprintMismatch(error)) throw error;
      continue;
    }

    expectReplayIsEmpty(plan, replay);
    return;
  }
  throw new Error(`Could not apply and replay backfill within ${timeoutMs}ms`);
}

describe("foundation backfill apply target safety", () => {
  it("requires the write URL and rejects any present non-approved database URL", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    const originalDirectUrl = process.env.DIRECT_URL;

    try {
      delete process.env.DATABASE_URL;
      process.env.DIRECT_URL =
        "postgresql://user:pass@ep-proud-dream-aotwdl52.c-2.ap-southeast-1.aws.neon.tech/db";
      expect(isApprovedApplyTarget()).toBe(false);
      await expect(applyFoundationBackfill("unused-fingerprint")).rejects.toThrow(
        /DATABASE_URL is required/i,
      );

      process.env.DATABASE_URL =
        "postgresql://user:pass@ep-production-pooler.c-2.ap-southeast-1.aws.neon.tech/db";
      expect(isApprovedApplyTarget()).toBe(false);

      process.env.DATABASE_URL =
        "postgresql://user:pass@ep-proud-dream-aotwdl52-pooler.c-2.ap-southeast-1.aws.neon.tech/db";
      process.env.DIRECT_URL =
        "postgresql://user:pass@attacker-ep-proud-dream-aotwdl52.example.com/db";
      expect(isApprovedApplyTarget()).toBe(false);

      process.env.DIRECT_URL =
        "postgresql://user:pass@ep-proud-dream-aotwdl52.c-2.ap-southeast-1.aws.neon.tech/db";
      expect(isApprovedApplyTarget()).toBe(true);
    } finally {
      if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = originalDatabaseUrl;
      if (originalDirectUrl === undefined) delete process.env.DIRECT_URL;
      else process.env.DIRECT_URL = originalDirectUrl;
    }
  });
});

describe("foundation backfill", () => {
  beforeAll(async () => {
    await cleanupFixtureRows();
    await seedFixtures();
    const pair = await stablePair();
    fixturePlan = pair.second;
  }, 300000);

  afterAll(async () => {
    await cleanupFixtureRows();
  }, 300000);

  it("maps a legacy alert to an in-review experimental draft with exact legacy-alert slug", () => {
    const draft = fixturePlan.drafts.find((d) => d.slug === SLUG_CONVERTIBLE);
    expect(draft).toBeDefined();
    expect(draft).toMatchObject({
      id: ALERT_ID,
      slug: SLUG_CONVERTIBLE,
      readiness: "EXPERIMENTAL",
      editorialStatus: "IN_REVIEW",
      isCurrent: false,
    });
  });

  it("maps linked legacy item evidence to the fixture source", () => {
    const draft = fixturePlan.drafts.find((d) => d.slug === SLUG_CONVERTIBLE);
    expect(draft).toBeDefined();
    const evidenceSourceId = draft?.evidence[0]?.sourceId;
    expect(evidenceSourceId).toBe(SOURCE_ID);
  });

  it("produces the same fingerprint on repeated dry runs", async () => {
    const { first, second } = await stablePair();
    expect(second.fingerprint).toBe(first.fingerprint);
  }, 240000);

  it("keeps legacy source urls and items as secondary context evidence", () => {
    const draft = fixturePlan.drafts.find((d) => d.slug === SLUG_CONVERTIBLE);
    expect(draft).toBeDefined();
    expect(draft!.evidence.length).toBeGreaterThan(0);
    expect(draft!.evidence.every((e) => e.role === "SECONDARY_CONTEXT")).toBe(true);
  });

  it("records fixture-derived rejected rows with reasons", () => {
    const rejected = fixturePlan.rejectedRows.filter(
      (r) => r.table === "alerts" && r.id === ALERT_MISSING_TITLE_ID,
    );
    expect(rejected.length).toBe(1);
    expect(rejected[0]!.reason).toMatch(/MISSING_TITLE/i);
  });

  it("apply matches the dry-run counts exactly on first apply and zero on replay", async () => {
    await expectApplyAndReplayWithRetry();
  }, 600000);

  it("apply rejects a mismatched fingerprint", async () => {
    await expect(applyFoundationBackfill("not-the-fingerprint")).rejects.toThrow(
      /fingerprint/i,
    );
  }, 60000);
});
