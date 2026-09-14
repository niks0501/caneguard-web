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
          <p className="eyebrow">Accessible fallback</p>
          <h2 id="location-table-heading">Located observations</h2>
        </div>
        <span>{features.length} rows</span>
      </div>
      {features.length === 0 ? (
        <p className="field-validation-table-card__empty">No located observations match the applied filters.</p>
      ) : (
        <div className="table-scroll">
          <table className="report-table field-validation-table">
            <thead>
              <tr>
                <th scope="col">Reference</th>
                <th scope="col">Observed</th>
                <th scope="col">Barangay</th>
                <th scope="col">Possible Condition</th>
                <th scope="col">Review state</th>
                <th scope="col">Coordinates</th>
                <th scope="col"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature) => {
                const properties = feature.properties;
                return (
                  <tr key={feature.id}>
                    <td><strong>{properties.referenceCode}</strong></td>
                    <td>{formatValidationDate(properties.observedAt)}</td>
                    <td>{properties.barangay}</td>
                    <td>{diseaseLabels[properties.predictedDisease]}</td>
                    <td>{reviewStatusLabels[properties.reviewStatus]}</td>
                    <td>{feature.geometry.coordinates[1].toFixed(5)}, {feature.geometry.coordinates[0].toFixed(5)}</td>
                    <td>
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
