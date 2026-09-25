import type { ReactNode } from "react";
import { Link } from "react-router";

/**
 * Compact KPI card: icon plus short label, one large value, one compact
 * graphic (sparkline, segmented bar, radial meter or status chip) and the
 * register action. Nothing else — no chip legend, no point-in-time pill and
 * no empty-state paragraph. Every graphic ships its own accessible name that
 * prints the labels and counts it encodes (see `metricSegmentName`), so a
 * split stays readable to assistive technology without a text legend on the
 * card. Text slots still wrap anywhere and the card caps at
 * `max-width: 100%`, so the longest real label never pushes the 4-up band
 * sideways.
 */
export function KpiCard({
  label,
  value,
  icon,
  href,
  linkLabel,
  children,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  href: string;
  linkLabel: string;
  children?: ReactNode;
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
      {children ? <div className="kpi-card__graphic">{children}</div> : null}
      <Link className="kpi-card__action" to={href} aria-label={linkLabel}>
        <span>Open</span>
        <span aria-hidden="true">→</span>
      </Link>
    </article>
  );
}
