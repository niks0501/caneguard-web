import type { ReactNode } from "react";

/**
 * Icon-led status chip for the KPI band. It is one graphic with an accessible
 * name, so a card can state a queue's state without adding a hint sentence.
 */
export function StatusChip({
  icon,
  text,
  name,
}: {
  icon: ReactNode;
  text: string;
  name: string;
}) {
  return (
    <span className="kpi-chip" role="img" aria-label={name}>
      <span className="kpi-chip__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="kpi-chip__text">{text}</span>
    </span>
  );
}
