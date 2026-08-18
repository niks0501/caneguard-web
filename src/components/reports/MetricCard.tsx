import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  context,
  icon,
  priority = "standard",
}: {
  label: string;
  value: string;
  context: string;
  icon: ReactNode;
  priority?: "primary" | "standard";
}) {
  return (
    <article className={`metric-card metric-card--${priority}`}>
      <div className="metric-card__icon">{icon}</div>
      <div><span>{label}</span><strong>{value}</strong><small>{context}</small></div>
    </article>
  );
}
