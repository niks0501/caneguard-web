import { Link, useLocation } from "react-router";
import { routes } from "../../app/routes";

const sectionLabels: Record<string, string> = {
  "needs-assessment": "Needs assessment",
  reports: "Reports",
  monitoring: "Visits",
  map: "Visits",
  settings: "Settings",
  accounts: "User Management",
  "report-approval": "Report Approval",
  "admin-settings": "Admin Settings",
};

/** Stops at the section name: Home has no trail and detail pages add no crumb. */
function sectionLabelFor(pathname: string): string | null {
  const [section] = pathname.split("/").filter(Boolean);
  return (section ? sectionLabels[section] : undefined) ?? null;
}

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const label = sectionLabelFor(pathname);
  if (!label) return null;

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        <li>
          <Link to={routes.dashboard}>Home</Link>
        </li>
        <li>
          <span aria-current="page">{label}</span>
        </li>
      </ol>
    </nav>
  );
}
