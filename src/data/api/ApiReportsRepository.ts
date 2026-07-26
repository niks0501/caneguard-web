import type { AxiosInstance } from "axios";
import { ApiError } from "../../api/ApiError";
import { axiosClient } from "../../api/axiosClient";
import type { ReportsRepository } from "../contracts/ReportsRepository";
import type {
  DiseaseReport,
  PaginatedReports,
  ReportFilters,
} from "../../domain/report.types";
import type { ReportReviewInput } from "../../domain/review.types";
import {
  mapPaginationMeta,
  mapReportDetail,
  mapReportListItem,
} from "./mappers/report.mapper";
import {
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

  async updateReview(
    reportId: string,
    input: ReportReviewInput,
  ): Promise<DiseaseReport> {
    const response = await this.client.patch(
      `/api/v1/reports/${encodeURIComponent(reportId)}/review`,
      {
        status: input.status,
        notes: input.notes.trim() || null,
      },
    );

    return mapReportDetail(reviewResponseSchema.parse(response.data).data);
  }
}
