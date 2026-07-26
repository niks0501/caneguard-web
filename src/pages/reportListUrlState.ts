import { z } from "zod";
import type {
  DiseaseKey,
  ReportFilters,
  ReviewStatus,
} from "../domain/report.types";

export const reportListPageSize = 15;

const statusSchema = z.enum([
  "submitted_unverified",
  "for_field_validation",
  "verified_by_staff",
  "unable_to_verify",
  "resolved",
]);
const diseaseSchema = z.enum(["healthy", "mosaic", "rust"]);
const sortSchema = z.enum([
  "newest",
  "oldest",
  "confidence_desc",
  "confidence_asc",
]);
const dateSchema = z.iso.date();

export interface ReportListUrlState {
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
  const rawSearch = optionalValue(searchParams, "search");
  const rawStatus = optionalValue(searchParams, "status");
  const rawDisease = optionalValue(searchParams, "predicted_label");
  const rawBarangay = optionalValue(searchParams, "barangay");
  const rawDateFrom = optionalValue(searchParams, "date_from");
  const rawDateTo = optionalValue(searchParams, "date_to");
  const rawSort = optionalValue(searchParams, "sort");

  const page =
    rawPage && /^\d+$/.test(rawPage) ? Number.parseInt(rawPage, 10) : 1;
  const status = rawStatus ? statusSchema.safeParse(rawStatus) : null;
  const disease = rawDisease ? diseaseSchema.safeParse(rawDisease) : null;
  const sort = rawSort ? sortSchema.safeParse(rawSort) : null;
  const dateFrom = rawDateFrom ? dateSchema.safeParse(rawDateFrom) : null;
  const dateTo = rawDateTo ? dateSchema.safeParse(rawDateTo) : null;
  const invalid =
    (rawPage !== undefined &&
      (!/^\d+$/.test(rawPage) ||
        !Number.isSafeInteger(page) ||
        page < 1)) ||
    (rawSearch?.length ?? 0) > 120 ||
    (rawBarangay?.length ?? 0) > 120 ||
    Boolean(status && !status.success) ||
    Boolean(disease && !disease.success) ||
    Boolean(sort && !sort.success) ||
    Boolean(dateFrom && !dateFrom.success) ||
    Boolean(dateTo && !dateTo.success) ||
    Boolean(rawDateFrom && rawDateTo && rawDateTo < rawDateFrom);

  return {
    filters: {
      page,
      perPage: reportListPageSize,
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
      sort: sort?.success ? sort.data : "newest",
    },
    hasActiveFilters: Boolean(
      rawSearch ||
        rawStatus ||
        rawDisease ||
        rawBarangay ||
        rawDateFrom ||
        rawDateTo,
    ),
    invalid,
  };
}
