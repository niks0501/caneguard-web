export interface AppliedFilterChip {
  /** URL parameter key to remove. */
  key: string;
  label: string;
}

/**
 * Every applied filter stays visible and removable without reopening the
 * controls that set it. Clearing returns to the documented default view.
 */
export function AppliedFilterChips({
  chips,
  onRemove,
  onClear,
  label,
}: {
  chips: AppliedFilterChip[];
  onRemove: (key: string) => void;
  onClear: () => void;
  label: string;
}) {
  const headingId = `${label.toLowerCase().replaceAll(" ", "-")}-chips-heading`;
  return (
    <div className="filter-chips" role="group" aria-labelledby={headingId}>
      <span id={headingId}>Applied:</span>
      {chips.map((chip) => (
        <button type="button" className="filter-chip" key={chip.key} onClick={() => onRemove(chip.key)}>
          {chip.label}
          <span aria-hidden="true">×</span>
          <span className="sr-only">Remove {chip.label}</span>
        </button>
      ))}
      <button type="button" className="table-action" onClick={onClear}>Clear filters</button>
    </div>
  );
}
