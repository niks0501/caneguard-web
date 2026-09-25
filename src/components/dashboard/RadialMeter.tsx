import { KpiBandPatternDefs } from "./KpiBandPatternDefs";
import { kpiBandForIndex, kpiBandSignature } from "./kpiBandEncoding";
import { metricSegmentName, type MetricSegment } from "./metricSegments";
import { useKpiBandPatternIds } from "./useKpiBandPatternIds";

const VIEWBOX = 64;
const CENTER = VIEWBOX / 2;
const RADIUS = 26;
/** Full ring length in user units; exported so tests assert the real gap. */
export const RADIAL_ARC_LENGTH = 2 * Math.PI * RADIUS;
const CIRCUMFERENCE = RADIAL_ARC_LENGTH;
/** Arc length cut out of each band's tail so neighbours never touch. */
export const RADIAL_SLICE_GAP = 2;

interface Slice {
  label: string;
  dashArray: string;
  dashOffset: number;
  band: 1 | 2 | 3 | 4;
  patternId: string;
  signature: string;
}

/**
 * Compact radial meter for the KPI band: one part-of-whole ring with an
 * accessible name that lists every slice label and count, so the split is
 * never carried by the arcs alone (§3.8, risk 7).
 *
 * Each band reads apart three ways on top of its `--kpi-band-<N>` fill:
 * its own hatch pattern as the arc paint, a `--color-surface` separator ring
 * drawn under the band, and a `SLICE_GAP` arc gap at its tail. The fills
 * themselves are tuned to clear 3:1 between neighbours; the strokes, gaps and
 * patterns are what make the split legible without colour at all.
 */
export function RadialMeter({
  label,
  segments,
}: {
  label: string;
  segments: MetricSegment[];
}) {
  const patternIds = useKpiBandPatternIds();
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  const slices: Slice[] = [];
  let consumed = 0;
  segments.forEach((segment, index) => {
    const length = total > 0 ? (segment.count / total) * CIRCUMFERENCE : 0;
    // A band never loses more than a third of its arc to the gap, so a
    // one-report band still reads as an arc instead of vanishing.
    const gap = Math.min(RADIAL_SLICE_GAP, length / 3);
    const drawn = Math.max(length - gap, 0);
    const band = kpiBandForIndex(index);
    slices.push({
      label: segment.label,
      dashArray: `${drawn} ${CIRCUMFERENCE - drawn}`,
      dashOffset: -consumed,
      band: band.band,
      patternId: patternIds[band.band - 1],
      signature: kpiBandSignature(band),
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
        <KpiBandPatternDefs ids={patternIds} />
        <circle
          className="kpi-radial__track"
          cx={CENTER}
          cy={CENTER}
          r={RADIUS}
        />
        {slices.map((slice) => (
          <circle
            key={slice.label}
            className="kpi-radial__separator"
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            strokeDasharray={slice.dashArray}
            strokeDashoffset={slice.dashOffset}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
            aria-hidden="true"
          />
        ))}
        {slices.map((slice) => (
          <circle
            key={slice.label}
            className={`kpi-radial__slice kpi-radial__slice--band-${slice.band}`}
            data-kpi-band={slice.band}
            data-kpi-pattern={slice.signature}
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            stroke={`url(#${slice.patternId})`}
            strokeDasharray={slice.dashArray}
            strokeDashoffset={slice.dashOffset}
            transform={`rotate(-90 ${CENTER} ${CENTER})`}
            aria-hidden="true"
          />
        ))}
      </svg>
    </div>
  );
}
