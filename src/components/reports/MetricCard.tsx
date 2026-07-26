import type { ReactNode } from "react";

export function MetricCard({
  label,
  value,
  context,
  icon,
}: {
  label: string;
  value: string;
  context: string;
  icon: ReactNode;
}) {
  return (
    <article className="metric-card">
      <div className="metric-card__icon">{icon}</div>
      <div><span>{label}</span><strong>{value}</strong><small>{context}</small></div>
    </article>
  );
}
