import { CalendarDays, ClipboardList, LandPlot, MapPinned, Table2 } from "lucide-react";
import { lazy, Suspense } from "react";
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { routes } from "../app/routes";
import { PageContent, PageHeader } from "../components/layout/Page";
import { MonitoringCalendar } from "../components/reports/MonitoringCalendar";
import { LoadingState } from "../components/ui/States";
import { SubmittedReportsPage } from "./SubmittedReportsPage";
import { FieldOperationsPage } from "./FieldOperationsPage";

const FieldValidationMapPage = lazy(() =>
  import("./FieldValidationMapPage").then(({ FieldValidationMapPage: Page }) => ({ default: Page })),
);
const BoundariesPage = lazy(() =>
  import("./BoundariesPage").then(({ BoundariesPage: Page }) => ({ default: Page })),
);

type MonitoringView = "register" | "calendar" | "map" | "field-operations" | "boundaries";

const views: Array<{ key: MonitoringView; label: string; icon: ReactNode }> = [
  { key: "register", label: "Register", icon: <Table2 aria-hidden="true" /> },
  { key: "calendar", label: "Calendar", icon: <CalendarDays aria-hidden="true" /> },
  { key: "map", label: "Map", icon: <MapPinned aria-hidden="true" /> },
  { key: "field-operations", label: "Field Operations", icon: <ClipboardList aria-hidden="true" /> },
  { key: "boundaries", label: "Field boundaries", icon: <LandPlot aria-hidden="true" /> },
];

function viewFromUrl(value: string | null): MonitoringView {
  return value === "calendar" || value === "map" || value === "field-operations" || value === "boundaries" ? value : "register";
}

export function MonitoringWorkspacePage() {
  const [searchParams] = useSearchParams();
  const view = viewFromUrl(searchParams.get("view"));

  return (
    <PageContent>
      <PageHeader title="Monitoring workspace" />
      <nav className="monitoring-workspace-tabs" aria-label="Monitoring workspace views">
        <span className="monitoring-workspace-tabs__label">Workspace views</span>
        {views.map(({ key, label, icon }) => (
          <Link
            key={key}
            to={key === "register" ? routes.monitoring : `${routes.monitoring}?view=${key}`}
            className={view === key ? "is-active" : undefined}
            aria-current={view === key ? "page" : undefined}
          >
            {icon}<span>{label}</span>
          </Link>
        ))}
        <Link className="monitoring-workspace-tabs__saved" to={routes.needsAssessment}>Needs assessment</Link>
      </nav>
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
