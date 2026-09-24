/**
 * Single source of truth for the reported-concern vocabulary (overhaul §3.6,
 * §3.7): the declared value list, display labels, brand-ramp token slots and
 * pattern ids, imported by the chart, its legend, its table and the copy
 * test. RSSI lives here only — it never enters the AI Possible Condition
 * series.
 */

export interface ReportedConcernEntry {
  value: string;
  label: string;
}

export const REPORTED_CONCERNS: ReportedConcernEntry[] = [
  { value: "RSSI", label: "RSSI" },
  { value: "smut", label: "Smut" },
  { value: "mosaic", label: "Mosaic" },
  { value: "rust", label: "Rust" },
  { value: "other", label: "Other reported" },
  { value: "not_stated", label: "Not stated" },
];

/** Single-hue brand ramp slots, one per reported-concern entry. */
export const REPORTED_CONCERN_RAMP_TOKENS = [
  "--color-primary-dark",
  "--color-brand-hover",
  "--color-primary",
  "--color-primary-light",
  "--color-muted",
  "--color-border-strong",
] as const;

export interface PossibleConditionEntry {
  value: string;
  label: string;
}

export const POSSIBLE_CONDITIONS: PossibleConditionEntry[] = [
  { value: "healthy", label: "Healthy" },
  { value: "mosaic", label: "Mosaic" },
  { value: "rust", label: "Rust" },
];

export function reportedConcernLabel(value: string): string {
  return REPORTED_CONCERNS.find((entry) => entry.value === value)?.label ?? value;
}

/** Stable pattern id for a chart series entry (never colour alone). */
export function patternIdFor(series: string, value: string): string {
  return `pattern-${series}-${value.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}
