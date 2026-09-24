/**
 * Labelled multi-segment bar for KPI 2's waiting-age ladder and KPI 3's
 * past-target / scheduled-ahead / unscheduled split (overhaul §3.2). Every
 * segment carries a visible label and a printed count, so the split never
 * depends on colour alone.
 */
export function AgeLadder({
  label,
  segments,
}: {
  label: string;
  segments: Array<{ label: string; count: number }>;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  return (
    <div className="age-ladder">
      <div
        className="age-ladder__bar"
        role="img"
        aria-label={`${label}: ${segments
          .map((segment) => `${segment.label} ${segment.count}`)
          .join(", ")}`}
      >
        {segments.map((segment, index) => (
          <span
            key={segment.label}
            className={`age-ladder__segment age-ladder__segment--${index % 4}`}
            style={
              total > 0
                ? { flexGrow: segment.count, flexBasis: 0 }
                : { flexGrow: 1, flexBasis: 0 }
            }
            aria-hidden="true"
          />
        ))}
      </div>
      <ul className="age-ladder__legend">
        {segments.map((segment) => (
          <li key={segment.label}>
            <span>{segment.label}</span>
            <strong>{segment.count}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
