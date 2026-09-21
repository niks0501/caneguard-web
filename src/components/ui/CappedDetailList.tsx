import React, { useState } from "react";

export interface CappedDetailListProps {
  className?: string;
  limit?: number;
  children: React.ReactNode;
}

export function CappedDetailList({
  className = "detail-list",
  limit = 4,
  children,
}: CappedDetailListProps) {
  const [expanded, setExpanded] = useState(false);
  const items = React.Children.toArray(children).filter(Boolean);
  const hasMore = items.length > limit;
  const remainingCount = items.length - limit;

  return (
    <div className="capped-detail-list">
      <dl className={className}>
        {items.map((child, index) => {
          const isHidden = !expanded && index >= limit;
          if (React.isValidElement(child)) {
            const existingClassName = (child.props as { className?: string }).className ?? "";
            const combinedClassName = `${existingClassName} ${isHidden ? "detail-field--hidden" : ""}`.trim();
            return React.cloneElement(child, {
              hidden: isHidden,
              className: combinedClassName,
            } as Record<string, unknown>);
          }
          return (
            <div
              key={index}
              className={`detail-field-wrapper ${isHidden ? "detail-field--hidden" : ""}`.trim()}
              hidden={isHidden}
            >
              {child}
            </div>
          );
        })}
      </dl>
      {hasMore ? (
        <button
          type="button"
          className="detail-list-toggle"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
        >
          {expanded
            ? "Show fewer rows"
            : `Show remaining ${remainingCount} ${remainingCount === 1 ? "row" : "rows"}`}
        </button>
      ) : null}
    </div>
  );
}
