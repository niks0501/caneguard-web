import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { X } from "lucide-react";
import { AppSidebar } from "../navigation/AppSidebar";
import { useRealtimeInvalidation } from "../../hooks/useRealtimeInvalidation";
import { AppHeader } from "./AppHeader";
import { BackToTop } from "./BackToTop";
import { Breadcrumbs } from "./Breadcrumbs";

export function AppShell() {
  const [isNavigationOpen, setNavigationOpen] = useState(false);
  const realtime = useRealtimeInvalidation();
  const location = useLocation();
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerPanelRef = useRef<HTMLDivElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const path = location.pathname;
    if (path.startsWith("/reports/")) {
      document.title = "CaneGuard | Case Review";
    } else if (path.startsWith("/reports")) {
      document.title = "CaneGuard | Submitted Reports";
    } else if (path.startsWith("/needs-assessment")) {
      document.title = "CaneGuard | Needs assessment";
    } else if (path.startsWith("/monitoring")) {
      document.title = "CaneGuard | Visits";
    } else if (path.startsWith("/map")) {
      document.title = "CaneGuard | Field-Validation Map";
    } else if (path.startsWith("/dashboard")) {
      document.title = "CaneGuard | Dashboard";
    } else {
      document.title = "CaneGuard | Municipal Workspace";
    }
  }, [location.pathname]);

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

    const hasNestedModal = () => {
      const drawer = drawerRef.current;
      if (!drawer) return false;
      return Array.from(
        document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'),
      ).some((dialog) => !drawer.contains(dialog));
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (hasNestedModal()) return;
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
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className="app-shell__desktop-nav"><AppSidebar /></div>
      {isNavigationOpen ? (
        <div ref={drawerRef} className="mobile-drawer" role="dialog" aria-modal="true" aria-label="Navigation menu">
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
          realtimeStatus={realtime.status}
        />
        <Breadcrumbs />
        <main id="main-content" tabIndex={-1}>
          {location.state?.notice === "That section needs an Admin account." ? <p className="route-notice" role="status">{location.state.notice}</p> : null}
          <Outlet />
        </main>
      </div>
      <BackToTop />
    </div>
  );
}
