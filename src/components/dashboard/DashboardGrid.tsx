import type { ReactNode } from "react";

/** 12-column analytical-dashboard rhythm (overhaul §3.1). */
export function DashboardGrid({ children }: { children: ReactNode }) {
  return <div className="dashboard-grid">{children}</div>;
}

export function DashboardSection({
  children,
  labelledBy,
  label,
}: {
  children: ReactNode;
  labelledBy?: string;
  label?: string;
}) {
  return (
    <section
      className="dashboard-section"
      aria-labelledby={labelledBy}
      aria-label={labelledBy ? undefined : label}
    >
      {children}
    </section>
  );
}
