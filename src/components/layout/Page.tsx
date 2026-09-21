import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </header>
  );
}

export function PageContent({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`page-content ${className}`.trim()}>{children}</div>;
}

export function DetailField({
  label,
  children,
  hidden,
  className,
}: {
  label: string;
  children: ReactNode;
  hidden?: boolean;
  className?: string;
}) {
  return (
    <div className={`detail-field ${className ?? ""}`.trim()} hidden={hidden}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
