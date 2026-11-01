import { ChevronDown } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

export interface ExportMenuAction {
  key: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}

/**
 * One menu for every export, so printable and CSV leave the header as a single
 * control. It is a native disclosure: the trigger, the actions and the
 * keyboard are the browser's own, and the menu closes on Escape, on an outside
 * press and after an action runs.
 */
export function ExportMenu({
  label = "Export",
  actions,
}: {
  label?: string;
  actions: ExportMenuAction[];
}) {
  const menuRef = useRef<HTMLDetailsElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      const menu = menuRef.current;
      if (!menu?.open) return;
      if (event.target instanceof Node && menu.contains(event.target)) return;
      menu.open = false;
    };

    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, []);

  const close = () => {
    const menu = menuRef.current;
    if (!menu) return;
    menu.open = false;
    triggerRef.current?.focus();
  };

  return (
    <details
      ref={menuRef}
      className="export-menu"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.preventDefault();
        close();
      }}
    >
      <summary ref={triggerRef} className="button button--secondary export-menu__trigger">
        <span>{label}</span>
        <ChevronDown aria-hidden="true" size={16} />
      </summary>
      <div className="export-menu__panel">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            className="button button--quiet export-menu__item"
            disabled={action.disabled}
            onClick={() => {
              close();
              action.onSelect();
            }}
          >
            {action.icon}
            <span>{action.label}</span>
          </button>
        ))}
      </div>
    </details>
  );
}
