/** Extract a JSON value from an LLM response that may be fenced or padded. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // strip ```json ... ``` or ``` ... ``` fences
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed)!.trim();
  try {
    return JSON.parse(candidate);
  } catch {
    // last resort: find first { or [ and matching tail
    const start = candidate.search(/[[{]/);
    if (start >= 0) {
      const lastObj = candidate.lastIndexOf("}");
      const lastArr = candidate.lastIndexOf("]");
      const end = Math.max(lastObj, lastArr);
      if (end > start) {
        return JSON.parse(candidate.slice(start, end + 1));
      }
    }
    throw new Error("no JSON found in LLM response");
  }
}
