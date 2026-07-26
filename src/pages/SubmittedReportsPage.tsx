import { useDeferredValue, useEffect, useState } from "react";
import { ClipboardCheck, Clock3, MapPin, RefreshCw, Rows3 } from "lucide-react";
import { useLocation } from "react-router";
import { PageContent, PageHeader } from "../components/layout/Page";
import { MetricCard } from "../components/reports/MetricCard";
import { ReportTable } from "../components/reports/ReportTable";
import { Button } from "../components/ui/Button";
import { SearchInput, SelectFilter } from "../components/ui/FormControls";
import { Pagination } from "../components/ui/Pagination";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  NoResultsState,
} from "../components/ui/States";
import { diseaseLabels, reviewStatusLabels } from "../domain/report.metadata";
import type { DiseaseKey, DiseaseReport, ReviewStatus } from "../domain/report.types";
import { reportsRepository } from "../services/reports.service";

const pageSize = 5;

type SortOption = "newest" | "oldest" | "confidence";

const initialFilters = {
  search: "",
  status: "all" as ReviewStatus | "all",
  disease: "all" as DiseaseKey | "all",
  barangay: "all",
  date: "all",
  sort: "newest" as SortOption,
};

export function SubmittedReportsPage() {
  const location = useLocation();
  const [reports, setReports] = useState<DiseaseReport[]>([]);
  const [filters, setFilters] = useState(initialFilters);
  const [currentPage, setCurrentPage] = useState(1);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [filterReferenceTime] = useState(() => Date.now());
  const deferredSearch = useDeferredValue(filters.search);

  useEffect(() => {
    let active = true;
    reportsRepository
      .listReports()
      .then((data) => {
        if (active) {
          setReports(data);
          setState("ready");
        }
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const barangays = [...new Set(reports.map((report) => report.barangay))].sort();
  const filteredReports = reports
    .filter((report) => {
      const search = deferredSearch.trim().toLowerCase();
      const matchesSearch =
        !search ||
        [report.id, report.submittedByName, report.barangay, diseaseLabels[report.predictedDisease]]
          .some((value) => value.toLowerCase().includes(search));
      const matchesStatus = filters.status === "all" || report.reviewStatus === filters.status;
      const matchesDisease = filters.disease === "all" || report.predictedDisease === filters.disease;
      const matchesBarangay = filters.barangay === "all" || report.barangay === filters.barangay;
      const reportDate = new Date(report.submittedAt);
      const dayAge = (filterReferenceTime - reportDate.getTime()) / 86_400_000;
      const matchesDate =
        filters.date === "all" ||
        (filters.date === "7_days" && dayAge <= 7) ||
        (filters.date === "30_days" && dayAge <= 30);
      return matchesSearch && matchesStatus && matchesDisease && matchesBarangay && matchesDate;
    })
    .sort((a, b) => {
      if (filters.sort === "confidence") return b.confidence - a.confidence;
      const difference = new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      return filters.sort === "newest" ? difference : -difference;
    });

  const pageCount = Math.max(1, Math.ceil(filteredReports.length / pageSize));
  const visibleReports = filteredReports.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const pendingCount = reports.filter((report) => report.reviewStatus === "pending_review").length;
  const fieldCount = reports.filter(
    (report) => report.reviewStatus === "needs_field_verification",
  ).length;

  const updateFilter = <Key extends keyof typeof initialFilters>(
    key: Key,
    value: (typeof initialFilters)[Key],
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setFilters(initialFilters);
    setCurrentPage(1);
  };

  const reviewNotice = (location.state as { notice?: string } | null)?.notice;

  return (
    <PageContent>
      <PageHeader
        eyebrow="Case monitoring"
        title="Submitted reports"
        description="Review field observations and decide the appropriate municipal follow-up."
        actions={
          <Button variant="secondary" icon={<RefreshCw aria-hidden="true" />} onClick={() => setLoadAttempt((value) => value + 1)}>
            Refresh queue
          </Button>
        }
      />

      {reviewNotice ? <div className="success-banner" role="status"><ClipboardCheck aria-hidden="true" />{reviewNotice}</div> : null}

      <section className="metric-grid" aria-label="Report work queue summary">
        <MetricCard label="All reports" value={String(reports.length).padStart(2, "0")} context="Current mock dataset" icon={<Rows3 aria-hidden="true" />} />
        <MetricCard label="Needs review" value={String(pendingCount).padStart(2, "0")} context="Awaiting an office action" icon={<Clock3 aria-hidden="true" />} />
        <MetricCard label="Field follow-up" value={String(fieldCount).padStart(2, "0")} context="Marked for observation" icon={<MapPin aria-hidden="true" />} />
      </section>

      <section className="report-workspace" aria-labelledby="report-table-heading">
        <div className="workspace-heading">
          <div><p className="eyebrow">Work queue</p><h2 id="report-table-heading">Recent submissions</h2></div>
          <span>{filteredReports.length} matching reports</span>
        </div>
        <div className="filter-bar">
          <SearchInput
            value={filters.search}
            placeholder="Search ID, submitter, barangay..."
            onChange={(event) => updateFilter("search", event.target.value)}
          />
          <SelectFilter label="Status" value={filters.status} onChange={(event) => updateFilter("status", event.target.value as ReviewStatus | "all")}>
            <option value="all">All statuses</option>
            {Object.entries(reviewStatusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </SelectFilter>
          <SelectFilter label="Possible disease" value={filters.disease} onChange={(event) => updateFilter("disease", event.target.value as DiseaseKey | "all")}>
            <option value="all">All results</option>
            {Object.entries(diseaseLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}
          </SelectFilter>
          <SelectFilter label="Barangay" value={filters.barangay} onChange={(event) => updateFilter("barangay", event.target.value)}>
            <option value="all">All barangays</option>
            {barangays.map((barangay) => <option value={barangay} key={barangay}>{barangay}</option>)}
          </SelectFilter>
          <SelectFilter label="Date range" value={filters.date} onChange={(event) => updateFilter("date", event.target.value)}>
            <option value="all">Any date</option>
            <option value="7_days">Last 7 days</option>
            <option value="30_days">Last 30 days</option>
          </SelectFilter>
          <SelectFilter label="Sort by" value={filters.sort} onChange={(event) => updateFilter("sort", event.target.value as SortOption)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="confidence">Model confidence</option>
          </SelectFilter>
        </div>

        {state === "loading" ? <LoadingState /> : null}
        {state === "error" ? <ErrorState onRetry={() => { setState("loading"); setLoadAttempt((value) => value + 1); }} /> : null}
        {state === "ready" && reports.length === 0 ? <EmptyState /> : null}
        {state === "ready" && reports.length > 0 && filteredReports.length === 0 ? <NoResultsState onClear={clearFilters} /> : null}
        {state === "ready" && visibleReports.length > 0 ? (
          <>
            <ReportTable reports={visibleReports} />
            <Pagination currentPage={currentPage} pageCount={pageCount} itemCount={filteredReports.length} onPageChange={setCurrentPage} />
          </>
        ) : null}
      </section>
    </PageContent>
  );
}
