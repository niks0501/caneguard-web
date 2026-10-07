import { Link } from "react-router";
import { ArrowLeft, X } from "lucide-react";
import { routes } from "../../app/routes";
import type { FieldValidationMapFeature } from "../../domain/fieldValidation.types";
import { diseaseLabels, fieldValidationStateLabels, reviewStatusLabels } from "../../domain/report.metadata";
import { formatValidationDate } from "./fieldValidation.format";

function conditionLabel(feature: FieldValidationMapFeature) {
  return diseaseLabels[feature.properties.predictedDisease].replace(/^Possible Condition: /, "");
}

function statusLabel(feature: FieldValidationMapFeature) {
  const state = feature.properties.lifecycle?.fieldValidationState;
  if (state && state !== "unassigned") return fieldValidationStateLabels[state];
  return reviewStatusLabels[feature.properties.reviewStatus];
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
  onClose,
  onReturnToArea,
}: {
  feature: FieldValidationMapFeature;
  onClose: () => void;
  onReturnToArea?: () => void;
}) {
  const properties = feature.properties;
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
        <div><dt>Case Status</dt><dd>{statusLabel(feature)}</dd></div>
      </dl>
      <p className="map-sidebar__note">
        Possible Condition is decision support, not a confirmed diagnosis.
      </p>
      <div className="map-sidebar__actions">
        <Link className="button button--primary" to={routes.reportDetail(properties.uuid)}>Open Case</Link>
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
            <button type="button" className="map-sidebar__queue-entry" onClick={() => onSelectCase(feature)}>
              <strong>{feature.properties.referenceCode}</strong>
              <span>{feature.properties.barangay}</span>
              <span>{conditionLabel(feature)}</span>
              <span>{statusLabel(feature)}</span>
              <time>{formatValidationDate(feature.properties.observedAt)}</time>
            </button>
          </li>
        ))}
      </ul>
    </SidebarFrame>
  );
}
