import { useId, useMemo, useRef, useState } from "react";
import { formatCalendarDate } from "../../lib/formatters";
import {
  countInspectorVisits,
  type FieldWorkloadItem,
} from "../../domain/fieldOperations";
import { useUpdateReportReview } from "../../hooks/useReports";
import { useFieldReporters } from "../../hooks/useFieldReporters";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { InspectorEligibilityHelp } from "./InspectorEligibilityHelp";
import { saveErrorMessage } from "./fieldOperationsSave";

/**
 * Send someone / Reassign as a drawer over the To do lists, so assigning never
 * costs the reviewer their place. Counts come from the workload the page has
 * already read; a bounded read that stopped early is worded "At least".
 */
export function SendSomeoneDrawer({
  item,
  workload,
  truncated,
  officeDate,
  onClose,
  onSaved,
}: {
  item: FieldWorkloadItem;
  workload: readonly FieldWorkloadItem[];
  truncated: boolean;
  officeDate: string;
  onClose: () => void;
  onSaved: (assigneeName: string) => void;
}) {
  const reporters = useFieldReporters();
  const mutation = useUpdateReportReview(item.uuid);
  const helpId = useId();
  // Inspectors load after the drawer opens, so focus starts on their group, not on the date.
  const inspectorsRef = useRef<HTMLFieldSetElement>(null);
  const currentAssigneeUuid = item.assignee?.uuid ?? "";
  const currentTargetDate = item.targetVisitDate ?? "";
  const [assigneeUuid, setAssigneeUuid] = useState(currentAssigneeUuid);
  const [targetDate, setTargetDate] = useState(currentTargetDate);
  const counts = useMemo(() => countInspectorVisits(workload, officeDate), [workload, officeDate]);
  const inspectors = reporters.data ?? [];
  const hasChanges = assigneeUuid !== currentAssigneeUuid || targetDate !== currentTargetDate;
  const reassigning = Boolean(item.assignee);
  const verb = reassigning ? "Reassign" : "Send someone";

  const save = async () => {
    const chosen = inspectors.find((inspector) => inspector.uuid === assigneeUuid);
    if (!chosen) return;
    try {
      await mutation.mutateAsync({
        fieldValidationState: "assigned",
        fieldValidationAssigneeUuid: assigneeUuid,
        fieldValidationTargetDate: targetDate || null,
        expectedVersion: item.reviewVersion ?? 0,
      });
      onSaved(chosen.name);
    } catch {
      // The error is rendered inline; the draft stays in local state.
    }
  };

  return (
    <Modal
      id="send-someone-drawer"
      className="send-drawer"
      open
      initialFocusRef={inspectorsRef}
      title={verb}
      description={`${item.referenceCode} · ${item.farmReference || item.barangay}`}
      onClose={onClose}
      isDirty={hasChanges && !mutation.isPending}
      disabled={mutation.isPending}
      footer={(
        <>
          <Button type="button" variant="quiet" onClick={onClose} disabled={mutation.isPending}>Cancel</Button>
          <Button
            type="submit"
            form="send-someone-form"
            variant="primary"
            disabled={!assigneeUuid || !hasChanges || mutation.isPending}
          >
            {mutation.isPending ? "Saving visit" : reassigning ? "Reassign visit" : "Send visit"}
          </Button>
        </>
      )}
    >
      <form
        id="send-someone-form"
        className="send-drawer__form"
        onSubmit={(event) => { event.preventDefault(); void save(); }}
      >
        {item.assignee ? (
          <p className="send-drawer__current">
            Now with {item.assignee.name}
            {item.targetVisitDate ? `, visit by ${formatCalendarDate(item.targetVisitDate)}` : ", not scheduled"}
          </p>
        ) : null}
        <fieldset className="send-drawer__inspectors" aria-describedby={helpId} ref={inspectorsRef} tabIndex={-1}>
          <legend>Inspector</legend>
          {reporters.isPending ? <p className="send-drawer__note">Loading inspectors...</p> : null}
          {reporters.isError && !reporters.data
            ? <p className="queue-refresh-warning" role="alert">Eligible Field Inspectors could not be loaded. Sending someone is unavailable until the list loads.</p>
            : null}
          {inspectors.map((inspector) => {
            const own = counts.get(inspector.uuid) ?? { open: 0, late: 0 };
            return (
              <label key={inspector.uuid} className={`send-drawer__inspector${assigneeUuid === inspector.uuid ? " is-selected" : ""}`}>
                <input
                  type="radio"
                  name="send-someone-inspector"
                  value={inspector.uuid}
                  checked={assigneeUuid === inspector.uuid}
                  onChange={() => setAssigneeUuid(inspector.uuid)}
                />
                <span className="send-drawer__name">{inspector.name}</span>
                <span className="send-drawer__counts">
                  {truncated ? "At least " : ""}{own.open} open,{" "}
                  <span className={own.late > 0 ? "send-drawer__late" : undefined}>{own.late} late</span>
                </span>
              </label>
            );
          })}
        </fieldset>
        <InspectorEligibilityHelp id={helpId} loaded={reporters.isSuccess} empty={inspectors.length === 0} />
        <label className="select-filter">
          <span>Target visit date</span>
          <input type="date" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
        </label>
        {mutation.isError ? <p className="form-error" role="alert">{saveErrorMessage(mutation.error)}</p> : null}
      </form>
    </Modal>
  );
}
