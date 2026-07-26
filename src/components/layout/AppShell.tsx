import { useState } from "react";
import { Outlet } from "react-router";
import { X } from "lucide-react";
import { AppSidebar } from "../navigation/AppSidebar";
import { AppHeader } from "./AppHeader";

export function AppShell() {
  const [isNavigationOpen, setNavigationOpen] = useState(false);

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
          <div className="mobile-drawer__panel">
            <button
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
        <AppHeader onOpenMenu={() => setNavigationOpen(true)} />
        <main><Outlet /></main>
      </div>
    </div>
  );
}
