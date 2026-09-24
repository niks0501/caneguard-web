import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  GitBranch,
  History,
  Link2,
  MoreHorizontal,
} from "lucide-react";
import { Link, useNavigate, useParams } from "react-router";
import { ZodError } from "zod";
import { routes } from "../app/routes";
import { ApiError } from "../api/ApiError";
import { DetailField, PageContent, PageHeader } from "../components/layout/Page";
import { EvidenceThumbnail } from "../components/reports/EvidenceThumbnail";
import { ReferralWorkflow } from "../components/reports/ReferralWorkflow";
import { ReportPicker } from "../components/reports/ReportPicker";
import { DiseaseBadge, ReviewStatusBadge } from "../components/reports/ReportBadges";
import { SymptomResponseItem } from "../components/reports/SymptomResponseItem";
import { Button } from "../components/ui/Button";
import { SelectFilter, TextArea } from "../components/ui/FormControls";
import { ErrorState, ImagePendingState, LoadingState } from "../components/ui/States";
import { CappedDetailList } from "../components/ui/CappedDetailList";
import { ClampedText } from "../components/ui/ClampedText";
import { Modal } from "../components/ui/Modal";
import { confirmDiscardUnsavedChanges } from "../components/ui/confirmDiscard";
import {
  actionTakenLabels,
  activeAuthorityClassifiedConditions,
  authorityClassifiedConditionLabels,
  caseStateLabels,
  fieldValidationStateLabels,
  followUpOutcomeLabels,
  isLegacyAuthorityClassifiedCondition,
  submitterRoleLabels,
  verificationOutcomeLabels,
} from "../domain/report.metadata";
import {
  REPORTER_OBSERVED_CONCERN_RSSI,
  type ActionTaken,
  type AuthorityClassifiedCondition,
  type CaseState,
  type ConsultStatus,
  type DiseaseReport,
  type FieldValidationState,
  type ReferralState,
  type VerificationOutcome,
} from "../domain/report.types";
import type {
  ConsultInvite,
  OperationalMetadataCorrections,
  ReportReviewInput,
} from "../domain/review.types";
import { legacyLifecycleForReviewStatus } from "../data/api/mappers/lifecycle.mapper";
import { useFieldReporters } from "../hooks/useFieldReporters";
import {
  useAdvisories,
  useExpertDirectory,
  useIssueConsultInvite,
  useLinkDuplicateReport,
  usePossibleRecentMatches,
  useUnlinkDuplicateReport,
  useRecordReportReferral,
  useReport,
  useUpdateReportReview,
} from "../hooks/useReports";
import { formatDate, formatDateTime } from "../lib/formatters";

/**
 * One guided office decision. Every value except `needs_field_validation` maps
 * directly onto an existing `ActionTaken`; field validation is the separate
 * lifecycle dimension it activates.
 */
type NextAction =
  | "needs_field_validation"
  | "advisory_provided"
  | "technical_assistance_provided"
  | "referred_for_expert_validation"
  | "no_further_action_required";

type MetadataDraft = {
  barangay: string;
  farmerOrFarmOwnerName: string;
  province: string;
  municipality: string;
  affectedAreaHectares: string;
  affectedPortionPercent: string;
};

const nextActions: Array<{ value: NextAction; description: string }> = [
  { value: "needs_field_validation", description: "Assign a Field Inspector to visit the site and record fresh field evidence. The case stays open." },
  { value: "advisory_provided", description: "Record guidance provided to the field contact." },
  { value: "referred_for_expert_validation", description: "Record the expert handoff. The case stays open while input is pending." },
  { value: "no_further_action_required", description: "Record that no further office action is required." },
];

const nextActionLabels: Record<NextAction, string> = {
  needs_field_validation: "Needs field validation",
  advisory_provided: "Provide advisory",
  technical_assistance_provided: "Provide technical assistance",
  referred_for_expert_validation: "Refer to expert",
  no_further_action_required: "No further action",
};

const referralStateLabels: Record<ReferralState, string> = {
  not_referred: "Not referred",
  referred: "Awaiting expert input",
  expert_response_received: "Expert response received",
};

function referralDueDateFor(referralDate: string): string {
  const date = new Date(`${referralDate}T00:00:00`);
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function isActiveConsultStatus(status?: ConsultStatus): boolean {
  return status === "pending" || status === "in_progress";
}

function hasActiveConsult(report: DiseaseReport): boolean {
  if (report.consults) {
    return report.consults.some((consult) => isActiveConsultStatus(consult.status));
  }

  const latestReferralStatus = report.referral?.status;
  return latestReferralStatus !== undefined
    ? isActiveConsultStatus(latestReferralStatus)
    : report.lifecycle?.referralState === "referred";
}

function actionTakenForNextAction(nextAction: NextAction): ActionTaken | undefined {
  return nextAction === "needs_field_validation" ? undefined : nextAction;
}

function derivedNextAction(report: DiseaseReport): NextAction | null {
  const fieldValidationState = report.lifecycle?.fieldValidationState ?? "unassigned";
  if (fieldValidationState === "assigned" || fieldValidationState === "in_progress") {
    return "needs_field_validation";
  }
  if (report.lifecycle?.referralState === "referred") {
    return "referred_for_expert_validation";
  }
  return report.actionTaken ?? null;
}

function formatShortDate(isoString: string): string {
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return isoString;
  }
}

function formatLastActivity(report: DiseaseReport): string {
  if (report.reviewedAt && report.reviewedBy) {
    return `${formatShortDate(report.reviewedAt)} · ${report.reviewedBy}`;
  }
  const lastEvent = report.reviewEvents?.[0] ?? report.reviewEvents?.[report.reviewEvents.length - 1];
  if (lastEvent) {
    return `${formatShortDate(lastEvent.createdAt)} · ${lastEvent.actor?.name ?? "Authorized reviewer"}`;
  }
  if (report.submittedAt) {
    return `${formatShortDate(report.submittedAt)} · ${report.submittedByName}`;
  }
  return "None";
}

function getHeroAnswer(
  report: DiseaseReport,
  selectedNextAction: NextAction | null,
  referralPending: boolean,
  fieldValidationActive: boolean,
): { answer: string; consequence: string } {
  if (referralPending) {
    return {
      answer: "Waiting on the expert",
      consequence:
        "The case stays open until the expert response is recorded. Staff-Classified Condition, verification, and notes can still be saved.",
    };
  }

  if (selectedNextAction === "needs_field_validation") {
    if (fieldValidationActive) {
      const assigneeName = report.fieldValidationAssignment?.assignee.name ?? "a Field Inspector";
      const targetDate = report.fieldValidationAssignment?.targetVisitDate;
      return {
        answer: `Field validation active — assigned to ${assigneeName}.`,
        consequence: targetDate
          ? `Target visit is ${targetDate}. Active assignments and submitted field-validation evidence are not reassigned here.`
          : "Active assignments and submitted field-validation evidence are not reassigned here.",
      };
    }
    return {
      answer: "Assign a Field Inspector — the case stays open.",
      consequence: "The case is flagged Needs field validation and no inspector is assigned yet.",
    };
  }

  if (selectedNextAction === "advisory_provided") {
    return {
      answer: "Provide office guidance — guidance recorded with review.",
      consequence: "Choose validated office guidance when the field contact should receive concrete follow-up steps.",
    };
  }

  if (selectedNextAction === "technical_assistance_provided") {
    return {
      answer: "Deliver technical assistance — assistance recorded with review.",
      consequence: "Record practical technical assistance delivered to the field contact.",
    };
  }

  if (selectedNextAction === "referred_for_expert_validation") {
    return {
      answer: "Refer to expert — the case stays open while input is pending.",
      consequence: "Capture the external handoff as plain operational text. The case stays open while input is pending.",
    };
  }

  if (selectedNextAction === "no_further_action_required") {
    return {
      answer: "No further action — office handling is complete.",
      consequence: "Record that no further office action is required.",
    };
  }

  return {
    answer: "Choose a next action for this case.",
    consequence: "Review the submitted evidence below, select a next action, and save the office review.",
  };
}

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
  const { reportId = "" } = useParams();
  const navigate = useNavigate();
  const [notesOverride, setNotesOverride] = useState<string | null>(null);
  const [nextActionOverride, setNextActionOverride] = useState<NextAction | null>(null);
  const [nextActionTouched, setNextActionTouched] = useState(false);
  const [closeCaseConfirmed, setCloseCaseConfirmed] = useState(true);
  const [reopenCaseConfirmed, setReopenCaseConfirmed] = useState(false);
  const [referralDestination, setReferralDestination] = useState("");
  const [referralReference, setReferralReference] = useState("");
  const [referralDate, setReferralDate] = useState("");
  const [referralDueDate, setReferralDueDate] = useState("");
  const [referralDueDateTouched, setReferralDueDateTouched] = useState(false);
  const [referralExpertUuid, setReferralExpertUuid] = useState<string | null>(null);
  const [referralExpertName, setReferralExpertName] = useState("");
  const [referralExpertContact, setReferralExpertContact] = useState("");
  const [referralShareFullContext, setReferralShareFullContext] = useState(false);
  const [referralNote, setReferralNote] = useState("");
  const [advisoryUuidOverride, setAdvisoryUuidOverride] = useState<string | null | undefined>(undefined);
  const [referralSubmitted, setReferralSubmitted] = useState(false);
  const [authorityClassificationOverride, setAuthorityClassificationOverride] =
    useState<AuthorityClassifiedCondition | null | undefined>(undefined);
  const [verificationOverride, setVerificationOverride] = useState<
    VerificationOutcome | "" | undefined
  >(undefined);
  const [fieldValidationAssigneeOverride, setFieldValidationAssigneeOverride] =
    useState<string | null | undefined>(undefined);
  const [fieldValidationTargetDateOverride, setFieldValidationTargetDateOverride] =
    useState<string | null | undefined>(undefined);
  const [metadataDraftOverride, setMetadataDraftOverride] = useState<MetadataDraft | null>(
    null,
  );
  const [correctionReason, setCorrectionReason] = useState("");
  const [canonicalReportUuid, setCanonicalReportUuid] = useState("");
  const [canonicalReportLabel, setCanonicalReportLabel] = useState<string | null>(null);
  const [duplicateLinkReason, setDuplicateLinkReason] = useState("");
  const [duplicateLinkSubmitted, setDuplicateLinkSubmitted] = useState(false);
  const [duplicateLinkNotice, setDuplicateLinkNotice] = useState<string | null>(null);
  const [officeDecisionSubmitted, setOfficeDecisionSubmitted] = useState(false);
  const [officeDecisionModalOpen, setOfficeDecisionModalOpen] = useState(false);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [referralModalOpen, setReferralModalOpen] = useState(false);
  const [savedReferral, setSavedReferral] = useState(false);
  const [referralInvite, setReferralInvite] = useState<ConsultInvite | null>(null);
  const [referralInviteFailed, setReferralInviteFailed] = useState(false);
  const [duplicateLinkModalOpen, setDuplicateLinkModalOpen] = useState(false);
  const [metadataCorrectionModalOpen, setMetadataCorrectionModalOpen] = useState(false);
  const [fieldValidationAssignSubmitted, setFieldValidationAssignSubmitted] = useState(false);
  const [correctionSubmitted, setCorrectionSubmitted] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [imageRetry, setImageRetry] = useState(0);
  const [historyFilter, setHistoryFilter] = useState<"all" | CaseHistoryEntryType>("all");
  const reportQuery = useReport(reportId);
  const possibleMatchesQuery = usePossibleRecentMatches(reportId);
  const fieldReportersQuery = useFieldReporters();
  const expertDirectoryQuery = useExpertDirectory();
  const advisoriesQuery = useAdvisories();
  const reviewMutation = useUpdateReportReview(reportId);
  const duplicateLinkMutation = useLinkDuplicateReport(reportId);
  const duplicateUnlinkMutation = useUnlinkDuplicateReport(reportId);
  const recordReferral = useRecordReportReferral(reportId);
  const issueReferralInvite = useIssueConsultInvite(reportId);
  const report = reportQuery.data;
  const possibleMatches = possibleMatchesQuery.data?.matches ?? [];
  const advisories = advisoriesQuery.data ?? [];
  const lifecycle = report
    ? report.lifecycle ?? legacyLifecycleForReviewStatus(report.reviewStatus)
    : undefined;
  const referralPending = lifecycle?.referralState === "referred";
  const proposalNeedsDecision = report?.referral?.status === "completed"
    && !report.referral.consultReviewOutcome;
  const notes = notesOverride ?? report?.reviewNotes ?? "";
  const selectedNextAction = nextActionTouched
    ? nextActionOverride
    : report
      ? derivedNextAction(report)
      : null;
  const selectedAuthorityClassification =
    authorityClassificationOverride !== undefined
      ? authorityClassificationOverride
      : report?.authorityClassifiedCondition ?? null;
  const existingLegacyAuthorityClassification = isLegacyAuthorityClassifiedCondition(
    report?.authorityClassifiedCondition,
  )
    ? report.authorityClassifiedCondition
    : null;
  const selectedAdvisoryUuid = advisoryUuidOverride !== undefined
    ? advisoryUuidOverride
    : report?.advisory?.uuid ?? null;
  const selectedAdvisory = advisories.find((advisory) => advisory.uuid === selectedAdvisoryUuid)
    ?? (report?.advisory?.status === "validated" ? report.advisory : null);
  const selectedVerificationOutcome =
    verificationOverride !== undefined
      ? verificationOverride
      : lifecycle?.verificationOutcome === "not_determined"
        ? ""
        : lifecycle?.verificationOutcome ?? "";
  const currentCaseState: CaseState = lifecycle?.caseState ?? "open";
  const caseAlreadyClosed = currentCaseState === "closed";
  const currentFieldValidationState: FieldValidationState =
    lifecycle?.fieldValidationState ?? "unassigned";
  const fieldValidationActive =
    currentFieldValidationState === "assigned" ||
    currentFieldValidationState === "in_progress" ||
    currentFieldValidationState === "completed";
  // Assignment controls appear only for the needs-field-validation decision, and
  // never silently rewrite an assignment that is already underway or complete.
  const fieldValidationNeeded =
    selectedNextAction === "needs_field_validation" && !fieldValidationActive;
  const referralNeeded =
    selectedNextAction === "referred_for_expert_validation" &&
    report != null &&
    !hasActiveConsult(report);
  const closeCaseForNextAction =
    selectedNextAction === "no_further_action_required" &&
    closeCaseConfirmed &&
    !caseAlreadyClosed;
  const selectedFieldValidationAssignee =
    fieldValidationAssigneeOverride !== undefined
      ? fieldValidationAssigneeOverride ?? ""
      : report?.fieldValidationAssignment?.assignee.uuid ?? "";
  const selectedFieldValidationTargetDate =
    fieldValidationTargetDateOverride !== undefined
      ? fieldValidationTargetDateOverride ?? ""
      : report?.fieldValidationAssignment?.targetVisitDate ?? "";
  const fieldValidationError =
    fieldValidationNeeded && !selectedFieldValidationAssignee
      ? "Select a Field Inspector before saving field validation."
      : null;
  const referralInputError = !referralDestination.trim()
    ? "Add the expert destination."
    : !referralDate
      ? "Add the referral date."
      : !referralExpertUuid && !referralExpertName.trim()
        ? "Select an expert or enter the invitee's name."
        : !referralExpertUuid && !referralExpertContact.trim()
          ? "Add a contact for the invitee."
          : null;
  const referralFieldError = referralSubmitted && referralNeeded ? referralInputError : null;
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

  const heroContent = report
    ? getHeroAnswer(report, selectedNextAction, referralPending, fieldValidationActive)
    : { answer: "", consequence: "" };

  const mapUrl = report ? mapUrlFor(report) : null;

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
  const trimmedNotes = notes.trim();
  const noteError =
    trimmedNotes.length > 1000
      ? "Review notes must be 1,000 characters or fewer."
      : selectedVerificationOutcome === "unable_to_verify" && !trimmedNotes
        ? "Add a note explaining why the evidence cannot be verified."
        : null;
  const correctionError =
    metadataCorrections && !correctionReason.trim()
      ? "Add a reason for the case information correction."
      : null;
  const hasReviewInput =
    selectedNextAction !== null ||
    verificationOverride !== undefined ||
    reopenCaseConfirmed ||
    authorityClassificationOverride !== undefined ||
    notesOverride !== null ||
    metadataCorrections !== undefined ||
    advisoryUuidOverride !== undefined;

  const officeDecisionInvalid = officeDecisionSubmitted && (!hasReviewInput || noteError !== null);

  // Dirty signals per modal so Cancel, backdrop, and Escape all confirm
  // before discarding an edited draft (the shared Modal guard covers
  // backdrop/Escape/close-button; the guarded closers below cover Cancel).
  const officeDecisionDirty = Boolean(
    (notesOverride !== null && notesOverride !== (report?.reviewNotes ?? "")) ||
    (authorityClassificationOverride !== undefined &&
      authorityClassificationOverride !== (report?.authorityClassifiedCondition ?? null)) ||
    (verificationOverride !== undefined &&
      verificationOverride !== (lifecycle?.verificationOutcome ?? "")) ||
    (advisoryUuidOverride !== undefined &&
      advisoryUuidOverride !== (report?.advisory?.uuid ?? null)),
  );
  const assignmentDirty = Boolean(
    fieldValidationAssigneeOverride || fieldValidationTargetDateOverride,
  );
  const referralHandoffDirty = Boolean(
    referralDestination.trim() ||
    referralReference.trim() ||
    referralDate ||
    referralExpertUuid !== null ||
    referralExpertName.trim() ||
    referralExpertContact.trim() ||
    referralShareFullContext ||
    referralDueDate ||
    referralNote.trim(),
  );
  const duplicateLinkDirty = Boolean(
    canonicalReportUuid.trim() || duplicateLinkReason.trim(),
  );
  const metadataCorrectionDirty = Boolean(
    metadataCorrections !== undefined || correctionReason.trim(),
  );
  const closeOfficeDecisionModal = () => {
    if (confirmDiscardUnsavedChanges(officeDecisionDirty)) setOfficeDecisionModalOpen(false);
  };
  const closeAssignmentModal = () => {
    if (confirmDiscardUnsavedChanges(assignmentDirty)) setAssignmentModalOpen(false);
  };
  const closeReferralModal = () => {
    if (savedReferral) {
      setReferralModalOpen(false);
      navigate(routes.reports, { state: { notice: `${report?.referenceCode} - Awaiting expert input.` } });
    } else if (confirmDiscardUnsavedChanges(referralHandoffDirty)) setReferralModalOpen(false);
  };
  const closeDuplicateLinkModal = () => {
    if (confirmDiscardUnsavedChanges(duplicateLinkDirty)) setDuplicateLinkModalOpen(false);
  };
  const closeMetadataCorrectionModal = () => {
    if (confirmDiscardUnsavedChanges(metadataCorrectionDirty)) setMetadataCorrectionModalOpen(false);
  };

  const isDirty =
    (notesOverride !== null && notesOverride !== (report?.reviewNotes ?? "")) ||
    nextActionTouched ||
    (authorityClassificationOverride !== undefined &&
      authorityClassificationOverride !== (report?.authorityClassifiedCondition ?? null)) ||
    (verificationOverride !== undefined &&
      verificationOverride !== (lifecycle?.verificationOutcome ?? "")) ||
    (advisoryUuidOverride !== undefined && advisoryUuidOverride !== (report?.advisory?.uuid ?? null));

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    if (officeDecisionInvalid && report?.referenceCode) {
      document.title = `Error: CaneGuard | Case Review ${report.referenceCode}`;
    } else if (report?.referenceCode) {
      document.title = `CaneGuard | Case Review ${report.referenceCode}`;
    }
  }, [officeDecisionInvalid, report?.referenceCode]);

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
  const referralMutationError =
    recordReferral.error instanceof ApiError ? recordReferral.error : null;
  const referralRecordError = referralMutationError
    ? referralMutationError.status === 409
      ? "This case changed while the referral was being saved. Refresh the report before trying again."
      : referralMutationError.status === 422
        ? "The referral could not be saved. Check the required fields and current case state."
        : "The referral service is unavailable. No referral change was confirmed."
    : recordReferral.error instanceof ZodError
      ? "The server returned an unexpected referral response. Refresh the report before trying again."
      : null;
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

  const saveOfficeDecision = async () => {
    setOfficeDecisionSubmitted(true);
    if (report?.reviewVersion === undefined || proposalNeedsDecision) return;
    if (!hasReviewInput || noteError) return;

    // A new referral is saved atomically with the office context by the handoff
    // endpoint. Sending only its action to /review fails referral validation.
    if (nextActionTouched && referralNeeded) {
      setOfficeDecisionModalOpen(false);
      setReferralModalOpen(true);
      return;
    }

    const nextActionTaken = selectedNextAction
      ? actionTakenForNextAction(selectedNextAction)
      : undefined;
    const input: ReportReviewInput = {
      notes,
      authorityClassifiedCondition: selectedAuthorityClassification,
      verificationOutcome:
        verificationOverride === undefined
          ? undefined
          : verificationOverride || "not_determined",
      actionTaken: nextActionTouched ? nextActionTaken : undefined,
      ...(advisoryUuidOverride !== undefined
        ? { advisoryUuid: advisoryUuidOverride }
        : {}),
      caseState: closeCaseForNextAction
        ? "closed"
        : reopenCaseConfirmed && caseAlreadyClosed
          ? "open"
          : undefined,
      expectedVersion: report.reviewVersion,
    };

    try {
      await reviewMutation.mutateAsync(input);
      setOfficeDecisionModalOpen(false);
      const notice = nextActionTouched && selectedNextAction
        ? `Next action recorded: ${nextActionLabels[selectedNextAction]}.`
        : "The office review was updated.";
      navigate(routes.reports, {
        state: {
          notice: `${report.referenceCode} - ${notice}`,
        },
      });
    } catch {
      return;
    }
  };

  const saveAssignment = async () => {
    setFieldValidationAssignSubmitted(true);
    if (!selectedFieldValidationAssignee) return;
    if (report?.reviewVersion === undefined) return;

    try {
      await reviewMutation.mutateAsync({
        actionTaken: undefined,
        fieldValidationState: "assigned",
        fieldValidationAssigneeUuid: selectedFieldValidationAssignee,
        fieldValidationTargetDate: selectedFieldValidationTargetDate || null,
        expectedVersion: report.reviewVersion,
      });
      setAssignmentModalOpen(false);
      navigate(routes.reports, {
        state: {
          notice: `${report.referenceCode} - Field validation visit assigned.`,
        },
      });
    } catch {
      return;
    }
  };

  const saveReferralHandoff = async () => {
    if (savedReferral) return;
    setReferralSubmitted(true);
    if (referralInputError) return;
    if (report?.reviewVersion === undefined) return;

    try {
      await recordReferral.mutateAsync({
        destination: referralDestination,
        ...(referralReference.trim() ? { reference: referralReference.trim() } : {}),
        referralDate,
        ...(referralDueDateTouched ? { dueDate: referralDueDate || null } : {}),
        ...(referralExpertUuid ? { expertUuid: referralExpertUuid } : {}),
        ...(!referralExpertUuid && referralExpertName.trim() ? { expertName: referralExpertName } : {}),
        ...(!referralExpertUuid && referralExpertContact.trim() ? { expertContact: referralExpertContact } : {}),
        ...(referralShareFullContext ? { shareFullContext: true } : {}),
        note: referralNote,
        authorityClassifiedCondition: selectedAuthorityClassification,
        verificationOutcome: selectedVerificationOutcome || undefined,
        officeNotes: notes,
        expectedVersion: report.reviewVersion,
      });
      if (referralExpertUuid) {
        setReferralModalOpen(false);
        navigate(routes.reports, {
          state: { notice: `${report.referenceCode} - Awaiting expert input.` },
        });
      } else {
        setSavedReferral(true);
        await createReferralInvite();
      }
    } catch {
      return;
    }
  };

  const createReferralInvite = async () => {
    setReferralInviteFailed(false);
    try {
      setReferralInvite(await issueReferralInvite.mutateAsync(referralShareFullContext));
    } catch {
      setReferralInviteFailed(true);
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
      navigate(routes.reports, {
        state: {
          notice: `${report.referenceCode} - Case information corrected.`,
        },
      });
    } catch {
      return;
    }
  };

  if (reportQuery.isPending) return <PageContent><LoadingState message="Loading report..." /></PageContent>;
  if (reportQuery.isSuccess && !report) return <PageContent><ErrorState message="This report does not exist in the current submitted report queue." /></PageContent>;
  if ((reportQuery.isError && (!report || suppressCachedDetail)) || !report) return <PageContent><ErrorState message={detailErrorMessage} onRetry={suppressCachedDetail ? undefined : () => reportQuery.refetch()} /></PageContent>;

  return (
    <PageContent>
      <Link className="back-link" to={routes.reports}><ArrowLeft aria-hidden="true" />Back to submitted reports</Link>
      <PageHeader
        eyebrow="Case review"
        title={report.referenceCode}
        description={`submitted ${formatDateTime(report.submittedAt)} · Barangay ${report.barangay}${report.farmerOrFarmOwnerName ? ` · ${report.farmerOrFarmOwnerName}` : ""}`}
        actions={<ReviewStatusBadge status={report.reviewStatus} />}
      />
      {reportQuery.isRefetchError ? (
        <div className="detail-refresh-warning" role="alert">
          <span>{detailRefreshMessage}</span>
          <Button type="button" variant="secondary" onClick={() => reportQuery.refetch()}>
            Retry report refresh
          </Button>
        </div>
      ) : null}

      {/* 1. Answer hero */}
      <section className="review-card scan-hero" aria-labelledby="scan-hero-heading">
        <div className="scan-hero__header">
          <h2 id="scan-hero-heading">What this case needs from me</h2>
        </div>

        <div className="scan-hero__answer-block">
          <p className="scan-hero__answer">
            <strong>{heroContent.answer}</strong>
          </p>
          <p className="scan-hero__consequence">
            {heroContent.consequence}
          </p>
          {report.identificationGap?.state === "unidentified" ? (
            <p className="identification-gap-banner" role="status">
              <strong>No condition has been identified yet.</strong> Referring to an expert is the recommended next action. <a href="#review-next-action">Choose an expert referral</a>.
            </p>
          ) : null}
        </div>

        {referralPending ? (
          <div className="scan-hero__referral-pending">
            <div className="scan-hero__actions-row">
              <a href="#referral-response-form" className="button button--secondary">
                Record expert response
              </a>
            </div>
          </div>
        ) : (
          <>
            <fieldset
              className="review-actions review-actions--hero"
              id="review-next-action"
            >
              <legend>Next action - choose one</legend>
              <div className="review-actions__pills">
                {nextActions.map((action) => {
                  const disabled =
                    (fieldValidationActive && action.value === "needs_field_validation") ||
                    (caseAlreadyClosed && action.value === "referred_for_expert_validation");
                  const isClosedReferral =
                    caseAlreadyClosed && action.value === "referred_for_expert_validation";
                  return (
                    <label
                      className={`review-action-pill ${selectedNextAction === action.value ? "is-selected " : ""}${disabled ? "is-disabled" : ""}`}
                      key={action.value}
                    >
                      <input
                        type="radio"
                        id={`next-action-${action.value}`}
                        name="review-next-action"
                        value={action.value}
                        checked={selectedNextAction === action.value}
                        disabled={disabled}
                        aria-describedby={
                          isClosedReferral ? "expert-disabled-reason" : undefined
                        }
                        onChange={() => {
                          setNextActionOverride(action.value);
                          setNextActionTouched(true);
                          setReferralSubmitted(false);
                          reviewMutation.reset();
                          recordReferral.reset();
                        }}
                      />
                      <span>
                        <strong>{nextActionLabels[action.value]}</strong>
                        <small className="action-pill-desc">
                          {isClosedReferral
                            ? "Closed cases cannot be referred for expert validation. Reopen the case to request expert review."
                            : action.description}
                        </small>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            {selectedNextAction === "no_further_action_required" && !caseAlreadyClosed ? (
              <label className="case-confirmation">
                <input
                  type="checkbox"
                  checked={closeCaseConfirmed}
                  onChange={(event) => {
                    setCloseCaseConfirmed(event.target.checked);
                    reviewMutation.reset();
                  }}
                />
                <span>
                  <strong>Close this case</strong>
                  <small>Office handling is complete. Closure is recorded with this save.</small>
                </span>
              </label>
            ) : null}
            {caseAlreadyClosed ? (
              <label className="case-confirmation">
                <input
                  type="checkbox"
                  checked={reopenCaseConfirmed}
                  onChange={(event) => {
                    setReopenCaseConfirmed(event.target.checked);
                    reviewMutation.reset();
                  }}
                />
                <span>
                  <strong>Reopen this case</strong>
                  <small>This case is closed. Check to reopen office handling when you save.</small>
                </span>
              </label>
            ) : null}
          </>
        )}
      </section>

      {/* 2. Case status with plain-language attention notices */}
      <section className="review-status-chips" aria-label="Case status">
        <div className="status-chip-row">
          <div className="status-chip">
            <span className="status-chip__label">Work status:</span>
            <ReviewStatusBadge status={report.reviewStatus} />
          </div>
          <div className="status-chip">
            <span className="status-chip__label">Case:</span>
            <strong>{caseAlreadyClosed ? "Closed" : "Open"}</strong>
          </div>
          <div className="status-chip">
            <span className="status-chip__label">Field validation:</span>
            <strong>{fieldValidationStateLabels[currentFieldValidationState]}</strong>
          </div>
          <div className="status-chip">
            <span className="status-chip__label">Referral:</span>
            <strong>{referralStateLabels[lifecycle?.referralState ?? "not_referred"]}</strong>
          </div>
          <div className="status-chip">
            <span className="status-chip__label">Verification:</span>
            <strong>{verificationOutcomeLabels[lifecycle?.verificationOutcome ?? "not_determined"]}</strong>
          </div>
          <div className="status-chip">
            <span className="status-chip__label">Last activity:</span>
            <strong>{formatLastActivity(report)}</strong>
          </div>
          <div className="status-chip">
            <span className="status-chip__label">First reviewed:</span>
            <strong>{report.firstReviewedAt ? formatShortDate(report.firstReviewedAt) : "Not reviewed"}</strong>
          </div>
        </div>
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
        <section className="review-card" aria-labelledby="submitted-photo-heading">
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

        <section className="review-card" aria-labelledby="possible-condition-heading">
          <div className="review-essential-result__heading">
            <div>
              <h2 id="possible-condition-heading">Possible Condition</h2>
            </div>
            <DiseaseBadge disease={report.predictedDisease} />
          </div>
          <p><strong>AI-assisted result.</strong> Compare it with the submitted photo and field observations before deciding. It is not a diagnosis.</p>
        </section>

        <section className="review-card" aria-labelledby="field-report-heading">
          <div className="section-heading">
            <div>
              <h2 id="field-report-heading">Field report</h2>
            </div>
          </div>

                <section className="reporter-observation-card" aria-labelledby="reporter-observation-heading">
                  <div className="section-heading"><div><h3 id="reporter-observation-heading">What the reporter saw</h3></div><AlertTriangle aria-hidden="true" /></div>
                  {report.mismatchReported === true ? (
                    <div className="reporter-mismatch-label"><AlertTriangle aria-hidden="true" /><strong>The reporter said the Possible Condition does not match what they observed</strong></div>
                  ) : report.mismatchReported === false ? (
                    <p className="observation-empty">The reporter said the Possible Condition matches what they observed.</p>
                  ) : (
                    <p className="observation-empty">Possible Condition agreement was not collected for this report.</p>
                  )}
                  {isRssiReporterConcern(report) ? (
                    <div className="rssi-observation-callout" role="status">
                      <strong>RSSI reported as a field concern</strong>
                      <span>Reporter-observed evidence only. The AI result does not cover RSSI, and this does not change the Possible Condition.</span>
                    </div>
                  ) : null}
                  <dl className="detail-list reporter-observation-details">
                    <DetailField label="Observed or suspected concern">{report.reporterSuspectedCondition?.trim() || "None reported"}</DetailField>
                    <DetailField label="Observation text"><ClampedText text={report.reporterObservationText ?? "Not provided"} /></DetailField>
                  </dl>
                </section>


                <section aria-labelledby="symptoms-heading">
                  <div className="section-heading"><div><h3 id="symptoms-heading">Observed symptoms</h3></div><ClipboardList aria-hidden="true" /></div>
                  {observationsMismatchFor(report) ? (
                    <p className="observation-mismatch" role="status">The submitted observations do not fully match the Possible Condition.</p>
                  ) : null}
                  <ul className="symptom-list">
                    {report.symptoms.map((response) => <SymptomResponseItem response={response} key={response.id} />)}
                  </ul>
                </section>


                <section aria-labelledby="crop-heading">
                  <div className="section-heading"><div><h3 id="crop-heading">Crop information</h3></div></div>
                  <CappedDetailList className="detail-list" limit={4}>
                    <DetailField label="Reported severity">{report.reportedSeverity ?? "Not provided"}</DetailField>
                    <DetailField label="Sugarcane variety">{report.sugarcaneVariety ?? "Not provided"}</DetailField>
                    <DetailField label="Crop age">{report.cropAge ?? "Not provided"}</DetailField>
                    <DetailField label="Field notes"><ClampedText text={report.fieldNotes ?? "Not provided"} /></DetailField>
                    <DetailField label="Cane class">{report.caneClass ?? "Not provided"}</DetailField>
                  </CappedDetailList>
                </section>


          <section aria-labelledby="farm-location-heading">
            <div className="section-heading"><div><h3 id="farm-location-heading">Farm and location</h3></div></div>
            <CappedDetailList className="review-essential-context" limit={4}>
              <DetailField label="Farmer or farm owner">{report.farmerOrFarmOwnerName ?? "Not provided"}</DetailField>
              <DetailField label="Farm reference">{report.farmReference ?? "Not provided"}</DetailField>
              <DetailField label="Location">
                {!hasUsableCoordinates(report) ? (
                  <span>Location not available{locationUnavailableReasonFor(report) ? ` — ${locationUnavailableReasonFor(report)}` : ""}</span>
                ) : (
                  <span>{humanLocationFor(report)}{mapUrl ? (<> · <a className="table-action" href={mapUrl} target="_blank" rel="noreferrer">View on map</a></>) : null}</span>
                )}
              </DetailField>
              <DetailField label="Reporter">{report.submittedByName}</DetailField>
              <DetailField label="Submitter role">{submitterRoleLabels[report.submitterRole]}</DetailField>
            </CappedDetailList>
          </section>

          <section aria-labelledby="affected-area-heading">
            <div className="section-heading"><div><h3 id="affected-area-heading">Affected area</h3></div></div>
            <dl className="detail-list">
              <DetailField label="Affected area">
                {report.affectedAreaMeasurement === "not_measured"
                  ? "Not measured"
                  : report.affectedAreaHectares !== undefined
                    ? `${report.affectedAreaHectares} ha`
                    : "Not provided"}
              </DetailField>
              <DetailField label="Affected portion">
                {report.affectedPortionMeasurement === "not_measured"
                  ? "Not measured"
                  : report.affectedPortionPercent !== undefined
                    ? `${report.affectedPortionPercent}%`
                    : "Not provided"}
              </DetailField>
            </dl>
          </section>

          <section aria-labelledby="case-information-heading">
            <div className="section-heading"><div><h3 id="case-information-heading">Case information</h3></div></div>
            <CappedDetailList className="detail-list" limit={4}>
              <DetailField label="Observed at">{report.observedAt ? formatDateTime(report.observedAt) : "Not provided"}</DetailField>
              <DetailField label="Submitted at">{formatDateTime(report.submittedAt)}</DetailField>
              {report.reviewedBy ? <DetailField label="Last reviewed by">{report.reviewedBy}</DetailField> : null}
              {report.reviewedAt ? <DetailField label="Reviewed at">{formatDateTime(report.reviewedAt)}</DetailField> : null}
              {report.reviewNotes ? <DetailField label="Current review note"><ClampedText text={report.reviewNotes} /></DetailField> : null}
            </CappedDetailList>
          </section>
        </section>

      {/* Office decision (after the case is understood) */}
      <section className="review-card decision-summary" aria-labelledby="office-review-heading">
        <div className="section-heading">
          <div>
            <h2 id="office-review-heading">Office decision</h2>
          </div>
          <CheckCircle2 aria-hidden="true" />
        </div>

        <div className="decision-summary__grid">
          <div className="decision-summary__item">
            <span className="decision-summary__label">Next action</span>
            <strong>
              {selectedNextAction
                ? nextActionLabels[selectedNextAction]
                : "Pending decision"}
            </strong>
          </div>
          <div className="decision-summary__item">
            <span className="decision-summary__label">Staff classification</span>
            <strong>
              {selectedAuthorityClassification
                ? authorityClassifiedConditionLabels[selectedAuthorityClassification]
                : "Not classified"}
            </strong>
          </div>
          <div className="decision-summary__item">
            <span className="decision-summary__label">Verification</span>
            <strong>
              {selectedVerificationOutcome
                ? verificationOutcomeLabels[selectedVerificationOutcome]
                : verificationOutcomeLabels[lifecycle?.verificationOutcome ?? "not_determined"]}
            </strong>
          </div>
          <div className="decision-summary__item">
            <span className="decision-summary__label">Last change</span>
            <strong>
              {report.reviewedBy
                ? `Last classified by ${report.reviewedBy}${report.reviewedAt ? ` on ${formatDateTime(report.reviewedAt)}` : ""}`
                : "Not yet reviewed"}
            </strong>
          </div>
          {report.referral ? (
            <div className="decision-summary__item">
              <span className="decision-summary__label">Referral</span>
              <strong>
                {referralStateLabels[lifecycle?.referralState ?? "not_referred"]}
                {report.referral.destination ? ` · ${report.referral.destination}` : ""}
                {report.referral.trackingCode ? ` · Tracking ${report.referral.trackingCode}` : ""}
                {report.referral.reference ? ` · ${report.referral.reference}` : " · External reference pending"}
              </strong>
            </div>
          ) : null}
        </div>

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

        {fieldValidationActive && selectedNextAction === "needs_field_validation" ? (
          <div className="review-state-summary" role="status">
            <strong>Field validation: {fieldValidationStateLabels[currentFieldValidationState]}</strong>
            <span>
              {report.fieldValidationAssignment?.assignee.name
                ? `Assigned to ${report.fieldValidationAssignment.assignee.name}. `
                : ""}
              {report.fieldValidationAssignment?.targetVisitDate
                ? `Target visit ${report.fieldValidationAssignment.targetVisitDate}. `
                : ""}
              Active assignments and submitted field-validation evidence are not reassigned here.
            </span>
          </div>
        ) : null}

        <div className="decision-summary__actions">
          {proposalNeedsDecision ? (
            <p id="expert-proposal-decision" className="form-error" role="alert">
              Accept or override the completed expert proposal before saving this review.
            </p>
          ) : null}
          <Button
            type="button"
            icon={<CheckCircle2 aria-hidden="true" />}
            disabled={reviewMutation.isPending || proposalNeedsDecision}
            onClick={() => setOfficeDecisionModalOpen(true)}
          >
            {reviewMutation.isPending ? "Saving review..." : "Record office decision"}
          </Button>
          {selectedNextAction === "needs_field_validation" && !fieldValidationActive ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setAssignmentModalOpen(true)}
            >
              Assign visit
            </Button>
          ) : null}
          {selectedNextAction === "referred_for_expert_validation" && !hasActiveConsult(report) ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setReferralModalOpen(true)}
            >
              Request expert input
            </Button>
          ) : null}
        </div>
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

        {report.referral ? (
          <div id="referral-response-form">
            <ReferralWorkflow report={report} />
          </div>
        ) : null}

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

        <section className="more-actions-section" aria-label="More actions">
          <div className="section-heading">
            <div>
              <h3>More actions</h3>
            </div>
            <MoreHorizontal aria-hidden="true" />
          </div>
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

      {/* Modal 1: Office Decision (F1 + F4) */}
      <Modal
        id="office-decision-modal"
        title="Record office decision"
        description={nextActionTouched && referralNeeded
          ? "Record the office context, then complete the expert handoff. Both are saved together."
          : "Choose staff classification, verification outcome, guidance, and record intervention notes."}
        open={officeDecisionModalOpen}
        onClose={closeOfficeDecisionModal}
        disabled={reviewMutation.isPending}
        isDirty={officeDecisionDirty}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={reviewMutation.isPending}
              onClick={closeOfficeDecisionModal}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={reviewMutation.isPending}
              onClick={saveOfficeDecision}
            >
              {reviewMutation.isPending ? "Saving decision..." : nextActionTouched && referralNeeded ? "Continue to referral" : "Save decision"}
            </Button>
          </>
        }
      >
        <div className="review-subform">
          <SelectFilter
            label="Staff-Classified Condition"
            value={selectedAuthorityClassification ?? ""}
            onChange={(event) => {
              setAuthorityClassificationOverride(
                (event.target.value || null) as AuthorityClassifiedCondition | null,
              );
              setOfficeDecisionSubmitted(false);
              reviewMutation.reset();
            }}
          >
            <option value="">Not classified</option>
            {activeAuthorityClassifiedConditions.map((value) => (
              <option value={value} key={value}>
                {authorityClassifiedConditionLabels[value]}
              </option>
            ))}
            {existingLegacyAuthorityClassification ? (
              <option value={existingLegacyAuthorityClassification}>
                {authorityClassifiedConditionLabels[existingLegacyAuthorityClassification]}
                {" (legacy record; not offered for new review)"}
              </option>
            ) : null}
          </SelectFilter>
          <p className="authority-classification-help">
            Staff-Classified Condition is a separate human finding and never changes the original Possible Condition.
          </p>
          {report.authorityClassifiedCondition && report.reviewedBy ? (
            <p className="authority-provenance">
              Last classified by {report.reviewedBy}
              {report.reviewedAt ? ` on ${formatDateTime(report.reviewedAt)}` : ""}.
            </p>
          ) : null}

          <SelectFilter
            label="Verification outcome"
            value={selectedVerificationOutcome}
            onChange={(event) => {
              setVerificationOverride(event.target.value as VerificationOutcome | "");
              setOfficeDecisionSubmitted(false);
              reviewMutation.reset();
            }}
          >
            <option value="">No verification decision</option>
            <option value="not_determined">Not determined</option>
            <option value="verified">Verified</option>
            <option value="unable_to_verify">Unable to verify</option>
          </SelectFilter>
          <p className="authority-classification-help">
            Verification is a separate human judgment. It never closes a case on its own.
          </p>

          {selectedNextAction === "advisory_provided" ? (
            <div className="review-subform" aria-label="Office advisory selection">
              <p className="authority-classification-help">
                Choose validated office guidance when the field contact should receive concrete follow-up steps. Draft and retired guidance cannot be delivered.
              </p>
              <SelectFilter
                id="office-advisory"
                label="Office advisory (optional)"
                value={selectedAdvisoryUuid ?? ""}
                onChange={(event) => {
                  setAdvisoryUuidOverride(event.target.value || null);
                  setOfficeDecisionSubmitted(false);
                  reviewMutation.reset();
                }}
              >
                <option value="">No advisory selected</option>
                {advisories
                  .filter((advisory) => advisory.status === "validated")
                  .map((advisory) => (
                    <option value={advisory.uuid} key={advisory.uuid}>
                      {advisory.code} - {advisory.title}
                    </option>
                  ))}
                {selectedAdvisory &&
                !advisories.some((advisory) => advisory.uuid === selectedAdvisory.uuid) ? (
                  <option value={selectedAdvisory.uuid}>
                    {selectedAdvisory.code} - {selectedAdvisory.title} (current)
                  </option>
                ) : null}
              </SelectFilter>
              {selectedAdvisory ? (
                <div className="review-state-summary" role="note">
                  <strong>{selectedAdvisory.title}</strong>
                  <span>{selectedAdvisory.content}</span>
                </div>
              ) : null}
              {advisoriesQuery.isError ? (
                <p className="form-error" role="alert">
                  The advisory library could not be loaded. You can save the review without selecting guidance.
                </p>
              ) : null}
            </div>
          ) : null}

          <div className="review-action-guidance" role="note">
            <strong>Record intervention or action details</strong>
            <p>
              Use Review notes to record the treatment, pesticide, medicine, technical assistance, or other action used when applicable. If no intervention was used, say so in the notes.
            </p>
          </div>
          {officeDecisionSubmitted && !hasReviewInput ? (
            <p id="office-decision-error" className="form-error" role="alert">
              Choose a next action or another review field before saving.
            </p>
          ) : null}
          {officeDecisionSubmitted && noteError ? (
            <p id="review-notes-error" className="form-error" role="alert">
              {noteError}
            </p>
          ) : null}
          <TextArea
            id="review-notes"
            label="Review notes"
            hint="Record treatment, pesticide, medicine, technical assistance, or other action details when applicable. Notes are saved with the review."
            rows={5}
            maxLength={1000}
            value={notes}
            aria-describedby={
              officeDecisionSubmitted && noteError
                ? "review-notes-error"
                : undefined
            }
            onChange={(event) => {
              setNotesOverride(event.target.value);
              setOfficeDecisionSubmitted(false);
              reviewMutation.reset();
            }}
            placeholder="Describe the intervention or other action used, if applicable..."
          />
          <p className="review-note-count">{notes.length}/1,000</p>

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
        </div>
      </Modal>

      {/* Modal 2: Visit Assignment (F2) */}
      <Modal
        id="assignment-modal"
        title="Assign visit"
        description="Assign a Field Inspector to validate the sugarcane condition in the field."
        open={assignmentModalOpen}
        onClose={closeAssignmentModal}
        disabled={reviewMutation.isPending}
        isDirty={assignmentDirty}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={reviewMutation.isPending}
              onClick={closeAssignmentModal}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={reviewMutation.isPending}
              onClick={saveAssignment}
            >
              {reviewMutation.isPending ? "Assigning visit..." : "Assign visit"}
            </Button>
          </>
        }
      >
        <div className="review-subform" aria-label="Field validation assignment">
          <p className="authority-classification-help">
            An assignment activates immediately. Choose a Field Inspector; a target visit date is optional.
          </p>
          {fieldValidationAssignSubmitted && fieldValidationError ? (
            <p id="field-validation-assignee-error" className="form-error" role="alert">
              {fieldValidationError}
            </p>
          ) : null}
          <SelectFilter
            id="field-validation-assignee"
            label="Field Inspector assignee"
            aria-describedby={
              fieldValidationAssignSubmitted && fieldValidationError
                ? "field-validation-assignee-error"
                : undefined
            }
            value={selectedFieldValidationAssignee}
            onChange={(event) => {
              setFieldValidationAssigneeOverride(event.target.value || null);
              setFieldValidationAssignSubmitted(false);
              reviewMutation.reset();
            }}
          >
            <option value="">Select a Field Inspector</option>
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
                setFieldValidationAssignSubmitted(false);
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
            <p className="form-error" role="alert">
              Eligible Field Inspectors could not be loaded. Try again before assigning.
            </p>
          ) : null}
        </div>
      </Modal>

      {/* Modal 3: Expert Referral (F3) */}
      <Modal
        id="referral-modal"
        title="Request expert input"
        description="Address an expert from the directory or invite someone outside it. Both requests keep the case open while input is pending."
        open={referralModalOpen}
        onClose={closeReferralModal}
        disabled={recordReferral.isPending || issueReferralInvite.isPending}
        isDirty={!savedReferral && referralHandoffDirty}
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={recordReferral.isPending || issueReferralInvite.isPending}
              onClick={closeReferralModal}
            >
              {savedReferral ? "Done" : "Cancel"}
            </Button>
            {!savedReferral ? (
              <Button type="button" disabled={recordReferral.isPending} onClick={saveReferralHandoff}>
                {recordReferral.isPending ? "Requesting expert input..." : "Request expert input"}
              </Button>
            ) : null}
          </>
        }
      >
        {savedReferral ? (
          <div className="review-subform" aria-label="Expert request delivery" role="status">
            <p>Awaiting expert input. The request was saved. Copy the secure link and share it with the invitee using the contact provided; the link cannot be retrieved after you leave this page.</p>
            {referralInvite?.url ? (
              <label className="select-filter" htmlFor="referral-invite-link">
                <span>Secure invite link (copy to share)</span>
                <input id="referral-invite-link" readOnly value={referralInvite.url} onFocus={(event) => event.target.select()} />
              </label>
            ) : null}
            {referralInviteFailed ? (
              <p className="form-error" role="alert">The request was saved, but the secure link could not be created. Retry here or create a new link from the case.</p>
            ) : null}
            {referralInviteFailed ? (
              <Button type="button" disabled={issueReferralInvite.isPending} onClick={() => void createReferralInvite()}>
                {issueReferralInvite.isPending ? "Creating secure link..." : "Retry secure link"}
              </Button>
            ) : null}
          </div>
        ) : <div className="review-subform" aria-label="Expert referral details">
          <p className="authority-classification-help">
            Choose who should receive the request. A directory expert is assigned to their account; for someone else, a secure link is created after saving for you to share. Print/download remains available from the case.
          </p>
          {referralFieldError ? (
            <p id="referral-destination-error" className="form-error" role="alert">
              {referralFieldError}
            </p>
          ) : null}
          <label className="select-filter" htmlFor="referral-destination">
            <span>Expert destination</span>
            <input
              id="referral-destination"
              value={referralDestination}
              maxLength={160}
              aria-describedby={referralFieldError ? "referral-destination-error" : undefined}
              onChange={(event) => {
                setReferralDestination(event.target.value);
                setReferralSubmitted(false);
                recordReferral.reset();
              }}
              placeholder="Office, laboratory, or expert group"
            />
          </label>
          <label className="select-filter" htmlFor="referral-reference">
            <span>Expert office reference (optional)</span>
            <input
              id="referral-reference"
              value={referralReference}
              maxLength={160}
              onChange={(event) => {
                setReferralReference(event.target.value);
                setReferralSubmitted(false);
                recordReferral.reset();
              }}
              placeholder="Reference supplied by the receiving office"
            />
          </label>
          <small>Office memo or letter number; add it when the expert responds if it is not available yet.</small>
          <label className="select-filter" htmlFor="referral-date">
            <span>Referral date</span>
            <input
              id="referral-date"
              type="date"
              value={referralDate}
              onChange={(event) => {
                const nextReferralDate = event.target.value;
                const previousDefaultDueDate = referralDate
                  ? referralDueDateFor(referralDate)
                  : "";
                setReferralDate(nextReferralDate);
                if (!referralDueDate || referralDueDate === previousDefaultDueDate) {
                  setReferralDueDate(nextReferralDate ? referralDueDateFor(nextReferralDate) : "");
                }
                setReferralSubmitted(false);
                recordReferral.reset();
              }}
            />
          </label>
          <label className="select-filter" htmlFor="referral-due-date">
            <span>Consult due date (optional)</span>
            <input
              id="referral-due-date"
              type="date"
              value={referralDueDate}
              onChange={(event) => {
                setReferralDueDate(event.target.value);
                setReferralDueDateTouched(true);
                setReferralSubmitted(false);
                recordReferral.reset();
              }}
            />
          </label>
          <SelectFilter
            id="referral-expert"
            label="Expert from directory"
            value={referralExpertUuid ?? ""}
            onChange={(event) => {
              setReferralExpertUuid(event.target.value || null);
              setReferralSubmitted(false);
              recordReferral.reset();
            }}
          >
            <option value="">Invite someone outside the directory</option>
            {(expertDirectoryQuery.data ?? []).map((expert) => (
              <option value={expert.uuid} key={expert.uuid}>
                {expert.name} ({expert.email})
              </option>
            ))}
          </SelectFilter>
          {expertDirectoryQuery.isError ? (
            <p className="form-error" role="alert">
              The expert directory could not be loaded. You can still address an invitee below.
            </p>
          ) : null}
          {!referralExpertUuid ? <label className="select-filter" htmlFor="referral-expert-name">
            <span>Invitee name</span>
            <input
              id="referral-expert-name"
              maxLength={160}
              value={referralExpertName}
              onChange={(event) => {
                setReferralExpertName(event.target.value);
                setReferralSubmitted(false);
                recordReferral.reset();
              }}
              placeholder="Named expert or service"
            />
          </label> : null}
          {!referralExpertUuid ? <label className="select-filter" htmlFor="referral-expert-contact">
            <span>Invitee contact</span>
            <input
              id="referral-expert-contact"
              maxLength={320}
              value={referralExpertContact}
              onChange={(event) => {
                setReferralExpertContact(event.target.value);
                setReferralSubmitted(false);
                recordReferral.reset();
              }}
              placeholder="Email, phone, or office contact"
            />
          </label> : null}
          <label className="case-confirmation" htmlFor="referral-share-full-context">
            <input
              id="referral-share-full-context"
              type="checkbox"
              checked={referralShareFullContext}
              onChange={(event) => {
                setReferralShareFullContext(event.target.checked);
                setReferralSubmitted(false);
                recordReferral.reset();
              }}
            />
            <span>
              <strong>Share full case context</strong>
              <small>Include the farmer/farm owner name and exact coordinates in the expert packet.</small>
            </span>
          </label>
          <TextArea
            id="referral-note"
            label="Referral note (optional)"
            hint="Keep the request neutral and grounded in the submitted evidence."
            rows={3}
            maxLength={1000}
            value={referralNote}
            onChange={(event) => {
              setReferralNote(event.target.value);
              setReferralSubmitted(false);
              recordReferral.reset();
            }}
            placeholder="What should the expert review?"
          />
          {referralRecordError ? <p className="form-error" role="alert">{referralRecordError}</p> : null}
        </div>}
      </Modal>

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
        </div>
      </Modal>
    </PageContent>
  );
}


