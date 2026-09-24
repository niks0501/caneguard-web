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
 * KPI card: the MetricCard shape (label / value / context) extended with the
 * overhaul's trend, segment, as-of and link slots (§3.2). Values and
 * secondary text wrap anywhere so long identifiers (§13.2) cannot push the
 * 4-up grid sideways.
 */
export function KpiCard({
  label,
  value,
  icon,
  comparison,
  scopeLine,
  asOf,
  footnote,
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
  scopeLine?: string;
  asOf?: string;
  footnote?: string;
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
      </div>
      <strong className="kpi-card__value">{value}</strong>
      {comparison ? <p className="kpi-card__comparison">{comparison}</p> : null}
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
      {scopeLine ? <p className="kpi-card__scope">{scopeLine}</p> : null}
      {asOf ? <p className="kpi-card__asof">as of {asOf} PHT</p> : null}
      {footnote ? <p className="kpi-card__footnote">{footnote}</p> : null}
      <Link className="kpi-card__action" to={href} aria-label={linkLabel}>
        <span>Open queue</span>
        <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}
