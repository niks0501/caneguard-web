import { reviewStatusLabels, diseaseLabels } from "../../domain/report.metadata";
import type { DiseaseKey, ReviewStatus } from "../../domain/report.types";

export function DiseaseBadge({ disease }: { disease: DiseaseKey }) {
  return (
    <span className={`badge disease-badge disease-badge--${disease}`}>
      <span aria-hidden="true" />
      {diseaseLabels[disease]}
    </span>
  );
}

export function ReviewStatusBadge({ status }: { status: ReviewStatus }) {
  return (
    <span className={`badge status-badge status-badge--${status}`}>
      {reviewStatusLabels[status]}
    </span>
  );
}
