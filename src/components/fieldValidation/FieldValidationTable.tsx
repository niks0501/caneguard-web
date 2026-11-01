import { useNavigate } from "react-router";
import { routes } from "../../app/routes";
import type { FieldValidationMapFeature } from "../../domain/fieldValidation.types";
import {
  QueueAffectedAreaCell,
  QueueCaseCell,
  QueueConditionCell,
  QueueLocationCell,
  QueueDisclaimer,
  QueueReviewLink,
  QueueStatusCell,
  type QueueRowView,
} from "../reports/QueueRowCells";

/**
 * The map's "Located observations" list uses the same six-column reviewer
 * queue as the registers. Coordinates stay on the case page (and in the map
 * itself); the row keeps the action that opens the case.
 */
const QUEUE_HEADERS = [
  "Case",
  "Location",
  "Possible Condition",
  "Affected Area",
  "Case Status",
  "Review",
] as const;

function toQueueRow(feature: FieldValidationMapFeature): QueueRowView {
  const properties = feature.properties;

  return {
    uuid: properties.uuid,
    referenceCode: properties.referenceCode,
    barangay: properties.barangay,
    municipality: properties.municipality,
    province: properties.province,
    farmReference: properties.farmReference,
    mismatchReported: properties.mismatchReported,
    locationUnavailable: properties.locationUnavailable,
    predictedDisease: properties.predictedDisease,
    authorityClassifiedCondition: properties.authorityClassifiedCondition,
    affectedAreaHectares: properties.affectedAreaHectares,
    affectedAreaMeasurement: properties.affectedAreaMeasurement,
    lifecycle: properties.lifecycle,
    firstReviewedAt: properties.firstReviewedAt,
    scheduledRevisit: properties.scheduledRevisit,
  };
}

export function FieldValidationTable({
  features,
}: {
  features: FieldValidationMapFeature[];
}) {
  const navigate = useNavigate();

  return (
    <section className="field-validation-table-card" aria-labelledby="location-table-heading">
      <div className="workspace-heading">
        <div>
          <h2 id="location-table-heading">Located observations</h2>
        </div>
        <span>{features.length} {features.length === 1 ? "row" : "rows"}</span>
      </div>
      {features.length === 0 ? (
        <p className="field-validation-table-card__empty">No located observations match the applied filters.</p>
      ) : (
        <div className="table-scroll">
          <table className="report-table field-validation-table">
            <thead>
              <tr>
                {QUEUE_HEADERS.map((header) => (
                  <th scope="col" key={header}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {features.map((feature) => {
                const row = toQueueRow(feature);
                return (
                  <tr
                    key={feature.id}
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        navigate(routes.reportDetail(row.uuid), {
                          state: { reviewQueue: { remainingIds: [], reviewedIds: [] } },
                        });
                      }
                    }}
                  >
                    <td>
                      <QueueCaseCell row={row} />
                    </td>
                    <td>
                      <QueueLocationCell row={row} />
                    </td>
                    <td>
                      <QueueConditionCell row={row} />
                    </td>
                    <td>
                      <QueueAffectedAreaCell row={row} />
                    </td>
                    <td>
                      <QueueStatusCell row={row} />
                    </td>
                    <td className="field-validation-table__action-cell">
                      <QueueReviewLink row={row} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {features.length > 0 ? <QueueDisclaimer /> : null}
    </section>
  );
}
