/**
 * Task 10 — shared test-orphan detection and cleanup.
 *
 * Used by test/orphan-guard.test.ts (in-suite loud failure on accumulation)
 * and scripts/cleanup-test-orphans.ts (the documented remediation). Killed
 * runs leave run-scoped fixtures behind; 91 orphaned canonical changes had
 * to be removed by hand during the Task 7 review. Everything here is
 * PREFIX-SCOPED (TEST_ID_LIKE_PATTERNS) and age-filtered, so real branch
 * data and a concurrently running suite's fresh fixtures are never matched.
 *
 * Raw SQL with schema-qualified identifiers: every identifier and LIKE
 * pattern below is a compile-time constant from this file — no user input is
 * ever interpolated.
 */

/**
 * LIKE patterns matching every run-scoped id prefix used under test/ and
 * test/e2e/. Distinctive prefixes are matched with CONTAINS (some files
 * embed runId mid-column, e.g. `guide-src-<runId>` or example.com URLs);
 * the bare `test-<epoch ms>` prefix stays anchored because it is less
 * distinctive.
 */
const DISTINCTIVE_TOKENS = [
  "testpubch-", // public-channel-consistency (before testpub- so it is never shadowed)
  "testpub-", // public-read-model
  "testhub-", // public-hubs
  "testpf-", // public-feeds
  "testapi-", // public-api-v1
  "testsearch-", // public-search
  "testpt-", // public-telegram
  "testgb-", // guides-briefings
  "testpage-", // canonical-change-page
  "testpbp-", // public-backfill-plan
  "legacy-backfill-test-", // foundation-backfill
  "e2echanges-", // e2e public-changes
  "e2egb-", // e2e public-briefings / link-integrity
];

export const TEST_ID_LIKE_PATTERNS = [
  ...DISTINCTIVE_TOKENS.map((t) => `%${t}%`),
  // Bare `test-${Date.now()}-...` runIds (coverage-readiness, canonical-publish,
  // collection-run). Epoch milliseconds start with "1" until 2033.
  "test-1%",
];

interface DirectTable {
  table: string;
  /** columns probed with TEST_ID_LIKE_PATTERNS */
  columns: string[];
  /** timestamp column for the age filter */
  ageColumn: string;
}

/** Tables whose own columns carry a run-scoped prefix. */
const DIRECT_TABLES: DirectTable[] = [
  { table: "sources", columns: ["id", "url"], ageColumn: "createdAt" },
  // items has no createdAt; crawledAt plays the age role.
  { table: "items", columns: ["id", "url", "title", "urlHash"], ageColumn: "crawledAt" },
  { table: "clusters", columns: ["id"], ageColumn: "createdAt" },
  { table: "alerts", columns: ["id", "title"], ageColumn: "createdAt" },
  { table: "EvidenceCluster", columns: ["id", "fingerprint"], ageColumn: "createdAt" },
  { table: "CanonicalChange", columns: ["slug", "clusterId"], ageColumn: "createdAt" },
  { table: "daily_notes", columns: ["id", "slug"], ageColumn: "createdAt" },
  { table: "Briefing", columns: ["slug", "periodKey", "fingerprint"], ageColumn: "createdAt" },
  { table: "Guide", columns: ["id", "slug"], ageColumn: "createdAt" },
  { table: "PipelineRun", columns: ["scopeKey"], ageColumn: "startedAt" },
  { table: "channel_pushes", columns: ["channelId", "itemId"], ageColumn: "pushedAt" },
  // CoverageCapability has no createdAt; lastReviewedAt plays the age role.
  { table: "CoverageCapability", columns: ["key"], ageColumn: "lastReviewedAt" },
  { table: "LegacyRedirect", columns: ["fromPath", "toPath"], ageColumn: "createdAt" },
];

function likeClause(columns: string[]): string {
  const conditions = columns.flatMap((col) =>
    TEST_ID_LIKE_PATTERNS.map((pat) => `"${col}" LIKE '${pat}'`),
  );
  return `(${conditions.join(" OR ")})`;
}

function directWhere(t: DirectTable, olderThanHours: number): string {
  return `${likeClause(t.columns)} AND "${t.ageColumn}" < now() - (${olderThanHours} || ' hours')::interval`;
}

/** Matched-parent subquery predicates for child tables (no age filter — the parent predicate implies orphanage). */
const MATCHED = {
  changes: (s: string) =>
    `SELECT id FROM "${s}"."CanonicalChange" WHERE ${likeClause(["slug", "clusterId"])}`,
  versionsOfMatchedChanges: (s: string) =>
    `SELECT id FROM "${s}"."CanonicalChangeVersion" WHERE "canonicalChangeId" IN (${MATCHED.changes(s)})`,
  sources: (s: string) => `SELECT id FROM "${s}".sources WHERE ${likeClause(["id", "url"])}`,
  guides: (s: string) => `SELECT id FROM "${s}"."Guide" WHERE ${likeClause(["id", "slug"])}`,
  briefings: (s: string) =>
    `SELECT id FROM "${s}"."Briefing" WHERE ${likeClause(["slug", "periodKey", "fingerprint"])}`,
  clusters: (s: string) => `SELECT id FROM "${s}".clusters WHERE ${likeClause(["id"])}`,
  evidenceClusters: (s: string) =>
    `SELECT id FROM "${s}"."EvidenceCluster" WHERE ${likeClause(["id", "fingerprint"])}`,
  items: (s: string) =>
    `SELECT id FROM "${s}".items WHERE ${likeClause(["id", "url", "title", "urlHash"])}`,
  capabilities: (s: string) =>
    `SELECT id FROM "${s}"."CoverageCapability" WHERE ${likeClause(["key"])}`,
  runs: (s: string) => `SELECT id FROM "${s}"."PipelineRun" WHERE ${likeClause(["scopeKey"])}`,
};

interface DeleteStep {
  table: string;
  where: (schema: string, olderThanHours: number) => string;
}

/** FK-safe delete order: children before parents. */
const DELETE_STEPS: DeleteStep[] = [
  {
    table: "EvidenceRecord",
    where: (s) =>
      `"changeVersionId" IN (${MATCHED.versionsOfMatchedChanges(s)}) OR "sourceId" IN (${MATCHED.sources(s)})`,
  },
  {
    table: "BriefingEntry",
    where: (s) =>
      `"briefingId" IN (${MATCHED.briefings(s)}) OR "changeVersionId" IN (${MATCHED.versionsOfMatchedChanges(s)})`,
  },
  {
    table: "GuideEvidence",
    where: (s) => `"guideId" IN (${MATCHED.guides(s)}) OR "sourceId" IN (${MATCHED.sources(s)})`,
  },
  {
    table: "CanonicalChangeVersion",
    where: (s) => `"canonicalChangeId" IN (${MATCHED.changes(s)})`,
  },
  {
    table: "CanonicalChange",
    where: (_s, h) =>
      directWhere(DIRECT_TABLES.find((t) => t.table === "CanonicalChange")!, h),
  },
  { table: "Briefing", where: (_s, h) => directWhere(DIRECT_TABLES.find((t) => t.table === "Briefing")!, h) },
  { table: "Guide", where: (_s, h) => directWhere(DIRECT_TABLES.find((t) => t.table === "Guide")!, h) },
  {
    table: "EvidenceClusterMember",
    where: (s) => `"clusterId" IN (${MATCHED.evidenceClusters(s)}) OR "itemId" IN (${MATCHED.items(s)})`,
  },
  {
    table: "EvidenceCluster",
    where: (_s, h) => directWhere(DIRECT_TABLES.find((t) => t.table === "EvidenceCluster")!, h),
  },
  {
    table: "channel_pushes",
    where: (_s, h) => directWhere(DIRECT_TABLES.find((t) => t.table === "channel_pushes")!, h),
  },
  {
    table: "CapabilitySource",
    where: (s) => `"capabilityId" IN (${MATCHED.capabilities(s)}) OR "sourceId" IN (${MATCHED.sources(s)})`,
  },
  {
    table: "CoverageCapability",
    where: (_s, h) => directWhere(DIRECT_TABLES.find((t) => t.table === "CoverageCapability")!, h),
  },
  {
    table: "SourceCheck",
    where: (s) => `"runId" IN (${MATCHED.runs(s)}) OR "sourceId" IN (${MATCHED.sources(s)})`,
  },
  {
    table: "PipelineRun",
    where: (_s, h) => directWhere(DIRECT_TABLES.find((t) => t.table === "PipelineRun")!, h),
  },
  { table: "product_snapshots", where: (s) => `"sourceId" IN (${MATCHED.sources(s)})` },
  { table: "alerts", where: (_s, h) => directWhere(DIRECT_TABLES.find((t) => t.table === "alerts")!, h) },
  { table: "clusters", where: (_s, h) => directWhere(DIRECT_TABLES.find((t) => t.table === "clusters")!, h) },
  { table: "items", where: (_s, h) => directWhere(DIRECT_TABLES.find((t) => t.table === "items")!, h) },
  { table: "sources", where: (_s, h) => directWhere(DIRECT_TABLES.find((t) => t.table === "sources")!, h) },
  {
    table: "daily_notes",
    where: (_s, h) => directWhere(DIRECT_TABLES.find((t) => t.table === "daily_notes")!, h),
  },
  {
    table: "LegacyRedirect",
    where: (_s, h) => directWhere(DIRECT_TABLES.find((t) => t.table === "LegacyRedirect")!, h),
  },
];

export interface OrphanCount {
  schema: string;
  table: string;
  count: number;
}

/** Minimal raw-SQL client shape (any PrismaClient, any schema). */
export interface RawSqlClient {
  $queryRawUnsafe<T>(query: string): Promise<T>;
  $executeRawUnsafe(query: string): Promise<number>;
}

/** List the vitest worker schemas present in the database (plus nothing else). */
export async function listWorkerSchemas(client: RawSqlClient): Promise<string[]> {
  const rows = await client.$queryRawUnsafe<{ nspname: string }[]>(
    `SELECT nspname FROM pg_namespace WHERE nspname ~ '^vitest_w[0-9]+$' ORDER BY nspname`,
  );
  return rows.map((r) => r.nspname);
}

/**
 * Count prefix-matched rows older than `olderThanHours` on the direct
 * (parent) tables of each given schema. Child tables are covered through
 * their parents by the delete steps; counting parents keeps the signal cheap.
 */
export async function countOrphans(
  client: RawSqlClient,
  schemas: string[],
  olderThanHours: number,
): Promise<OrphanCount[]> {
  const out: OrphanCount[] = [];
  for (const schema of schemas) {
    // One round trip per schema: 117 sequential count queries measured 108 s
    // on a warm Neon compute; a UNION ALL batch is a few seconds.
    const union = DIRECT_TABLES.map(
      (t) =>
        `SELECT '${t.table}' AS tbl, count(*)::int AS c FROM "${schema}"."${t.table}" WHERE ${directWhere(t, olderThanHours)}`,
    ).join(" UNION ALL ");
    const rows = await client.$queryRawUnsafe<{ tbl: string; c: number }[]>(union);
    for (const row of rows) {
      if (row.c > 0) out.push({ schema, table: row.tbl, count: row.c });
    }
  }
  return out;
}

/**
 * Delete prefix-matched orphaned rows from one schema, FK-safe order.
 * Returns per-table deleted row counts (only tables that matched anything).
 */
export async function deleteOrphans(
  client: RawSqlClient,
  schema: string,
  olderThanHours: number,
): Promise<OrphanCount[]> {
  const out: OrphanCount[] = [];
  for (const step of DELETE_STEPS) {
    const deleted = await client.$executeRawUnsafe(
      `DELETE FROM "${schema}"."${step.table}" WHERE ${step.where(schema, olderThanHours)}`,
    );
    if (deleted > 0) out.push({ schema, table: step.table, count: deleted });
  }
  return out;
}

/** Count-only dry run of deleteOrphans, same predicates, same order. */
export async function previewOrphanDeletes(
  client: RawSqlClient,
  schema: string,
  olderThanHours: number,
): Promise<OrphanCount[]> {
  const out: OrphanCount[] = [];
  for (const step of DELETE_STEPS) {
    const rows = await client.$queryRawUnsafe<{ c: number }[]>(
      `SELECT count(*)::int AS c FROM "${schema}"."${step.table}" WHERE ${step.where(schema, olderThanHours)}`,
    );
    const count = rows[0]?.c ?? 0;
    if (count > 0) out.push({ schema, table: step.table, count });
  }
  return out;
}
