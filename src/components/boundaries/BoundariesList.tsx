import { RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { routes } from "../../app/routes";
import type { FieldSurveyBoundariesData, FieldSurveyBoundaryFeature } from "../../domain/fieldSurvey.types";
import { Button } from "../ui/Button";
import { formatAreaHectares, formatDateTime, formatMeasuredArea } from "../../lib/formatters";
import { createReturnContext, withReturnContext, type MapReturnContext } from "../navigation/mapNavigationContext";
import { FIELD_MAP_STATUS_LABEL, fieldMapName, fieldMapStatus, isAffectedAreaMeasured, percentAffected, primaryCase } from "./fieldMapStatus";

function boundaryLabel(feature: FieldSurveyBoundaryFeature) {
  return `boundary ${feature.properties.id} captured ${formatDateTime(feature.properties.capturedAt)} by ${feature.properties.inspector.name}`;
}

export function BoundariesList({
  data,
  selectedBoundaryId,
  onSelect,
  isFetching = false,
  onRefresh,
  loadedCount,
  filtered = false,
  returnContext,
}: {
  data: FieldSurveyBoundariesData;
  selectedBoundaryId: string | null;
  onSelect: (boundaryId: string) => void;
  isFetching?: boolean;
  onRefresh?: () => void;
  /** Maps loaded before filters; the truncation note counts these. */
  loadedCount?: number;
  /** True when the filters are hiding some of the loaded maps. */
  filtered?: boolean;
  returnContext?: MapReturnContext;
}) {
  const shown = loadedCount ?? data.features.length;
  const selectedOutsidePage = selectedBoundaryId !== null
    && !data.features.some((feature) => String(feature.properties.id) === selectedBoundaryId);
  const linkState = withReturnContext(
    returnContext ?? createReturnContext(`${routes.monitoring}?view=boundaries`, "Field maps"),
  );

  return (
    <section className="field-validation-table-card boundaries-list-card" aria-labelledby="boundaries-list-heading">
      <div className="workspace-heading boundaries-list__heading">
        <h2 id="boundaries-list-heading">Field map records</h2>
        <div className="boundaries-list__heading-actions">
          <span>{data.features.length} shown</span>
          {onRefresh ? (
            <Button
              variant="secondary"
              className="boundaries-list__refresh"
              icon={<RefreshCw aria-hidden="true" className={isFetching ? "spin" : undefined} />}
              disabled={isFetching}
              onClick={onRefresh}
            >
              {isFetching ? "Refreshing field maps" : "Refresh field maps"}
            </Button>
          ) : null}
        </div>
      </div>
      {data.metadata.truncated ? (
        <p className="boundaries-list__truncated" role="status">
          {data.metadata.totalCount > shown
            ? `Showing the newest ${shown} of ${data.metadata.totalCount} field maps. ${selectedOutsidePage ? "The selected map is also shown; the rest are not." : "The rest are not on this map."}`
            : `Showing the newest ${shown} field maps. ${selectedOutsidePage ? "The selected map is also shown; more exist beyond this view." : "More exist beyond this view."}`}
        </p>
      ) : null}
      {data.features.length === 0 ? (
        <p className="field-validation-table-card__empty">
          {filtered ? "No field maps match these filters." : "No field maps recorded yet."}
        </p>
      ) : (
        <div className="boundaries-list__scroll">
          <table className="field-validation-table boundaries-list__table">
            <thead>
              <tr>
                <th scope="col">Map</th>
                <th scope="col">Case</th>
                <th scope="col" aria-label="Area, device-reported">
                  Area
                  <span className="boundaries-list__source">device-reported</span>
                </th>
                <th scope="col">% affected</th>
                <th scope="col">Inspector</th>
                <th scope="col"><span className="sr-only">Map action</span></th>
              </tr>
            </thead>
            <tbody>
              {data.features.map((feature) => {
                const id = String(feature.properties.id);
                const label = boundaryLabel(feature);
                const selected = selectedBoundaryId === id;
                const status = fieldMapStatus(feature);
                const linkedCase = primaryCase(feature);
                const affectedMeasured = isAffectedAreaMeasured(
                  feature.properties.affectedAreaSqm,
                  feature.properties.affectedAreaMeasurement,
                );
                const affected = percentAffected(
                  feature.properties.areaSqm,
                  feature.properties.affectedAreaSqm,
                  feature.properties.affectedAreaMeasurement,
                );
                const affectedAreaLabel = affectedMeasured
                  ? formatMeasuredArea(feature.properties.affectedAreaSqm! / 10_000, "measured")
                  : null;
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
                        {fieldMapName(feature)}
                      </button>
                      <time className="boundaries-list__source" dateTime={feature.properties.capturedAt}>
                        {formatDateTime(feature.properties.capturedAt)}
                      </time>
                    </td>
                    <td>
                      <span className={`boundaries-list__status boundaries-list__status--${status}`}>
                        {FIELD_MAP_STATUS_LABEL[status]}
                      </span>
                      {linkedCase ? (
                        <Link className="table-action" to={routes.reportDetail(linkedCase.uuid)} state={linkState}>
                          Open {linkedCase.referenceCode}
                        </Link>
                      ) : null}
                    </td>
                    <td>{formatAreaHectares(feature.properties.areaSqm / 10_000)}</td>
                    <td>
                      {affected === null
                        ? "Not measured"
                        : affectedAreaLabel
                          ? `${affectedAreaLabel} · ${affected}%`
                          : `${affected}%`}
                    </td>
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
