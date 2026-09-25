import type { ReactNode } from "react";

/**
 * Simple status indicator for KPI 4 (overhaul §3.2). One icon-led mark beside
 * an empty status lane, so "no validation or referral is underway" is carried
 * by the icon and by the graphic's accessible name, never by colour alone.
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
