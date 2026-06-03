/**
 * Generate today's digest and (if RESEND_API_KEY set) email it via Resend.
 * Without the key it prints the digest text (dry run). Wire to a daily cron
 * (pg-boss schedule or platform cron) once the key is provisioned.
 * Usage: pnpm tsx scripts/send-digest.ts [recipient@example.com]
 */
import { env } from "../src/config/env.js";
import { getAlerts } from "../app/lib/alerts.js";
import { buildDigest, renderDigestText } from "../app/lib/digest.js";
import { prisma } from "../src/db/client.js";

function renderHtml(text: string): string {
  return `<pre style="font:14px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap">${text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")}</pre>`;
}

async function main() {
  const to = process.argv[2];
  const { items } = await getAlerts({ take: 100 });
  const date = new Date().toISOString().slice(0, 10);
  const digest = buildDigest(items, date);
  const text = renderDigestText(digest);

  if (!env.RESEND_API_KEY || !to) {
    console.log("— dry run (no RESEND_API_KEY or no recipient) —\n");
    console.log(text);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.FROM_EMAIL,
      to,
      subject: `TradeLinks Daily — ${date}`,
      text,
      html: renderHtml(text),
    }),
  });
  console.log(res.ok ? `✅ sent to ${to}` : `❌ resend ${res.status}: ${await res.text()}`);
}

main().catch((e) => { console.error("❌", e); process.exit(1); }).finally(() => prisma.$disconnect());
