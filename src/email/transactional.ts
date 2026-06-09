// BL-043 — 事务邮件（确认 / 欢迎）。纯文本+极简 HTML。
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
