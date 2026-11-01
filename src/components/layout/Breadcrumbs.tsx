import { Link, useLocation } from "react-router";
import { routes } from "../../app/routes";

interface Crumb {
  label: string;
  to?: string;
}

const sectionLabels: Record<string, Crumb> = {
  "needs-assessment": { label: "Needs assessment", to: routes.needsAssessment },
  reports: { label: "Reports", to: routes.reports },
  monitoring: { label: "Visits", to: routes.monitoring },
  map: { label: "Visits", to: routes.monitoring },
  settings: { label: "Settings", to: routes.settings },
  accounts: { label: "User Management", to: routes.accounts },
  "report-approval": { label: "Report Approval", to: routes.reportApproval },
  "admin-settings": { label: "Admin Settings", to: routes.adminSettings },
};

/**
 * Builds the trail from the path alone: the section name, plus the case
 * reference or account id when a detail page is open. Home has no trail.
 */
function breadcrumbsFor(pathname: string): Crumb[] {
  const [section, detail] = pathname.split("/").filter(Boolean);
  const crumb = section ? sectionLabels[section] : undefined;
  if (!crumb) return [];

  const trail: Crumb[] = [{ label: "Home", to: routes.dashboard }];
  if (!detail) return [...trail, { label: crumb.label }];

  let decoded = detail;
  try {
    decoded = decodeURIComponent(detail);
  } catch {
    // A malformed escape keeps the raw segment.
  }
  return [...trail, crumb, { label: decoded }];
}

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const trail = breadcrumbsFor(pathname);
  if (trail.length === 0) return null;

  return (
    <nav className="breadcrumbs" aria-label="Breadcrumb">
      <ol>
        {trail.map((crumb, index) => {
          const isCurrent = index === trail.length - 1;
          return (
            <li key={`${index}-${crumb.label}`}>
              {isCurrent || !crumb.to ? (
                <span aria-current={isCurrent ? "page" : undefined}>{crumb.label}</span>
              ) : (
                <Link to={crumb.to}>{crumb.label}</Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
