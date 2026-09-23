import { reviewStatusLabels, diseaseLabels } from "../../domain/report.metadata";
import type { DiseaseKey, IdentificationGapState, ReviewStatus } from "../../domain/report.types";

export function DiseaseBadge({
  disease,
  includePossibleConditionPrefix = true,
}: {
  disease: DiseaseKey;
  includePossibleConditionPrefix?: boolean;
}) {
  const label = diseaseLabels[disease];
  return (
    <span className={`badge disease-badge disease-badge--${disease}`}>
      <span aria-hidden="true" />
      {includePossibleConditionPrefix ? label : label.replace(/^Possible Condition:\s*/, "")}
    </span>
  );
}

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  return (
    <span className={`badge status-badge status-badge--${status}`}>
      <span className="status-badge__label">{reviewStatusLabels[status]}</span>
    </span>
  );
}

export function IdentificationGapBadge({ state }: { state?: IdentificationGapState }) {
  if (state !== "unidentified") return null;

  return (
    <span className="badge identification-gap-badge" title="No condition has been identified yet">
      Not yet identified
    </span>
  );
}
