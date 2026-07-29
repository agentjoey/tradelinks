// BL-043 — 事务邮件（确认 / 欢迎）。纯文本+极简 HTML。
// Phase 1 — 运维告警 (Operational Alerts) 幂等投递桥接 Telegram。

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

// ---- operational alert delivery ----

/** Idempotent in-memory store for operational alerts within this process. */
const sentOpsAlerts = new Set<string>();

/**
 * Parse an operational alert key into its components.
 * Key format: ${code}:${subjectId}:${YYYY-MM-DDTHH}
 * SubjectId may contain colons (e.g. "market:us", "platform:shopify-us").
 * The date bucket at the end is always 13 chars (YYYY-MM-DDTHH).
 */
function parseAlertKey(key: string): { code: string; subjectId: string; bucket: string } | null {
  const bucketMatch = key.match(/(\d{4}-\d{2}-\d{2}T\d{2})$/);
  if (!bucketMatch || !bucketMatch[1] || !bucketMatch.index) return null;
  const bucket = bucketMatch[1];
  const prefix = key.slice(0, bucketMatch.index - 1); // drop trailing ":"
  const firstColon = prefix.indexOf(":");
  if (firstColon === -1) return null;
  const code = prefix.slice(0, firstColon);
  const subjectId = prefix.slice(firstColon + 1);
  return { code, subjectId, bucket };
}

/**
 * Build a human-readable alert text for a given failure class and subject.
 * The key is `${code}:${subjectId}:${YYYY-MM-DDTHH}`.
 */
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
 * Record an operational alert key and deliver via Telegram if it is new.
 * The key format is `${code}:${subjectId}:${YYYY-MM-DDTHH}` — this ensures at most
 * one delivery per UTC date-hour window.
 *
 * Returns `true` if the alert was newly recorded and sent; `false` if it was
 * already seen (idempotent suppression).
 */
export async function recordOpsAlert(key: string): Promise<boolean> {
  if (sentOpsAlerts.has(key)) return false;
  sentOpsAlerts.add(key);

  try {
    const { sendOpsAlert } = await import("../push/send.js");
    const parsed = parseAlertKey(key);
    if (parsed) {
      const text = buildOpsAlertText(parsed.code, parsed.subjectId);
      await sendOpsAlert(text);
    } else {
      await sendOpsAlert(key);
    }
  } catch {
    // delivery failure is non-fatal — the idempotency guard prevents re-sends
  }

  return true;
}
