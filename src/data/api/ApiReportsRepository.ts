import type { AxiosInstance } from "axios";
import { ApiError } from "../../api/ApiError";
import { axiosClient } from "../../api/axiosClient";
import type { ReportsRepository } from "../contracts/ReportsRepository";
import type {
  DiseaseReport,
  PaginatedReports,
  PossibleRecentMatches,
  ReportFilters,
} from "../../domain/report.types";
import type {
  DuplicateLinkInput,
  ReportReviewInput,
} from "../../domain/review.types";
import { mapPossibleRecentMatches } from "./mappers/duplicate.mapper";
import {
  mapPaginationMeta,
  mapReportDetail,
  mapReportListItem,
} from "./mappers/report.mapper";
import {
  possibleRecentMatchesResponseSchema,
  reportDetailResponseSchema,
  reportListResponseSchema,
  reviewResponseSchema,
} from "./schemas/report.schema";

const sortValues = {
  newest: "-submitted_at",
  oldest: "submitted_at",
  confidence_desc: "-confidence",
  confidence_asc: "confidence",
} as const;

function toQueryParams(filters: ReportFilters = {}) {
  return {
    page: filters.page,
    per_page: filters.perPage,
    search: filters.search?.trim() || undefined,
    status:
      filters.status && filters.status !== "all" ? filters.status : undefined,
    predicted_label:
      filters.disease && filters.disease !== "all"
        ? filters.disease
        : undefined,
    barangay:
      filters.barangay && filters.barangay !== "all"
        ? filters.barangay
        : undefined,
    date_from: filters.dateFrom,
    date_to: filters.dateTo,
    sort: filters.sort ? sortValues[filters.sort] : undefined,
  };
}

export class ApiReportsRepository implements ReportsRepository {
  private readonly client: AxiosInstance;

  constructor(client: AxiosInstance = axiosClient) {
    this.client = client;
  }

  async listReports(filters?: ReportFilters): Promise<PaginatedReports> {
    const response = await this.client.get("/api/v1/reports", {
      params: toQueryParams(filters),
    });
    const dto = reportListResponseSchema.parse(response.data);

    return {
      reports: dto.data.map(mapReportListItem),
      meta: mapPaginationMeta(dto.meta),
    };
  }

  async getReportById(reportId: string): Promise<DiseaseReport | null> {
    try {
      const response = await this.client.get(
        `/api/v1/reports/${encodeURIComponent(reportId)}`,
      );
      return mapReportDetail(reportDetailResponseSchema.parse(response.data).data);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  async getPossibleRecentMatches(
    reportId: string,
  ): Promise<PossibleRecentMatches> {
    const response = await this.client.get(
      `/api/v1/reports/${encodeURIComponent(reportId)}/possible-matches`,
    );
    return mapPossibleRecentMatches(
      possibleRecentMatchesResponseSchema.parse(response.data),
    );
  }

  async updateReview(
    reportId: string,
    input: ReportReviewInput,
  ): Promise<DiseaseReport> {
    const payload: Record<string, unknown> = {
      expected_version: input.expectedVersion,
    };

    if (input.status !== undefined) payload.status = input.status;
    if (input.notes !== undefined) {
      payload.notes = input.notes?.trim() || null;
    }
    if (input.authorityClassifiedCondition !== undefined) {
      payload.authority_classified_condition = input.authorityClassifiedCondition;
    }
    if (input.verificationOutcome !== undefined) {
      payload.verification_outcome = input.verificationOutcome;
    }
    if (input.actionTaken !== undefined) {
      payload.action_taken = input.actionTaken;
    }
    if (input.fieldValidationState !== undefined) {
      payload.field_validation_state = input.fieldValidationState;
    }
    if (input.fieldValidationAssigneeUuid !== undefined) {
      payload.field_validation_assignee_uuid = input.fieldValidationAssigneeUuid;
    }
    if (input.fieldValidationTargetDate !== undefined) {
      payload.field_validation_target_date = input.fieldValidationTargetDate;
    }
    if (input.caseState !== undefined) payload.case_state = input.caseState;
    if (input.metadataCorrections !== undefined) {
      payload.metadata_corrections = {
        barangay: input.metadataCorrections.barangay,
        farmer_or_farm_owner_name:
          input.metadataCorrections.farmerOrFarmOwnerName,
        province: input.metadataCorrections.province,
        municipality: input.metadataCorrections.municipality,
        affected_area_hectares:
          input.metadataCorrections.affectedAreaHectares,
        affected_portion_percent:
          input.metadataCorrections.affectedPortionPercent,
        final_latitude: input.metadataCorrections.finalLatitude,
        final_longitude: input.metadataCorrections.finalLongitude,
        location_source: input.metadataCorrections.locationSource,
        gps_accuracy: input.metadataCorrections.gpsAccuracy,
      };
    }
    if (input.correctionReason !== undefined) {
      payload.correction_reason = input.correctionReason.trim() || null;
    }

    const response = await this.client.patch(
      `/api/v1/reports/${encodeURIComponent(reportId)}/review`,
      payload,
    );

    return mapReportDetail(reviewResponseSchema.parse(response.data).data);
  }

  async linkDuplicate(
    reportId: string,
    input: DuplicateLinkInput,
  ): Promise<DiseaseReport> {
    const response = await this.client.post(
      `/api/v1/reports/${encodeURIComponent(reportId)}/duplicate-link`,
      {
        canonical_report_uuid: input.canonicalReportUuid,
        reason: input.reason?.trim() || undefined,
      },
    );

    return mapReportDetail(reviewResponseSchema.parse(response.data).data);
  }
}
