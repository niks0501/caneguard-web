/**
 * Dependency-free sparkline for KPI 1 (overhaul §3.2 + §3.8). One series, so
 * there is no band split; the distinction standard still applies to its two
 * flat tones. The shipped `--color-primary-tint` area sat 1.09:1
 * against the card — effectively invisible — so the area now paints in the
 * tuned `--kpi-band-1` fill (3.32:1 against the card) and the series line is
 * drawn over a `--color-surface` halo in `--color-primary-dark`, giving the
 * area-to-line pair 3.26:1 plus a real separator stroke. The accessible name
 * states what the series is and which window it covers, so the graphic is
 * never read as decoration or by colour alone.
 */
export function Sparkline({
  points,
  label,
}: {
  points: number[];
  label: string;
}) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 0);
  const width = 120;
  const height = 40;
  const step = width / (points.length - 1);
  const scale = max > 0 ? (height - 6) / max : 0;
  const y = (point: number) => height - 3 - point * scale;
  const line = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${(index * step).toFixed(1)},${y(point).toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${width},${height - 3} L0,${height - 3} Z`;
  const last = y(points[points.length - 1]);
  // A vertical tick, not a circle: the sparkline stretches with
  // `preserveAspectRatio="none"`, which would squash a round marker into an
  // ellipse, while a vertical line keeps its width and length.
  const tick = `M${width - 1},${last - 4} L${width - 1},${last + 4}`;
  return (
    <svg
      className="kpi-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <path className="kpi-sparkline__area" d={area} aria-hidden="true" />
      <path className="kpi-sparkline__halo" d={line} aria-hidden="true" />
      <path className="kpi-sparkline__line" d={line} aria-hidden="true" />
      <path className="kpi-sparkline__end" d={tick} aria-hidden="true" />
    </svg>
  );
}
