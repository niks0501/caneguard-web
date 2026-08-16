import { z } from "zod";
import type {
  DiseaseKey,
  ReviewStatus,
} from "../domain/report.types";
import type { FieldValidationFilters } from "../domain/fieldValidation.types";

const statusSchema = z.enum([
  "submitted_unverified",
  "for_field_validation",
  "verified_by_staff",
  "unable_to_verify",
  "resolved",
]);
const diseaseSchema = z.enum(["healthy", "mosaic", "rust"]);
const dateSchema = z.iso.date();

export interface MapUrlState {
  filters: FieldValidationFilters;
  hasActiveFilters: boolean;
  invalid: boolean;
}

function optionalValue(searchParams: URLSearchParams, key: string) {
  const value = searchParams.get(key);
  return value?.trim() ? value : undefined;
}

export function parseMapUrl(searchParams: URLSearchParams): MapUrlState {
  const rawStatus = optionalValue(searchParams, "status");
  const rawDisease = optionalValue(searchParams, "predicted_label");
  const rawBarangay = optionalValue(searchParams, "barangay");
  const rawDateFrom = optionalValue(searchParams, "date_from");
  const rawDateTo = optionalValue(searchParams, "date_to");
  const status = rawStatus ? statusSchema.safeParse(rawStatus) : null;
  const disease = rawDisease ? diseaseSchema.safeParse(rawDisease) : null;
  const dateFrom = rawDateFrom ? dateSchema.safeParse(rawDateFrom) : null;
  const dateTo = rawDateTo ? dateSchema.safeParse(rawDateTo) : null;

  return {
    filters: {
      status: status?.success ? (status.data as ReviewStatus) : undefined,
      disease: disease?.success ? (disease.data as DiseaseKey) : undefined,
      barangay: rawBarangay,
      dateFrom: dateFrom?.success ? dateFrom.data : undefined,
      dateTo: dateTo?.success ? dateTo.data : undefined,
    },
    hasActiveFilters: Boolean(
      rawStatus || rawDisease || rawBarangay || rawDateFrom || rawDateTo,
    ),
    invalid:
      (rawBarangay?.length ?? 0) > 120 ||
      Boolean(status && !status.success) ||
      Boolean(disease && !disease.success) ||
      Boolean(dateFrom && !dateFrom.success) ||
      Boolean(dateTo && !dateTo.success) ||
      Boolean(rawDateFrom && rawDateTo && rawDateTo < rawDateFrom),
  };
}

export function writeMapUrl(
  filters: FieldValidationFilters,
): URLSearchParams {
  const searchParams = new URLSearchParams();
  if (filters.status) searchParams.set("status", filters.status);
  if (filters.disease) searchParams.set("predicted_label", filters.disease);
  if (filters.barangay?.trim()) {
    searchParams.set("barangay", filters.barangay.trim());
  }
  if (filters.dateFrom) searchParams.set("date_from", filters.dateFrom);
  if (filters.dateTo) searchParams.set("date_to", filters.dateTo);
  return searchParams;
}
