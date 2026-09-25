/**
 * Dependency-free sparkline for KPI 1 (overhaul §3.2). The line is drawn
 * against a soft area fill; the accessible name states what the series is and
 * which window it covers, so the graphic is never read as decoration alone.
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
  return (
    <svg
      className="kpi-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={label}
    >
      <path className="kpi-sparkline__area" d={area} aria-hidden="true" />
      <path className="kpi-sparkline__line" d={line} aria-hidden="true" />
    </svg>
  );
}
