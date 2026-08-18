import { ClipboardCheck, MapPinOff } from "lucide-react";
import { Link } from "react-router";
import type {
  FieldValidationQueueData,
  FieldValidationQueueItem,
} from "../../domain/fieldValidation.types";
import { diseaseLabels, reviewStatusLabels } from "../../domain/report.metadata";
import { routes } from "../../app/routes";
import { formatValidationDate } from "./fieldValidation.format";

function queueItemMeta(item: FieldValidationQueueItem) {
  const affectedArea = item.affectedAreaHectares === null
    ? "Area not provided"
    : `${item.affectedAreaHectares} ha affected`;
  const affectedPortion = item.affectedPortionPercent === null
    ? "Portion not provided"
    : `${item.affectedPortionPercent}% of portion`;
  return `${affectedArea} · ${affectedPortion}`;
}

function QueueItem({ item, featured = false }: { item: FieldValidationQueueItem; featured?: boolean }) {
  return (
    <article className={`validation-queue-item${featured ? " is-featured" : ""}`}>
      <div className="validation-queue-item__topline">
        <strong>{item.referenceCode}</strong>
        <span className="status-chip status-chip--field-validation">
          <ClipboardCheck aria-hidden="true" />
          {reviewStatusLabels.for_field_validation}
        </span>
      </div>
      <p className="validation-queue-item__place">{item.barangay}</p>
      <dl>
        <div><dt>Observed</dt><dd>{formatValidationDate(item.observedAt)}</dd></div>
        <div><dt>Possible result</dt><dd>{diseaseLabels[item.predictedDisease]}</dd></div>
        <div><dt>Visit details</dt><dd>{queueItemMeta(item)}</dd></div>
      </dl>
      {item.finalLatitude === null || item.finalLongitude === null ? (
        <p className="validation-queue-item__warning"><MapPinOff aria-hidden="true" /> No coordinates - use the report details or field records.</p>
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
  return (
    <aside className="validation-queue-panel" aria-labelledby="field-validation-queue-heading">
      <div className="validation-queue-panel__heading">
        <div>
          <p className="eyebrow">Operational queue</p>
          <h2 id="field-validation-queue-heading">Field validations needed</h2>
        </div>
        <div className="validation-queue-panel__heading-meta">
          <span className="queue-priority-badge">Oldest first</span>
          <strong className="validation-queue-panel__count">{data.count}</strong>
        </div>
      </div>
      <p className="validation-queue-panel__description">
        Fixed to reports awaiting field validation. The map review-state filter does not change this queue.
      </p>
      {data.oldest ? (
        <div className="validation-queue-panel__oldest">
          <p className="eyebrow">Oldest observation</p>
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
          <p className="eyebrow">Next visits</p>
          {data.items.slice(1).map((item) => (
            <QueueItem item={item} key={item.uuid} />
          ))}
        </div>
      ) : null}
    </aside>
  );
}
