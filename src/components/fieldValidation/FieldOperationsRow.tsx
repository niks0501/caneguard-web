import { Link } from "react-router";
import { MapPin } from "lucide-react";
import { routes } from "../../app/routes";
import { diseaseLabels } from "../../domain/report.metadata";
import { deriveReasonForVisit, hasUsableReportLocation, relativeVisitTiming, type FieldWorkloadItem } from "../../domain/fieldOperations";
import { Button } from "../ui/Button";

function placeLabel(item: FieldWorkloadItem) {
  return item.farmReference || item.barangay;
}

/**
 * A compact, read-first visit row. Assignment form controls live only in the
 * focused editor, never permanently repeated here.
 */
export function FieldOperationsRow({
  item,
  officeDate,
  selected,
  onSelect,
  isFocused,
}: {
  item: FieldWorkloadItem;
  officeDate: string;
  selected: boolean;
  onSelect: (uuid: string) => void;
  isFocused: boolean;
}) {
  const timing = relativeVisitTiming(item.targetVisitDate, officeDate);
  const reason = deriveReasonForVisit(item);
  const hasLocation = hasUsableReportLocation(item);

  return (
    <article
      className={`field-operations-row${selected ? " is-selected" : ""}${isFocused ? " is-focused" : ""}`}
      id={`field-operation-${item.uuid}`}
      aria-current={selected ? "true" : undefined}
    >
      <div className="field-operations-row__identity">
        <div>
          <strong>{item.referenceCode}</strong>
          <span>{placeLabel(item)}</span>
          <span className="table-secondary">
            {item.barangay}
            {item.municipality ? ` · ${item.municipality}` : ""}
          </span>
        </div>
      </div>
      <dl className="field-operations-row__facts">
        <div><dt>Possible Condition</dt><dd>{diseaseLabels[item.predictedDisease]}</dd></div>
        {reason ? <div><dt>Reason for Visit</dt><dd>{reason}</dd></div> : null}
        <div><dt>Assigned Inspector</dt><dd>{item.assignee?.name ?? "Unassigned"}</dd></div>
        <div><dt>Target visit</dt><dd>{item.targetVisitDate ?? "Not scheduled"}</dd></div>
        {timing ? <div><dt>Visit timing</dt><dd>{timing}</dd></div> : null}
      </dl>
      <div className="field-operations-row__actions">
        <Button
          variant={selected ? "primary" : "secondary"}
          onClick={() => onSelect(item.uuid)}
          aria-pressed={selected}
        >
          {selected ? "Editing visit" : "Assign / Edit visit"}
        </Button>
        <Link className="button button--quiet" to={routes.reportDetail(item.uuid)}>Open Case</Link>
        {hasLocation ? (
          <Link className="button button--quiet" to={`/monitoring?view=map&report=${encodeURIComponent(item.uuid)}`}>
            <MapPin aria-hidden="true" />View on Map
          </Link>
        ) : (
          <span className="field-operations-row__no-location" title="This report has no usable location.">
            No usable location
          </span>
        )}
      </div>
    </article>
  );
}
