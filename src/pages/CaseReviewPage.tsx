import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Cloud,
  Info,
  MapPin,
  Save,
  ScanLine,
  Smartphone,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { routes } from "../app/routes";
import { ApiError } from "../api/ApiError";
import { DetailField, PageContent, PageHeader } from "../components/layout/Page";
import { ConfidenceDisplay } from "../components/reports/ConfidenceDisplay";
import { EvidenceThumbnail } from "../components/reports/EvidenceThumbnail";
import { DiseaseBadge, ReviewStatusBadge } from "../components/reports/ReportBadges";
import { SymptomResponseItem } from "../components/reports/SymptomResponseItem";
import { Button } from "../components/ui/Button";
import { TextArea } from "../components/ui/FormControls";
import { ErrorState, ImagePendingState, LoadingState } from "../components/ui/States";
import {
  imageStatusLabels,
  reviewStatusLabels,
  submitterRoleLabels,
} from "../domain/report.metadata";
import type { ReviewStatus } from "../domain/report.types";
import { useReport, useUpdateReportReview } from "../hooks/useReports";
import { formatDateTime } from "../lib/formatters";

type ReviewAction = Exclude<ReviewStatus, "submitted_unverified">;

const actions: Array<{ value: ReviewAction; description: string }> = [
  { value: "for_field_validation", description: "Flag this report for an on-site observation." },
  { value: "verified_by_staff", description: "Record that staff verified the submitted evidence." },
  { value: "unable_to_verify", description: "Record that the available evidence is insufficient." },
  { value: "resolved", description: "Complete office review of this submission." },
];

export function CaseReviewPage() {
  const { reportId = "" } = useParams();
  const navigate = useNavigate();
  const [notesOverride, setNotesOverride] = useState<string | null>(null);
  const [actionOverride, setActionOverride] = useState<ReviewAction | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [imageRetry, setImageRetry] = useState(0);
  const reportQuery = useReport(reportId);
  const reviewMutation = useUpdateReportReview(reportId);
  const report = reportQuery.data;
  const persistedAction = report?.reviewStatus;
  const notes = notesOverride ?? report?.reviewNotes ?? "";
  const selectedAction: ReviewAction =
    actionOverride ??
    (persistedAction && persistedAction !== "submitted_unverified"
      ? persistedAction
      : "verified_by_staff");
  const trimmedNotes = notes.trim();
  const noteError =
    trimmedNotes.length > 1000
      ? "Review notes must be 1,000 characters or fewer."
      : selectedAction === "unable_to_verify" && !trimmedNotes
        ? "Add a note explaining why the evidence cannot be verified."
        : null;
  const mutationError =
    reviewMutation.error instanceof ApiError ? reviewMutation.error : null;
  const serverNoteError = mutationError?.errors?.notes?.[0];
  const conflict = mutationError?.status === 409;

  const saveReview = async () => {
    setSubmitted(true);
    if (noteError || report?.reviewVersion === undefined) return;

    try {
      await reviewMutation.mutateAsync({
        status: selectedAction,
        notes,
        expectedVersion: report.reviewVersion,
      });
      navigate(routes.reports, {
        state: {
          notice: `${report?.referenceCode ?? reportId} was updated to ${reviewStatusLabels[selectedAction]}.`,
        },
      });
    } catch {
      return;
    }
  };

  if (reportQuery.isPending) return <PageContent><LoadingState message="Loading report evidence..." /></PageContent>;
  if (reportQuery.isSuccess && !report) return <PageContent><ErrorState message="This report does not exist in the current submitted report queue." /></PageContent>;
  if (reportQuery.isError || !report) return <PageContent><ErrorState message={reportQuery.error instanceof ApiError && reportQuery.error.status === 403 ? "Your account does not have access to this report." : "The report could not be loaded."} onRetry={reportQuery.error instanceof ApiError && reportQuery.error.status === 403 ? undefined : () => reportQuery.refetch()} /></PageContent>;

  return (
    <PageContent>
      <Link className="back-link" to={routes.reports}><ArrowLeft aria-hidden="true" />Back to submitted reports</Link>
      <PageHeader
        eyebrow="Case review"
        title={report.referenceCode}
        description="Examine the submitted evidence before recording an office response."
        actions={<ReviewStatusBadge status={report.reviewStatus} />}
      />

      <div className="review-layout">
        <div className="review-main">
          <section className="review-card evidence-card" aria-labelledby="evidence-heading">
            <div className="section-heading"><div><p className="eyebrow">Submitted evidence</p><h2 id="evidence-heading">Field image</h2></div><span className="source-label"><Smartphone aria-hidden="true" />{report.imageSourceType === "gallery" ? "Gallery upload" : "Camera capture"}</span></div>
            <div className="evidence-stage">
              {report.imageStatus === "available" ? (
                <EvidenceThumbnail key={imageRetry} status="available" src={report.imageUrl} onLoadError={() => setImageLoadFailed(true)} label={`Submitted sugarcane evidence for ${report.referenceCode}`} />
              ) : (
                <ImagePendingState status={report.imageStatus} />
              )}
            </div>
            {imageLoadFailed ? (
              <div className="image-load-error" role="alert">
                <span>Image could not be loaded.</span>
                <Button type="button" variant="secondary" onClick={() => { setImageLoadFailed(false); setImageRetry((current) => current + 1); }}>Retry image</Button>
              </div>
            ) : null}
            <div className="evidence-meta">
              <span><Cloud aria-hidden="true" />{imageLoadFailed ? "Image load failed" : imageStatusLabels[report.imageStatus]}</span>
              <span>Captured {formatDateTime(report.capturedAt)}</span>
              <span>Submitted {formatDateTime(report.submittedAt)}</span>
            </div>
            <dl className="evidence-properties">
              <DetailField label="File type">{report.imageMimeType ?? "Unavailable"}</DetailField>
              <DetailField label="Image size">{report.imageSizeBytes ? `${Math.round(report.imageSizeBytes / 1024)} KB` : "Unavailable"}</DetailField>
              <DetailField label="Dimensions">{report.sourceWidth && report.sourceHeight ? `${report.sourceWidth} × ${report.sourceHeight}` : "Not provided"}</DetailField>
            </dl>
            <div className="quality-summary">
              <strong>Image quality checks</strong>
              {report.qualityWarnings?.length ? (
                <ul>{report.qualityWarnings.map((warning) => <li key={warning}>{warning.replaceAll("_", " ")}</li>)}</ul>
              ) : <span>No image quality warnings were reported.</span>}
            </div>
          </section>

          <section className="review-card" aria-labelledby="symptoms-heading">
            <div className="section-heading"><div><p className="eyebrow">Guided observation</p><h2 id="symptoms-heading">Submitted symptom responses</h2></div><ClipboardList aria-hidden="true" /></div>
            <ul className="symptom-list">
              {report.symptoms.map((response) => <SymptomResponseItem response={response} key={response.id} />)}
            </ul>
          </section>

          <section className="review-card" aria-labelledby="notes-heading">
            <div className="section-heading"><div><p className="eyebrow">Observation context</p><h2 id="notes-heading">Submitted observations</h2></div></div>
            <dl className="detail-list">
              <DetailField label="Checklist consistency">{report.checklistConsistency?.replaceAll("_", " ") ?? "Not provided"}</DetailField>
              <DetailField label="Reported severity">{report.reportedSeverity ?? "Not provided"}</DetailField>
              <DetailField label="Barangay">{report.barangay}</DetailField>
              <DetailField label="Reporter">{report.submittedByName}</DetailField>
            </dl>
          </section>
        </div>

        <aside className="review-sidebar" aria-label="Report assessment and office review">
          <section className="review-card model-card">
            <div className="section-heading"><div><p className="eyebrow">Model decision support</p><h2>Image assessment</h2></div><ScanLine aria-hidden="true" /></div>
            <DiseaseBadge disease={report.predictedDisease} />
            <ConfidenceDisplay confidence={report.confidence} />
            <div className="model-breakdown">
              {(report.classScores ?? []).map((score) => (
                <div key={score.label}>
                  <span>{score.label}</span>
                  <strong>{Math.round(score.score * 100)}%</strong>
                </div>
              ))}
            </div>
            <dl className="detail-list model-metadata">
              <DetailField label="Model version">{report.modelVersion ?? "Unavailable"}</DetailField>
              <DetailField label="Total processing">{report.processingTimingsMs ? `${report.processingTimingsMs.total} ms` : "Unavailable"}</DetailField>
              <DetailField label="Preprocess">{report.processingTimingsMs ? `${report.processingTimingsMs.preprocess} ms` : "Unavailable"}</DetailField>
              <DetailField label="Inference">{report.processingTimingsMs ? `${report.processingTimingsMs.inference} ms` : "Unavailable"}</DetailField>
            </dl>
            <div className="decision-reminder"><Info aria-hidden="true" /><p><strong>Decision-support only</strong><span>This result is not a diagnosis. Compare it with the submitted observations and field context.</span></p></div>
          </section>

          <section className="review-card">
            <div className="section-heading"><div><p className="eyebrow">Submission details</p><h2>Report context</h2></div><MapPin aria-hidden="true" /></div>
            <dl className="detail-list">
              <DetailField label="Barangay">{report.barangay}</DetailField>
              <DetailField label="Farm reference">{report.farmReference ?? "Not provided"}</DetailField>
              <DetailField label="Submitted by">{report.submittedByName}</DetailField>
              <DetailField label="Submitter role">{submitterRoleLabels[report.submitterRole]}</DetailField>
              <DetailField label="Submitted at">{formatDateTime(report.submittedAt)}</DetailField>
              {report.reviewedBy ? <DetailField label="Last reviewed by">{report.reviewedBy}</DetailField> : null}
              {report.reviewedAt ? <DetailField label="Reviewed at">{formatDateTime(report.reviewedAt)}</DetailField> : null}
              {report.reviewNotes ? <DetailField label="Current review note">{report.reviewNotes}</DetailField> : null}
            </dl>
          </section>

          <section className="review-card office-review" aria-labelledby="office-review-heading">
            <div className="section-heading"><div><p className="eyebrow">Office response</p><h2 id="office-review-heading">Record review action</h2></div><CheckCircle2 aria-hidden="true" /></div>
            <fieldset className="review-actions">
              <legend>Select an action</legend>
              {actions.map((action) => (
                <label className={selectedAction === action.value ? "is-selected" : ""} key={action.value}>
                  <input type="radio" name="review-action" value={action.value} checked={selectedAction === action.value} onChange={() => { setActionOverride(action.value); setSubmitted(false); reviewMutation.reset(); }} />
                  <span><strong>{reviewStatusLabels[action.value]}</strong><small>{action.description}</small></span>
                </label>
              ))}
            </fieldset>
            <TextArea id="review-notes" label="Review notes" hint="Use neutral, observable language. Notes are saved with the review." rows={5} maxLength={1000} value={notes} onChange={(event) => { setNotesOverride(event.target.value); setSubmitted(false); reviewMutation.reset(); }} placeholder="Add context for this office response..." />
            <p className="review-note-count">{notes.length}/1,000</p>
            {submitted && noteError ? <p className="form-error" role="alert">{noteError}</p> : null}
            {serverNoteError ? <p className="form-error" role="alert">{serverNoteError}</p> : null}
            {conflict ? (
              <div className="review-conflict" role="alert">
                <p>This report changed after you opened it. Refresh before saving again.</p>
                <Button type="button" variant="secondary" onClick={() => { reviewMutation.reset(); reportQuery.refetch(); }}>Refresh report</Button>
              </div>
            ) : null}
            {reviewMutation.isError && !conflict && !serverNoteError ? <p className="form-error" role="alert">The review could not be saved. Please try again.</p> : null}
            <Button type="button" icon={<Save aria-hidden="true" />} disabled={reviewMutation.isPending} onClick={saveReview}>
              {reviewMutation.isPending ? "Saving review..." : "Save review action"}
            </Button>
          </section>
        </aside>
      </div>
    </PageContent>
  );
}
