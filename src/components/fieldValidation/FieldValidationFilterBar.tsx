import { useState } from "react";
import type { FormEvent } from "react";
import { Check, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "../ui/Button";
import { SelectFilter } from "../ui/FormControls";
import { diseaseLabels, reviewStatusLabels } from "../../domain/report.metadata";
import { knownBarangays } from "../../domain/locationScope";
import type { FieldValidationFilters } from "../../domain/fieldValidation.types";
import type { DiseaseKey, ReviewStatus } from "../../domain/report.types";

interface FieldValidationFilterBarProps {
  applied: FieldValidationFilters;
  onApply: (filters: FieldValidationFilters) => void;
  onClear: () => void;
}

/**
 * Reduced primary Map filters (Barangay, Case Status, Date Observed) with less
 * frequent filters behind a secondary More Filters control.
 */
export function FieldValidationFilterBar({
  applied,
  onApply,
  onClear,
}: FieldValidationFilterBarProps) {
  const [draft, setDraft] = useState<FieldValidationFilters>(applied);
  const update = (changes: Partial<FieldValidationFilters>) =>
    setDraft((current) => ({ ...current, ...changes }));
  const isDirty = JSON.stringify(draft) !== JSON.stringify(applied);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onApply({
      ...draft,
      queue: applied.queue,
    });
  };

  return (
    <form className="field-validation-filter-bar" onSubmit={submit}>
      <label className="select-filter">
        <span>Barangay</span>
        <input
          type="text"
          list="known-barangays"
          value={draft.barangay ?? ""}
          maxLength={120}
          placeholder="All barangays"
          onChange={(event) => update({ barangay: event.target.value || undefined })}
        />
        <datalist id="known-barangays">
          {knownBarangays.map((barangay) => <option value={barangay} key={barangay} />)}
        </datalist>
      </label>
      <SelectFilter
        label="Case Status"
        value={draft.status ?? ""}
        onChange={(event) =>
          update({ status: (event.target.value || undefined) as ReviewStatus | undefined })
        }
      >
        <option value="">Active cases (resolved hidden)</option>
        {Object.entries(reviewStatusLabels).map(([value, label]) => (
          <option value={value} key={value}>{label}</option>
        ))}
      </SelectFilter>
      <label className="select-filter">
        <span>Date Observed from</span>
        <input
          type="date"
          value={draft.dateFrom ?? ""}
          max={draft.dateTo}
          onChange={(event) => update({ dateFrom: event.target.value || undefined })}
        />
      </label>
      <label className="select-filter">
        <span>Date Observed to</span>
        <input
          type="date"
          value={draft.dateTo ?? ""}
          min={draft.dateFrom}
          onChange={(event) => update({ dateTo: event.target.value || undefined })}
        />
      </label>

      <details className="field-validation-filter-bar__more">
        <summary>
          <SlidersHorizontal aria-hidden="true" />
          More Filters
        </summary>
        <div className="field-validation-filter-bar__more-body">
          <SelectFilter
            label="Possible Condition"
            value={draft.disease ?? ""}
            onChange={(event) =>
              update({ disease: (event.target.value || undefined) as DiseaseKey | undefined })
            }
          >
            <option value="">All Possible Conditions</option>
            {Object.entries(diseaseLabels).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </SelectFilter>
        </div>
      </details>

      <div className="field-validation-filter-bar__actions">
        <Button type="submit" icon={<Check aria-hidden="true" />} disabled={!isDirty}>
          Apply filters
        </Button>
        <Button
          type="button"
          variant="quiet"
          icon={<RotateCcw aria-hidden="true" />}
          disabled={!isDirty && !Object.keys(applied).length}
          onClick={onClear}
        >
          Clear
        </Button>
      </div>
    </form>
  );
}
