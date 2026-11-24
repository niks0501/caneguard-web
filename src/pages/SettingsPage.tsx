import { useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import { useAuth } from "../auth/useAuth";
import { PageContent, PageHeader } from "../components/layout/Page";
import { settingsSections } from "./settings/settingsSections";

/** Settings shell: a rail of real links; each link opens one section on its own page. */
export function SettingsPage() {
  const isAdmin = useAuth().user?.role === "admin";
  const { pathname } = useLocation();
  const visible = settingsSections.filter((section) => !section.adminOnly || isAdmin);
  const current = visible.find((section) => pathname.replace(/\/+$/, "") === section.path);

  useEffect(() => {
    document.title = `${current?.label ?? "Account settings"} | Settings | CaneGuard`;
  }, [current]);

  const railLink = (section: (typeof visible)[number]) => (
    <NavLink key={section.id} to={section.path}>
      {section.label}
    </NavLink>
  );

  return (
    <PageContent className="settings-page">
      <PageHeader
        title="Account settings"
        description="Your profile, sign-in details and connected inspection devices."
      />

      <div className="settings-shell">
        <nav className="settings-rail" aria-label="Settings sections">
          <p className="settings-rail__group">Account</p>
          {visible.filter((section) => section.group === "Account").map(railLink)}
          {isAdmin ? (
            <>
              <p className="settings-rail__group">Workspace</p>
              {visible.filter((section) => section.group === "Workspace").map(railLink)}
            </>
          ) : null}
        </nav>

        <div className="settings-main">
          <Outlet />
        </div>
      </div>
    </PageContent>
  );
}
