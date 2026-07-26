import {
  BarChart3,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  MapPinned,
  ShieldCheck,
  Sprout,
  UploadCloud,
} from "lucide-react";
import { NavLink } from "react-router";
import { routes } from "../../app/routes";
import { useAuth } from "../../auth/useAuth";

const futureLinks = [
  { label: "Barangay monitoring", icon: MapPinned },
  { label: "Analytics", icon: BarChart3 },
];

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const auth = useAuth();
  const logout = () => {
    onNavigate?.();
    void auth.logout();
  };

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="brand">
        <span className="brand__mark"><Sprout aria-hidden="true" /></span>
        <span><strong>CaneGuard</strong><small>Municipal workspace</small></span>
      </div>

      <nav className="sidebar__nav">
        <p>Monitoring</p>
        <NavLink
          className={({ isActive }) => `sidebar-link${isActive ? " is-active" : ""}`}
          to={routes.dashboard}
          onClick={onNavigate}
        >
          <LayoutDashboard aria-hidden="true" />
          <span>Overview</span>
          <ChevronRight className="sidebar-link__arrow" aria-hidden="true" />
        </NavLink>
        {futureLinks.map(({ label, icon: Icon }) => (
          <button className="sidebar-link" disabled key={label} title="Planned screen">
            <Icon aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
        <NavLink
          className={({ isActive }) => `sidebar-link${isActive ? " is-active" : ""}`}
          to={routes.reports}
          onClick={onNavigate}
        >
          <ShieldCheck aria-hidden="true" />
          <span>Submitted reports</span>
          <ChevronRight className="sidebar-link__arrow" aria-hidden="true" />
        </NavLink>
      </nav>

      <div className="sidebar__footer">
        <div className="sync-card">
          <UploadCloud aria-hidden="true" />
          <div><strong>Field sync active</strong><span>Last checked 4 min ago</span></div>
        </div>
        <button className="user-summary" type="button" onClick={logout}>
          <span className="avatar">
            {auth.user?.name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part.charAt(0))
              .join("")
              .toUpperCase()}
          </span>
          <div>
            <strong>{auth.user?.name}</strong>
            <span>{auth.user?.role === "admin" ? "Administrator" : "Reviewer"}</span>
          </div>
          <LogOut aria-hidden="true" />
          <span className="sr-only">Sign out</span>
        </button>
      </div>
    </aside>
  );
}
