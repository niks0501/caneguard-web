import { useEffect, useRef, useState } from "react";
import "../styles/report-evidence-review.css";
import {
  ArrowLeft,
  ClipboardList,
  GitBranch,
  History,
  Link2,
  MoreHorizontal,
} from "lucide-react";
import { Link, useLocation, useParams } from "react-router";
import { ZodError } from "zod";
import { routes } from "../app/routes";
import { ApiError } from "../api/ApiError";
import { DetailField, PageContent, PageHeader } from "../components/layout/Page";
import { EvidenceThumbnail } from "../components/reports/EvidenceThumbnail";
import { ReviewDecisionForm } from "../components/reports/ReviewDecisionForm";
import { reviewQueueContext } from "../components/reports/reviewQueueContext";
import { OfflineHandoffNotes } from "../components/reports/OfflineHandoffNotes";
import { HistoricalReferralPanel } from "../components/reports/HistoricalReferralPanel";
import { ReportPicker } from "../components/reports/ReportPicker";
import { DiseaseBadge } from "../components/reports/ReportBadges";
import { QueueStatusCell } from "../components/reports/QueueRowCells";
import { SymptomResponseItem } from "../components/reports/SymptomResponseItem";
import { Button } from "../components/ui/Button";
import { TextArea } from "../components/ui/FormControls";
import { ErrorState, ImagePendingState, LoadingState } from "../components/ui/States";
import { CappedDetailList } from "../components/ui/CappedDetailList";
import { ClampedText } from "../components/ui/ClampedText";
import { Modal } from "../components/ui/Modal";
import { Toast } from "../components/ui/Toast";
import { confirmDiscardUnsavedChanges } from "../components/ui/confirmDiscard";
import {
  actionTakenLabels,
  authorityClassifiedConditionLabels,
  caseStateLabels,
  diseaseLabels,
  fieldValidationStateLabels,
  followUpOutcomeLabels,
  submitterRoleLabels,
  verificationOutcomeLabels,
} from "../domain/report.metadata";
import {
  REPORTER_OBSERVED_CONCERN_RSSI,
  type DiseaseReport,
} from "../domain/report.types";
import type {
  OperationalMetadataCorrections,
} from "../domain/review.types";
import { legacyLifecycleForReviewStatus } from "../data/api/mappers/lifecycle.mapper";
import {
  useLinkDuplicateReport,
  useOpenCase,
  usePossibleRecentMatches,
  useUnlinkDuplicateReport,
  useReport,
  useUpdateReportReview,
} from "../hooks/useReports";
import { formatDate, formatDateTime } from "../lib/formatters";

type MetadataDraft = {
  barangay: string;
  farmerOrFarmOwnerName: string;
  province: string;
  municipality: string;
  affectedAreaHectares: string;
  affectedPortionPercent: string;
};

function formatShortDate(isoString: string): string { return formatDate(isoString); }

export type CaseHistoryEntryType = "review" | "field_validation" | "referral" | "correction";

export interface CaseHistoryEntry {
  id: string;
  type: CaseHistoryEntryType;
  typeLabel: string;
  timestamp: string;
  actor: string;
  fields: Array<{ label: string; value: React.ReactNode }>;
  notes?: string | null;
}

function deriveMergedCaseHistory(report: DiseaseReport): CaseHistoryEntry[] {
  if (report.caseHistory) {
    return report.caseHistory.entries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      typeLabel: entry.typeLabel,
      timestamp: entry.timestamp,
      actor: entry.actor,
      fields: entry.fields,
      notes: entry.notes,
    }));
  }

  const entries: CaseHistoryEntry[] = [];

  if (report.reviewEvents?.length) {
    for (const event of report.reviewEvents) {
      const fields: Array<{ label: string; value: React.ReactNode }> = [];
      if (event.caseState) {
        fields.push({ label: "Case state", value: caseStateLabels[event.caseState] ?? event.caseState });
      }
      if (event.actionTaken) {
        fields.push({ label: "Action taken", value: actionTakenLabels[event.actionTaken] ?? event.actionTaken.replaceAll("_", " ") });
      }
      if (event.authorityClassifiedCondition) {
        fields.push({ label: "Staff classification", value: authorityClassifiedConditionLabels[event.authorityClassifiedCondition] ?? event.authorityClassifiedCondition });
      }
      if (event.verificationOutcome) {
        fields.push({ label: "Verification outcome", value: verificationOutcomeLabels[event.verificationOutcome] ?? event.verificationOutcome.replaceAll("_", " ") });
      }
      entries.push({
        id: `review-${event.id}`,
        type: "review",
        typeLabel: "Review",
        timestamp: event.createdAt,
        actor: event.actor?.name ?? "Authorized reviewer",
        fields,
        notes: event.notes,
      });
    }
  }

  if (report.metadataCorrectionAudits?.length) {
    for (const audit of report.metadataCorrectionAudits) {
      entries.push({
        id: `correction-${audit.id}`,
        type: "correction",
        typeLabel: "Correction",
        timestamp: audit.createdAt,
        actor: audit.actorName,
        fields: [
          { label: "Field", value: audit.field.replaceAll("_", " ") },
          { label: "Correction", value: `${String(audit.originalValue ?? "Not provided")} to ${String(audit.correctedValue ?? "Not provided")}` },
          { label: "Reason", value: audit.reason },
        ],
        notes: null,
      });
    }
  }

  if (report.fieldValidationAssignment) {
    const assignment = report.fieldValidationAssignment;
    entries.push({
      id: `field-val-assign-${assignment.uuid}`,
      type: "field_validation",
      typeLabel: "Field validation",
      timestamp: assignment.activatedAt,
      actor: assignment.assignedBy?.name ?? "Office reviewer",
      fields: [
        { label: "Assignment", value: `Assigned to ${assignment.assignee.name}` },
        ...(assignment.targetVisitDate ? [{ label: "Target visit", value: assignment.targetVisitDate }] : []),
      ],
      notes: null,
    });

    if (assignment.completion) {
      entries.push({
        id: `field-val-complete-${assignment.uuid}`,
        type: "field_validation",
        typeLabel: "Field validation",
        timestamp: assignment.completion.visitedAt ?? assignment.updatedAt,
        actor: assignment.assignee.name,
        fields: [
          { label: "Action taken", value: assignment.completion.actionTaken },
          { label: "Observation", value: assignment.completion.fieldObservation },
          { label: "Finding", value: assignment.completion.fieldFinding },
          ...(assignment.completion.followUpOutcome
            ? [{
                label: "Follow-up outcome",
                value: followUpOutcomeLabels[assignment.completion.followUpOutcome],
              }]
            : []),
        ],
        notes: null,
      });
    }
  }

  if (report.consults?.length) {
    for (const consult of report.consults) {
      entries.push({
        id: `consult-${consult.id}`,
        type: "referral",
        typeLabel: "Referral",
        timestamp: consult.referralDate,
        actor: "Authorized reviewer",
        fields: [
          { label: "Destination", value: consult.destination },
          { label: "Reference", value: consult.reference ?? "Not provided yet" },
          ...(consult.trackingCode ? [{ label: "Tracking code", value: consult.trackingCode }] : []),
          ...(consult.dueDate ? [{ label: "Due date", value: consult.dueDate }] : []),
          ...(consult.expertName ? [{ label: "Expert", value: consult.expertName }] : []),
        ],
        notes: consult.findingSummary ?? null,
      });
      if (consult.responseDate) {
        entries.push({
          id: `consult-resp-${consult.id}`,
          type: "referral",
          typeLabel: "Referral",
          timestamp: consult.responseDate,
          actor: consult.expertName ?? "Expert",
          fields: [
            { label: "Response", value: "Expert response received" },
            ...(consult.findingSummary ? [{ label: "Finding", value: consult.findingSummary }] : []),
          ],
          notes: consult.findingDetails ?? null,
        });
      }
    }
  } else if (report.referral) {
    const ref = report.referral;
    entries.push({
      id: `referral-${ref.id ?? ref.trackingCode ?? ref.referralDate}`,
      type: "referral",
      typeLabel: "Referral",
      timestamp: ref.referralDate,
      actor: ref.referredBy?.name ?? "Authorized reviewer",
      fields: [
        { label: "Destination", value: ref.destination },
        { label: "Reference", value: ref.reference ?? "Not provided yet" },
        ...(ref.trackingCode ? [{ label: "Tracking code", value: ref.trackingCode }] : []),
        ...(ref.dueDate ? [{ label: "Due date", value: ref.dueDate }] : []),
        ...(ref.expertName ? [{ label: "Expert", value: ref.expertName }] : []),
      ],
      notes: ref.note,
    });
    if (ref.responseDate) {
      entries.push({
        id: `referral-resp-${ref.id ?? ref.trackingCode ?? ref.referralDate}`,
        type: "referral",
        typeLabel: "Referral",
        timestamp: ref.responseDate,
        actor: ref.expertName ?? "Expert",
        fields: [
          { label: "Response", value: "Expert response received" },
        ],
        notes: null,
      });
    }
  }

  return entries.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    if (isNaN(timeA) || isNaN(timeB)) return 0;
    return timeB - timeA;
  });
}

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

function humanLocationFor(report: DiseaseReport): string {
  const parts = [
    report.barangay ? `Brgy. ${report.barangay}` : null,
    report.municipality ?? null,
    report.province ?? null,
  ].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(", ") : "Location not available";
}

function hasUsableCoordinates(report: DiseaseReport): boolean {
  return report.finalLatitude !== undefined && report.finalLongitude !== undefined;
}

function mapUrlFor(report: DiseaseReport): string | null {
  if (!hasUsableCoordinates(report)) return null;
  return `https://www.google.com/maps?q=${report.finalLatitude},${report.finalLongitude}`;
}

function locationNeedsConfirmationFor(report: DiseaseReport): boolean {
  return report.locationSource === "unavailable" || !hasUsableCoordinates(report);
}

function photoDifficultFor(report: DiseaseReport): boolean {
  return (report.qualityWarnings?.length ?? 0) > 0;
}

function observationsMismatchFor(report: DiseaseReport): boolean {
  return report.mismatchReported === true || report.checklistConsistency === "inconsistent";
}

function locationUnavailableReasonFor(report: DiseaseReport): string | null {
  if (report.locationSource !== "unavailable") return null;
  return report.locationUnavailableReason
    ? report.locationUnavailableReason.replaceAll("_", " ")
    : null;
}

function isRssiReporterConcern(report: DiseaseReport): boolean {
  return report.reporterSuspectedCondition?.trim().toUpperCase() === REPORTER_OBSERVED_CONCERN_RSSI;
}

export function CaseReviewPage() {
  const { reportId } = useParams();
  // Moving to the next case must not carry image failures or administrative drafts.
  return <CaseReviewContent key={reportId} />;
}

function CaseReviewContent() {
  const { reportId = "" } = useParams();
  const location = useLocation();
  const queueContext = reviewQueueContext(location.state);
  const [metadataDraftOverride, setMetadataDraftOverride] = useState<MetadataDraft | null>(
    null,
  );
  const [correctionReason, setCorrectionReason] = useState("");
  const [canonicalReportUuid, setCanonicalReportUuid] = useState("");
  const [canonicalReportLabel, setCanonicalReportLabel] = useState<string | null>(null);
  const [duplicateLinkReason, setDuplicateLinkReason] = useState("");
  const [duplicateLinkSubmitted, setDuplicateLinkSubmitted] = useState(false);
  const [duplicateLinkNotice, setDuplicateLinkNotice] = useState<string | null>(null);
  const [duplicateLinkModalOpen, setDuplicateLinkModalOpen] = useState(false);
  const [metadataCorrectionModalOpen, setMetadataCorrectionModalOpen] = useState(false);
  const [correctionSubmitted, setCorrectionSubmitted] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [imageRetry, setImageRetry] = useState(0);
  const [historyFilter, setHistoryFilter] = useState<"all" | CaseHistoryEntryType>("all");
  const [saveNotice, setSaveNotice] = useState<string | null>(null);
  const reportQuery = useReport(reportId);
  const possibleMatchesQuery = usePossibleRecentMatches(reportId);
  const reviewMutation = useUpdateReportReview(reportId);
  const duplicateLinkMutation = useLinkDuplicateReport(reportId);
  const duplicateUnlinkMutation = useUnlinkDuplicateReport(reportId);
  const openCaseMutation = useOpenCase(reportId);
  const { mutate: openCase } = openCaseMutation;
  const openedCaseIds = useRef<Set<string>>(new Set());
  const report = reportQuery.data;
  const possibleMatches = possibleMatchesQuery.data?.matches ?? [];
  const lifecycle = report ? report.lifecycle ?? legacyLifecycleForReviewStatus(report.reviewStatus) : undefined;
  const mergedHistory = report ? deriveMergedCaseHistory(report) : [];
  const visibleHistory = historyFilter === "all"
    ? mergedHistory
    : mergedHistory.filter((entry) => entry.type === historyFilter);

  const historyCounts = {
    all: mergedHistory.length,
    review: mergedHistory.filter((e) => e.type === "review").length,
    field_validation: mergedHistory.filter((e) => e.type === "field_validation").length,
    referral: mergedHistory.filter((e) => e.type === "referral").length,
    correction: mergedHistory.filter((e) => e.type === "correction").length,
  };

  const mapUrl = report ? mapUrlFor(report) : null;

  // Opening the case moves Needs Review to Under Review. The stamp is
  // idempotent and must run once per case per page load, never on a refetch.
  useEffect(() => {
    if (!report || report.firstReviewedAt) return;
    if (openedCaseIds.current.has(report.uuid)) return;
    openedCaseIds.current.add(report.uuid);
    openCase();
  }, [report, openCase]);

  const latestHistoryDate = mergedHistory[0]?.timestamp;
  const caseHistoryAvailable = report?.caseHistory?.available ?? true;
  const caseHistorySummary = !caseHistoryAvailable
    ? "History unavailable for this older record"
    : mergedHistory.length === 0
      ? "No prior entries"
      : `${mergedHistory.length} ${mergedHistory.length === 1 ? "entry" : "entries"}${latestHistoryDate ? ` · last ${formatShortDate(latestHistoryDate)}` : ""}`;
  const metadataDraft = report
    ? metadataDraftOverride ?? metadataDraftFor(report)
    : undefined;
  const metadataCorrections =
    report && metadataDraft
      ? metadataCorrectionsFor(report, metadataDraft)
      : undefined;
  const correctionError =
    metadataCorrections && !correctionReason.trim()
      ? "Add a reason for the case information correction."
      : null;
  const duplicateLinkDirty = Boolean(
    canonicalReportUuid.trim() || duplicateLinkReason.trim(),
  );
  const metadataCorrectionDirty = Boolean(
    metadataCorrections !== undefined || correctionReason.trim(),
  );
  const closeDuplicateLinkModal = () => {
    if (confirmDiscardUnsavedChanges(duplicateLinkDirty)) setDuplicateLinkModalOpen(false);
  };
  const closeMetadataCorrectionModal = () => {
    if (confirmDiscardUnsavedChanges(metadataCorrectionDirty)) setMetadataCorrectionModalOpen(false);
  };

  const updateMetadataDraft = (field: keyof MetadataDraft, value: string) => {
    if (!metadataDraft) return;
    setMetadataDraftOverride({ ...metadataDraft, [field]: value });
    setCorrectionSubmitted(false);
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
  const duplicateLinkApiError =
    duplicateLinkMutation.error instanceof ApiError
      ? duplicateLinkMutation.error
      : null;
  const duplicateLinkValidationError =
    duplicateLinkApiError?.errors?.canonical_report_uuid?.[0];
  const duplicateLinkReportError = duplicateLinkApiError?.errors?.report?.[0];
  const duplicateLinkConflict = duplicateLinkApiError?.status === 409;
  const duplicateLinkForbidden = duplicateLinkApiError?.status === 403;
  const duplicateLinkMalformed = duplicateLinkMutation.error instanceof ZodError;
  const duplicateUnlinkApiError =
    duplicateUnlinkMutation.error instanceof ApiError
      ? duplicateUnlinkMutation.error
      : null;
  const duplicateUnlinkConflict = duplicateUnlinkApiError?.status === 409;
  const duplicateUnlinkForbidden = duplicateUnlinkApiError?.status === 403;
  const duplicateUnlinkValidation = duplicateUnlinkApiError?.status === 422;
  const duplicateUnlinkMalformed = duplicateUnlinkMutation.error instanceof ZodError;
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

  const linkDuplicate = async () => {
    setDuplicateLinkSubmitted(true);
    setDuplicateLinkNotice(null);
    const canonicalUuid = canonicalReportUuid.trim();

    if (!report || !canonicalUuid || report.canonicalLinkage?.isDuplicate) return;
    const expectedVersion = report.reviewVersion;
    if (expectedVersion === undefined) return;

    try {
      await duplicateLinkMutation.mutateAsync({
        canonicalReportUuid: canonicalUuid,
        reason: duplicateLinkReason.trim() || undefined,
        expectedVersion,
      });
      setDuplicateLinkNotice(
        "Link recorded as a possible duplicate. The submitted record remains preserved.",
      );
      setCanonicalReportUuid("");
      setCanonicalReportLabel(null);
      setDuplicateLinkReason("");
      setDuplicateLinkSubmitted(false);
      setDuplicateLinkModalOpen(false);
    } catch {
      return;
    }
  };

  const unlinkDuplicate = async () => {
    if (report?.reviewVersion === undefined) return;

    try {
      await duplicateUnlinkMutation.mutateAsync({
        expectedVersion: report.reviewVersion,
      });
      setDuplicateLinkNotice("Duplicate link removed. The submitted record remains preserved.");
    } catch {
      return;
    }
  };

  const saveMetadataCorrection = async () => {
    setCorrectionSubmitted(true);
    if (!metadataCorrections) {
      setMetadataCorrectionModalOpen(false);
      return;
    }
    if (!correctionReason.trim()) return;
    if (report?.reviewVersion === undefined) return;

    try {
      await reviewMutation.mutateAsync({
        metadataCorrections,
        correctionReason,
        expectedVersion: report.reviewVersion,
      });
      setMetadataCorrectionModalOpen(false);
      setSaveNotice(`${report.referenceCode} - Case information corrected.`);
      await reportQuery.refetch();
    } catch {
      return;
    }
  };

  if (reportQuery.isPending) return <PageContent><LoadingState message="Loading report..." /></PageContent>;
  if (reportQuery.isSuccess && !report) return <PageContent><ErrorState message="This report does not exist in the current submitted report queue." /></PageContent>;
  if ((reportQuery.isError && (!report || suppressCachedDetail)) || !report) return <PageContent><ErrorState message={detailErrorMessage} onRetry={suppressCachedDetail ? undefined : () => reportQuery.refetch()} /></PageContent>;

  // Every review-mutation failure is reported once, inside the pop-up that owns
  // the save, instead of on the page and in the pop-up at the same time.
  const renderReviewMutationErrors = () => (
    <>
      {serverNoteError ? <p className="form-error" role="alert">{serverNoteError}</p> : null}
      {conflict ? (
        <div className="review-conflict" role="alert">
          <p>This report changed after you opened it. Refresh before saving again.</p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              reviewMutation.reset();
              reportQuery.refetch();
            }}
          >
            Refresh report
          </Button>
        </div>
      ) : null}
      {mutationRateLimited ? (
        <p className="form-error" role="alert">
          Too many review attempts were received. Wait a moment before trying again.
        </p>
      ) : null}
      {mutationForbidden ? (
        <p className="form-error" role="alert">
          Your account no longer has permission to review this report.
        </p>
      ) : null}
      {mutationValidation && !serverNoteError ? (
        <p className="form-error" role="alert">
          The server rejected this review. Check the selected action and notes before trying again.
        </p>
      ) : null}
      {malformedMutationResponse ? (
        <p className="form-error" role="alert">
          The server returned an unexpected response. Refresh the report before trying again.
        </p>
      ) : null}
      {reviewMutation.isError &&
      !conflict &&
      !serverNoteError &&
      !mutationRateLimited &&
      !mutationForbidden &&
      !mutationValidation &&
      !malformedMutationResponse ? (
        <p className="form-error" role="alert">
          The review service is unavailable. No review change was confirmed.
        </p>
      ) : null}
    </>
  );

  return (
    <PageContent>
      <Link className="back-link" to={queueContext?.returnTo ?? routes.reports}><ArrowLeft aria-hidden="true" />Back to submitted reports</Link>
      <PageHeader
        title={report.referenceCode}
        description={humanLocationFor(report)}
        actions={<QueueStatusCell row={report} />}
      />
      {reportQuery.isRefetchError ? (
        <div className="detail-refresh-warning" role="alert">
          <span>{detailRefreshMessage}</span>
          <Button type="button" variant="secondary" onClick={() => reportQuery.refetch()}>
            Retry report refresh
          </Button>
        </div>
      ) : null}

      {/* 1. Case status with plain-language attention notices */}
      <section className="review-status-chips" aria-label="Case status">
        <div className="status-chip-row"><strong>{lifecycle?.caseState === "closed" ? "Closed" : "Open"}</strong></div>
        {locationNeedsConfirmationFor(report) ? (
          <p className="review-state-summary" role="status">
            <strong>Location needs confirmation</strong>
            <span>The submitted location could not be confirmed. Confirm it with the field contact before relying on it.</span>
          </p>
        ) : null}
        {photoDifficultFor(report) ? (
          <p className="review-state-summary" role="status">
            <strong>Photo may be difficult to review</strong>
            <span>The submitted photo has quality concerns. Weigh the written observations more heavily.</span>
          </p>
        ) : null}
        {observationsMismatchFor(report) ? (
          <p className="review-state-summary" role="status">
            <strong>The submitted observations do not fully match the Possible Condition</strong>
            <span>Compare the photo and field observations carefully before deciding.</span>
          </p>
        ) : null}
      </section>

      {/* 4. Reading order: photo, Possible Condition, field report, office decision, history */}
      <div className="review-single-column">
        <section className="review-card review-evidence" aria-labelledby="evidence-summary-heading">
          <h2 id="evidence-summary-heading">Evidence Summary</h2>
          <div className="review-evidence__grid">
        <section className="review-evidence__photo" aria-labelledby="submitted-photo-heading">
          <div className="section-heading">
            <div>
              <h2 id="submitted-photo-heading">Submitted photo</h2>
            </div>
          </div>
                <div className="evidence-stage">
                  {report.imageStatus === "available" ? (
                    <EvidenceThumbnail key={imageRetry} status="available" src={report.imageUrl} onLoadError={() => setImageLoadFailed(true)} label={`Submitted sugarcane photo for ${report.referenceCode}`} />
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
                <p className="evidence-meta">
                  <span>Captured {formatDateTime(report.capturedAt)}</span>
                  <span>Submitted {formatDateTime(report.submittedAt)}</span>
                </p>

        </section>


            <div className="review-evidence__observations">
              <section aria-labelledby="possible-condition-heading">
                <h3 id="possible-condition-heading">Possible Condition</h3>
                <DiseaseBadge disease={report.predictedDisease} includePossibleConditionPrefix={false} />
                <p>AI-assisted result. Decision support, not a diagnosis.</p>
              </section>
              <section aria-labelledby="reporter-observation-heading">
                <h3 id="reporter-observation-heading">What the reporter saw</h3>
                {report.mismatchReported === true ? <p className="observation-mismatch" role="status">The reporter said the AI result does not match what they observed.</p>
                  : report.mismatchReported === false ? <p>The reporter said the AI result matches what they observed.</p>
                  : <p>AI result agreement was not collected for this report.</p>}
                {isRssiReporterConcern(report) ? <p role="status"><strong>RSSI reported as a field concern</strong> — reporter-observed evidence only; the AI result does not cover RSSI.</p> : null}
                <dl className="detail-list">
                  <DetailField label="Observed or suspected concern">{report.reporterSuspectedCondition?.trim() || "None reported"}</DetailField>
                  <DetailField label="Observation text"><ClampedText text={report.reporterObservationText ?? "Not provided"} /></DetailField>
                </dl>
              </section>
              <section aria-labelledby="symptoms-heading">
                <h3 id="symptoms-heading">Observed symptoms</h3>
                <ul className="symptom-list">{report.symptoms.map((response) => <SymptomResponseItem response={response} key={response.id} />)}</ul>
              </section>
            </div>
          </div>
          <dl className="review-evidence__context">
            <DetailField label="Location"><span>{humanLocationFor(report)}{!hasUsableCoordinates(report) ? ` · Location not available${locationUnavailableReasonFor(report) ? ` — ${locationUnavailableReasonFor(report)}` : ""}` : null}{mapUrl ? <> · <a className="table-action" href={mapUrl} target="_blank" rel="noreferrer">View on map</a></> : null}</span></DetailField>
            <DetailField label="Affected area">{report.affectedAreaMeasurement === "not_measured" ? "Not measured" : report.affectedAreaHectares !== undefined ? `${report.affectedAreaHectares} ha` : "Not provided"}</DetailField>
            <DetailField label="Affected portion">{report.affectedPortionMeasurement === "not_measured" ? "Not measured" : report.affectedPortionPercent !== undefined ? `${report.affectedPortionPercent}%` : "Not provided"}</DetailField>
            <DetailField label="Crop age">{report.cropAge ?? "Not provided"}</DetailField>
            <DetailField label="Sugarcane variety">{report.sugarcaneVariety ?? "Not provided"}</DetailField>
            <DetailField label="Cane class">{report.caneClass ?? "Not provided"}</DetailField>
          </dl>
          <details className="review-full-details">
            <summary>View Full Report Details</summary>
            <section aria-labelledby="field-report-heading">
              <h3 id="field-report-heading">Field report</h3>
              <dl className="detail-list">
                <DetailField label="Reported severity">{report.reportedSeverity ?? "Not provided"}</DetailField>
                <DetailField label="Field notes"><ClampedText text={report.fieldNotes ?? "Not provided"} /></DetailField>
                <DetailField label="Confidence">{report.confidence !== undefined ? `${Math.round(report.confidence * 100)}%` : "Not provided"}</DetailField>
                <DetailField label="Model version">{report.modelVersion ?? "Not provided"}</DetailField>
              </dl>
              {report.modelVersionRecognised === false || report.classScores?.some(({ label }) => !Object.hasOwn(diseaseLabels, label)) ? <div role="status">
                {report.modelVersionRecognised === false ? <p>Model version not recognised — evidence shown as submitted: {report.modelVersion}</p> : null}
                <dl>{report.classScores?.map(({ label, score }) => <div key={label}><dt>{Object.hasOwn(diseaseLabels, label) ? diseaseLabels[label as keyof typeof diseaseLabels] : `${label} (unrecognised class)`}</dt><dd>{Math.round(score * 100)}%</dd></div>)}</dl>
              </div> : null}
            </section>
            <section aria-labelledby="farm-location-heading">
              <h3 id="farm-location-heading">Farm and location</h3>
              <CappedDetailList className="detail-list" limit={4}>
                <DetailField label="Farmer or farm owner">{report.farmerOrFarmOwnerName ?? "Not provided"}</DetailField>
                <DetailField label="Farm reference">{report.farmReference ?? "Not provided"}</DetailField>
                <DetailField label="Location source">{report.locationSource ?? "Not provided"}</DetailField>
                <DetailField label="Reporter">{report.submittedByName}</DetailField>
                <DetailField label="Submitter role">{submitterRoleLabels[report.submitterRole]}</DetailField>
              </CappedDetailList>
            </section>
            <section aria-labelledby="case-information-heading">
              <h3 id="case-information-heading">Case information</h3>
              <dl className="detail-list">
                <DetailField label="Observed at">{report.observedAt ? formatDateTime(report.observedAt) : "Not provided"}</DetailField>
                <DetailField label="Submitted at">{formatDateTime(report.submittedAt)}</DetailField>
                <DetailField label="First reviewed">{report.firstReviewedAt ? formatDateTime(report.firstReviewedAt) : "Not reviewed"}</DetailField>
                <DetailField label="Last reviewed by">{report.reviewedBy ?? "Not reviewed"}</DetailField>
                <DetailField label="Reviewed at">{report.reviewedAt ? formatDateTime(report.reviewedAt) : "Not reviewed"}</DetailField>
                <DetailField label="Field validation">{fieldValidationStateLabels[lifecycle?.fieldValidationState ?? "unassigned"]}</DetailField>
                <DetailField label="Verification">{verificationOutcomeLabels[lifecycle?.verificationOutcome ?? "not_determined"]}</DetailField>
                <DetailField label="Current review note"><ClampedText text={report.reviewNotes ?? "Not provided"} /></DetailField>
              </dl>
            </section>
          </details>
        </section>

                {report.fieldValidationAssignment?.completion ? (
                  <section
                    className="review-card field-validation-evidence-card"
                    aria-labelledby="field-validation-evidence-heading"
                  >
                    <div className="section-heading">
                      <div>
                        <span className="summary-tag">Field validation</span>
                        <h2 id="field-validation-evidence-heading">Completed field validation</h2>
                      </div>
                      <ClipboardList aria-hidden="true" />
                    </div>
                    <p className="authority-classification-help">
                      This submitted field evidence is read-only here and does not verify or close the case.
                    </p>
                    <div className="field-validation-action-evidence" aria-label="Action Taken evidence">
                      <p className="field-validation-action-evidence__title">Action Taken evidence</p>
                      <DetailField label="Action taken">
                        {report.fieldValidationAssignment.completion.actionTaken}
                      </DetailField>
                    </div>
                    <dl className="detail-list reporter-observation-details">
                      <DetailField label="Observation">
                        <ClampedText text={report.fieldValidationAssignment.completion.fieldObservation} />
                      </DetailField>
                      <DetailField label="Finding">
                        <ClampedText text={report.fieldValidationAssignment.completion.fieldFinding} />
                      </DetailField>
                      <DetailField label="Follow-up outcome">
                        {report.fieldValidationAssignment.completion.followUpOutcome
                          ? followUpOutcomeLabels[report.fieldValidationAssignment.completion.followUpOutcome]
                          : "Not provided"}
                      </DetailField>
                      <DetailField label="Fresh validation photo">
                        {report.fieldValidationAssignment.completion.freshPhoto?.available
                        && report.fieldValidationAssignment.completion.freshPhoto.url ? (
                          <a
                            className="table-action"
                            href={report.fieldValidationAssignment.completion.freshPhoto.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open authorized photo
                          </a>
                        ) : "Not provided"}
                      </DetailField>
                    </dl>
                  </section>
                ) : null}

        <ReviewDecisionForm key={report.uuid} report={report} onRefresh={() => reportQuery.refetch()} />

        <HistoricalReferralPanel report={report} />
        <OfflineHandoffNotes report={report} />

            {/* Case history (secondary, collapsed) */}
            <details className="review-card case-history-disclosure">
              <summary>
                <div className="disclosure-left">
                  <strong>Case history</strong>
                  <span className="disclosure-metric">{caseHistorySummary}</span>
                </div>
                <History aria-hidden="true" />
              </summary>
              <div className="disclosure-content">
                <section className="review-card case-timeline" aria-labelledby="timeline-heading">
                  <div className="section-heading">
                    <div>
                      <h2 id="timeline-heading">Case history</h2>
                    </div>
                    <History aria-hidden="true" />
                  </div>

                  <div className="history-filter-row" role="tablist" aria-label="Filter case history">
                    <button
                      type="button"
                      className={`filter-chip ${historyFilter === "all" ? "is-active" : ""}`}
                      onClick={() => setHistoryFilter("all")}
                    >
                      All ({historyCounts.all})
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${historyFilter === "review" ? "is-active" : ""}`}
                      onClick={() => setHistoryFilter("review")}
                    >
                      Review ({historyCounts.review})
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${historyFilter === "field_validation" ? "is-active" : ""}`}
                      onClick={() => setHistoryFilter("field_validation")}
                    >
                      Field validation ({historyCounts.field_validation})
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${historyFilter === "referral" ? "is-active" : ""}`}
                      onClick={() => setHistoryFilter("referral")}
                    >
                      Referral ({historyCounts.referral})
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${historyFilter === "correction" ? "is-active" : ""}`}
                      onClick={() => setHistoryFilter("correction")}
                    >
                      Correction ({historyCounts.correction})
                    </button>
                  </div>

                  {!caseHistoryAvailable ? (
                    <p className="timeline-empty">
                      Case history is not available for this older record.
                    </p>
                  ) : visibleHistory.length > 0 ? (
                    <ol className="timeline-list">
                      {visibleHistory.map((entry) => (
                        <li key={entry.id} className={`timeline-item timeline-item--${entry.type}`}>
                          <div className="timeline-item__header">
                            <span className="timeline-item__badge">{entry.typeLabel}</span>
                            <span className="timeline-item__actor">{entry.actor}</span>
                            <time className="timeline-item__time" dateTime={entry.timestamp}>
                              {formatDateTime(entry.timestamp)}
                            </time>
                          </div>
                          <dl className="timeline-item__details">
                            {entry.fields.map((field) => (
                              <DetailField label={field.label} key={field.label}>
                                {field.value}
                              </DetailField>
                            ))}
                            {entry.notes ? (
                              <DetailField label="Notes"><ClampedText text={entry.notes} /></DetailField>
                            ) : null}
                          </dl>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="timeline-empty">
                      {historyFilter === "all"
                        ? "No prior review events recorded."
                        : `No prior ${historyFilter.replaceAll("_", " ")} events recorded.`}
                    </p>
                  )}
                </section>
              </div>
            </details>

        {/* Q3 = A: the remaining case actions live under one disclosure */}
        <details className="review-card case-history-disclosure">
          <summary>
            <div className="disclosure-left">
              <strong>Other case actions</strong>
            </div>
            <MoreHorizontal aria-hidden="true" />
          </summary>
          <div className="disclosure-content">
        <section className="other-case-actions" aria-label="Other case actions">
          {report.canonicalLinkage?.isDuplicate ? (
            <div className="duplicate-linkage-summary" role="status">
              <strong>Linked as a possible duplicate</strong>
              <p>The submitted record and its audit history remain preserved. This link does not merge evidence or change the canonical case.</p>
              {report.canonicalLinkage.canonicalCase ? (
                <Link to={routes.reportDetail(report.canonicalLinkage.canonicalCase.uuid)}>
                  Canonical case {report.canonicalLinkage.canonicalCase.referenceCode}
                </Link>
              ) : null}
              {report.canonicalLinkage.linkedBy ? (
                <small>
                  Linked by {report.canonicalLinkage.linkedBy.name}
                  {report.canonicalLinkage.linkedAt ? ` on ${formatDateTime(report.canonicalLinkage.linkedAt)}` : ""}.
                </small>
              ) : null}
              {report.canonicalLinkage.reason ? <small>Reason: {report.canonicalLinkage.reason}</small> : null}
              {duplicateUnlinkConflict ? <p className="form-error" role="alert">This case changed while the duplicate link was being removed. Refresh before trying again.</p> : null}
              {duplicateUnlinkForbidden ? <p className="form-error" role="alert">You do not have permission to remove duplicate links.</p> : null}
              {duplicateUnlinkValidation ? <p className="form-error" role="alert">This duplicate link cannot be removed while the case has active work or completed evidence.</p> : null}
              {duplicateUnlinkMalformed ? <p className="form-error" role="alert">The duplicate unlink response had an unexpected format. Refresh the report before trying again.</p> : null}
              {duplicateUnlinkMutation.isError && !duplicateUnlinkConflict && !duplicateUnlinkForbidden && !duplicateUnlinkValidation && !duplicateUnlinkMalformed ? <p className="form-error" role="alert">The duplicate unlinking service is unavailable. No link change was confirmed.</p> : null}
              <Button
                type="button"
                variant="secondary"
                disabled={duplicateUnlinkMutation.isPending}
                onClick={unlinkDuplicate}
              >
                {duplicateUnlinkMutation.isPending ? "Removing link..." : "Remove duplicate link"}
              </Button>
            </div>
          ) : null}
          {duplicateLinkNotice ? (
            <p className="success-banner" role="status">{duplicateLinkNotice}</p>
          ) : null}
          <div className="more-actions-row">
            {!report.canonicalLinkage?.isDuplicate ? (
              <Button
                type="button"
                variant="secondary"
                icon={<GitBranch aria-hidden="true" />}
                onClick={() => setDuplicateLinkModalOpen(true)}
              >
                Link as possible duplicate
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              icon={<Link2 aria-hidden="true" />}
              onClick={() => setMetadataCorrectionModalOpen(true)}
            >
              Correct case information
            </Button>
          </div>
        </section>
          </div>
        </details>
      </div>

      {/* Modal 4: Duplicate Linkage (F5) */}
      <Modal
        id="duplicate-link-modal"
        title="Link as possible duplicate"
        description="Possible matches are decision support only. Reviewers and admins choose whether to link this case; nothing is merged, deleted, or blocked automatically."
        open={duplicateLinkModalOpen}
        onClose={closeDuplicateLinkModal}
        disabled={duplicateLinkMutation.isPending}
        isDirty={duplicateLinkDirty}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={duplicateLinkMutation.isPending}
              onClick={closeDuplicateLinkModal}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={duplicateLinkMutation.isPending}
              onClick={linkDuplicate}
            >
              {duplicateLinkMutation.isPending ? "Linking case..." : "Link as possible duplicate"}
            </Button>
          </>
        }
      >
        <section className="duplicate-link-card" aria-labelledby="duplicate-link-heading">
          <div className="section-heading">
            <div>
              <h3 id="duplicate-link-heading">Possible duplicate linkage</h3>
            </div>
            <GitBranch aria-hidden="true" />
          </div>
          {possibleMatchesQuery.isPending ? (
            <p className="duplicate-link-status" role="status">Checking recent submissions for a possible match...</p>
          ) : null}
          {possibleMatchesQuery.isError ? (
            <p className="duplicate-link-status" role="alert">
              Possible matches could not be loaded. You can still search cases or paste a canonical case ID below.
            </p>
          ) : null}
          {!possibleMatchesQuery.isPending && !possibleMatchesQuery.isError && possibleMatches.length === 0 ? (
            <p className="duplicate-link-status">No possible recent matches were found. A legitimate case can remain separate.</p>
          ) : null}
          {possibleMatches.length > 0 ? (
            <ul className="possible-match-list">
              {possibleMatches.map((match) => (
                <li key={match.uuid}>
                  <div>
                    <Link to={routes.reportDetail(match.uuid)}>{match.referenceCode}</Link>
                    <small>
                      Possible match - {Math.round(match.distanceMeters)} m away - submitted {formatDateTime(match.submittedAt)}.
                    </small>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setCanonicalReportUuid(match.uuid);
                      setCanonicalReportLabel(
                        `${match.referenceCode} · ${formatDate(match.submittedAt)}`,
                      );
                      setDuplicateLinkSubmitted(false);
                      setDuplicateLinkNotice(null);
                      duplicateLinkMutation.reset();
                    }}
                  >
                    Use as canonical
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <ReportPicker
            excludeUuid={report?.uuid}
            value={
              canonicalReportUuid.trim() && canonicalReportLabel
                ? { uuid: canonicalReportUuid.trim(), label: canonicalReportLabel }
                : null
            }
            onSelect={(selection) => {
              setCanonicalReportUuid(selection?.uuid ?? "");
              setCanonicalReportLabel(selection?.label ?? null);
              setDuplicateLinkSubmitted(false);
              setDuplicateLinkNotice(null);
              duplicateLinkMutation.reset();
            }}
            disabled={duplicateLinkMutation.isPending}
          />
          <details className="uuid-fallback">
            <summary>Paste a case ID instead</summary>
            <label className="select-filter" htmlFor="canonical-report-uuid">
              <span>Canonical case ID</span>
              <input
                id="canonical-report-uuid"
                value={canonicalReportUuid}
                onChange={(event) => {
                  setCanonicalReportUuid(event.target.value);
                  setCanonicalReportLabel(null);
                  setDuplicateLinkSubmitted(false);
                  setDuplicateLinkNotice(null);
                  duplicateLinkMutation.reset();
                }}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
            </label>
          </details>
          <label className="select-filter" htmlFor="duplicate-link-reason">
            <span>Link reason (optional)</span>
            <input
              id="duplicate-link-reason"
              value={duplicateLinkReason}
              maxLength={320}
              onChange={(event) => {
                setDuplicateLinkReason(event.target.value);
                setDuplicateLinkSubmitted(false);
                setDuplicateLinkNotice(null);
                duplicateLinkMutation.reset();
              }}
              placeholder="Why is this case treated as a duplicate?"
            />
          </label>
          {duplicateLinkSubmitted && !canonicalReportUuid.trim() ? (
            <p className="form-error" role="alert">Select a case from the search results or enter a canonical case ID before linking.</p>
          ) : null}
          {duplicateLinkValidationError ? (
            <p className="form-error" role="alert">{duplicateLinkValidationError}</p>
          ) : null}
          {duplicateLinkReportError ? (
            <p className="form-error" role="alert">{duplicateLinkReportError}</p>
          ) : null}
          {duplicateLinkConflict ? (
            <p className="form-error" role="alert">This case is already linked to another canonical case. Refresh before trying again.</p>
          ) : null}
          {duplicateLinkForbidden ? (
            <p className="form-error" role="alert">You do not have permission to link duplicate cases.</p>
          ) : null}
          {duplicateLinkMalformed ? (
            <p className="form-error" role="alert">The duplicate link response had an unexpected format. Refresh the report before trying again.</p>
          ) : null}
          {duplicateLinkMutation.isError &&
          !duplicateLinkConflict &&
          !duplicateLinkValidationError &&
          !duplicateLinkReportError &&
          !duplicateLinkForbidden &&
          !duplicateLinkMalformed ? (
            <p className="form-error" role="alert">The duplicate linking service is unavailable. No link was recorded.</p>
          ) : null}
        </section>
      </Modal>

      {/* Modal 5: Metadata Correction (F6) */}
      <Modal
        id="metadata-correction-modal"
        title="Correct case information"
        description="Corrections preserve the submitted value, corrected value, actor, timestamp, and reason. Submitted AI and observation evidence cannot be edited here."
        open={metadataCorrectionModalOpen}
        onClose={closeMetadataCorrectionModal}
        disabled={reviewMutation.isPending}
        isDirty={metadataCorrectionDirty}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={reviewMutation.isPending}
              onClick={closeMetadataCorrectionModal}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={reviewMutation.isPending}
              onClick={saveMetadataCorrection}
            >
              {reviewMutation.isPending ? "Saving correction..." : "Save correction"}
            </Button>
          </>
        }
      >
        <div className="metadata-correction">
          <p className="authority-classification-help">
            Corrections preserve the submitted value, corrected value, actor, timestamp, and reason. Submitted AI and observation evidence cannot be edited here.
          </p>
          <div className="metadata-correction-grid">
            <label className="select-filter" htmlFor="correction-barangay">
              <span>Barangay</span>
              <input
                id="correction-barangay"
                value={metadataDraft?.barangay ?? ""}
                onChange={(event) => updateMetadataDraft("barangay", event.target.value)}
              />
            </label>
            <label className="select-filter" htmlFor="correction-farmer">
              <span>Farmer or farm owner</span>
              <input
                id="correction-farmer"
                value={metadataDraft?.farmerOrFarmOwnerName ?? ""}
                onChange={(event) => updateMetadataDraft("farmerOrFarmOwnerName", event.target.value)}
              />
            </label>
            <label className="select-filter" htmlFor="correction-province">
              <span>Province</span>
              <input
                id="correction-province"
                value={metadataDraft?.province ?? ""}
                onChange={(event) => updateMetadataDraft("province", event.target.value)}
              />
            </label>
            <label className="select-filter" htmlFor="correction-municipality">
              <span>Municipality</span>
              <input
                id="correction-municipality"
                value={metadataDraft?.municipality ?? ""}
                onChange={(event) => updateMetadataDraft("municipality", event.target.value)}
              />
            </label>
            <label className="select-filter" htmlFor="correction-area">
              <span>Affected area (ha)</span>
              <input
                id="correction-area"
                type="number"
                min="0"
                step="0.01"
                value={metadataDraft?.affectedAreaHectares ?? ""}
                onChange={(event) => updateMetadataDraft("affectedAreaHectares", event.target.value)}
              />
            </label>
            <label className="select-filter" htmlFor="correction-portion">
              <span>Affected portion (%)</span>
              <input
                id="correction-portion"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={metadataDraft?.affectedPortionPercent ?? ""}
                onChange={(event) => updateMetadataDraft("affectedPortionPercent", event.target.value)}
              />
            </label>
          </div>
          {correctionSubmitted && correctionError ? (
            <p id="correction-reason-error" className="form-error" role="alert">
              {correctionError}
            </p>
          ) : null}
          <TextArea
            id="correction-reason"
            label="Correction reason"
            hint="Required when an operational value changes."
            rows={3}
            maxLength={1000}
            value={correctionReason}
            aria-describedby={
              correctionSubmitted && correctionError
                ? "correction-reason-error"
                : undefined
            }
            onChange={(event) => {
              setCorrectionReason(event.target.value);
              setCorrectionSubmitted(false);
              reviewMutation.reset();
            }}
            placeholder="Explain the source of the correction..."
          />
          {report.metadataCorrectionAudits?.length ? (
            <div className="metadata-audit-history">
              <strong>Correction history</strong>
              <ol>
                {report.metadataCorrectionAudits.map((audit) => (
                  <li key={audit.id}>
                    <span>
                      {audit.field.replaceAll("_", " ")}: {String(audit.originalValue ?? "Not provided")} to {String(audit.correctedValue ?? "Not provided")}
                    </span>
                    <small>
                      {audit.actorName} on {formatDateTime(audit.createdAt)} - {audit.reason}
                    </small>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="authority-classification-help">No case information corrections recorded.</p>
          )}
          {renderReviewMutationErrors()}
        </div>
      </Modal>
      {saveNotice ? (
        <Toast message={saveNotice} onDismiss={() => setSaveNotice(null)} />
      ) : null}
    </PageContent>
  );
}


