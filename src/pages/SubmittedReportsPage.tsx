import {
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Download, RefreshCw, SlidersHorizontal } from "lucide-react";
import {
  Link,
  useLocation,
  useSearchParams,
} from "react-router";
import { ZodError } from "zod";
import { ApiError, isApiConnectionError } from "../api/ApiError";
import { routes } from "../app/routes";
import { env } from "../config/env";
import { apiEndpointDetail, serviceUnreachableMessage, serviceUnreachableWhileShowingData } from "../lib/serviceMessages";
import { PageContent, PageHeader } from "../components/layout/Page";
import { WorkspaceFreshness } from "../components/layout/WorkspaceFreshness";
import { AppliedFilterChips, type AppliedFilterChip } from "../components/reports/AppliedFilterChips";
import { ExportMenu } from "../components/reports/ExportMenu";
import { MonitoringScheduleSummary } from "../components/reports/MonitoringScheduleSummary";
import { QueueFiltersPanel } from "../components/reports/QueueFiltersPanel";
import { QueueTabs, type QueueTabOption } from "../components/reports/QueueTabs";
import { ReportTable } from "../components/reports/ReportTable";
import { ReportDocumentBuilder } from "../components/reports/ReportDocumentBuilder";
import { printableScopeFromReportFilters } from "../components/reports/reportBuilderScope";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
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
import {
  workflowStatusLabels,
  workflowStatusValues,
} from "../domain/workflowStatus";
import type { ReportFilters } from "../domain/report.types";
import { manilaDateAt } from "../domain/reportingTime";
import { reportKeys } from "../hooks/reportQueries";
import { useFieldReporters } from "../hooks/useFieldReporters";
import { useExportReports, useReports } from "../hooks/useReports";
import {
  parseReportListUrl,
} from "./reportListUrlState";

type FilterKey =
  | "search"
  | "queue"
  | "workflow_status"
  | "reviewer"
  | "status"
  | "case_state"
  | "verification_outcome"
  | "field_validation_state"
  | "authority_classified_condition"
  | "concern"
  | "predicted_label"
  | "barangay"
  | "location"
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

/** Tab labels stay short so every queue fits on the one control line. */
const queueTabLabels: Record<keyof typeof queueLabels, string> = {
  needs_review: "Needs review",
  needs_visit: "Needs visit",
  follow_up_due: "Follow-up due",
  upcoming: "Upcoming",
  unverified_no_active_work: "Unverified",
};

const queueTabs: QueueTabOption[] = [
  { value: "", label: "All" },
  ...(Object.keys(queueLabels) as (keyof typeof queueLabels)[]).map(
    (value) => ({ value, label: queueTabLabels[value] }),
  ),
];

/** The queue tab that owns the results panel, defaulting to All. */
function queueTabId(queue: string | undefined): string {
  const index = queueTabs.findIndex((tab) => tab.value === (queue ?? ""));
  return `report-queue-tab-${index === -1 ? 0 : index}`;
}

const locationLabels = {
  located: "With a usable location",
  unlocated: "Without a usable location",
} as const;

type ReportFilterChip = Omit<AppliedFilterChip, "key"> & { key: FilterKey };

/** Filters that are applied but not visible in the primary control row. */
function appliedFilterChips(
  filters: ReportFilters,
  inspectorName: (uuid: string) => string | undefined,
): ReportFilterChip[] {
  const chips: ReportFilterChip[] = [];
  const add = (key: FilterKey, label: string) => chips.push({ key, label });

  if (filters.queue) add("queue", `Queue: ${queueLabels[filters.queue]}`);
  if (filters.search?.trim()) add("search", `Search: ${filters.search.trim()}`);
  if (filters.reportedConcern) add("concern", "Reported concern: RSSI");
  if (filters.workflowStatus && filters.workflowStatus !== "all") {
    add("workflow_status", `Status: ${workflowStatusLabels[filters.workflowStatus]}`);
  }
  if (filters.status && filters.status !== "all") {
    add("status", `Review status: ${reviewStatusLabels[filters.status]}`);
  }
  if (filters.caseState && filters.caseState !== "all") {
    add("case_state", `Case state: ${caseStateLabels[filters.caseState]}`);
  }
  if (filters.verificationOutcome && filters.verificationOutcome !== "all") {
    add("verification_outcome", `Verification: ${verificationOutcomeLabels[filters.verificationOutcome]}`);
  }
  if (filters.fieldValidationState && filters.fieldValidationState !== "all") {
    add("field_validation_state", `Field validation: ${fieldValidationStateLabels[filters.fieldValidationState]}`);
  }
  if (filters.disease && filters.disease !== "all") {
    add("predicted_label", `Condition: ${diseaseLabels[filters.disease]}`);
  }
  if (filters.staffClassifiedCondition && filters.staffClassifiedCondition !== "all") {
    add("authority_classified_condition",
      `Staff-classified: ${authorityClassifiedConditionLabels[filters.staffClassifiedCondition]}`);
  }
  if (filters.barangay?.trim()) add("barangay", `Barangay: ${filters.barangay.trim()}`);
  if (filters.location && filters.location !== "all") {
    add("location", locationLabels[filters.location]);
  }
  if (filters.dateFrom) add("date_from", `From ${filters.dateFrom}`);
  if (filters.dateTo) add("date_to", `To ${filters.dateTo}`);
  if (filters.reviewer) {
    add("reviewer", `Field Inspector: ${inspectorName(filters.reviewer) ?? "Selected inspector"}`);
  }
  return chips;
}

/** A scope- and date-aware CSV filename; the server writes every matching row. */
function caseExportFilename(filters: ReportFilters): string {
  const parts = ["caneguard-cases"];
  if (filters.queue) parts.push(filters.queue);
  if (filters.barangay?.trim()) parts.push(filters.barangay.trim().toLowerCase().replaceAll(/[^a-z0-9]+/g, "-").replaceAll(/^-|-$/g, ""));
  if (filters.dateFrom && filters.dateTo) parts.push(`${filters.dateFrom}_to_${filters.dateTo}`);
  else if (filters.dateFrom) parts.push(`from_${filters.dateFrom}`);
  else if (filters.dateTo) parts.push(`to_${filters.dateTo}`);
  else parts.push(`as-of_${manilaDateAt()}`);
  return `${parts.filter(Boolean).join("-")}.csv`;
}

export function SubmittedReportsPage({
  workspace = "reports",
  embedded = false,
}: {
  workspace?: "reports" | "monitoring";
  embedded?: boolean;
}) {
  const isMonitoring = workspace === "monitoring";
  const [reportBuilderOpen, setReportBuilderOpen] = useState(false);
  const [csvConfirmOpen, setCsvConfirmOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersTriggerRef = useRef<HTMLButtonElement | null>(null);
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
  const fieldReporters = useFieldReporters();
  const exportReports = useExportReports();
  const reports = reportsQuery.data?.reports ?? [];
  const meta = reportsQuery.data?.meta;
  const activeQueueLabel = urlState.filters.queue
      ? queueLabels[urlState.filters.queue]
      : undefined;
  const printableScope = useMemo(
    () => printableScopeFromReportFilters(urlState.filters),
    [urlState.filters],
  );
  const appliedChips = appliedFilterChips(
    urlState.filters,
    (uuid) => (fieldReporters.data ?? []).find((reporter) => reporter.uuid === uuid)?.name,
  );
  // The trigger counts the filters the side panel holds, not the queue tab or
  // the search box that already sit on the control line.
  const panelFilterCount = appliedChips.filter(
    (chip) => chip.key !== "queue" && chip.key !== "search",
  ).length;
  const activeQueueTabId = queueTabId(urlState.filters.queue);

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
      link.download = caseExportFilename(exportFilters);
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
          <ExportMenu
            actions={[
              {
                key: "printable",
                label: "Filtered printable report",
                icon: <ClipboardCheck aria-hidden="true" size={18} />,
                onSelect: () => setReportBuilderOpen(true),
              },
              {
                key: "csv",
                label: exportReports.isPending ? "Preparing CSV" : "Case CSV",
                icon: <Download aria-hidden="true" size={18} />,
                disabled:
                  exportReports.isPending ||
                  reportsQuery.isFetching ||
                  urlState.invalid ||
                  !hasDisplayableData,
                onSelect: () => setCsvConfirmOpen(true),
              },
            ]}
          />
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

      {isMonitoring ? (
        <nav className="monitoring-quick-views" aria-label="Monitoring quick views">
          <span className="monitoring-quick-views__label">Quick views</span>
          <Link to={routes.monitoring} className={!urlState.hasActiveFilters ? "is-active" : undefined}>All cases</Link>
          <Link to={`${routes.monitoring}?concern=rssi`} className={urlState.filters.reportedConcern === "rssi" ? "is-active" : undefined}>RSSI</Link>
          <Link to={`${routes.monitoring}?queue=follow_up_due`} className={urlState.filters.queue === "follow_up_due" ? "is-active" : undefined}>Follow-up due</Link>
          <Link to={`${routes.monitoring}?queue=upcoming`} className={urlState.filters.queue === "upcoming" ? "is-active" : undefined}>Upcoming visits</Link>
          {urlState.hasActiveFilters ? (
            <span className="monitoring-saved-views__active" aria-current="page">Filtered view</span>
          ) : null}
        </nav>
      ) : (
        <nav className="monitoring-saved-views" aria-label="Report saved views">
          <span className="monitoring-saved-views__label">Saved views</span>
          <Link
            to={routes.reports}
            className={urlState.hasActiveFilters ? undefined : "is-active"}
            aria-current={urlState.hasActiveFilters ? undefined : "page"}
          >
            All submitted reports
          </Link>
          {urlState.hasActiveFilters ? (
            <span className="monitoring-saved-views__active" aria-current="page">Filtered view</span>
          ) : null}
        </nav>
      )}

      <WorkspaceFreshness
        updatedAt={reportsQuery.dataUpdatedAt}
        fetching={reportsQuery.isFetching && hasDisplayableData}
        refreshFailed={Boolean(reportsQuery.isRefetchError)}
        onRetry={refreshQueue}
      />

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

        <div className="filter-bar queue-toolbar">
          <QueueTabs
            tabs={queueTabs}
            activeValue={urlState.filters.queue ?? ""}
            onSelect={(value) => updateFilter("queue", value)}
            panelId="report-queue-panel"
            idPrefix="report-queue-tab"
          />
          <div className="queue-toolbar__controls">
            <SearchInput
              value={urlState.filters.search ?? ""}
              maxLength={120}
              placeholder={isMonitoring ? "Search ID or farm" : "Search ID or name"}
              onChange={(event) =>
                updateFilter("search", event.target.value, { replace: true })
              }
            />
            <SelectFilter
              label="Sort by"
              value={urlState.filters.sort ?? "due_soonest"}
              onChange={(event) =>
                updateFilter("sort", event.target.value)
              }
            >
              <option value="due_soonest">Due soonest</option>
              <option value="oldest">Oldest submitted first</option>
              <option value="newest">Newest submitted first</option>
            </SelectFilter>
            <Button
              ref={filtersTriggerRef}
              variant="secondary"
              icon={<SlidersHorizontal aria-hidden="true" size={18} />}
              aria-label={
                panelFilterCount > 0
                  ? `Filters, ${panelFilterCount} applied`
                  : "Filters"
              }
              aria-expanded={filtersOpen}
              aria-controls="queue-filters-panel"
              onClick={() => setFiltersOpen(true)}
            >
              Filters
              {panelFilterCount > 0 ? (
                <span className="queue-toolbar__count">{panelFilterCount}</span>
              ) : null}
            </Button>
          </div>
        </div>

        <QueueFiltersPanel
          id="queue-filters-panel"
          title="Filters"
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          triggerRef={filtersTriggerRef}
        >
          <div className="queue-filters-panel__fields">
            <SelectFilter
              label="Reported concern"
              value={urlState.filters.reportedConcern ?? ""}
              onChange={(event) => updateFilter("concern", event.target.value)}
            >
              <option value="">Any reported concern</option>
              <option value="rssi">RSSI</option>
            </SelectFilter>
            <SelectFilter
              label="Status"
              value={urlState.filters.workflowStatus ?? ""}
              onChange={(event) =>
                updateFilter("workflow_status", event.target.value)
              }
            >
              <option value="">All statuses</option>
              {workflowStatusValues.map((value) => (
                <option value={value} key={value}>
                  {workflowStatusLabels[value]}
                </option>
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
            <SelectFilter
              label="Map location"
              value={urlState.filters.location ?? ""}
              onChange={(event) => updateFilter("location", event.target.value)}
            >
              <option value="">Any location</option>
              <option value="located">With a usable location</option>
              <option value="unlocated">Without a usable location</option>
            </SelectFilter>
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
              label="Field Inspector"
              value={urlState.filters.reviewer ?? ""}
              onChange={(event) => updateFilter("reviewer", event.target.value)}
            >
              <option value="">Any Field Inspector</option>
              {(fieldReporters.data ?? []).map((reporter) => (
                <option value={reporter.uuid} key={reporter.uuid}>{reporter.name}</option>
              ))}
            </SelectFilter>
          </div>
        </QueueFiltersPanel>

        {appliedChips.length > 0 ? (
          <AppliedFilterChips
            label="Report filters"
            chips={appliedChips}
            onRemove={(key) => {
              const chip = appliedChips.find((item) => item.key === key);
              if (chip) updateFilter(chip.key, "");
            }}
            onClear={clearFilters}
          />
        ) : null}

        <div
          className="report-workspace__results"
          role="tabpanel"
          id="report-queue-panel"
          aria-labelledby={activeQueueTabId}
        >
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
                    ? serviceUnreachableWhileShowingData
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
              message={serviceUnreachableMessage}
              detail={apiEndpointDetail(env.apiBaseUrl)}
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
            <NoResultsState onClear={clearFilters} scopeLabel={activeQueueLabel} />
          ) : null}
          {hasDisplayableData && reports.length > 0 && meta ? (
            <>
              <ReportTable
                reports={reports}
                variant={isMonitoring ? "monitoring" : "default"}
              />
              <Pagination
                currentPage={meta.currentPage}
                pageCount={meta.lastPage}
                itemCount={meta.total}
                onPageChange={setPage}
              />
            </>
          ) : null}
          {isMonitoring && !urlState.invalid ? <MonitoringScheduleSummary /> : null}
        </div>
      </section>
      <Modal
        id="case-csv-scope"
        title="Download the case CSV?"
        description="This file contains case records, not the official weekly report."
        open={csvConfirmOpen}
        onClose={() => setCsvConfirmOpen(false)}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setCsvConfirmOpen(false)}>Cancel</Button>
            <Button
              type="button"
              disabled={exportReports.isPending}
              onClick={() => { setCsvConfirmOpen(false); void handleExport(); }}
            >
              {exportReports.isPending ? "Preparing CSV" : "Download Case CSV"}
            </Button>
          </>
        }
      >
        <p><strong>Scope:</strong> {appliedChips.length > 0 ? appliedChips.map((chip) => chip.label).join(" · ") : "All submitted cases"}.</p>
        <p>Every matching case is included, not just the visible page.</p>
        <p className="report-builder__warning" role="note">This export includes farmer and farm references.</p>
      </Modal>
      <ReportDocumentBuilder
        open={reportBuilderOpen}
        onClose={() => setReportBuilderOpen(false)}
        scope={printableScope}
      />
    </PageContent>
  );
}
