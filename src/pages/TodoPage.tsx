import { AlarmClock, ClipboardCheck, ClipboardList, RefreshCw, UserPlus, type LucideIcon } from "lucide-react";
import { useEffect } from "react";
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
import { routes, type TodoLane } from "../app/routes";
import { formatDateTime } from "../lib/formatters";
import { env } from "../config/env";
import { apiEndpointDetail, serviceUnreachableMessage, serviceUnreachableWhileShowingData } from "../lib/serviceMessages";

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

interface TodoAction { label: string; to: string; state?: Record<string, unknown> }

function TodoCard({ report, queueContext, action }: { report: DiseaseReport; queueContext: ReviewQueueContext; action: TodoAction }) {
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
        <Link className="button button--primary button--small" to={action.to} state={{ reviewQueue: queueContext, ...action.state }}>{action.label}</Link>
      </div>
    </article>
  );
}

interface TodoLaneData {
  key: TodoLane;
  title: string;
  icon: LucideIcon;
  reports: DiseaseReport[];
  /** The one line a lane with no cards folds into. */
  empty: string;
  /** The bounded queue read behind this lane stopped at its boundary. */
  truncated?: boolean;
  action: (report: DiseaseReport) => TodoAction;
}

/** One line stating where a bounded queue read stopped. */
function QueueBoundary({ title, loaded, total }: { title: string; loaded: number; total: number }) {
  return (
    <p className="queue-refresh-warning" role="status">
      The {title} queue loaded the first {loaded} of {total} matching cases, so this list may be incomplete.
    </p>
  );
}

function TodoLaneSection({ lane }: { lane: TodoLaneData }) {
  const location = useLocation();
  const Icon = lane.icon;
  const headingId = `todo-${lane.key}-heading`;
  return (
    <section id={`lane-${lane.key}`} className="needs-assessment-group" aria-labelledby={headingId}>
      <div className="needs-assessment-group__heading">
        <h2 id={headingId}><Icon aria-hidden="true" /> {lane.title}</h2>
        <strong className="needs-assessment-count">{lane.reports.length}</strong>
      </div>
      {lane.reports.length === 0 ? <p className="needs-assessment-folded">{lane.empty}</p> : (
        <div className="needs-assessment-list">
          {lane.reports.map((report) => (
            <TodoCard
              key={report.uuid}
              report={report}
              action={lane.action(report)}
              queueContext={{
                returnTo: `${location.pathname}${location.search}`, filters: {},
                remainingIds: lane.reports.slice(lane.reports.findIndex((entry) => entry.uuid === report.uuid) + 1).map((entry) => entry.uuid),
                reviewedIds: [], snapshotOnly: true,
                ...(lane.truncated ? { snapshotTruncated: true } : {}),
              }}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function TodoPage() {
  // Complete bounded reads: a queue is never described by its first page alone.
  const awaitingQuery = useReportsQueue({ queue: "needs_review", sort: "oldest" });
  const visitQuery = useReportsQueue({ queue: "needs_visit", sort: "oldest" });
  const overdueQuery = useReportsQueue({ queue: "follow_up_due", sort: "due_soonest" });

  // Canonical lifecycle predicates, never a new status: needs_review holds both
  // completed visits awaiting a decision and untouched unassigned observations.
  const needsReview = awaitingQuery.data?.reports ?? [];
  const completedVisits = needsReview.filter((report) => fieldValidationStateOf(report) === "completed");
  const newObservations = needsReview.filter((report) => fieldValidationStateOf(report) !== "completed");
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

  const lanes: TodoLaneData[] = [
    {
      key: "review", title: "Review new reports", icon: ClipboardCheck, reports: newObservations,
      empty: "No new reports are waiting for review.", truncated: Boolean(awaitingTruncation),
      action: (report) => ({ label: "Review report", to: routes.reportDetail(report.uuid) }),
    },
    {
      key: "send", title: "Send someone", icon: UserPlus, reports: unassignedVisits,
      empty: "No reports are waiting for someone to be sent.", truncated: Boolean(visitTruncation),
      action: (report) => ({ label: "Send someone", to: routes.fieldOperationsForReport(report.uuid) }),
    },
    {
      key: "overdue", title: "Visit overdue", icon: AlarmClock, reports: overdue,
      empty: "No open visits are overdue.", truncated: Boolean(overdueTruncation),
      action: (report) => ({ label: "Open visit", to: routes.fieldOperationsForReport(report.uuid) }),
    },
    {
      key: "decide", title: "Decide after visit", icon: ClipboardList, reports: completedVisits,
      empty: "No completed visits are waiting for a decision.", truncated: Boolean(awaitingTruncation),
      action: (report) => ({ label: "Record decision", to: routes.reportDecision(report.uuid) }),
    },
  ];
  const ready = !awaitingQuery.isPending && !visitQuery.isPending && !overdueQuery.isPending;
  useEffect(() => {
    if (!ready || !window.location.hash.startsWith("#lane-")) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView?.();
  }, [ready]);

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
        title="To do"
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
      <div className="needs-assessment-summary" aria-label="To do summary">
        {lanes.map((lane) => {
          const Icon = lane.icon;
          const read = lane.key === "send" ? visitQuery : lane.key === "overdue" ? overdueQuery : awaitingQuery;
          return (
            <a key={lane.key} href={`#lane-${lane.key}`} className={lane.key === "overdue" ? "needs-assessment-summary__overdue" : undefined}>
              <Icon aria-hidden="true" /><strong>{countValue(read, lane.reports.length)}</strong><span>{lane.title}</span>
            </a>
          );
        })}
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
                ? "The To do refresh was rate limited. Wait a moment before trying again; the previous queues remain visible."
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
              ? "To do is receiving too many requests. Wait a moment, then try again."
              : "This list could not be loaded. Please try again."}
          detail={initialConnectionError ? apiEndpointDetail(env.apiBaseUrl) : undefined}
          onRetry={() => void Promise.all([awaitingQuery.refetch(), visitQuery.refetch(), overdueQuery.refetch()])}
        />
      ) : null}
      {!hasInitialError && awaitingQuery.data && visitQuery.data ? (
        <>
          {awaitingTruncation ? <QueueBoundary title="Review new reports and Decide after visit" {...awaitingTruncation} /> : null}
          {visitTruncation ? <QueueBoundary title="Send someone" {...visitTruncation} /> : null}
          {overdueTruncation ? <QueueBoundary title="Visit overdue" {...overdueTruncation} /> : null}
          <div className="needs-assessment-queue">
            {lanes.map((lane) => <TodoLaneSection key={lane.key} lane={lane} />)}
          </div>
        </>
      ) : null}
    </PageContent>
  );
}
