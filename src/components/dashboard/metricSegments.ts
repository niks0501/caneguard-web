/**
 * Shared shape of a compact KPI graphic (bar / radial / chip legend).
 *
 * A segment is one labelled part of a whole. Every consumer prints the label
 * and the count as text and repeats the same split in the graphic's
 * accessible name, so a reading never depends on colour or shape alone.
 */
export interface MetricSegment {
  label: string;
  count: number;
}

/** Accessible name for a part-of-whole graphic. */
export function metricSegmentName(
  label: string,
  segments: MetricSegment[],
): string {
  if (segments.length === 0) return `${label}: nothing recorded`;
  return `${label}: ${segments
    .map((segment) => `${segment.label} ${segment.count}`)
    .join(", ")}`;
}
