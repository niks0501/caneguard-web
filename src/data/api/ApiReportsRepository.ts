import type { AxiosInstance } from "axios";
import { z } from "zod";
import { ApiError } from "../../api/ApiError";
import { axiosClient } from "../../api/axiosClient";
import type { ReportsRepository } from "../contracts/ReportsRepository";
import type { MonthlyReportSummary } from "../../domain/dashboard.types";
import type { UpdateAffectedFieldsInput, UpdateAffectedFieldsResult } from "../../domain/fieldSurvey.types";
import type {
  Advisory,
  DiseaseReport,
  PaginatedReports,
  PossibleRecentMatches,
  ReportFilters,
} from "../../domain/report.types";
import type {
  DuplicateLinkInput,
  DuplicateUnlinkInput,
  ReportReviewInput,
  HandoffNoteInput,
} from "../../domain/review.types";
import { mapPossibleRecentMatches } from "./mappers/duplicate.mapper";
import {
  mapPaginationMeta,
  mapReportDetail,
  mapReportListItem,
} from "./mappers/report.mapper";
import { mapMonthlyReportSummary } from "./mappers/reporting.mapper";
import {
  advisoriesResponseSchema,
  possibleRecentMatchesResponseSchema,
  reportDetailResponseSchema,
  reportListResponseSchema,
  reviewResponseSchema,
  updateAffectedFieldsResponseSchema,
} from "./schemas/report.schema";
import { monthlyReportSummaryResponseSchema } from "./schemas/reporting.schema";

const sortValues = {
  newest: "-submitted_at",
  oldest: "submitted_at",
  due_soonest: "due_soonest",
} as const;

const openCaseResponseSchema = z.object({
  data: z.object({
    uuid: z.string(),
    first_reviewed_at: z.iso.datetime({ offset: true }).nullable(),
  }),
});

function toQueryParams(
  filters: ReportFilters = {},
  includePagination = true,
) {
  return {
    page: includePagination ? filters.page : undefined,
    per_page: includePagination ? filters.perPage : undefined,
    queue: filters.queue,
    search: filters.search?.trim() || undefined,
    workflow_status:
      filters.workflowStatus && filters.workflowStatus !== "all"
        ? filters.workflowStatus
        : undefined,
    reviewer: filters.reviewer?.trim() || undefined,
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
    location:
      filters.location && filters.location !== "all"
        ? filters.location
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

  async getMonthlySummary(month?: string): Promise<MonthlyReportSummary> {
    const response = await this.client.get("/api/v1/reports/summary", {
      params: month ? { month } : undefined,
    });
    return mapMonthlyReportSummary(
      monthlyReportSummaryResponseSchema.parse(response.data),
    );
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

  async openCase(reportId: string): Promise<{ firstReviewedAt: string | null }> {
    const response = await this.client.post(
      `/api/v1/reports/${encodeURIComponent(reportId)}/open`,
    );
    const parsed = openCaseResponseSchema.parse(response.data);

    return { firstReviewedAt: parsed.data.first_reviewed_at };
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

  async recordHandoffNote(reportId: string, input: HandoffNoteInput): Promise<DiseaseReport> {
    const response = await this.client.post(`/api/v1/reports/${encodeURIComponent(reportId)}/handoff-notes`, {
      destination: input.destination.trim(),
      reference: input.reference?.trim() || null,
      sent_date: input.sentDate,
      note: input.note?.trim() || null,
      advice_received_note: input.adviceReceivedNote?.trim() || null,
      expected_version: input.expectedVersion,
    });
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
        expected_version: input.expectedVersion,
      },
    );

    return mapReportDetail(reviewResponseSchema.parse(response.data).data);
  }

  async updateAffectedFields(
    reportId: string,
    input: UpdateAffectedFieldsInput,
  ): Promise<UpdateAffectedFieldsResult> {
    const response = await this.client.put(
      `/api/v1/reports/${encodeURIComponent(reportId)}/affected-fields`,
      {
        expected_version: input.expectedVersion,
        affected_fields: input.affectedFields.map((field) => ({
          field_survey_id: field.fieldSurveyId,
          loss_rate_percent: field.lossRatePercent,
        })),
      },
    );
    const data = updateAffectedFieldsResponseSchema.parse(response.data).data;

    return {
      affectedFields: data.affected_fields.map((field) => ({
        fieldSurveyId: field.field_survey_id,
        geometry: field.geometry,
        capturedAt: field.captured_at,
        areaSqm: field.area_sqm,
        areaSource: field.area_source,
        inspector: field.inspector,
        lossRatePercent: field.loss_rate_percent,
      })),
      version: data.version,
      updatedAt: data.updated_at,
    };
  }

  async unlinkDuplicate(
    reportId: string,
    input: DuplicateUnlinkInput,
  ): Promise<DiseaseReport> {
    const response = await this.client.delete(
      `/api/v1/reports/${encodeURIComponent(reportId)}/duplicate-link`,
      {
        data: {
          reason: input.reason?.trim() || undefined,
          expected_version: input.expectedVersion,
        },
      },
    );

    return mapReportDetail(reviewResponseSchema.parse(response.data).data);
  }
}
