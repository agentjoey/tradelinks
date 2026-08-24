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
  now: Date;
}

/** How long an ongoing, unresolved condition stays silent after paging. */
export const ALERT_COOLDOWN_MS = 24 * 60 * 60_000;

type AlertStateRow = { id: string; lastAlertedAt: Date; resolvedAt: Date | null };

/**
 * Delivery adapter, backed by `OperationalAlertState` rather than a
 * per-hour PipelineRun row. The previous scheme deduped on
 * `{code, subjectId, bucket}` where bucket was the CURRENT hour — against an
 * hourly job, that key is different on every single run, so it never
 * suppressed anything: an ongoing condition paged every hour for as long as
 * it lasted (measured: ~500 identical Telegram messages over three weeks for
 * one unresolved BRIEFING_ABSENT). `record` now pages at most once per
 * ALERT_COOLDOWN_MS while a condition is active, immediately again if it
 * clears and recurs (a recurrence is a new episode, not a continuation of
 * the old cooldown), and `recordResolved` sends exactly one notice when a
 * previously-active condition clears.
 *
 * State only advances on a confirmed "sent" — `skipped`/`failed`/a thrown
 * send leaves it untouched, so the condition is still considered un-alerted
 * and the next run retries naturally. No separate unfinished-row placeholder
 * is needed for that: "not yet successfully alerted" IS the absence of a
 * state update.
 *
 * Tests inject their own adapter via dependency injection.
 */
export interface DeliveryAdapter {
  record(key: AlertDeliveryKey): Promise<void>;
  recordResolved(key: AlertDeliveryKey): Promise<void>;
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

/** Build the "cleared" counterpart to buildOpsAlertText. */
export function buildOpsResolvedText(code: string, subjectId: string): string {
  const labels: Record<string, string> = {
    GLOBAL_GAP: "[Global Gap]",
    SOURCE_STALE: "[Source Stale]",
    CONTENT_COLLAPSE: "[Content Collapse]",
    BRIEFING_ABSENT: "[Briefing Absent]",
    HARD_CAP: "[Cost Hard Cap]",
  };
  const label = labels[code] ?? `[${code}]`;
  return `${label} RESOLVED — ${subjectId}`;
}

export function createDeliveryAdapter(opts?: {
  prisma?: {
    operationalAlertState: {
      findUnique: (args: any) => Promise<AlertStateRow | null>;
      create: (args: any) => Promise<{ id: string }>;
      update: (args: any) => Promise<void>;
    };
  };
  sendOpsAlert?: (text: string) => Promise<"sent" | "skipped" | "failed">;
}): DeliveryAdapter {
  async function send(text: string): Promise<"sent" | "skipped" | "failed"> {
    const impl = opts?.sendOpsAlert ?? (await import("../push/send.js")).sendOpsAlert;
    try {
      return await impl(text);
    } catch (err) {
      console.error("[delivery-adapter] sendOpsAlert threw:", err);
      return "failed";
    }
  }

  return {
    async record({ code, subjectId, now }: AlertDeliveryKey) {
      const db = opts?.prisma ?? (await import("../db/client.js")).prisma as any;
      const existing: AlertStateRow | null = await db.operationalAlertState.findUnique({
        where: { code_subjectId: { code, subjectId } },
      });

      const isNewEpisode = !existing || existing.resolvedAt != null;
      const cooldownElapsed =
        !!existing && now.getTime() - existing.lastAlertedAt.getTime() >= ALERT_COOLDOWN_MS;
      if (!isNewEpisode && !cooldownElapsed) return; // still within this episode's cooldown

      const result = await send(buildOpsAlertText(code, subjectId));
      if (result !== "sent") return; // untouched state → next run retries

      if (isNewEpisode) {
        await db.operationalAlertState.create({
          data: { code, subjectId, firstAlertedAt: now, lastAlertedAt: now, resolvedAt: null },
        }).catch(async (err: any) => {
          // A concurrent run won the create race — fall through to a bump.
          if (err?.code !== "P2002") throw err;
          await db.operationalAlertState.update({
            where: { code_subjectId: { code, subjectId } },
            data: { lastAlertedAt: now, resolvedAt: null },
          });
        });
      } else {
        await db.operationalAlertState.update({
          where: { code_subjectId: { code, subjectId } },
          data: { lastAlertedAt: now },
        });
      }
    },

    async recordResolved({ code, subjectId, now }: AlertDeliveryKey) {
      const db = opts?.prisma ?? (await import("../db/client.js")).prisma as any;
      const result = await send(buildOpsResolvedText(code, subjectId));
      if (result !== "sent") return; // leave resolvedAt null → next run retries the notice

      await db.operationalAlertState.update({
        where: { code_subjectId: { code, subjectId } },
        data: { resolvedAt: now },
      }).catch((err: any) => {
        // The row was never created (e.g. every prior alert attempt failed
        // to send) — nothing to mark resolved, and nothing was ever paged.
        if (err?.code !== "P2025") throw err;
      });
    },
  };
}
