import { z } from "zod";
import type {
  DiseaseKey,
  ReportFilters,
  ReviewStatus,
} from "../domain/report.types";
import { operationalQueueValues } from "../domain/operationalQueue";

export const reportListPageSize = 15;

const statusSchema = z.enum([
  "submitted_unverified",
  "for_field_validation",
  "verified_by_staff",
  "unable_to_verify",
  "resolved",
]);
const queueSchema = z.enum(operationalQueueValues);
const diseaseSchema = z.enum(["healthy", "mosaic", "rust", "smut"]);
const sortSchema = z.enum(["newest", "oldest", "due_soonest"]);
const caseStateSchema = z.enum(["open", "closed"]);
const verificationOutcomeSchema = z.enum([
  "not_determined",
  "verified",
  "unable_to_verify",
]);
const fieldValidationStateSchema = z.enum([
  "unassigned",
  "assigned",
  "in_progress",
  "completed",
]);
const staffClassifiedConditionSchema = z.enum([
  "healthy",
  "smut",
  "mosaic",
  "rust",
  "rssi",
  "downy_mildew",
  "mixed_or_multiple",
  "unable_to_classify",
]);
const reportedConcernSchema = z.enum(["rssi"]);
const calendarMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const dateSchema = z.iso.date();

export interface ReportListUrlState {
  calendarMonth?: string;
  filters: ReportFilters;
  hasActiveFilters: boolean;
  invalid: boolean;
}

function optionalValue(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  return value?.trim() ? value : undefined;
}

export function parseReportListUrl(
  searchParams: URLSearchParams,
): ReportListUrlState {
  const rawPage = optionalValue(searchParams, "page");
  const rawQueue = optionalValue(searchParams, "queue");
  const rawSearch = optionalValue(searchParams, "search");
  const rawStatus = optionalValue(searchParams, "status");
  const rawDisease = optionalValue(searchParams, "predicted_label");
  const rawBarangay = optionalValue(searchParams, "barangay");
  const rawDateFrom = optionalValue(searchParams, "date_from");
  const rawDateTo = optionalValue(searchParams, "date_to");
  const rawSort = optionalValue(searchParams, "sort");
  const rawCaseState = optionalValue(searchParams, "case_state");
  const rawVerificationOutcome = optionalValue(
    searchParams,
    "verification_outcome",
  );
  const rawFieldValidationState = optionalValue(
    searchParams,
    "field_validation_state",
  );
  const rawStaffClassifiedCondition = optionalValue(
    searchParams,
    "authority_classified_condition",
  );
  const rawReportedConcern = optionalValue(searchParams, "concern");
  const rawCalendarMonth = optionalValue(searchParams, "calendar_month");

  const page =
    rawPage && /^\d+$/.test(rawPage) ? Number.parseInt(rawPage, 10) : 1;
  const queue = rawQueue ? queueSchema.safeParse(rawQueue) : null;
  const status = rawStatus ? statusSchema.safeParse(rawStatus) : null;
  const disease = rawDisease ? diseaseSchema.safeParse(rawDisease) : null;
  const sort = rawSort ? sortSchema.safeParse(rawSort) : null;
  const caseState = rawCaseState ? caseStateSchema.safeParse(rawCaseState) : null;
  const verificationOutcome = rawVerificationOutcome
    ? verificationOutcomeSchema.safeParse(rawVerificationOutcome)
    : null;
  const fieldValidationState = rawFieldValidationState
    ? fieldValidationStateSchema.safeParse(rawFieldValidationState)
    : null;
  const staffClassifiedCondition = rawStaffClassifiedCondition
    ? staffClassifiedConditionSchema.safeParse(rawStaffClassifiedCondition)
    : null;
  const reportedConcern = rawReportedConcern
    ? reportedConcernSchema.safeParse(rawReportedConcern)
    : null;
  const calendarMonth = rawCalendarMonth
    ? calendarMonthSchema.safeParse(rawCalendarMonth)
    : null;
  const dateFrom = rawDateFrom ? dateSchema.safeParse(rawDateFrom) : null;
  const dateTo = rawDateTo ? dateSchema.safeParse(rawDateTo) : null;
  const invalid =
    (rawPage !== undefined &&
      (!/^\d+$/.test(rawPage) ||
        !Number.isSafeInteger(page) ||
        page < 1)) ||
    (rawSearch?.length ?? 0) > 120 ||
    (rawBarangay?.length ?? 0) > 120 ||
    Boolean(queue && !queue.success) ||
    Boolean(status && !status.success) ||
    Boolean(disease && !disease.success) ||
    Boolean(sort && !sort.success) ||
    Boolean(caseState && !caseState.success) ||
    Boolean(verificationOutcome && !verificationOutcome.success) ||
    Boolean(fieldValidationState && !fieldValidationState.success) ||
    Boolean(staffClassifiedCondition && !staffClassifiedCondition.success) ||
    Boolean(reportedConcern && !reportedConcern.success) ||
    Boolean(calendarMonth && !calendarMonth.success) ||
    Boolean(dateFrom && !dateFrom.success) ||
    Boolean(dateTo && !dateTo.success) ||
    Boolean(rawDateFrom && rawDateTo && rawDateTo < rawDateFrom);

  return {
    ...(calendarMonth?.success ? { calendarMonth: calendarMonth.data } : {}),
    filters: {
      page,
      perPage: reportListPageSize,
      ...(queue?.success ? { queue: queue.data } : {}),
      search: rawSearch,
      status: status?.success
        ? (status.data as ReviewStatus)
        : undefined,
      disease: disease?.success
        ? (disease.data as DiseaseKey)
        : undefined,
      barangay: rawBarangay,
      dateFrom: dateFrom?.success ? dateFrom.data : undefined,
      dateTo: dateTo?.success ? dateTo.data : undefined,
      caseState: caseState?.success ? caseState.data : undefined,
      verificationOutcome: verificationOutcome?.success
        ? verificationOutcome.data
        : undefined,
      fieldValidationState: fieldValidationState?.success
        ? fieldValidationState.data
        : undefined,
      staffClassifiedCondition: staffClassifiedCondition?.success
        ? staffClassifiedCondition.data
        : undefined,
      reportedConcern: reportedConcern?.success
        ? reportedConcern.data
        : undefined,
      // The unscoped work queue opens on the oldest submission; a due queue
      // opens on the nearest target visit date.
      sort: sort?.success
        ? sort.data
        : queue?.success && queue.data === "follow_up_due"
            ? "due_soonest"
            : "oldest",
    },
    hasActiveFilters: Boolean(
      rawQueue ||
        rawSearch ||
        rawStatus ||
        rawDisease ||
        rawBarangay ||
        rawDateFrom ||
        rawDateTo ||
        rawCaseState ||
        rawVerificationOutcome ||
        rawFieldValidationState ||
        rawStaffClassifiedCondition ||
        rawReportedConcern,
    ),
    invalid,
  };
}
