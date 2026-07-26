import { Bell, Menu, Search } from "lucide-react";
import { useLocation } from "react-router";
import { useAuth } from "../../auth/useAuth";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export function AppHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const location = useLocation();
  const auth = useAuth();
  const isDetail = location.pathname.startsWith("/reports/");

  return (
    <header className="app-header">
      <div className="app-header__context">
        <button
          className="header-icon header-icon--menu"
          type="button"
          aria-label="Open navigation"
          onClick={onOpenMenu}
        >
          <Menu aria-hidden="true" />
        </button>
        <div>
          <span>Case monitoring</span>
          <strong>{isDetail ? "Case review" : "Submitted reports"}</strong>
        </div>
      </div>
      <div className="app-header__actions">
        <button className="header-search" type="button" aria-label="Search reports">
          <Search aria-hidden="true" />
          <span>Search reports</span>
          <kbd>/</kbd>
        </button>
        <button className="header-icon" type="button" aria-label="Notifications">
          <Bell aria-hidden="true" />
          <span className="notification-dot" />
        </button>
        <span className="avatar" aria-label={auth.user?.name}>
          {initials(auth.user?.name ?? "CaneGuard user")}
        </span>
      </div>
    </header>
  );
}
