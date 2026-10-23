import { ClipboardCheck, RefreshCw } from "lucide-react";
import { Link, useLocation } from "react-router";
import type { ReviewQueueContext } from "../components/reports/reviewQueueContext";
import { PageContent, PageHeader } from "../components/layout/Page";
import { WorkspaceFreshness } from "../components/layout/WorkspaceFreshness";
import { Button } from "../components/ui/Button";
import { ErrorState, LoadingState } from "../components/ui/States";
import { followUpOutcomeLabels } from "../domain/report.metadata";
import type { DiseaseReport, FollowUpOutcome } from "../domain/report.types";
import { useReportsQueue } from "../hooks/useReports";
import { routes } from "../app/routes";
import { formatDateTime } from "../lib/formatters";

const attentionOutcomes: FollowUpOutcome[] = ["worsened", "unable_to_determine"];

function outcomeLabel(outcome: FollowUpOutcome | null | undefined) {
  return outcome ? followUpOutcomeLabels[outcome] : "Outcome not recorded";
}

function fieldValidationStateOf(report: DiseaseReport) {
  return report.lifecycle?.fieldValidationState ?? "unassigned";
}

type QueueRead = ReturnType<typeof useReportsQueue>;

/** Loading, unavailable and a genuine zero are three different answers. */
/**
 * A page is only as fresh as its oldest part: report the earliest successful
 * read among the queues that make up this workspace.
 */
function oldestReadAt(reads: QueueRead[]): number | undefined {
  const stamps = reads
    .filter((read) => read.data)
    .map((read) => read.dataUpdatedAt)
    .filter((stamp) => Number.isFinite(stamp) && stamp > 0);
  return stamps.length ? Math.min(...stamps) : undefined;
}

function countValue(read: QueueRead, value: number): number | string {
  if (read.data) return value;
  if (read.isError) return "Unavailable";
  return "—";
}

function AssessmentRow({ report, attention = false, queueContext }: { report: DiseaseReport; attention?: boolean; queueContext: ReviewQueueContext }) {
  const outcome = report.latestValidation?.followUpOutcome;
  return (
    <article className={`needs-assessment-row${attention ? " needs-assessment-row--attention" : ""}`}>
      <div className="needs-assessment-row__identity">
        <Link className="report-link" to={routes.reportDetail(report.uuid)} state={{ reviewQueue: queueContext }}>
          <strong>{report.referenceCode}</strong>
        </Link>
        <span>{report.farmReference ?? report.barangay}</span>
        <span className="table-secondary">{report.barangay}{report.municipality ? ` · ${report.municipality}` : ""}</span>
      </div>
      <div className="needs-assessment-row__outcome">
        <span className={`outcome-pill outcome-pill--${outcome ?? "missing"}`}>{outcomeLabel(outcome)}</span>
        {report.latestValidation?.visitedAt ? <span className="table-secondary">Visited {formatDateTime(report.latestValidation.visitedAt)}</span> : null}
      </div>
      <p>{report.latestValidation?.finding ?? "Field evidence is ready for office assessment."}</p>
      <div className="needs-assessment-row__actions">
        <Link className="button button--secondary button--small" to={routes.reportDetail(report.uuid)} state={{ reviewQueue: queueContext }}>Review evidence</Link>
        {report.lifecycle?.fieldValidationState !== "completed" ? (
          <Link className="button button--primary button--small" to={routes.fieldOperationsForReport(report.uuid)}>Assign visit</Link>
        ) : null}
      </div>
    </article>
  );
}

function ReportSection({
  title,
  description,
  reports,
  empty,
  attention = false,
  read,
}: {
  title: string;
  description: string;
  reports: DiseaseReport[];
  empty: string;
  attention?: boolean;
  /** The bounded queue read behind this section, when it stopped at its boundary. */
  read?: { loaded: number; total: number };
}) {
  const location = useLocation();
  const headingId = `${title.toLowerCase().replaceAll(" ", "-")}-heading`;
  return (
    <section className={`needs-assessment-section${attention ? " needs-assessment-section--attention" : ""}`} aria-labelledby={headingId}>
      <div className="workspace-heading">
        <div><h2 id={headingId}>{title}</h2><p>{description}</p></div>
        <strong className="needs-assessment-count">{reports.length}</strong>
      </div>
      {read ? (
        <p className="queue-refresh-warning" role="status">
          This queue has {read.total} matching cases and only the first {read.loaded} are loaded, so these lists may be incomplete. Narrow the queue to reach the rest; Review Next stops at this boundary.
        </p>
      ) : null}
      {reports.length > 0 ? <div className="needs-assessment-list">{reports.map((report) => <AssessmentRow key={report.uuid} report={report} attention={attention} queueContext={{
        returnTo: `${location.pathname}${location.search}`, filters: {},
        remainingIds: reports.slice(reports.findIndex((entry) => entry.uuid === report.uuid) + 1).map((entry) => entry.uuid),
        reviewedIds: [], snapshotOnly: true,
        ...(read ? { snapshotTruncated: true } : {}),
      }} />)}</div> : <p className="needs-assessment-empty">{empty}</p>}
    </section>
  );
}

export function NeedsAssessmentPage() {
  // Complete bounded reads: a queue is never described by its first page alone.
  const awaitingQuery = useReportsQueue({ queue: "needs_review", sort: "oldest" });
  const visitQuery = useReportsQueue({ queue: "needs_visit", sort: "oldest" });
  const overdueQuery = useReportsQueue({ queue: "follow_up_due", sort: "due_soonest" });

  // Canonical lifecycle predicates, never a new status: needs_review holds both
  // completed visits awaiting a decision and untouched unassigned observations.
  const needsReview = awaitingQuery.data?.reports ?? [];
  const completedVisits = needsReview.filter((report) => fieldValidationStateOf(report) === "completed");
  const newObservations = needsReview.filter((report) => fieldValidationStateOf(report) !== "completed");
  const attention = completedVisits.filter((report) => attentionOutcomes.includes(report.latestValidation?.followUpOutcome ?? "improved"));
  const unassignedVisits = (visitQuery.data?.reports ?? []).filter(
    (report) => fieldValidationStateOf(report) === "unassigned",
  );
  const overdue = overdueQuery.data?.reports ?? [];

  // A truncated read is reported once per queue, attributed to that queue: a
  // section row count is never paired with a denominator it does not match.
  const awaitingTruncation = awaitingQuery.data?.truncated
    ? { loaded: needsReview.length, total: awaitingQuery.data.total }
    : undefined;
  const visitTruncation = visitQuery.data?.truncated
    ? { loaded: visitQuery.data.reports.length, total: visitQuery.data.total }
    : undefined;
  const overdueTruncation = overdueQuery.data?.truncated
    ? { loaded: overdue.length, total: overdueQuery.data.total }
    : undefined;

  const isLoading = awaitingQuery.isPending || visitQuery.isPending || overdueQuery.isPending;
  const hasInitialError = (awaitingQuery.isError && !awaitingQuery.data)
    || (visitQuery.isError && !visitQuery.data)
    || (overdueQuery.isError && !overdueQuery.data);
  const isRefreshing = awaitingQuery.isFetching || visitQuery.isFetching || overdueQuery.isFetching;
  const unavailable = awaitingQuery.isError || visitQuery.isError || overdueQuery.isError;

  return (
    <PageContent>
      <PageHeader
        title="Needs assessment"
        actions={(
          <Button
            variant="secondary"
            icon={<RefreshCw aria-hidden="true" className={isRefreshing ? "spin" : undefined} />}
            disabled={isRefreshing}
            onClick={() => void Promise.all([awaitingQuery.refetch(), visitQuery.refetch(), overdueQuery.refetch()])}
          >
            {isRefreshing ? "Refreshing" : "Refresh"}
          </Button>
        )}
      />
      <div className="needs-assessment-summary" aria-label="Needs assessment summary">
        <div><ClipboardCheck aria-hidden="true" /><strong>{countValue(awaitingQuery, completedVisits.length)}</strong><span>Visits awaiting a decision</span></div>
        <div><ClipboardCheck aria-hidden="true" /><strong>{countValue(awaitingQuery, newObservations.length)}</strong><span>New observations</span></div>
        <div><ClipboardCheck aria-hidden="true" /><strong>{countValue(visitQuery, unassignedVisits.length)}</strong><span>Unassigned visits</span></div>
        <div className="needs-assessment-summary__overdue"><RefreshCw aria-hidden="true" /><strong>{countValue(overdueQuery, overdue.length)}</strong><span>Overdue visits</span></div>
      </div>
      <WorkspaceFreshness
        updatedAt={oldestReadAt([awaitingQuery, visitQuery, overdueQuery])}
        fetching={isRefreshing && Boolean(awaitingQuery.data)}
        refreshFailed={awaitingQuery.isRefetchError || visitQuery.isRefetchError || overdueQuery.isRefetchError}
        onRetry={() => void Promise.all([awaitingQuery.refetch(), visitQuery.refetch(), overdueQuery.refetch()])}
      />
      {unavailable && !hasInitialError ? <p className="queue-refresh-warning" role="alert">Some counts could not be loaded. Values marked Unavailable are not zero.</p> : null}
      {awaitingQuery.isRefetchError || visitQuery.isRefetchError || overdueQuery.isRefetchError ? <p className="queue-refresh-warning" role="alert">New updates could not load. Showing the list from before.</p> : null}
      {isLoading && !awaitingQuery.data ? <LoadingState message="Loading..." /> : null}
      {hasInitialError ? <ErrorState message="This list could not be loaded. Please try again." onRetry={() => void Promise.all([awaitingQuery.refetch(), visitQuery.refetch(), overdueQuery.refetch()])} /> : null}
      {!hasInitialError && awaitingQuery.data && visitQuery.data ? (
        <>
          <ReportSection title="Visits awaiting a decision" description="Field visits are complete and need an office disposition." reports={completedVisits} read={awaitingTruncation} empty="No completed field visits are waiting for a decision." />
          <ReportSection title="Needs attention" description="Worsened and Unable to determine outcomes inside the completed visits above." reports={attention} attention read={awaitingTruncation} empty="No completed visit recorded Worsened or Unable to determine." />
          <ReportSection title="New observations" description="Observations that have never been visited. They are not completed visits." reports={newObservations} read={awaitingTruncation} empty="No unvisited observations are waiting." />
          <ReportSection title="Unassigned visits" description="Open cases with a visit request but no Field Inspector yet." reports={unassignedVisits} read={visitTruncation} empty="No unassigned visit requests are waiting." />
          <ReportSection title="Overdue visits" description="Open visits past their target date, counted separately from outcome attention." reports={overdue} read={overdueTruncation} empty="No open visits are overdue." />
        </>
      ) : null}
      {completedVisits.some((report) => report.latestValidation?.followUpOutcome === "unchanged") ? (
        <p className="needs-assessment-note" role="note">Unchanged outcomes remain in Needs assessment until an office reviewer records the next action.</p>
      ) : null}
    </PageContent>
  );
}
