import { setLockAdapter } from "../src/jobs/lock.js";
import { prismaLockAdapter } from "../src/jobs/default-adapter.js";

setLockAdapter(prismaLockAdapter);

import { runJob } from "../src/jobs/run.js";
import type { JobName } from "../src/jobs/types.js";

function parseArgs(argv: string[]) {
  const nameIdx = argv.indexOf("--name");
  const name = nameIdx >= 0 ? (argv[nameIdx + 1] as JobName) : undefined;
  const scheduledIdx = argv.indexOf("--scheduled-for");
  const scheduledFor = scheduledIdx >= 0 ? new Date(argv[scheduledIdx + 1]!) : new Date();
  const dryRun = argv.includes("--dry-run");
  const runnerVersion = process.env.npm_package_version ?? "0.0.0";
  return { name, scheduledFor, dryRun, runnerVersion };
}

async function main() {
  const { name, scheduledFor, dryRun, runnerVersion } = parseArgs(process.argv);
  if (!name) {
    console.error("Usage: node scripts/run-job.js --name <job> [--scheduled-for <iso-date>] [--dry-run]");
    process.exit(2);
  }

  const result = await runJob(name, { scheduledFor, runnerVersion, dryRun });
  console.log(JSON.stringify(result));
  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
