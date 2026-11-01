import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

/**
 * The Filters side panel. It stays mounted so every filter keeps its value and
 * its place, but while closed it is inert, off-canvas and carries no dialog
 * role, so the panel is reached only through its trigger.
 *
 * Focus handling: opening moves focus into the panel, Tab stays inside it,
 * Escape closes it, and closing returns focus to the trigger that opened it.
 */
export function QueueFiltersPanel({
  id,
  title,
  open,
  onClose,
  triggerRef,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const headingId = `${id}-heading`;

  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const panel = panelRef.current;
    if (!panel) return;

    const trigger = triggerRef.current;

    const first = panel.querySelector<HTMLElement>(focusableSelector);
    (first ?? panel).focus();

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => !element.hasAttribute("disabled"));
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!panel.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      if (trigger?.isConnected) {
        trigger.focus();
      }
    };
  }, [open, triggerRef]);

  return (
    <>
      {open ? (
        <div
          className="queue-filters-backdrop"
          aria-hidden="true"
          onClick={onClose}
        />
      ) : null}
      <aside
        ref={panelRef}
        id={id}
        className={`queue-filters-panel${open ? " is-open" : ""}`}
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-labelledby={open ? headingId : undefined}
        inert={!open}
        tabIndex={-1}
      >
        <div className="queue-filters-panel__header">
          <h2 id={headingId}>{title}</h2>
          <button
            type="button"
            className="queue-filters-panel__close"
            aria-label="Close filters"
            onClick={onClose}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="queue-filters-panel__body">{children}</div>
      </aside>
    </>
  );
}
