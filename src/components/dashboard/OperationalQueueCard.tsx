import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { OperationalQueue } from "../../domain/operationalQueue";

export function OperationalQueueCard({
  queue,
  label,
  count,
  href,
  icon,
}: {
  queue: OperationalQueue;
  label: string;
  count: number;
  href: string;
  icon: ReactNode;
}) {
  return (
    <Link
      className={`operational-queue-card operational-queue-card--${queue}`}
      to={href}
      aria-label={`Open ${label} queue`}
    >
      <div className="operational-queue-card__header">
        <span className="operational-queue-card__icon">{icon}</span>
        <span className="operational-queue-card__label">{label}</span>
      </div>
      <div className="operational-queue-card__body">
        <strong className="operational-queue-card__count">{count}</strong>
      </div>
      <span className="operational-queue-card__action">
        <span>Open queue</span>
        <ArrowUpRight aria-hidden="true" />
      </span>
    </Link>
  );
}
