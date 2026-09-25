import type { VerificationOutcomeSplit } from "../../domain/dashboard.types";

/**
 * Staff-verification legend for the concern-vs-condition card (overhaul §3.4).
 *
 * The strip under the chart is a real legend of the card: one flat solid
 * swatch per verification outcome, each drawn from the shared ordered
 * `--kpi-band-<N>` ramp so neighbouring entries clear 3:1 against each other
 * and the card. The same three outcomes are appended to the card's
 * visually-hidden data table, and every mark prints its label and count, so
 * the legend and its accessible table stay in parity and nothing is read by
 * fill colour alone.
 */
export type VerificationLegendTone = "verified" | "unable" | "not-determined";

export interface VerificationLegendEntry {
  key: keyof VerificationOutcomeSplit;
  label: string;
  tone: VerificationLegendTone;
}

export const VERIFICATION_LEGEND: VerificationLegendEntry[] = [
  { key: "verified", label: "Verified by staff", tone: "verified" },
  { key: "unable_to_verify", label: "Unable to verify", tone: "unable" },
  { key: "not_determined", label: "Not yet determined", tone: "not-determined" },
];

/** Accessible name for one legend mark: the outcome and its printed count. */
export function verificationLegendName(label: string, count: number): string {
  return `${label}: ${count}`;
}
