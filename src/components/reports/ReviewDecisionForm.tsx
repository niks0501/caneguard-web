import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { ZodError } from "zod";
import { ApiError } from "../../api/ApiError";
import { routes } from "../../app/routes";
import { DetailField } from "../layout/Page";
import { Button } from "../ui/Button";
import { SelectFilter, TextArea } from "../ui/FormControls";
import { useUnsavedWorkGuard } from "../ui/unsavedWorkContext";
import { activeAuthorityClassifiedConditions, authorityClassifiedConditionLabels, caseStateLabels, diseaseLabels, isLegacyAuthorityClassifiedCondition, verificationOutcomeLabels } from "../../domain/report.metadata";
import type { AuthorityClassifiedCondition, DiseaseReport, VerificationOutcome } from "../../domain/report.types";
import type { ReportReviewInput } from "../../domain/review.types";
import { legacyLifecycleForReviewStatus } from "../../data/api/mappers/lifecycle.mapper";
import { useFieldReporters } from "../../hooks/useFieldReporters";
import { useAdvisories, useUpdateReportReview } from "../../hooks/useReports";
import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { reportsRepository } from "../../services/reports.service";
import { ReviewConflictPanel } from "./ReviewConflictPanel";
import {
  conflictFields,
  draftReviewSnapshot,
  parseActionToken,
  savedReviewSnapshot,
  type ConflictChoices,
  type ConflictSnapshot,
} from "./reviewConflict";
import { reviewQueueContext } from "./reviewQueueContext";

type NextAction = "field" | "support" | "close";
const actions: { value: NextAction; label: string }[] = [
  { value: "field", label: "Needs Field Validation" },
  { value: "support", label: "Provide Advisory or Assistance" },
  { value: "close", label: "No Further Action" },
];

export function ReviewDecisionForm({ report, onRefresh }: {
  report: DiseaseReport;
  onRefresh: () => Promise<{ data?: DiseaseReport | null; isError?: boolean }> | void;
}) {
  const lifecycle = report.lifecycle ?? legacyLifecycleForReviewStatus(report.reviewStatus);
  const mutation = useUpdateReportReview(report.uuid);
  const advisories = useAdvisories();
  const inspectors = useFieldReporters();
  const location = useLocation();
  const navigate = useNavigate();
  const context = reviewQueueContext(location.state);
  const returnTo = context?.returnTo ?? routes.reports;
  // Hold the version that the draft was based on, even if a background refetch arrives.
  const [expectedVersion, setExpectedVersion] = useState(report.reviewVersion);
  const [classification, setClassification] = useState<AuthorityClassifiedCondition | null>(report.authorityClassifiedCondition ?? null);
  const [verification, setVerification] = useState<VerificationOutcome>(lifecycle.verificationOutcome);
  const [action, setAction] = useState<NextAction | null>(null);
  const [support, setSupport] = useState<"advisory" | "technical">("advisory");
  const [advisoryUuid, setAdvisoryUuid] = useState("");
  const [inspectorUuid, setInspectorUuid] = useState(report.fieldValidationAssignment?.assignee.uuid ?? "");
  const [targetDate, setTargetDate] = useState(report.fieldValidationAssignment?.targetVisitDate ?? "");
  const [notes, setNotes] = useState(report.reviewNotes ?? "");
  const [closedConfirmed, setClosedConfirmed] = useState(false);
  const [reopenConfirmed, setReopenConfirmed] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [stale, setStale] = useState(false);
  const [nextPending, setNextPending] = useState(false);
  const [nextMessage, setNextMessage] = useState("");
  const [conflictLatest, setConflictLatest] = useState<DiseaseReport | null>(null);
  const [conflictLoading, setConflictLoading] = useState(false);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const online = useOnlineStatus();
  // Online-only writes: a draft is never queued for replay after an outage.
  const [offlineResumed, setOfflineResumed] = useState(false);
  const wasOffline = useRef(!online);
  useEffect(() => {
    const handleOffline = () => {
      wasOffline.current = true;
      setOfflineResumed(false);
    };
    const handleOnline = () => {
      if (wasOffline.current) setOfflineResumed(true);
      wasOffline.current = false;
    };
    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
    };
  }, []);
  const saving = useRef(false);
  const currentClosed = lifecycle.caseState === "closed";
  const activeValidation = lifecycle.fieldValidationState === "assigned" || lifecycle.fieldValidationState === "in_progress";
  const completedValidation = lifecycle.fieldValidationState === "completed";
  const assignmentNeeded = action === "field" && !activeValidation && !completedValidation;
  const fieldSelected = action === "field";
  const resultingState = fieldSelected ? "open" : action === "close" ? "closed" : lifecycle.caseState;
  const validated = (advisories.data ?? []).filter((item) => item.status === "validated");
  const selectedAdvisory = validated.find((item) => item.uuid === advisoryUuid);
  const selectedInspector = (inspectors.data ?? []).find((item) => item.uuid === inspectorUuid)
    ?? report.fieldValidationAssignment?.assignee;
  const errors = {
    classification: verification === "verified" && !classification ? "Staff-Classified Condition is required for Verified." : null,
    action: !action ? "Choose what should happen next." : null,
    advisory: action === "support" && support === "advisory" && !selectedAdvisory ? "Select a validated advisory for Advisory Guidance." : null,
    inspector: assignmentNeeded && !inspectorUuid ? "Select a Field Inspector before saving field validation." : null,
    reopen: fieldSelected && currentClosed && !reopenConfirmed ? "Reopen the case before assigning a field validation visit." : null,
    close: action === "close" && !closedConfirmed ? "Confirm that you want to close this case." : null,
    notes: notes.length > 1000 ? "Review notes must be 1,000 characters or fewer."
      : verification === "unable_to_verify" && !notes.trim() ? "Add a note explaining why the evidence cannot be verified."
      : action === "support" && support === "technical" && !notes.trim() ? "Meaningful Technical Assistance details are required." : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const apiError = mutation.error instanceof ApiError ? mutation.error : null;
  const conflict = stale || apiError?.status === 409;
  const changed = () => { setDirty(true); setSaved(false); setOfflineResumed(false); mutation.reset(); };
  useUnsavedWorkGuard(dirty);
  useEffect(() => {
    document.title = `${submitted && invalid ? "Error: " : ""}CaneGuard | Case Review ${report.referenceCode}`;
  }, [submitted, invalid, report.referenceCode]);
  const error = (key: keyof typeof errors) => submitted && errors[key]
    ? <p id={`review-error-${key}`} className="form-error" role="alert">{errors[key]}</p> : null;

  const confirm = async () => {
    setSubmitted(true);
    if (!online || invalid || saving.current || mutation.isPending || conflict || saved || expectedVersion === undefined) return;
    const input: ReportReviewInput = {
      authorityClassifiedCondition: classification,
      verificationOutcome: fieldSelected ? "not_determined" : verification,
      notes: notes.trim(),
      expectedVersion,
      ...(action === "support" ? {
        actionTaken: support === "advisory" ? "advisory_provided" : "technical_assistance_provided",
        ...(support === "advisory" ? { advisoryUuid } : {}),
      } : {}),
      ...(action === "close" ? { actionTaken: "no_further_action_required", caseState: "closed" } : {}),
      ...(fieldSelected ? { caseState: "open", ...(assignmentNeeded ? {
        fieldValidationState: "assigned", fieldValidationAssigneeUuid: inspectorUuid,
        fieldValidationTargetDate: targetDate || null,
      } : {}) } : {}),
    };
    saving.current = true;
    try {
      const updated = await mutation.mutateAsync(input);
      setExpectedVersion(updated?.reviewVersion ?? expectedVersion + 1);
      setDirty(false); setSaved(true); setSubmitted(false);
      setConflictLatest(null); setConflictError(null);
      onRefresh();
    } catch (error) {
      // Keep the draft intact; a stale draft needs an explicit version refresh.
      if (error instanceof ApiError && error.status === 409) {
        setStale(true);
        void loadLatestVersion();
      }
    }
    finally { saving.current = false; }
  };

  const latestReadInFlight = useRef(false);
  const loadLatestVersion = useCallback(async () => {
    if (latestReadInFlight.current) return;
    latestReadInFlight.current = true;
    setConflictLoading(true);
    setConflictError(null);
    try {
      const refreshed = await onRefresh();
      if (refreshed?.data && !refreshed.isError) setConflictLatest(refreshed.data);
      else setConflictError("The latest saved version could not be loaded. Check the connection and try again.");
    } catch {
      setConflictError("The latest saved version could not be loaded. Check the connection and try again.");
    } finally {
      latestReadInFlight.current = false;
      setConflictLoading(false);
    }
  }, [onRefresh]);

  // A 409 starts one automatic read of the latest saved record; a failure stays
  // visible with an explicit retry instead of retrying in a loop.
  const autoCompareRequested = useRef(false);
  useEffect(() => {
    if (!conflict) {
      autoCompareRequested.current = false;
      return;
    }
    if (conflictLatest || conflictLoading || conflictError || autoCompareRequested.current) return;
    autoCompareRequested.current = true;
    void loadLatestVersion();
  }, [conflict, conflictLatest, conflictLoading, conflictError, loadLatestVersion]);

  // Reconciliation never updates only the concurrency token: every field either
  // takes the latest saved value or keeps the reviewer's own draft value.
  const applyConflictChoices = (choices: ConflictChoices) => {
    if (!conflictLatest) return;
    const saved = savedReviewSnapshot(conflictLatest);
    const mine = draftReviewSnapshot({ classification, verification, action, support, advisoryUuid, notes, inspectorUuid, targetDate });
    const resolved = Object.fromEntries(
      conflictFields.map((field) => [field, choices[field] === "latest" ? saved[field] : mine[field]]),
    ) as ConflictSnapshot;
    const selection = parseActionToken(resolved.action);
    setClassification((resolved.classification || null) as AuthorityClassifiedCondition | null);
    setVerification(resolved.verification as VerificationOutcome);
    setAction(selection.action ? selection.action as NextAction : null);
    setSupport(selection.support);
    setAdvisoryUuid(selection.advisoryUuid);
    setNotes(resolved.notes);
    setInspectorUuid(resolved.inspector);
    setTargetDate(resolved.targetDate);
    setExpectedVersion(conflictLatest.reviewVersion);
    setStale(false);
    setSubmitted(false);
    setConflictLatest(null);
    setConflictError(null);
    mutation.reset();
    setDirty((Object.keys(resolved) as (keyof typeof resolved)[])
      .some((field) => resolved[field] !== saved[field]));
  };

  const reviewNext = async () => {
    if (nextPending) return;
    setNextPending(true); setNextMessage("");
    const reviewedIds = [...(context?.reviewedIds ?? []), report.uuid];
    let remainingIds = (context?.remainingIds ?? []).filter((id) => !reviewedIds.includes(id));
    try {
      // The original snapshot survives queue invalidation/removal after saving.
      // At its end, rescan the same filtered order to handle page shifts without skipping cases.
      if (!remainingIds.length && !context?.snapshotOnly) {
        let page = 1;
        while (true) {
          const result = await reportsRepository.listReports({ ...context?.filters, page });
          remainingIds = result.reports.map((item) => item.uuid).filter((id) => !reviewedIds.includes(id));
          if (remainingIds.length || page >= result.meta.lastPage) break;
          page += 1;
        }
      }
      const next = remainingIds[0];
      if (next) navigate(routes.reportDetail(next), { state: { reviewQueue: {
        returnTo, filters: context?.filters ?? {}, remainingIds: remainingIds.slice(1), reviewedIds,
        ...(context?.snapshotOnly ? { snapshotOnly: true } : {}),
        ...(context?.snapshotTruncated ? { snapshotTruncated: true } : {}),
      } } });
      else setNextMessage(context?.snapshotTruncated
          ? "Review Next covers this section's loaded cases only. Return to the list and narrow the queue to reach the rest."
          : "No more cases in this queue.");
    } catch { setNextMessage("The next case could not be loaded. Try again or return to the queue."); }
    finally { setNextPending(false); }
  };

  return <form id="review-decision" tabIndex={-1} aria-label="Report Evidence Review" className="review-decision-flow" noValidate onSubmit={(event) => { event.preventDefault(); void confirm(); }}>
    <fieldset className="review-card review-finding" disabled={mutation.isPending}>
      <legend>Record Finding</legend>
      <div className="review-finding__fields">
        <div><SelectFilter label="Staff-Classified Condition" value={classification ?? ""}
          aria-invalid={submitted && !!errors.classification} aria-describedby={submitted && errors.classification ? "review-error-classification" : undefined}
          onChange={(event) => { setClassification((event.target.value || null) as AuthorityClassifiedCondition | null); changed(); }}>
          <option value="">Not classified</option>
          {activeAuthorityClassifiedConditions.map((value) => <option key={value} value={value}>{authorityClassifiedConditionLabels[value]}</option>)}
          {isLegacyAuthorityClassifiedCondition(report.authorityClassifiedCondition) ? <option value={report.authorityClassifiedCondition!}>{authorityClassifiedConditionLabels[report.authorityClassifiedCondition!]} (legacy record; not offered for new review)</option> : null}
        </SelectFilter>{error("classification")}</div>
        <SelectFilter label="Verification Outcome" value={verification} onChange={(event) => { setVerification(event.target.value as VerificationOutcome); changed(); }}>
          <option value="not_determined">Not Determined</option>
          <option value="verified" disabled={fieldSelected || activeValidation}>Verified</option>
          <option value="unable_to_verify" disabled={fieldSelected}>Unable to Verify</option>
        </SelectFilter>
      </div>
      <p className="authority-classification-help">Human finding; independent of the AI Possible Condition.</p>
    </fieldset>

    <section className="review-card" aria-labelledby="choose-action-heading">
      <h2 id="choose-action-heading">Choose Action</h2>
      <fieldset className="review-actions" disabled={mutation.isPending}>
        <legend>What should happen next?</legend>
        <div className="review-actions__pills">{actions.map((item) => <label key={item.value} className={`review-action-pill ${action === item.value ? "is-selected" : ""}`}>
          <input type="radio" name="next-action" value={item.value} checked={action === item.value}
            disabled={item.value === "field" && completedValidation}
            onChange={() => { setAction(item.value); if (item.value === "field") setVerification("not_determined"); setClosedConfirmed(false); setReopenConfirmed(false); changed(); }} />
          <span><strong>{item.label}</strong></span>
        </label>)}</div>
      </fieldset>{error("action")}
      <fieldset className="review-conditional-fields" disabled={mutation.isPending}>
        <legend className="sr-only">Action details and notes</legend>
        {fieldSelected ? <div className="review-subform">
          <p role="status">Field Validation remains Not Determined; the case stays Open.</p>
          {activeValidation ? <p>Field validation active — assigned to {report.fieldValidationAssignment?.assignee.name}. Active assignments and submitted field-validation evidence are not reassigned here.</p> : <>
            <SelectFilter label="Field Inspector assignee" value={inspectorUuid} aria-invalid={submitted && !!errors.inspector}
              aria-describedby={submitted && errors.inspector ? "review-error-inspector" : undefined}
              onChange={(event) => { setInspectorUuid(event.target.value); changed(); }}>
              <option value="">Select a Field Inspector</option>
              {(inspectors.data ?? []).map((item) => <option key={item.uuid} value={item.uuid}>{item.name}</option>)}
            </SelectFilter>{error("inspector")}
            <label className="select-filter"><span>Target visit date (optional)</span><input type="date" value={targetDate} onChange={(event) => { setTargetDate(event.target.value); changed(); }} /></label>
            {inspectorUuid && inspectorUuid === report.submitterUuid ? <p role="status">Same person: the original submitter is also the field validator.</p> : null}
            {inspectors.isError ? <p role="alert" className="form-error">Eligible Field Inspectors could not be loaded. <Button type="button" variant="secondary" onClick={() => inspectors.refetch()}>Retry inspectors</Button></p> : null}
          </>}
          {currentClosed ? <label className="case-confirmation"><input type="checkbox" checked={reopenConfirmed} onChange={(event) => { setReopenConfirmed(event.target.checked); changed(); }} /><span>Reopen this case</span></label> : null}{error("reopen")}
        </div> : null}
        {action === "support" ? <div className="review-subform">
          <fieldset className="review-support-types"><legend>Support type</legend>
            <label><input type="radio" name="support-type" checked={support === "advisory"} onChange={() => { setSupport("advisory"); changed(); }} /> Advisory Guidance</label>
            <label><input type="radio" name="support-type" checked={support === "technical"} onChange={() => { setSupport("technical"); changed(); }} /> Technical Assistance</label>
          </fieldset>
          {support === "advisory" ? <><SelectFilter label="Validated advisory" value={advisoryUuid}
            aria-invalid={submitted && !!errors.advisory} aria-describedby={submitted && errors.advisory ? "review-error-advisory" : undefined}
            onChange={(event) => { setAdvisoryUuid(event.target.value); changed(); }}>
            <option value="">Select a validated advisory</option>
            {validated.map((item) => <option key={item.uuid} value={item.uuid}>{item.code} - {item.title}</option>)}
          </SelectFilter>{error("advisory")}
            {selectedAdvisory ? <p>{selectedAdvisory.content}</p> : null}
            {advisories.isError ? <p className="form-error" role="alert">The advisory library could not be loaded. <Button type="button" variant="secondary" onClick={() => advisories.refetch()}>Retry advisories</Button></p> : null}
          </> : null}
          <p>Current case state is preserved: {caseStateLabels[lifecycle.caseState]}.</p>
        </div> : null}
        {action === "close" ? <div className="review-subform">
          <p>Confirming this review will close the case.</p>
          <label className="case-confirmation"><input type="checkbox" checked={closedConfirmed} onChange={(event) => { setClosedConfirmed(event.target.checked); changed(); }} /><span>Close this case</span></label>{error("close")}
        </div> : null}
        <TextArea label={action === "support" && support === "technical" ? "Technical Assistance details / Review notes" : "Review notes"}
          hint="Record treatment, pesticide, medicine, technical assistance, or other action details when applicable."
          placeholder="Describe the intervention or other action used, if applicable..."
          value={notes} rows={4} maxLength={1000} aria-invalid={submitted && !!errors.notes}
          aria-describedby={submitted && errors.notes ? "review-error-notes" : undefined}
          onChange={(event) => { setNotes(event.target.value); changed(); }} />{error("notes")}
        <p className="review-note-count">{notes.length}/1,000</p>
      </fieldset>
    </section>

    <section className="review-card decision-summary" aria-labelledby="review-summary-heading">
      <h2 id="review-summary-heading">Review Summary</h2>
      <dl className="decision-summary__grid">
        <DetailField label="Possible Condition">{diseaseLabels[report.predictedDisease]?.replace(/^Possible Condition:\s*/, "") ?? report.predictedDisease}</DetailField>
        <DetailField label="Staff-Classified Condition">{classification ? authorityClassifiedConditionLabels[classification] : "Not classified"}</DetailField>
        <DetailField label="Verification">{verificationOutcomeLabels[verification]}</DetailField>
        <DetailField label="Next Action">{actions.find((item) => item.value === action)?.label ?? "Pending decision"}</DetailField>
        {action === "support" ? <DetailField label="Support type">{support === "advisory" ? "Advisory Guidance" : "Technical Assistance"}</DetailField> : null}
        {action === "support" && support === "advisory" ? <DetailField label="Selected advisory">{selectedAdvisory ? `${selectedAdvisory.code} - ${selectedAdvisory.title}` : "Not selected"}</DetailField> : null}
        {fieldSelected ? <DetailField label="Field Inspector">{selectedInspector?.name ?? "Not selected"}{targetDate ? ` · ${targetDate}` : ""}</DetailField> : null}
        <DetailField label="Resulting case state">{caseStateLabels[resultingState]}</DetailField>
        <DetailField label="Notes">{notes.trim() ? "Included" : "None"}</DetailField>
      </dl>
      {!online ? (
        <div className="review-offline" role="alert">
          <p>Not saved. CaneGuard is offline, so this review cannot be confirmed. Your draft stays in this tab and is not queued to send later.</p>
        </div>
      ) : null}
      {online && offlineResumed && dirty ? (
        <div className="review-offline review-offline--resumed" role="status">
          <p>You are back online. Check the latest evidence before confirming; nothing was sent while you were offline.</p>
        </div>
      ) : null}
      {conflict ? <ReviewConflictPanel
        latest={conflictLatest}
        draft={draftReviewSnapshot({ classification, verification, action, support, advisoryUuid, notes, inspectorUuid, targetDate })}
        inspectorNames={Object.fromEntries((inspectors.data ?? []).map((item) => [item.uuid, item.name]))}
        advisoryNames={Object.fromEntries(validated.map((item) => [item.uuid, `${item.code} - ${item.title}`]))}
        loading={conflictLoading}
        error={conflictError}
        onLoadLatest={() => void loadLatestVersion()}
        onApply={applyConflictChoices}
        onReloadAll={() => applyConflictChoices({
          classification: "latest", verification: "latest", action: "latest",
          notes: "latest", inspector: "latest", targetDate: "latest",
        })}
      /> : null}
      {apiError && !conflict ? <div role="alert" className="form-error">{apiError.status === 429 ? "Too many review attempts were received. Wait a moment before trying again." : apiError.status === 403 ? "Your account no longer has permission to review this report." : apiError.status === 422 ? Object.values(apiError.errors ?? {}).flat().join(" ") || "The server rejected this review. Check the selected action and notes before trying again." : "The review service is unavailable. No review change was confirmed."}</div> : null}
      {mutation.error instanceof ZodError ? <p role="alert" className="form-error">The server returned an unexpected response. Refresh the report before trying again.</p> : mutation.isError && !apiError ? <p role="alert" className="form-error">The review service is unavailable. No review change was confirmed.</p> : null}
      <Button type="submit" disabled={!online || mutation.isPending || conflict || saved || expectedVersion === undefined}>{mutation.isPending ? "Confirming review..." : "Confirm Review"}</Button>
      {saved ? <div className="review-save-success" role="status"><p>{report.referenceCode} — Review confirmed.</p>
        <Button type="button" variant="secondary" disabled={nextPending} onClick={() => void reviewNext()}>Review Next Case</Button>
        <Link to={returnTo}>Return to Queue</Link>
      </div> : null}
      {nextMessage ? <p role="status">{nextMessage}</p> : null}
    </section>
  </form>;
}
