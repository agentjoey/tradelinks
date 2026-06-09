import type PgBoss from "pg-boss";
import { QUEUES } from "../queue/queues.js";
import { prisma } from "../db/client.js";
import { sendEmail } from "../email/resend.js";
import { listConfirmed } from "../email/subscriber-db.js";
import { composeWeeklyIssue, type IssueMover } from "../email/compose-issue.js";
import { computeTopMovers, moverWhyEn } from "../trends/movers.js";
import { logger } from "../lib/logger.js";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://tradelinks-mvp.vercel.app";
const TOP_MOVERS = 6;

/** 本周已发布的 政策/平台/物流 预警 → 纯文本政策段。 */
async function policyText(): Promise<string> {
  const since = new Date(Date.now() - 7 * 864e5);
  const alerts = await prisma.alert.findMany({
    where: {
      status: "published",
      category: { in: ["regulatory", "platform_policy", "logistics"] as never[] },
      publishedAt: { gte: since },
    },
    orderBy: { urgencyScore: "desc" },
    take: 8,
    select: { title: true, category: true, regions: true, actionRequired: true },
  });
  if (!alerts.length) return "";
  const lines = alerts.map(
    (a) =>
      `- [${(a.regions[0] as string) ?? "global"} · ${a.category}] ${a.title}` +
      (a.actionRequired ? ` → ${a.actionRequired}` : ""),
  );
  return "POLICY & LOGISTICS this week:\n" + lines.join("\n");
}

/** 组装并群发本周简报给所有 confirmed 订阅。无订阅 / 无 Resend key → no-op。 */
export async function runWeeklyNewsletter(
  date = new Date().toISOString().slice(0, 10),
): Promise<{ sent: number; recipients: number }> {
  const subs = await listConfirmed();
  if (subs.length === 0) {
    logger.info("newsletter: no confirmed subscribers, skip");
    return { sent: 0, recipients: 0 };
  }

  const movers = await computeTopMovers(TOP_MOVERS);
  const issueMovers: IssueMover[] = movers.map((m) => ({
    title: m.title, region: m.region, category: m.category, why: moverWhyEn(m),
  }));
  const policy = await policyText();

  let sent = 0;
  for (const s of subs) {
    const unsubUrl = `${SITE}/api/unsubscribe?token=${s.unsubToken}`;
    const issue = composeWeeklyIssue({ date, unsubUrl, movers: issueMovers, policyText: policy });
    const r = await sendEmail(s.email, issue.subject, issue.html, issue.text);
    if (r === "sent") sent++;
  }
  logger.info({ recipients: subs.length, sent }, "weekly newsletter dispatched");
  return { sent, recipients: subs.length };
}

export function registerNewsletterWorker(boss: PgBoss) {
  return boss.work(QUEUES.newsletter, async () => {
    await runWeeklyNewsletter();
  });
}
