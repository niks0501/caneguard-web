import {
  useDeferredValue,
  useEffect,
  useState,
  useMemo,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Download, RefreshCw } from "lucide-react";
import {
  Link,
  useLocation,
  useSearchParams,
} from "react-router";
import { ZodError } from "zod";
import { ApiError, isApiConnectionError } from "../api/ApiError";
import { routes } from "../app/routes";
import { PageContent, PageHeader } from "../components/layout/Page";
import { MonitoringCalendar } from "../components/reports/MonitoringCalendar";
import { ReportTable } from "../components/reports/ReportTable";
import { ReportDocumentBuilder } from "../components/reports/ReportDocumentBuilder";
import { Button } from "../components/ui/Button";
import { SearchInput, SelectFilter } from "../components/ui/FormControls";
import { Pagination } from "../components/ui/Pagination";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  NoResultsState,
} from "../components/ui/States";
import {
  authorityClassifiedConditionLabels,
  caseStateLabels,
  diseaseLabels,
  fieldValidationStateLabels,
  reviewStatusLabels,
  verificationOutcomeLabels,
} from "../domain/report.metadata";
import type { ReportFilters } from "../domain/report.types";
import { reportKeys } from "../hooks/reportQueries";
import { useExportReports, useReports } from "../hooks/useReports";
import {
  parseReportListUrl,
} from "./reportListUrlState";

type FilterKey =
  | "search"
  | "queue"
  | "referral"
  | "status"
  | "case_state"
  | "verification_outcome"
  | "field_validation_state"
  | "authority_classified_condition"
  | "concern"
  | "predicted_label"
  | "barangay"
  | "date_from"
  | "date_to"
  | "sort";

function isInvalidQueryError(error: unknown) {
  return error instanceof ApiError && error.status === 422;
}

function isAccessDeniedError(error: unknown) {
  return error instanceof ApiError && error.status === 403;
}

function isRateLimitedError(error: unknown) {
  return error instanceof ApiError && error.status === 429;
}

function isMalformedDataError(error: unknown) {
  return error instanceof ZodError;
}

const queueLabels = {
  needs_review: "Needs Review",
  needs_visit: "Needs Visit",
  follow_up_due: "Follow-up Due",
  upcoming: "Upcoming Visits",
  unverified_no_active_work: "Unverified, no active work",
} as const;

export function SubmittedReportsPage({
  workspace = "reports",
  embedded = false,
}: {
  workspace?: "reports" | "monitoring";
  embedded?: boolean;
}) {
  const isMonitoring = workspace === "monitoring";
  const [reportBuilderOpen, setReportBuilderOpen] = useState(false);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const urlState = useMemo(
    () => parseReportListUrl(searchParams),
    [searchParams],
  );
  const deferredSearch = useDeferredValue(urlState.filters.search);
  const queryFilters = useMemo<ReportFilters>(
    () => ({
      ...urlState.filters,
      search: deferredSearch?.trim() || undefined,
      barangay: urlState.filters.barangay?.trim() || undefined,
    }),
    [deferredSearch, urlState.filters],
  );
  const exportFilters = useMemo<ReportFilters>(
    () => ({
      ...urlState.filters,
      search: urlState.filters.search?.trim() || undefined,
      barangay: urlState.filters.barangay?.trim() || undefined,
    }),
    [urlState.filters],
  );
  const reportsQuery = useReports(queryFilters, {
    enabled: !urlState.invalid,
  });
  const exportReports = useExportReports();
  const reports = reportsQuery.data?.reports ?? [];
  const meta = reportsQuery.data?.meta;
  const activeQueueLabel = urlState.filters.referral === "active"
    ? "Out with experts"
    : urlState.filters.queue
      ? queueLabels[urlState.filters.queue]
      : undefined;

  useEffect(() => {
    if (
      meta &&
      meta.total > 0 &&
      meta.currentPage > meta.lastPage
    ) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("page", String(meta.lastPage));
        return next;
      }, { replace: true });
    }
  }, [meta, setSearchParams]);

  const updateFilter = (
    key: FilterKey,
    value: string,
    options: { replace?: boolean } = {},
  ) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      return next;
    }, options);
  };

  const setPage = (page: number) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      if (page === 1) next.delete("page");
      else next.set("page", String(page));
      return next;
    });
  };

  const clearFilters = () => {
    setSearchParams(new URLSearchParams());
  };

  const handleExport = async () => {
    try {
      const blob = await exportReports.mutateAsync(exportFilters);
      if (typeof URL.createObjectURL !== "function") return;

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "caneguard-case-export.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      // The mutation state renders the actionable export error message.
    }
  };

  const refreshQueue = () =>
    queryClient.invalidateQueries({
      queryKey: reportKeys.list(queryFilters),
      exact: true,
    });

  const reviewNotice = (location.state as { notice?: string } | null)?.notice;
  const invalidQuery =
    urlState.invalid || isInvalidQueryError(reportsQuery.error);
  const accessDenied = isAccessDeniedError(reportsQuery.error);
  const rateLimited = isRateLimitedError(reportsQuery.error);
  const malformedData = isMalformedDataError(reportsQuery.error);
  const connectionError = isApiConnectionError(reportsQuery.error);
  const hasCachedData = Boolean(reportsQuery.data);
  const hasDisplayableData =
    hasCachedData && !accessDenied && !urlState.invalid;
  const showInitialError =
    reportsQuery.isError && (!hasCachedData || accessDenied);

  return (
    <PageContent className={embedded ? "page-content--embedded" : undefined}>
      {!embedded ? <PageHeader
        title={isMonitoring ? "Monitoring workspace" : "Submitted reports"}
        actions={(
          <>
          <Button
            variant="primary"
            icon={<ClipboardCheck aria-hidden="true" />}
            onClick={() => setReportBuilderOpen(true)}
          >
            Generate report
          </Button>
          <Button
            variant="secondary"
            icon={<Download aria-hidden="true" />}
            disabled={
              exportReports.isPending ||
              reportsQuery.isFetching ||
              urlState.invalid ||
              !hasDisplayableData
            }
            onClick={() => void handleExport()}
          >
            {exportReports.isPending ? "Preparing CSV" : "Export CSV"}
          </Button>
          <Button
            variant="secondary"
            icon={
              <RefreshCw
                aria-hidden="true"
                className={reportsQuery.isFetching ? "spin" : undefined}
              />
            }
            disabled={
              reportsQuery.isFetching ||
              urlState.invalid ||
              !hasDisplayableData
            }
            onClick={refreshQueue}
          >
            {reportsQuery.isFetching ? "Refreshing queue" : "Refresh queue"}
          </Button>
          </>
        )}
      /> : null}

      {!isMonitoring ? (
        <nav className="monitoring-saved-views" aria-label="Report saved views">
          <span className="monitoring-saved-views__label">Saved views</span>
          <Link to={routes.reports} className={!urlState.filters.referral ? "is-active" : undefined}>All submitted reports</Link>
          <Link to={`${routes.reports}?referral=active&sort=due_soonest`} className={urlState.filters.referral === "active" ? "is-active" : undefined}>Out with experts</Link>
        </nav>
      ) : isMonitoring ? (
        <nav className="monitoring-saved-views" aria-label="Monitoring saved views">
          <span className="monitoring-saved-views__label">Saved views</span>
          <Link to={routes.monitoring} className={!urlState.hasActiveFilters ? "is-active" : undefined}>All monitoring cases</Link>
          <Link to={`${routes.monitoring}?concern=rssi`} className={urlState.filters.reportedConcern === "rssi" ? "is-active" : undefined}>RSSI concerns</Link>
          <Link to={`${routes.monitoring}?queue=follow_up_due`} className={urlState.filters.queue === "follow_up_due" ? "is-active" : undefined}>Follow-up due</Link>
          <Link to={`${routes.monitoring}?queue=upcoming`} className={urlState.filters.queue === "upcoming" ? "is-active" : undefined}>Upcoming visits</Link>
          {!embedded ? <Link to={`${routes.monitoring}?view=calendar`} className={searchParams.get("view") === "calendar" ? "is-active" : undefined}>Inspector schedule</Link> : null}
        </nav>
      ) : null}

      {reviewNotice ? (
        <div className="success-banner" role="status">
          <ClipboardCheck aria-hidden="true" />
          {reviewNotice}
        </div>
      ) : null}
      {exportReports.isError ? (
        <div className="dashboard-refresh-warning" role="alert">
          The filtered case export could not be downloaded. The report queue remains available.
        </div>
      ) : null}

      <section
        className="report-workspace"
        aria-labelledby="report-table-heading"
      >
        <div className="workspace-heading">
          <div>
            <h2 id="report-table-heading">{activeQueueLabel ?? (isMonitoring ? "Monitoring register" : "Recent submissions")}</h2>
          </div>
          <span>
            {activeQueueLabel
              ? "Filtered operational workspace"
              : meta && hasDisplayableData
                ? `${meta.total} matching ${
                    meta.total === 1 ? "report" : "reports"
                  }`
                : "Server-filtered queue"}
          </span>
        </div>

        <div className="filter-bar">
          <SearchInput
            value={urlState.filters.search ?? ""}
            maxLength={120}
            placeholder={isMonitoring ? "Search ID, farmer/farm, barangay..." : "Search ID, submitter, barangay..."}
            onChange={(event) =>
              updateFilter("search", event.target.value, { replace: true })
            }
          />
          <SelectFilter
            label="Queue"
            value={urlState.filters.queue ?? ""}
            onChange={(event) => updateFilter("queue", event.target.value)}
          >
            <option value="">All work queues</option>
            {Object.entries(queueLabels).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </SelectFilter>
          {!isMonitoring ? (
            <SelectFilter
              label="Referral view"
              value={urlState.filters.referral ?? ""}
              onChange={(event) => updateFilter("referral", event.target.value)}
            >
              <option value="">All referrals</option>
              <option value="active">Out with experts</option>
            </SelectFilter>
          ) : null}
          <SelectFilter
            label="Reported concern"
            value={urlState.filters.reportedConcern ?? ""}
            onChange={(event) => updateFilter("concern", event.target.value)}
          >
            <option value="">Any reported concern</option>
            <option value="rssi">RSSI</option>
          </SelectFilter>
          <SelectFilter
            label="Work status"
            value={urlState.filters.status ?? ""}
            onChange={(event) => updateFilter("status", event.target.value)}
          >
            <option value="">All work statuses</option>
            {Object.entries(reviewStatusLabels).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </SelectFilter>
          <SelectFilter
            label="Possible Condition"
            value={urlState.filters.disease ?? ""}
            onChange={(event) =>
              updateFilter("predicted_label", event.target.value)
            }
          >
            <option value="">All Possible Conditions</option>
            {Object.entries(diseaseLabels).map(([value, label]) => (
              <option value={value} key={value}>{label}</option>
            ))}
          </SelectFilter>
          <label className="select-filter">
            <span>Barangay</span>
            <input
              type="text"
              value={urlState.filters.barangay ?? ""}
              maxLength={120}
              placeholder="All barangays"
              onChange={(event) =>
                updateFilter("barangay", event.target.value, {
                  replace: true,
                })
              }
            />
          </label>
          <label className="select-filter">
            <span>From date</span>
            <input
              type="date"
              value={urlState.filters.dateFrom ?? ""}
              max={urlState.filters.dateTo}
              onChange={(event) =>
                updateFilter("date_from", event.target.value)
              }
            />
          </label>
          <label className="select-filter">
            <span>To date</span>
            <input
              type="date"
              value={urlState.filters.dateTo ?? ""}
              min={urlState.filters.dateFrom}
              onChange={(event) =>
                updateFilter("date_to", event.target.value)
              }
            />
          </label>
          <SelectFilter
            label="Sort by"
            value={urlState.filters.sort ?? "oldest"}
            onChange={(event) =>
              updateFilter("sort", event.target.value)
            }
          >
            <option value="oldest">Oldest submitted first</option>
            <option value="newest">Newest submitted first</option>
            <option value="due_soonest">Due soonest</option>
          </SelectFilter>
        </div>

        <details className="more-filters">
          <summary>More filters</summary>
          <div className="filter-bar">
            <SelectFilter
              label="Case state"
              value={urlState.filters.caseState ?? ""}
              onChange={(event) => updateFilter("case_state", event.target.value)}
            >
              <option value="">Any case state</option>
              {Object.entries(caseStateLabels).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </SelectFilter>
            <SelectFilter
              label="Verification outcome"
              value={urlState.filters.verificationOutcome ?? ""}
              onChange={(event) =>
                updateFilter("verification_outcome", event.target.value)
              }
            >
              <option value="">Any verification outcome</option>
              {Object.entries(verificationOutcomeLabels).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </SelectFilter>
            <SelectFilter
              label="Field validation state"
              value={urlState.filters.fieldValidationState ?? ""}
              onChange={(event) =>
                updateFilter("field_validation_state", event.target.value)
              }
            >
              <option value="">Any field validation state</option>
              {Object.entries(fieldValidationStateLabels).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </SelectFilter>
            <SelectFilter
              label="Staff-classified condition"
              value={urlState.filters.staffClassifiedCondition ?? ""}
              onChange={(event) =>
                updateFilter("authority_classified_condition", event.target.value)
              }
            >
              <option value="">Any staff classification</option>
              {Object.entries(authorityClassifiedConditionLabels).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </SelectFilter>
          </div>
        </details>

        {reportsQuery.isFetching && hasDisplayableData ? (
          <p className="queue-refresh-status" role="status">
            Refreshing this server-filtered queue…
          </p>
        ) : null}
        {reportsQuery.isRefetchError && hasDisplayableData ? (
          <p className="queue-refresh-warning" role="alert">
            {rateLimited
              ? "The latest refresh was rate limited. Wait a moment before trying again; the previous queue remains visible."
              : malformedData
                ? "The latest response had an unexpected format. The previous queue remains visible."
                : connectionError
                  ? "Cannot connect to the CaneGuard API. Start the API server and verify VITE_API_BASE_URL; the previous queue remains visible."
                  : "The latest refresh failed. Showing the most recently loaded queue."}
          </p>
        ) : null}

        {urlState.invalid ? (
          <ErrorState
            message="The report URL contains an invalid filter or page. Clear the filters to return to the queue."
            onRetry={clearFilters}
          />
        ) : null}
        {!urlState.invalid && reportsQuery.isPending ? <LoadingState /> : null}
        {!urlState.invalid && showInitialError && invalidQuery ? (
          <ErrorState
            message="The server rejected one or more report filters. Clear them and try again."
            onRetry={clearFilters}
          />
        ) : null}
        {!urlState.invalid && showInitialError && accessDenied ? (
          <ErrorState message="Your account does not have access to the submitted report queue." />
        ) : null}
        {!urlState.invalid && showInitialError && malformedData ? (
          <ErrorState
            message="CaneGuard returned report data in an unexpected format. Refresh after the service is corrected."
            onRetry={() => reportsQuery.refetch()}
          />
        ) : null}
        {!urlState.invalid && showInitialError && connectionError ? (
          <ErrorState
            message="Cannot connect to the CaneGuard API. Start the API server and verify VITE_API_BASE_URL points to the same host and port as this Web preview."
            onRetry={() => reportsQuery.refetch()}
          />
        ) : null}
        {!urlState.invalid && showInitialError && rateLimited ? (
          <ErrorState
            message="The report queue is receiving too many requests. Wait a moment, then try again."
            onRetry={() => reportsQuery.refetch()}
          />
        ) : null}
        {!urlState.invalid &&
        showInitialError &&
        !invalidQuery &&
        !accessDenied &&
        !connectionError &&
        !rateLimited &&
        !malformedData ? (
          <ErrorState
            message="The submitted report service is unavailable. Please try again."
            onRetry={() => reportsQuery.refetch()}
          />
        ) : null}
        {hasDisplayableData &&
        meta?.total === 0 &&
        !urlState.hasActiveFilters ? (
          <EmptyState />
        ) : null}
        {hasDisplayableData &&
        meta?.total === 0 &&
        urlState.hasActiveFilters ? (
          <NoResultsState onClear={clearFilters} />
        ) : null}
        {hasDisplayableData && reports.length > 0 && meta ? (
          <>
            <ReportTable
              reports={reports}
              variant={isMonitoring ? "monitoring" : urlState.filters.referral === "active" ? "out-with-experts" : "default"}
            />
            <Pagination
              currentPage={meta.currentPage}
              pageCount={meta.lastPage}
              itemCount={meta.total}
              onPageChange={setPage}
            />
          </>
        ) : null}
        {isMonitoring && !urlState.invalid ? <MonitoringCalendar /> : null}
      </section>
      <ReportDocumentBuilder
        open={reportBuilderOpen}
        onClose={() => setReportBuilderOpen(false)}
      />
    </PageContent>
  );
}
