import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { OperationalQueue } from "../../domain/operationalQueue";

export function OperationalQueueCard({
  queue,
  label,
  count,
  description,
  href,
  icon,
}: {
  queue: OperationalQueue;
  label: string;
  count: number;
  description: string;
  href: string;
  icon: ReactNode;
}) {
  return (
    <Link
      className={`operational-queue-card operational-queue-card--${queue}`}
      to={href}
      aria-label={`Open ${label} queue`}
    >
      <span className="operational-queue-card__icon">{icon}</span>
      <span className="operational-queue-card__content">
        <span className="operational-queue-card__label">{label}</span>
        <strong>{count}</strong>
        <span className="operational-queue-card__description">{description}</span>
      </span>
      <span className="operational-queue-card__action">
        <span>Open queue</span>
        <ArrowUpRight aria-hidden="true" />
      </span>
    </Link>
  );
}
