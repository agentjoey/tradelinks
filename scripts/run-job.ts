import { setLockAdapter } from "../src/jobs/lock.js";
import { prismaLockAdapter } from "../src/jobs/default-adapter.js";

setLockAdapter(prismaLockAdapter);

import { runJob } from "../src/jobs/run.js";
import type { JobName } from "../src/jobs/types.js";

function parseArgs(argv: string[]) {
  const nameIdx = argv.indexOf("--name");
  const name = nameIdx >= 0 ? argv[nameIdx + 1] : undefined;
  const dryRun = argv.includes("--dry-run");
  return { name, dryRun };
}

async function main() {
  const { name, dryRun } = parseArgs(process.argv);
  if (!name) {
    console.error("Usage: node scripts/run-job.js --name <job> [--dry-run]");
    process.exit(2);
  }

  const result = await runJob(name as JobName, {}, { dryRun });
  console.log(JSON.stringify(result));
  process.exit(result.exitCode);
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
