import type { ReactNode } from "react";
import { Link } from "react-router";

/**
 * Compact KPI card: header row, one large value, one supporting line and one
 * graphic, and nothing else. The card itself is the action to its queue, so no
 * separate Open row competes with the graphic for space and no other copy
 * appears on the card. The supporting line prints the card's own figure (see
 * `kpiSupport`), a `—` value with `unavailable` states an unavailable figure
 * instead of a zero, and every graphic ships its own accessible name so the
 * split it encodes stays readable to assistive technology without a legend.
 * Text slots still wrap anywhere and the card caps at `max-width: 100%`, so the
 * longest real label never pushes the 4-up band sideways.
 */
export function KpiCard({
  label,
  value,
  support,
  icon,
  href,
  linkLabel,
  unavailable = false,
  children,
}: {
  label: string;
  value: string;
  /** One figure for this card, from this card's own population and window. */
  support: string;
  icon: ReactNode;
  href: string;
  linkLabel: string;
  /** Marks a figure that could not be derived, so `value` is not a zero. */
  unavailable?: boolean;
  children?: ReactNode;
}) {
  return (
    <article className="kpi-card" aria-label={label}>
      <Link className="kpi-card__link" to={href} aria-label={linkLabel}>
        <span className="kpi-card__top">
          <span className="kpi-card__icon" aria-hidden="true">
            {icon}
          </span>
          <span className="kpi-card__label">{label}</span>
        </span>
        <strong className="kpi-card__value">{value}</strong>
        {unavailable ? <span className="sr-only">Unavailable</span> : null}
        <span className="kpi-card__support">{support}</span>
        {children ? (
          <div className="kpi-card__graphic">{children}</div>
        ) : null}
      </Link>
    </article>
  );
}
