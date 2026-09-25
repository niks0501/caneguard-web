/**
 * Single source of truth for the reported-concern vocabulary (overhaul §3.6,
 * §3.7): the declared value list and display labels, imported by the chart,
 * its legend, its table and the copy test. RSSI lives here only — it never
 * enters the AI Possible Condition series. Series fills are not declared here:
 * both vocabularies paint from the shared solid `--kpi-band-<N>` ramp, and the
 * printed row labels are what keep the two vocabularies apart.
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

export interface PossibleConditionEntry {
  value: string;
  label: string;
}

export const POSSIBLE_CONDITIONS: PossibleConditionEntry[] = [
  { value: "healthy", label: "Healthy" },
  { value: "mosaic", label: "Mosaic" },
  { value: "rust", label: "Rust" },
  { value: "smut", label: "Smut" },
];

export function reportedConcernLabel(value: string): string {
  return REPORTED_CONCERNS.find((entry) => entry.value === value)?.label ?? value;
}
