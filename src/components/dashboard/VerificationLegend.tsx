import type { VerificationOutcomeSplit } from "../../domain/dashboard.types";
import { kpiBandFillClass, kpiBandForIndex } from "./kpiBandEncoding";
import { VERIFICATION_LEGEND, verificationLegendName } from "./verificationLegendData";

/**
 * Legend for the staff-verification split printed inside the
 * concern-vs-condition card. Each entry is one named mark — flat solid swatch,
 * category and count — so the same reading reaches assistive technology as a
 * name and reaches everyone else as a solid mark plus printed count. Swatches
 * take their fill from the shared `--kpi-band-<N>` ramp in entry order, so
 * neighbouring marks keep the 3:1 separation the rest of the dashboard uses.
 * The card's visually-hidden data table carries the same three rows.
 */
export function VerificationLegend({
  outcome,
  label,
}: {
  outcome: VerificationOutcomeSplit;
  label: string;
}) {
  return (
    <ul
      className="decision-chart__legend decision-chart__legend--verification"
      aria-label={label}
    >
      {VERIFICATION_LEGEND.map((entry, index) => {
        const count = outcome[entry.key];
        const band = kpiBandForIndex(index);
        return (
          <li key={entry.key}>
            <span
              className="decision-chart__legend-mark"
              role="img"
              aria-label={verificationLegendName(entry.label, count)}
            >
              <span
                className={`decision-chart__swatch decision-chart__swatch--${entry.tone} ${kpiBandFillClass(band)}`}
                data-series-band={band}
                aria-hidden="true"
              />
              <span className="decision-chart__legend-label">{entry.label}</span>
              <strong className="decision-chart__legend-count">{count}</strong>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
