import { Link } from "react-router";
import { ArrowLeft, X } from "lucide-react";
import { routes } from "../../app/routes";
import type { FieldValidationMapFeature } from "../../domain/fieldValidation.types";
import { predictedDiseaseLabel } from "../../domain/report.metadata";
import { useReport } from "../../hooks/useReports";
import { summarizeCaseFieldMaps, type CaseFieldMapSummary } from "../boundaries/fieldMapFreshness";
import type { MapReturnContext } from "../navigation/mapNavigationContext";
import { QueueStatusCell } from "../reports/QueueRowCells";
import { formatValidationDate } from "./fieldValidation.format";

function conditionLabel(feature: FieldValidationMapFeature) {
  return predictedDiseaseLabel(feature.properties.predictedDisease).replace(/^Possible Condition: /, "");
}

function fieldMapFactStatus(summary: CaseFieldMapSummary): {
  label: string;
  tone: "ready" | "waiting" | "pending" | "none";
} {
  if (summary.plots.length > 1) {
    return { label: `${summary.plots.length} plots`, tone: "ready" };
  }
  if (summary.plots.length === 1) {
    return summary.confirmedCount === 1
      ? { label: "Confirmed", tone: "ready" }
      : { label: "Waiting for office", tone: "waiting" };
  }
  if (summary.pendingSync) {
    return { label: "Syncing from phone", tone: "pending" };
  }
  return { label: "No field map yet", tone: "none" };
}

function SidebarFrame({
  title,
  eyebrow,
  onClose,
  children,
}: {
  title: string;
  eyebrow: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <aside className="map-sidebar" aria-labelledby="map-sidebar-heading">
      <div className="map-sidebar__heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2 id="map-sidebar-heading">{title}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close panel">
          <X aria-hidden="true" />
        </button>
      </div>
      {children}
    </aside>
  );
}

export function CaseDetailsPanel({
  feature,
  returnState,
  onClose,
  onReturnToArea,
}: {
  feature: FieldValidationMapFeature;
  returnState?: { returnContext: MapReturnContext };
  onClose: () => void;
  onReturnToArea?: () => void;
}) {
  const properties = feature.properties;
  const reportQuery = useReport(properties.uuid);
  const summary = reportQuery.data ? summarizeCaseFieldMaps(reportQuery.data) : null;
  const fieldMapStatus = summary ? fieldMapFactStatus(summary) : null;
  const hasPlots = Boolean(summary && summary.plots.length > 0);
  const viewFieldMapLabel = summary && summary.plots.length > 1
    ? `View Field Map (${summary.plots.length} plots)`
    : "View Field Map";

  return (
    <SidebarFrame title="Case Details" eyebrow={properties.referenceCode} onClose={onClose}>
      {onReturnToArea ? (
        <button type="button" className="link-button map-sidebar__back" onClick={onReturnToArea}>
          <ArrowLeft aria-hidden="true" /> Return to Cases in this Area
        </button>
      ) : null}
      <dl className="map-sidebar__facts">
        <div><dt>Reference code</dt><dd>{properties.referenceCode}</dd></div>
        <div>
          <dt>Location</dt>
          <dd>
            {properties.barangay}
            {properties.municipality ? ` · ${properties.municipality}` : ""}
            {properties.province ? ` · ${properties.province}` : ""}
          </dd>
        </div>
        <div><dt>Possible Condition</dt><dd>{conditionLabel(feature)}</dd></div>
        <div><dt>Date Observed</dt><dd>{formatValidationDate(properties.observedAt)}</dd></div>
        <div><dt>Case Status</dt><dd><QueueStatusCell row={properties} showIcon /></dd></div>
        {reportQuery.isPending ? (
          <div><dt>Field maps</dt><dd>Checking…</dd></div>
        ) : fieldMapStatus ? (
          <div>
            <dt>Field maps</dt>
            <dd>
              <span className={`map-sidebar__field-map-badge map-sidebar__field-map-badge--${fieldMapStatus.tone}`}>
                {fieldMapStatus.label}
              </span>
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="map-sidebar__actions">
        <Link className="button button--primary" to={routes.reportDetail(properties.uuid)} state={returnState}>Open Case</Link>
        <Link
          className={`button ${hasPlots ? "button--secondary" : "button--quiet"}`}
          to={routes.fieldMapForCase(properties.uuid, summary?.primaryBoundaryId)}
          state={returnState}
        >
          {viewFieldMapLabel}
        </Link>
        <Link className="button button--secondary" to={`/monitoring?view=field-operations&report=${encodeURIComponent(properties.uuid)}`}>
          Plan Visit
        </Link>
      </div>
    </SidebarFrame>
  );
}

export function ClusterQueuePanel({
  members,
  truncated,
  onSelectCase,
  onClose,
}: {
  members: FieldValidationMapFeature[];
  truncated: boolean;
  onSelectCase: (feature: FieldValidationMapFeature) => void;
  onClose: () => void;
}) {
  return (
    <SidebarFrame title="Cases in this Area" eyebrow={`${members.length} ${members.length === 1 ? "case" : "cases"}`} onClose={onClose}>
      <p className="map-sidebar__note">
        Grouped by map position at the current zoom level only. This is not evidence of spread,
        severity, or a confirmed disease relationship.
      </p>
      {truncated ? (
        <p className="map-sidebar__note" role="status">
          Within the returned map slice; narrow the filters for a complete area membership.
        </p>
      ) : null}
      <ul className="map-sidebar__queue">
        {members.map((feature) => (
          <li key={feature.properties.uuid}>
            <div className="map-sidebar__queue-entry">
              <button type="button" className="map-sidebar__queue-entry-select" onClick={() => onSelectCase(feature)}>
                <strong>{feature.properties.referenceCode}</strong>
                <span>{feature.properties.barangay}</span>
                <span>{conditionLabel(feature)}</span>
                <time>{formatValidationDate(feature.properties.observedAt)}</time>
              </button>
              <QueueStatusCell row={feature.properties} showIcon />
            </div>
          </li>
        ))}
      </ul>
    </SidebarFrame>
  );
}
