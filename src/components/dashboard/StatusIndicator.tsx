import type { ReactNode } from "react";

/**
 * Simple status indicator for KPI 4 (overhaul §3.2 + §3.8). One icon-led mark
 * beside an empty status lane, so "no validation or referral is underway" is
 * carried by the icon and by the graphic's accessible name, never by colour
 * alone. The mark and the lane both sit near white, so the mark keeps a
 * `--color-warning` ring and the lane carries a `--color-border-strong`
 * hatch: the two tones are told apart by the ring, the hatch and the icon,
 * not by their near-identical fills.
 */
export function StatusIndicator({
  icon,
  name,
}: {
  icon: ReactNode;
  name: string;
}) {
  return (
    <span className="kpi-status" role="img" aria-label={name}>
      <span className="kpi-status__mark" aria-hidden="true">
        {icon}
      </span>
      <span
        className="kpi-status__lane"
        data-kpi-pattern="status-lane/hatch"
        aria-hidden="true"
      />
    </span>
  );
}
