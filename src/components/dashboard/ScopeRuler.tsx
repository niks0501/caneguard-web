import { manilaMonthAt } from "../../domain/reportingTime";
import type { ScopeMode, ScopeSelection } from "./dashboardScope";

/**
 * One scope ruler for the whole page (overhaul §3.1, §4; decision Q1):
 * This month / Last 30 days / Custom. Native form controls only. A month
 * scope that ends at today is labelled as such here, so the ruler itself
 * carries the month-to-date character instead of a prose note.
 */
export function ScopeRuler({
  selection,
  onChange,
}: {
  selection: ScopeSelection;
  onChange: (selection: ScopeSelection) => void;
}) {
  const set = (patch: Partial<ScopeSelection>) =>
    onChange({ ...selection, ...patch });
  const modes: Array<{ mode: ScopeMode; label: string }> = [
    {
      mode: "month",
      label:
        selection.month === manilaMonthAt()
          ? "This month to date"
          : "This month",
    },
    { mode: "last30", label: "Last 30 days" },
    { mode: "custom", label: "Custom" },
  ];
  return (
    <fieldset className="scope-ruler">
      <legend>Report scope</legend>
      <div className="scope-ruler__modes" role="radiogroup" aria-label="Scope">
        {modes.map((option) => (
          <label
            key={option.mode}
            className={
              selection.mode === option.mode
                ? "scope-ruler__option scope-ruler__option--active"
                : "scope-ruler__option"
            }
          >
            <input
              type="radio"
              name="dashboard-scope"
              value={option.mode}
              checked={selection.mode === option.mode}
              onChange={() => set({ mode: option.mode })}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      {selection.mode === "month" ? (
        <label className="select-filter scope-ruler__month">
          <span>Scope month</span>
          <input
            type="month"
            value={selection.month}
            aria-label="Scope month"
            onChange={(event) => {
              if (event.target.value) set({ month: event.target.value });
            }}
          />
        </label>
      ) : null}
      {selection.mode === "custom" ? (
        <div className="scope-ruler__custom">
          <label className="select-filter">
            <span>From</span>
            <input
              type="date"
              value={selection.from}
              aria-label="Scope start date"
              onChange={(event) => {
                if (event.target.value) set({ from: event.target.value });
              }}
            />
          </label>
          <label className="select-filter">
            <span>To</span>
            <input
              type="date"
              value={selection.to}
              aria-label="Scope end date"
              onChange={(event) => {
                if (event.target.value) set({ to: event.target.value });
              }}
            />
          </label>
        </div>
      ) : null}
    </fieldset>
  );
}
