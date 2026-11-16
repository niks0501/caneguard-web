import { formatCalendarDate } from "../../lib/formatters";
import { useState } from "react";
import { CalendarClock, Check, MapPin, X } from "lucide-react";
import { Link } from "react-router";
import { routes } from "../../app/routes";
import {
  deriveReasonForVisit,
  hasUsableReportLocation,
  relativeVisitTiming,
  type FieldWorkloadAssignee,
  type FieldWorkloadItem,
} from "../../domain/fieldOperations";
import { predictedDiseaseLabel } from "../../domain/report.metadata";
import { useUpdateReportReview } from "../../hooks/useReports";
import { Button } from "../ui/Button";
import { useUnsavedWorkGuard } from "../ui/unsavedWorkContext";
import { formatValidationDate } from "./fieldValidation.format";
import { InspectorEligibilityHelp } from "./InspectorEligibilityHelp";
import { saveErrorMessage } from "./fieldOperationsSave";

/**
 * Focused Assign / Edit Visit editor. Only the selected visit exposes mutation
 * controls, and a failed save keeps the reviewer's draft instead of discarding
 * it silently.
 */
export function FieldOperationsEditor({
  item,
  reporters,
  reportersLoaded = true,
  officeDate,
  onClose,
  onSaved,
}: {
  item: FieldWorkloadItem;
  reporters: FieldWorkloadAssignee[];
  reportersLoaded?: boolean;
  officeDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const currentAssigneeUuid = item.assignee?.uuid ?? "";
  const currentTargetDate = item.targetVisitDate ?? "";
  const [assigneeUuid, setAssigneeUuid] = useState(currentAssigneeUuid);
  const [targetDate, setTargetDate] = useState(currentTargetDate);
  const [saved, setSaved] = useState(false);
  const mutation = useUpdateReportReview(item.uuid);

  const hasChanges = assigneeUuid !== currentAssigneeUuid || targetDate !== currentTargetDate;
  const unsavedChanges = hasChanges && !saved;
  // Closing or switching visits is a URL navigation, so the shared unsaved-work
  // guard owns the single Stay / Discard prompt (never two prompts).
  useUnsavedWorkGuard(unsavedChanges);
  const hasLocation = hasUsableReportLocation(item);
  const reason = deriveReasonForVisit(item);
  const timing = relativeVisitTiming(item.targetVisitDate, officeDate);

  const save = async () => {
    if (!assigneeUuid) return;
    setSaved(false);
    try {
      await mutation.mutateAsync({
        fieldValidationState: "assigned",
        fieldValidationAssigneeUuid: assigneeUuid,
        fieldValidationTargetDate: targetDate || null,
        expectedVersion: item.reviewVersion ?? 0,
      });
      setSaved(true);
      onSaved();
    } catch {
      // The error is rendered inline; the draft stays in local state.
    }
  };

  return (
    <aside className="field-operations-editor" aria-labelledby="field-operations-editor-heading">
      <div className="field-operations-editor__heading">
        <div>
          <p className="eyebrow">{item.referenceCode}</p>
          <h2 id="field-operations-editor-heading">Assign / Edit Visit</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close visit editor">
          <X aria-hidden="true" />
        </button>
      </div>

      <dl className="field-operations-editor__facts">
        <div><dt>Location</dt><dd>{item.farmReference || item.barangay}</dd></div>
        <div><dt>Possible Condition</dt><dd>{predictedDiseaseLabel(item.predictedDisease)}</dd></div>
        {reason ? <div><dt>Reason for Visit</dt><dd>{reason}</dd></div> : null}
        <div><dt>Observed</dt><dd>{formatValidationDate(item.observedAt)}</dd></div>
        <div><dt>Visit by</dt><dd>{item.targetVisitDate ? formatCalendarDate(item.targetVisitDate) : "Not scheduled"}</dd></div>
        {timing ? <div><dt>Visit timing</dt><dd>{timing}</dd></div> : null}
      </dl>

      <form
        className="field-operations-editor__form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="select-filter">
          <span>Inspector</span>
          <select
            value={assigneeUuid}
            aria-describedby="field-operations-inspector-help"
            onChange={(event) => { setAssigneeUuid(event.target.value); setSaved(false); }}
          >
            <option value="">Select an Inspector</option>
            {reporters.map((reporter) => (
              <option value={reporter.uuid} key={reporter.uuid}>{reporter.name}</option>
            ))}
          </select>
        </label>
        <InspectorEligibilityHelp id="field-operations-inspector-help" loaded={reportersLoaded} empty={reporters.length === 0} />
        <label className="select-filter">
          <span>Target visit date</span>
          <input
            type="date"
            value={targetDate}
            onChange={(event) => { setTargetDate(event.target.value); setSaved(false); }}
          />
        </label>
        <div className="field-operations-editor__actions">
          <Button
            type="submit"
            variant="primary"
            icon={saved ? <Check aria-hidden="true" /> : <CalendarClock aria-hidden="true" />}
            disabled={!assigneeUuid || !hasChanges || mutation.isPending}
          >
            {mutation.isPending ? "Saving visit" : saved ? "Visit saved" : currentAssigneeUuid ? "Update visit" : "Assign visit"}
          </Button>
          <Link className="button button--quiet" to={routes.reportDetail(item.uuid)}>Open Case</Link>
          {hasLocation ? (
            <Link className="button button--quiet" to={`/monitoring?view=map&report=${encodeURIComponent(item.uuid)}`}>
              <MapPin aria-hidden="true" />View on Map
            </Link>
          ) : (
            <span className="field-operations-editor__no-location">
              No usable report location is available for this case.
            </span>
          )}
        </div>
      </form>

      {mutation.isError ? <p className="form-error" role="alert">{saveErrorMessage(mutation.error)}</p> : null}
      {saved ? <p className="field-operations-editor__saved" role="status">Assignment saved to the authoritative review record.</p> : null}
    </aside>
  );
}
