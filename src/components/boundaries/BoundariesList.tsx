import type { FieldSurveyBoundariesData, FieldSurveyBoundaryFeature } from "../../domain/fieldSurvey.types";
import { formatAreaSqm, formatDateTime } from "../../lib/formatters";

function boundaryLabel(feature: FieldSurveyBoundaryFeature) {
  return `boundary ${feature.properties.id} captured ${formatDateTime(feature.properties.capturedAt)} by ${feature.properties.inspector.name}`;
}

export function BoundariesList({
  data,
  selectedBoundaryId,
  onSelect,
}: {
  data: FieldSurveyBoundariesData;
  selectedBoundaryId: string | null;
  onSelect: (boundaryId: string) => void;
}) {
  return (
    <section className="field-validation-table-card boundaries-list-card" aria-labelledby="boundaries-list-heading">
      <div className="workspace-heading boundaries-list__heading">
        <div>
          <h2 id="boundaries-list-heading">Boundary records</h2>
        </div>
        <span>{data.metadata.returnedCount} shown</span>
      </div>
      {data.metadata.truncated ? (
        <p className="boundaries-list__truncated" role="status">
          Showing the newest {data.metadata.returnedCount} of {data.metadata.totalCount} boundaries. The rest are not on this map.
        </p>
      ) : null}
      {data.features.length === 0 ? (
        <p className="field-validation-table-card__empty">No field boundaries recorded yet.</p>
      ) : (
        <div className="boundaries-list__scroll">
          <table className="field-validation-table boundaries-list__table">
            <thead>
              <tr>
                <th scope="col">Captured</th>
                <th scope="col" aria-label="Area, device-reported">
                  Area
                  <span className="boundaries-list__source">device-reported</span>
                </th>
                <th scope="col">Inspector</th>
                <th scope="col"><span className="sr-only">Map action</span></th>
              </tr>
            </thead>
            <tbody>
              {data.features.map((feature) => {
                const id = String(feature.properties.id);
                const label = boundaryLabel(feature);
                const selected = selectedBoundaryId === id;
                return (
                  <tr key={id} className={selected ? "is-selected" : undefined}>
                    <td>
                      <button
                        type="button"
                        className="boundaries-list__select"
                        aria-pressed={selected}
                        aria-label={`${selected ? "Selected" : "Show"} ${label} on map`}
                        onClick={() => onSelect(id)}
                      >
                        <time dateTime={feature.properties.capturedAt}>{formatDateTime(feature.properties.capturedAt)}</time>
                      </button>
                    </td>
                    <td>{formatAreaSqm(feature.properties.areaSqm)}</td>
                    <td>{feature.properties.inspector.name}</td>
                    <td className="field-validation-table__action-cell">
                      <button
                        type="button"
                        className="table-action boundaries-list__action"
                        aria-label={`Show on map: ${label}`}
                        onClick={() => onSelect(id)}
                      >
                        Show on map
                      </button>
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
