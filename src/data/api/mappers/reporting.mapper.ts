import type {
  ExpertVerificationSummary,
  MonthlyReportSummary,
} from "../../../domain/dashboard.types";
import type {
  ExpertVerificationDto,
  MonthlyReportSummaryResponseDto,
} from "../schemas/reporting.schema";

export function mapExpertVerification(
  dto: ExpertVerificationDto,
): ExpertVerificationSummary {
  return {
    consultVolume: {
      total: dto.consult_volume.total,
      consultedCases: dto.consult_volume.consulted_cases,
      pending: dto.consult_volume.pending,
      inProgress: dto.consult_volume.in_progress,
      completed: dto.consult_volume.completed,
      cancelled: dto.consult_volume.cancelled,
    },
    expertAgreement: {
      count: dto.expert_agreement.count,
      denominator: dto.expert_agreement.denominator,
      rate: dto.expert_agreement.rate,
      percentage: dto.expert_agreement.percentage,
    },
    unableToClassifyRate: {
      count: dto.unable_to_classify_rate.count,
      denominator: dto.unable_to_classify_rate.denominator,
      rate: dto.unable_to_classify_rate.rate,
      percentage: dto.unable_to_classify_rate.percentage,
    },
    symptomVerificationDisagreement: {
      count: dto.symptom_verification_disagreement.count,
      denominator: dto.symptom_verification_disagreement.denominator,
      rate: dto.symptom_verification_disagreement.rate,
      percentage: dto.symptom_verification_disagreement.percentage,
    },
    advisoryCoverage: dto.advisory_coverage
      ? {
          consultCases: dto.advisory_coverage.consult_cases,
          casesWithAdvisory: dto.advisory_coverage.cases_with_advisory,
          coverageRate: dto.advisory_coverage.coverage_rate,
          deliveredCases: dto.advisory_coverage.delivered_cases,
          acknowledgedCases: dto.advisory_coverage.acknowledged_cases,
        }
      : undefined,
    timeToFinding: dto.time_to_finding
      ? {
          source: dto.time_to_finding.source,
          findings: dto.time_to_finding.findings,
          averageHours: dto.time_to_finding.average_hours,
          medianHours: dto.time_to_finding.median_hours,
          minHours: dto.time_to_finding.min_hours,
          maxHours: dto.time_to_finding.max_hours,
        }
      : undefined,
  };
}

export function mapMonthlyReportSummary(
  dto: MonthlyReportSummaryResponseDto,
): MonthlyReportSummary {
  return {
    month: dto.data.month,
    period: dto.data.period,
    reportedCases: dto.data.reported_cases ?? 0,
    expertVerification: dto.data.expert_verification
      ? mapExpertVerification(dto.data.expert_verification)
      : undefined,
  };
}
