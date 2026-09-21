import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Cloud,
  GitBranch,
  History,
  Info,
  Link2,
  MapPin,
  MoreHorizontal,
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
import { MachineFactsChips } from "../components/reports/MachineFactsChips";
import { ReferralWorkflow } from "../components/reports/ReferralWorkflow";
import { DiseaseBadge, ReviewStatusBadge } from "../components/reports/ReportBadges";
import { SymptomResponseItem } from "../components/reports/SymptomResponseItem";
import { Button } from "../components/ui/Button";
import { SelectFilter, TextArea } from "../components/ui/FormControls";
import { ErrorState, ImagePendingState, LoadingState } from "../components/ui/States";
import {
  actionTakenLabels,
  activeAuthorityClassifiedConditions,
  authorityClassifiedConditionLabels,
  caseStateLabels,
  fieldValidationStateLabels,
  followUpOutcomeLabels,
  imageStatusLabels,
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
  OperationalMetadataCorrections,
  ReportReviewInput,
} from "../domain/review.types";
import { legacyLifecycleForReviewStatus } from "../data/api/mappers/lifecycle.mapper";
import { useFieldReporters } from "../hooks/useFieldReporters";
import {
  useAdvisories,
  useLinkDuplicateReport,
  usePossibleRecentMatches,
  useUnlinkDuplicateReport,
  useRecordReportReferral,
  useReport,
  useUpdateReportReview,
} from "../hooks/useReports";
import { formatDateTime } from "../lib/formatters";

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
  { value: "technical_assistance_provided", description: "Record practical technical assistance delivered." },
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
          { label: "Reference", value: consult.reference },
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
      id: `referral-${ref.reference}`,
      type: "referral",
      typeLabel: "Referral",
      timestamp: ref.referralDate,
      actor: ref.referredBy?.name ?? "Authorized reviewer",
      fields: [
        { label: "Destination", value: ref.destination },
        { label: "Reference", value: ref.reference },
        ...(ref.dueDate ? [{ label: "Due date", value: ref.dueDate }] : []),
        ...(ref.expertName ? [{ label: "Expert", value: ref.expertName }] : []),
      ],
      notes: ref.note,
    });
    if (ref.responseDate) {
      entries.push({
        id: `referral-resp-${ref.reference}`,
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

const checklistConsistencyLabels: Record<string, string> = {
  consistent: "Consistent with the Possible Condition",
  inconsistent: "Differs from the Possible Condition",
  inconclusive: "Inconclusive against the Possible Condition",
};

function checklistConsistencyLabel(value?: string) {
  return value
    ? checklistConsistencyLabels[value] ?? value.replaceAll("_", " ")
    : "Not provided";
}

function symptomAgreementFor(report: DiseaseReport) {
  return report.checklistConsistency
    ? checklistConsistencyLabel(report.checklistConsistency)
    : "Not provided";
}

function isRssiReporterConcern(report: DiseaseReport): boolean {
  return report.reporterSuspectedCondition?.trim().toUpperCase() === REPORTER_OBSERVED_CONCERN_RSSI;
}

function reporterComparisonFor(report: DiseaseReport) {
  if (isRssiReporterConcern(report)) {
    return "RSSI field concern reported (not AI-detected)";
  }
  if (report.mismatchReported === true) {
    return "Possible Condition reported as not matching";
  }
  if (report.mismatchReported === false) {
    return "Possible Condition reported as matching";
  }
  return "Not collected";
}

function symptomAgreementToneFor(report: DiseaseReport) {
  if (report.mismatchReported === true || report.checklistConsistency === "inconsistent") {
    return "inconsistent";
  }
  if (report.checklistConsistency === "inconclusive") return "inconclusive";
  if (report.mismatchReported === false || report.checklistConsistency === "consistent") {
    return "consistent";
  }
  return "unknown";
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
  const [referralExpertName, setReferralExpertName] = useState("");
  const [referralExpertContact, setReferralExpertContact] = useState("");
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
  const [duplicateLinkReason, setDuplicateLinkReason] = useState("");
  const [duplicateLinkSubmitted, setDuplicateLinkSubmitted] = useState(false);
  const [duplicateLinkNotice, setDuplicateLinkNotice] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const [imageRetry, setImageRetry] = useState(0);
  const [historyFilter, setHistoryFilter] = useState<"all" | CaseHistoryEntryType>("all");
  const reportQuery = useReport(reportId);
  const possibleMatchesQuery = usePossibleRecentMatches(reportId);
  const fieldReportersQuery = useFieldReporters();
  const advisoriesQuery = useAdvisories();
  const reviewMutation = useUpdateReportReview(reportId);
  const duplicateLinkMutation = useLinkDuplicateReport(reportId);
  const duplicateUnlinkMutation = useUnlinkDuplicateReport(reportId);
  const recordReferral = useRecordReportReferral(reportId);
  const report = reportQuery.data;
  const possibleMatches = possibleMatchesQuery.data?.matches ?? [];
  const advisories = advisoriesQuery.data ?? [];
  const lifecycle = report
    ? report.lifecycle ?? legacyLifecycleForReviewStatus(report.reviewStatus)
    : undefined;
  const referralPending = lifecycle?.referralState === "referred";
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
    : !referralReference.trim()
      ? "Add the referral reference."
      : !referralDate
        ? "Add the referral date."
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

  const imageSummary = report?.imageStatus === "available" ? "1 photo" : "No photo";
  const symptomsSummary = `${report?.symptoms?.length ?? 0} symptom answers`;
  const mismatchSummary = report?.mismatchReported === true ? "mismatch flagged" : "no mismatch flag";
  const fieldEvidenceSummary = `${imageSummary} · ${symptomsSummary} · ${mismatchSummary}`;

  const latestHistoryDate = mergedHistory[0]?.timestamp;
  const caseHistoryAvailable = report?.caseHistory?.available ?? true;
  const caseHistorySummary = !caseHistoryAvailable
    ? "History unavailable on this legacy record"
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
      ? "Add a reason for the operational metadata correction."
      : null;
  const hasReviewInput =
    selectedNextAction !== null ||
    verificationOverride !== undefined ||
    reopenCaseConfirmed ||
    authorityClassificationOverride !== undefined ||
    notesOverride !== null ||
    metadataCorrections !== undefined ||
    advisoryUuidOverride !== undefined;

  const errorSummaryRef = useRef<HTMLDivElement>(null);

  const validationErrors: Array<{ id: string; message: string }> = [];
  if (submitted && !referralNeeded && !hasReviewInput) {
    validationErrors.push({
      id: "review-next-action",
      message: "Choose a next action or another review field before saving.",
    });
  }
  if (submitted && !referralNeeded && fieldValidationError) {
    validationErrors.push({
      id: "field-validation-assignee",
      message: fieldValidationError,
    });
  }
  if (submitted && !referralNeeded && noteError) {
    validationErrors.push({
      id: "review-notes",
      message: noteError,
    });
  }
  if (submitted && !referralNeeded && correctionError) {
    validationErrors.push({
      id: "correction-reason",
      message: correctionError,
    });
  }
  if (submitted && referralNeeded && referralInputError) {
    validationErrors.push({
      id: "referral-destination",
      message: referralInputError,
    });
  }

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
    if (submitted && validationErrors.length > 0) {
      errorSummaryRef.current?.focus();
      if (report?.referenceCode) {
        document.title = `Error: CaneGuard | Case Review ${report.referenceCode}`;
      }
    } else if (report?.referenceCode) {
      document.title = `CaneGuard | Case Review ${report.referenceCode}`;
    }
  }, [submitted, validationErrors.length, report?.referenceCode]);

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
      setDuplicateLinkReason("");
      setDuplicateLinkSubmitted(false);
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

  const saveReview = async () => {
    setSubmitted(true);
    setReferralSubmitted(true);
    if (report?.reviewVersion === undefined) return;

    if (referralNeeded) {
      // The referral endpoint records the handoff, the visible Staff-Classified
      // Condition, verification, and notes atomically and keeps the case open.
      if (referralInputError) return;

      try {
        await recordReferral.mutateAsync({
          destination: referralDestination,
          reference: referralReference,
          referralDate,
          ...(referralDueDate ? { dueDate: referralDueDate } : {}),
          ...(referralExpertName.trim() ? { expertName: referralExpertName } : {}),
          ...(referralExpertContact.trim() ? { expertContact: referralExpertContact } : {}),
          note: referralNote,
          authorityClassifiedCondition: selectedAuthorityClassification,
          verificationOutcome: selectedVerificationOutcome || undefined,
          officeNotes: notes,
          expectedVersion: report.reviewVersion,
        });
        navigate(routes.reports, {
          state: {
            notice: `${report.referenceCode} - Expert referral recorded. The case remains open while input is pending.`,
          },
        });
      } catch {
        return;
      }
      return;
    }

    if (!hasReviewInput || noteError || correctionError || fieldValidationError) return;

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
      fieldValidationState:
        nextActionTouched && !fieldValidationActive
          ? selectedNextAction === "needs_field_validation"
            ? "assigned"
            : "unassigned"
          : undefined,
      fieldValidationAssigneeUuid: fieldValidationNeeded
        ? selectedFieldValidationAssignee || null
        : undefined,
      fieldValidationTargetDate: fieldValidationNeeded
        ? selectedFieldValidationTargetDate || null
        : undefined,
      caseState: closeCaseForNextAction
        ? "closed"
        : reopenCaseConfirmed && caseAlreadyClosed
          ? "open"
          : undefined,
      metadataCorrections,
      correctionReason: metadataCorrections ? correctionReason : undefined,
      expectedVersion: report.reviewVersion,
    };

    try {
      await reviewMutation.mutateAsync(input);
      const notice = selectedNextAction
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

  if (reportQuery.isPending) return <PageContent><LoadingState message="Loading report evidence..." /></PageContent>;
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

      {submitted && validationErrors.length > 0 ? (
        <div
          className="govuk-error-summary"
          role="alert"
          tabIndex={-1}
          ref={errorSummaryRef}
          aria-labelledby="error-summary-title"
        >
          <h2 className="govuk-error-summary__title" id="error-summary-title">
            There is a problem
          </h2>
          <ul className="govuk-error-summary__list">
            {validationErrors.map((err) => (
              <li key={err.id}>
                <a href={`#${err.id}`}>{err.message}</a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* 1. Answer hero above .review-layout */}
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
          {report.attentionBand ? (
            <p className={`attention-band-note attention-band-note--${report.attentionBand}`}>
              <strong>Attention band: {report.attentionBand}</strong>
              <span>{report.attentionBandReasons?.join(" ")}</span>
              <small>Decision support only. The reviewer keeps the final call.</small>
            </p>
          ) : null}
        </div>

        {referralPending ? (
          <div className="scan-hero__referral-pending">
            <div className="scan-hero__actions-row">
              <a href="#referral-response-form" className="button button--secondary">
                Record expert response
              </a>
              <Button
                type="button"
                icon={<Save aria-hidden="true" />}
                disabled={reviewMutation.isPending}
                onClick={saveReview}
              >
                {reviewMutation.isPending ? "Saving review..." : "Save review"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <fieldset
              className="review-actions review-actions--hero"
              id="review-next-action"
              aria-describedby={
                submitted && !referralNeeded && !hasReviewInput
                  ? "review-next-action-error"
                  : undefined
              }
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
                          setSubmitted(false);
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

            {selectedNextAction === "advisory_provided" ? (
              <div className="review-subform" aria-label="Office advisory selection">
                <p className="authority-classification-help">Choose validated office guidance when the field contact should receive concrete follow-up steps. Draft and retired guidance cannot be delivered.</p>
                <SelectFilter
                  id="office-advisory"
                  label="Office advisory (optional)"
                  value={selectedAdvisoryUuid ?? ""}
                  onChange={(event) => {
                    setAdvisoryUuidOverride(event.target.value || null);
                    setSubmitted(false);
                    reviewMutation.reset();
                  }}
                >
                  <option value="">No advisory selected</option>
                  {advisories.filter((advisory) => advisory.status === "validated").map((advisory) => (
                    <option value={advisory.uuid} key={advisory.uuid}>
                      {advisory.code} - {advisory.title}
                    </option>
                  ))}
                  {selectedAdvisory && !advisories.some((advisory) => advisory.uuid === selectedAdvisory.uuid) ? (
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
                  <p className="form-error" role="alert">The advisory library could not be loaded. You can save the review without selecting guidance.</p>
                ) : null}
              </div>
            ) : null}

            {fieldValidationNeeded ? (
              <div className="review-subform" aria-label="Field validation assignment">
                <p className="authority-classification-help">An assignment activates immediately. Choose a Field Inspector; a target visit date is optional.</p>
                {submitted && fieldValidationError ? (
                  <p id="field-validation-assignee-error" className="form-error" role="alert">
                    {fieldValidationError}
                  </p>
                ) : null}
                <SelectFilter
                  id="field-validation-assignee"
                  label="Field Inspector assignee"
                  aria-describedby={
                    submitted && fieldValidationError
                      ? "field-validation-assignee-error"
                      : undefined
                  }
                  value={selectedFieldValidationAssignee}
                  onChange={(event) => {
                    setFieldValidationAssigneeOverride(event.target.value || null);
                    setSubmitted(false);
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
                  <p className="form-error" role="alert">Eligible Field Inspectors could not be loaded. Try again before assigning.</p>
                ) : null}
              </div>
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

            {referralNeeded ? (
              <div className="review-subform" aria-label="Expert referral details">
                <p className="authority-classification-help">Capture the external handoff as plain operational text. CaneGuard does not send the referral or connect to an external SRA account.</p>
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
                  <span>Referral reference</span>
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
                <label className="select-filter" htmlFor="referral-date">
                  <span>Referral date</span>
                  <input
                    id="referral-date"
                    type="date"
                    value={referralDate}
                    onChange={(event) => {
                      setReferralDate(event.target.value);
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
                      setReferralSubmitted(false);
                      recordReferral.reset();
                    }}
                  />
                </label>
                <label className="select-filter" htmlFor="referral-expert-name">
                  <span>Expert name (optional)</span>
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
                </label>
                <label className="select-filter" htmlFor="referral-expert-contact">
                  <span>Expert contact (optional)</span>
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
              </div>
            ) : null}

            {selectedNextAction === "no_further_action_required" && !caseAlreadyClosed ? (
              <label className="case-confirmation">
                <input
                  type="checkbox"
                  checked={closeCaseConfirmed}
                  onChange={(event) => {
                    setCloseCaseConfirmed(event.target.checked);
                    setSubmitted(false);
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
                    setSubmitted(false);
                    reviewMutation.reset();
                  }}
                />
                <span>
                  <strong>Reopen this case</strong>
                  <small>This case is closed. Check to reopen office handling when you save.</small>
                </span>
              </label>
            ) : null}

            <div className="scan-hero__commit-row">
              {serverNoteError ? <p className="form-error" role="alert">{serverNoteError}</p> : null}
              {referralRecordError ? <p className="form-error" role="alert">{referralRecordError}</p> : null}
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
              <Button
                type="button"
                icon={<Save aria-hidden="true" />}
                disabled={reviewMutation.isPending || recordReferral.isPending}
                onClick={saveReview}
              >
                {reviewMutation.isPending || recordReferral.isPending ? "Saving review..." : referralNeeded ? "Save referral" : "Save review"}
              </Button>
            </div>
          </>
        )}
      </section>

      {/* 2. Chip row replacing the status grid */}
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
        <div className="machine-facts-tier" aria-label="Machine facts — decision support">
          <span className="machine-facts-tier__label">Machine facts · decision support</span>
          <MachineFactsChips
            facts={report.machineFacts ?? {
              confidence: report.confidence ?? null,
              checklistConsistency: report.checklistConsistency ?? null,
              qualityWarnings: report.qualityWarnings ?? [],
              gpsAccuracy: report.gpsAccuracy ?? null,
              locationSource: report.locationSource ?? null,
              reporterConcern: report.reporterSuspectedCondition ?? null,
              reporterMismatch: report.mismatchReported ?? null,
            }}
          />
        </div>
      </section>

      {/* Evidence & Sidebar layout */}
      <div className="review-layout">
        <div className="review-main">
          <section className="evidence-section" aria-labelledby="evidence-section-heading">
            <h2 className="evidence-section__heading" id="evidence-section-heading">
              Evidence behind this decision
            </h2>

            {/* Disclosure 1: Field evidence — what was submitted (Open by default) */}
            <details className="review-card evidence-disclosure" open>
              <summary>
                <div className="disclosure-left">
                  <span className="summary-tag">Field evidence</span>
                  <strong>Field evidence — what was submitted</strong>
                  <span className="disclosure-metric">{fieldEvidenceSummary}</span>
                </div>
              </summary>
              <div className="disclosure-content">
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
                      <span>Reporter-observed evidence only. The current Model V1 does not detect RSSI, and this does not change the Possible Condition.</span>
                    </div>
                  ) : null}
                  <dl className="detail-list reporter-observation-details">
                    <DetailField label="Observed or suspected concern">{report.reporterSuspectedCondition?.trim() || "None reported"}</DetailField>
                    <DetailField label="Observation text">{report.reporterObservationText ?? "Not provided"}</DetailField>
                  </dl>
                </section>

                <section aria-labelledby="symptoms-heading">
                  <div className="section-heading"><div><h3 id="symptoms-heading">Submitted symptom responses</h3></div><ClipboardList aria-hidden="true" /></div>
                  <div className={`symptom-agreement symptom-agreement--${symptomAgreementToneFor(report)}`} role="status">
                    <span>Symptom agreement</span>
                    <strong>Checklist responses: {symptomAgreementFor(report)}</strong>
                    <span className="symptom-agreement__reporter">Reporter observation: {reporterComparisonFor(report)}</span>
                    <p>Checklist consistency and the reporter's Possible Condition agreement are separate signals for review.</p>
                  </div>
                  <ul className="symptom-list">
                    {report.symptoms.map((response) => <SymptomResponseItem response={response} key={response.id} />)}
                  </ul>
                </section>

                <section aria-labelledby="notes-heading">
                  <div className="section-heading"><div><h3 id="notes-heading">Submitted observations</h3></div></div>
                  <dl className="detail-list">
                    <DetailField label="Checklist consistency">{report.checklistConsistency?.replaceAll("_", " ") ?? "Not provided"}</DetailField>
                    <DetailField label="Reported severity">{report.reportedSeverity ?? "Not provided"}</DetailField>
                    <DetailField label="Sugarcane variety">{report.sugarcaneVariety ?? "Not provided"}</DetailField>
                    <DetailField label="Crop age">{report.cropAge ?? "Not provided"}</DetailField>
                    <DetailField label="Cane class">{report.caneClass ?? "Not provided"}</DetailField>
                    <DetailField label="Field notes">{report.fieldNotes ?? "Not provided"}</DetailField>
                  </dl>
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
                        {report.fieldValidationAssignment.completion.fieldObservation}
                      </DetailField>
                      <DetailField label="Finding">
                        {report.fieldValidationAssignment.completion.fieldFinding}
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
              </div>
            </details>

            {/* Disclosure 2: Model evidence — decision support (Closed by default - D-01) */}
            <details className="review-card technical-evidence model-evidence-disclosure">
              <summary>
                <div className="disclosure-left">
                  <span className="summary-tag">Decision support</span>
                  <strong>Model evidence — decision support</strong>
                  <span className="disclosure-metric">Held back until you have reviewed the field evidence</span>
                </div>
                <ScanLine aria-hidden="true" />
              </summary>
              <div className="disclosure-content">
                <div className="review-essential-result" role="region" aria-label="Possible Condition">
                  <div className="review-essential-result__heading">
                    <div>
                      <h3>Possible Condition</h3>
                    </div>
                    <DiseaseBadge disease={report.predictedDisease} />
                  </div>
                  <ConfidenceDisplay confidence={report.confidence ?? 0} />
                  <p><strong>Decision-support only.</strong> Compare this Possible Condition with the symptom responses, reporter observation, and field context. It is not a diagnosis.</p>
                </div>

                <details className="review-card technical-evidence">
                  <summary>
                    <span>
                      <span className="summary-tag">Additional evidence</span>
                      <strong>Technical Evidence</strong>
                    </span>
                    <ScanLine aria-hidden="true" />
                  </summary>
                  <div className="technical-evidence__content">
                    <p className="technical-evidence__description">Model, processing, and image details remain available for audit without leading the operational review.</p>
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
                      <DetailField label="Image source">{report.imageSourceType ?? "Unavailable"}</DetailField>
                      <DetailField label="File type">{report.imageMimeType ?? "Unavailable"}</DetailField>
                      <DetailField label="Image size">{report.imageSizeBytes ? `${Math.round(report.imageSizeBytes / 1024)} KB` : "Unavailable"}</DetailField>
                      <DetailField label="Dimensions">{report.sourceWidth && report.sourceHeight ? `${report.sourceWidth} × ${report.sourceHeight}` : "Not provided"}</DetailField>
                    </dl>
                    <div className="decision-reminder"><Info aria-hidden="true" /><p><strong>Decision-support only</strong><span>This result is not a diagnosis. Compare it with the submitted observations and field context.</span></p></div>
                  </div>
                </details>
              </div>
            </details>

            {/* Disclosure 3: Prior record — case history (Closed by default) */}
            <details className="review-card case-history-disclosure">
              <summary>
                <div className="disclosure-left">
                  <span className="summary-tag">Prior record</span>
                  <strong>Prior record — case history</strong>
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
                      Case history is not available for this legacy record; no events are inferred.
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
                              <DetailField label="Notes">{entry.notes}</DetailField>
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

            {/* Disclosure 4: Reference details (Closed by default) */}
            <details className="review-card reference-details-disclosure">
              <summary>
                <div className="disclosure-left">
                  <span className="summary-tag">Context</span>
                  <strong>Reference details</strong>
                  <span className="disclosure-metric">Farm and location rows (11) · report context</span>
                </div>
                <MapPin aria-hidden="true" />
              </summary>
              <div className="disclosure-content">
                <section aria-labelledby="reference-context-heading">
                  <div className="section-heading"><div><h3 id="reference-context-heading">Farm and location context</h3></div><Smartphone aria-hidden="true" /></div>
                  <dl className="review-essential-context">
                    <DetailField label="Farm reference">{report.farmReference ?? "Not provided"}</DetailField>
                    <DetailField label="Farmer or farm owner">{report.farmerOrFarmOwnerName ?? "Not provided"}</DetailField>
                    <DetailField label="Barangay">{report.barangay}</DetailField>
                    <DetailField label="Municipality">{report.municipality ?? "Not provided"}</DetailField>
                    <DetailField label="Province">{report.province ?? "Not provided"}</DetailField>
                    <DetailField label="Coordinates">
                      {report.locationSource === "unavailable"
                        ? "Unavailable"
                        : report.finalLatitude !== undefined && report.finalLongitude !== undefined
                          ? `${report.finalLatitude}, ${report.finalLongitude}`
                          : "Not provided"}
                    </DetailField>
                    <DetailField label="Location source">
                      {report.locationSource === "gps"
                        ? "GPS"
                        : report.locationSource === "manual_map"
                          ? "Manual map"
                          : report.locationSource === "unavailable"
                            ? "Unavailable"
                            : "Not provided"}
                    </DetailField>
                    {report.locationSource === "unavailable" ? (
                      <DetailField label="Location unavailable reason">
                        {report.locationUnavailableReason
                          ? `Unavailable — ${report.locationUnavailableReason.replaceAll("_", " ")}`
                          : "Unavailable — reason not recorded"}
                      </DetailField>
                    ) : null}
                    <DetailField label="GPS accuracy">{report.gpsAccuracy !== undefined ? `${report.gpsAccuracy} m` : "Not provided"}</DetailField>
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
                    <DetailField label="Reporter">{report.submittedByName}</DetailField>
                  </dl>
                  <div className="quality-summary">
                    <strong>Image quality checks</strong>
                    {report.qualityWarnings?.length ? (
                      <ul>{report.qualityWarnings.map((warning) => <li key={warning}>{warning.replaceAll("_", " ")}</li>)}</ul>
                    ) : <span>No image quality warnings were reported.</span>}
                  </div>
                </section>

                <section aria-labelledby="report-context-heading">
                  <div className="section-heading"><div><h3 id="report-context-heading">Report context</h3></div><MapPin aria-hidden="true" /></div>
                  <dl className="detail-list">
                    <DetailField label="Submitter role">{submitterRoleLabels[report.submitterRole]}</DetailField>
                    <DetailField label="Observed at">{report.observedAt ? formatDateTime(report.observedAt) : "Not provided"}</DetailField>
                    <DetailField label="Submitted at">{formatDateTime(report.submittedAt)}</DetailField>
                    {report.reviewedBy ? <DetailField label="Last reviewed by">{report.reviewedBy}</DetailField> : null}
                    {report.reviewedAt ? <DetailField label="Reviewed at">{formatDateTime(report.reviewedAt)}</DetailField> : null}
                    {report.reviewNotes ? <DetailField label="Current review note">{report.reviewNotes}</DetailField> : null}
                  </dl>
                </section>
              </div>
            </details>
          </section>
        </div>

        {/* Sidebar */}
        <aside className="review-sidebar" aria-label="Office decision">
          <section className="review-step" aria-labelledby="office-review-heading">
            <section className="review-card office-review" aria-labelledby="office-review-heading">
              <div className="section-heading"><div><h2 id="office-review-heading">Record the office decision</h2></div><CheckCircle2 aria-hidden="true" /></div>
              <SelectFilter
                label="Staff-Classified Condition"
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
              <p className="authority-classification-help">Staff-Classified Condition is a separate human finding and never changes the original Possible Condition.</p>
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
              <p className="authority-classification-help">Verification is a separate human judgment. It never closes a case on its own.</p>

              <div className="review-action-guidance" role="note">
                <strong>Record intervention or action details</strong>
                <p>Use Review notes to record the treatment, pesticide, medicine, technical assistance, or other action used when applicable. If no intervention was used, say so in the notes.</p>
              </div>
              {submitted && !referralNeeded && noteError ? (
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
                  submitted && !referralNeeded && noteError
                    ? "review-notes-error"
                    : undefined
                }
                onChange={(event) => {
                  setNotesOverride(event.target.value);
                  setSubmitted(false);
                  reviewMutation.reset();
                }}
                placeholder="Describe the intervention or other action used, if applicable..."
              />
              <p className="review-note-count">{notes.length}/1,000</p>
            </section>

            <details className="review-card technical-evidence more-actions">
              <summary>
                <span>
                  <span className="summary-tag">Rarely needed</span>
                  <strong>More actions</strong>
                </span>
                <MoreHorizontal aria-hidden="true" />
              </summary>
              <div className="technical-evidence__content">
                <section className="duplicate-link-card" aria-labelledby="duplicate-link-heading">
                  <div className="section-heading">
                    <div>
                      <h2 id="duplicate-link-heading">Possible duplicate linkage</h2>
                    </div>
                    <GitBranch aria-hidden="true" />
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
                  ) : (
                    <>
                      <p className="authority-classification-help">Possible matches are decision support only. Reviewers and admins choose whether to link this case; nothing is merged, deleted, or blocked automatically.</p>
                      {possibleMatchesQuery.isPending ? <p className="duplicate-link-status" role="status">Checking recent submissions for a possible match...</p> : null}
                      {possibleMatchesQuery.isError ? <p className="duplicate-link-status" role="alert">Possible matches could not be loaded. You can still enter a canonical case UUID below.</p> : null}
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
                      <label className="select-filter" htmlFor="canonical-report-uuid">
                        <span>Canonical case UUID</span>
                        <input
                          id="canonical-report-uuid"
                          value={canonicalReportUuid}
                          onChange={(event) => {
                            setCanonicalReportUuid(event.target.value);
                            setDuplicateLinkSubmitted(false);
                            setDuplicateLinkNotice(null);
                            duplicateLinkMutation.reset();
                          }}
                          placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                        />
                      </label>
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
                        <p className="form-error" role="alert">Choose a possible match or enter a canonical case UUID before linking.</p>
                      ) : null}
                      {duplicateLinkValidationError ? (
                        <p className="form-error" role="alert">{duplicateLinkValidationError}</p>
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
                      {duplicateLinkMutation.isError && !duplicateLinkConflict && !duplicateLinkValidationError && !duplicateLinkForbidden && !duplicateLinkMalformed ? (
                        <p className="form-error" role="alert">The duplicate linking service is unavailable. No link was recorded.</p>
                      ) : null}
                      {duplicateLinkNotice ? (
                        <p className="success-banner" role="status">{duplicateLinkNotice}</p>
                      ) : null}
                      <Button
                        type="button"
                        variant="secondary"
                        icon={<Link2 aria-hidden="true" />}
                        disabled={duplicateLinkMutation.isPending}
                        onClick={linkDuplicate}
                      >
                        {duplicateLinkMutation.isPending ? "Linking case..." : "Link as possible duplicate"}
                      </Button>
                    </>
                  )}
                </section>

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
                  {submitted && !referralNeeded && correctionError ? (
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
                      submitted && !referralNeeded && correctionError
                        ? "correction-reason-error"
                        : undefined
                    }
                    onChange={(event) => {
                      setCorrectionReason(event.target.value);
                      setSubmitted(false);
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
                            <span>{audit.field.replaceAll("_", " ")}: {String(audit.originalValue ?? "Not provided")} to {String(audit.correctedValue ?? "Not provided")}</span>
                            <small>{audit.actorName} on {formatDateTime(audit.createdAt)} - {audit.reason}</small>
                          </li>
                        ))}
                      </ol>
                    </div>
                  ) : <p className="authority-classification-help">No operational metadata corrections recorded.</p>}
                </details>
              </div>
            </details>

            {report.referral ? (
              <div id="referral-response-form">
                <ReferralWorkflow report={report} />
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </PageContent>
  );
}


