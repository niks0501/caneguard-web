import { CalendarDays, ClipboardList, LandPlot, MapPinned, Table2 } from "lucide-react";
import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { Link, useLocation, useSearchParams } from "react-router";
import { PageContent, PageHeader } from "../components/layout/Page";
import { MonitoringCalendar } from "../components/reports/MonitoringCalendar";
import { LoadingState } from "../components/ui/States";
import { SubmittedReportsPage } from "./SubmittedReportsPage";
import { FieldOperationsPage } from "./FieldOperationsPage";
import {
  monitoringViewLink,
  scopeNoticeMessage,
  type WorkspaceView,
} from "./workspaceScope";

const FieldValidationMapPage = lazy(() =>
  import("./FieldValidationMapPage").then(({ FieldValidationMapPage: Page }) => ({ default: Page })),
);
const BoundariesPage = lazy(() =>
  import("./BoundariesPage").then(({ BoundariesPage: Page }) => ({ default: Page })),
);

const views: Array<{ key: WorkspaceView; label: string; icon: ReactNode }> = [
  { key: "register", label: "List", icon: <Table2 aria-hidden="true" /> },
  { key: "calendar", label: "Calendar", icon: <CalendarDays aria-hidden="true" /> },
  { key: "map", label: "Map", icon: <MapPinned aria-hidden="true" /> },
  { key: "field-operations", label: "Assignments", icon: <ClipboardList aria-hidden="true" /> },
  { key: "boundaries", label: "Field boundaries", icon: <LandPlot aria-hidden="true" /> },
];

/** Visits opens on the map; the other four views stay one link away. */
function viewFromUrl(value: string | null): WorkspaceView {
  return value === "register" || value === "calendar" || value === "field-operations" || value === "boundaries" ? value : "map";
}

export function MonitoringWorkspacePage() {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const view = viewFromUrl(searchParams.get("view"));
  // Navigation state survives Back/Forward, so the removed-filter notice lasts
  // exactly as long as the scope change it explains.
  const scopeNotice = scopeNoticeMessage(
    (location.state as { scopeNotice?: string[] } | null)?.scopeNotice ?? [],
  );

  return (
    <PageContent>
      <PageHeader title="Visits" />
      <nav className="monitoring-workspace-tabs" aria-label="Visits views">
        <span className="monitoring-workspace-tabs__label">Workspace views</span>
        {views.map(({ key, label, icon }) => {
          const link = monitoringViewLink(key, searchParams);
          return (
            <Link
              key={key}
              to={link.to}
              state={link.removed.length > 0 ? { scopeNotice: link.removed } : undefined}
              className={view === key ? "is-active" : undefined}
              aria-current={view === key ? "page" : undefined}
            >
              {icon}<span>{label}</span>
            </Link>
          );
        })}
        <Link className="monitoring-workspace-tabs__saved" to="/needs-assessment">Needs assessment</Link>
      </nav>
      {scopeNotice ? <p className="queue-refresh-warning" role="status">{scopeNotice}</p> : null}
      {view === "register" ? <SubmittedReportsPage workspace="monitoring" embedded /> : null}
      {view === "calendar" ? <MonitoringCalendar /> : null}
      {view === "map" ? (
        <Suspense fallback={<LoadingState message="Loading the monitoring map..." />}>
          <FieldValidationMapPage embedded />
        </Suspense>
      ) : null}
      {view === "field-operations" ? <FieldOperationsPage embedded /> : null}
      {view === "boundaries" ? (
        <Suspense fallback={<LoadingState message="Loading field boundaries..." />}>
          <BoundariesPage embedded />
        </Suspense>
      ) : null}
    </PageContent>
  );
}
