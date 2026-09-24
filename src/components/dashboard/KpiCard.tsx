import type { ReactNode } from "react";
import { Link } from "react-router";

export interface KpiSegment {
  label: string;
  count: number;
  href: string;
  linkLabel: string;
  icon?: ReactNode;
}

/**
 * KPI card: label, value, one optional comparison line, optional linked
 * segments and at most one short hint. Every text slot wraps anywhere and
 * the card caps at `max-width: 100%`, so the longest real queue identifier
 * (§13.2) wraps inside its track instead of pushing the 4-up band sideways.
 */
export function KpiCard({
  label,
  value,
  icon,
  pointInTime,
  href,
  linkLabel,
  segments,
  children,
  emptyMessage,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  comparison?: string;
  /** Marks a count that is current-state, not scoped to the period ruler. */
  pointInTime?: boolean;
  hint?: string;
  href: string;
  linkLabel: string;
  segments?: KpiSegment[];
  children?: ReactNode;
  emptyMessage?: string;
}) {
  return (
    <article className="kpi-card" aria-label={label}>
      <div className="kpi-card__top">
        <span className="kpi-card__icon" aria-hidden="true">
          {icon}
        </span>
        <span className="kpi-card__label">{label}</span>
        {pointInTime ? <span className="kpi-card__now">now</span> : null}
      </div>
      <strong className="kpi-card__value">{value}</strong>
      {children}
      {segments && segments.length > 0 ? (
        <ul className="kpi-card__segments">
          {segments.map((segment) => (
            <li key={segment.label}>
              <Link
                className="kpi-card__segment"
                to={segment.href}
                aria-label={segment.linkLabel}
              >
                {segment.icon ? (
                  <span className="kpi-card__segment-icon" aria-hidden="true">
                    {segment.icon}
                  </span>
                ) : null}
                <span className="kpi-card__segment-label">{segment.label}</span>
                <strong className="kpi-card__segment-count">{segment.count}</strong>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {emptyMessage ? <p className="kpi-card__empty">{emptyMessage}</p> : null}
      <Link className="kpi-card__action" to={href} aria-label={linkLabel}>
        <span>Open</span>
        <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}
