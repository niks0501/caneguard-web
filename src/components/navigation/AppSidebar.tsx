import {
  CalendarDays,
  SquareCheck,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { NavLink } from "react-router";
import { routes } from "../../app/routes";
import { useAuth } from "../../auth/useAuth";
import caneGuardLogo from "../../assets/brand/cane_guard_logo.png";

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const auth = useAuth();
  const logout = () => {
    onNavigate?.();
    void auth.logout();
  };

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="brand">
        <span className="brand__mark">
          <img src={caneGuardLogo} alt="" aria-hidden="true" />
        </span>
        <span><strong>CaneGuard</strong><small>SRA Don Pedro Mill District Office</small></span>
      </div>

      <nav className="sidebar__nav">
        <p>Monitoring</p>
        <NavLink
          className={({ isActive }) => `sidebar-link${isActive ? " is-active" : ""}`}
          to={routes.dashboard}
          onClick={onNavigate}
        >
          <LayoutDashboard aria-hidden="true" />
          <span>Dashboard</span>
          <ChevronRight className="sidebar-link__arrow" aria-hidden="true" />
        </NavLink>
        <NavLink
          className={({ isActive }) => `sidebar-link${isActive ? " is-active" : ""}`}
          to={routes.needsAssessment}
          onClick={onNavigate}
        >
          <SquareCheck aria-hidden="true" />
          <span>Case Review</span>
          <ChevronRight className="sidebar-link__arrow" aria-hidden="true" />
        </NavLink>
        <NavLink
          className={({ isActive }) => `sidebar-link${isActive ? " is-active" : ""}`}
          to={routes.reports}
          onClick={onNavigate}
        >
          <ShieldCheck aria-hidden="true" />
          <span>Reports</span>
          <ChevronRight className="sidebar-link__arrow" aria-hidden="true" />
        </NavLink>
        {auth.user?.role === "reviewer" || auth.user?.role === "admin" ? (
          <NavLink
            className={({ isActive }) => `sidebar-link${isActive ? " is-active" : ""}`}
            to={routes.monitoring}
            onClick={onNavigate}
          >
            <CalendarDays aria-hidden="true" />
            <span>Monitoring / Map</span>
            <ChevronRight className="sidebar-link__arrow" aria-hidden="true" />
          </NavLink>
        ) : null}
        {auth.user?.role === "admin" ? (
          <>
            <p>Administration</p>
            <NavLink className={({ isActive }) => `sidebar-link${isActive ? " is-active" : ""}`} to={routes.reportApproval} onClick={onNavigate}>
              <ShieldCheck aria-hidden="true" /><span>Report Approval</span><ChevronRight className="sidebar-link__arrow" aria-hidden="true" />
            </NavLink>
            <NavLink className={({ isActive }) => `sidebar-link${isActive ? " is-active" : ""}`} to={routes.accounts} onClick={onNavigate}>
              <Users aria-hidden="true" /><span>User Management</span><ChevronRight className="sidebar-link__arrow" aria-hidden="true" />
            </NavLink>
            <NavLink className={({ isActive }) => `sidebar-link${isActive ? " is-active" : ""}`} to={routes.adminSettings} onClick={onNavigate}>
              <Settings aria-hidden="true" /><span>Admin Settings</span><ChevronRight className="sidebar-link__arrow" aria-hidden="true" />
            </NavLink>
          </>
        ) : null}
        <p>Account</p>
        <NavLink
          className={({ isActive }) => `sidebar-link${isActive ? " is-active" : ""}`}
          to={routes.settings}
          onClick={onNavigate}
        >
          <Settings aria-hidden="true" />
          <span>Settings</span>
          <ChevronRight className="sidebar-link__arrow" aria-hidden="true" />
        </NavLink>
      </nav>

      <div className="sidebar__footer">
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
