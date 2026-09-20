import type { AxiosInstance } from "axios";
import { ApiError } from "../../api/ApiError";
import { axiosClient } from "../../api/axiosClient";
import type { ReportsRepository } from "../contracts/ReportsRepository";
import type {
  Advisory,
  DiseaseReport,
  PaginatedReports,
  PossibleRecentMatches,
  ReportFilters,
} from "../../domain/report.types";
import type {
  DuplicateLinkInput,
  ExpertReferralResponseInput,
  ReportReferralInput,
  ReportReviewInput,
} from "../../domain/review.types";
import { mapPossibleRecentMatches } from "./mappers/duplicate.mapper";
import {
  mapPaginationMeta,
  mapReportDetail,
  mapReportListItem,
} from "./mappers/report.mapper";
import {
  advisoriesResponseSchema,
  possibleRecentMatchesResponseSchema,
  reportDetailResponseSchema,
  reportListResponseSchema,
  reviewResponseSchema,
} from "./schemas/report.schema";

const sortValues = {
  newest: "-submitted_at",
  oldest: "submitted_at",
  due_soonest: "due_soonest",
} as const;

function toQueryParams(
  filters: ReportFilters = {},
  includePagination = true,
) {
  return {
    page: includePagination ? filters.page : undefined,
    per_page: includePagination ? filters.perPage : undefined,
    queue: filters.queue,
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
    case_state:
      filters.caseState && filters.caseState !== "all"
        ? filters.caseState
        : undefined,
    verification_outcome:
      filters.verificationOutcome && filters.verificationOutcome !== "all"
        ? filters.verificationOutcome
        : undefined,
    field_validation_state:
      filters.fieldValidationState && filters.fieldValidationState !== "all"
        ? filters.fieldValidationState
        : undefined,
    authority_classified_condition:
      filters.staffClassifiedCondition &&
      filters.staffClassifiedCondition !== "all"
        ? filters.staffClassifiedCondition
        : undefined,
    concern:
      filters.reportedConcern && filters.reportedConcern !== "all"
        ? filters.reportedConcern
        : undefined,
    follow_up_outcome:
      filters.followUpOutcome && filters.followUpOutcome !== "all"
        ? filters.followUpOutcome
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

  async listAdvisories(): Promise<Advisory[]> {
    const response = await this.client.get('/api/v1/advisories');
    return advisoriesResponseSchema.parse(response.data).data.map((advisory) => ({
      uuid: advisory.uuid,
      code: advisory.code,
      title: advisory.title,
      content: advisory.content,
      status: advisory.status,
      validationProvenance: advisory.validation_provenance,
      validatedAt: advisory.validated_at,
    }));
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

  async listExpertQueue(filters?: ReportFilters): Promise<PaginatedReports> {
    const response = await this.client.get("/api/v1/reports/expert-queue", {
      params: toQueryParams(filters),
    });
    const dto = reportListResponseSchema.parse(response.data);

    return {
      reports: dto.data.map(mapReportListItem),
      meta: mapPaginationMeta(dto.meta),
    };
  }

  async exportReports(filters?: ReportFilters): Promise<Blob> {
    const response = await this.client.get<ArrayBuffer>("/api/v1/reports/export", {
      params: toQueryParams(filters, false),
      responseType: "arraybuffer",
    });

    const contentType = response.headers["content-type"];
    return new Blob([response.data], {
      type: typeof contentType === "string"
        ? contentType
        : "text/csv;charset=utf-8",
    });
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
    if (input.advisoryUuid !== undefined) {
      payload.advisory_uuid = input.advisoryUuid;
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

  async recordReferral(
    reportId: string,
    input: ReportReferralInput,
  ): Promise<DiseaseReport> {
    const payload: Record<string, unknown> = {
      destination: input.destination.trim(),
      reference: input.reference.trim(),
      referral_date: input.referralDate,
      note: input.note?.trim() || null,
      expected_version: input.expectedVersion,
    };

    if (input.dueDate !== undefined) {
      payload.due_date = input.dueDate || null;
    }
    if (input.expertUuid !== undefined) {
      payload.expert_uuid = input.expertUuid;
    }
    if (input.expertName !== undefined) {
      payload.expert_name = input.expertName?.trim() || null;
    }
    if (input.expertContact !== undefined) {
      payload.expert_contact = input.expertContact?.trim() || null;
    }
    if (input.authorityClassifiedCondition !== undefined) {
      payload.authority_classified_condition = input.authorityClassifiedCondition;
    }
    if (input.verificationOutcome !== undefined) {
      payload.verification_outcome = input.verificationOutcome;
    }
    if (input.officeNotes !== undefined) {
      payload.office_notes = input.officeNotes?.trim() || null;
    }

    const response = await this.client.post(
      `/api/v1/reports/${encodeURIComponent(reportId)}/referral`,
      payload,
    );

    return mapReportDetail(reviewResponseSchema.parse(response.data).data);
  }

  async recordExpertReferralResponse(
    reportId: string,
    input: ExpertReferralResponseInput,
  ): Promise<DiseaseReport> {
    const payload: Record<string, unknown> = {
      response_date: input.responseDate,
      response_note: input.responseNote?.trim() || null,
      response_finding: input.responseFinding?.trim() || null,
      expected_version: input.expectedVersion,
    };

    if (input.findingRecommendation !== undefined) {
      payload.finding_recommendation = input.findingRecommendation?.trim() || null;
    }
    if (input.findingSource !== undefined) {
      payload.finding_source = input.findingSource;
    }
    if (input.authorityClassifiedCondition !== undefined) {
      payload.authority_classified_condition = input.authorityClassifiedCondition;
    }
    if (input.verificationOutcome !== undefined) {
      payload.verification_outcome = input.verificationOutcome;
    }

    const response = await this.client.post(
      `/api/v1/reports/${encodeURIComponent(reportId)}/referral/response`,
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
