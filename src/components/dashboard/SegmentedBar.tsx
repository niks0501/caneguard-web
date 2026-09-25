import { metricSegmentName, type MetricSegment } from "./metricSegments";

/**
 * Compact single-track bar for the KPI band (waiting-age and field-validation
 * schedule splits). The track is one graphic with an accessible name listing
 * every label and count; the card's chip legend prints the same split in text.
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
        {segments.map((segment, index) => (
          <span
            key={segment.label}
            className={`kpi-bar__segment kpi-bar__segment--${index % 4}`}
            style={
              total > 0
                ? { flexGrow: segment.count, flexBasis: 0 }
                : { flexGrow: 1, flexBasis: 0 }
            }
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
