// BL-043 — 每周简报组装（纯函数）。政策段文本由调用处用 app/lib/digest 生成传入。
export interface IssueMover {
  title: string;
  region: string;
  category: string;
  why: string;
}
export interface IssueInput {
  date: string;
  unsubUrl: string;
  movers: IssueMover[];
  policyText: string;
}
export interface ComposedIssue {
  subject: string;
  html: string;
  text: string;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function composeWeeklyIssue(input: IssueInput): ComposedIssue {
  const { date, unsubUrl, movers, policyText } = input;
  const top = movers[0];
  const subject = top
    ? `Cross-Border Brief — ${top.title} climbing ${top.region}`
    : `TradeLinks Cross-Border Brief — ${date}`;

  const moversText = movers.length
    ? "MOVERS — products on the move:\n" +
      movers.map((m, i) => `${i + 1}. [${m.region} · ${m.category}] ${m.title}\n   ${m.why}`).join("\n")
    : "";
  const text = [
    `TradeLinks — Cross-Border Brief (${date})`,
    moversText,
    policyText,
    `—\nUnsubscribe: ${unsubUrl}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const moversHtml = movers.length
    ? `<h2>Movers</h2><ol>${movers
        .map(
          (m) =>
            `<li><strong>[${esc(m.region)} · ${esc(m.category)}]</strong> ${esc(m.title)}<br><em>${esc(m.why)}</em></li>`,
        )
        .join("")}</ol>`
    : "";
  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;color:#111">
<h1 style="font-size:20px">TradeLinks — Cross-Border Brief</h1>
<p style="color:#666;margin-top:-8px">${esc(date)}</p>
${moversHtml}
<h2>Policy &amp; logistics</h2>
<pre style="white-space:pre-wrap;font:inherit;margin:0">${esc(policyText)}</pre>
<hr style="margin:24px 0;border:none;border-top:1px solid #eee">
<p style="font-size:12px;color:#888"><a href="${esc(unsubUrl)}" style="color:#888">Unsubscribe</a></p>
</div>`;

  return { subject, html, text };
}
