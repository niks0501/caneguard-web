import { ClipboardCheck, RefreshCw } from "lucide-react";
import { ApiError, isApiConnectionError } from "../api/ApiError";
import { Link, useLocation } from "react-router";
import type { ReviewQueueContext } from "../components/reports/reviewQueueContext";
import { PageContent, PageHeader } from "../components/layout/Page";
import { WorkspaceFreshness } from "../components/layout/WorkspaceFreshness";
import { oldestServerReadAt } from "../hooks/oldestServerRead";
import { Button } from "../components/ui/Button";
import { ErrorState, LoadingState } from "../components/ui/States";
import { followUpOutcomeLabels } from "../domain/report.metadata";
import type { DiseaseReport, FollowUpOutcome } from "../domain/report.types";
import { useReportsQueue } from "../hooks/useReports";
import { routes } from "../app/routes";
import { formatDateTime } from "../lib/formatters";
import { env } from "../config/env";
import { apiEndpointDetail, serviceUnreachableMessage, serviceUnreachableWhileShowingData } from "../lib/serviceMessages";

const attentionOutcomes: FollowUpOutcome[] = ["worsened", "unable_to_determine"];

function outcomeLabel(outcome: FollowUpOutcome | null | undefined) {
  return outcome ? followUpOutcomeLabels[outcome] : "Outcome not recorded";
}

function fieldValidationStateOf(report: DiseaseReport) {
  return report.lifecycle?.fieldValidationState ?? "unassigned";
}

function isRateLimitedError(error: unknown) {
  return error instanceof ApiError && error.status === 429;
}

type QueueRead = ReturnType<typeof useReportsQueue>;

/** Loading, unavailable and a genuine zero are three different answers. */
function countValue(read: QueueRead, value: number): number | string {
  if (read.data) return value;
  if (read.isError) return "Unavailable";
  return "—";
}

function AssessmentRow({ report, queueContext }: { report: DiseaseReport; queueContext: ReviewQueueContext }) {
  const outcome = report.latestValidation?.followUpOutcome;
  const visited = Boolean(report.latestValidation) || report.lifecycle?.fieldValidationState === "completed";
  return (
    <article className="needs-assessment-row">
      <div className="needs-assessment-row__identity">
        <Link className="report-link" to={routes.reportDetail(report.uuid)} state={{ reviewQueue: queueContext }}>
          <strong>{report.referenceCode}</strong>
        </Link>
        <span>{report.farmReference ?? report.barangay}</span>
        <span className="table-secondary">{report.barangay}{report.municipality ? ` · ${report.municipality}` : ""}</span>
      </div>
      <div className="needs-assessment-row__outcome">
        <span className={`outcome-pill outcome-pill--${outcome ?? "missing"}`}>{visited ? outcomeLabel(outcome) : "Not visited"}</span>
        {report.latestValidation?.visitedAt ? <span className="table-secondary">Visited {formatDateTime(report.latestValidation.visitedAt)}</span> : null}
      </div>
      <p>{report.latestValidation?.finding ?? (visited
        ? "Field evidence is ready for office assessment."
        : "No field visit has been recorded for this observation yet.")}</p>
      <div className="needs-assessment-row__actions">
        <Link className="button button--secondary button--small" to={routes.reportDetail(report.uuid)} state={{ reviewQueue: queueContext }}>Review evidence</Link>
        {report.lifecycle?.fieldValidationState !== "completed" ? (
          <Link className="button button--primary button--small" to={routes.fieldOperationsForReport(report.uuid)}>Assign visit</Link>
        ) : null}
      </div>
    </article>
  );
}

interface NeedsGroup {
  key: string;
  title: string;
  reports: DiseaseReport[];
  /** The one line a group with no rows folds into. */
  empty: string;
  /** The bounded queue read behind this group stopped at its boundary. */
  truncated?: boolean;
}

/** One line stating where a bounded queue read stopped. */
function QueueBoundary({ title, loaded, total }: { title: string; loaded: number; total: number }) {
  return (
    <p className="queue-refresh-warning" role="status">
      The {title} queue loaded the first {loaded} of {total} matching cases, so this list may be incomplete.
    </p>
  );
}

/**
 * QF-8: every case sits in one ruled list. A group with rows keeps a heading
 * and a count; a group with none folds into a single line instead of taking a
 * heading, a description and an empty panel of its own.
 */
function AssessmentGroup({ group }: { group: NeedsGroup }) {
  const location = useLocation();
  if (group.reports.length === 0) {
    return <p className="needs-assessment-folded">{group.empty}</p>;
  }
  const headingId = `needs-assessment-${group.key}-heading`;
  return (
    <section className="needs-assessment-group" aria-labelledby={headingId}>
      <div className="needs-assessment-group__heading">
        <h2 id={headingId}>{group.title}</h2>
        <strong className="needs-assessment-count">{group.reports.length}</strong>
      </div>
      <div className="needs-assessment-list">
        {group.reports.map((report) => (
          <AssessmentRow
            key={report.uuid}
            report={report}
            queueContext={{
              returnTo: `${location.pathname}${location.search}`, filters: {},
              remainingIds: group.reports.slice(group.reports.findIndex((entry) => entry.uuid === report.uuid) + 1).map((entry) => entry.uuid),
              reviewedIds: [], snapshotOnly: true,
              ...(group.truncated ? { snapshotTruncated: true } : {}),
            }}
          />
        ))}
      </div>
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
  // group's row count is never paired with a denominator it does not match.
  const awaitingTruncation = awaitingQuery.data?.truncated
    ? { loaded: needsReview.length, total: awaitingQuery.data.total }
    : undefined;
  const visitTruncation = visitQuery.data?.truncated
    ? { loaded: visitQuery.data.reports.length, total: visitQuery.data.total }
    : undefined;
  const overdueTruncation = overdueQuery.data?.truncated
    ? { loaded: overdue.length, total: overdueQuery.data.total }
    : undefined;

  const groups: NeedsGroup[] = [
    {
      key: "awaiting", title: "Visits awaiting a decision", reports: completedVisits,
      empty: "No completed field visits are waiting for a decision.", truncated: Boolean(awaitingTruncation),
    },
    {
      key: "attention", title: "Needs attention", reports: attention,
      empty: "No completed visit recorded Worsened or Unable to determine.", truncated: Boolean(awaitingTruncation),
    },
    {
      key: "observations", title: "New observations", reports: newObservations,
      empty: "No unvisited observations are waiting.", truncated: Boolean(awaitingTruncation),
    },
    {
      key: "unassigned", title: "Unassigned visits", reports: unassignedVisits,
      empty: "No unassigned visit requests are waiting.", truncated: Boolean(visitTruncation),
    },
    {
      key: "overdue", title: "Overdue visits", reports: overdue,
      empty: "No open visits are overdue.", truncated: Boolean(overdueTruncation),
    },
  ];

  const isLoading = awaitingQuery.isPending || visitQuery.isPending || overdueQuery.isPending;
  const hasInitialError = (awaitingQuery.isError && !awaitingQuery.data)
    || (visitQuery.isError && !visitQuery.data)
    || (overdueQuery.isError && !overdueQuery.data);
  const isRefreshing = awaitingQuery.isFetching || visitQuery.isFetching || overdueQuery.isFetching;
  const unavailable = awaitingQuery.isError || visitQuery.isError || overdueQuery.isError;
  const initialConnectionError = (awaitingQuery.isError && !awaitingQuery.data && isApiConnectionError(awaitingQuery.error))
    || (visitQuery.isError && !visitQuery.data && isApiConnectionError(visitQuery.error))
    || (overdueQuery.isError && !overdueQuery.data && isApiConnectionError(overdueQuery.error));
  const initialRateLimitedError = (awaitingQuery.isError && !awaitingQuery.data && isRateLimitedError(awaitingQuery.error))
    || (visitQuery.isError && !visitQuery.data && isRateLimitedError(visitQuery.error))
    || (overdueQuery.isError && !overdueQuery.data && isRateLimitedError(overdueQuery.error));
  const refetchConnectionError = (awaitingQuery.isRefetchError && isApiConnectionError(awaitingQuery.error))
    || (visitQuery.isRefetchError && isApiConnectionError(visitQuery.error))
    || (overdueQuery.isRefetchError && isApiConnectionError(overdueQuery.error));
  const refetchRateLimitedError = (awaitingQuery.isRefetchError && isRateLimitedError(awaitingQuery.error))
    || (visitQuery.isRefetchError && isRateLimitedError(visitQuery.error))
    || (overdueQuery.isRefetchError && isRateLimitedError(overdueQuery.error));

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
        updatedAt={oldestServerReadAt([awaitingQuery, visitQuery, overdueQuery])}
        fetching={isRefreshing && Boolean(awaitingQuery.data)}
        refreshFailed={awaitingQuery.isRefetchError || visitQuery.isRefetchError || overdueQuery.isRefetchError}
        onRetry={() => void Promise.all([awaitingQuery.refetch(), visitQuery.refetch(), overdueQuery.refetch()])}
      />
      {unavailable && !hasInitialError && !refetchConnectionError && !refetchRateLimitedError ? (
        <p className="queue-refresh-warning" role="alert">
          Some counts could not be loaded. Values marked Unavailable are not zero.
        </p>
      ) : null}
      {awaitingQuery.isRefetchError || visitQuery.isRefetchError || overdueQuery.isRefetchError
        ? (
          <p className="queue-refresh-warning" role="alert">
            {refetchConnectionError
              ? serviceUnreachableWhileShowingData
              : refetchRateLimitedError
                ? "The Needs assessment refresh was rate limited. Wait a moment before trying again; the previous queues remain visible."
                : "New updates could not load. Showing the list from before."}
          </p>
        )
        : null}
      {isLoading && !awaitingQuery.data ? <LoadingState message="Loading..." /> : null}
      {hasInitialError ? (
        <ErrorState
          message={initialConnectionError
            ? serviceUnreachableMessage
            : initialRateLimitedError
              ? "Needs assessment is receiving too many requests. Wait a moment, then try again."
              : "This list could not be loaded. Please try again."}
          detail={initialConnectionError ? apiEndpointDetail(env.apiBaseUrl) : undefined}
          onRetry={() => void Promise.all([awaitingQuery.refetch(), visitQuery.refetch(), overdueQuery.refetch()])}
        />
      ) : null}
      {!hasInitialError && awaitingQuery.data && visitQuery.data ? (
        <>
          {awaitingTruncation ? <QueueBoundary title="Visits awaiting a decision" {...awaitingTruncation} /> : null}
          {visitTruncation ? <QueueBoundary title="Unassigned visits" {...visitTruncation} /> : null}
          {overdueTruncation ? <QueueBoundary title="Overdue visits" {...overdueTruncation} /> : null}
          <div className="needs-assessment-queue">
            {groups.map((group) => <AssessmentGroup key={group.key} group={group} />)}
          </div>
        </>
      ) : null}
      {completedVisits.some((report) => report.latestValidation?.followUpOutcome === "unchanged") ? (
        <p className="needs-assessment-note" role="note">Unchanged outcomes remain in Needs assessment until an office reviewer records the next action.</p>
      ) : null}
    </PageContent>
  );
}
