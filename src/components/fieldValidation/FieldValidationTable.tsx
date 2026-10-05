import { Link } from "react-router";
import type { FieldValidationMapFeature } from "../../domain/fieldValidation.types";
import { diseaseLabels, reviewStatusLabels } from "../../domain/report.metadata";
import { routes } from "../../app/routes";
import { formatValidationDate } from "./fieldValidation.format";

export function FieldValidationTable({
  features,
}: {
  features: FieldValidationMapFeature[];
}) {
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
                <th scope="col">Report</th>
                <th scope="col">Location</th>
                <th scope="col">Possible Condition</th>
                <th scope="col">Review state</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature) => {
                const properties = feature.properties;
                const lat = feature.geometry.coordinates[1].toFixed(4);
                const lng = feature.geometry.coordinates[0].toFixed(4);
                return (
                  <tr key={feature.id}>
                    <td>
                      <strong className="table-primary">{properties.referenceCode}</strong>
                      <span className="table-secondary">{formatValidationDate(properties.observedAt)}</span>
                    </td>
                    <td>
                      <strong className="table-primary">{properties.barangay}</strong>
                      <span className="table-secondary machine-text">{lat}, {lng}</span>
                      {(properties.locationGroupSize ?? 1) > 1 ? <span className="table-secondary">{properties.locationGroupSize} at this location</span> : null}
                    </td>
                    <td>
                      <span className="table-primary">{diseaseLabels[properties.predictedDisease]}</span>
                    </td>
                    <td>
                      <span className="table-primary">{reviewStatusLabels[properties.reviewStatus]}</span>
                    </td>
                    <td className="field-validation-table__action-cell">
                      <Link className="table-action" to={routes.reportDetail(properties.uuid)}>
                        Open Report
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
