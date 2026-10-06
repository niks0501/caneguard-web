import { useEffect, useMemo, useState } from "react";
import { CalendarClock, Check, ClipboardList, RefreshCw } from "lucide-react";
import { Link, useLocation, useSearchParams } from "react-router";
import { ApiError } from "../api/ApiError";
import { routes } from "../app/routes";
import type { ReviewQueueContext } from "../components/reports/reviewQueueContext";
import { PageContent, PageHeader } from "../components/layout/Page";
import { Button } from "../components/ui/Button";
import { ErrorState, LoadingState } from "../components/ui/States";
import { fieldValidationStateLabels } from "../domain/report.metadata";
import type { DiseaseReport } from "../domain/report.types";
import { useFieldReporters } from "../hooks/useFieldReporters";
import { useReports, useUpdateReportReview } from "../hooks/useReports";
import { formatDate } from "../lib/formatters";

function fieldOperationsError(error: unknown) {
  if (error instanceof ApiError && error.status === 403) {
    return "Your account does not have access to Field Operations.";
  }
  if (error instanceof ApiError && error.status === 429) {
    return "Field Operations is receiving too many requests. Wait a moment, then try again.";
  }
  return "Field Operations could not be loaded. Please try again.";
}

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function visitState(report: DiseaseReport) {
  const state = report.lifecycle?.fieldValidationState ?? "unassigned";
  if (state === "completed") return "completed";
  if (report.fieldValidationAssignment?.targetVisitDate && report.fieldValidationAssignment.targetVisitDate < today()) {
    return "overdue";
  }
  return state;
}

function AssignmentRow({
  report,
  reporters,
  focused,
  queueContext,
}: {
  report: DiseaseReport;
  reporters: Array<{ uuid: string; name: string }>;
  focused: boolean;
  queueContext: ReviewQueueContext;
}) {
  const currentAssignment = report.fieldValidationAssignment;
  const [assigneeUuid, setAssigneeUuid] = useState(currentAssignment?.assignee.uuid ?? "");
  const [targetDate, setTargetDate] = useState(currentAssignment?.targetVisitDate ?? "");
  const [saved, setSaved] = useState(false);
  const mutation = useUpdateReportReview(report.uuid);

  const hasChanges = assigneeUuid !== (currentAssignment?.assignee.uuid ?? "")
    || targetDate !== (currentAssignment?.targetVisitDate ?? "");
  const state = report.lifecycle?.fieldValidationState ?? "unassigned";
  const isReassignment = Boolean(currentAssignment && assigneeUuid !== currentAssignment.assignee.uuid);
  const isOverdue = visitState(report) === "overdue";

  const save = async () => {
    if (!assigneeUuid) return;
    setSaved(false);
    try {
      await mutation.mutateAsync({
        fieldValidationState: "assigned",
        fieldValidationAssigneeUuid: assigneeUuid,
        fieldValidationTargetDate: targetDate || null,
        expectedVersion: report.reviewVersion ?? 0,
      });
      setSaved(true);
    } catch {
      // The mutation error is rendered inline while the row keeps its draft.
    }
  };

  return (
    <article className={`field-operations-row${focused ? " is-focused" : ""}`} id={`field-operation-${report.uuid}`}>
      <div className="field-operations-row__identity">
        <div>
          <Link className="report-link" to={routes.reportDetail(report.uuid)} state={{ reviewQueue: queueContext }}>
            <strong>{report.referenceCode}</strong>
          </Link>
          <span>{report.farmReference ?? report.barangay}</span>
          <span className="table-secondary">{report.barangay}{report.municipality ? ` · ${report.municipality}` : ""}</span>
        </div>
        <span className={`field-operations-state field-operations-state--${isOverdue ? "overdue" : state}`}>
          {isOverdue ? "Overdue" : fieldValidationStateLabels[state]}
        </span>
      </div>
      <dl className="field-operations-row__facts">
        <div><dt>Possible Condition</dt><dd>{report.predictedDisease}</dd></div>
        <div><dt>Submitted</dt><dd>{formatDate(report.submittedAt)}</dd></div>
        <div><dt>Target visit</dt><dd>{currentAssignment?.targetVisitDate ?? "Not scheduled"}</dd></div>
        <div><dt>Current inspector</dt><dd>{currentAssignment?.assignee.name ?? "Unassigned"}</dd></div>
      </dl>
      <div className="field-operations-row__controls">
        <label className="select-filter">
          <span>Inspector</span>
          <select value={assigneeUuid} onChange={(event) => { setAssigneeUuid(event.target.value); setSaved(false); }}>
            <option value="">Select an Inspector</option>
            {reporters.map((reporter) => <option value={reporter.uuid} key={reporter.uuid}>{reporter.name}</option>)}
          </select>
        </label>
        <label className="select-filter">
          <span>Target visit date</span>
          <input type="date" value={targetDate} onChange={(event) => { setTargetDate(event.target.value); setSaved(false); }} />
        </label>
        <Button
          variant="primary"
          icon={saved ? <Check aria-hidden="true" /> : <CalendarClock aria-hidden="true" />}
          disabled={!assigneeUuid || !hasChanges || mutation.isPending}
          onClick={() => void save()}
        >
          {mutation.isPending ? "Saving visit" : saved ? "Visit saved" : isReassignment ? "Reassign visit" : "Assign visit"}
        </Button>
      </div>
      {mutation.isError ? <p className="form-error" role="alert">The visit could not be saved. Refresh the planner and try again.</p> : null}
      {saved ? <p className="field-operations-row__saved" role="status">Assignment saved through the office review record.</p> : null}
    </article>
  );
}

export function FieldOperationsPage({ embedded = false }: { embedded?: boolean }) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const focusedReport = searchParams.get("report");
  const reportsQuery = useReports(
    { queue: "needs_visit", perPage: 100, sort: "due_soonest" },
    { enabled: true },
  );
  const reportersQuery = useFieldReporters();
  const [search, setSearch] = useState("");

  const reports = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (reportsQuery.data?.reports ?? []).filter((report) => !needle || [
      report.referenceCode,
      report.barangay,
      report.farmReference ?? "",
      report.fieldValidationAssignment?.assignee.name ?? "",
    ].some((value) => value.toLowerCase().includes(needle)));
  }, [reportsQuery.data?.reports, search]);

  useEffect(() => {
    if (!focusedReport) return;
    document.getElementById(`field-operation-${focusedReport}`)?.scrollIntoView({ block: "center" });
  }, [focusedReport, reports.length]);

  const content = (
    <>
      {!embedded ? (
        <PageHeader
          eyebrow="Field operations"
          title="Field Operations planner"
          description="Assign and reschedule open field visits without reopening the case review form. Completed field evidence is triaged separately."
          actions={(
            <Button
              variant="secondary"
              icon={<RefreshCw aria-hidden="true" className={reportsQuery.isFetching ? "spin" : undefined} />}
              disabled={reportsQuery.isFetching}
              onClick={() => void reportsQuery.refetch()}
            >
              {reportsQuery.isFetching ? "Refreshing planner" : "Refresh planner"}
            </Button>
          )}
        />
      ) : null}
      <section className="field-operations-card" aria-labelledby="field-operations-heading">
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">Saved workspace view</p>
            <h2 id="field-operations-heading">Active visits</h2>
          </div>
          <span>{reportsQuery.data?.meta.total ?? 0} open visits · assign or reassign before the target date.</span>
        </div>
        <div className="field-operations-toolbar">
          <label className="search-input">
            <span className="sr-only">Search active visits</span>
            <input value={search} maxLength={120} placeholder="Search reference, farm, barangay, inspector..." onChange={(event) => setSearch(event.target.value)} />
          </label>
          <Link className="button button--quiet" to={routes.needsAssessment}>Open Needs assessment</Link>
        </div>
        {reportsQuery.isRefetchError && reportsQuery.data ? <p className="queue-refresh-warning" role="alert">The latest planner refresh failed. Showing the most recently loaded visits.</p> : null}
        {reportsQuery.isPending && !reportsQuery.data ? <LoadingState message="Loading active visits..." /> : null}
        {reportsQuery.isError && !reportsQuery.data ? <ErrorState message={fieldOperationsError(reportsQuery.error)} onRetry={() => void reportsQuery.refetch()} /> : null}
        {reportersQuery.isPending && !reportersQuery.data ? <LoadingState message="Loading eligible Field Inspectors..." /> : null}
        {reportersQuery.isError && !reportersQuery.data ? <ErrorState message="Eligible Field Inspectors could not be loaded. Try again before assigning." onRetry={() => void reportersQuery.refetch()} /> : null}
        {reportsQuery.data && reportersQuery.data ? (
          reports.length > 0 ? (
            <div className="field-operations-list">
              {reports.map((report) => <AssignmentRow key={report.uuid} report={report} reporters={reportersQuery.data ?? []} focused={report.uuid === focusedReport} queueContext={{
                returnTo: `${location.pathname}${location.search}`,
                filters: { queue: "needs_visit", sort: "due_soonest", perPage: 100 },
                remainingIds: reports.slice(reports.findIndex((entry) => entry.uuid === report.uuid) + 1).map((entry) => entry.uuid),
                reviewedIds: [], snapshotOnly: true,
              }} />)}
            </div>
          ) : <div className="empty-state"><ClipboardList aria-hidden="true" /><h3>No active visits match</h3><p>All scheduled visits are assigned, or the search has no matches.</p></div>
        ) : null}
      </section>
    </>
  );

  return embedded ? <div className="embedded-workspace">{content}</div> : <PageContent>{content}</PageContent>;
}
