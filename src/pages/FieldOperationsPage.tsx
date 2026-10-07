import { useMemo, useState } from "react";
import { ClipboardList, RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router";
import { ApiError } from "../api/ApiError";
import { PageContent, PageHeader } from "../components/layout/Page";
import { Button } from "../components/ui/Button";
import { ErrorState, LoadingState } from "../components/ui/States";
import { FieldOperationsEditor } from "../components/fieldValidation/FieldOperationsEditor";
import { FieldOperationsRow } from "../components/fieldValidation/FieldOperationsRow";
import {
  compareFieldWorkloadItems,
  fieldOperationSection,
  fieldOperationSectionLabels,
  fieldOperationSectionOrder,
  fieldWorkloadItemFromQueueItem,
  fieldWorkloadItemFromReport,
  groupFieldWorkloadByBarangay,
  groupFieldWorkloadBySection,
  mergeFieldWorkload,
  summarizeFieldWorkload,
  type FieldOperationSection,
  type FieldWorkloadItem,
} from "../domain/fieldOperations";
import { manilaDateAt } from "../domain/reportingTime";
import { useFieldReporters } from "../hooks/useFieldReporters";
import { useReports } from "../hooks/useReports";
import { useFieldValidationQueue } from "../hooks/useFieldValidation";

type QuickFilter = "all" | FieldOperationSection;

function fieldOperationsError(error: unknown) {
  if (error instanceof ApiError && error.status === 403) {
    return "Your account does not have access to Field Operations.";
  }
  if (error instanceof ApiError && error.status === 429) {
    return "Field Operations is receiving too many requests. Wait a moment, then try again.";
  }
  return "Field Operations could not be loaded. Please try again.";
}

const sectionDescriptions: Record<FieldOperationSection, string> = {
  overdue: "Past the target visit date and still incomplete.",
  unassigned: "No inspector is assigned yet.",
  upcoming: "Assigned work that is due today, later, or not yet scheduled.",
};

export function FieldOperationsPage({ embedded = false }: { embedded?: boolean }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const focusedReport = searchParams.get("report");
  const officeDate = manilaDateAt();

  const [search, setSearch] = useState("");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [barangayFilter, setBarangayFilter] = useState("");
  const [visitDateFilter, setVisitDateFilter] = useState("");
  const [groupByBarangay, setGroupByBarangay] = useState(false);

  // Authoritative reads: the reviewer report list is the page-coverage read and
  // the complete queue read supplies the full active workload so counts and
  // search never depend on one arbitrary page.
  const reportsQuery = useReports(
    { queue: "needs_visit", perPage: 100, sort: "due_soonest", search: search.trim() || undefined },
    { enabled: true },
  );
  const queueQuery = useFieldValidationQueue({ queue: "needs_visit" }, { complete: true });
  const reportersQuery = useFieldReporters();

  const completeQueueItems = useMemo(
    () => (queueQuery.data && !queueQuery.isError
      ? queueQuery.data.items.map(fieldWorkloadItemFromQueueItem)
      : null),
    [queueQuery.data, queueQuery.isError],
  );
  const reportItems = useMemo(
    () => (reportsQuery.data?.reports ?? []).map(fieldWorkloadItemFromReport),
    [reportsQuery.data?.reports],
  );
  const workload = useMemo(
    () => (completeQueueItems
      ? mergeFieldWorkload(reportItems, completeQueueItems)
      : reportItems),
    [reportItems, completeQueueItems],
  );

  const summary = useMemo(() => summarizeFieldWorkload(workload, officeDate), [workload, officeDate]);
  const barangayOptions = useMemo(
    () => [...new Set(workload.map((item) => item.barangay))].sort((a, b) => a.localeCompare(b)),
    [workload],
  );

  const needle = search.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    return workload.filter((item) => {
      if (quickFilter !== "all" && fieldOperationSection(item, officeDate) !== quickFilter) return false;
      if (barangayFilter && item.barangay !== barangayFilter) return false;
      if (visitDateFilter && item.targetVisitDate !== visitDateFilter) return false;
      if (needle) {
        const haystack = [
          item.referenceCode,
          item.barangay,
          item.farmReference ?? "",
          item.assignee?.name ?? "",
        ].join("\n").toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [workload, quickFilter, barangayFilter, visitDateFilter, needle, officeDate]);

  const sections = useMemo(() => {
    const grouped = groupFieldWorkloadBySection(filteredItems, officeDate);
    for (const key of fieldOperationSectionOrder) {
      grouped[key].sort(compareFieldWorkloadItems);
    }
    return grouped;
  }, [filteredItems, officeDate]);

  const selectedItem = useMemo(
    () => workload.find((item) => item.uuid === focusedReport) ?? null,
    [workload, focusedReport],
  );
  const selectedIsFilteredOut = Boolean(
    selectedItem && !filteredItems.some((item) => item.uuid === selectedItem.uuid),
  );

  const selectVisit = (uuid: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("report", uuid);
    setSearchParams(next);
  };

  const closeEditor = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("report");
    setSearchParams(next);
  };

  const refresh = () => {
    void Promise.all([reportsQuery.refetch(), queueQuery.refetch()]);
  };

  const hasActiveFilters = quickFilter !== "all" || Boolean(barangayFilter) || Boolean(visitDateFilter) || Boolean(needle);
  const clearFilters = () => {
    setQuickFilter("all");
    setBarangayFilter("");
    setVisitDateFilter("");
    setSearch("");
  };

  const isLoading = !reportsQuery.data && !queueQuery.data
    && (reportsQuery.isPending || queueQuery.isPending);
  const initialError = !reportsQuery.data && reportsQuery.isError;

  const content = (
    <>
      {!embedded ? (
        <PageHeader
          eyebrow="Field operations"
          title="Field Operations"
          description="Prioritize, assign, reassign, and reschedule active field visits."
          actions={(
            <Button
              variant="secondary"
              icon={<RefreshCw aria-hidden="true" className={reportsQuery.isFetching || queueQuery.isFetching ? "spin" : undefined} />}
              disabled={reportsQuery.isFetching || queueQuery.isFetching}
              onClick={refresh}
            >
              {reportsQuery.isFetching || queueQuery.isFetching ? "Refreshing workload" : "Refresh workload"}
            </Button>
          )}
        />
      ) : null}

      <section className="field-operations-card" aria-labelledby="field-operations-heading">
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">Active workload</p>
            <h2 id="field-operations-heading">Active visits</h2>
          </div>
          <span>
            {summary.total} active {summary.total === 1 ? "visit" : "visits"}
            {completeQueueItems ? "" : " (partial read)"}
          </span>
        </div>

        <ul className="field-operations-summary" aria-label="Field Operations workload summary">
          <li><span className="field-operations-summary__label">Overdue</span><strong>{summary.overdue}</strong></li>
          <li><span className="field-operations-summary__label">Unassigned</span><strong>{summary.unassigned}</strong></li>
          <li><span className="field-operations-summary__label">Upcoming</span><strong>{summary.upcoming}</strong></li>
          <li><span className="field-operations-summary__label">Assigned</span><strong>{summary.assigned}</strong></li>
        </ul>

        <div className="field-operations-toolbar">
          <label className="search-input">
            <span className="sr-only">Search active visits</span>
            <input
              value={search}
              maxLength={120}
              placeholder="Search reference, farm, barangay, inspector..."
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="queue-filter-group" role="group" aria-label="Quick workload filters">
            {(["all", "overdue", "unassigned", "upcoming"] as const).map((key) => (
              <button
                type="button"
                key={key}
                className={`queue-filter-btn${quickFilter === key ? " is-active" : ""}`}
                aria-pressed={quickFilter === key}
                onClick={() => setQuickFilter(key)}
              >
                {key === "all" ? "All" : fieldOperationSectionLabels[key]}
              </button>
            ))}
          </div>
          <label className="select-filter">
            <span>Barangay</span>
            <select value={barangayFilter} onChange={(event) => setBarangayFilter(event.target.value)}>
              <option value="">All barangays</option>
              {barangayOptions.map((barangay) => <option value={barangay} key={barangay}>{barangay}</option>)}
            </select>
          </label>
          <label className="select-filter">
            <span>Visit Date</span>
            <input type="date" value={visitDateFilter} onChange={(event) => setVisitDateFilter(event.target.value)} />
          </label>
          <button
            type="button"
            className={`queue-filter-btn${groupByBarangay ? " is-active" : ""}`}
            aria-pressed={groupByBarangay}
            onClick={() => setGroupByBarangay((current) => !current)}
          >
            Group by Barangay
          </button>
          {hasActiveFilters ? (
            <Button variant="quiet" type="button" onClick={clearFilters}>Clear filters</Button>
          ) : null}
        </div>

        {reportsQuery.isRefetchError && reportsQuery.data
          ? <p className="queue-refresh-warning" role="alert">The latest workload refresh failed. Showing the most recently loaded visits; refresh again to converge.</p>
          : null}
        {queueQuery.isError && reportsQuery.data
          ? <p className="queue-refresh-warning" role="alert">The complete workload read failed, so counts and search may cover only the first page. Refresh to restore completeness.</p>
          : null}

        {isLoading ? <LoadingState message="Loading active visits..." /> : null}
        {initialError ? <ErrorState message={fieldOperationsError(reportsQuery.error)} onRetry={() => void reportsQuery.refetch()} /> : null}
        {!initialError && !isLoading && reportersQuery.isError && !reportersQuery.data
          ? <p className="queue-refresh-warning" role="alert">Eligible Field Inspectors could not be loaded. Assigning a visit is unavailable until the list loads.</p>
          : null}

        {!initialError && !isLoading && workload.length === 0
          ? (
            <div className="empty-state">
              <ClipboardList aria-hidden="true" />
              <h3>No active visits</h3>
              <p>No open field visits are currently awaiting assignment or completion.</p>
            </div>
          )
          : null}

        {!initialError && workload.length > 0
          ? (
            <div className={`field-operations-workspace${selectedItem ? " is-split" : ""}`}>
              <div className="field-operations-list">
                {filteredItems.length === 0
                  ? (
                    <div className="empty-state">
                      <ClipboardList aria-hidden="true" />
                      <h3>No visits match the current filters</h3>
                      <p>Clear or adjust the workload filters to see active visits.</p>
                    </div>
                  )
                  : fieldOperationSectionOrder.map((section) => (
                    <section className="field-operations-section" key={section} aria-labelledby={`field-operations-${section}`}>
                      <div className="workspace-heading">
                        <div>
                          <h3 id={`field-operations-${section}`}>{fieldOperationSectionLabels[section]}</h3>
                        </div>
                        <span>{sections[section].length}</span>
                      </div>
                      <p className="field-operations-section__description">{sectionDescriptions[section]}</p>
                      {sections[section].length === 0
                        ? <p className="field-operations-section__empty">No visits in this section.</p>
                        : groupByBarangay
                          ? groupFieldWorkloadByBarangay(sections[section]).map((group) => (
                            <div className="field-operations-barangay-group" key={`${section}-${group.barangay}`}>
                              <h4>Barangay {group.barangay}</h4>
                              {group.items.map((item) => renderRow(item))}
                            </div>
                          ))
                          : sections[section].map((item) => renderRow(item))}
                    </section>
                  ))}
              </div>
              {selectedItem ? (
                <FieldOperationsEditor
                  key={selectedItem.uuid}
                  item={selectedItem}
                  reporters={reportersQuery.data ?? []}
                  officeDate={officeDate}
                  onClose={closeEditor}
                  onSaved={refresh}
                />
              ) : null}
            </div>
          )
          : null}

        {selectedIsFilteredOut ? (
          <p className="queue-refresh-warning" role="status">
            {selectedItem?.referenceCode} is outside the current Field Operations filters.
            {" "}
            <button type="button" className="link-button" onClick={clearFilters}>Clear filters</button> to see it in context.
          </p>
        ) : null}
      </section>
    </>
  );

  function renderRow(item: FieldWorkloadItem) {
    return (
      <FieldOperationsRow
        key={item.uuid}
        item={item}
        officeDate={officeDate}
        selected={item.uuid === focusedReport}
        onSelect={selectVisit}
        isFocused={item.uuid === focusedReport}
      />
    );
  }

  return embedded ? <div className="embedded-workspace">{content}</div> : <PageContent>{content}</PageContent>;
}
