import { useRef } from "react";

export interface QueueTabOption {
  /** Value for the `queue` URL parameter; the empty string is the All tab. */
  value: string;
  label: string;
}

/**
 * The queue tabs are real tabs rather than a row of plain buttons: one roving
 * tab stop, arrow-key movement between queues and an `aria-controls` link to
 * the results they filter. Choosing a tab is the whole queue filter, so
 * selection follows focus the way the Overview tabs already behave.
 */
export function QueueTabs({
  tabs,
  activeValue,
  onSelect,
  panelId,
  idPrefix,
}: {
  tabs: readonly QueueTabOption[];
  activeValue: string;
  onSelect: (value: string) => void;
  panelId: string;
  idPrefix: string;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const foundIndex = tabs.findIndex((tab) => tab.value === activeValue);
  const selectedIndex = foundIndex === -1 ? 0 : foundIndex;

  const tabAt = (index: number) =>
    listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[
      index
    ];

  const selectAndFocus = (index: number) => {
    const next = (index + tabs.length) % tabs.length;
    onSelect(tabs[next].value);
    tabAt(next)?.focus();
  };

  return (
    <div
      ref={listRef}
      className="queue-tabs"
      role="tablist"
      aria-label="Queue"
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.value || "all"}
          type="button"
          role="tab"
          id={`${idPrefix}-${index}`}
          aria-selected={index === selectedIndex}
          aria-controls={index === selectedIndex ? panelId : undefined}
          tabIndex={index === selectedIndex ? 0 : -1}
          className="queue-tabs__tab"
          onClick={() => onSelect(tab.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault();
              selectAndFocus(index + 1);
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              selectAndFocus(index - 1);
            } else if (event.key === "Home") {
              event.preventDefault();
              selectAndFocus(0);
            } else if (event.key === "End") {
              event.preventDefault();
              selectAndFocus(tabs.length - 1);
            }
          }}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
