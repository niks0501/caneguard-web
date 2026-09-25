import type { ReactNode } from "react";
import { Link } from "react-router";

export interface KpiSegment {
  label: string;
  count: number;
  /** Queue subset chips are links; a plain split renders as static chips. */
  href?: string;
  linkLabel?: string;
}

function SegmentChip({ segment, index }: { segment: KpiSegment; index: number }) {
  const swatch = (
    <span
      className={`kpi-card__segment-swatch kpi-card__segment-swatch--${index % 4}`}
      aria-hidden="true"
    />
  );
  const body = (
    <>
      {swatch}
      <span className="kpi-card__segment-label">{segment.label}</span>
      <strong className="kpi-card__segment-count">{segment.count}</strong>
    </>
  );

  if (!segment.href) {
    return <span className="kpi-card__segment">{body}</span>;
  }
  return (
    <Link
      className="kpi-card__segment"
      to={segment.href}
      aria-label={segment.linkLabel}
    >
      {body}
    </Link>
  );
}

/**
 * Compact KPI card: icon plus short label, one large value, one compact
 * graphic (sparkline, segmented bar, radial meter or status chip) and the
 * register action. There is no comparison line, hint or meta paragraph — the
 * graphic carries the reading, every graphic ships its own accessible name,
 * and the chip legend below it prints each slice as text. Text slots still
 * wrap anywhere and the card caps at `max-width: 100%`, so the longest real
 * label never pushes the 4-up band sideways.
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
  /** Marks a count that is current-state, not scoped to the period ruler. */
  pointInTime?: boolean;
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
      {children ? <div className="kpi-card__graphic">{children}</div> : null}
      {segments && segments.length > 0 ? (
        <ul className="kpi-card__segments">
          {segments.map((segment, index) => (
            <li key={segment.label}>
              <SegmentChip segment={segment} index={index} />
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
