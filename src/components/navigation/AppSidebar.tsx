import {
  FileText,
  FolderOpen,
  ListTodo,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { NavLink, useLocation } from "react-router";
import { routes } from "../../app/routes";
import { useAuth } from "../../auth/useAuth";
import caneGuardLogo from "../../assets/brand/cane_guard_logo.png";
import caneGuardLogoOnDark from "../../assets/brand/cane_guard_logo_onDark.png";
import { useTheme } from "../../theme/useTheme";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";

function SidebarLink({
  to,
  icon,
  onNavigate,
  active,
  children,
}: {
  to: string;
  icon: ReactNode;
  onNavigate?: () => void;
  /** Overrides the default path-prefix match when two entries share a prefix. */
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <NavLink
      className={({ isActive }) => `sidebar-link${(active ?? isActive) ? " is-active" : ""}`}
      aria-current={active === undefined ? undefined : active ? "page" : "false"}
      to={to}
      onClick={onNavigate}
    >
      {icon}
      <span>{children}</span>
    </NavLink>
  );
}

export function AppSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const auth = useAuth();
  const { pathname } = useLocation();
  const onReportsPage = pathname.replace(/\/+$/, "") === routes.printableReports;
  const theme = useTheme();
  const [confirmingSignOut, setConfirmingSignOut] = useState(false);
  const logout = () => {
    setConfirmingSignOut(false);
    onNavigate?.();
    void auth.logout();
  };

  return (
    <aside className="sidebar" aria-label="Primary navigation">
      <div className="brand">
        <span className="brand__mark">
          <img
            src={theme === "dark" ? caneGuardLogoOnDark : caneGuardLogo}
            alt=""
            aria-hidden="true"
          />
        </span>
        <span><strong>CaneGuard</strong><small>SRA Don Pedro Mill District Office</small></span>
      </div>

      <nav className="sidebar__nav" aria-label="Workspace">
        <SidebarLink to={routes.dashboard} icon={<LayoutDashboard aria-hidden="true" />} onNavigate={onNavigate}>
          Home
        </SidebarLink>
        <div className="sidebar__group" role="group" aria-label="Work">
          <SidebarLink to={routes.todo} icon={<ListTodo aria-hidden="true" />} onNavigate={onNavigate}>
            To do
          </SidebarLink>
          <SidebarLink
            to={routes.reports}
            icon={<FolderOpen aria-hidden="true" />}
            active={pathname.startsWith(routes.reports) && !onReportsPage}
            onNavigate={onNavigate}
          >
            Cases
          </SidebarLink>
          {auth.user?.role === "reviewer" || auth.user?.role === "admin" ? (
            <SidebarLink to={routes.monitoring} icon={<MapPinned aria-hidden="true" />} onNavigate={onNavigate}>
              Field visits
            </SidebarLink>
          ) : null}
          <SidebarLink
            to={routes.printableReports}
            icon={<FileText aria-hidden="true" />}
            active={onReportsPage}
            onNavigate={onNavigate}
          >
            Reports
          </SidebarLink>
        </div>
        {auth.user?.role === "admin" ? (
          <div className="sidebar__group" role="group" aria-label="Administration">
            <p>Administration</p>
            <SidebarLink to={routes.reportApproval} icon={<ShieldCheck aria-hidden="true" />} onNavigate={onNavigate}>
              Report Approval
            </SidebarLink>
            <SidebarLink to={routes.accounts} icon={<Users aria-hidden="true" />} onNavigate={onNavigate}>
              User Management
            </SidebarLink>
            <SidebarLink to={routes.adminSettings} icon={<SlidersHorizontal aria-hidden="true" />} onNavigate={onNavigate}>
              Admin Settings
            </SidebarLink>
          </div>
        ) : null}
        <div className="sidebar__group" role="group" aria-label="Account">
          <SidebarLink to={routes.settings} icon={<Settings aria-hidden="true" />} onNavigate={onNavigate}>
            Settings
          </SidebarLink>
        </div>
      </nav>

      <div className="sidebar__footer">
        <button className="user-summary" type="button" onClick={() => setConfirmingSignOut(true)}>
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
      {confirmingSignOut
        ? createPortal(
            <Modal
              id="sign-out-confirm"
              title="Sign out?"
              open
              onClose={() => setConfirmingSignOut(false)}
              footer={
                <>
                  <Button variant="secondary" onClick={() => setConfirmingSignOut(false)}>
                    Cancel
                  </Button>
                  <Button onClick={logout}>Sign out</Button>
                </>
              }
            >
              <p>You will need to sign in again to continue.</p>
            </Modal>,
            document.body,
          )
        : null}
    </aside>
  );
}
