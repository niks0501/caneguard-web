/**
 * Dependency-free sparkline for KPI 1 (overhaul §3.2). Decorative: the
 * comparison line beside it carries the meaning, so this is aria-hidden.
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
  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${(index * step).toFixed(1)},${(
          height -
          3 -
          point * scale
        ).toFixed(1)}`,
    )
    .join(" ");
  return (
    <svg
      className="kpi-sparkline"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      <path className="kpi-sparkline__line" d={path} />
    </svg>
  );
}
