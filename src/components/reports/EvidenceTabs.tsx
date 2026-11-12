import { useId, useRef, useState, type ReactNode } from "react";

export interface EvidenceTab {
  id: string;
  label: string;
  icon: ReactNode;
  /** Shown as a badge; omit for a tab with nothing to count. */
  count?: number;
  disabled?: boolean;
  panel: ReactNode;
}

/**
 * Case evidence tabs. Every panel stays mounted and is only hidden, so an
 * unsaved boundary edit or an aerial upload in progress survives a tab switch.
 */
export function EvidenceTabs({ tabs, label }: { tabs: readonly EvidenceTab[]; label: string }) {
  const idPrefix = useId();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [selectedId, setSelectedId] = useState(tabs[0]?.id);
  const foundIndex = tabs.findIndex((tab) => tab.id === selectedId);
  const selectedIndex = foundIndex === -1 ? 0 : foundIndex;

  const select = (index: number, focus = false, direction = 1) => {
    let next = (index + tabs.length) % tabs.length;
    while (tabs[next].disabled) next = (next + direction + tabs.length) % tabs.length;
    setSelectedId(tabs[next].id);
    if (focus) listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  };

  return (
    <div className="evidence-tabs">
      <div ref={listRef} className="evidence-tabs__list" role="tablist" aria-label={label}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={index === selectedIndex}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            disabled={tab.disabled}
            tabIndex={index === selectedIndex ? 0 : -1}
            className="evidence-tabs__tab"
            onClick={() => select(index)}
            onKeyDown={(event) => {
              const direction = event.key === "ArrowLeft" || event.key === "End" ? -1 : 1;
              const target =
                event.key === "ArrowRight" ? index + 1
                : event.key === "ArrowLeft" ? index - 1
                : event.key === "Home" ? 0
                : event.key === "End" ? tabs.length - 1
                : null;
              if (target === null) return;
              event.preventDefault();
              select(target, true, direction);
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {tab.count !== undefined ? (
              <span className="evidence-tabs__count" aria-label={`${tab.count} ${tab.count === 1 ? "item" : "items"}`}>
                {tab.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${idPrefix}-panel-${tab.id}`}
          aria-labelledby={`${idPrefix}-tab-${tab.id}`}
          className="evidence-tabs__panel"
          hidden={index !== selectedIndex}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}

/** A tool with nothing in it yet: one line until the reviewer asks for it. */
export function CollapsedTool({
  summary,
  action,
  onOpen,
}: {
  summary: string;
  action: string;
  onOpen: () => void;
}) {
  return (
    <p className="collapsed-tool review-card">
      <span>{summary}</span>
      <span aria-hidden="true">·</span>
      <button type="button" className="table-action" onClick={onOpen}>{action}</button>
    </p>
  );
}
