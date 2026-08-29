import { useState } from "react";
import {
  AlertTriangle,
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
import { ZodError } from "zod";
import { routes } from "../app/routes";
import { ApiError } from "../api/ApiError";
import { DetailField, PageContent, PageHeader } from "../components/layout/Page";
import { ConfidenceDisplay } from "../components/reports/ConfidenceDisplay";
import { EvidenceThumbnail } from "../components/reports/EvidenceThumbnail";
import { ReferralWorkflow } from "../components/reports/ReferralWorkflow";
import { DiseaseBadge, ReviewStatusBadge } from "../components/reports/ReportBadges";
import { SymptomResponseItem } from "../components/reports/SymptomResponseItem";
import { Button } from "../components/ui/Button";
import { SelectFilter, TextArea } from "../components/ui/FormControls";
import { ErrorState, ImagePendingState, LoadingState } from "../components/ui/States";
import {
  actionTakenLabels,
  imageStatusLabels,
  authorityClassifiedConditionLabels,
  submitterRoleLabels,
} from "../domain/report.metadata";
import type {
  ActionTaken,
  AuthorityClassifiedCondition,
  CaseState,
  DiseaseReport,
  FieldValidationState,
  VerificationOutcome,
} from "../domain/report.types";
import type {
  OperationalMetadataCorrections,
  ReportReviewInput,
} from "../domain/review.types";
import { legacyLifecycleForReviewStatus } from "../data/api/mappers/lifecycle.mapper";
import { useFieldReporters } from "../hooks/useFieldReporters";
import { useReport, useUpdateReportReview } from "../hooks/useReports";
import { formatDateTime } from "../lib/formatters";

type ReviewAction = ActionTaken;

type MetadataDraft = {
  barangay: string;
  farmerOrFarmOwnerName: string;
  province: string;
  municipality: string;
  affectedAreaHectares: string;
  affectedPortionPercent: string;
};

const actions: Array<{ value: ReviewAction; description: string }> = [
  { value: "advisory_provided", description: "Record guidance provided to the field contact." },
  { value: "technical_assistance_provided", description: "Record practical technical assistance delivered." },
  { value: "referred_for_expert_validation", description: "Use the Referral lifecycle section below to capture the expert handoff." },
  { value: "no_further_action_required", description: "Record that no further office action is required." },
];

const verificationOutcomeLabels: Record<VerificationOutcome, string> = {
  not_determined: "Not determined",
  verified: "Verified",
  unable_to_verify: "Unable to verify",
};

function metadataDraftFor(report: DiseaseReport): MetadataDraft {
  return {
    barangay: report.barangay,
    farmerOrFarmOwnerName: report.farmerOrFarmOwnerName ?? "",
    province: report.province ?? "",
    municipality: report.municipality ?? "",
    affectedAreaHectares: report.affectedAreaHectares?.toString() ?? "",
    affectedPortionPercent: report.affectedPortionPercent?.toString() ?? "",
  };
}

function numberOrNull(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

function metadataCorrectionsFor(
  report: DiseaseReport,
  draft: MetadataDraft,
): OperationalMetadataCorrections | undefined {
  const corrections: OperationalMetadataCorrections = {};

  if (draft.barangay !== report.barangay) corrections.barangay = draft.barangay;
  if (draft.farmerOrFarmOwnerName !== (report.farmerOrFarmOwnerName ?? "")) {
    corrections.farmerOrFarmOwnerName = draft.farmerOrFarmOwnerName || null;
  }
  if (draft.province !== (report.province ?? "")) {
    corrections.province = draft.province || null;
  }
  if (draft.municipality !== (report.municipality ?? "")) {
    corrections.municipality = draft.municipality || null;
  }
  if (
    numberOrNull(draft.affectedAreaHectares) !==
    (report.affectedAreaHectares ?? null)
  ) {
    corrections.affectedAreaHectares = numberOrNull(draft.affectedAreaHectares);
  }
  if (
    numberOrNull(draft.affectedPortionPercent) !==
    (report.affectedPortionPercent ?? null)
  ) {
    corrections.affectedPortionPercent = numberOrNull(draft.affectedPortionPercent);
  }

  return Object.keys(corrections).length ? corrections : undefined;
}

export function CaseReviewPage() {
  const { reportId = "" } = useParams();
  const navigate = useNavigate();
  const [notesOverride, setNotesOverride] = useState<string | null>(null);
  const [actionOverride, setActionOverride] = useState<ReviewAction | null>(null);
  const [actionTouched, setActionTouched] = useState(false);
  const [authorityClassificationOverride, setAuthorityClassificationOverride] =
    useState<AuthorityClassifiedCondition | null | undefined>(undefined);
  const [verificationOverride, setVerificationOverride] = useState<
    VerificationOutcome | "" | undefined
  >(undefined);
  const [caseStateOverride, setCaseStateOverride] = useState<CaseState | undefined>(
    undefined,
  );
  const [fieldValidationStateOverride, setFieldValidationStateOverride] = useState<
    FieldValidationState | undefined
  >(undefined);
  const [fieldValidationAssigneeOverride, setFieldValidationAssigneeOverride] =
    useState<string | null | undefined>(undefined);
  const [fieldValidationTargetDateOverride, setFieldValidationTargetDateOverride] =
    useState<string | null | undefined>(undefined);
  const [fieldValidationTouched, setFieldValidationTouched] = useState(false);
  const [metadataDraftOverride, setMetadataDraftOverride] = useState<MetadataDraft | null>(
    null,
  );
  const [correctionReason, setCorrectionReason] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [imageRetry, setImageRetry] = useState(0);
  const reportQuery = useReport(reportId);
  const fieldReportersQuery = useFieldReporters();
  const reviewMutation = useUpdateReportReview(reportId);
  const report = reportQuery.data;
  const lifecycle = report
    ? report.lifecycle ?? legacyLifecycleForReviewStatus(report.reviewStatus)
    : undefined;
  const referralPending = lifecycle?.referralState === "referred";
  const notes = notesOverride ?? report?.reviewNotes ?? "";
  const selectedAction = actionTouched
    ? actionOverride
    : report?.actionTaken ?? null;
  const selectedAuthorityClassification =
    authorityClassificationOverride !== undefined
      ? authorityClassificationOverride
      : report?.authorityClassifiedCondition ?? null;
  const selectedVerificationOutcome =
    verificationOverride !== undefined
      ? verificationOverride
      : lifecycle?.verificationOutcome === "not_determined"
        ? ""
        : lifecycle?.verificationOutcome ?? "";
  const selectedCaseState = caseStateOverride ?? lifecycle?.caseState ?? "open";
  const selectedFieldValidationState =
    fieldValidationStateOverride ?? lifecycle?.fieldValidationState ?? "unassigned";
  const selectedFieldValidationAssignee =
    fieldValidationAssigneeOverride !== undefined
      ? fieldValidationAssigneeOverride ?? ""
      : report?.fieldValidationAssignment?.assignee.uuid ?? "";
  const selectedFieldValidationTargetDate =
    fieldValidationTargetDateOverride !== undefined
      ? fieldValidationTargetDateOverride ?? ""
      : report?.fieldValidationAssignment?.targetVisitDate ?? "";
  const fieldValidationError =
    selectedFieldValidationState === "assigned" && !selectedFieldValidationAssignee
      ? "Select a field reporter before saving field validation."
      : null;
  const metadataDraft = report
    ? metadataDraftOverride ?? metadataDraftFor(report)
    : undefined;
  const metadataCorrections =
    report && metadataDraft
      ? metadataCorrectionsFor(report, metadataDraft)
      : undefined;
  const trimmedNotes = notes.trim();
  const noteError =
    trimmedNotes.length > 1000
      ? "Review notes must be 1,000 characters or fewer."
      : selectedVerificationOutcome === "unable_to_verify" && !trimmedNotes
        ? "Add a note explaining why the evidence cannot be verified."
        : null;
  const correctionError =
    metadataCorrections && !correctionReason.trim()
      ? "Add a reason for the operational metadata correction."
      : null;
  const hasReviewInput =
    selectedAction !== null ||
    verificationOverride !== undefined ||
    fieldValidationTouched ||
    caseStateOverride !== undefined ||
    authorityClassificationOverride !== undefined ||
    notesOverride !== null ||
    metadataCorrections !== undefined;
  const updateMetadataDraft = (field: keyof MetadataDraft, value: string) => {
    if (!metadataDraft) return;
    setMetadataDraftOverride({ ...metadataDraft, [field]: value });
    setSubmitted(false);
    reviewMutation.reset();
  };
  const mutationError =
    reviewMutation.error instanceof ApiError ? reviewMutation.error : null;
  const serverNoteError = mutationError?.errors?.notes?.[0];
  const conflict = mutationError?.status === 409;
  const mutationRateLimited = mutationError?.status === 429;
  const mutationForbidden = mutationError?.status === 403;
  const mutationValidation = mutationError?.status === 422;
  const malformedMutationResponse = reviewMutation.error instanceof ZodError;
  const detailStatus =
    reportQuery.error instanceof ApiError ? reportQuery.error.status : undefined;
  const suppressCachedDetail = detailStatus === 403 || detailStatus === 404;
  const detailErrorMessage =
    detailStatus === 403
      ? "Your account does not have access to this report."
      : detailStatus === 404
        ? "This report does not exist in the current submitted report queue."
        : detailStatus === 429
        ? "This report is receiving too many requests. Wait a moment, then try again."
        : reportQuery.error instanceof ZodError
          ? "CaneGuard returned report data in an unexpected format. Try again after the service is corrected."
          : "The report could not be loaded.";
  const detailRefreshMessage =
    detailStatus === 429
      ? "The report refresh was rate limited. Wait a moment before trying again; the previously loaded report remains visible."
      : reportQuery.error instanceof ZodError
        ? "The latest report response had an unexpected format. The previously loaded report remains visible."
        : "The latest report refresh failed. The previously loaded report remains visible.";

  const saveReview = async () => {
    setSubmitted(true);
    if (
      !hasReviewInput ||
      noteError ||
      correctionError ||
      fieldValidationError ||
      report?.reviewVersion === undefined
    ) return;

    const input: ReportReviewInput = {
      notes,
      authorityClassifiedCondition: selectedAuthorityClassification,
      verificationOutcome:
        verificationOverride === undefined
          ? undefined
          : verificationOverride || "not_determined",
      actionTaken: actionTouched ? selectedAction : undefined,
      fieldValidationState: fieldValidationTouched
        ? selectedFieldValidationState
        : undefined,
      fieldValidationAssigneeUuid: fieldValidationTouched
        ? selectedFieldValidationState === "assigned"
          ? selectedFieldValidationAssignee || null
          : null
        : undefined,
      fieldValidationTargetDate: fieldValidationTouched
        ? selectedFieldValidationState === "assigned"
          ? selectedFieldValidationTargetDate || null
          : null
        : undefined,
      caseState: caseStateOverride,
      metadataCorrections,
      correctionReason: metadataCorrections ? correctionReason : undefined,
      expectedVersion: report.reviewVersion,
    };

    try {
      await reviewMutation.mutateAsync(input);
      const notice = selectedAction
        ? `Action recorded: ${actionTakenLabels[selectedAction]}.`
        : "The office review was updated.";
      navigate(routes.reports, {
        state: {
          notice: `${report?.referenceCode ?? reportId} - ${notice}`,
        },
      });
    } catch {
      return;
    }
  };

  if (reportQuery.isPending) return <PageContent><LoadingState message="Loading report evidence..." /></PageContent>;
  if (reportQuery.isSuccess && !report) return <PageContent><ErrorState message="This report does not exist in the current submitted report queue." /></PageContent>;
  if ((reportQuery.isError && (!report || suppressCachedDetail)) || !report) return <PageContent><ErrorState message={detailErrorMessage} onRetry={suppressCachedDetail ? undefined : () => reportQuery.refetch()} /></PageContent>;

  return (
    <PageContent>
      <Link className="back-link" to={routes.reports}><ArrowLeft aria-hidden="true" />Back to submitted reports</Link>
      <PageHeader
        eyebrow="Case review"
        title={report.referenceCode}
        description="Examine the submitted evidence before recording an office response."
        actions={<ReviewStatusBadge status={report.reviewStatus} />}
      />
      {report.mismatchReported === true ? (
        <div className="mismatch-banner" role="status">
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>Reporter flagged AI mismatch</strong>
            <span>The reporter said the model result does not match what they see.</span>
          </div>
        </div>
      ) : null}
      {reportQuery.isRefetchError ? (
        <div className="detail-refresh-warning" role="alert">
          <span>{detailRefreshMessage}</span>
          <Button type="button" variant="secondary" onClick={() => reportQuery.refetch()}>
            Retry report refresh
          </Button>
        </div>
      ) : null}

      <section className="review-summary" aria-labelledby="review-summary-heading">
        <div className="review-summary__lead">
          <p className="eyebrow">Review at a glance</p>
          <h2 id="review-summary-heading">Choose the next safe action</h2>
          <p>Keep the submitted evidence, model support, and authorized response in view as you review.</p>
        </div>
        <div className="review-summary__item">
          <span className="review-summary__label">Current status</span>
          <ReviewStatusBadge status={report.reviewStatus} />
        </div>
        <div className="review-summary__item">
          <span className="review-summary__label">Evidence posture</span>
          <strong className={report.mismatchReported === true ? "is-warning" : "is-neutral"}>
            {report.mismatchReported === true
              ? "Reporter flagged mismatch"
              : report.mismatchReported === false
                ? "No mismatch reported"
                : "Mismatch not collected"}
          </strong>
        </div>
        <div className="review-summary__item">
          <span className="review-summary__label">Verification outcome</span>
          <strong>{selectedVerificationOutcome
            ? verificationOutcomeLabels[selectedVerificationOutcome]
            : "No verification decision"}</strong>
        </div>
        <div className="review-summary__item">
          <span className="review-summary__label">Case state</span>
          <strong>{selectedCaseState === "closed" ? "Closed" : "Open"}</strong>
        </div>
        <div className="review-summary__item">
          <span className="review-summary__label">Selected response</span>
          <strong>{selectedAction ? actionTakenLabels[selectedAction] : "No office action selected"}</strong>
        </div>
      </section>

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
              <DetailField label="Sugarcane variety">{report.sugarcaneVariety ?? "Not provided"}</DetailField>
              <DetailField label="Crop age">{report.cropAge ?? "Not provided"}</DetailField>
              <DetailField label="Cane class">{report.caneClass ?? "Not provided"}</DetailField>
              <DetailField label="Affected area">{report.affectedAreaHectares !== undefined ? `${report.affectedAreaHectares} ha` : "Not provided"}</DetailField>
              <DetailField label="Affected portion">{report.affectedPortionPercent !== undefined ? `${report.affectedPortionPercent}%` : "Not provided"}</DetailField>
              <DetailField label="Field notes">{report.fieldNotes ?? "Not provided"}</DetailField>
              <DetailField label="Farmer or farm owner">{report.farmerOrFarmOwnerName ?? "Not provided"}</DetailField>
              <DetailField label="Province">{report.province ?? "Not provided"}</DetailField>
              <DetailField label="Municipality">{report.municipality ?? "Not provided"}</DetailField>
              <DetailField label="Final location">
                {report.finalLatitude !== undefined && report.finalLongitude !== undefined
                  ? `${report.finalLatitude}, ${report.finalLongitude}`
                  : "Not provided"}
              </DetailField>
              <DetailField label="Location source">
                {report.locationSource === "gps"
                  ? "GPS"
                  : report.locationSource === "manual_map"
                    ? "Manual map"
                    : "Not provided"}
              </DetailField>
              <DetailField label="GPS accuracy">
                {report.gpsAccuracy !== undefined ? `${report.gpsAccuracy} m` : "Not provided"}
              </DetailField>
              <DetailField label="Barangay">{report.barangay}</DetailField>
              <DetailField label="Reporter">{report.submittedByName}</DetailField>
            </dl>
          </section>
        </div>

        <aside className="review-sidebar" aria-label="Report assessment and office review">
          <section className="review-card reporter-observation-card" aria-labelledby="reporter-observation-heading">
            <div className="section-heading"><div><p className="eyebrow">Reporter observation</p><h2 id="reporter-observation-heading">What the reporter saw</h2></div><AlertTriangle aria-hidden="true" /></div>
            {report.mismatchReported === true ? (
              <div className="reporter-mismatch-label"><AlertTriangle aria-hidden="true" /><strong>AI result does not match the reported observation</strong></div>
            ) : report.mismatchReported === false ? (
              <p className="observation-empty">The reporter explicitly indicated no AI mismatch.</p>
            ) : (
              <p className="observation-empty">Mismatch status was not collected for this report.</p>
            )}
            <dl className="detail-list reporter-observation-details">
              <DetailField label="Suspected condition">{report.reporterSuspectedCondition ?? "Not provided"}</DetailField>
              <DetailField label="Observation text">{report.reporterObservationText ?? "Not provided"}</DetailField>
            </dl>
          </section>

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
              <DetailField label="Observed at">{report.observedAt ? formatDateTime(report.observedAt) : "Not provided"}</DetailField>
              <DetailField label="Submitted at">{formatDateTime(report.submittedAt)}</DetailField>
              {report.reviewedBy ? <DetailField label="Last reviewed by">{report.reviewedBy}</DetailField> : null}
              {report.reviewedAt ? <DetailField label="Reviewed at">{formatDateTime(report.reviewedAt)}</DetailField> : null}
              {report.reviewNotes ? <DetailField label="Current review note">{report.reviewNotes}</DetailField> : null}
            </dl>
          </section>

          <section className="review-card office-review" aria-labelledby="office-review-heading">
            <div className="section-heading"><div><p className="eyebrow">Office response</p><h2 id="office-review-heading">Record explicit review</h2></div><CheckCircle2 aria-hidden="true" /></div>
            <SelectFilter
              label="Authority classification"
              value={selectedAuthorityClassification ?? ""}
              onChange={(event) => {
                setAuthorityClassificationOverride(
                  (event.target.value || null) as AuthorityClassifiedCondition | null,
                );
                setSubmitted(false);
                reviewMutation.reset();
              }}
            >
              <option value="">Not classified</option>
              {Object.entries(authorityClassifiedConditionLabels).map(([value, label]) => (
                <option value={value} key={value}>{label}</option>
              ))}
            </SelectFilter>
            <p className="authority-classification-help">This is a separate authority finding and never changes the original model result.</p>
            {report.authorityClassifiedCondition && report.reviewedBy ? (
              <p className="authority-provenance">Last classified by {report.reviewedBy}{report.reviewedAt ? ` on ${formatDateTime(report.reviewedAt)}` : ""}.</p>
            ) : null}
            <SelectFilter
              label="Verification outcome"
              value={selectedVerificationOutcome}
              onChange={(event) => {
                setVerificationOverride(event.target.value as VerificationOutcome | "");
                setSubmitted(false);
                reviewMutation.reset();
              }}
            >
              <option value="">No verification decision</option>
              <option value="not_determined">Not determined</option>
              <option value="verified">Verified</option>
              <option value="unable_to_verify">Unable to verify</option>
            </SelectFilter>
            <p className="authority-classification-help">Verification is recorded separately from the office action and case closure.</p>
            <SelectFilter
              label="Field validation"
              value={selectedFieldValidationState}
              onChange={(event) => {
                const nextState = event.target.value as FieldValidationState;
                setFieldValidationStateOverride(nextState);
                setFieldValidationTouched(true);
                if (nextState === "unassigned") {
                  setFieldValidationAssigneeOverride(null);
                  setFieldValidationTargetDateOverride(null);
                }
                setSubmitted(false);
                reviewMutation.reset();
              }}
            >
              <option value="unassigned">No field validation needed</option>
              <option value="assigned">Assign field validation</option>
            </SelectFilter>
            <p className="authority-classification-help">An assignment activates immediately. Choose a field reporter; a target visit date is optional.</p>
            {selectedFieldValidationState === "assigned" ? (
              <>
                <SelectFilter
                  label="Field reporter assignee"
                  value={selectedFieldValidationAssignee}
                  onChange={(event) => {
                    setFieldValidationAssigneeOverride(event.target.value || null);
                    setFieldValidationTouched(true);
                    setSubmitted(false);
                    reviewMutation.reset();
                  }}
                >
                  <option value="">Select a field reporter</option>
                  {(fieldReportersQuery.data ?? []).map((fieldReporter) => (
                    <option value={fieldReporter.uuid} key={fieldReporter.uuid}>
                      {fieldReporter.name}
                    </option>
                  ))}
                </SelectFilter>
                <label className="select-filter" htmlFor="field-validation-target-date">
                  <span>Target visit date (optional)</span>
                  <input
                    id="field-validation-target-date"
                    type="date"
                    value={selectedFieldValidationTargetDate}
                    onChange={(event) => {
                      setFieldValidationTargetDateOverride(event.target.value || null);
                      setFieldValidationTouched(true);
                      setSubmitted(false);
                      reviewMutation.reset();
                    }}
                  />
                </label>
                {selectedFieldValidationAssignee === report.submitterUuid ? (
                  <p className="authority-classification-help" role="status">
                    Same person: the original submitter is also the field validator.
                  </p>
                ) : null}
                {fieldReportersQuery.isError ? (
                  <p className="form-error" role="alert">Eligible field reporters could not be loaded. Try again before assigning.</p>
                ) : null}
              </>
            ) : null}
            {submitted && fieldValidationError ? <p className="form-error" role="alert">{fieldValidationError}</p> : null}
            <SelectFilter
              label="Case state"
              value={selectedCaseState}
              onChange={(event) => {
                setCaseStateOverride(event.target.value as CaseState);
                setSubmitted(false);
                reviewMutation.reset();
              }}
            >
              <option value="open">Open - office handling continues</option>
              <option value="closed">Closed - office handling is complete</option>
            </SelectFilter>
            <p className="authority-classification-help">Closing a case is an explicit office decision. Verification never closes it automatically.</p>
            <fieldset className="review-actions">
              <legend>Action taken - choose explicitly</legend>
              {actions.map((action) => {
                const referralAction = action.value === "referred_for_expert_validation";
                const actionDisabled = referralPending || referralAction;

                return (
                  <label className={`${selectedAction === action.value ? "is-selected " : ""}${actionDisabled ? "is-disabled" : ""}`} key={action.value}>
                    <input type="radio" name="review-action" value={action.value} checked={selectedAction === action.value} disabled={actionDisabled} onChange={() => { setActionOverride(action.value); setActionTouched(true); setSubmitted(false); reviewMutation.reset(); }} />
                    <span><strong>{actionTakenLabels[action.value]}</strong><small>{action.description}</small></span>
                  </label>
                );
              })}
            </fieldset>
            <p className="authority-classification-help">{referralPending ? "The referral action remains active until an expert response is recorded." : "No action is selected until you choose one."} A field reporter may provide visit details, but only office authority can save this disposition.</p>
            <TextArea id="review-notes" label="Review notes" hint="Use neutral, observable language. Notes are saved with the review." rows={5} maxLength={1000} value={notes} onChange={(event) => { setNotesOverride(event.target.value); setSubmitted(false); reviewMutation.reset(); }} placeholder="Add context for this office response..." />
            <p className="review-note-count">{notes.length}/1,000</p>
            <details className="metadata-correction">
              <summary>Correct operational metadata</summary>
              <p className="authority-classification-help">Corrections preserve the submitted value, corrected value, actor, timestamp, and reason. Submitted AI and observation evidence cannot be edited here.</p>
              <div className="metadata-correction-grid">
                <label className="select-filter" htmlFor="correction-barangay"><span>Barangay</span><input id="correction-barangay" value={metadataDraft?.barangay ?? ""} onChange={(event) => updateMetadataDraft("barangay", event.target.value)} /></label>
                <label className="select-filter" htmlFor="correction-farmer"><span>Farmer or farm owner</span><input id="correction-farmer" value={metadataDraft?.farmerOrFarmOwnerName ?? ""} onChange={(event) => updateMetadataDraft("farmerOrFarmOwnerName", event.target.value)} /></label>
                <label className="select-filter" htmlFor="correction-province"><span>Province</span><input id="correction-province" value={metadataDraft?.province ?? ""} onChange={(event) => updateMetadataDraft("province", event.target.value)} /></label>
                <label className="select-filter" htmlFor="correction-municipality"><span>Municipality</span><input id="correction-municipality" value={metadataDraft?.municipality ?? ""} onChange={(event) => updateMetadataDraft("municipality", event.target.value)} /></label>
                <label className="select-filter" htmlFor="correction-area"><span>Affected area (ha)</span><input id="correction-area" type="number" min="0" step="0.01" value={metadataDraft?.affectedAreaHectares ?? ""} onChange={(event) => updateMetadataDraft("affectedAreaHectares", event.target.value)} /></label>
                <label className="select-filter" htmlFor="correction-portion"><span>Affected portion (%)</span><input id="correction-portion" type="number" min="0" max="100" step="0.01" value={metadataDraft?.affectedPortionPercent ?? ""} onChange={(event) => updateMetadataDraft("affectedPortionPercent", event.target.value)} /></label>
              </div>
              <TextArea id="correction-reason" label="Correction reason" hint="Required when an operational value changes." rows={3} maxLength={1000} value={correctionReason} onChange={(event) => { setCorrectionReason(event.target.value); setSubmitted(false); reviewMutation.reset(); }} placeholder="Explain the source of the correction..." />
              {report.metadataCorrectionAudits?.length ? (
                <div className="metadata-audit-history">
                  <strong>Correction history</strong>
                  <ol>
                    {report.metadataCorrectionAudits.map((audit) => (
                      <li key={audit.id}>
                        <span>{audit.field.replaceAll("_", " ")}: {String(audit.originalValue ?? "Not provided")} to {String(audit.correctedValue ?? "Not provided")}</span>
                        <small>{audit.actorName} on {formatDateTime(audit.createdAt)} - {audit.reason}</small>
                      </li>
                    ))}
                  </ol>
                </div>
              ) : <p className="authority-classification-help">No operational metadata corrections recorded.</p>}
            </details>
            {submitted && !hasReviewInput ? <p className="form-error" role="alert">Choose an office action or another review field before saving.</p> : null}
            {submitted && noteError ? <p className="form-error" role="alert">{noteError}</p> : null}
            {submitted && correctionError ? <p className="form-error" role="alert">{correctionError}</p> : null}
            {serverNoteError ? <p className="form-error" role="alert">{serverNoteError}</p> : null}
            {conflict ? (
              <div className="review-conflict" role="alert">
                <p>This report changed after you opened it. Refresh before saving again.</p>
                <Button type="button" variant="secondary" onClick={() => { reviewMutation.reset(); reportQuery.refetch(); }}>Refresh report</Button>
              </div>
            ) : null}
            {mutationRateLimited ? <p className="form-error" role="alert">Too many review attempts were received. Wait a moment before trying again.</p> : null}
            {mutationForbidden ? <p className="form-error" role="alert">Your account no longer has permission to review this report.</p> : null}
            {mutationValidation && !serverNoteError ? <p className="form-error" role="alert">The server rejected this review. Check the selected action and notes before trying again.</p> : null}
            {malformedMutationResponse ? <p className="form-error" role="alert">The server returned an unexpected response. Refresh the report before trying again.</p> : null}
            {reviewMutation.isError && !conflict && !serverNoteError && !mutationRateLimited && !mutationForbidden && !mutationValidation && !malformedMutationResponse ? <p className="form-error" role="alert">The review service is unavailable. No review change was confirmed.</p> : null}
            <Button type="button" icon={<Save aria-hidden="true" />} disabled={reviewMutation.isPending} onClick={saveReview}>
              {reviewMutation.isPending ? "Saving review..." : "Save explicit review"}
            </Button>
          </section>
          <ReferralWorkflow report={report} />
        </aside>
      </div>
    </PageContent>
  );
}
