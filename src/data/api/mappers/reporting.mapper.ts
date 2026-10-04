import type {
  MonthlyReportSummary,
} from "../../../domain/dashboard.types";
import type {
  MonthlyReportSummaryResponseDto,
} from "../schemas/reporting.schema";

export function mapMonthlyReportSummary(
  dto: MonthlyReportSummaryResponseDto,
): MonthlyReportSummary {
  return {
    month: dto.data.month,
    period: dto.data.period,
    reportedCases: dto.data.reported_cases ?? 0,
  };
}
