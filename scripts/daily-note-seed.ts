/**
 * Seed the daily_notes table with real published notes (editor→reviewer pipeline)
 * so /daily has content for review. One brief + one roundup, EN. This is a manual
 * verification/demo helper — the scheduled worker (workers/daily-note.ts) does the
 * same against live DB data and stores drafts unless DAILY_NOTE_AUTOPUBLISH is set.
 *
 * Run: pnpm tsx scripts/daily-note-seed.ts
 */
import { editorClient, reviewerClient } from "../src/ai/client.js";
import { composeDailyNote, type DailyNoteInput } from "../src/daily/compose.js";
import { reviewNote } from "../src/daily/review.js";
import { persistNote, getPublishedNotes } from "../src/daily/db.js";
import { datasets, kindFor } from "./daily-demo-data.js";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

async function main() {
  for (const key of ["policy", "product"] as const) {
    const kind = kindFor[key]!;
    const input: DailyNoteInput = { ...datasets[key]!, lang: "en" };
    const draft = await composeDailyNote(input, editorClient(), kind);
    const reviewed = await reviewNote(draft, input, reviewerClient());
    await persistNote(reviewed, "published");
    console.log(`✓ published [${kind}] ${reviewed.slug} (removed ${reviewed.removedClaims.length} claim(s))`);
  }

  const notes = await getPublishedNotes(10);
  console.log(`\n${notes.length} published note(s):`);
  for (const n of notes) console.log(`  ${SITE}/daily/${n.slug}  · ${n.kind}`);
  console.log(`\nindex: ${SITE}/daily`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
