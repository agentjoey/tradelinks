import {
  listCanonicalReviewQueue,
  type CanonicalReviewDraft,
} from "../../../src/alerts/review.js";
import { checkPublishableVersion } from "../../../src/domain/intelligence/canonical-change.js";
import { isReviewedPrimaryOfficialEvidence } from "../../../src/domain/intelligence/evidence.js";
import {
  PRODUCT_CATEGORY_LABELS,
  SIGNAL_TYPE_LABELS,
  type ProductCategory,
  type SignalType,
} from "../../../src/domain/intelligence/taxonomy.js";
import { REGION_LABEL } from "../../lib/labels";
import { ReviewControls } from "./review-controls";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function date(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "unavailable";
}

function dateTime(d: Date | null): string {
  return d ? `${d.toISOString().replace("T", " ").slice(0, 16)}Z` : "unavailable";
}

function list(values: string[]): string {
  return values.length > 0 ? values.join(", ") : "—";
}

/** Human-readable publication blockers for the controls (codes stay in logs). */
const BLOCKER_TEXT: Record<string, string> = {
  CANONICAL_READINESS_NOT_PUBLISHABLE:
    "readiness must be MONITORED or VERIFIED.",
  VERIFIED_REQUIRES_REVIEWED_PRIMARY_OFFICIAL_EVIDENCE:
    "VERIFIED publication needs reviewed PRIMARY_OFFICIAL evidence from a government/platform official source.",
  ACTION_TEMPLATE_REQUIRES_REVIEW:
    "the action template needs an editor review first.",
};

/** Field-level diff between the current published version and the draft. */
function diffRows(draft: CanonicalReviewDraft) {
  const current = draft.canonicalChange.versions.find((v) => v.isCurrent) ?? null;
  if (!current) return { current: null, rows: [] as { label: string; before: string; after: string }[] };

  const fmtCategories = (cs: string[]) =>
    cs.length > 0
      ? cs.map((c) => PRODUCT_CATEGORY_LABELS[c as ProductCategory] ?? c).join(", ")
      : "—";
  const fields: { label: string; before: string; after: string }[] = [
    { label: "Title", before: current.title, after: draft.title },
    { label: "Summary", before: current.summary, after: draft.summary },
    { label: "Impact", before: current.generalImpact, after: draft.generalImpact },
    {
      label: "Action template",
      before: current.generalActionTemplate ?? "—",
      after: draft.generalActionTemplate ?? "—",
    },
    { label: "Signal type", before: current.signalType, after: draft.signalType },
    { label: "Readiness", before: current.readiness, after: draft.readiness },
    { label: "Urgency", before: String(current.urgency), after: String(draft.urgency) },
    { label: "Published at source", before: date(current.sourcePublishedAt), after: date(draft.sourcePublishedAt) },
    { label: "Effective", before: date(current.effectiveAt), after: date(draft.effectiveAt) },
    { label: "Markets/regions", before: list(current.regions), after: list(draft.regions) },
    { label: "Platforms", before: list(current.platforms), after: list(draft.platforms) },
    { label: "Operating stages", before: list(current.operatingStages), after: list(draft.operatingStages) },
    { label: "Product categories", before: fmtCategories(current.productCategories), after: fmtCategories(draft.productCategories) },
    { label: "Risk attributes", before: list(current.riskAttributes), after: list(draft.riskAttributes) },
    { label: "Policy topics", before: list(current.policyTopics), after: list(draft.policyTopics) },
  ];
  return { current, rows: fields.filter((f) => f.before !== f.after) };
}

function Constraint({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2 text-[12px]">
      <span
        aria-hidden
        className={`ticker mt-px ${ok === null ? "text-faint" : ok ? "text-calm" : "text-urgent"}`}
      >
        {ok === null ? "○" : ok ? "✓" : "✗"}
      </span>
      <span className="text-muted">
        {label} <span className={ok === false ? "text-urgent" : "text-ink/80"}>{detail}</span>
      </span>
    </li>
  );
}

function DraftCard({ draft }: { draft: CanonicalReviewDraft }) {
  const blockers = checkPublishableVersion(draft).map((c) => BLOCKER_TEXT[c] ?? c);
  const { current, rows } = diffRows(draft);
  const versions = draft.canonicalChange.versions;
  const primaryOfficial = draft.evidence.find(isReviewedPrimaryOfficialEvidence)
    ?? draft.evidence.find((e) => e.role === "PRIMARY_OFFICIAL")
    ?? null;
  const hasTemplate = !!draft.generalActionTemplate && draft.generalActionTemplate.trim() !== "";
  const templateReviewed = draft.actionTemplateReviewedAt != null;
  const hasReviewedPrimary = draft.evidence.some(isReviewedPrimaryOfficialEvidence);

  return (
    <article className="rounded-md border border-line bg-surface/70 p-4 sm:p-5">
      {/* identity */}
      <div className="ticker mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] uppercase tracking-[0.12em]">
        <span className="text-signal">{SIGNAL_TYPE_LABELS[draft.signalType as SignalType] ?? draft.signalType}</span>
        <span className="text-faint">·</span>
        <span className="text-muted">{draft.readiness}</span>
        <span className="text-faint">·</span>
        <span className="text-muted">{draft.market}</span>
        <span className="text-faint">·</span>
        <span className="text-muted">urgency {draft.urgency}</span>
        <span className="text-faint">·</span>
        {draft.regions.map((r) => (
          <span key={r} className="text-muted">{REGION_LABEL[r] ?? r}</span>
        ))}
        <span className="text-faint">· v{draft.version} draft of {draft.canonicalChange.slug}</span>
      </div>
      <h2 className="font-display text-[19px] font-medium leading-snug text-ink">{draft.title}</h2>
      <p className="mt-1 max-w-[72ch] text-[13px] text-muted">{draft.summary}</p>

      {/* 1 · publication constraints first */}
      <section aria-label="Publication constraints" className="mt-4 rounded-sm border border-line bg-surface2/50 px-3 py-2.5">
        <h3 className="ticker mb-1.5 text-[10px] uppercase tracking-[0.14em] text-faint">Publication constraints</h3>
        <ul className="space-y-1">
          <Constraint
            ok={draft.readiness === "MONITORED" || draft.readiness === "VERIFIED"}
            label="Readiness"
            detail={
              draft.readiness === "MONITORED" || draft.readiness === "VERIFIED"
                ? `${draft.readiness} is publishable`
                : `${draft.readiness} is not publishable (needs MONITORED or VERIFIED)`
            }
          />
          <Constraint
            ok={draft.readiness === "VERIFIED" ? hasReviewedPrimary : null}
            label="Reviewed primary official evidence"
            detail={
              draft.readiness === "VERIFIED"
                ? hasReviewedPrimary
                  ? "reviewed PRIMARY_OFFICIAL evidence present"
                  : "required for VERIFIED — none reviewed"
                : `not required at ${draft.readiness}`
            }
          />
          <Constraint
            ok={hasTemplate ? templateReviewed : null}
            label="Action template"
            detail={
              hasTemplate
                ? templateReviewed
                  ? `reviewed by ${draft.actionTemplateReviewedBy ?? "editor"} ${dateTime(draft.actionTemplateReviewedAt)}`
                  : "present but not yet reviewed"
                : "no action recommendation on this version"
            }
          />
        </ul>
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* 2 · version diff */}
        <section aria-label="Version diff" className="rounded-sm border border-line px-3 py-2.5">
          <h3 className="ticker mb-1.5 text-[10px] uppercase tracking-[0.14em] text-faint">
            Version diff {current ? `— v${current.version} (current) → v${draft.version} (draft)` : "— first version, no published baseline"}
          </h3>
          {rows.length === 0 ? (
            <p className="text-[12px] text-muted">
              {current ? "No field-level changes against the current version." : "Everything on this draft is new."}
            </p>
          ) : (
            <dl className="space-y-1.5">
              {rows.map((r) => (
                <div key={r.label} className="text-[12px]">
                  <dt className="ticker text-[10px] uppercase tracking-[0.1em] text-faint">{r.label}</dt>
                  <dd className="text-muted line-through decoration-urgent/50">{r.before}</dd>
                  <dd className="text-ink">{r.after}</dd>
                </div>
              ))}
            </dl>
          )}

          {/* effective-date provenance + classification confidence */}
          <div className="mt-3 border-t border-line pt-2.5 text-[12px] text-muted">
            <p>
              Published at source <span className="text-ink">{date(draft.sourcePublishedAt)}</span>
              {" · "}effective <span className="text-ink">{date(draft.effectiveAt)}</span>
              {draft.effectiveAt == null && <span className="text-faint"> (no effective date recorded)</span>}
            </p>
            <p className="mt-1">
              Classification confidence{" "}
              {draft.classificationConfidence != null ? (
                <span className="ticker text-ink">{draft.classificationConfidence.toFixed(2)}</span>
              ) : (
                <span className="text-faint">unavailable — recorded before confidence persistence</span>
              )}
            </p>
          </div>
        </section>

        {/* 3 · evidence */}
        <section aria-label="Evidence" className="rounded-sm border border-line px-3 py-2.5">
          <h3 className="ticker mb-1.5 text-[10px] uppercase tracking-[0.14em] text-faint">
            Evidence — {draft.evidence.length} record{draft.evidence.length === 1 ? "" : "s"}
          </h3>
          {primaryOfficial && (
            <a
              href={primaryOfficial.url}
              target="_blank"
              rel="noreferrer"
              className="mb-2 inline-block rounded-sm border border-signal/40 px-2 py-2 text-[12px] text-signal transition-colors hover:bg-signal/10 sm:py-1"
            >
              Primary source: {primaryOfficial.source.name} ↗
            </a>
          )}
          {draft.evidence.length === 0 ? (
            <p className="text-[12px] text-urgent">No evidence attached — this draft cannot satisfy a VERIFIED publish.</p>
          ) : (
            <ul className="space-y-2">
              {draft.evidence.map((e) => (
                <li key={e.id} className="rounded-sm bg-surface2/50 px-2.5 py-2 text-[12px]">
                  <div className="ticker flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] uppercase tracking-[0.1em]">
                    <span className={e.role === "PRIMARY_OFFICIAL" ? "text-signal" : "text-muted"}>{e.role}</span>
                    <span className="text-faint">·</span>
                    <span className="text-muted">{e.authorityLevel}</span>
                    <span className="text-faint">·</span>
                    <span className="text-muted">{e.access}</span>
                    <span className="text-faint">·</span>
                    {e.reviewedAt ? (
                      <span className="text-calm">reviewed {dateTime(e.reviewedAt)}</span>
                    ) : (
                      <span className="text-urgent">unreviewed</span>
                    )}
                    {e.retractedAt && <span className="text-urgent">· retracted</span>}
                  </div>
                  <p className="mt-1 text-ink/90">{e.normalizedSummary}</p>
                  <p className="mt-1 text-muted">
                    <a href={e.url} target="_blank" rel="noreferrer" className="text-signal/90 underline decoration-signal/30 underline-offset-2 hover:text-signal">
                      {e.source.name} ↗
                    </a>
                    {" · "}{e.licenseNote}
                    {" · fetched "}{dateTime(e.fetchedAt)}
                    {" · hash "}<span className="ticker text-faint">{e.contentHash.slice(0, 12)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* 4 · action template */}
      {hasTemplate && (
        <section aria-label="Action template" className="mt-4 rounded-sm border border-line px-3 py-2.5">
          <h3 className="ticker mb-1.5 text-[10px] uppercase tracking-[0.14em] text-faint">Action template</h3>
          <p className="text-[13px] text-ink/90">{draft.generalActionTemplate}</p>
          <p className="mt-1 text-[12px] text-muted">
            {templateReviewed
              ? `Reviewed by ${draft.actionTemplateReviewedBy ?? "editor"} · ${dateTime(draft.actionTemplateReviewedAt)}`
              : "Not reviewed — publication is blocked until an editor reviews it."}
          </p>
        </section>
      )}

      {/* 5 · immutable version history, adjacent to the action */}
      {versions.length > 0 && (
        <section aria-label="Version history" className="mt-4 rounded-sm border border-line px-3 py-2.5">
          <h3 className="ticker mb-1.5 text-[10px] uppercase tracking-[0.14em] text-faint">
            Immutable version history
          </h3>
          <ul className="space-y-1 text-[12px] text-muted">
            {versions.map((v) => (
              <li key={v.id}>
                <span className="ticker text-ink">v{v.version}</span>
                {" · "}{v.editorialStatus}
                {v.isCurrent && <span className="text-calm"> · current</span>}
                {v.reviewedBy && <span> · by {v.reviewedBy} {dateTime(v.reviewedAt)}</span>}
                {v.correctionReason && <span className="text-signal"> · correction: {v.correctionReason}</span>}
                {v.rejectionReason && <span className="text-urgent"> · rejected: {v.rejectionReason}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 6 · controls with consequences */}
      <div className="mt-4 border-t border-line pt-4">
        <ReviewControls
          draftId={draft.id}
          publishBlockers={blockers}
          hasActionTemplate={hasTemplate}
          actionTemplateReviewed={templateReviewed}
          currentVersionId={current?.id ?? null}
        />
      </div>
    </article>
  );
}

export default async function ReviewPage() {
  const { drafts: queue, total } = await listCanonicalReviewQueue();
  const remaining = total - queue.length;

  return (
    <div>
      <div className="mb-7">
        <div className="ticker text-[10px] uppercase tracking-[0.2em] text-signal/80 mb-2">◆ The Desk</div>
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight">
          Canonical <span className="italic text-signal">review</span>
        </h1>
        <p className="mt-3 max-w-[68ch] text-[15px] text-muted">
          Canonical drafts awaiting an editor's decision. Publication is immutable:
          check the constraints, the diff, and the evidence — the version you publish
          becomes the permanent record, correctable only forward.
        </p>
        {remaining > 0 && (
          // Never let a bounded page read as an empty desk.
          <p className="mt-3 ticker text-[11px] uppercase tracking-[0.15em] text-faint">
            showing {queue.length} of {total} — {remaining} more awaiting review
          </p>
        )}
      </div>

      {queue.length === 0 ? (
        <div className="py-20 text-center">
          <p className="ticker text-[11px] uppercase tracking-[0.2em] text-faint">✓ queue clear</p>
          <p className="mt-2 text-[13px] text-muted">No canonical drafts awaiting review.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {queue.map((draft) => (
            <DraftCard key={draft.id} draft={draft} />
          ))}
        </div>
      )}
    </div>
  );
}
