import { ClipboardCheck, MapPinOff } from "lucide-react";
import { Link } from "react-router";
import type {
  FieldValidationQueueData,
  FieldValidationQueueItem,
} from "../../domain/fieldValidation.types";
import { diseaseLabels, reviewStatusLabels } from "../../domain/report.metadata";
import { routes } from "../../app/routes";
import { formatValidationDate } from "./fieldValidation.format";

const locationUnavailableReasonLabels: Record<string, string> = {
  permission_denied: "permission denied",
  services_unavailable: "location services unavailable",
  low_accuracy: "low accuracy",
  offline_no_map: "offline with no map",
  other: "other reason",
};

function queueItemMeta(item: FieldValidationQueueItem) {
  const affectedArea = item.affectedAreaHectares === null
    ? "Area not provided"
    : `${item.affectedAreaHectares} ha affected`;
  const affectedPortion = item.affectedPortionPercent === null
    ? "Portion not provided"
    : `${item.affectedPortionPercent}% of portion`;
  const targetDate = item.targetVisitDate
    ? `Target visit ${item.targetVisitDate}`
    : "No target date";
  return `${targetDate} · ${affectedArea} · ${affectedPortion}`;
}

function QueueItem({ item, featured = false }: { item: FieldValidationQueueItem; featured?: boolean }) {
  return (
    <article className={`validation-queue-item${featured ? " is-featured" : ""}`}>
      <div className="validation-queue-item__topline">
        <strong>{item.referenceCode}</strong>
        <span className="status-chip status-chip--field-validation">
          <ClipboardCheck aria-hidden="true" />
          <span className="status-chip__label">{reviewStatusLabels.for_field_validation}</span>
        </span>
      </div>
      <p className="validation-queue-item__place">{item.barangay}</p>
      <dl>
        <div><dt>Observed</dt><dd>{formatValidationDate(item.observedAt)}</dd></div>
        <div><dt>Possible Condition</dt><dd>{diseaseLabels[item.predictedDisease]}</dd></div>
        <div><dt>Visit details</dt><dd>{queueItemMeta(item)}</dd></div>
      </dl>
      {item.finalLatitude === null || item.finalLongitude === null ? (
        <p className="validation-queue-item__warning">
          <MapPinOff aria-hidden="true" />
          {item.locationSource === "unavailable"
            ? `Location unavailable${item.locationUnavailableReason
              ? `: ${locationUnavailableReasonLabels[item.locationUnavailableReason] ?? item.locationUnavailableReason}`
              : ""}. Use the report details or field records.`
            : "No coordinates - use the report details or field records."}
        </p>
      ) : null}
      <Link className="button button--secondary" to={routes.reportDetail(item.uuid)}>
        Open Report
      </Link>
    </article>
  );
}

export function FieldValidationQueuePanel({
  data,
}: {
  data: FieldValidationQueueData;
}) {
  const isFollowUpDue = data.queue === "follow_up_due";
  const title = isFollowUpDue ? "Follow-up due" : "Field validations needed";
  const description = isFollowUpDue
    ? "Target visit dates have passed and field validation is still incomplete."
    : "Open cases requiring field validation, including legacy visits without a target date.";

  return (
    <aside className="validation-queue-panel" aria-labelledby="field-validation-queue-heading">
      <div className="validation-queue-panel__heading">
        <div>
          <p className="eyebrow">Operational queue</p>
          <h2 id="field-validation-queue-heading">{title}</h2>
        </div>
        <div className="validation-queue-panel__heading-meta">
          <span className="queue-priority-badge">Oldest first</span>
          <strong className="validation-queue-panel__count">{data.count}</strong>
        </div>
      </div>
      <p className="validation-queue-panel__description">
        {description} The map review-state filter does not change this queue.
      </p>
      {data.oldest ? (
        <div className="validation-queue-panel__oldest">
          <p className="eyebrow">{isFollowUpDue ? "Oldest target date" : "Oldest observation"}</p>
          <QueueItem item={data.oldest} featured />
        </div>
      ) : (
        <div className="validation-queue-panel__empty">
          <ClipboardCheck aria-hidden="true" />
          <strong>No field validations match</strong>
          <p>Try clearing the date, result, or barangay filters.</p>
        </div>
      )}
      {data.items.length > 1 ? (
        <div className="validation-queue-panel__list">
          <p className="eyebrow">{isFollowUpDue ? "Next overdue visits" : "Next visits"}</p>
          {data.items.slice(1).map((item) => (
            <QueueItem item={item} key={item.uuid} />
          ))}
        </div>
      ) : null}
    </aside>
  );
}
