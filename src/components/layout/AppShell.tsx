import { useEffect, useRef, useState } from "react";
import { Outlet } from "react-router";
import { X } from "lucide-react";
import { AppSidebar } from "../navigation/AppSidebar";
import { AppHeader } from "./AppHeader";

export function AppShell() {
  const [isNavigationOpen, setNavigationOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerPanelRef = useRef<HTMLDivElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isNavigationOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const trigger = menuButtonRef.current;
    const panel = drawerPanelRef.current;
    drawerCloseRef.current?.focus();

    const focusableSelector = [
      "button:not([disabled])",
      "a[href]",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "[tabindex]:not([tabindex=\"-1\"])",
    ].join(",");

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setNavigationOpen(false);
        return;
      }
      if (event.key !== "Tab" || !panel) return;

      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(focusableSelector),
      ).filter((element) => element.offsetParent !== null);
      if (focusable.length === 0) return;

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
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
      else trigger?.focus();
    };
  }, [isNavigationOpen]);

  return (
    <div className="app-shell">
      <div className="app-shell__desktop-nav"><AppSidebar /></div>
      {isNavigationOpen ? (
        <div className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button
            className="mobile-drawer__backdrop"
            type="button"
            aria-label="Close navigation"
            onClick={() => setNavigationOpen(false)}
          />
          <div className="mobile-drawer__panel" ref={drawerPanelRef}>
            <button
              ref={drawerCloseRef}
              className="mobile-drawer__close"
              type="button"
              aria-label="Close navigation"
              onClick={() => setNavigationOpen(false)}
            >
              <X aria-hidden="true" />
            </button>
            <AppSidebar onNavigate={() => setNavigationOpen(false)} />
          </div>
        </div>
      ) : null}
      <div className="app-shell__main">
        <AppHeader
          menuButtonRef={menuButtonRef}
          onOpenMenu={() => setNavigationOpen(true)}
        />
        <main><Outlet /></main>
      </div>
    </div>
  );
}
