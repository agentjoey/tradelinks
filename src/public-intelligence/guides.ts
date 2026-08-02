/**
 * Phase 1 Public Intelligence — guide corpus.
 *
 * The nine-guide corpus ships LOCKED (owner ruling 2026-08-03): every guide
 * is a draft with readiness EXPERIMENTAL, no reviewer, no review date, and
 * unverified citations. `publishGuide` enforces the publish gate in code and
 * throws on each condition separately; the public read path only ever
 * returns PUBLISHED rows, so in Phase 1 `/guides` renders the honest-absence
 * state and every draft slug 404s.
 *
 * Frontmatter is a deliberately strict subset of YAML (scalars, inline
 * string arrays, and one `sources:` block list) — the project carries no
 * YAML dependency and the corpus format is fully specified here.
 */

import fs from "node:fs";
import path from "node:path";

import { prisma } from "../db/client.js";
import type { Guide, ReadinessLevel } from "@prisma/client";
import {
  INITIAL_PUBLIC_CATEGORIES,
  POLICY_TOPICS,
  PRODUCT_CATEGORIES,
  RISK_ATTRIBUTES,
} from "../domain/intelligence/taxonomy.js";

// ---------- constants ----------

export const GUIDE_WORD_MIN = 900;
export const GUIDE_WORD_MAX = 1800;

export const REQUIRED_GUIDE_SECTIONS = [
  "Who this is for",
  "What changes the decision",
  "US requirements",
  "Amazon US",
  "Shopify US",
  "Evidence and limits",
  "Review history",
] as const;

/** Authority levels that count as "official" for the publish gate. */
export const OFFICIAL_AUTHORITY_LEVELS = [
  "GOVERNMENT_OFFICIAL",
  "PLATFORM_OFFICIAL",
  "INDUSTRY_OFFICIAL",
] as const;

const AUTHORITY_LEVELS = [
  ...OFFICIAL_AUTHORITY_LEVELS,
  "REPUTABLE_SECONDARY",
  "COMMUNITY",
] as const;

const READINESS_LEVELS = ["UNAVAILABLE", "EXPERIMENTAL", "MONITORED", "VERIFIED", "STALE"] as const;

// ---------- types ----------

export type GuideSourceRecord = {
  name: string;
  url: string;
  authorityLevel: (typeof AUTHORITY_LEVELS)[number];
  note?: string;
};

export type GuideFrontmatter = {
  slug: string;
  title: string;
  summary: string;
  market: "US";
  platforms: Array<"AMAZON" | "SHOPIFY">;
  productCategories: Array<(typeof PRODUCT_CATEGORIES)[number]>;
  riskAttributes: Array<(typeof RISK_ATTRIBUTES)[number]>;
  policyTopics: Array<(typeof POLICY_TOPICS)[number]>;
  readiness: (typeof READINESS_LEVELS)[number];
  reviewedBy: string | null;
  lastReviewedAt: string | null;
  draftedBy: string;
  draftedAt: string;
  citationsVerified: boolean;
  sources: GuideSourceRecord[];
};

export type ParsedGuide = {
  filePath: string;
  frontmatter: GuideFrontmatter;
  bodyMarkdown: string;
  wordCount: number;
  sections: string[];
};

export type GuideCorpusReport = {
  corpusDir: string;
  guideCount: number;
  guides: ParsedGuide[];
  errors: string[];
  missingLaunchCategories: string[];
  invalidEvidence: string[];
  publishableSlugs: string[];
};

export class GuidePublishError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "GuidePublishError";
  }
}

// ---------- strict frontmatter parser ----------

function unquote(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseScalar(value: string): string | null | boolean {
  const trimmed = value.trim();
  if (trimmed === "null" || trimmed === "") return null;
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return unquote(trimmed);
}

function parseInlineArray(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
    throw new Error(`expected an inline array, got: ${trimmed}`);
  }
  const inner = trimmed.slice(1, -1).trim();
  if (inner === "") return [];
  return inner.split(",").map((item) => unquote(item.trim()));
}

/**
 * Parses the strict frontmatter subset: top-level `key: value` scalars and
 * inline arrays, plus exactly one `sources:` block list of objects with
 * indented `key: value` pairs. Anything else throws.
 */
export function parseFrontmatter(raw: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = raw.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === "") {
      i++;
      continue;
    }
    if (/^\s/.test(line)) throw new Error(`unexpected indentation: ${line}`);
    const match = /^([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(line);
    if (!match) throw new Error(`malformed frontmatter line: ${line}`);
    const key = match[1]!;
    const rest = match[2]!;
    if (rest.trim() === "") {
      // Block form — only `sources:` is supported.
      if (key !== "sources") throw new Error(`unsupported block key: ${key}`);
      const sources: Array<Record<string, string>> = [];
      i++;
      let current: Record<string, string> | null = null;
      while (i < lines.length && /^\s/.test(lines[i]!)) {
        const blockLine = lines[i]!;
        const itemMatch = /^\s+-\s+([A-Za-z]+):\s*(.*)$/.exec(blockLine);
        if (itemMatch) {
          current = {};
          current[itemMatch[1]!] = unquote(itemMatch[2]!.trim());
          sources.push(current);
        } else {
          const fieldMatch = /^\s+([A-Za-z]+):\s*(.*)$/.exec(blockLine);
          if (!fieldMatch || !current) throw new Error(`malformed sources line: ${blockLine}`);
          current[fieldMatch[1]!] = unquote(fieldMatch[2]!.trim());
        }
        i++;
      }
      result[key] = sources;
      continue;
    }
    result[key] = rest.trim().startsWith("[") ? parseInlineArray(rest) : parseScalar(rest);
    i++;
  }
  return result;
}

function fail(filePath: string, message: string): never {
  throw new Error(`${filePath}: ${message}`);
}

function requireString(fields: Record<string, unknown>, key: string, filePath: string): string {
  const value = fields[key];
  if (typeof value !== "string" || value === "") fail(filePath, `missing or empty ${key}`);
  return value;
}

function requireEnumArray<T extends string>(
  fields: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  filePath: string,
): T[] {
  const value = fields[key];
  if (!Array.isArray(value)) fail(filePath, `${key} must be an inline array`);
  for (const item of value) {
    if (!allowed.includes(item as T)) fail(filePath, `${key} has unknown value: ${item}`);
  }
  return value as T[];
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Parses and validates one guide Markdown file. Throws on any violation. */
export function parseGuideFile(filePath: string): ParsedGuide {
  const raw = fs.readFileSync(filePath, "utf8");
  const fmMatch = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!fmMatch) fail(filePath, "missing --- frontmatter block");
  const fields = parseFrontmatter(fmMatch[1]!);
  const body = fmMatch[2]!;

  const slug = requireString(fields, "slug", filePath);
  if (!SLUG_PATTERN.test(slug)) fail(filePath, `invalid slug: ${slug}`);
  if (path.basename(filePath, ".md") !== slug) {
    fail(filePath, `file name must equal slug (${slug})`);
  }

  const readiness = fields.readiness;
  if (typeof readiness !== "string" || !READINESS_LEVELS.includes(readiness as any)) {
    fail(filePath, `readiness must be one of ${READINESS_LEVELS.join(", ")}`);
  }

  const reviewedBy = fields.reviewedBy;
  if (reviewedBy !== null && typeof reviewedBy !== "string") {
    fail(filePath, "reviewedBy must be null or a string");
  }
  const lastReviewedAt = fields.lastReviewedAt;
  if (lastReviewedAt !== null) {
    if (typeof lastReviewedAt !== "string" || !ISO_DATE_PATTERN.test(lastReviewedAt)) {
      fail(filePath, "lastReviewedAt must be null or an ISO date (YYYY-MM-DD)");
    }
  }
  const draftedAt = requireString(fields, "draftedAt", filePath);
  if (!ISO_DATE_PATTERN.test(draftedAt)) fail(filePath, "draftedAt must be an ISO date");
  if (typeof fields.citationsVerified !== "boolean") {
    fail(filePath, "citationsVerified must be true or false");
  }

  const rawSources = fields.sources;
  if (!Array.isArray(rawSources) || rawSources.length === 0) {
    fail(filePath, "sources must be a non-empty block list");
  }
  const sources: GuideSourceRecord[] = rawSources.map((entry, index) => {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      fail(filePath, `sources[${index}] is malformed`);
    }
    const record = entry as Record<string, string>;
    if (!record.name || !record.url) fail(filePath, `sources[${index}] needs name and url`);
    if (!/^https:\/\//.test(record.url)) fail(filePath, `sources[${index}] url must be https`);
    if (!AUTHORITY_LEVELS.includes(record.authorityLevel as any)) {
      fail(filePath, `sources[${index}] has unknown authorityLevel: ${record.authorityLevel}`);
    }
    return {
      name: record.name,
      url: record.url,
      authorityLevel: record.authorityLevel as GuideSourceRecord["authorityLevel"],
      ...(record.note ? { note: record.note } : {}),
    };
  });

  const sections = body
    .split("\n")
    .filter((line) => line.startsWith("## "))
    .map((line) => line.slice(3).trim());

  const wordCount = body
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;

  return {
    filePath,
    frontmatter: {
      slug,
      title: requireString(fields, "title", filePath),
      summary: requireString(fields, "summary", filePath),
      market: "US",
      platforms: requireEnumArray(fields, "platforms", ["AMAZON", "SHOPIFY"] as const, filePath),
      productCategories: requireEnumArray(fields, "productCategories", PRODUCT_CATEGORIES, filePath),
      riskAttributes: requireEnumArray(fields, "riskAttributes", RISK_ATTRIBUTES, filePath),
      policyTopics: requireEnumArray(fields, "policyTopics", POLICY_TOPICS, filePath),
      readiness: readiness as GuideFrontmatter["readiness"],
      reviewedBy: (reviewedBy ?? null) as string | null,
      lastReviewedAt: (lastReviewedAt ?? null) as string | null,
      draftedBy: requireString(fields, "draftedBy", filePath),
      draftedAt,
      citationsVerified: fields.citationsVerified as boolean,
      sources,
    },
    bodyMarkdown: body.trim(),
    wordCount,
    sections,
  };
}

// ---------- the publish gate ----------

/** Every publish-gate violation on a guide, in a fixed check order. */
export function publishGateIssues(guide: ParsedGuide): string[] {
  const issues: string[] = [];
  const { frontmatter } = guide;
  if (frontmatter.citationsVerified !== true) issues.push("GUIDE_CITATIONS_UNVERIFIED");
  if (frontmatter.reviewedBy == null || frontmatter.reviewedBy === "") {
    issues.push("GUIDE_REVIEWER_REQUIRED");
  }
  if (frontmatter.lastReviewedAt == null || frontmatter.lastReviewedAt === "") {
    issues.push("GUIDE_REVIEW_DATE_REQUIRED");
  }
  const officialCount = frontmatter.sources.filter((source) =>
    (OFFICIAL_AUTHORITY_LEVELS as readonly string[]).includes(source.authorityLevel),
  ).length;
  if (officialCount < 2) issues.push("GUIDE_REQUIRES_OFFICIAL_SOURCES");
  if (frontmatter.readiness !== "MONITORED" && frontmatter.readiness !== "VERIFIED") {
    issues.push("GUIDE_READINESS_BELOW_MONITORED");
  }
  return issues;
}

/** Throws GuidePublishError on the first publish-gate violation. */
export function assertPublishable(guide: ParsedGuide): void {
  const [first] = publishGateIssues(guide);
  if (first) {
    throw new GuidePublishError(
      first,
      `${first}: guide "${guide.frontmatter.slug}" cannot be published`,
    );
  }
}

// ---------- corpus validation ----------

export async function validateGuideCorpus(corpusDir: string): Promise<GuideCorpusReport> {
  const report: GuideCorpusReport = {
    corpusDir,
    guideCount: 0,
    guides: [],
    errors: [],
    missingLaunchCategories: [],
    invalidEvidence: [],
    publishableSlugs: [],
  };

  let files: string[] = [];
  try {
    files = fs
      .readdirSync(corpusDir)
      .filter((name) => name.endsWith(".md"))
      .sort();
  } catch {
    report.errors.push(`corpus directory not readable: ${corpusDir}`);
    return report;
  }

  const seenSlugs = new Set<string>();
  for (const name of files) {
    const filePath = path.join(corpusDir, name);
    let guide: ParsedGuide;
    try {
      guide = parseGuideFile(filePath);
    } catch (error) {
      report.errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    if (seenSlugs.has(guide.frontmatter.slug)) {
      report.errors.push(`duplicate slug: ${guide.frontmatter.slug}`);
      continue;
    }
    seenSlugs.add(guide.frontmatter.slug);

    for (const section of REQUIRED_GUIDE_SECTIONS) {
      if (!guide.sections.includes(section)) {
        report.errors.push(`${guide.frontmatter.slug}: missing section "${section}"`);
      }
    }
    if (guide.wordCount < GUIDE_WORD_MIN || guide.wordCount > GUIDE_WORD_MAX) {
      report.errors.push(
        `${guide.frontmatter.slug}: word count ${guide.wordCount} outside ${GUIDE_WORD_MIN}-${GUIDE_WORD_MAX}`,
      );
    }
    const officialCount = guide.frontmatter.sources.filter((source) =>
      (OFFICIAL_AUTHORITY_LEVELS as readonly string[]).includes(source.authorityLevel),
    ).length;
    if (officialCount < 2) {
      report.invalidEvidence.push(
        `${guide.frontmatter.slug}: ${officialCount} official source record(s), need at least 2`,
      );
    }
    if (publishGateIssues(guide).length === 0) {
      report.publishableSlugs.push(guide.frontmatter.slug);
    }
    report.guides.push(guide);
  }
  report.guideCount = report.guides.length;

  const covered = new Set(report.guides.flatMap((g) => g.frontmatter.productCategories));
  for (const category of INITIAL_PUBLIC_CATEGORIES) {
    if (!covered.has(category)) report.missingLaunchCategories.push(category);
  }
  return report;
}

// ---------- publish + public read path ----------

/**
 * Publishes a corpus draft after the full publish gate. The gate is
 * enforced here, in code — not in the caller — so no unreviewed,
 * unverified or under-sourced guide can ever reach the Guide table with a
 * PUBLISHED status, regardless of who calls this.
 */
export async function publishGuide(
  draftId: string,
  reviewerId: string,
  opts?: { corpusDir?: string },
): Promise<Guide> {
  const corpusDir = opts?.corpusDir ?? "content/guides";
  const guide = parseGuideFile(path.join(corpusDir, `${draftId}.md`));
  assertPublishable(guide);

  const { frontmatter } = guide;
  const evidenceData = [] as Array<{
    sourceId: string;
    url: string;
    authorityLevel: (typeof AUTHORITY_LEVELS)[number];
    normalizedSummary: string;
    position: number;
  }>;
  for (const [index, source] of frontmatter.sources.entries()) {
    const existing = await prisma.source.findFirst({ where: { url: source.url } });
    const record =
      existing ??
      (await prisma.source.create({
        data: {
          id: `guide-src-${frontmatter.slug}-${index}`,
          name: source.name,
          url: source.url,
          adapter: "fetch",
          frequencyCron: "0 0 * * *",
          language: "en",
          regions: ["north_america"],
          platforms: frontmatter.platforms,
        },
      }));
    evidenceData.push({
      sourceId: record.id,
      url: source.url,
      authorityLevel: source.authorityLevel,
      normalizedSummary: source.note ?? source.name,
      position: index,
    });
  }

  return prisma.guide.upsert({
    where: { slug: frontmatter.slug },
    create: {
      slug: frontmatter.slug,
      title: frontmatter.title,
      summary: frontmatter.summary,
      bodyMarkdown: guide.bodyMarkdown,
      market: "US",
      platforms: frontmatter.platforms,
      productCategories: frontmatter.productCategories,
      riskAttributes: frontmatter.riskAttributes,
      readiness: frontmatter.readiness,
      editorialStatus: "PUBLISHED",
      lastReviewedAt: new Date(`${frontmatter.lastReviewedAt}T00:00:00Z`),
      reviewedBy: reviewerId,
      evidence: {
        create: evidenceData.map((entry) => ({
          ...entry,
          access: "PUBLIC" as const,
          licenseNote: "Public page",
          reviewedAt: new Date(),
        })),
      },
    },
    update: {
      title: frontmatter.title,
      summary: frontmatter.summary,
      bodyMarkdown: guide.bodyMarkdown,
      platforms: frontmatter.platforms,
      productCategories: frontmatter.productCategories,
      riskAttributes: frontmatter.riskAttributes,
      readiness: frontmatter.readiness,
      editorialStatus: "PUBLISHED",
      lastReviewedAt: new Date(`${frontmatter.lastReviewedAt}T00:00:00Z`),
      reviewedBy: reviewerId,
    },
  });
}

export type PublishedGuideSummary = {
  slug: string;
  title: string;
  summary: string;
  readiness: ReadinessLevel;
  lastReviewedAt: string;
};

/** Published guides only. Drafts never leave this read path. */
export async function listPublishedGuides(): Promise<PublishedGuideSummary[]> {
  const rows = await prisma.guide.findMany({
    where: { editorialStatus: "PUBLISHED" },
    orderBy: { title: "asc" },
  });
  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    readiness: row.readiness,
    lastReviewedAt: row.lastReviewedAt.toISOString(),
  }));
}

export type PublishedGuideDetail = PublishedGuideSummary & {
  bodyMarkdown: string;
  platforms: string[];
  productCategories: string[];
  riskAttributes: string[];
  reviewedBy: string;
  evidence: Array<{
    url: string;
    authorityLevel: string;
    normalizedSummary: string;
    sourceName: string;
  }>;
};

export async function getPublishedGuideBySlug(slug: string): Promise<PublishedGuideDetail | null> {
  const row = await prisma.guide.findFirst({
    where: { slug, editorialStatus: "PUBLISHED" },
    include: {
      evidence: {
        include: { source: { select: { name: true } } },
        orderBy: { position: "asc" },
      },
    },
  });
  if (!row) return null;
  return {
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    readiness: row.readiness,
    lastReviewedAt: row.lastReviewedAt.toISOString(),
    bodyMarkdown: row.bodyMarkdown,
    platforms: row.platforms,
    productCategories: row.productCategories,
    riskAttributes: row.riskAttributes,
    reviewedBy: row.reviewedBy,
    evidence: row.evidence.map((entry) => ({
      url: entry.url,
      authorityLevel: entry.authorityLevel,
      normalizedSummary: entry.normalizedSummary,
      sourceName: entry.source.name,
    })),
  };
}
