"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  correctDraft,
  confirmEvidence,
  publishDraft,
  rejectDraft,
  reviewTemplate,
  type ReviewActionResult,
} from "./actions";

/**
 * Client boundary for the canonical review surface (approved Brief revision
 * Task6-T3-r3). Scope is limited to accessible form state: pending feedback,
 * duplicate-submit prevention, validation errors, and recovery feedback. Data
 * loading stays in the protected server page; authorization stays in the
 * server layout and actions.
 */

export interface ReviewControlsProps {
  draftId: string;
  /** Human-readable invariant failures; empty means publishable. */
  publishBlockers: string[];
  hasActionTemplate: boolean;
  actionTemplateReviewed: boolean;
  /** Holds unretracted primary-official evidence that has not been confirmed. */
  canConfirmEvidence: boolean;
  readiness: string;
  /** The change's current published version (correction target), if any. */
  currentVersionId: string | null;
}

const inputClass =
  "w-full rounded-sm border border-line bg-surface2/60 px-2.5 py-2.5 text-[13px] text-ink placeholder:text-faint focus:border-signal/50 disabled:opacity-50 sm:py-1.5";

export function ReviewControls({
  draftId,
  publishBlockers,
  hasActionTemplate,
  actionTemplateReviewed,
  canConfirmEvidence,
  readiness,
  currentVersionId,
}: ReviewControlsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [correctedEffectiveAt, setCorrectedEffectiveAt] = useState("");
  const [correctedTemplate, setCorrectedTemplate] = useState("");

  const publishable = publishBlockers.length === 0;

  function run(action: () => Promise<ReviewActionResult>, doneLabel: string) {
    setError(null);
    setValidation(null);
    setDone(null);
    startTransition(async () => {
      try {
        const res = await action();
        if (res.ok) {
          setDone(doneLabel);
          router.refresh();
        } else {
          setError(res.error);
        }
      } catch {
        setError("Network error — nothing was written; check your connection and retry.");
      }
    });
  }

  function onReject() {
    if (rejectReason.trim() === "") {
      setValidation("Rejection requires a reason — say what is wrong with the evidence or classification.");
      return;
    }
    run(() => rejectDraft(draftId, rejectReason), "Rejected with reason recorded.");
  }

  function onCorrect() {
    if (correctionReason.trim() === "") {
      setValidation("Correction requires a reason — it becomes part of the permanent version history.");
      return;
    }
    run(
      () =>
        correctDraft(
          currentVersionId!,
          correctionReason,
          correctedEffectiveAt || null,
          correctedTemplate || null,
        ),
      "Correction published as a new immutable version.",
    );
  }

  return (
    <div className="space-y-4" aria-busy={pending}>
      <div aria-live="polite" className="space-y-1.5">
        {validation && (
          <p role="alert" className="text-[12px] text-urgent">
            {validation}
          </p>
        )}
        {error && (
          <p role="alert" className="text-[12px] text-urgent">
            {error} — the draft is unchanged; fix the cause and retry, or reject it with a reason.
          </p>
        )}
        {done && <p className="text-[12px] text-calm">{done}</p>}
        {pending && (
          <p className="ticker text-[10px] uppercase tracking-[0.12em] text-faint">
            Writing — hold on…
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {canConfirmEvidence && readiness !== "VERIFIED" && (
          <button
            type="button"
            disabled={pending}
            title="Confirm this entry against its primary-official evidence and grade it Verified"
            onClick={() =>
              run(
                () => confirmEvidence(draftId),
                "Confirmed against primary-official evidence — now Verified.",
              )
            }
            className="ticker rounded-sm border border-calm/50 px-3.5 py-2.5 text-[10px] uppercase tracking-[0.12em] text-calm transition-colors sm:py-1.5 hover:bg-calm/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm evidence → Verified
          </button>
        )}
        {hasActionTemplate && !actionTemplateReviewed && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => reviewTemplate(draftId), "Action template marked as reviewed.")
            }
            className="ticker rounded-sm border border-signal/50 px-3.5 py-2.5 text-[10px] uppercase tracking-[0.12em] text-signal transition-colors sm:py-1.5 hover:bg-signal/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Mark action template reviewed
          </button>
        )}
        <button
          type="button"
          disabled={pending || !publishable}
          title={publishable ? "Publish this draft as the current version" : publishBlockers.join(" ")}
          onClick={() =>
            run(() => publishDraft(draftId), "Published — this version is now current.")
          }
          className="ticker rounded-sm bg-signal px-3.5 py-2.5 text-[10px] uppercase tracking-[0.12em] text-chipink transition-opacity sm:py-1.5 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Publish → current version
        </button>
      </div>
      {!publishable && (
        <p className="text-[12px] text-muted">
          Publish is blocked: {publishBlockers.join(" ")}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <fieldset disabled={pending} className="space-y-2">
          <label
            htmlFor={`reject-reason-${draftId}`}
            className="ticker block text-[10px] uppercase tracking-[0.12em] text-muted"
          >
            Reject — reason required, kept on the record
          </label>
          <textarea
            id={`reject-reason-${draftId}`}
            rows={2}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Why is this draft not publishable?"
            className={inputClass}
          />
          <button
            type="button"
            disabled={pending}
            onClick={onReject}
            className="ticker rounded-sm border border-line px-3.5 py-2.5 text-[10px] uppercase tracking-[0.12em] text-muted transition-colors sm:py-1.5 hover:border-urgent/40 hover:text-urgent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Reject draft
          </button>
        </fieldset>

        {currentVersionId && (
          <fieldset disabled={pending} className="space-y-2">
            <label
              htmlFor={`correction-reason-${draftId}`}
              className="ticker block text-[10px] uppercase tracking-[0.12em] text-muted"
            >
              Correct the published version — reason required, history preserved
            </label>
            <textarea
              id={`correction-reason-${draftId}`}
              rows={2}
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="What changed and why?"
              className={inputClass}
            />
            <div className="flex flex-wrap gap-x-2 gap-y-1.5">
              <span className="flex items-center gap-1.5">
                <label
                  htmlFor={`corrected-effective-${draftId}`}
                  className="ticker text-[10px] uppercase tracking-[0.12em] text-faint"
                >
                  Effective
                </label>
                <input
                  id={`corrected-effective-${draftId}`}
                  type="date"
                  value={correctedEffectiveAt}
                  onChange={(e) => setCorrectedEffectiveAt(e.target.value)}
                  className={inputClass + " w-auto"}
                />
              </span>
              <span className="flex min-w-0 flex-1 items-center gap-1.5">
                <label
                  htmlFor={`corrected-template-${draftId}`}
                  className="ticker whitespace-nowrap text-[10px] uppercase tracking-[0.12em] text-faint"
                >
                  Template
                </label>
                <input
                  id={`corrected-template-${draftId}`}
                  type="text"
                  value={correctedTemplate}
                  onChange={(e) => setCorrectedTemplate(e.target.value)}
                  placeholder="New action template — leave blank to keep"
                  className={inputClass + " min-w-0 flex-1"}
                />
              </span>
            </div>
            {correctedTemplate.trim() !== "" && (
              <p className="text-[12px] text-muted">
                Changing the template re-reviews it: the new version records you as
                the template reviewer at correction time.
              </p>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={onCorrect}
              className="ticker rounded-sm border border-line px-3.5 py-2.5 text-[10px] uppercase tracking-[0.12em] text-muted transition-colors sm:py-1.5 hover:border-signal/50 hover:text-signal disabled:cursor-not-allowed disabled:opacity-50"
            >
              Publish correction as new version
            </button>
          </fieldset>
        )}
      </div>
    </div>
  );
}
