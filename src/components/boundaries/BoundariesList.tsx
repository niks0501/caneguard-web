import { RefreshCw } from "lucide-react";
import type { FieldSurveyBoundariesData, FieldSurveyBoundaryFeature } from "../../domain/fieldSurvey.types";
import { Button } from "../ui/Button";
import { formatAffectedArea, formatDateTime } from "../../lib/formatters";

function boundaryLabel(feature: FieldSurveyBoundaryFeature) {
  return `boundary ${feature.properties.id} captured ${formatDateTime(feature.properties.capturedAt)} by ${feature.properties.inspector.name}`;
}

export function BoundariesList({
  data,
  selectedBoundaryId,
  onSelect,
  isFetching = false,
  onRefresh,
}: {
  data: FieldSurveyBoundariesData;
  selectedBoundaryId: string | null;
  onSelect: (boundaryId: string) => void;
  isFetching?: boolean;
  onRefresh?: () => void;
}) {
  const shown = data.features.length;
  const selectedOutsidePage = selectedBoundaryId !== null
    && !data.features.some((feature) => String(feature.properties.id) === selectedBoundaryId);

  return (
    <section className="field-validation-table-card boundaries-list-card" aria-labelledby="boundaries-list-heading">
      <div className="workspace-heading boundaries-list__heading">
        <h2 id="boundaries-list-heading">Boundary records</h2>
        <div className="boundaries-list__heading-actions">
          <span>{shown} shown</span>
          {onRefresh ? (
            <Button
              variant="secondary"
              className="boundaries-list__refresh"
              icon={<RefreshCw aria-hidden="true" className={isFetching ? "spin" : undefined} />}
              disabled={isFetching}
              onClick={onRefresh}
            >
              {isFetching ? "Refreshing boundaries" : "Refresh boundaries"}
            </Button>
          ) : null}
        </div>
      </div>
      {data.metadata.truncated ? (
        <p className="boundaries-list__truncated" role="status">
          {data.metadata.totalCount > shown
            ? `Showing the newest ${shown} of ${data.metadata.totalCount} boundaries. ${selectedOutsidePage ? "The selected boundary is also on this map; the rest are not." : "The rest are not on this map."}`
            : `Showing the newest ${shown} boundaries. ${selectedOutsidePage ? "The selected boundary is also on this map; more exist beyond this view." : "More exist beyond this view."}`}
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
                    <td>{formatAffectedArea(feature.properties.areaSqm / 10_000)}</td>
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
