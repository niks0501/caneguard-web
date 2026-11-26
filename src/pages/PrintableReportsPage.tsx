import { useMemo } from "react";
import { CalendarCheck2, ListFilter } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";
import { routes } from "../app/routes";
import { PageContent, PageHeader } from "../components/layout/Page";
import { ReportDocumentBuilder } from "../components/reports/ReportDocumentBuilder";
import { WeeklyReportsHub } from "../components/reports/WeeklyReportsHub";
import { printableScopeFromSearch } from "../components/reports/reportBuilderScope";

type ReportsTab = "weekly" | "custom";

function tabFromSearch(value: string | null): ReportsTab {
  return value === "custom" ? "custom" : "weekly";
}

export function PrintableReportsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = tabFromSearch(searchParams.get("type"));
  const initialWeek = searchParams.get("week") ?? undefined;
  // The arriving work scope is read once, so editing the filters never re-seeds them.
  const scope = useMemo(() => printableScopeFromSearch(searchParams), []); // eslint-disable-line react-hooks/exhaustive-deps

  function switchTab(nextTab: ReportsTab) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("type", nextTab);
      return next;
    }, { replace: true });
  }

  return (
    <PageContent className="reports-page">
      <PageHeader
        title="Reports"
        description="Weekly 5-disease and RSSI packages are built automatically each week for verification and Gmail hand-off."
      />
      <div className="report-entries report-entries--two" role="group" aria-label="Report workspace">
        <button
          type="button"
          className="report-entries__item"
          aria-pressed={activeTab === "weekly"}
          onClick={() => switchTab("weekly")}
        >
          <CalendarCheck2 aria-hidden="true" size={20} />
          <span>Weekly reports</span>
        </button>
        <button
          type="button"
          className="report-entries__item"
          aria-pressed={activeTab === "custom"}
          onClick={() => switchTab("custom")}
        >
          <ListFilter aria-hidden="true" size={20} />
          <span>Custom list</span>
        </button>
      </div>
      {activeTab === "weekly" ? (
        <WeeklyReportsHub initialWeek={initialWeek} />
      ) : (
        <ReportDocumentBuilder mode="custom" scope={scope} onClose={() => navigate(routes.reports)} />
      )}
    </PageContent>
  );
}
