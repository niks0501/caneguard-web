import { ClipboardCheck, RefreshCw, TriangleAlert } from "lucide-react";
import { Link } from "react-router";
import { PageContent, PageHeader } from "../components/layout/Page";
import { Button } from "../components/ui/Button";
import { ErrorState, LoadingState } from "../components/ui/States";
import { followUpOutcomeLabels } from "../domain/report.metadata";
import type { DiseaseReport, FollowUpOutcome } from "../domain/report.types";
import { useReports } from "../hooks/useReports";
import { routes } from "../app/routes";
import { formatDateTime } from "../lib/formatters";

const attentionOutcomes: FollowUpOutcome[] = ["worsened", "unable_to_determine"];

function outcomeLabel(outcome: FollowUpOutcome | null | undefined) {
  return outcome ? followUpOutcomeLabels[outcome] : "Outcome not recorded";
}

function AssessmentRow({ report, attention = false }: { report: DiseaseReport; attention?: boolean }) {
  const outcome = report.latestValidation?.followUpOutcome;
  return (
    <article className={`needs-assessment-row${attention ? " needs-assessment-row--attention" : ""}`}>
      <div className="needs-assessment-row__identity">
        <Link className="report-link" to={routes.reportDetail(report.uuid)}>
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
        <Link className="button button--secondary button--small" to={routes.reportDetail(report.uuid)}>Review evidence</Link>
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
}: {
  title: string;
  description: string;
  reports: DiseaseReport[];
  empty: string;
  attention?: boolean;
}) {
  return (
    <section className={`needs-assessment-section${attention ? " needs-assessment-section--attention" : ""}`} aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}>
      <div className="workspace-heading">
        <div><h2 id={`${title.toLowerCase().replaceAll(" ", "-")}-heading`}>{title}</h2><p>{description}</p></div>
        <strong className="needs-assessment-count">{reports.length}</strong>
      </div>
      {reports.length > 0 ? <div className="needs-assessment-list">{reports.map((report) => <AssessmentRow key={report.uuid} report={report} attention={attention} />)}</div> : <p className="needs-assessment-empty">{empty}</p>}
    </section>
  );
}

export function NeedsAssessmentPage() {
  const assessmentQuery = useReports({ queue: "needs_review", perPage: 100, sort: "oldest" }, { enabled: true });
  const visitQuery = useReports({ queue: "needs_visit", perPage: 100, sort: "oldest" }, { enabled: true });
  const overdueQuery = useReports({ queue: "follow_up_due", perPage: 100, sort: "due_soonest" }, { enabled: true });
  const completedReports = assessmentQuery.data?.reports ?? [];
  const unassignedVisits = (visitQuery.data?.reports ?? []).filter(
    (report) => (report.lifecycle?.fieldValidationState ?? "unassigned") === "unassigned",
  );
  const reports = [...completedReports, ...unassignedVisits];
  const attention = completedReports.filter((report) => attentionOutcomes.includes(report.latestValidation?.followUpOutcome ?? "improved"));
  const overdue = overdueQuery.data?.reports ?? [];
  const isLoading = assessmentQuery.isPending || visitQuery.isPending || overdueQuery.isPending;
  const hasInitialError = (assessmentQuery.isError && !assessmentQuery.data)
    || (visitQuery.isError && !visitQuery.data)
    || (overdueQuery.isError && !overdueQuery.data);

  return (
    <PageContent>
      <PageHeader
        eyebrow="Outcome triage"
        title="Needs assessment"
        description="Review the outcome of completed field visits, focus attention on Worsened and Unable to determine, and hand open visits to the Field Operations planner."
        actions={(
          <Button
            variant="secondary"
            icon={<RefreshCw aria-hidden="true" className={assessmentQuery.isFetching || overdueQuery.isFetching ? "spin" : undefined} />}
            disabled={assessmentQuery.isFetching || visitQuery.isFetching || overdueQuery.isFetching}
            onClick={() => void Promise.all([assessmentQuery.refetch(), visitQuery.refetch(), overdueQuery.refetch()])}
          >
            {assessmentQuery.isFetching || visitQuery.isFetching || overdueQuery.isFetching ? "Refreshing triage" : "Refresh triage"}
          </Button>
        )}
      />
      <div className="needs-assessment-summary" aria-label="Needs assessment summary">
        <div><ClipboardCheck aria-hidden="true" /><strong>{reports.length}</strong><span>Needs assessment</span></div>
        <div className="needs-assessment-summary__attention"><TriangleAlert aria-hidden="true" /><strong>{attention.length}</strong><span>Needs attention</span></div>
        <div className="needs-assessment-summary__overdue"><RefreshCw aria-hidden="true" /><strong>{overdue.length}</strong><span>Overdue visits</span></div>
      </div>
      {assessmentQuery.isRefetchError || visitQuery.isRefetchError || overdueQuery.isRefetchError ? <p className="queue-refresh-warning" role="alert">The latest triage refresh failed. Showing the most recently loaded results.</p> : null}
      {isLoading && !assessmentQuery.data ? <LoadingState message="Loading outcome triage..." /> : null}
      {hasInitialError ? <ErrorState message="Outcome triage could not be loaded. Please try again." onRetry={() => void Promise.all([assessmentQuery.refetch(), visitQuery.refetch(), overdueQuery.refetch()])} /> : null}
      {!hasInitialError && assessmentQuery.data && visitQuery.data ? (
        <>
          <ReportSection title="Needs assessment" description="Completed visits are ready for an office decision; unassigned open visits can be handed to the planner from here." reports={reports} empty="No completed field visits or unassigned visits are waiting for assessment." />
          <ReportSection title="Needs attention" description="Worsened and Unable to determine are grouped here. Overdue visits remain a separate count below." reports={attention} attention empty="No Worsened or Unable to determine outcomes are waiting for attention." />
          <ReportSection title="Overdue visits" description="Open visits past their target date are counted separately from outcome attention." reports={overdue} empty="No open visits are overdue." />
        </>
      ) : null}
      {assessmentQuery.data?.reports.some((report) => report.latestValidation?.followUpOutcome === "unchanged") ? (
        <p className="needs-assessment-note" role="note">Unchanged outcomes remain in Needs assessment until an office reviewer records the next action.</p>
      ) : null}
    </PageContent>
  );
}
