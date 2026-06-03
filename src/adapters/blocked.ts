// Blocked detection — see docs/specs/crawler-contract.md §5
// A HTTP 200 may still be a bot-wall. Detect it so we DON'T naive-retry,
// and instead route the source to the Python Scrapling service.

const CHALLENGE_RE =
  /cf-browser-verification|cf-challenge|just a moment|checking your browser|enable javascript and cookies/i;
const CAPTCHA_RE = /captcha|g-recaptcha|hcaptcha|turnstile/i;
const DENIED_TITLE_RE = /access denied|attention required|forbidden/i;

export interface BlockedCheckInput {
  body: string;
  /** CSS-ish tokens we expect on a healthy page (from source config). */
  expectedSelectors?: string[];
}

/**
 * Returns true when a 200 response is actually a bot-wall / challenge page.
 * `expectedSelectors` are matched as plain substrings against the body so this
 * stays dependency-free and cheap; real parsing happens in the adapters.
 */
export function isBlocked({ body, expectedSelectors = [] }: BlockedCheckInput): boolean {
  if (CHALLENGE_RE.test(body)) return true;
  if (CAPTCHA_RE.test(body)) return true;

  const titleMatch = body.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch && DENIED_TITLE_RE.test(titleMatch[1] ?? "")) return true;

  // Suspiciously tiny body that contains none of the expected markers.
  if (body.length < 512) {
    const hasExpected = expectedSelectors.some((sel) => body.includes(sel));
    if (!hasExpected) return true;
  }

  return false;
}
