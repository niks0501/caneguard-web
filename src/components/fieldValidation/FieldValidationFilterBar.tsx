import { useState } from "react";
import type { FormEvent } from "react";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "../ui/Button";
import { SelectFilter } from "../ui/FormControls";
import { diseaseLabels, reviewStatusLabels } from "../../domain/report.metadata";
import type { FieldValidationFilters } from "../../domain/fieldValidation.types";
import type { DiseaseKey, ReviewStatus } from "../../domain/report.types";

interface FieldValidationFilterBarProps {
  applied: FieldValidationFilters;
  onApply: (filters: FieldValidationFilters) => void;
  onClear: () => void;
}

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
    onApply(draft);
  };

  return (
    <form className="field-validation-filter-bar" onSubmit={submit}>
      <label className="select-filter">
        <span>Observation date from</span>
        <input
          type="date"
          value={draft.dateFrom ?? ""}
          max={draft.dateTo}
          onChange={(event) => update({ dateFrom: event.target.value || undefined })}
        />
      </label>
      <label className="select-filter">
        <span>Observation date to</span>
        <input
          type="date"
          value={draft.dateTo ?? ""}
          min={draft.dateFrom}
          onChange={(event) => update({ dateTo: event.target.value || undefined })}
        />
      </label>
      <SelectFilter
        label="Possible AI result"
        value={draft.disease ?? ""}
        onChange={(event) =>
          update({ disease: (event.target.value || undefined) as DiseaseKey | undefined })
        }
      >
        <option value="">All possible results</option>
        {Object.entries(diseaseLabels).map(([value, label]) => (
          <option value={value} key={value}>{label}</option>
        ))}
      </SelectFilter>
      <label className="select-filter">
        <span>Barangay</span>
        <input
          type="text"
          value={draft.barangay ?? ""}
          maxLength={120}
          placeholder="All barangays"
          onChange={(event) => update({ barangay: event.target.value || undefined })}
        />
      </label>
      <SelectFilter
        label="Map review state"
        value={draft.status ?? ""}
        onChange={(event) =>
          update({ status: (event.target.value || undefined) as ReviewStatus | undefined })
        }
      >
        <option value="">Active states (resolved hidden)</option>
        {Object.entries(reviewStatusLabels).map(([value, label]) => (
          <option value={value} key={value}>{label}</option>
        ))}
      </SelectFilter>
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
