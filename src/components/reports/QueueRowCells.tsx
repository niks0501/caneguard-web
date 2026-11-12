import { Link } from "react-router";
import { routes } from "../../app/routes";
import { authorityClassifiedConditionLabels } from "../../domain/report.metadata";
import type {
  AuthorityClassifiedCondition,
  DiseaseKey,
  LatestValidationSummary,
  MeasurementProvenance,
  ReportLifecycle,
  ReportMachineFacts,
} from "../../domain/report.types";
import {
  deriveWorkflowStatus,
  deriveWorkflowStatusChipLabel,
  deriveWorkflowTrackReached,
  workflowTrackSteps,
  type WorkflowStatusInput,
} from "../../domain/workflowStatus";
import { formatAffectedArea } from "../../lib/formatters";
import { DiseaseBadge } from "./ReportBadges";

/**
 * The six-column reviewer queue is one language across every case surface
 * (register, monitoring, dashboard recent cases, map observations). Each
 * surface normalizes its own payload into this view so the Case, Location,
 * Possible Condition, Affected Area, Case Status and Review cells can never
 * drift apart.
 */
export interface QueueRowView {
  uuid: string;
  referenceCode: string;
  barangay: string;
  municipality?: string | null;
  province?: string | null;
  farmReference?: string | null;
  mismatchReported?: boolean | null;
  machineFacts?: ReportMachineFacts;
  locationUnavailable?: boolean;
  predictedDisease: DiseaseKey | null;
  authorityClassifiedCondition?: AuthorityClassifiedCondition | null;
  affectedAreaHectares?: number | null;
  affectedAreaMeasurement?: MeasurementProvenance | null;
  lifecycle?: ReportLifecycle;
  firstReviewedAt?: string | null;
  scheduledRevisit?: boolean | null;
  latestValidation?: LatestValidationSummary | null;
}

/**
 * Every caution that applies to a row, named in one line. The checklist and
 * photo cautions arrive in the list payload's machine facts; located
 * observations project no machine facts, so their rows carry only the
 * reporter-mismatch and location cautions.
 */
function queueCautions(row: QueueRowView): string[] {
  const cautions: string[] = [];
  const machineFacts = row.machineFacts;
  if (row.mismatchReported === true) cautions.push("Reporter concern needs review");
  if (machineFacts?.checklistConsistency === "inconsistent") {
    cautions.push("Observations do not match Possible Condition");
  }
  if ((machineFacts?.qualityWarnings.length ?? 0) > 0) {
    cautions.push("Photo may be difficult to review");
  }
  if (row.locationUnavailable) cautions.push("Location not confirmed");
  return cautions;
}

/** The one quiet line that sits under a queue table. */
export function QueueDisclaimer() {
  return <p className="queue-disclaimer">Possible Condition is decision support, not a confirmed diagnosis.</p>;
}

export function QueueCaseCell({ row }: { row: QueueRowView }) {
  const cautions = queueCautions(row);
  return (
    <>
      <strong>{row.referenceCode}</strong>
      <span className="table-secondary">
        {row.farmReference?.trim() ? row.farmReference : "No farm reference"}
      </span>
      {cautions.length > 0 ? (
        <span className="queue-caution">
          <span className="queue-tag queue-tag--note">Note</span>{" "}
          {cautions.map((caution, index) => (
            <span className="mismatch-table-marker" key={caution}>
              {index > 0 ? "; " : ""}
              {caution}
            </span>
          ))}
        </span>
      ) : null}
    </>
  );
}

export function QueueLocationCell({ row }: { row: QueueRowView }) {
  const region = [row.municipality, row.province].filter(Boolean).join(", ");

  return (
    <>
      <strong className="table-primary">{row.barangay}</strong>
      <span className="table-secondary">
        {row.locationUnavailable
          ? "Location unavailable"
          : region || "Location not provided"}
      </span>
    </>
  );
}

export function QueueConditionCell({ row }: { row: QueueRowView }) {
  return (
    <>
      <DiseaseBadge disease={row.predictedDisease} includePossibleConditionPrefix={false} />
      {row.authorityClassifiedCondition ? (
        <span className="table-secondary">
          Staff: {authorityClassifiedConditionLabels[row.authorityClassifiedCondition]}
        </span>
      ) : null}
    </>
  );
}

export function QueueAffectedAreaCell({ row }: { row: QueueRowView }) {
  return (
    <span className="table-primary">
      {formatAffectedArea(row.affectedAreaHectares, row.affectedAreaMeasurement)}
    </span>
  );
}

/** One coloured chip in plain words plus the four-step track, shown once. */
export function QueueStatusCell({ row }: { row: WorkflowStatusInput }) {
  const status = deriveWorkflowStatus(row);
  const chipLabel = deriveWorkflowStatusChipLabel(row, status);
  const reached = deriveWorkflowTrackReached(row, status);

  return (
    <span className="workflow-status">
      <span
        className={`badge status-badge workflow-status-badge workflow-status-badge--${status}`}
      >
        <span className="status-badge__label">{chipLabel}</span>
      </span>
      <ol className="workflow-track" aria-label="Case progress">
        {workflowTrackSteps.map((step, index) => (
          <li
            key={step}
            aria-current={index === reached ? "step" : undefined}
            className={`workflow-track__step${index <= reached ? " is-reached" : ""}${index === reached ? " is-current" : ""}`}
          >
            {index > 0 ? <span className="workflow-track__separator" aria-hidden="true">→</span> : null}
            {step}
            <span className="sr-only">
              {index < reached ? " completed" : index === reached ? " current" : " not reached"}
            </span>
          </li>
        ))}
      </ol>
    </span>
  );
}

export function QueueReviewLink({
  row,
  state,
}: {
  row: QueueRowView;
  state?: unknown;
}) {
  return (
    <Link
      className="table-action"
      to={routes.reportDetail(row.uuid)}
      state={state}
      aria-label={`Open ${row.referenceCode}`}
    >
      Open
    </Link>
  );
}
