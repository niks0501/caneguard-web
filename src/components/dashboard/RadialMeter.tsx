import { metricSegmentName, type MetricSegment } from "./metricSegments";

const VIEWBOX = 64;
const CENTER = VIEWBOX / 2;
const RADIUS = 26;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface Slice {
  label: string;
  dashArray: string;
  dashOffset: number;
  tone: number;
}

/**
 * Compact radial meter for the KPI band: one part-of-whole ring with an
 * accessible name that lists every slice label and count, so the split is
 * never carried by the arcs alone. The card's chip legend prints the same
 * numbers beside it.
 */
export function RadialMeter({
  label,
  segments,
}: {
  label: string;
  segments: MetricSegment[];
}) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  const slices: Slice[] = [];
  let consumed = 0;
  segments.forEach((segment, index) => {
    const length = total > 0 ? (segment.count / total) * CIRCUMFERENCE : 0;
    slices.push({
      label: segment.label,
      dashArray: `${length} ${CIRCUMFERENCE - length}`,
      dashOffset: -consumed,
      tone: index % 4,
    });
    consumed += length;
  });

  return (
    <div className="kpi-radial">
      <svg
        className="kpi-radial__chart"
        viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        role="img"
        aria-label={metricSegmentName(label, segments)}
      >
        <circle
          className="kpi-radial__track"
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
        />
        {slices.map((slice) => (
          <circle
            key={slice.label}
            className={`kpi-radial__slice kpi-radial__slice--${slice.tone}`}
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            strokeDasharray={slice.dashArray}
            strokeDashoffset={slice.dashOffset}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
          />
        ))}
      </svg>
    </div>
  );
}
