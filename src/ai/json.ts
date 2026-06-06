/** Extract a JSON value from an LLM response that may be fenced or padded. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // strip ```json ... ``` or ``` ... ``` fences
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed)!.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    // Scan for the FIRST complete top-level value starting at the first { or [,
    // matching brackets while respecting string literals/escapes. This tolerates
    // prose around the JSON AND trailing garbage (e.g. some models append extra
    // "}" characters after the object — Gemini Flex was observed doing this).
    const start = candidate.search(/[[{]/);
    if (start >= 0) {
      const slice = firstBalanced(candidate, start) ?? candidate.slice(start);
      // try as-is, then with raw control chars inside strings escaped (LLMs often
      // emit literal newlines/tabs inside string values — invalid JSON, fixable).
      for (const attempt of [slice, escapeControlCharsInStrings(slice)]) {
        try {
          return JSON.parse(attempt);
        } catch {
          /* try next */
        }
      }
    }
    throw new Error("no JSON found in LLM response");
  }
}

/** Escape raw control chars (newline/tab/etc.) that appear INSIDE string literals. */
function escapeControlCharsInStrings(s: string): string {
  let out = "";
  let inStr = false;
  let escaped = false;
  for (const ch of s) {
    if (inStr) {
      if (escaped) { out += ch; escaped = false; continue; }
      if (ch === "\\") { out += ch; escaped = true; continue; }
      if (ch === '"') { out += ch; inStr = false; continue; }
      const code = ch.charCodeAt(0);
      if (code < 0x20) {
        out += ch === "\n" ? "\\n" : ch === "\r" ? "\\r" : ch === "\t" ? "\\t" : `\\u${code.toString(16).padStart(4, "0")}`;
        continue;
      }
      out += ch;
    } else {
      out += ch;
      if (ch === '"') inStr = true;
    }
  }
  return out;
}

/** Return the substring of the first balanced {...} or [...] starting at `start`. */
function firstBalanced(s: string, start: number): string | null {
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}
