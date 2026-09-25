import { kpiBandFillClass, kpiBandForIndex } from "./kpiBandEncoding";
import { metricSegmentName, type MetricSegment } from "./metricSegments";

/**
 * Compact single-track bar for the KPI band (field-validation schedule
 * split). The track is one graphic with an accessible name listing every
 * label and count, and the split never rests on colour alone: each segment
 * paints one flat solid from the shared `--kpi-band-<N>` ramp through its
 * `kpi-band-fill--<N>` class, keeps the `--kpi-band-gap` gutter between
 * neighbours, and carries a `--color-surface` separator stroke (§3.8, risk 7).
 * The band fills themselves clear 3:1 against the card and between
 * neighbours.
 */
export function SegmentedBar({
  label,
  segments,
}: {
  label: string;
  segments: MetricSegment[];
}) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  return (
    <div className="kpi-bar">
      <div
        className="kpi-bar__track"
        role="img"
        aria-label={metricSegmentName(label, segments)}
      >
        {segments.map((segment, index) => {
          const band = kpiBandForIndex(index);
          return (
            <span
              key={segment.label}
              className={`kpi-bar__segment ${kpiBandFillClass(band)}`}
              data-kpi-band={band}
              style={
                total > 0
                  ? { flexGrow: segment.count, flexBasis: 0 }
                  : { flexGrow: 1, flexBasis: 0 }
              }
              aria-hidden="true"
            />
          );
        })}
      </div>
    </div>
  );
}
