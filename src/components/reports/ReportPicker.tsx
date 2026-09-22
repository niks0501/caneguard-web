import { useEffect, useId, useState } from "react";
import { diseaseLabels } from "../../domain/report.metadata";
import type { DiseaseReport } from "../../domain/report.types";
import { useReports } from "../../hooks/useReports";
import { formatDate } from "../../lib/formatters";
import { Button } from "../ui/Button";
import { buildReportPickerLabel } from "./reportPickerLabel";

export interface ReportPickerSelection {
  uuid: string;
  label: string;
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

interface ReportPickerProps {
  excludeUuid?: string;
  value: ReportPickerSelection | null;
  onSelect: (selection: ReportPickerSelection | null) => void;
  disabled?: boolean;
}

function contactName(report: DiseaseReport): string {
  return report.farmerOrFarmOwnerName?.trim() || report.submittedByName;
}

/**
 * Searchable case picker for duplicate linking. The link target is chosen by
 * selecting a case from the register (reference code, farmer/farm, barangay,
 * or reporter name); the UUID never appears as the primary label.
 */
export function ReportPicker({ excludeUuid, value, onSelect, disabled = false }: ReportPickerProps) {
  const inputId = useId();
  const listboxId = useId();
  const [search, setSearch] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debouncedSearch = useDebouncedValue(search, 250);

  const pickerQuery = useReports({
    search: debouncedSearch.trim() || undefined,
    perPage: 8,
  });
  const results = (pickerQuery.data?.reports ?? []).filter(
    (report) => report.uuid !== excludeUuid,
  );
  const searching = pickerQuery.isPending || pickerQuery.isFetching;

  const safeActiveIndex =
    activeIndex >= 0 && activeIndex < results.length ? activeIndex : -1;

  const selectReport = (report: DiseaseReport) => {
    onSelect({ uuid: report.uuid, label: buildReportPickerLabel(report) });
    setSearch("");
    setListOpen(false);
    setActiveIndex(-1);
  };

  const clearSelection = () => {
    onSelect(null);
  };

  const activeId =
    listOpen && safeActiveIndex >= 0
      ? `report-picker-option-${results[safeActiveIndex].uuid}`
      : undefined;

  return (
    <div
      className="report-picker"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setListOpen(false);
        }
      }}
    >
      <label className="select-filter" htmlFor={inputId}>
        <span>Search cases</span>
        <input
          id={inputId}
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={results.length > 0 && listOpen ? listboxId : undefined}
          aria-activedescendant={activeId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={search}
          placeholder="Type a reference code, farmer, barangay, or reporter…"
          onChange={(event) => {
            setSearch(event.target.value);
            setListOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setListOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setListOpen(true);
              setActiveIndex((previous) =>
                results.length === 0 ? -1 : (previous + 1) % results.length,
              );
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setListOpen(true);
              setActiveIndex((previous) =>
                results.length === 0
                  ? -1
                  : (previous - 1 + results.length) % results.length,
              );
            } else if (event.key === "Enter") {
              if (listOpen && safeActiveIndex >= 0) {
                event.preventDefault();
                selectReport(results[safeActiveIndex]);
              }
            } else if (event.key === "Escape") {
              if (listOpen) {
                event.preventDefault();
                event.stopPropagation();
                setListOpen(false);
                setActiveIndex(-1);
              }
            }
          }}
        />
      </label>
      {value ? (
        <div className="report-picker-chip" data-testid="report-picker-selection">
          <span>
            Selected case: <strong>{value.label}</strong>
          </span>
          <span className="machine-text">{value.uuid}</span>
          <Button type="button" variant="secondary" disabled={disabled} onClick={clearSelection}>
            Clear selected case
          </Button>
        </div>
      ) : null}
      {listOpen && results.length > 0 ? (
        <ul className="report-picker-listbox" role="listbox" id={listboxId} aria-label="Matching cases">
          {results.map((report, index) => (
            <li
              key={report.uuid}
              id={`report-picker-option-${report.uuid}`}
              className="report-picker-option"
              role="option"
              aria-selected={index === safeActiveIndex}
              data-active={index === safeActiveIndex ? "true" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectReport(report)}
            >
              <strong>{report.referenceCode}</strong>
              <small>
                {contactName(report)} · Barangay {report.barangay} ·{" "}
                {formatDate(report.submittedAt)} · {diseaseLabels[report.predictedDisease]}
              </small>
            </li>
          ))}
        </ul>
      ) : null}
      {listOpen && results.length === 0 && searching ? (
        <p className="report-picker-status" role="status">
          Searching cases…
        </p>
      ) : null}
      {listOpen && results.length === 0 && !searching && pickerQuery.isError ? (
        <p className="report-picker-status" role="alert">
          Case search is unavailable. Try again or paste a case UUID instead.
        </p>
      ) : null}
      {listOpen && results.length === 0 && !searching && !pickerQuery.isError ? (
        <p className="report-picker-status" role="status">
          No cases match this search. Refine the search or paste a case UUID instead.
        </p>
      ) : null}
    </div>
  );
}
