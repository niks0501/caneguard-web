import { Image as ImageIcon } from "lucide-react";
import { useState } from "react";
import { formatDateTime } from "../../lib/formatters";
import { followUpOutcomeLabels } from "../../domain/report.metadata";
import type { DiseaseReport, FieldValidationCompletion } from "../../domain/report.types";
import { DetailField } from "../layout/Page";
import { ClampedText } from "../ui/ClampedText";
import { DiseaseBadge } from "./ReportBadges";
import { EvidenceThumbnail } from "./EvidenceThumbnail";

export function BeforeAfterPanels({ report, completion }: {
  report: DiseaseReport;
  completion: FieldValidationCompletion;
}) {
  const assignment = report.fieldValidationAssignment;
  const freshUrl = completion.freshPhoto?.available ? completion.freshPhoto.url : null;
  const [freshFailed, setFreshFailed] = useState(false);
  const outcome = completion.followUpOutcome ? followUpOutcomeLabels[completion.followUpOutcome] : "Not provided";
  return (
    <div className="before-after">
      <section className="before-after__panel" aria-labelledby="before-after-reported">
        <h3 id="before-after-reported">Reported</h3>
        <div className="before-after__photo">
          <EvidenceThumbnail
            status={report.imageStatus}
            src={report.imageUrl}
            label={`Reported photo for ${report.referenceCode}`}
          />
        </div>
        <dl className="before-after__rows">
          <DetailField label="Condition"><DiseaseBadge disease={report.predictedDisease} includePossibleConditionPrefix={false} /></DetailField>
          <DetailField label="Who">{report.submittedByName}</DetailField>
          <DetailField label="When">{formatDateTime(report.capturedAt)}</DetailField>
        </dl>
      </section>
      <section className="before-after__panel" aria-labelledby="before-after-visited">
        <h3 id="before-after-visited">Visited</h3>
        <div className="before-after__photo">
          {freshUrl && !freshFailed ? (
            <img
              src={freshUrl}
              alt={`Visit photo for ${report.referenceCode}`}
              loading="lazy"
              onError={() => setFreshFailed(true)}
            />
          ) : (
            <div className="evidence-thumbnail evidence-thumbnail--empty" role="img" aria-label="Visit photo not shown">
              <ImageIcon aria-hidden="true" />
            </div>
          )}
        </div>
        {freshUrl && freshFailed ? (
          <a className="table-action" href={freshUrl} target="_blank" rel="noreferrer">Open authorized photo</a>
        ) : null}
        {!freshUrl ? <p className="before-after__none">Fresh validation photo not provided</p> : null}
        <dl className="before-after__rows">
          <DetailField label="Finding"><ClampedText text={completion.fieldFinding} /></DetailField>
          <DetailField label="Who">{assignment?.assignee.name ?? "Not provided"}</DetailField>
          <DetailField label="When">{completion.visitedAt ? formatDateTime(completion.visitedAt) : "Not provided"}</DetailField>
          <DetailField label="Follow-up outcome"><span className="summary-tag">{outcome}</span></DetailField>
        </dl>
        <dl className="before-after__rows before-after__rows--notes">
          <DetailField label="Observation"><ClampedText text={completion.fieldObservation} /></DetailField>
        </dl>
      </section>
    </div>
  );
}
