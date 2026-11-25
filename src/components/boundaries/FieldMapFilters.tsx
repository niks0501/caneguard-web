import { Button } from "../ui/Button";
import {
  FIELD_MAP_PERIOD_LABEL,
  FIELD_MAP_STATUS_LABEL,
  fieldMapFiltersActive,
  NO_FIELD_MAP_FILTERS,
  type FieldMapFilters as Filters,
  type FieldMapPeriod,
  type FieldMapStatus,
} from "./fieldMapStatus";

/** Narrows the loaded field maps. It never refetches, so the counts say how many of the loaded maps match. */
export function FieldMapFilters({
  filters,
  inspectors,
  shown,
  loaded,
  onChange,
}: {
  filters: Filters;
  inspectors: Array<{ uuid: string; name: string }>;
  shown: number;
  loaded: number;
  onChange: (next: Filters) => void;
}) {
  return (
    <form className="field-map-filters" role="search" aria-label="Filter field maps" onSubmit={(event) => event.preventDefault()}>
      <label>
        <span>Inspector</span>
        <select value={filters.inspector} onChange={(event) => onChange({ ...filters, inspector: event.target.value })}>
          <option value="all">All inspectors</option>
          {inspectors.map((inspector) => (
            <option key={inspector.uuid} value={inspector.uuid}>{inspector.name}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Status</span>
        <select value={filters.status} onChange={(event) => onChange({ ...filters, status: event.target.value as FieldMapStatus | "all" })}>
          <option value="all">All statuses</option>
          {(Object.keys(FIELD_MAP_STATUS_LABEL) as FieldMapStatus[]).map((status) => (
            <option key={status} value={status}>{FIELD_MAP_STATUS_LABEL[status]}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Measured</span>
        <select value={filters.period} onChange={(event) => onChange({ ...filters, period: event.target.value as FieldMapPeriod })}>
          {(Object.keys(FIELD_MAP_PERIOD_LABEL) as FieldMapPeriod[]).map((period) => (
            <option key={period} value={period}>{FIELD_MAP_PERIOD_LABEL[period]}</option>
          ))}
        </select>
      </label>
      {fieldMapFiltersActive(filters) ? (
        <Button type="button" variant="quiet" onClick={() => onChange(NO_FIELD_MAP_FILTERS)}>Clear filters</Button>
      ) : null}
      <span className="field-map-filters__count" role="status">
        {fieldMapFiltersActive(filters) ? `${shown} of ${loaded} loaded maps` : `${loaded} loaded ${loaded === 1 ? "map" : "maps"}`}
      </span>
    </form>
  );
}
