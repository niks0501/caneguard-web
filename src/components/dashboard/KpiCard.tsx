import { useId, type ReactNode } from "react";
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
 *
 * A card may carry one `supportTooltip`: the definition of a figure the
 * supporting line names but no longer explains. It is the dashboard's only
 * tooltip — a clipped, always-present `role="tooltip"` node that the card link
 * points at with `aria-describedby`, so assistive technology reads the
 * definition on focus while sighted readers reveal it on hover or keyboard
 * focus of the card (the reveal rules live in `index.css`).
 */
export function KpiCard({
  label,
  value,
  support,
  supportTooltip,
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
  /** The definition of a figure the supporting line names, for the tooltip. */
  supportTooltip?: string;
  icon: ReactNode;
  href: string;
  linkLabel: string;
  /** Marks a figure that could not be derived, so `value` is not a zero. */
  unavailable?: boolean;
  children?: ReactNode;
}) {
  const supportTooltipId = useId();
  return (
    <article className="kpi-card" aria-label={label}>
      <Link
        className="kpi-card__link"
        to={href}
        aria-label={linkLabel}
        aria-describedby={supportTooltip ? supportTooltipId : undefined}
      >
        <span className="kpi-card__top">
          <span className="kpi-card__icon" aria-hidden="true">
            {icon}
          </span>
          <span className="kpi-card__label">{label}</span>
        </span>
        <strong className="kpi-card__value">{value}</strong>
        {unavailable ? <span className="sr-only">Unavailable</span> : null}
        <span
          className={
            supportTooltip
              ? "kpi-card__support kpi-card__support--annotated"
              : "kpi-card__support"
          }
        >
          {support}
          {supportTooltip ? (
            <span
              className="kpi-card__support-tip"
              id={supportTooltipId}
              role="tooltip"
            >
              {supportTooltip}
            </span>
          ) : null}
        </span>
        {children ? (
          <div className="kpi-card__graphic">{children}</div>
        ) : null}
      </Link>
    </article>
  );
}
