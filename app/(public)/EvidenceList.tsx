import type { PublicEvidenceWithAccess } from "../../src/public-intelligence/search.js";

const ROLE_ORDER: Record<string, number> = {
  PRIMARY_OFFICIAL: 0,
  SUPPORTING_OFFICIAL: 1,
  SECONDARY_CONTEXT: 2,
};

const ROLE_LABELS: Record<string, string> = {
  PRIMARY_OFFICIAL: "Primary official",
  SUPPORTING_OFFICIAL: "Supporting official",
  SECONDARY_CONTEXT: "Secondary context",
};

/** Approved mockup copy (Surface 6, "Restricted · inaccessible evidence, labeled"). */
const ACCESS_NOTE: Record<"RESTRICTED" | "UNAVAILABLE", string> = {
  RESTRICTED: "requires seller login, not retrievable",
  UNAVAILABLE: "terms prohibit automated access",
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

/**
 * The detail-page evidence list. Order is stable — PRIMARY_OFFICIAL, then
 * SUPPORTING_OFFICIAL, then SECONDARY_CONTEXT (the serializer already orders;
 * the sort is re-stated here so the page contract does not depend on a
 * caller). Inaccessible and disallowed evidence is labelled per the approved
 * mockup, never omitted and never linked out as if retrievable.
 */
export function EvidenceList({ evidence }: { evidence: PublicEvidenceWithAccess[] }) {
  const ordered = [...evidence].sort((a, b) => {
    const aRole = ROLE_ORDER[a.role] ?? 99;
    const bRole = ROLE_ORDER[b.role] ?? 99;
    if (aRole !== bRole) return aRole - bRole;
    const aPub = a.publishedAt ?? "";
    const bPub = b.publishedAt ?? "";
    return bPub.localeCompare(aPub);
  });

  return (
    <div>
      {ordered.map((item) => {
        const kind = ROLE_LABELS[item.role] ?? item.role;
        if (item.access !== "PUBLIC") {
          const label = item.access === "RESTRICTED" ? "Inaccessible" : "Disallowed";
          return (
            <div
              key={`${item.sourceId}-${item.url}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1 text-meta"
            >
              <span
                data-testid="evidence-access"
                className="ticker w-28 flex-none text-[0.625rem] uppercase tracking-[0.08em] text-faint"
              >
                {label}
              </span>
              <span className="text-muted">
                {item.normalizedSummary}{" "}
                <span className="ticker text-label text-faint">
                  {hostOf(item.url)} · {ACCESS_NOTE[item.access]}
                </span>
              </span>
            </div>
          );
        }
        return (
          <div
            key={`${item.sourceId}-${item.url}`}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 py-1 text-meta"
          >
            <span
              data-testid="evidence-role"
              className={`ticker w-28 flex-none text-[0.625rem] uppercase tracking-[0.08em] ${
                item.role === "PRIMARY_OFFICIAL" ? "font-semibold text-calm" : "text-faint"
              }`}
            >
              {kind}
            </span>
            <span>
              <a
                href={item.url}
                className="text-ink underline decoration-signal/45 underline-offset-[3px] transition-colors duration-200 hover:decoration-signal"
              >
                {item.normalizedSummary}
              </a>{" "}
              <span className="ticker text-label text-faint block sm:inline">
                {hostOf(item.url)}
                {item.publishedAt ? ` · published ${formatDate(item.publishedAt)}` : ""}
                {item.reviewedAt ? ` · reviewed ${formatDate(item.reviewedAt)}` : ""}
              </span>
            </span>
          </div>
        );
      })}
      <p className="ticker mt-2.5 text-label text-faint">
        Source text is never republished — evidence records carry normalized summaries and links.
      </p>
    </div>
  );
}
