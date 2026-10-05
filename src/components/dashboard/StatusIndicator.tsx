import type { ReactNode } from "react";

/**
 * Simple status indicator for KPI 4 (overhaul §3.2 + §3.8). One icon-led mark
 * beside an empty status lane, so "no validation or referral is underway" is
 * carried by the icon and by the graphic's accessible name, never by colour
 * alone. Both the mark and the lane are flat solids: the mark keeps its
 * `--color-warning` ring over a cream chip, and the lane is the greenish
 * `--color-surface-tint` track inside a `--color-border-strong` border, so
 * the two near-white surfaces read apart by hue and by their rings rather
 * than by a texture.
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
      <span className="kpi-status__lane" aria-hidden="true" />
    </span>
  );
}
