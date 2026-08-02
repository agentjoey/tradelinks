#!/usr/bin/env tsx
/**
 * Phase 1 guide corpus validator/importer.
 *
 * Usage:
 *   pnpm tsx scripts/seed-phase1-guides.ts            # same as --check
 *   pnpm tsx scripts/seed-phase1-guides.ts --check    # validate only (default)
 *   pnpm tsx scripts/seed-phase1-guides.ts --import   # import publishable guides
 *
 * The corpus is LOCKED in Phase 1 (owner ruling 2026-08-03): every guide is
 * a machine-authored draft with unverified citations, no reviewer and no
 * review date. --check validates structure and reports the publish-gate
 * state without failing on expected draft conditions. --import refuses
 * anything failing the publish gate — in Phase 1 that is every guide, so
 * --import imports nothing and exits non-zero by design.
 */

import { prisma } from "../src/db/client.js";
import {
  GUIDE_WORD_MAX,
  GUIDE_WORD_MIN,
  OFFICIAL_AUTHORITY_LEVELS,
  publishGateIssues,
  publishGuide,
  validateGuideCorpus,
} from "../src/public-intelligence/guides.js";

const CORPUS_DIR = "content/guides";

async function main() {
  const argv = process.argv.slice(2);
  const doImport = argv.includes("--import");
  const doCheck = argv.includes("--check") || !doImport;
  if (doImport && doCheck && argv.includes("--check")) {
    throw new Error("--check and --import are mutually exclusive");
  }

  const report = await validateGuideCorpus(CORPUS_DIR);

  console.log(`Guide corpus: ${CORPUS_DIR}`);
  console.log(`  drafts found: ${report.guideCount}`);
  for (const guide of report.guides) {
    const official = guide.frontmatter.sources.filter((s) =>
      (OFFICIAL_AUTHORITY_LEVELS as readonly string[]).includes(s.authorityLevel),
    ).length;
    const issues = publishGateIssues(guide);
    console.log(
      `  - ${guide.frontmatter.slug}: ${guide.wordCount} words (range ${GUIDE_WORD_MIN}-${GUIDE_WORD_MAX}), ` +
        `${official} official source(s), readiness ${guide.frontmatter.readiness}, ` +
        (issues.length === 0 ? "PUBLISHABLE" : `draft — gate: ${issues.join(", ")}`),
    );
  }

  for (const error of report.errors) console.error(`  ERROR: ${error}`);
  for (const item of report.invalidEvidence) console.error(`  EVIDENCE: ${item}`);
  if (report.missingLaunchCategories.length > 0) {
    console.error(`  COVERAGE GAP: no draft covers ${report.missingLaunchCategories.join(", ")}`);
  }

  if (report.errors.length > 0 || report.invalidEvidence.length > 0 || report.missingLaunchCategories.length > 0) {
    console.error("Corpus validation FAILED.");
    process.exit(1);
  }
  console.log("Corpus structure valid.");

  if (doCheck) {
    console.log(
      `Publish gate: ${report.publishableSlugs.length}/${report.guideCount} publishable ` +
        `(Phase 1 expects 0 — the corpus is drafted and awaiting human review).`,
    );
    return;
  }

  // --import: refuse anything failing the publish gate, import the rest.
  let imported = 0;
  let refused = 0;
  for (const guide of report.guides) {
    const issues = publishGateIssues(guide);
    if (issues.length > 0) {
      console.log(`  REFUSED ${guide.frontmatter.slug}: ${issues.join(", ")}`);
      refused++;
      continue;
    }
    await publishGuide(guide.frontmatter.slug, guide.frontmatter.reviewedBy!);
    console.log(`  IMPORTED ${guide.frontmatter.slug}`);
    imported++;
  }
  console.log(`Import complete: ${imported} imported, ${refused} refused.`);
  if (refused > 0 || imported === 0) {
    console.error(
      "Not every guide passed the publish gate. Refused drafts stay out of the Guide table.",
    );
    process.exit(1);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
