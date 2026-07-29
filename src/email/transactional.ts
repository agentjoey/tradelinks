// BL-043 — 事务邮件（确认 / 欢迎）。纯文本+极简 HTML。
// Phase 1 — 运维告警 (Operational Alert) 投递桥梁 (Task 4 durable delivery pin).

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

export function confirmEmail(confirmUrl: string): BuiltEmail {
  return {
    subject: "Confirm your TradeLinks subscription",
    text: `Confirm your subscription to the TradeLinks Cross-Border Brief:\n${confirmUrl}\n\nIf you didn't request this, ignore this email.`,
    html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#111"><p>Confirm your subscription to the <strong>TradeLinks Cross-Border Brief</strong>:</p><p><a href="${confirmUrl}">Confirm subscription →</a></p><p style="color:#888;font-size:12px">If you didn't request this, ignore this email.</p></div>`,
  };
}

export function welcomeEmail(unsubUrl: string): BuiltEmail {
  return {
    subject: "You're in — TradeLinks Cross-Border Brief",
    text: `You're subscribed to the TradeLinks Cross-Border Brief — weekly: what's moving in cross-border e-commerce and why.\n\nUnsubscribe anytime: ${unsubUrl}`,
    html: `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px;margin:0 auto;color:#111"><p>You're subscribed to the <strong>TradeLinks Cross-Border Brief</strong> — weekly: what's moving in cross-border e-commerce and why.</p><p style="color:#888;font-size:12px"><a href="${unsubUrl}" style="color:#888">Unsubscribe</a></p></div>`,
  };
}

// ---- operational alert delivery adapter ----

export interface AlertDeliveryKey {
  code: string;
  subjectId: string;
  bucket: string; // YYYY-MM-DDTHH
}

/**
 * Delivery adapter. `record` sends the alert to Telegram (via sendOpsAlert)
 * and records the result in a PipelineRun ledger row. The row is finished
 * ONLY when sendOpsAlert returns "sent"; "skipped"/"failed"/thrown errors
 * leave the row retryable. `load` checks whether a finished delivery
 * already exists for this key — used for delivery-level idempotency.
 *
 * Tests inject their own adapter via dependency injection.
 */
export interface DeliveryAdapter {
  record(key: AlertDeliveryKey): Promise<void>;
  load(key: AlertDeliveryKey): Promise<boolean>;
}

/** Build a human-readable alert text for a given failure class and subject. */
export function buildOpsAlertText(code: string, subjectId: string): string {
  const labels: Record<string, string> = {
    GLOBAL_GAP: "[Global Gap]",
    SOURCE_STALE: "[Source Stale]",
    CONTENT_COLLAPSE: "[Content Collapse]",
    BRIEFING_ABSENT: "[Briefing Absent]",
    HARD_CAP: "[Cost Hard Cap]",
  };
  const label = labels[code] ?? `[${code}]`;
  return `${label} ${subjectId}`;
}

/**
 * Production delivery adapter backed by PipelineRun rows.
 * Each alert key is stored as a PipelineRun with jobType="HEALTH",
 * scopeKey="${code}:${subjectId}:${bucket}", scheduledFor set to the bucket
 * date. The row is upserted on record; finishedAt is only set when
 * sendOpsAlert returns "sent".
 */
export function createDeliveryAdapter(): DeliveryAdapter {
  return {
    async record(key: AlertDeliveryKey) {
      const { prisma: db } = await import("../db/client.js");
      const { sendOpsAlert } = await import("../push/send.js");

      const scopeKey = `${key.code}:${key.subjectId}:${key.bucket}`;
      const scheduledFor = bucketToDate(key.bucket);

      // Use raw upsert (no beginRun — this is a delivery row, not a job run)
      const row = await db.pipelineRun.upsert({
        where: {
          jobType_scopeKey_scheduledFor: {
            jobType: "HEALTH",
            scopeKey,
            scheduledFor,
          },
        },
        update: { startedAt: new Date() },
        create: {
          jobType: "HEALTH",
          scopeKey,
          scheduledFor,
          status: "FAILED",
          itemCount: 0,
          runnerVersion: "delivery-adapter",
        },
      });

      const result = await sendOpsAlert(
        buildOpsAlertText(key.code, key.subjectId),
      );

      if (result === "sent") {
        await db.pipelineRun.update({
          where: { id: row.id },
          data: {
            status: "SUCCEEDED_EMPTY",
            finishedAt: new Date(),
          },
        });
      }
      // On "skipped" or "failed": leave the row unfinished so the next
      // health-check run retries delivery.
    },

    async load(key: AlertDeliveryKey) {
      const { prisma: db } = await import("../db/client.js");
      const scopeKey = `${key.code}:${key.subjectId}:${key.bucket}`;
      const scheduledFor = bucketToDate(key.bucket);
      const row = await db.pipelineRun.findUnique({
        where: {
          jobType_scopeKey_scheduledFor: {
            jobType: "HEALTH",
            scopeKey,
            scheduledFor,
          },
        },
        select: { finishedAt: true },
      });
      return row?.finishedAt != null;
    },
  };
}

function bucketToDate(bucket: string): Date {
  // "2026-07-30T12" → new Date("2026-07-30T12:00:00Z")
  return new Date(`${bucket}:00:00Z`);
}
