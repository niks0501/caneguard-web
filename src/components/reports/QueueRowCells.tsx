import { Link } from "react-router";
import { routes } from "../../app/routes";
import { authorityClassifiedConditionLabels } from "../../domain/report.metadata";
import type {
  AuthorityClassifiedCondition,
  DiseaseKey,
  MeasurementProvenance,
  ReportLifecycle,
} from "../../domain/report.types";
import {
  deriveWorkflowStatus,
  workflowStatusLabels,
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
  locationUnavailable?: boolean;
  predictedDisease: DiseaseKey;
  authorityClassifiedCondition?: AuthorityClassifiedCondition | null;
  affectedAreaHectares?: number | null;
  affectedAreaMeasurement?: MeasurementProvenance | null;
  lifecycle?: ReportLifecycle;
  firstReviewedAt?: string | null;
  scheduledRevisit?: boolean | null;
}

/** Every caution that applies to a row, named in one line. */
function queueCautions(row: QueueRowView): string[] {
  const cautions: string[] = [];
  if (row.mismatchReported === true) cautions.push("Reporter concern needs review");
  if (row.locationUnavailable) cautions.push("Location not confirmed");
  return cautions;
}

/** The one quiet line that sits under every queue table. */
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
      <DiseaseBadge disease={row.predictedDisease} />
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

export function QueueStatusCell({ row }: { row: QueueRowView }) {
  const status = deriveWorkflowStatus(row);

  return (
    <span
      className={`badge status-badge workflow-status-badge workflow-status-badge--${status}`}
    >
      <span className="status-badge__label">{workflowStatusLabels[status]}</span>
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
