import type { DiseaseReport, PaginationMeta } from "../../../domain/report.types";
import type {
  ReportDetailDto,
  ReportListItemDto,
  ReportListResponseDto,
} from "../schemas/report.schema";

const humanize = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

export function mapReportListItem(dto: ReportListItemDto): DiseaseReport {
  return {
    uuid: dto.uuid,
    referenceCode: dto.reference_code,
    barangay: dto.barangay,
    submittedByName: dto.reporter.name,
    submitterRole: "field_reporter",
    capturedAt: dto.submitted_at,
    submittedAt: dto.submitted_at,
    predictedDisease: dto.predicted_label,
    confidence: dto.confidence,
    imageUrl: dto.image_url,
    imageStatus: dto.image_url ? "available" : "unavailable",
    symptoms: [],
    reviewStatus: dto.review_status,
  };
}

export function mapReportDetail(dto: ReportDetailDto): DiseaseReport {
  return {
    uuid: dto.identity.uuid,
    referenceCode: dto.identity.reference_code,
    barangay: dto.barangay,
    submittedByName: dto.reporter.name,
    submitterRole: "field_reporter",
    capturedAt: dto.timestamps.captured_at,
    submittedAt: dto.timestamps.submitted_at,
    predictedDisease: dto.model.predicted_label,
    confidence: dto.model.confidence,
    imageUrl: dto.image.url,
    imageStatus: dto.image.url ? "available" : "unavailable",
    symptoms: dto.observations.symptom_keys.map((key) => ({
      id: key,
      label: humanize(key),
      answer: "yes",
    })),
    reviewStatus: dto.review.status,
    reviewNotes: dto.review.notes ?? undefined,
    reviewedBy: dto.review.reviewer?.name,
    reviewedAt: dto.review.reviewed_at ?? undefined,
  };
}

export function mapPaginationMeta(
  dto: ReportListResponseDto["meta"],
): PaginationMeta {
  return {
    currentPage: dto.current_page,
    from: dto.from,
    lastPage: dto.last_page,
    perPage: dto.per_page,
    to: dto.to,
    total: dto.total,
  };
}
